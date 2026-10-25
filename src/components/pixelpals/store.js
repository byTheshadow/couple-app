/* ===========================================================================
   像素小屋 · 和服务器说话
   表（SQL 见交付时单独给的那几段）：
   - pal_settings  每人一行，自己能改：上班地点、放空去哪、墙纸、作息、三个互动按钮
   - pal_state     每人一行，客户端只能读：心情、钱包、礼物（只由下面这些服务端函数改，谁也不能直接改对方的小人）
   - pal_log       小人日记：谁对谁的小人做了什么（只由服务端函数和触发器写）
   - pal_notes     悄悄话正文：只有收件人和寄件人读得到
   这个文件只管读写，不碰界面。读写函数不抛错，返回 { error: '给人看的一句话' | null }。
   =========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizeSettings, normalizeState, btnLinesToRow } from './art'
import { registerUserScene, unregisterUserScene } from './scenes'
import { registerOutfit, unregisterOutfit, validateOutfit, outfitRow } from './outfits'
import { presetFromRow, presetToRow } from './presets'

const mapError = (e) => {
  const m = e?.message || ''
  // 新字段还没加（第四、五轮 SQL 没跑）：要放在「没有表」那条前面，因为报错里也带 does not exist
  if (e?.code === 'PGRST204' || e?.code === '42703' || /could not find the '.*' column|column .* does not exist/i.test(m)) {
    return '服务端还缺新字段，把最新的 SQL（第四轮 pixelpals-round4.sql、第五轮 pixelpals-round5.sql）按顺序跑一下'
  }
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /could not find the table|does not exist/i.test(m)) {
    return '服务端还没有像素小屋的表，先把像素小屋的 SQL 跑一下'
  }
  if (/pal_scene_(save|delete|copy)/.test(m) && (e?.code === 'PGRST202' || /could not find the function/i.test(m))) return '服务端还没有画室的函数，先把第七轮 B 的 SQL（pixelpals-round7b.sql）跑一下'
  if (m.includes('bad scene name')) return '场景的名字要 1~8 个字'
  if (m.includes('bad scene data')) return '这幅画没通过服务端的检查（颜色数量、大小或格式不对），先把第七轮 B 的 SQL（pixelpals-round7b.sql）跑一下，还不行就告诉我'
  if (m.includes('too many scenes')) return '最多存 6 个场景，先删掉一个'
  if (m.includes('scene not found')) return '找不到这个场景（可能已经被删了），刷新一下再试'
  if (m.includes('copy own scene')) return '这是你自己的场景，不用复制'
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '服务端没找到像素小屋的函数，先把像素小屋的 SQL 跑一下（第二轮、第四轮那段也要跑）'
  if (e?.code === '42501' || /row-level security|permission denied/i.test(m)) return '没有权限，检查一下像素小屋表的行级权限（RLS）策略'
  if (/pal_settings_work_scene_check|pal_settings_idle_scene_check/.test(m)) return '服务端还不认识这个场景，先把第五轮的 SQL（pixelpals-round5.sql）跑一下'
  if (/pal_settings_(work|off|sleep)_h_check|pal_settings_check/.test(m)) return '服务端还不认识「次日」的时间，先把第五轮半的 SQL（pixelpals-round5b.sql）跑一下；或者检查一下：起床 ≤ 上班 < 下班 ≤ 睡觉'
  if (/pal_settings_play_idle_check/.test(m)) return '玩耍/放空要完整落在在家的时间里，而且两段不能重叠'
  if (/button_lines/.test(m) && /column|schema cache/i.test(m)) return '服务端还没有「按钮回应」这一列，先把第七轮的 SQL（pixelpals-round7a.sql）跑一下'
  if (/pal_settings_button_lines_check/.test(m)) return '按钮回应有一句不合规矩：每句 1~20 个字'
  if (/pal_settings_poke_lines_check/.test(m)) return '被戳反应有一句不合规矩：每句 1~20 个字，每套最多 4 句'
  if (e?.code === '23514' || /check constraint/i.test(m)) return '有一项超出范围了，检查一下时间和按钮文字'
  if (m.includes('not enough coins')) return '钱包不够啦'
  if (m.includes('already has')) return 'TA 已经有这个礼物了'
  if (m.includes('empty note')) return '先写点什么吧'
  if (m.includes('note too long')) return '纸条太长了，40 个字以内'
  if (m.includes('bad gift')) return '这个礼物服务端还没上架，先把第五轮的 SQL（pixelpals-round5.sql）跑一下'
  if (m.includes('bad food')) return '这个东西服务端不认识'
  if (m.includes('self interaction')) return '只能对 TA 的小人做这个'
  if (m.includes('not logged in') || m.includes('not signed in')) return '登录状态过期了，刷新一下再试'
  if (m.includes('too many outfits')) return '这个部位最多 12 件，先删掉一件'
  if (m.includes('这套衣服已经不在了') || m.includes('挑的衣服已经不在了')) return '这件衣服已经被删掉了，重新挑一件'
  if (m.includes('至少要挑一个部位')) return '先挑一个部位'
  if (m.includes('名字不能是空的')) return '给衣服起个名字（8 个字以内）'
  if (/只能画在|每行要正好|颜色要|行数要|超出小人高度|衣服太大|slot 只能是|只能用/.test(m)) return m
  if (m.includes('too many presets')) return '预设最多存 8 套，先删掉一个'
  if (m.includes('presets too long')) return '预设内容太多了，先删掉一两套再存'
  if (m.includes('bad preset scene')) return '这套预设里的场景服务端还不认识，先把第五轮的 SQL（pixelpals-round5.sql）跑一下'
  if (m.includes('bad preset pokes')) return '这套预设里的被戳反应有一句不合规矩（每句 1~20 个字，每套最多 4 句）'
  if (m.includes('bad preset hour')) return '这套预设里的时间不合规矩（起床 ≤ 上班 < 下班 ≤ 睡觉）；如果用了「次日」，先把第五轮半的 SQL（pixelpals-round5b.sql）跑一下'
  if (m.includes('bad preset windows')) return '这套预设里玩耍/放空的时间要完整落在在家的时间里，两段也不能重叠'
  if (m.includes('bad preset')) return '这套预设里有一项不合规矩（名字 8 个字以内、时间要按顺序），改一下再存'
  return `像素小屋出错：${m || '未知原因'}`
}

/**
 * 某个人的小屋：{ settings, state, loading, error, reload }
 * 没有这一行（对方还没打开过）就用默认值；自己的那行会自动补上。实时更新。
 */
export function usePal(userId, slot, isMine) {
  const [settingsRow, setSettingsRow] = useState(null)
  const [stateRow, setStateRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!supabase || !userId) { setLoading(false); return }
    const [a, b] = await Promise.all([
      supabase.from('pal_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('pal_state').select('*').eq('user_id', userId).maybeSingle(),
    ])
    const err = a.error || b.error
    setError(err ? mapError(err) : '')
    setSettingsRow(a.data || null)
    setStateRow(b.data || null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return }
    let alive = true
    setLoading(true)
    ;(async () => {
      // 自己的两行不存在就补上（函数是幂等的，已经有就什么都不做）
      if (isMine) {
        const { error: e } = await supabase.rpc('pal_ensure')
        if (e && alive) setError(mapError(e))
      }
      if (alive) await reload()
    })()
    const ch = supabase
      .channel(`pal-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pal_settings', filter: `user_id=eq.${userId}` },
        (p) => { if (p.new && Object.keys(p.new).length) setSettingsRow(p.new) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pal_state', filter: `user_id=eq.${userId}` },
        (p) => { if (p.new && Object.keys(p.new).length) setStateRow(p.new) })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [userId, isMine, reload])

  // 用 useMemo 固定住，免得每次渲染都生成新对象，把依赖它的 effect 反复触发
  const settings = useMemo(() => normalizeSettings(settingsRow, slot), [settingsRow, slot])
  const state = useMemo(() => normalizeState(stateRow), [stateRow])

  // raw 是服务器返回的原样那一行（里面有 settled_day 之类 art.js 不整理的字段）
  return { settings, state, raw: stateRow, loading, error, reload }
}

/**
 * 保存自己的安排。自己的那一行在打开小屋时已经由 pal_ensure 补好了，所以这里用「更新」而不是「插入或更新」：
 * 后者除了更新权限，还要求有「插入」权限，缺一个就会整个存不上。
 * draft 是 normalizeSettings 整理过的那种对象
 */
export async function saveSettings(userId, draft) {
  if (!supabase) return { error: '还没有连上服务器' }
  const { data, error } = await supabase
    .from('pal_settings')
    .update({
      work_scene: draft.work_scene,
      idle_scene: draft.idle_scene || null, // 第五轮新增：放空时去哪（null = 在家窗前）
      home_theme: draft.home_theme,
      wake_h: draft.wake_h,
      work_h: draft.work_h,
      off_h: draft.off_h,
      sleep_h: draft.sleep_h,
      buttons: draft.buttons,
      // 第七轮新增：每个按钮「点了以后说什么」，按「图标|文字」存
      button_lines: btnLinesToRow(draft.buttons, draft.btn_lines),
      // 第四轮新增：玩耍/放空时段（null = 不设）、被戳反应（已整理成每套最多 4 句）
      play_from: draft.play_from == null ? null : draft.play_from,
      play_to: draft.play_to == null ? null : draft.play_to,
      idle_from: draft.idle_from == null ? null : draft.idle_from,
      idle_to: draft.idle_to == null ? null : draft.idle_to,
      poke_lines: draft.poke_lines || {},
      // 换装：只存四个部位的 id（空的丢掉）
      outfit: outfitRow(draft.outfit),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle()
  if (error) return { error: mapError(error) }
  if (!data) return { error: '没存上：服务端没有改你这一行的权限（或这一行不存在），先把第三轮 SQL 再跑一遍' }
  return { error: null }
}

/* ---------- 去 TA 的小屋做的事：都走服务端函数，钱和心情由服务端算 ---------- */

async function rpc(name, args) {
  if (!supabase) return { error: '还没有连上服务器' }
  const { error } = await supabase.rpc(name, args)
  return { error: error ? mapError(error) : null }
}

export const palButton = (owner, e, t) => rpc('pal_button', { p_owner: owner, p_e: e, p_t: t })
export const palFeed = (owner, food) => rpc('pal_feed', { p_owner: owner, p_food: food })
export const palGift = (owner, gift) => rpc('pal_gift', { p_owner: owner, p_gift: gift })
export const palNote = (owner, body) => rpc('pal_note', { p_owner: owner, p_body: body })
// line = 被戳的小人说的那句话（客户端按 TA 自己写的被戳反应挑好，服务端存进日记）；annoyed = 是不是被连戳烦了
export const palPoke = (owner, line, annoyed) => rpc('pal_poke', { p_owner: owner, p_line: line || null, p_annoyed: !!annoyed })
export const palChat = (owner, q, a) => rpc('pal_chat', { p_owner: owner, p_q: q, p_a: a })
// 清空日记（第六轮 SQL：pixelpals-round6.sql）：删掉和我有关的所有记录
export const palLogClear = () => rpc('pal_log_clear', {})

/**
 * 我的预设：{ items, loading, missing, save }
 * - items: 界面用的预设（见 presets.js），只有自己看得到
 * - missing: 服务端还没有 pal_presets 表（第三轮 SQL 没跑），界面上提示一句，其他功能不受影响
 * - save(nextItems): 整个数组一起存（服务端检查合不合规矩），成功后才更新 items；返回 { error }
 */
export function usePresets(userId, slot) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return undefined }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('pal_presets').select('items').eq('user_id', userId).maybeSingle()
      if (!alive) return
      if (error) {
        setMissing(error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|does not exist/i.test(error.message || ''))
      } else {
        const rows = data && Array.isArray(data.items) ? data.items : []
        setItems(rows.map((r) => presetFromRow(r, slot)).filter(Boolean))
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [userId, slot])

  const save = useCallback(async (next) => {
    if (!supabase) return { error: '还没有连上服务器' }
    const { error } = await supabase.rpc('pal_presets_save', { p_items: next.map(presetToRow) })
    if (error) return { error: mapError(error) }
    setItems(next)
    return { error: null }
  }, [])

  return { items, loading, missing, save }
}

/**
 * 下班结算：问服务端「我今天的班结算过了吗」。每天只会发一次钱，由服务端判断，重复问也没事。
 * 返回 { error, res }；res = { settled, coins, hours, base, bonus, late, day, reason }
 * 服务端还没跑第三轮 SQL 的话，静悄悄跳过（不弹错误），等 SQL 跑了就自动生效。
 */
export async function palSettle() {
  if (!supabase) return { error: null, res: null }
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* 取不到时区就让服务端用默认的 */ }
  const { data, error } = await supabase.rpc('pal_settle', { p_tz: tz })
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')) return { error: null, res: null }
    return { error: mapError(error), res: null }
  }
  return { error: null, res: data || null }
}

/* ---------- 小人日记 ---------- */

const LOG_LIMIT = 50

/**
 * 两个小人的日记（新的在前），实时更新：{ items, notes, loading, reload }
 * - items: 每条 { id, owner_id, actor_id, kind, data, created_at }；owner = 这是谁的小人的日记，actor = 谁做的
 * - notes: { [悄悄话 id]: 正文 }，只有收件人和寄件人读得到，别人那里是空的
 * onInsert(row) 在有新记录实时到达时调用（用来让小人当场做出反应）
 */
export function usePalLog(myId, taId, onInsert) {
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const cb = useRef(onInsert)
  cb.current = onInsert

  const loadNotes = useCallback(async (rows) => {
    const ids = [...new Set(rows.filter((r) => r.kind === 'note' && r.data && r.data.note_id != null).map((r) => r.data.note_id))]
    if (!ids.length) return
    const { data } = await supabase.from('pal_notes').select('id, body').in('id', ids)
    if (data && data.length) {
      setNotes((n) => {
        const next = { ...n }
        data.forEach((x) => { next[x.id] = x.body })
        return next
      })
    }
  }, [])

  const reload = useCallback(async () => {
    if (!supabase || !myId) { setLoading(false); return }
    const owners = [myId, taId].filter(Boolean)
    const { data } = await supabase
      .from('pal_log').select('*')
      .in('owner_id', owners)
      .order('created_at', { ascending: false })
      .limit(LOG_LIMIT)
    const rows = data || []
    setItems(rows)
    setLoading(false)
    loadNotes(rows)
  }, [myId, taId, loadNotes])

  useEffect(() => {
    if (!supabase || !myId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel(`pal-log-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pal_log' }, (p) => {
        const row = p.new
        if (!row || (row.owner_id !== myId && row.owner_id !== taId)) return
        setItems((list) => (list.some((x) => x.id === row.id) ? list : [row, ...list].slice(0, LOG_LIMIT)))
        loadNotes([row])
        if (cb.current) cb.current(row)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, taId, reload, loadNotes])

  return { items, notes, loading, reload }
}

/* ---------- 自己画的场景（像素画室） ---------- */

/**
 * 某个人画的场景（最多 6 个）：{ items, loading, missing, reload }
 * items 每项 { id: 'u:uuid'（写进设置里的名字）, uuid, name, data }；读到就登记进场景表，两边的小屋都能画出来。
 * watch：随便一个会变的值（比如 TA 设置里选的场景），变了就重新读一遍，TA 换了新场景我这边才画得出来
 */
export function usePalScenes(userId, watch) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const reg = useRef([]) // 这个人已经登记过的场景名

  const reload = useCallback(async () => {
    if (!supabase || !userId) { setLoading(false); return }
    const { data, error } = await supabase
      .from('pal_scenes').select('id, name, data, updated_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
    if (error) {
      setMissing(error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|does not exist/i.test(error.message || ''))
      setLoading(false)
      return
    }
    const list = []
    for (const r of data || []) {
      const id = `u:${r.id}`
      const d = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? { ...r.data, name: r.name } : null
      if (d && registerUserScene(id, d)) list.push({ id, uuid: r.id, name: r.name, data: d })
    }
    // 以前登记过、这次没有了（被删了）的，从场景表里拿掉
    const keep = new Set(list.map((x) => x.id))
    reg.current.forEach((id) => { if (!keep.has(id)) unregisterUserScene(id) })
    reg.current = list.map((x) => x.id)
    setItems(list)
    setMissing(false)
    setLoading(false)
  }, [userId])

  useEffect(() => { reload() }, [reload, watch])
  useEffect(() => () => { reg.current.forEach(unregisterUserScene); reg.current = [] }, [])

  return { items, loading, missing, reload }
}

/** 保存一幅画：uuid 为空 = 新建，有 = 覆盖自己的那个。返回 { error, uuid } */
export async function sceneSave(uuid, name, data) {
  if (!supabase) return { error: '还没有连上服务器', uuid: null }
  const { data: id, error } = await supabase.rpc('pal_scene_save', { p_id: uuid || null, p_name: name, p_data: data })
  return { error: error ? mapError(error) : null, uuid: id || null }
}
export const sceneDelete = (uuid) => rpc('pal_scene_delete', { p_id: uuid })
/** 把 TA 的一个场景复制一份到自己的画室 */
export async function sceneCopy(uuid) {
  if (!supabase) return { error: '还没有连上服务器', uuid: null }
  const { data: id, error } = await supabase.rpc('pal_scene_copy', { p_id: uuid })
  return { error: error ? mapError(error) : null, uuid: id || null }
}

/* ---------- 换装：自己/TA 的衣服，以及「让 TA 穿这个」的请求 ---------- */

/**
 * 某个人的衣服（最多每部位 12 件）：{ items, loading, missing, reload }
 * 每项 { id, name, slot, data, ownerId }；读到就登记进 outfits.js 的注册表，两边的小屋都画得出来
 */
export function usePalOutfits(userId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const reg = useRef([])

  const reload = useCallback(async () => {
    if (!supabase || !userId) { setLoading(false); return }
    const { data, error } = await supabase
      .from('pal_outfits')
      .select('id, name, slot, data, owner_id, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
    if (error) {
      setMissing(error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|does not exist/i.test(error.message || ''))
      setLoading(false)
      return
    }
    const list = []
    for (const r of data || []) {
      const d = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : null
      if (!d) continue
      const data2 = { slot: r.slot, y0: d.y0, pal: d.pal, rows: d.rows }
      if (validateOutfit(data2)) continue // 存坏的（比如服务端放行了旧格式）就当没有，不画
      registerOutfit(r.id, { name: r.name, slot: r.slot, data: data2 })
      list.push({ id: r.id, name: r.name, slot: r.slot, data: data2, ownerId: r.owner_id })
    }
    const keep = new Set(list.map((x) => x.id))
    reg.current.forEach((id) => { if (!keep.has(id)) unregisterOutfit(id) })
    reg.current = list.map((x) => x.id)
    setItems(list)
    setMissing(false)
    setLoading(false)
  }, [userId])

  useEffect(() => { reload() }, [reload])
  useEffect(() => () => { reg.current.forEach(unregisterOutfit); reg.current = [] }, [])

  return { items, loading, missing, reload }
}

/** 保存一件衣服：uuid 为空 = 新建。返回 { error, uuid } */
export async function outfitSave(uuid, name, slot, data) {
  if (!supabase) return { error: '还没有连上服务器', uuid: null }
  const { data: id, error } = await supabase.rpc('pal_outfit_save', { p_id: uuid || null, p_name: name, p_slot: slot, p_data: data })
  return { error: error ? mapError(error) : null, uuid: id || null }
}
export const outfitDelete = (uuid) => rpc('pal_outfit_delete', { p_id: uuid })

/** 发一条「让 TA 穿这个」：parts 只放挑了的那几个部位。返回 { error, id } */
export async function outfitSend(to, parts, note) {
  if (!supabase) return { error: '还没有连上服务器', id: null }
  const { data, error } = await supabase.rpc('pal_outfit_send', { p_to: to, p_parts: parts, p_note: note || null })
  return { error: error ? mapError(error) : null, id: data || null }
}

/** 接受 / 拒绝一条请求：返回 { error, status }（status 是服务端给的结果：accepted / declined / expired / 已处理过的状态） */
export async function outfitRespond(id, accept) {
  if (!supabase) return { error: '还没有连上服务器', status: null }
  const { data, error } = await supabase.rpc('pal_outfit_respond', { p_id: id, p_accept: !!accept })
  return { error: error ? mapError(error) : null, status: data || null }
}
export const outfitCancel = (id) => rpc('pal_outfit_cancel', { p_id: id })

/**
 * 和我有关的换装请求（我收到的 + 我发出的，最近 20 条）：{ items, reload }
 * items 每项是 pal_outfit_req 的一行；有没有过期由界面按 created_at 算（24 小时）
 */
export function useOutfitReqs(myId, taId) {
  const [items, setItems] = useState([])

  const reload = useCallback(async () => {
    if (!supabase || !myId) return
    const { data, error } = await supabase
      .from('pal_outfit_req')
      .select('*')
      .or(`from_id.eq.${myId},to_id.eq.${myId}`)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!error) setItems(data || [])
  }, [myId])

  useEffect(() => { reload() }, [reload, taId])
  useEffect(() => {
    if (!supabase || !myId) return
    const ch = supabase
      .channel('pal-outfit-req')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pal_outfit_req' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, reload])

  return { items, reload }
}
