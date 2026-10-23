/* ===========================================================================
   像素小屋 · 和服务器说话
   表（SQL 见交付时单独给的那几段）：
   - pal_settings  每人一行，自己能改：上班地点、墙纸、作息、三个互动按钮
   - pal_state     每人一行，客户端只能读：心情、钱包、礼物（只由下面这些服务端函数改，谁也不能直接改对方的小人）
   - pal_log       小人日记：谁对谁的小人做了什么（只由服务端函数和触发器写）
   - pal_notes     悄悄话正文：只有收件人和寄件人读得到
   这个文件只管读写，不碰界面。读写函数不抛错，返回 { error: '给人看的一句话' | null }。
   =========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizeSettings, normalizeState } from './art'

const mapError = (e) => {
  const m = e?.message || ''
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /could not find the table|does not exist/i.test(m)) {
    return '服务端还没有像素小屋的表，先把像素小屋的 SQL 跑一下'
  }
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '服务端没找到像素小屋的函数，先把像素小屋的 SQL 跑一下（第二轮那段也要跑）'
  if (e?.code === '42501' || /row-level security|permission denied/i.test(m)) return '没有权限，检查一下像素小屋表的行级权限（RLS）策略'
  if (e?.code === '23514' || /check constraint/i.test(m)) return '有一项超出范围了，检查一下时间和按钮文字'
  if (m.includes('not enough coins')) return '钱包不够啦'
  if (m.includes('already has')) return 'TA 已经有这个礼物了'
  if (m.includes('empty note')) return '先写点什么吧'
  if (m.includes('note too long')) return '纸条太长了，40 个字以内'
  if (m.includes('bad food') || m.includes('bad gift')) return '这个东西服务端不认识'
  if (m.includes('self interaction')) return '只能对 TA 的小人做这个'
  if (m.includes('not logged in')) return '登录状态过期了，刷新一下再试'
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

/** 保存自己的安排（整行 upsert）。draft 是 normalizeSettings 整理过的那种对象 */
export async function saveSettings(userId, draft) {
  if (!supabase) return { error: '还没有连上服务器' }
  const { data, error } = await supabase
    .from('pal_settings')
    .upsert({
      user_id: userId,
      work_scene: draft.work_scene,
      home_theme: draft.home_theme,
      wake_h: draft.wake_h,
      work_h: draft.work_h,
      off_h: draft.off_h,
      sleep_h: draft.sleep_h,
      buttons: draft.buttons,
      updated_at: new Date().toISOString(),
    })
    .select('user_id')
    .single()
  if (error) return { error: mapError(error) }
  if (!data) return { error: '没存上，刷新一下再试' }
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
export const palPoke = (owner) => rpc('pal_poke', { p_owner: owner })
export const palChat = (owner, q, a) => rpc('pal_chat', { p_owner: owner, p_q: q, p_a: a })

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