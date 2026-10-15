
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

  useEffect(() => { setRevealed(readFlag(key)); setPin(''); setWrong(false) }, [key])

  const type = row?.reveal_type
  const cfg = row?.reveal_config || {}
  const unlockAt = cfg.unlockAt ? Date.parse(cfg.unlockAt) : null

  useEffect(() => {
    if (type !== 'timelock') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [type])

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  if (!row || !row.secret_text) {
    return <div className="h-sub">{mine ? '你还没写悄悄话，去「状态」页写一条吧' : 'TA 还没留下悄悄话'}</div>
  }

  const reveal = () => { setRevealed(true); writeFlag(key) }
  const timeUnlocked = type === 'timelock' && unlockAt != null && now >= unlockAt
  const visible = mine || revealed || timeUnlocked
  const whisperTime = row.updated_at && !Number.isNaN(Date.parse(row.updated_at)) ? fmtTime(row.updated_at) : null

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
      <div className="whisper-text" style={{ filter: visible ? 'none' : 'blur(8px)', userSelect: visible ? 'auto' : 'none' }}>
        {row.secret_text}
      </div>

      {visible && whisperTime && (
        <div className="whisper-time mono muted">{mine ? '更新于 ' : 'TA 写于 '}{whisperTime}</div>
      )}

      {!visible && type === 'scratch' && (
        <button className="btn" style={{ alignSelf: 'flex-start', height: 38, fontSize: 13 }} onClick={reveal}>擦开雾面</button>
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
