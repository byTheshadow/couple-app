import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Svg } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { fmtTime, useAnniversaries, useCalCards, useCover, useLetters, usePhotos, useUnlocks } from '../lib/hooks'
import {
  WEEKDAY_CN, addMonth, canSetCover, dayKey, daysInMonth, expandYearly, fmtMD, gateFor,
  keyOf, monthGrid, normalizeZoom, pad2, parseDay, todayKey, weekdayOf,
} from '../lib/calendar'
import { dailyCard } from '../lib/stories'
import { countPendingVerdicts } from '../lib/badgeCount'
import NoticeDot from '../components/NoticeDot'
import QuestPopup from '../components/QuestPopup'
import './calendar.css'

/* 字号三档记在本机：这是「我看得清不舒服」的问题，不该跟着账号走 */
const FS_KEY = 'cal.fs.v1'

const DOT_CLASS = { card: '', pic: ' p', mail: ' m', anniv: ' l', hollow: ' hollow' }

/** 正文：标题 / 一句话 / 两段故事 / 折叠的节日清单 / 来源 */
function StoryBody({ c }) {
  return (
    <div>
      <h3 className="cal-t">{c.title}</h3>
      {c.sub ? <p className="cal-sub">{c.sub}</p> : null}
      {c.body.map((p, i) => <p className="cal-p" key={i}>{p}</p>)}
      {c.festivals.length > 0 && (
        <details className="cal-more">
          <summary>今天还有 {c.festivals.length} 条</summary>
          <ul className="cal-fest">
            {c.festivals.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </details>
      )}
      {c.sources.length > 0 && <p className="cal-src">来源：{c.sources.join(' · ')}</p>}
    </div>
  )
}

/** 周末那天不用过暗号，点一下就看 */
function Seal({ date, onOpen }) {
  const { m, d } = parseDay(date)
  return (
    <div className="cal-seal">
      <div className="cal-stamp"><b>未拆</b><span>{pad2(m)}.{pad2(d)}</span></div>
      <p className="cal-seal-t">今天不用过暗号<br />点一下就看</p>
      <button className="cal-main" type="button" onClick={() => onOpen()}>打开</button>
    </div>
  )
}

const KIND_CN = { task: '任务', egg: '彩蛋', quiz: '问答' }

/* ---------- 存成图片：canvas 手绘，不引 html2canvas ---------- */
const CV_W = 1080
const SERIF = '"Songti SC", "Noto Serif CJK SC", "SimSun", serif'
const SANS = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'

/** 中文按字断行：一行装不下就换行，标点不讲究（够用） */
function wrapLines(ctx, text, maxW) {
  const out = []
  let line = ''
  for (const ch of String(text || '')) {
    if (ch === '\n') { out.push(line); line = ''; continue }
    const next = line + ch
    if (line && ctx.measureText(next).width > maxW) { out.push(line); line = ch } else line = next
  }
  if (line) out.push(line)
  return out
}

/** 排一遍量高度、再按量好的高度画：canvas 一改尺寸就清空，不能边量边画 */
function paintCard(card, dateStr) {
  const measure = document.createElement('canvas').getContext('2d')
  const padX = 92
  const maxW = CV_W - padX * 2
  const blocks = []
  let y = 168

  blocks.push({ type: 'meta', text: dateStr, y })
  y += 52

  measure.font = `600 48px ${SERIF}`
  for (const line of wrapLines(measure, card.title, maxW)) {
    blocks.push({ type: 'title', text: line, y })
    y += 68
  }
  y += 6
  if (card.sub) {
    measure.font = `24px ${SANS}`
    for (const line of wrapLines(measure, card.sub, maxW)) {
      blocks.push({ type: 'sub', text: line, y })
      y += 42
    }
  }
  y += 26
  for (const p of card.body) {
    measure.font = `27px ${SANS}`
    for (const line of wrapLines(measure, p, maxW)) {
      blocks.push({ type: 'body', text: line, y })
      y += 50
    }
    y += 20
  }
  y += 26
  blocks.push({ type: 'foot', text: '十一月 · 每天一个真事', y })

  const cv = document.createElement('canvas')
  cv.width = CV_W
  cv.height = y + 120
  const ctx = cv.getContext('2d')

  ctx.fillStyle = '#f6f1e6'
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.strokeStyle = 'rgba(27, 26, 23, .14)'
  ctx.lineWidth = 2
  ctx.strokeRect(40, 40, cv.width - 80, cv.height - 80)

  for (const b of blocks) {
    if (b.type === 'title') { ctx.font = `600 48px ${SERIF}`; ctx.fillStyle = '#1b1a17' }
    else if (b.type === 'body') { ctx.font = `27px ${SANS}`; ctx.fillStyle = '#1b1a17' }
    else if (b.type === 'sub') { ctx.font = `24px ${SANS}`; ctx.fillStyle = 'rgba(27, 26, 23, .66)' }
    else { ctx.font = '20px "Courier New", monospace'; ctx.fillStyle = 'rgba(27, 26, 23, .5)' }
    ctx.fillText(b.text, padX, b.y)
  }
  return cv
}

/** iOS 走分享面板才能进相册；别的浏览器退成下载 */
async function saveImage(cv, name) {
  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'))
  if (!blob) return { ok: false, error: '画不出来' }
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return { ok: true }
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'cancel' }
      /* 分享失败就往下走下载 */
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return { ok: true }
}

/** 那天有我或 TA 布置的卡：做完、验收都在这一行里发生 */
function DayCards({ cards, me, progress, onDone, onJudge }) {
  const [openId, setOpenId] = useState('')
  return (
    <div className="cal-cc">
      {cards.map((c) => {
        const mine = progress.find((r) => r.card_id === c.id && r.user_id === me.id)
        const theirs = progress.find((r) => r.card_id === c.id && r.user_id !== me.id)
        const iMade = c.created_by === me.id
        let right = KIND_CN[c.kind] || '卡'
        if (iMade) {
          if (!theirs) right = 'TA 还没做'
          else if (theirs.state === 'done') right = '等你验收'
          else if (theirs.state === 'pass') right = '通过了'
          else right = '让 TA 再来'
        } else if (mine) {
          right = mine.state === 'again' ? '再来一次' : mine.state === 'pass' ? '通过' : '等 TA 验收'
        }
        const open = openId === c.id
        return (
          <div className="cal-cc-i" key={c.id}>
            <button
              className="cal-row cal-cc-h tap"
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? '' : c.id)}
            >
              <Svg name="note" size={14} />
              <span className="t">{c.title}</span>
              <span className="s">{right}</span>
            </button>
            {open && (
              <div className="cal-cc-b">
                {c.body ? <p className="cal-p">{c.body}</p> : null}
                <div className="cal-cc-act">
                  {iMade && theirs && theirs.state === 'done' && (
                    <>
                      <button className="cal-mini" type="button" onClick={() => onJudge(c, 'pass')}>通过</button>
                      <button className="cal-mini ghost" type="button" onClick={() => onJudge(c, 'again')}>再来一次</button>
                    </>
                  )}
                  {!iMade && (!mine || mine.state === 'again') && (
                    <button className="cal-mini" type="button" onClick={() => onDone(c)}>
                      {mine && mine.state === 'again' ? '再做一次' : '做完了'}
                    </button>
                  )}
                  {iMade && !theirs && <span className="cal-cc-wait">TA 做完，这里会写「等你验收」</span>}
                  {!iMade && mine && mine.state === 'done' && <span className="cal-cc-wait">交了，等 TA 验收</span>}
                  {!iMade && mine && mine.state === 'pass' && <span className="cal-cc-wait">这个我给过了</span>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 按住多久算「跳过」：0.6 秒，期间手指一动就取消（那就是在刮） */
const HOLD_MS = 600

/** 刮开：canvas 擦除，抹掉两成就整片淡出；按住 0.6 秒直接看 */
function Scratch({ onDone }) {
  const wrapRef = useRef(null)
  const cvRef = useRef(null)
  const lblRef = useRef(null)
  const st = useRef({ down: false, prev: null, moves: 0, done: false, timer: 0, hold: 0, x0: 0, y0: 0 })

  const paint = useCallback(() => {
    const cv = cvRef.current
    const wrap = wrapRef.current
    if (!cv || !wrap) return
    const r = wrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = Math.max(1, Math.round(r.width * dpr))
    cv.height = Math.max(1, Math.round(r.height * dpr))
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const foil = getComputedStyle(cv).getPropertyValue('--foil').trim() || '#eceef2'
    ctx.fillStyle = foil
    ctx.fillRect(0, 0, r.width, r.height)
    ctx.strokeStyle = 'rgba(128,128,128,.16)'
    ctx.lineWidth = 1
    for (let x = -r.height; x < r.width; x += 8) {
      ctx.beginPath()
      ctx.moveTo(x, r.height)
      ctx.lineTo(x + r.height, 0)
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    paint()
    const s = st.current
    return () => { if (s.timer) clearTimeout(s.timer); if (s.hold) clearTimeout(s.hold) }
  }, [paint])

  const pos = (e) => {
    const r = cvRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const erase = (a, b) => {
    const ctx = cvRef.current.getContext('2d')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = 52
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  /* 手指一动就是「在刮」，不是「按住」 */
  const cancelHold = () => {
    const s = st.current
    if (s.hold) { clearTimeout(s.hold); s.hold = 0 }
    if (wrapRef.current) wrapRef.current.classList.remove('holding')
  }

  const ratio = () => {
    const cv = cvRef.current
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    let hit = 0
    let n = 0
    for (let i = 3; i < data.length; i += 32) {
      n++
      if (data[i] < 40) hit++
    }
    return n ? hit / n : 0
  }

  const check = () => {
    const s = st.current
    if (s.done) return
    const p = ratio()
    if (lblRef.current) lblRef.current.style.opacity = String(Math.max(0, 1 - p * 4))
    if (p > 0.2) {
      s.done = true
      if (wrapRef.current) wrapRef.current.style.opacity = '0'
      s.timer = setTimeout(onDone, 180)
    }
  }

  const down = (e) => {
    if (st.current.done) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 旧浏览器忽略 */ }
    const s = st.current
    const p0 = pos(e)
    s.down = true
    s.prev = p0
    s.x0 = p0.x
    s.y0 = p0.y
    erase(p0, p0)
    if (wrapRef.current) wrapRef.current.classList.add('holding')
    s.hold = setTimeout(() => {
      if (!s.down || s.done) return
      /* 按住不放：直接开，记 method=skip */
      s.done = true
      if (wrapRef.current) wrapRef.current.style.opacity = '0'
      s.timer = setTimeout(() => onDone('skip'), 180)
    }, HOLD_MS)
  }

  const move = (e) => {
    if (!st.current.down || st.current.done) return
    const p = pos(e)
    const dx = p.x - st.current.x0
    const dy = p.y - st.current.y0
    if (dx * dx + dy * dy > 64) cancelHold()
    erase(st.current.prev, p)
    st.current.prev = p
    st.current.moves++
    if (st.current.moves % 4 === 0) check()
  }

  const up = () => {
    if (!st.current.down) return
    cancelHold()
    st.current.down = false
    st.current.prev = null
    check()
  }

  return (
    <div
      className="cal-scratch"
      ref={wrapRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
    >
      <canvas ref={cvRef} />
      <div className="cal-scratch-lbl" ref={lblRef}><b>刮开</b><small>划两下 · 或按住不放</small></div>
    </div>
  )
}

export default function Calendar() {
  const navigate = useNavigate()
  const { me, partner } = useAuth()
  const { items: annivs } = useAnniversaries()
  const { photos } = usePhotos(90)
  const { letters } = useLetters(me && me.id)

  const today = todayKey()
  const [view, setView] = useState(() => {
    const p = parseDay(today)
    return { y: p.y, m: p.m }
  })
  const [sel, setSel] = useState(today)
  const [quest, setQuest] = useState(false)
  const [fs, setFs] = useState(() => {
    try { return normalizeZoom(localStorage.getItem(FS_KEY)) } catch { return 2 }
  })
  const [toast, setToast] = useState('')
  const [coverOpen, setCoverOpen] = useState(false)
  const [coverBig, setCoverBig] = useState(false)
  const fileRef = useRef(null)
  const toastT = useRef(0)
  const { unlocks, loading: unlockLoading, error: unlockErr, mark } = useUnlocks(me && me.id)
  const { cover, loading: coverLoading, give: giveCover, clear: clearCover } = useCover(me && me.id, partner && partner.id)

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 3200)
  }, [])
  useEffect(() => () => clearTimeout(toastT.current), [])

  /* 拆卡记录写库失败：说一句，不拦着他看——卡已经看到了 */
  useEffect(() => {
    if (unlockErr) say('拆卡记录没存上，换设备会丢：' + unlockErr)
  }, [unlockErr, say])

  /* 只有对方那行能写；自己那行点了也不给换 */
  const canGive = Boolean(me && partner && canSetCover(me.id, partner.id, partner.id))
  const coverToday = Boolean(cover && cover.set_at && keyOf(new Date(cover.set_at)) === today)

  const pickCover = () => {
    if (!canGive) { say('还没看到 TA 的账号，等一下再试'); return }
    if (fileRef.current) fileRef.current.click()
  }

  const onCoverFile = async (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''            // 同一张图连选两次也要能触发 change
    if (!f) return
    const r = await giveCover(f)
    say(r.ok ? '换好了，TA 打开日历就能看到' : '版头没换成：' + r.error)
  }

  const dropCover = async () => {
    setCoverOpen(false)
    const r = await clearCover()
    say(r.ok ? '版头撤下了' : '撤不掉：' + r.error)
  }

  const toggleCover = () => {
    if (!cover) { pickCover(); return }
    if (!canGive) { setCoverBig(true); return }   // 没对方账号也能看大图
    setCoverOpen(true)
  }

  const setZoom = (n) => {
    const v = normalizeZoom(n)
    setFs(v)
    try { localStorage.setItem(FS_KEY, String(v)) } catch { /* 隐身模式，这次而已 */ }
  }

  /* 布置卡：表单塞在底部那条 sheet 里，布到当前选中的那天 */
  const [postOpen, setPostOpen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ kind: 'task', title: '', body: '', needCheck: true })
  const { cards, progress, post, markDone, judge } = useCalCards(me && me.id, partner && partner.id)

  const submitCard = async () => {
    setPosting(true)
    const r = await post({ day: sel, ...form })
    setPosting(false)
    if (!r.ok) { say('没布置上：' + r.error); return }
    setPostOpen(false)
    setForm({ kind: 'task', title: '', body: '', needCheck: true })
    say('布置好了，那天到了 TA 才看得到')
  }

  const onDoneCard = async (c) => {
    const r = await markDone(c)
    say(r.ok ? '记下了' : '没记上：' + r.error)
  }

  const onJudgeCard = async (c, state) => {
    const r = await judge(c, state)
    say(r.ok ? (state === 'pass' ? '通过了' : '让它再来一次') : '没记上：' + r.error)
  }

  /* 存成图片：iOS 走分享面板（才进得了相册），别的浏览器退成下载 */
  const [saving, setSaving] = useState(false)
  const onSaveImage = async () => {
    if (saving) return
    setSaving(true)
    try {
      const stamp = `${fmtMD(viewDay)} · 周${WEEKDAY_CN[weekdayOf(viewDay)]}`
      const cv = paintCard(cardData, stamp)
      const r = await saveImage(cv, `日历-${viewDay}.png`)
      if (r.error !== 'cancel') say(r.ok ? '存好了，去相册或下载里找' : '没存成：' + r.error)
    } finally {
      setSaving(false)
    }
  }

  const grid = useMemo(() => monthGrid(view.y, view.m), [view])
  const todayCardData = dailyCard(today)
  const gate = gateFor(today)
  const isOpen = Boolean(unlocks[today])
  /* 卡片跟着选中的日子走：过去的日子翻出来读，未来的日子还是停在今天 */
  const viewDay = sel > today ? today : sel
  const cardData = viewDay === today ? todayCardData : dailyCard(viewDay)
  const cardOpen = viewDay !== today || isOpen
  /* 未来的日子整块不给看：既不露标题，也不露纪念日 / 照片 / 信 */
  const isFuture = sel > today

  /* 能看见的卡：给两个人看的（for_user 空）、给我的、我自己布置的 */
  const myCards = useMemo(() => {
    const mid = me && me.id
    return cards.filter((c) => !c.for_user || c.for_user === mid || c.created_by === mid)
  }, [cards, me])
  const dayCards = myCards.filter((c) => c.day === sel)
  const pendingVerdicts = countPendingVerdicts(cards, progress, me && me.id, today)

  /* 格子上点颜色：故事 / 照片 / 信 / 纪念日 / 布置的卡 */
  const marks = useMemo(() => {
    const map = {}
    const add = (k, kind) => {
      if (!k) return
      if (!map[k]) map[k] = []
      if (!map[k].includes(kind)) map[k].push(kind)
    }
    for (const p of photos) if (p.created_at) add(keyOf(new Date(p.created_at)), 'pic')
    for (const l of letters) if (l.created_at) add(keyOf(new Date(l.created_at)), 'mail')
    for (const a of expandYearly(annivs, view.y)) add(a.date, 'anniv')
    for (const c of myCards) add(c.day, 'card')
    return map
  }, [photos, letters, annivs, view.y, myCards])

  const selAnnivs = useMemo(
    () => expandYearly(annivs, parseDay(sel).y).filter((a) => a.date === sel),
    [annivs, sel],
  )
  const selPics = useMemo(
    () => photos.filter((p) => p.created_at && keyOf(new Date(p.created_at)) === sel),
    [photos, sel],
  )
  const selMails = useMemo(
    () => letters.filter((l) => l.created_at && keyOf(new Date(l.created_at)) === sel),
    [letters, sel],
  )

  const openCard = (method) => mark(today, method || gate)

  const shift = (delta) => {
    const next = addMonth(view.y, view.m, delta)
    setView(next)
    const cur = parseDay(sel)
    if (cur.y !== next.y || cur.m !== next.m) setSel(dayKey(next.y, next.m, 1))
  }

  const dotsFor = (cell) => {
    /* 未来的日子不给内容：只有这天确实有东西（照片/信/纪念日/布置的卡），才留一个空心圈 */
    if (cell.key > today) return (marks[cell.key] || []).length ? ['hollow'] : []
    const list = []
    if (dailyCard(cell.key).kind === 'story') list.push('card')
    for (const k of marks[cell.key] || []) {
      if (list.length < 3 && !list.includes(k)) list.push(k)
    }
    return list.slice(0, 3)
  }

  return (
    <div className="shell">
      <div className="bg">
        <div className="blobs">
          <div className="blob a" /><div className="blob b" /><div className="blob c" />
          <div className="blob d" /><div className="blob e" />
        </div>
        <div className="aurora" />
      </div>

      <main className={`page cal cal-fs${fs}`}>
        <div className="top">
          <div className="col" style={{ gap: 6 }}>
            <div className="date">
              {view.y} 年 {view.m} 月
              <span className="clk">周{WEEKDAY_CN[weekdayOf(today)]}</span>
            </div>
            <h1 className="h-title">这个月</h1>
          </div>
          <button className="glass icon-btn tap" onClick={() => navigate(-1)} aria-label="返回">
            <Svg name="back" size={20} />
          </button>
        </div>

        {/* 今天这张卡：翻到过去某天时它显示那天，不用再拆 */}
        <section className="win">
          <header className="tb">
            <b>{viewDay === today ? '今天.card' : '那天.card'}</b>
            <span className="grow" />
            <span className="mono">{fmtMD(viewDay)} · 周{WEEKDAY_CN[weekdayOf(viewDay)]}</span>
            <span className="cal-fs" role="group" aria-label="正文字号">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`cal-fs-b${fs === n ? ' on' : ''}`}
                  aria-pressed={fs === n}
                  aria-label={`字号${['小', '中', '大'][n - 1]}`}
                  onClick={() => setZoom(n)}
                >
                  {['小', '中', '大'][n - 1]}
                </button>
              ))}
            </span>
          </header>
          <div className="wb" style={{ padding: 12 }}>
            <div className={`cal-hero${cardOpen ? '' : ' locked'}`}>
              <div className="cal-stack" aria-hidden="true"><i /><i /></div>
              <article className="cal-card">
                <div className="cal-card-h">
                  <span>{cardData.kind === 'story' ? '今日故事' : '冷知识'}</span>
                  <span>{viewDay !== today ? '翻出来的' : isOpen ? '已拆' : gate === 'free' ? '直接开' : '刮开'}</span>
                </div>
                <div className="cal-face">
                  {viewDay === today && unlockLoading ? (
                    <div className="cal-empty">正在核对这张卡…</div>
                  ) : (
                    <>
                      {cardOpen || gate !== 'free' ? <StoryBody c={cardData} /> : null}
                      {viewDay === today && !isOpen && gate === 'free' && <Seal date={today} onOpen={openCard} />}
                      {viewDay === today && !isOpen && gate === 'scratch' && <Scratch onDone={openCard} />}
                      {cardOpen && (
                        <div className="cal-card-tools">
                          <button className="cal-back" type="button" onClick={onSaveImage} disabled={saving}>
                            {saving ? '画着…' : '存成图片'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            </div>
          </div>
          <footer className="wf">
            <span>{cardData.kind === 'story' ? '十一月 · 每天一个真事' : '系统自带，每天一条'}</span>
            {viewDay !== today && (
              <button className="cal-back" type="button" onClick={() => setSel(today)}>回到今天</button>
            )}
            <span>{viewDay !== today ? '翻回去读的，不用再拆'
              : isOpen ? '明天换一张'
                : gate === 'free' ? '周末不用过暗号' : '刮开，或者长按跳过'}</span>
          </footer>
        </section>

        {/* 月历：版头是这块板的顶边，跟板同一圈圆角、同一条墨边，中间不留缝 */}
        <section className="cal-sheet">
          <div
            className={`cal-cover${cover ? '' : ' empty'}`}
            role="button"
            tabIndex={0}
            aria-label={cover ? '版头，点开可以换一张' : '点一下，放一张版头'}
            onClick={toggleCover}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCover() }
            }}
          >
            {cover ? <img src={cover.url} alt="" /> : null}
            {!cover && !coverLoading && (
              <div className="cal-cover-hint">点一下，放一张版头<small>TA 打开日历就能看到</small></div>
            )}
            {cover && <span className="cal-cover-act">{canGive ? '换一张' : '看大图'}</span>}
            {cover && coverToday && <span className="cal-cover-chip">TA 今天换的</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onCoverFile} />
          <div className="cal-head">
            <div className="col" style={{ gap: 2 }}>
              <b>{view.m} 月</b>
              <span className="cal-head-meta">{view.y} · {daysInMonth(view.y, view.m)} 天</span>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className="cal-ar" type="button" onClick={() => shift(-1)} aria-label="上个月">‹</button>
              <button className="cal-ar" type="button" onClick={() => shift(1)} aria-label="下个月">›</button>
            </div>
          </div>
          <div className="cal-wk">
            {WEEKDAY_CN.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="cal-g">
            {grid.map((cell) => {
              let cls = 'cal-d'
              if (cell.out) cls += ' out'
              if (cell.key === sel) cls += ' sel'
              if (cell.key === today) cls += ' today'
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={cls}
                  onClick={() => {
                    setSel(cell.key)
                    if (cell.out) setView({ y: cell.y, m: cell.m })
                  }}
                  aria-label={`${cell.m} 月 ${cell.d} 日 周${WEEKDAY_CN[weekdayOf(cell.key)]}`}
                >
                  <span className="cal-n">{cell.d}</span>
                  <span className="cal-mk">
                    {dotsFor(cell).map((k, i) => (
                      <i key={i} className={`cal-dot${DOT_CLASS[k] || ''}${cell.key > today && k !== 'hollow' ? ' faint' : ''}`} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="cal-sheet-foot">
            <span>周日开头</span>
            <span>{grid.length / 7} 周</span>
          </div>
        </section>

        {/* 当天清单 */}
        <section className="win">
          <header className="tb">
            <b>{fmtMD(sel)}.清单</b>
            <span className="grow" />
            <button className="cal-postbtn tap" type="button" onClick={() => setPostOpen(true)}>
              布置一张
              {pendingVerdicts > 0 && <NoticeDot n={pendingVerdicts} />}
            </button>
            <span className="mono">周{WEEKDAY_CN[weekdayOf(sel)]}{sel === today ? ' · 今天' : ''}</span>
          </header>
          <div className="wb">
            {isFuture ? (
              <div className="cal-empty">那天还没到。到了那天，这条才给你看。</div>
            ) : (
              <>
                <div className="cal-row">
                  <Svg name="note" size={14} />
                  <span className="t">{dailyCard(sel).title}</span>
                  <span className="s">{dailyCard(sel).kind === 'story' ? '故事' : '冷知识'}</span>
                </div>
                {dayCards.length > 0 && (
                  <DayCards
                    cards={dayCards}
                    me={me}
                    progress={progress}
                    onDone={onDoneCard}
                    onJudge={onJudgeCard}
                  />
                )}
              </>
            )}

            {sel === today && todayCardData.challenge && (
              <button className="cal-row cal-task tap" type="button" onClick={() => setQuest(true)}>
                <Svg name="note" size={14} />
                <span className="t">今天的任务：{(todayCardData.challenge && todayCardData.challenge.task) || '还没排上'}</span>
                <span className="s">去看看</span>
              </button>
            )}

            {!isFuture && selAnnivs.map((a) => (
              <div className="cal-row" key={a.id}>
                <Svg name="heart" size={14} />
                <span className="t">{a.title}</span>
                <span className="s">{a.repeat_yearly ? '每年' : '纪念日'}</span>
              </div>
            ))}

            {!isFuture && selPics.length > 0 && (
              <div className="cal-row">
                <Svg name="camera" size={14} />
                <span className="t">{selPics.length} 张照片</span>
                <span className="s">{fmtTime(selPics[0].created_at)}</span>
              </div>
            )}
            {!isFuture && selPics.length > 0 && (
              <div className="cal-thumbs">
                {selPics.slice(0, 4).map((p) => <img className="cal-th" src={p.url} alt="" key={p.id} />)}
              </div>
            )}

            {!isFuture && selMails.map((l) => (
              <div className="cal-row" key={l.id}>
                <Svg name="mail" size={14} />
                <span className="t">{l.title || '一封信'}</span>
                <span className="s">{fmtTime(l.created_at)}</span>
              </div>
            ))}

            {!isFuture && selAnnivs.length + selPics.length + selMails.length === 0 && (
              <div className="cal-empty">这天只有上面那一条，没有别的记录</div>
            )}
          </div>
        </section>
      </main>

      {postOpen && (
        <div className="overlay" onClick={() => setPostOpen(false)} role="presentation">
          <div className="sheet cal-form" onClick={(e) => e.stopPropagation()}>
            <div className="cal-form-t">
              给 TA 留一张卡
              <small>{fmtMD(sel)} · 到了那天才给 TA 看</small>
            </div>
            <div className="cal-kinds">
              {[['task', '任务'], ['egg', '彩蛋'], ['quiz', '问答']].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`pill${form.kind === k ? ' on' : ''}`}
                  onClick={() => setForm({ ...form, kind: k })}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="field"
              value={form.title}
              maxLength={60}
              placeholder="一句话：那天要 TA 做什么"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <textarea
              className="field"
              rows={3}
              value={form.body}
              maxLength={500}
              placeholder="想说的话、怎么做（可以空着）"
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            <label className="cal-check">
              <input
                type="checkbox"
                checked={form.needCheck}
                onChange={(e) => setForm({ ...form, needCheck: e.target.checked })}
              />
              <span>做完要我验收</span>
            </label>
            <button className="btn" type="button" disabled={!form.title.trim() || posting} onClick={submitCard}>
              {posting ? '放着…' : '布置'}
            </button>
          </div>
        </div>
      )}

      {coverOpen && (
        <div className="overlay" onClick={() => setCoverOpen(false)} role="presentation">
          <div className="sheet cal-cv-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cal-cv-t">版头 · 我换的只出现在 TA 那边</div>
            <button className="cal-cv-btn" type="button" onClick={() => { setCoverOpen(false); setCoverBig(true) }}>看大图</button>
            <button className="cal-cv-btn" type="button" onClick={() => { setCoverOpen(false); pickCover() }}>换一张</button>
            <button className="cal-cv-btn danger" type="button" onClick={dropCover}>撤下</button>
            <button className="cal-cv-btn ghost" type="button" onClick={() => setCoverOpen(false)}>算了</button>
          </div>
        </div>
      )}

      {coverBig && cover && (
        <div className="cal-cv-big" onClick={() => setCoverBig(false)} role="presentation">
          <img src={cover.url} alt="" />
          <span className="cal-cv-big-hint">点一下关掉</span>
        </div>
      )}

      {quest && <QuestPopup day={today} card={todayCardData} onClose={() => setQuest(false)} />}
      {toast && <div className="toast glass">{toast}</div>}
    </div>
  )
}