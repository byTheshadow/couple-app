import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import './splash.css'

/* ===========================================================================
   开屏页：每次打开 App 出现一次（整页刷新才会重置，页面之间切换不会再出现）。
   - 至少停留 MIN_MS，让呼吸感能被看到；登录状态也准备好了才会离开
   - 进度条：慢慢爬到 90%，都准备好之后冲到 100%，然后「走进光里」淡出
   - 点一下屏幕可以跳过
   - 系统开了「减少动态效果」：只停 1.2 秒，没有呼吸和颗粒抖动
   想关掉开屏页：在 App.jsx 里删掉 <Splash /> 那一行就行，别的地方不受影响。
   =========================================================================== */

let shown = false // 模块级变量：整页刷新才会重置

const MIN_MS = 2600
const MAX_MS = 12000 // 登录状态一直没回来时的兜底：到点也放行
const LEAVE_SLOW = 1700
const LEAVE_FAST = 700
const pad = (n) => String(n).padStart(2, '0')

// 日出小图标：一条地平线 + 9 道光
function Rays() {
  const lines = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI * (i / 8)
    const r1 = i % 2 ? 24 : 20
    const r2 = i % 2 ? 36 : 42
    const c = Math.cos(a)
    const s = Math.sin(a)
    return { x1: 45 - c * r1, y1: 44 - s * r1, x2: 45 - c * r2, y2: 44 - s * r2 }
  })
  return (
    <svg className="sp-rays" viewBox="0 0 90 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {lines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
      <path d="M12 46h66" />
    </svg>
  )
}

export default function Splash() {
  const { loading } = useAuth()
  const [on, setOn] = useState(() => {
    if (shown) return false
    shown = true
    return true
  })
  const [leaving, setLeaving] = useState(false) // false | 'slow' | 'fast'
  const [minDone, setMinDone] = useState(false)
  const [p, setP] = useState(0)
  const [now] = useState(() => new Date())
  const reduced = useRef(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  // 最短停留 + 兜底
  useEffect(() => {
    if (!on) return undefined
    const t1 = setTimeout(() => setMinDone(true), reduced.current ? 1200 : MIN_MS)
    const t2 = setTimeout(() => setLeaving((v) => v || 'slow'), MAX_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [on])

  const ready = minDone && !loading

  // 进度：慢慢爬到 90%，准备好之后冲到 100%
  useEffect(() => {
    if (!on || leaving) return undefined
    const t = setInterval(() => {
      setP((v) => {
        const next = v + ((ready ? 100 : 90) - v) * (ready ? 0.22 : 0.045)
        return ready && next > 99.2 ? 100 : next
      })
    }, 50)
    return () => clearInterval(t)
  }, [on, leaving, ready])

  useEffect(() => {
    if (on && !leaving && ready && p >= 100) setLeaving('slow')
  }, [on, leaving, ready, p])

  // 淡出结束后卸载
  useEffect(() => {
    if (!leaving) return undefined
    const t = setTimeout(() => setOn(false), leaving === 'fast' ? LEAVE_FAST : LEAVE_SLOW)
    return () => clearTimeout(t)
  }, [leaving])

  if (!on) return null

  const h = now.getHours()
  const h12 = ((h + 11) % 12) + 1
  const ampm = h >= 12 ? 'pm' : 'am'
  const date = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`

  return (
    <div
      className={`sp-root${leaving ? ` leaving ${leaving === 'fast' ? 'fast' : ''}` : ''}`}
      onClick={() => setLeaving((v) => v || 'fast')}
      role="presentation"
    >
      <div className="sp-glow-wrap"><div className="sp-glow" /></div>
      <div className="sp-b a" />
      <div className="sp-b b" />
      <div className="sp-grain" />

      <div className="sp-fg">
        <div className="sp-dots" aria-hidden="true"><i /><i /><i /></div>

        <section className="sp-panel" aria-label="加载中">
          <div className="sp-row sp-in" style={{ '--d': '.4s' }}>
            <div className="sp-lab">ENTERING US <span className="d3"><i /><i /><i /></span></div>
            <div className="sp-lab dim">{date}</div>
          </div>
          <div className="sp-sub sp-in" style={{ '--d': '.5s' }}>A QUIET PLACE FOR TWO</div>

          <div className="sp-time-row sp-in" style={{ '--d': '.65s' }}>
            <div className="sp-time">{h12}:{pad(now.getMinutes())}<small>{ampm}</small></div>
            <Rays />
          </div>

          <div className="sp-lab sp-in" style={{ '--d': '.85s' }}>% LOADING</div>
          <div className="sp-bar sp-in" style={{ '--d': '.95s' }}>
            <i className="sp-fill" style={{ width: `${p}%` }} />
            <span className="sp-num">{Math.round(p)}<small>%</small></span>
          </div>
        </section>
      </div>
    </div>
  )
}