import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useStatus } from '../lib/hooks'
import { useChat } from '../lib/chat'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { Svg } from '../components/Icon'
import TabBar from '../components/TabBar'
import './chat.css'

const MAX_LEN = 1000
const GROUP_MS = 5 * 60 * 1000 // 同一个人 5 分钟内连着发的消息算一组
const MENU_W = 156
const MENU_ITEM = 44
const MAX_IMG_PICK = 9 // 一次最多选几张
const MAX_ORIGINAL = 25 * 1024 * 1024 // 原图上限；压缩后会小很多
const MAX_UPLOAD = 6 * 1024 * 1024 // 压缩后的上限

const pad = (n) => String(n).padStart(2, '0')
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayKey = (iso) => new Date(iso).toDateString()
const dayLabel = (iso) => {
  const d = new Date(iso), n = new Date(), y = new Date()
  y.setDate(n.getDate() - 1)
  if (d.toDateString() === n.toDateString()) return '今天'
  if (d.toDateString() === y.toDateString()) return '昨天'
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}
const initial = (s) => (s || '?').trim().slice(0, 1).toUpperCase()

// 上传前在本地把图片压小：最长边不超过 1600px，转成 JPEG（跟相册那边的压缩逻辑一致）
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob || file
  } catch {
    return file
  }
}

export default function Chat() {
  const { me, partner } = useAuth()
  const { theme, toggle } = useTheme()
  const { row: ps } = useStatus(partner?.id)
  const chat = useChat(me, partner)
  const { msgs } = chat
  const myId = me?.id

  const [text, setText] = useState('')
  const [replyId, setReplyId] = useState(null)
  const [typing, setTyping] = useState(false)
  const [menu, setMenu] = useState(null) // { id, left, top, ox, oy, mine }
  const [flashId, setFlashId] = useState(null)
  const [toast, setToast] = useState('')
  const [pending, setPending] = useState(0)
  const [far, setFar] = useState(false) // 离底部很远：显示"回到最新"
  const [atBottom, setAtBottom] = useState(true)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [justRead, setJustRead] = useState(() => new Set())
  const [stagedImgs, setStagedImgs] = useState([]) // 待发送的图片：{ key, file, preview }
  const [uploading, setUploading] = useState(false)
  const [viewImg, setViewImg] = useState(null) // 全屏看图

  const rootRef = useRef(null)
  const headRef = useRef(null)
  const bottomRef = useRef(null)
  const listRef = useRef(null)
  const taRef = useRef(null)
  const imgFileRef = useRef(null)
  const stick = useRef(true)
  const lastKey = useRef(null)
  const restore = useRef(null)
  const blurTimer = useRef(null)
  const toastTimer = useRef(null)
  const lp = useRef({ t: 0, x: 0, y: 0, fired: false })
  const readMap = useRef(new Map())

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1900)
  }, [])
  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(blurTimer.current); clearTimeout(lp.current.t) }, [])

   // ---------- 页面环境：锁住 html + body 的滚动（只锁 body 不够，iOS 聚焦输入框时
  // 还是会把 <html> 自己滚一下，跟下面 visualViewport 的矫正打架，就是乱弹的根源）----------
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    delete document.documentElement.dataset.dir
    window.scrollTo(0, 0)
    // 双保险：键盘动画过程中如果文档还是被偷偷滚了一下，立刻按回 0,0
    const pin = () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0) }
    window.addEventListener('scroll', pin, { passive: true })
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
      window.removeEventListener('scroll', pin)
    }
  }, [])

  // 软键盘弹出时，聊天页只占"看得见的那一块"，输入栏就会贴在键盘上面
  useEffect(() => {
    const vv = window.visualViewport
    const root = rootRef.current
    if (!vv || !root) return undefined
    const apply = () => {
      root.style.setProperty('--vvh', `${vv.height}px`)
      root.style.setProperty('--vvt', `${vv.offsetTop}px`)
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply) }
  }, [])

  // 聊天页待得比较久，背景的呼吸/漂移动画一直在跑，叠加气泡的 backdrop-filter 比较费电；
  // 在聊天页时把背景暂停成静止的（玻璃效果还在，只是不再动），复用现有的 data-bg-paused 机制
  useEffect(() => {
    const html = document.documentElement
    const already = html.hasAttribute('data-bg-paused')
    if (!already) html.setAttribute('data-bg-paused', '')
    return () => { if (!already && !document.hidden) html.removeAttribute('data-bg-paused') }
  }, [])

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ---------- 滚动 ----------
  const nearBottom = () => {
    const el = listRef.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 90
  }
  const toBottom = useCallback((smooth) => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const onScroll = () => {
    const nb = nearBottom()
    stick.current = nb
    setAtBottom((v) => (v === nb ? v : nb))
    const el = listRef.current
    const isFar = el ? el.scrollHeight - el.scrollTop - el.clientHeight > 220 : false
    setFar((v) => (v === isFar ? v : isFar))
    if (nb) setPending(0)
    clearTimeout(lp.current.t)
  }

  // 顶栏 / 底栏的高度写成 CSS 变量，消息列表据此留白；高度变化（键盘、回复条、导航收起）时贴底的话继续贴底
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const measure = () => {
      root.style.setProperty('--headH', `${headRef.current ? headRef.current.offsetTop + headRef.current.offsetHeight : 76}px`)
      root.style.setProperty('--botH', `${bottomRef.current ? bottomRef.current.offsetHeight : 120}px`)
      if (stick.current) toBottom(false)
    }
    const ro = new ResizeObserver(measure)
    ;[root, headRef.current, bottomRef.current].forEach((n) => n && ro.observe(n))
    measure()
    return () => ro.disconnect()
  }, [toBottom])

  // 有新消息：第一次直接到底；我发的 / 本来就在底部 → 滚到底；否则只提示"x 条新消息"
  useLayoutEffect(() => {
    if (restore.current) {
      const el = listRef.current
      if (el) el.scrollTop = restore.current.top + (el.scrollHeight - restore.current.h)
      restore.current = null
      return
    }
    const last = msgs[msgs.length - 1]
    if (!last) return
    const key = last._k || last.id
    if (lastKey.current === key) return
    const first = lastKey.current === null
    lastKey.current = key
    if (first) { toBottom(false); return }
    if (last.sender_id === myId || stick.current) toBottom(true)
    else setPending((n) => n + 1)
  }, [msgs, myId, toBottom])

  const loadOlder = async () => {
    const el = listRef.current
    if (el) restore.current = { top: el.scrollTop, h: el.scrollHeight }
    const n = await chat.loadMore()
    if (!n) restore.current = null
  }

  // ---------- 已读：页面可见 + 在底部，才算"看到了" ----------
  const unreadIn = useMemo(() => msgs.some((m) => m.sender_id !== myId && !m.tmp && !m.read_at && !m.recalled_at), [msgs, myId])
  useEffect(() => {
    if (unreadIn && visible && atBottom) chat.markRead()
  }, [unreadIn, visible, atBottom, chat.markRead]) // eslint-disable-line react-hooks/exhaustive-deps

  // 我发的消息被对方读到的那一刻，让"已读"弹一下
  useEffect(() => {
    const flipped = []
    msgs.forEach((m) => {
      if (m.sender_id !== myId) return
      const was = readMap.current.get(m.id)
      if (was === false && m.read_at) flipped.push(m.id)
      readMap.current.set(m.id, !!m.read_at)
    })
    if (flipped.length) {
      setJustRead(new Set(flipped))
      const t = setTimeout(() => setJustRead(new Set()), 800)
      return () => clearTimeout(t)
    }
    return undefined
  }, [msgs, myId])

  // ---------- 输入 ----------
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 110)}px`
  }, [text])

  const onFocus = () => { clearTimeout(blurTimer.current); setTyping(true) }
  const onBlur = () => {
    clearTimeout(blurTimer.current)
    blurTimer.current = setTimeout(() => setTyping(false), 140)
  }
  // 点发送 / 取消回复这类按钮不要抢走输入框的焦点，否则键盘会收起、导航会弹回来
  const keepFocus = (e) => e.preventDefault()

  const replyTarget = replyId ? msgs.find((m) => m.id === replyId) : null
  useEffect(() => {
    if (replyId && (!replyTarget || replyTarget.recalled_at)) setReplyId(null)
  }, [replyId, replyTarget])

  // ---------- 图片：选图 / 移除 / 发送 ----------
  const pickImages = () => imgFileRef.current?.click()

  const onImageFile = (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_IMG_PICK)
    e.target.value = ''
    if (!files.length) return
    const ok = files.filter((f) => f.type.startsWith('image/') && f.size <= MAX_ORIGINAL)
    if (ok.length < files.length) say('有的文件不是图片或太大，跳过了')
    const next = ok.map((f) => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, preview: URL.createObjectURL(f) }))
    setStagedImgs((cur) => [...cur, ...next].slice(0, MAX_IMG_PICK))
  }

  const removeStaged = (key) => {
    setStagedImgs((cur) => {
      const hit = cur.find((p) => p.key === key)
      if (hit) URL.revokeObjectURL(hit.preview)
      return cur.filter((p) => p.key !== key)
    })
  }

  const doSend = async () => {
    if (uploading) return
    const t = text.trim()
    const imgs = stagedImgs
    if (!t && imgs.length === 0) return
    const rp = replyId
    setReplyId(null)
    stick.current = true

    if (imgs.length === 0) {
      setText('')
      const r = await chat.send(t, rp)
      if (r.error && r.error !== 'empty') say(r.error === 'setup' ? '聊天的 SQL 还没有运行' : r.error)
      return
    }

    // 有图片：按顺序一张一张传，文字说明带在最后一张上
    setUploading(true)
    let sentCount = 0
    for (let i = 0; i < imgs.length; i += 1) {
      const img = imgs[i]
      const caption = i === imgs.length - 1 ? t : ''
      const replyFor = i === 0 ? rp : null
      let path = ''
      try {
        const blob = await compressImage(img.file)
        if (blob.size > MAX_UPLOAD) throw new Error('too big')
        path = `${myId}/${img.key}.jpg`
        const { error: upErr } = await supabase.storage.from('chat-images').upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
        const r = await chat.send(caption, replyFor, null, data.publicUrl)
        if (r.error) { await supabase.storage.from('chat-images').remove([path]); throw new Error(r.error) }
        sentCount += 1
        URL.revokeObjectURL(img.preview)
        setStagedImgs((cur) => cur.filter((p) => p.key !== img.key))
      } catch {
        say(sentCount ? `发了 ${sentCount} 张，剩下的没发出去` : '图片发送失败，再试一次')
        break
      }
    }
    if (sentCount === imgs.length) setText('')
    setUploading(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer:fine)').matches) {
      e.preventDefault(); doSend()
    }
  }

  // ---------- 长按菜单 ----------
  const closeMenu = () => setMenu(null)
  const openMenu = (id, el) => {
    const m = msgs.find((x) => x.id === id)
    const root = rootRef.current
    if (!m || m.tmp || m.recalled_at || !root) return
    const mine = m.sender_id === myId
    const rr = root.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const itemCount = (mine ? 1 : 0) + (m.body ? 1 : 0) + 1 // 收回(仅自己) + 复制(有文字才有) + 回复
    const mh = itemCount * MENU_ITEM + 12 + (mine ? 7 : 0)
    const headBottom = headRef.current.getBoundingClientRect().bottom
    let top = r.top - mh - 8
    let oy = '100%'
    if (top < headBottom + 6) { top = r.bottom + 8; oy = '0%' }
    top = Math.max(headBottom + 6, Math.min(top, rr.bottom - mh - 10))
    let left = mine ? r.right - MENU_W : r.left
    left = Math.max(rr.left + 10, Math.min(left, rr.right - MENU_W - 10))
    try { navigator.vibrate?.(12) } catch { /* iOS 不支持 */ }
    setMenu({ id, left: left - rr.left, top: top - rr.top, ox: mine ? '100%' : '0%', oy, mine })
  }

  const onPointerDown = (e) => {
    const bub = e.target.closest('.ch-bub')
    if (!bub || e.target.closest('.ch-q')) return
    const st = lp.current
    st.x = e.clientX; st.y = e.clientY; st.fired = false
    clearTimeout(st.t)
    st.t = setTimeout(() => { st.fired = true; openMenu(bub.dataset.id, bub) }, 420)
  }
  const onPointerMove = (e) => {
    const st = lp.current
    if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) clearTimeout(st.t)
  }
  const cancelLP = () => clearTimeout(lp.current.t)
  const onContextMenu = (e) => {
    const bub = e.target.closest('.ch-bub')
    if (!bub) return
    e.preventDefault(); cancelLP()
    openMenu(bub.dataset.id, bub)
  }

  const jumpTo = (id) => {
    const row = listRef.current?.querySelector(`[data-row="${CSS.escape(String(id))}"]`)
    if (!row) { say('那条消息比较早，往上翻翻看'); return }
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlashId(null)
    requestAnimationFrame(() => setFlashId(id))
    setTimeout(() => setFlashId((v) => (v === id ? null : v)), 1300)
  }

  const onListClick = (e) => {
    if (lp.current.fired) { lp.current.fired = false; return }
    const q = e.target.closest('[data-q]')
    if (q) { jumpTo(q.dataset.q); return }
    if (!e.target.closest('button, .ch-bub')) taRef.current?.blur() // 点空白处：收起键盘，导航回来
  }

  const menuMsg = menu ? msgs.find((m) => m.id === menu.id) : null
  const runMenu = async (act) => {
    const m = menuMsg
    closeMenu()
    if (!m) return
    if (act === 'reply') { setReplyId(m.id); taRef.current?.focus() }
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(m.body || ''); say('已复制') } catch { say('复制失败，这个浏览器不让复制') }
    }
    if (act === 'recall') {
      const r = await chat.recall(m.id)
      say(r.error ? `没能收回：${r.error}` : '已收回，TA 那边也看不到了')
    }
  }

  // ---------- 渲染用的数据：日期分隔 + 分组 ----------
  const items = useMemo(() => {
    const out = []
    let lastDay = ''
    const near = (a, b) => a && b && !a.recalled_at && !b.recalled_at && a.sender_id === b.sender_id
      && dayKey(a.created_at) === dayKey(b.created_at) && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < GROUP_MS
    msgs.forEach((m, i) => {
      const day = dayKey(m.created_at)
      if (day !== lastDay) { out.push({ type: 'date', key: `d-${day}`, label: dayLabel(m.created_at) }); lastDay = day }
      if (m.recalled_at) { out.push({ type: 'sys', key: m._k || m.id, m }); return }
      out.push({ type: 'msg', key: m._k || m.id, m, first: !near(msgs[i - 1], m), last: !near(m, msgs[i + 1]) })
    })
    return out
  }, [msgs])

  const quoteOf = (m) => {
    if (!m.reply_to) return null
    const q = msgs.find((x) => x.id === m.reply_to)
    if (!q) return { gone: true, who: '', text: '更早的消息', id: m.reply_to }
    const text = q.recalled_at ? '此讯息已被收回' : (q.body || (q.image_url ? '[图片]' : ''))
    return { gone: !!q.recalled_at, who: q.sender_id === myId ? '你' : 'TA', text, id: q.id }
  }

  const pname = partner?.display_name || 'TA'
  const avatarStyle = ps?.avatar_url ? { backgroundImage: `url(${ps.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined

  const miniAvatar = () => <div className="ch-mini" style={avatarStyle}>{!ps?.avatar_url && initial(pname)}</div>

  return (
    <div className="ch-page">
      <div className="bg">
        <div className="blobs">
          <div className="blob a" /><div className="blob b" /><div className="blob c" /><div className="blob d" />
        </div>
        <div className="aurora" />
      </div>
      {toast && <div className="toast glass">{toast}</div>}
      {viewImg && (
        <div className="ch-imgview" onClick={() => setViewImg(null)}>
          <img src={viewImg} alt="" />
          <button type="button" className="ch-imgview-x" onClick={() => setViewImg(null)} aria-label="关闭">
            <Svg name="x" size={20} stroke={2.2} />
          </button>
        </div>
      )}

      <div ref={rootRef} className={`ch-root${typing ? ' typing' : ''}`}>
        <header ref={headRef} className="ch-head glass">
          <div className="ch-av" style={avatarStyle}>
            {!ps?.avatar_url && initial(pname)}
            <i className={`dot${chat.online ? '' : ' off'}`} />
          </div>
          <div className="ch-hd-t">
            <div className="ch-hd-name ellipsis">{pname}</div>
            <div className="ch-hd-sub">{chat.online ? 'TA 也在这里' : 'TA 不在聊天页'}</div>
          </div>
          <button type="button" className="icon-btn ch-theme tap" onClick={toggle} aria-label="切换明暗主题">
            <Svg name={theme === 'light' ? 'moon' : 'sun'} size={18} />
          </button>
        </header>

        <div
          ref={listRef} className="ch-list" onScroll={onScroll} onClick={onListClick}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={cancelLP} onPointerCancel={cancelLP}
          onContextMenu={onContextMenu}
        >
          {chat.error === 'setup' && (
            <div className="ch-sys ch-setup">
              聊天还没准备好：要先到 Supabase 的 SQL Editor 里运行聊天的两段 SQL。
              <button type="button" className="pill" onClick={chat.reload}>我已经运行了，刷新</button>
            </div>
          )}
          {chat.error && chat.error !== 'setup' && <div className="ch-sys">加载失败：{chat.error}</div>}
          {chat.hasMore && <button type="button" className="ch-more" onClick={loadOlder}>查看更早的消息</button>}
          {!chat.loading && !chat.error && msgs.length === 0 && (
            <div className="ch-empty"><Svg name="chat" size={26} stroke={1.5} /><span>还没有消息，先说一句吧</span></div>
          )}

          {items.map((it) => {
            if (it.type === 'date') return <div key={it.key} className="ch-date">{it.label}</div>
            const m = it.m
            const mineMsg = m.sender_id === myId
            if (it.type === 'sys') {
              return (
                <div key={it.key} data-row={m.id} className={`ch-sys${flashId === m.id ? ' flash' : ''}`}>
                  {mineMsg ? '你' : `${pname} `}收回了一则讯息
                </div>
              )
            }
            const q = quoteOf(m)
            const cls = `ch-row ${mineMsg ? 'me' : 'ta'}${it.first ? ' first' : ''}${it.last ? ' last' : ''}${chat.fresh && (chat.fresh === m.id || chat.fresh === m._k) ? ' new' : ''}${flashId === m.id ? ' flash' : ''}${m.state === 'failed' ? ' failed' : ''}`
            const bub = (
              <div className={`ch-bub${m.image_url ? ' ch-bub-img' : ''}${menu?.id === m.id ? ' pressed' : ''}${m.state === 'sending' ? ' sending' : ''}`} data-id={m.id}>
                {q && (
                  <button type="button" className={`ch-q${q.gone ? ' gone' : ''}`} data-q={q.id}>
                    {q.who && <b>{q.who}</b>}<span>{q.text}</span>
                  </button>
                )}
                {m.image_url && (
                  <img
                    className="ch-img" src={m.image_url} alt="" loading="lazy" decoding="async"
                    onClick={(e) => { e.stopPropagation(); setViewImg(m.image_url) }}
                  />
                )}
                {m.body && (m.image_url ? <div className="ch-cap">{m.body}</div> : m.body)}
              </div>
            )
            if (!mineMsg) {
              return (
                <div key={it.key} data-row={m.id} className={cls}>
                  <div className="ch-side">{it.first && miniAvatar()}</div>
                  {bub}
                  {it.last && <div className="ch-meta">{hm(m.created_at)}</div>}
                </div>
              )
            }
            let status
            if (m.state === 'sending') status = <span className="rd unread">发送中…</span>
            else if (m.state === 'failed') {
              status = (
                <span className="rd bad">
                  <button type="button" onClick={() => chat.send(m.body, m.reply_to, m.id, m.image_url)}>重发</button>
                  {' · '}
                  <button type="button" onClick={() => chat.discard(m.id)}>删除</button>
                </span>
              )
            } else if (m.read_at) status = <span className={`rd${justRead.has(m.id) ? ' flipped' : ''}`}>已读</span>
            else status = <span className="rd unread">未读</span>
            return (
              <div key={it.key} data-row={m.id} className={cls}>
                {(it.last || m.state === 'failed') && <div className="ch-meta">{status}{m.state === 'failed' ? '' : hm(m.created_at)}</div>}
                {bub}
              </div>
            )
          })}
        </div>

        <button type="button" className={`ch-fab glass${far || pending ? ' on' : ''}`} onClick={() => { setPending(0); toBottom(true) }} aria-label="回到最新消息">
          <Svg name="down" size={16} stroke={2} />
          <span>{pending ? `${pending} 条新消息` : '回到最新'}</span>
        </button>

        <div ref={bottomRef} className="ch-bottom">
          {replyTarget && (
            <div className="ch-replying glass on">
              <div className="bar" />
              <div className="tx">
                <b>回复 {replyTarget.sender_id === myId ? '你' : pname}</b>
                <span>{replyTarget.body || (replyTarget.image_url ? '[图片]' : '')}</span>
              </div>
              <button type="button" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => setReplyId(null)} aria-label="取消回复">
                <Svg name="x" size={14} stroke={2} />
              </button>
            </div>
          )}

          {stagedImgs.length > 0 && (
            <div className="ch-staged glass on">
              {stagedImgs.map((p) => (
                <div key={p.key} className="ch-st-item">
                  <img src={p.preview} alt="" />
                  {!uploading && (
                    <button type="button" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => removeStaged(p.key)} aria-label="移除这张图片">
                      <Svg name="x" size={11} stroke={2.4} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="ch-compose glass">
            <button type="button" className="ch-cam tap" disabled={uploading || stagedImgs.length >= MAX_IMG_PICK} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={pickImages} aria-label="发送图片">
              <Svg name="camera" size={19} stroke={1.8} />
            </button>
            <input ref={imgFileRef} type="file" accept="image/*" multiple hidden onChange={onImageFile} />
            <textarea
              ref={taRef} rows={1} value={text} maxLength={MAX_LEN} placeholder="输入消息"
              onChange={(e) => setText(e.target.value)} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown}
              enterKeyHint="send" aria-label="输入消息"
            />
            <button type="button" className="ch-send tap" disabled={(!text.trim() && stagedImgs.length === 0) || uploading} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={doSend} aria-label="发送">
              <Svg name="up" size={18} stroke={2.2} />
            </button>
          </div>
          <div className="ch-navspace" aria-hidden="true" />
        </div>

        {menu && (
          <>
            <div className="ch-scrim" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu() }} />
            <div className="ch-menu glass" role="menu" style={{ left: menu.left, top: menu.top, '--ox': menu.ox, '--oy': menu.oy }}>
              <button type="button" role="menuitem" onClick={() => runMenu('reply')}><Svg name="reply" size={18} />回复</button>
              {menuMsg?.body && <button type="button" role="menuitem" onClick={() => runMenu('copy')}><Svg name="copy" size={18} />复制</button>}
              {menu.mine && (
                <>
                  <hr />
                  <button type="button" role="menuitem" className="danger" onClick={() => runMenu('recall')}><Svg name="undo" size={18} />收回</button>
                </>
              )}
            </div>
          </>
        )}

        <TabBar hidden={typing} />
      </div>
    </div>
  )
}