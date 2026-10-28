/* ===========================================================================
   小物 · 捏泡泡（抽屉第 06 格）
   拟真泡泡纸故意用 DOM + CSS：真圆角 / 内阴影 / 高光，点爆只切一个 class，
   不跑 rAF、不重建列表。一版 6 × 10 = 60 颗，全部爆完 0.5 s 后自动换版。
   计数只在本机：localStorage['bw.total'] / ['bw.day']；音效偏好共用 whack.sfx。
   =========================================================================== */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Svg } from './Icon'
import { createSfx } from './bubble/sfx'
import './bubble.css'

const COLS = 6
const ROWS = 10
const COUNT = COLS * ROWS
const STEP = 8
const AUTO_DELAY = 500
const MAX_STEPS = 240

const pad2 = (n) => String(n).padStart(2, '0')

function localDay() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function readStats() {
  let total = 0
  let today = 0
  try { total = Math.max(0, Number(localStorage.getItem('bw.total')) || 0) } catch (e) { total = 0 }
  try {
    const raw = JSON.parse(localStorage.getItem('bw.day') || 'null')
    if (raw && raw.day === localDay()) today = Math.max(0, Number(raw.n) || 0)
  } catch (e) { today = 0 }
  return { total, today, day: localDay() }
}

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function cellAtPoint(x, y) {
  if (typeof document === 'undefined' || !document.elementFromPoint) return -1
  const el = document.elementFromPoint(x, y)
  if (!el || !el.closest) return -1
  const cell = el.closest('.bw-cell')
  if (!cell) return -1
  const i = Number(cell.dataset.i)
  return Number.isInteger(i) && i >= 0 && i < COUNT ? i : -1
}

export default function BubbleWrap({ onExit }) {
  const [sfx] = useState(() => createSfx())
  const [sfxOn, setSfxOn] = useState(sfx.on)
  const [stats, setStats] = useState(readStats)
  const [cells, setCells] = useState(() => Array(COUNT).fill(false))
  const [board, setBoard] = useState(0)

  const aliveRef = useRef(true)
  const cellsRef = useRef(cells)
  const pressRef = useRef(null)
  const autoRef = useRef(0)
  const vibeRef = useRef([])
  const resetRef = useRef(() => {})
  const popLineRef = useRef(() => {})

  cellsRef.current = cells

  // 计数写回本机；跨天时 readStats 已经把「今天」归零
  useEffect(() => {
    try {
      localStorage.setItem('bw.total', String(stats.total))
      localStorage.setItem('bw.day', JSON.stringify({ day: stats.day, n: stats.today }))
    } catch (e) { /* 无痕模式存不了 */ }
  }, [stats])

  // 页面在后台过了午夜：回来时先把「今天」归零，不用等下一次点击
  useEffect(() => {
    const syncDay = () => {
      const day = localDay()
      setStats((s) => (s.day === day ? s : { total: s.total, today: 0, day }))
    }
    const onVis = () => { if (!document.hidden) syncDay() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', syncDay)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', syncDay)
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    const onMove = (e) => {
      const p = pressRef.current
      if (!p || p.id !== e.pointerId) return
      if (e.cancelable) e.preventDefault()
      popLineRef.current(p.x, p.y, e.clientX, e.clientY)
      p.x = e.clientX
      p.y = e.clientY
    }
    const onEnd = (e) => {
      const p = pressRef.current
      if (p && p.id === e.pointerId) pressRef.current = null
    }
    const onBlur = () => { pressRef.current = null }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    window.addEventListener('blur', onBlur)
    return () => {
      aliveRef.current = false
      pressRef.current = null
      clearTimeout(autoRef.current)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      window.removeEventListener('blur', onBlur)
      sfx.dispose()
    }
  }, [sfx])

  useEffect(() => {
    if (!onExit) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onExit() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const resetBoard = useCallback((withSound) => {
    clearTimeout(autoRef.current)
    if (withSound) sfx.play('reset')
    pressRef.current = null
    const empty = Array(COUNT).fill(false)
    cellsRef.current = empty
    setCells(empty)
    setBoard((b) => b + 1)
  }, [sfx])
  resetRef.current = resetBoard

  const bump = useCallback(() => {
    const t = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const list = vibeRef.current
    list.push(t)
    while (list.length && t - list[0] > 1000) list.shift()
    // 1 秒内超过 20 颗以后，每 4 颗才震一次：省电，也不至于一直嗡嗡
    if (list.length > 20 && list.length % 4 !== 0) return
    try { navigator.vibrate?.(8) } catch (e) { /* iOS 不支持 */ }
  }, [])

  const popAt = useCallback((i) => {
    if (i < 0 || i >= COUNT || cellsRef.current[i]) return
    const next = cellsRef.current.slice()
    next[i] = true
    cellsRef.current = next
    setCells(next)

    sfx.play('pop')
    bump()

    const day = localDay()
    setStats((s) => {
      const today = s.day === day ? s.today : 0
      return { total: s.total + 1, today: today + 1, day }
    })

    if (next.every(Boolean)) {
      clearTimeout(autoRef.current)
      autoRef.current = setTimeout(() => {
        if (aliveRef.current) resetRef.current(true)
      }, AUTO_DELAY)
    }
  }, [bump, sfx])

  const popLine = useCallback((x0, y0, x1, y1) => {
    const dist = Math.hypot(x1 - x0, y1 - y0)
    if (!dist) return
    const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dist / STEP)))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const i = cellAtPoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
      if (i >= 0) popAt(i)
    }
  }, [popAt])

  popLineRef.current = popLine

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (pressRef.current && pressRef.current.id !== e.pointerId) return
    if (e.cancelable) e.preventDefault()
    sfx.unlock()
    pressRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    const i = cellAtPoint(e.clientX, e.clientY)
    if (i >= 0) popAt(i)
  }

  const toggleSfx = () => {
    const next = !sfxOn
    sfx.setOn(next)
    setSfxOn(next)
    if (next) { sfx.unlock(); sfx.play('pop') }
  }

  const all = cells.every(Boolean)

  return (
    <div className="bw-root">
      <div className="bw-ui">
        <header className="bw-top">
          <button type="button" className="bw-icon" onClick={() => onExit && onExit()} aria-label="返回小物">
            <Svg name="back" size={20} />
          </button>
          <div className="bw-title">
            <h1>捏泡泡</h1>
            <span>按住划过去，一串啵</span>
          </div>
          <button
            type="button"
            className={`bw-icon bw-sfx${sfxOn ? '' : ' off'}`}
            onClick={toggleSfx}
            aria-pressed={sfxOn}
            aria-label={sfxOn ? '关掉音效' : '打开音效'}
          >
            {sfxOn ? '🔊' : '🔇'}
          </button>
          <button type="button" className="bw-reset" onClick={() => { sfx.unlock(); resetBoard(true) }}>
            换一版
          </button>
        </header>

        <div
          key={board}
          className="bw-sheet"
          role="group"
          aria-label={`泡泡纸，共 ${COUNT} 颗。按住并划过泡泡可以连续捏破。`}
          onPointerDown={onDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          {cells.map((on, i) => (
            <span key={i} className={`bw-cell${on ? ' on' : ''}`} data-i={i} aria-hidden="true" />
          ))}
        </div>

        <footer className="bw-foot">
          <span className="bw-count" aria-label={`今天 ${stats.today} 颗，一共 ${stats.total} 颗`}>
            今天 <b>{fmt(stats.today)}</b> 颗 · 一共 <b>{fmt(stats.total)}</b> 颗
          </span>
          <span className="bw-note">{all ? '全爆完了，沙——换一版' : '每颗只算一次'}</span>
        </footer>
      </div>
    </div>
  )
}
