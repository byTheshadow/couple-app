import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const PAGE = 60

const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at)

/** 把 Supabase 的报错翻译成人话 */
export function chatError(e) {
  const m = e?.message || ''
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /relation .*messages.* does not exist|schema cache/i.test(m)) return 'setup'
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return 'setup'
  if (m.includes('no partner')) return '还没有另一半的账号'
  if (m.includes('empty body')) return '消息是空的'
  if (m.includes('too long')) return '消息太长了（最多 1000 字）'
  if (m.includes('not found')) return '这条消息已经找不到了'
  return m || '出错了'
}

/**
 * 聊天核心：加载、实时收发、乐观发送、撤回、已读、对方是否在聊天页（presence）。
 * 所有写操作都走数据库函数（send_message / recall_message / mark_messages_read），
 * 表本身对前端是只读的，所以别人（包括自己误操作）没法直接改消息。
 */
export function useChat(me, partner) {
  const myId = me?.id
  const pid = partner?.id
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [online, setOnline] = useState(false)
  const [fresh, setFresh] = useState(null)
  const msgsRef = useRef([])
  msgsRef.current = msgs
  const readBusy = useRef(false)

  const fetchLatest = useCallback(async () => {
    const { data, error: e } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(PAGE)
    if (e) { setError(chatError(e)); setLoading(false); return }
    setError('')
    const rows = (data || []).reverse()
    setHasMore((data || []).length === PAGE)
    setMsgs((cur) => {
      const ids = new Set(rows.map((r) => r.id))
      const firstAt = rows.length ? new Date(rows[0].created_at).getTime() : Infinity
      // 已经翻出来的更早的消息要保留；发送中 / 失败的临时消息也要保留
      const older = cur.filter((m) => !m.tmp && !ids.has(m.id) && new Date(m.created_at).getTime() < firstAt)
      const keyed = rows.map((r) => { const old = cur.find((m) => m.id === r.id); return old?._k ? { ...r, _k: old._k } : r })
      const tmps = cur.filter((m) => m.tmp)
      return [...older, ...keyed, ...tmps].sort(byTime)
    })
    setLoading(false)
  }, [])

  const loadMore = useCallback(async () => {
    const first = msgsRef.current.find((m) => !m.tmp)
    if (!first) return 0
    const { data, error: e } = await supabase.from('messages').select('*').lt('created_at', first.created_at).order('created_at', { ascending: false }).limit(PAGE)
    if (e) return 0
    const rows = (data || []).reverse()
    setHasMore((data || []).length === PAGE)
    setMsgs((cur) => {
      const ids = new Set(cur.map((m) => m.id))
      return [...rows.filter((r) => !ids.has(r.id)), ...cur].sort(byTime)
    })
    return rows.length
  }, [])

  const upsert = useCallback((row, live) => {
    setMsgs((cur) => {
      const i = cur.findIndex((m) => m.id === row.id)
      if (i >= 0) { const next = cur.slice(); next[i] = { ...next[i], ...row }; return next }
      let list = cur
      let keep
      // 我自己发的消息从实时通道先到了：把对应的"发送中"临时消息换掉，沿用它的 key，界面不会闪
      if (row.sender_id === myId) {
        const t = cur.findIndex((m) => m.tmp && m.body === row.body)
        if (t >= 0) { keep = cur[t].id; list = cur.filter((_, k) => k !== t) }
      }
      if (live && !keep) setFresh(row.id)
      return [...list, keep ? { ...row, _k: keep } : row].sort(byTime)
    })
  }, [myId])

  useEffect(() => {
    if (!myId) { setLoading(false); return undefined }
    fetchLatest()
    let first = true
    const ch = supabase
      .channel(`chat-msgs-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => upsert(p.new, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => upsert(p.new, false))
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        if (first) { first = false; return }
        fetchLatest() // 断线重连后补上漏掉的
      })
    const onVis = () => { if (document.visibilityState === 'visible') fetchLatest() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch) }
  }, [myId, fetchLatest, upsert])

  // 对方是否正开着聊天页：presence。页面切到后台就取消，所以"在线 = 真的在看"
  useEffect(() => {
    if (!myId || !pid) return undefined
    const pc = supabase.channel('couple-chat-presence', { config: { presence: { key: myId } } })
    let subscribed = false
    const sync = () => setOnline((pc.presenceState()[pid] || []).length > 0)
    const announce = () => {
      if (!subscribed) return
      if (document.visibilityState === 'visible') pc.track({ at: Date.now() })
      else pc.untrack()
    }
    pc.on('presence', { event: 'sync' }, sync)
      .subscribe((status) => { if (status === 'SUBSCRIBED') { subscribed = true; announce() } })
    document.addEventListener('visibilitychange', announce)
    return () => { document.removeEventListener('visibilitychange', announce); supabase.removeChannel(pc); setOnline(false) }
  }, [myId, pid])

  const send = useCallback(async (text, replyTo, retryId) => {
    const body = (text || '').trim()
    if (!body || !myId) return { error: 'empty' }
    const tmpId = retryId || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const reply = replyTo && !String(replyTo).startsWith('tmp-') ? replyTo : null
    setMsgs((cur) => [
      ...cur.filter((m) => m.id !== tmpId),
      { id: tmpId, tmp: true, state: 'sending', sender_id: myId, receiver_id: pid, body, reply_to: reply, created_at: new Date().toISOString(), read_at: null, recalled_at: null },
    ].sort(byTime))
    setFresh(tmpId)
    const { data, error: e } = await supabase.rpc('send_message', { p_body: body, p_reply_to: reply })
    if (e) {
      setMsgs((cur) => cur.map((m) => (m.id === tmpId ? { ...m, state: 'failed', err: chatError(e) } : m)))
      return { error: chatError(e) }
    }
    const row = Array.isArray(data) ? data[0] : data
    setMsgs((cur) => {
      const rest = cur.filter((m) => m.id !== tmpId)
      if (!row || rest.some((m) => m.id === row.id)) return rest
      return [...rest, { ...row, _k: tmpId }].sort(byTime)
    })
    return { error: null }
  }, [myId, pid])

  const discard = useCallback((id) => setMsgs((cur) => cur.filter((m) => m.id !== id)), [])

  const recall = useCallback(async (id) => {
    const old = msgsRef.current.find((m) => m.id === id)
    if (!old || old.tmp) return { error: '还没发出去' }
    setMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, body: null, recalled_at: new Date().toISOString() } : m)))
    const { error: e } = await supabase.rpc('recall_message', { p_id: id })
    if (e) {
      setMsgs((cur) => cur.map((m) => (m.id === id ? old : m)))
      return { error: chatError(e) }
    }
    return { error: null }
  }, [])

  // 把"对方发给我、我还没读"的消息标记为已读（调用方保证：页面可见 + 在底部）
  const markRead = useCallback(async () => {
    if (readBusy.current) return
    readBusy.current = true
    try { await supabase.rpc('mark_messages_read') } finally { readBusy.current = false }
  }, [])

  return { msgs, loading, error, hasMore, online, fresh, send, discard, recall, markRead, loadMore, reload: fetchLatest }
}

let seq = 0
/** 底部导航「聊天」上的未读数。表还没建好时静默为 0，不影响别的页面 */
export function useChatUnread(myId) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!myId) return undefined
    let alive = true
    const load = async () => {
      const { count, error } = await supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('receiver_id', myId).is('read_at', null).is('recalled_at', null)
      if (alive && !error) setN(count || 0)
    }
    load()
    const ch = supabase
      .channel(`chat-unread-${myId}-${++seq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [myId])
  return n
}