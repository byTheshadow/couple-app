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
