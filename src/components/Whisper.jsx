
import { useEffect, useRef, useState } from 'react'
import { Svg } from './Icon'
import { fmtTime } from '../lib/hooks'
const storeKey = (row) => `whisper:${row?.user_id}:${row?.updated_at}`
const readFlag = (k) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const writeFlag = (k) => { try { localStorage.setItem(k, '1') } catch { /* ignore */ } }

/**
 * 第二层·悄悄话。mine=true 时是自己的，直接明文。
 * 注意：这是"仪式感"锁，不是安全边界——内容对方的客户端本来就能拿到。
 * 真正需要保密的内容请走信箱里的时间胶囊（服务端把关）。
 */
export default function Whisper({ row, mine = false }) {
  const key = storeKey(row)
  const [revealed, setRevealed] = useState(() => readFlag(key))
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [pct, setPct] = useState(0)
  const raf = useRef(null)
  const pressing = useRef(false)
  const canvasRef = useRef(null)
  const paintedRef = useRef(false)
  const scratchingRef = useRef(false)
  const lastPtRef = useRef({ x: 0, y: 0 })
  const sampleRef = useRef(0)

  useEffect(() => { setRevealed(readFlag(key)); setPin(''); setWrong(false); paintedRef.current = false }, [key])

  const type = row?.reveal_type
  const cfg = row?.reveal_config || {}
  const unlockAt = cfg.unlockAt ? Date.parse(cfg.unlockAt) : null

  useEffect(() => {
    if (type !== 'timelock') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [type])

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  const reveal = () => { setRevealed(true); writeFlag(key) }
  const timeUnlocked = type === 'timelock' && unlockAt != null && now >= unlockAt
  const visible = mine || revealed || timeUnlocked
  const whisperTime = row?.updated_at && !Number.isNaN(Date.parse(row.updated_at)) ? fmtTime(row.updated_at) : null

  // 真·刮刮乐：在 canvas 上画一层银灰涂层，手指划过用 destination-out 擦掉
  useEffect(() => {
    if (type !== 'scratch' || visible || paintedRef.current) return
    const cv = canvasRef.current
    if (!cv) return
    const wrap = cv.parentElement
    const rect = wrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(rect.width * dpr)
    cv.height = Math.round(rect.height * dpr)
    cv.style.width = `${rect.width}px`
    cv.style.height = `${rect.height}px`
    const ctx = cv.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.globalCompositeOperation = 'source-over'

    const g = ctx.createLinearGradient(0, 0, rect.width, rect.height)
    g.addColorStop(0, '#d9dce3')
    g.addColorStop(0.5, '#eef0f4')
    g.addColorStop(1, '#ccd0d8')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.fillStyle = 'rgba(255,255,255,.5)'
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * rect.width
      const y = Math.random() * rect.height
      const r = Math.random() * 1.4
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(20,20,24,.55)'
    ctx.font = '13px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('用手指刮开', rect.width / 2, rect.height / 2)

    paintedRef.current = true
  }, [visible, type])

  if (!row || !row.secret_text) {
    return <div className="h-sub">{mine ? '你还没写悄悄话，去「状态」页写一条吧' : 'TA 还没留下悄悄话'}</div>
  }

  const ptFromEvent = (cv, e) => {
    const rect = cv.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onScratchDown = (e) => {
    if (visible) return
    const cv = canvasRef.current
    if (!cv) return
    cv.setPointerCapture?.(e.pointerId)
    scratchingRef.current = true
    lastPtRef.current = ptFromEvent(cv, e)
  }

  const onScratchMove = (e) => {
    if (!scratchingRef.current || visible) return
    const cv = canvasRef.current
    if (!cv) return
    const pt = ptFromEvent(cv, e)
    const ctx = cv.getContext('2d')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = 38
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPtRef.current = pt

    sampleRef.current += 1
    if (sampleRef.current % 8 === 0) {
      const dpr = window.devicePixelRatio || 1
      const w = cv.width, h = cv.height
      const data = ctx.getImageData(0, 0, w, h).data
      let clear = 0, total = 0
      const stride = 40 * Math.max(1, Math.round(dpr))
      for (let i = 3; i < data.length; i += stride) {
        total++
        if (data[i] < 128) clear++
      }
      if (total > 0 && clear / total > 0.5) {
        scratchingRef.current = false
        reveal()
        if (navigator.vibrate) navigator.vibrate(15)
      }
    }
  }

  const onScratchUp = () => { scratchingRef.current = false }

  const pressStart = () => {
    if (visible) return
    pressing.current = true
    const start = Date.now()
    const step = () => {
      if (!pressing.current) return
      const p = Math.min(100, ((Date.now() - start) / 3000) * 100)
      setPct(p)
      if (p >= 100) { pressing.current = false; reveal(); return }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }
  const pressEnd = () => {
    pressing.current = false
    if (raf.current) cancelAnimationFrame(raf.current)
    if (!visible) setPct(0)
  }

  const checkPin = () => {
    if (pin === String(cfg.pin ?? '')) reveal()
    else setWrong(true)
  }

  const leftSec = unlockAt ? Math.max(0, Math.ceil((unlockAt - now) / 1000)) : 0
  const leftText = leftSec >= 86400 ? `${Math.floor(leftSec / 86400)} 天后`
    : `${String(Math.floor(leftSec / 3600)).padStart(2, '0')}:${String(Math.floor((leftSec % 3600) / 60)).padStart(2, '0')}:${String(leftSec % 60).padStart(2, '0')}`

  return (
    <div className="col" style={{ gap: 12 }}>
        <div className="whisper">
        <div className="whisper-text" style={{ filter: visible ? 'none' : 'blur(8px)', userSelect: visible ? 'auto' : 'none' }}>
          {row.secret_text}
        </div>
        {type === 'scratch' && (
          <canvas
            ref={canvasRef}
            className={`w-cv${visible ? ' gone' : ''}`}
            onPointerDown={onScratchDown}
            onPointerMove={onScratchMove}
            onPointerUp={onScratchUp}
            onPointerLeave={onScratchUp}
            onPointerCancel={onScratchUp}
          />
        )}
      </div>

      {visible && whisperTime && (
        <div className="whisper-time mono muted">{mine ? '更新于 ' : 'TA 写于 '}{whisperTime}</div>
      )}

      {!visible && type === 'password' && (
        <div className="col" style={{ gap: 8 }}>
          <div className="h-sub">输入你们约定的 4 位数字</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="field" style={{ width: 130, textAlign: 'center', letterSpacing: '0.3em', padding: '10px 12px' }}
              inputMode="numeric" maxLength={4} placeholder="0000" value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setWrong(false) }} />
            <button className="btn" style={{ height: 42 }} onClick={checkPin}>解锁</button>
          </div>
          {wrong && <div className="h-sub">再想想～</div>}
        </div>
      )}

      {!visible && type === 'longpress' && (
        <div className="row" style={{ gap: 12 }}>
          <div className="charge"
            onPointerDown={pressStart} onPointerUp={pressEnd} onPointerLeave={pressEnd} onPointerCancel={pressEnd}
            role="button" aria-label="按住 3 秒解锁">
            <div className="fill" style={{ height: `${pct}%` }} />
            <span style={{ position: 'relative' }}><Svg name="heart" /></span>
          </div>
          <div className="h-sub">按住 3 秒，心率充满才会解开</div>
        </div>
      )}

      {!visible && type === 'timelock' && (
        <div className="h-sub">将在 {leftText} 自动浮现</div>
      )}
    </div>
  )
}
