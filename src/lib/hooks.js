import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

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

/** 操作记录：戳一戳 / 拍一拍（TA 对我做的）+ 寄信（我发的）+ 收信（我收的），实时更新，供"更新日志"面板用 */
export function useActivityLog(myId, limit = 20) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const relevant = useCallback((p) => (
    p.kind === 'letter_sent' ? p.sender_id === myId : p.receiver_id === myId
  ), [myId])

  const reload = useCallback(async () => {
    if (!myId) return
    const { data } = await supabase
      .from('pokes').select('*')
      .or(`and(receiver_id.eq.${myId},kind.neq.letter_sent),and(sender_id.eq.${myId},kind.eq.letter_sent)`)
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
        (p) => setPhotos((list) => [p.new, ...list].slice(0, limit)))
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