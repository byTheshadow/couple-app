import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { UNLOCK_METHODS, canSetCover, todayKey, unlockMapFromRows, unlockRowsFromLocal } from './calendar'
import { countPendingVerdicts } from './badgeCount'

/** 某个人的状态（明面 + 暗面），实时更新 */
export function useStatus(userId) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let alive = true
    setLoading(true)
    supabase.from('status').select('*').eq('user_id', userId).maybeSingle().then(({ data }) => {
      if (alive) { setRow(data); setLoading(false) }
    })
    const ch = supabase
      .channel(`status-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'status', filter: `user_id=eq.${userId}` },
        (p) => { if (p.new && Object.keys(p.new).length) setRow(p.new) })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [userId])

  return { row, loading, setRow }
}

/** 我收到的信（列表，不含正文），实时更新 */
export function useLetters(myId) {
  const [letters, setLetters] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!myId) return
    const { data } = await supabase
      .from('letters').select('*')
      .eq('receiver_id', myId).neq('status', 'burned')
      .order('created_at', { ascending: false }).limit(30)
    setLetters(data || [])
    setLoading(false)
  }, [myId])

  useEffect(() => {
    if (!myId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel(`letters-${myId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'letters', filter: `receiver_id=eq.${myId}` },
        () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, reload])

  return { letters, loading, reload }
}

/** 收到戳一戳时回调（实时） */
export function usePokes(myId, onPoke) {
  const cb = useRef(onPoke)
  cb.current = onPoke
  useEffect(() => {
    if (!myId) return
    const ch = supabase
      .channel(`pokes-${myId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pokes', filter: `receiver_id=eq.${myId}` },
        (p) => cb.current?.(p.new))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId])
}

/** 操作记录：戳一戳 / 拍一拍（双向，我戳 TA 和 TA 戳我都算）+ 寄信（我发的）+ 收信（我收的），实时更新，供"更新日志"面板用 */
export function useActivityLog(myId, limit = 20) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  // letter_sent 只认发件人是我自己；letter_received 只认收件人是我自己——
  // 这两种 kind 在同一封信上各有一条记录（收发双方各看各的那条），不能互相串
  // 其它动作（戳一戳/拍一拍……）不分方向，我是发起人或是接收人都算
  const relevant = useCallback((p) => {
    if (p.kind === 'letter_sent') return p.sender_id === myId
    if (p.kind === 'letter_received') return p.receiver_id === myId
    return p.sender_id === myId || p.receiver_id === myId
  }, [myId])

  const reload = useCallback(async () => {
    if (!myId) return
    const { data } = await supabase
      .from('pokes').select('*')
      .or(`and(kind.eq.letter_sent,sender_id.eq.${myId}),and(kind.eq.letter_received,receiver_id.eq.${myId}),and(kind.neq.letter_sent,kind.neq.letter_received,sender_id.eq.${myId}),and(kind.neq.letter_sent,kind.neq.letter_received,receiver_id.eq.${myId})`)
      .order('created_at', { ascending: false }).limit(limit)
    setItems(data || [])
    setLoading(false)
  }, [myId, limit])

  useEffect(() => {
    if (!myId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel(`activity-log-${myId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pokes' },
        (p) => { if (relevant(p.new)) setItems((list) => [p.new, ...list].slice(0, limit)) })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, reload, limit, relevant])

  return { items, loading, reload }
}

/** 纪念日列表（共享数据，双方都能加/改/删），实时更新 */
export function useAnniversaries() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('anniversaries').select('*')
      .order('date', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const ch = supabase
      .channel('anniversaries')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'anniversaries' },
        () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [reload])

  return { items, loading, reload }
}

/** 收到一封新信时回调（实时，仅 INSERT）——用于触发"飞入"动画 */
export function useLetterArrivals(myId, onArrive) {
  const cb = useRef(onArrive)
  cb.current = onArrive
  useEffect(() => {
    if (!myId) return
    const ch = supabase
      .channel(`letter-arrivals-${myId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'letters', filter: `receiver_id=eq.${myId}` },
        (p) => cb.current?.(p.new))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId])
}

export function fmtTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === yest.toDateString()) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/** 信箱统计：已读/未读、谁寄得多、最近一封信时间 */
export function useLetterStats(myId, partnerId) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!myId) return
    const [unreadQ, readQ, mineQ, partnerQ, latestQ] = await Promise.all([
      supabase.from('letters').select('id', { count: 'exact', head: true }).eq('receiver_id', myId).eq('status', 'sent'),
      supabase.from('letters').select('id', { count: 'exact', head: true }).eq('receiver_id', myId).eq('status', 'read'),
      supabase.from('letters').select('id', { count: 'exact', head: true }).eq('sender_id', myId),
      partnerId
        ? supabase.from('letters').select('id', { count: 'exact', head: true }).eq('sender_id', partnerId)
        : Promise.resolve({ count: 0 }),
      supabase.from('letters').select('created_at').order('created_at', { ascending: false }).limit(1),
    ])
    setStats({
      unread: unreadQ.count || 0,
      read: readQ.count || 0,
      mine: mineQ.count || 0,
      partner: partnerQ.count || 0,
      latestAt: latestQ.data?.[0]?.created_at || null,
    })
    setLoading(false)
  }, [myId, partnerId])

  useEffect(() => {
    if (!myId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel(`letter-stats-${myId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'letters' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, reload])

  return { stats, loading, reload }
}

/** 相册照片，实时更新 */
export function usePhotos(limit = 30) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('photos').select('*')
      .order('created_at', { ascending: false }).limit(limit)
    setPhotos(data || [])
    setLoading(false)
  }, [limit])

  useEffect(() => {
    reload()
    const ch = supabase
      .channel('photos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' },
        (p) => setPhotos((list) => (list.some((x) => x.id === p.new.id) ? list : [p.new, ...list].slice(0, limit))))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photos' },
        (p) => setPhotos((list) => list.filter((x) => x.id !== p.old.id)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [reload, limit])

  return { photos, loading, reload }
}

/** 某张照片下的评论，实时更新 */
export function usePhotoComments(photoId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!photoId) return
    const { data } = await supabase
      .from('photo_comments').select('*')
      .eq('photo_id', photoId)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setLoading(false)
  }, [photoId])

  useEffect(() => {
    if (!photoId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel(`photo-comments-${photoId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'photo_comments', filter: `photo_id=eq.${photoId}` },
        () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [photoId, reload])

  return { comments, loading, reload }
}
/** 记仇本记录（双方可见，只有作者能改/删），实时更新 */
export function useGrudges() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('grudges').select('*')
      .order('happened_on', { ascending: false })
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const ch = supabase
      .channel('grudges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grudges' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [reload])

  return { items, loading, reload }
}

/** 记仇本全部评论（量很小，一次取完，页面里按 grudge_id 分组） */
export function useGrudgeComments() {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('grudge_comments').select('*')
      .order('created_at', { ascending: true })
    setComments(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const ch = supabase
      .channel('grudge-comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grudge_comments' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [reload])

  return { comments, loading, reload }
}
/** 系统每日任务的完成记录（一天一行，两个人各一条）。互相看得见交没交，实时更新 */
export function useSystemProgress(day, myId, partnerId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!day || !myId) { setLoading(false); return }
    const { data } = await supabase.from('cal_system_progress').select('*').eq('day', day)
    setRows(data || [])
    setLoading(false)
  }, [day, myId])

  useEffect(() => {
    if (!day || !myId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel('sysprog-' + day)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cal_system_progress', filter: 'day=eq.' + day },
        () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [day, myId, reload])

  return {
    rows,
    loading,
    reload,
    mine: rows.find((r) => r.user_id === myId) || null,
    theirs: partnerId ? rows.find((r) => r.user_id === partnerId) || null : null,
  }
}

/* ===========================================================================
   拆卡记录：cal_unlocks（一天一行，跨设备）。
   以前记在 localStorage['cal.unlock.v1']；第一次挂载把那份旧记录 upsert 上去
   （on conflict do nothing：库里已有的不动），成功后才删本机那份。
   本机留着就是双写，两边状态会打架，所以只迁一次、迁完不回头。
   =========================================================================== */
const LS_UNLOCK_KEY = 'cal.unlock.v1'

export function useUnlocks(myId) {
  const [unlocks, setUnlocks] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!myId) { setUnlocks({}); setLoading(false); return }
    const { data, error: err } = await supabase
      .from('cal_unlocks').select('day, method').eq('user_id', myId)
    if (err) { setError(err.message); setLoading(false); return }
    setUnlocks(unlockMapFromRows(data))
    setLoading(false)
  }, [myId])

  useEffect(() => {
    if (!myId) { setLoading(false); return }
    setLoading(true)
    reload()
    const ch = supabase
      .channel(`cal-unlocks-${myId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cal_unlocks', filter: `user_id=eq.${myId}` },
        () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, reload])

  /* 一次性迁移：读旧记录 → upsert（已有就跳过）→ 删本机那份 */
  useEffect(() => {
    if (!myId) return
    let raw = null
    try { raw = localStorage.getItem(LS_UNLOCK_KEY) } catch { return }
    if (!raw) return
    const rows = unlockRowsFromLocal(raw, myId)
    if (!rows.length) {
      try { localStorage.removeItem(LS_UNLOCK_KEY) } catch { /* 隐身模式，无视 */ }
      return
    }
    ;(async () => {
      const { error: err } = await supabase
        .from('cal_unlocks')
        .upsert(rows, { onConflict: 'user_id,day', ignoreDuplicates: true })
      if (err) { setError(err.message); return }   // 旧记录留着，下次开页面再迁
      try { localStorage.removeItem(LS_UNLOCK_KEY) } catch { /* 隐身模式，无视 */ }
      reload()
    })()
  }, [myId, reload])

  /* 记一次拆开：先改本地（点完立刻算开），写库失败就报一句，不回滚——卡已经给他看了 */
  const mark = useCallback(async (day, method) => {
    if (!myId || !day) return
    const m = UNLOCK_METHODS.includes(method) ? method : 'scratch'
    setUnlocks((prev) => ({ ...prev, [day]: m }))
    const { error: err } = await supabase
      .from('cal_unlocks')
      .upsert({ user_id: myId, day, method: m }, { onConflict: 'user_id,day' })
    if (err) setError(err.message)
  }, [myId])

  return { unlocks, loading, error, mark, reload }
}

/* ===========================================================================
   版头：cal_covers + bucket covers。
   我看到的永远是我 owner 的那行（TA 给我换的）；我换的永远写对方 owner 那行。
   所以「我换的版头只出现在 TA 那边」不是前端藏的，是表结构就这么写的。
   =========================================================================== */
const COVER_MAX = 6 * 1024 * 1024
const COVER_SRC = 'covers'

/** 上传前压小：最长边 1440、JPEG 0.82（和 Album 同一套，尺寸小一号——版头只有 158px 高） */
async function compressImage(file, maxDim, quality) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob || file
  } catch {
    return file
  }
}

export function useCover(myId, partnerId) {
  const [cover, setCover] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!myId) { setLoading(false); return }
    const { data } = await supabase
      .from('cal_covers').select('url, set_by, set_at').eq('owner_id', myId).maybeSingle()
    setCover(data || null)
    setLoading(false)
  }, [myId])

  useEffect(() => {
    if (!myId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel(`cal-cover-${myId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cal_covers', filter: `owner_id=eq.${myId}` },
        () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, reload])

  /** 换：图传到 covers/{对方 id}.jpg（覆盖同一个 key），行写对方 owner、set_by 是我 */
  const give = useCallback(async (file) => {
    if (!myId || !partnerId) return { ok: false, error: '还没看到对方的账号' }
    if (!canSetCover(myId, partnerId, partnerId)) return { ok: false, error: '只能换对方的版头' }
    if (!file) return { ok: false, error: '没选到图' }
    const blob = await compressImage(file, 1440, 0.82)
    if (blob.size > COVER_MAX) {
      return { ok: false, error: '压完还有 ' + Math.round(blob.size / 1024) + ' KB，换张小点的' }
    }
    const path = partnerId + '.jpg'
    const { error: upErr } = await supabase.storage
      .from(COVER_SRC).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (upErr) return { ok: false, error: upErr.message }
    const { data } = supabase.storage.from(COVER_SRC).getPublicUrl(path)
    const url = data.publicUrl + '?v=' + Date.now()   // 同一个 key 覆盖，不拼时间戳就是旧图
    const { error: insErr } = await supabase.from('cal_covers').upsert(
      { owner_id: partnerId, url, set_by: myId, set_at: new Date().toISOString() },
      { onConflict: 'owner_id' },
    )
    if (insErr) return { ok: false, error: insErr.message }
    return { ok: true }
  }, [myId, partnerId])

  /** 撤下：先删对方 owner 那行，再删图；图删不掉不影响表 */
  const clear = useCallback(async () => {
    if (!partnerId) return { ok: false, error: '还没看到对方的账号' }
    const { error: delErr } = await supabase.from('cal_covers').delete().eq('owner_id', partnerId)
    if (delErr) return { ok: false, error: delErr.message }
    await supabase.storage.from(COVER_SRC).remove([partnerId + '.jpg'])
    return { ok: true }
  }, [partnerId])

  return { cover, loading, give, clear, reload }
}

/* ===========================================================================
   TA 布置的卡：cal_cards（卡本身）+ cal_progress（谁做完、谁验收）。
   两个人、几十张，一次全取，页面里按天分；不建聚合表 / 视图 / RPC。
   =========================================================================== */
const CARD_KINDS = ['task', 'egg', 'quiz']

export function useCalCards(myId, partnerId) {
  const [cards, setCards] = useState([])
  const [progress, setProgress] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!myId) { setLoading(false); return }
    /* 未来的卡只取「那天有东西」这几列（够画空心圈），正文压根不到这台设备上 */
    const [meta, full, p] = await Promise.all([
      supabase.from('cal_cards').select('id, day, kind, for_user, created_by'),
      supabase.from('cal_cards').select('*').lte('day', todayKey()),
      supabase.from('cal_progress').select('*'),
    ])
    const byId = new Map((full.data || []).map((r) => [r.id, r]))
    setCards((meta.data || []).map((r) => byId.get(r.id) || r))
    setProgress(p.data || [])
    setLoading(false)
  }, [myId])

  useEffect(() => {
    if (!myId) { setLoading(false); return }
    reload()
    const ch = supabase
      .channel('cal-cards-' + myId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cal_cards' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cal_progress' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, reload])

  /** 布置：默认只给 TA 看（for_user = 对方）；没取到对方账号就两个人都能看 */
  const post = useCallback(async ({ day, kind, title, body, needCheck }) => {
    if (!myId) return { ok: false, error: '没登录' }
    if (!day) return { ok: false, error: '没选日子' }
    if (!title || !title.trim()) return { ok: false, error: '标题要写' }
    const { error } = await supabase.from('cal_cards').insert({
      day,
      kind: CARD_KINDS.includes(kind) ? kind : 'task',
      title: title.trim().slice(0, 60),
      body: (body || '').trim().slice(0, 500) || null,
      payload: { need_check: Boolean(needCheck) },
      for_user: partnerId || null,
      created_by: myId,
    })
    if (error) return { ok: false, error: error.message }
    await reload()
    return { ok: true }
  }, [myId, partnerId, reload])

  /** 做完了：自己布置给自己的，完成即通过（免得死锁）；TA 布置的留着等验收 */
  const markDone = useCallback(async (card) => {
    if (!myId || !card) return { ok: false, error: '没有这张卡' }
    const mine = card.created_by === myId && card.for_user === myId
    const now = new Date().toISOString()
    const { error } = await supabase.from('cal_progress').upsert({
      card_id: card.id,
      user_id: myId,
      state: mine ? 'pass' : 'done',
      verdict_by: mine ? myId : null,
      verdict_at: mine ? now : null,
      updated_at: now,
    }, { onConflict: 'card_id,user_id' })
    if (error) return { ok: false, error: error.message }
    await reload()
    return { ok: true }
  }, [myId, reload])

  /** 验收：pass / again（again 可带一句话），写的是对方那条 progress */
  const judge = useCallback(async (card, state, note) => {
    if (!myId || !card) return { ok: false, error: '没有这张卡' }
    const row = progress.find((r) => r.card_id === card.id && r.user_id !== myId)
    if (!row) return { ok: false, error: 'TA 还没交' }
    const now = new Date().toISOString()
    const { error } = await supabase.from('cal_progress').upsert({
      card_id: card.id,
      user_id: row.user_id,
      state: state === 'again' ? 'again' : 'pass',
      note: (note || '').trim() || null,
      verdict_by: myId,
      verdict_at: now,
      updated_at: now,
    }, { onConflict: 'card_id,user_id' })
    if (error) return { ok: false, error: error.message }
    await reload()
    return { ok: true }
  }, [myId, progress, reload])

  return { cards, progress, loading, post, markDone, judge, reload }
}

/**
 * 主屏图标角标用：TA 交了、等我验收的卡有几张。
 * 只取「我布置的卡」和「state = done 的完成记录」这几列，不拉正文、不拉照片。
 * 跟页面上那个角标用同一条规则（badgeCount 的 countPendingVerdicts），别写第二套判断。
 * 通道名带序号：首页和 TabBar 会同时挂这个 hook，同名 channel 会互相顶掉回调。
 */
let calPendingSeq = 0

export function useCalPendingCount(myId) {
  const [n, setN] = useState(0)

  const refresh = useCallback(async () => {
    if (!myId) { setN(0); return }
    const today = todayKey()
    const [cards, progress] = await Promise.all([
      supabase.from('cal_cards').select('id, day, created_by').eq('created_by', myId).lte('day', today),
      supabase.from('cal_progress').select('card_id, user_id, state').eq('state', 'done'),
    ])
    setN(countPendingVerdicts(cards.data || [], progress.data || [], myId, today))
  }, [myId])

  useEffect(() => {
    if (!myId) { setN(0); return }
    refresh()
    const ch = supabase
      .channel(`cal-pending-${myId}-${++calPendingSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cal_progress' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cal_cards' }, () => refresh())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, refresh])

  return n
}
