import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Svg } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { fmtTime, useAnniversaries, useLetters, usePhotos } from '../lib/hooks'
import {
  WEEKDAY_CN, addMonth, dayKey, daysInMonth, expandYearly, fmtMD, gateFor,
  keyOf, monthGrid, pad2, parseDay, todayKey, weekdayOf,
} from '../lib/calendar'
import { dailyCard } from '../lib/stories'
import './calendar.css'

/* 拆没拆记在本机：一个人一台手机，这个状态本来就只跟自己有关。
   以后要跨设备同步，换成 cal_unlocks 表（docs/calendar-schema.sql）。 */
const LS_KEY = 'cal.unlock.v1'

function loadUnlocks() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} }
}

function saveUnlocks(next) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* 隐身模式写不进去，忽略 */ }
}

const DOT_CLASS = { card: '', pic: ' p', mail: ' m', anniv: ' l' }

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
      <button className="cal-main" type="button" onClick={onOpen}>打开</button>
    </div>
  )
}

/** 刮开：canvas 擦除，抹掉四成就整片淡出 */
function Scratch({ onDone }) {
  const wrapRef = useRef(null)
  const cvRef = useRef(null)
  const lblRef = useRef(null)
  const st = useRef({ down: false, prev: null, moves: 0, done: false, timer: 0 })

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
    return () => { if (s.timer) clearTimeout(s.timer) }
  }, [paint])

  const pos = (e) => {
    const r = cvRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const erase = (a, b) => {
    const ctx = cvRef.current.getContext('2d')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = 34
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
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
    if (lblRef.current) lblRef.current.style.opacity = String(Math.max(0, 1 - p * 2.2))
    if (p > 0.42) {
      s.done = true
      if (wrapRef.current) wrapRef.current.style.opacity = '0'
      s.timer = setTimeout(onDone, 180)
    }
  }

  const down = (e) => {
    if (st.current.done) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 旧浏览器忽略 */ }
    st.current.down = true
    st.current.prev = pos(e)
    erase(st.current.prev, st.current.prev)
  }

  const move = (e) => {
    if (!st.current.down || st.current.done) return
    const p = pos(e)
    erase(st.current.prev, p)
    st.current.prev = p
    st.current.moves++
    if (st.current.moves % 8 === 0) check()
  }

  const up = () => {
    if (!st.current.down) return
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
      <div className="cal-scratch-lbl" ref={lblRef}><b>刮开</b><small>划两下就开了</small></div>
    </div>
  )
}

export default function Calendar() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const { items: annivs } = useAnniversaries()
  const { photos } = usePhotos(90)
  const { letters } = useLetters(me && me.id)

  const today = todayKey()
  const [view, setView] = useState(() => {
    const p = parseDay(today)
    return { y: p.y, m: p.m }
  })
  const [sel, setSel] = useState(today)
  const [unlocks, setUnlocks] = useState(loadUnlocks)

  const grid = useMemo(() => monthGrid(view.y, view.m), [view])
  const todayCardData = dailyCard(today)
  const gate = gateFor(today)
  const isOpen = Boolean(unlocks[today])

  /* 格子上点颜色：故事 / 照片 / 信 / 纪念日 */
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
    return map
  }, [photos, letters, annivs, view.y])

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

  const openCard = () => setUnlocks((prev) => {
    const next = { ...prev, [today]: gate }
    saveUnlocks(next)
    return next
  })

  const shift = (delta) => {
    const next = addMonth(view.y, view.m, delta)
    setView(next)
    const cur = parseDay(sel)
    if (cur.y !== next.y || cur.m !== next.m) setSel(dayKey(next.y, next.m, 1))
  }

  const dotsFor = (cell) => {
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

      <main className="page cal">
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

        {/* 今天这张卡 */}
        <section className="win">
          <header className="tb">
            <b>今天.card</b>
            <span className="grow" />
            <span className="mono">{fmtMD(today)} · 周{WEEKDAY_CN[weekdayOf(today)]}</span>
          </header>
          <div className="wb" style={{ padding: 12 }}>
            <div className={`cal-hero${isOpen ? '' : ' locked'}`}>
              <div className="cal-stack" aria-hidden="true"><i /><i /></div>
              <article className="cal-card">
                <div className="cal-card-h">
                  <span>{todayCardData.kind === 'story' ? '今日故事' : '冷知识'}</span>
                  <span>{isOpen ? '已拆' : gate === 'free' ? '直接开' : '刮开'}</span>
                </div>
                <div className="cal-face">
                  {isOpen || gate !== 'free' ? <StoryBody c={todayCardData} /> : null}
                  {!isOpen && gate === 'free' && <Seal date={today} onOpen={openCard} />}
                  {!isOpen && gate === 'scratch' && <Scratch onDone={openCard} />}
                </div>
              </article>
            </div>
          </div>
          <footer className="wf">
            <span>{todayCardData.kind === 'story' ? '十一月 · 每天一个真事' : '系统自带，每天一条'}</span>
            <span>{isOpen ? '明天换一张' : gate === 'free' ? '周末不用过暗号' : '刮开，或者长按跳过'}</span>
          </footer>
        </section>

        {/* 月历 */}
        <section className="cal-sheet">
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
                      <i key={i} className={`cal-dot${DOT_CLASS[k]}${cell.key > today ? ' faint' : ''}`} />
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
            <span className="mono">周{WEEKDAY_CN[weekdayOf(sel)]}{sel === today ? ' · 今天' : ''}</span>
          </header>
          <div className="wb">
            <div className="cal-row">
              <Svg name="note" size={14} />
              <span className="t">{dailyCard(sel).title}</span>
              <span className="s">{dailyCard(sel).kind === 'story' ? '故事' : '冷知识'}</span>
            </div>

            {selAnnivs.map((a) => (
              <div className="cal-row" key={a.id}>
                <Svg name="heart" size={14} />
                <span className="t">{a.title}</span>
                <span className="s">{a.repeat_yearly ? '每年' : '纪念日'}</span>
              </div>
            ))}

            {selPics.length > 0 && (
              <div className="cal-row">
                <Svg name="camera" size={14} />
                <span className="t">{selPics.length} 张照片</span>
                <span className="s">{fmtTime(selPics[0].created_at)}</span>
              </div>
            )}
            {selPics.length > 0 && (
              <div className="cal-thumbs">
                {selPics.slice(0, 4).map((p) => <img className="cal-th" src={p.url} alt="" key={p.id} />)}
              </div>
            )}

            {selMails.map((l) => (
              <div className="cal-row" key={l.id}>
                <Svg name="mail" size={14} />
                <span className="t">{l.title || '一封信'}</span>
                <span className="s">{fmtTime(l.created_at)}</span>
              </div>
            ))}

            {selAnnivs.length + selPics.length + selMails.length === 0 && (
              <div className="cal-empty">这天只有上面那一条，没有别的记录</div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}