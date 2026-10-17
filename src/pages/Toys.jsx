import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/theme'
import { useScrollFx } from '../lib/scrollfx'
import { Svg } from '../components/Icon'
import TabBar from '../components/TabBar'
import DoodlePad, { DOODLE_DRAFT_KEY } from '../components/DoodlePad'
import './toys.css'

// 奶茶店带着 three.js，单独拆成一个懒加载块：不进奶茶店就不会下载它
const MilkTea = lazy(() => import('../components/MilkTea'))
const Crystal = lazy(() => import('../components/Crystal'))

/* ===========================================================================
   小物：一个小抽屉柜。点抽屉前脸拉开，再点里面的东西拿出来。
   每个小物是独立页面，互不影响：
   - /toys            抽屉柜首页
   - /toys?p=doodle   涂鸦小纸条（用查询参数而不是新路由：系统返回键能回到抽屉柜，App.jsx 不用再改）
   以后加新小物：在 DRAWERS 里加一格 + 画一幅小插画，再在 pick() 里接上它的页面。
   =========================================================================== */

const ART = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}
const PAPER = { fill: 'var(--paper)' }

function ArtDoodle() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <rect x="16" y="22" width="62" height="74" rx="3" transform="rotate(-9 47 59)" style={PAPER} />
      <rect x="30" y="14" width="62" height="74" rx="3" transform="rotate(4 61 51)" style={PAPER} />
      <path d="M42 40c6-12 12 8 18-4s12 6 20-2" />
      <path d="M42 56h28" opacity=".35" />
      <path d="M42 66h20" opacity=".35" />
      <g transform="rotate(34 104 46)">
        <rect x="98" y="8" width="13" height="56" rx="2" style={{ fill: '#f2c94c' }} />
        <path d="M98 64h13l-6.5 16z" style={PAPER} />
        <path d="M98 18h13" />
      </g>
    </svg>
  )
}

function ArtMilkTea() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <path d="M41 39H91L85 86Q84.5 90 80 90H52Q47.5 90 47 86Z" style={PAPER} />
      <path d="M43.5 54H88.5L85.2 86Q84.7 89 80 89H52Q47.3 89 46.8 86Z" style={{ fill: 'rgba(240,138,75,.45)' }} stroke="none" />
      <rect x="38" y="30" width="56" height="9" rx="3" style={PAPER} />
      <path d="M44 30Q66 2 88 30" style={PAPER} />
      <path d="M76 3L70 40" strokeWidth="4" />
      <g stroke="none" style={{ fill: 'var(--paperInk)' }}>
        <circle cx="55" cy="81" r="3.8" />
        <circle cx="65" cy="82" r="3.8" />
        <circle cx="75" cy="81" r="3.8" />
        <circle cx="60" cy="75" r="3.8" />
        <circle cx="70" cy="75" r="3.8" />
      </g>
    </svg>
  )
}

function ArtCrystal() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <path d="M36 91L42 70Q66 80 90 70L96 91Z" style={PAPER} />
      <circle cx="66" cy="38" r="31" style={PAPER} />
      <path d="M44 26q5-10 16-13" opacity=".7" />
      <path d="M66 28l3.2 7.8 7.8 3.2-7.8 3.2L66 50l-3.2-7.8L55 39l7.8-3.2z" style={{ fill: '#f2c94c' }} />
      <path d="M83 22v7M79.5 25.5h7" />
    </svg>
  )
}

function ArtStore() {
  const awning = { fill: 'rgba(229,72,77,.85)' }
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <path d="M20 34V92M112 34V92" />
      <rect x="28" y="48" width="26" height="22" rx="2" style={PAPER} />
      <rect x="70" y="48" width="30" height="44" rx="2" style={PAPER} />
      <path d="M74 70h4" />
      <text x="41" y="63" textAnchor="middle" fontSize="10" style={{ fontFamily: 'var(--mono)' }} stroke="none" fill="currentColor">24h</text>
      <path d="M14 30L21 8H111L118 30" style={awning} />
      <path d="M14 30q6.5 9 13 0q6.5 9 13 0q6.5 9 13 0q6.5 9 13 0q6.5 9 13 0q6.5 9 13 0q6.5 9 13 0q6.5 9 13 0" style={awning} />
      <path d="M7 4l-3 8M122 2l-3 8M127 18l-3 8" opacity=".5" />
    </svg>
  )
}

const DRAWERS = [
  { id: 'doodle', no: '01', name: '涂鸦小纸条', cap: '画一张，寄给 TA', go: '拿出来', Art: ArtDoodle, ready: true },
  { id: 'milktea', no: '02', name: '奶茶店', cap: '做一杯，寄张小票给 TA', go: '拿出来', Art: ArtMilkTea, ready: true },
  { id: 'crystal', no: '03', name: '水晶球', cap: '摇一摇，看看今天', go: '拿出来', Art: ArtCrystal, ready: true },
  { id: 'store', no: '04', name: '雨夜便利店', cap: '下着雨，灯还亮着', go: '还没开门', Art: ArtStore, ready: false },
]

// 涂鸦草稿：只要本机存着草稿，抽屉前脸就挂一个「有草稿」
const readDraft = () => {
  try { return !!localStorage.getItem(DOODLE_DRAFT_KEY) } catch { return false }
}

export default function Toys() {
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const sub = new URLSearchParams(location.search).get('p')
  const inDoodle = sub === 'doodle'
   const inMilkTea = sub === 'milktea'
  const inCrystal = sub === 'crystal'

  const [open, setOpen] = useState(null) // 当前拉开的抽屉 id，一次只开一个
  const [touched, setTouched] = useState(false) // 动过抽屉之后，第一格就不再做「提示一下」的小动画
  const [hasDraft, setHasDraft] = useState(readDraft)
  const [toast, setToast] = useState('')
  const toastT = useRef(0)

  useScrollFx()

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2600)
  }, [])

  useEffect(() => () => clearTimeout(toastT.current), [])

  // 每次在抽屉柜和涂鸦页之间切换：回到顶部，并重新看一眼有没有草稿
  useEffect(() => {
    window.scrollTo(0, 0)
    setHasDraft(readDraft())
  }, [sub])

  const toggleDrawer = (id) => {
    const willOpen = open !== id
    setOpen(willOpen ? id : null)
    setTouched(true)
    try { navigator.vibrate?.(willOpen ? [8, 20, 8] : 8) } catch { /* iOS 不支持 */ }
  }

  const pick = (d) => {
    if (!d.ready) { say('这个抽屉还在整理，等等～'); return }
    if (d.id === 'doodle') navigate({ pathname: '/toys', search: '?p=doodle' }, { state: { fromHub: true } })
    else if (d.id === 'milktea') navigate({ pathname: '/toys', search: '?p=milktea' }, { state: { fromHub: true } })
    else if (d.id === 'crystal') navigate({ pathname: '/toys', search: '?p=crystal' }, { state: { fromHub: true } })
  }

  // 离开涂鸦页：如果是从抽屉柜点进来的，就退一步（历史记录里不留重复的一条）；直接打开链接进来的，就换成抽屉柜
  const exitDoodle = useCallback((msg) => {
    if (location.state && location.state.fromHub) navigate(-1)
    else navigate('/toys', { replace: true })
    if (msg) say(msg)
  }, [location.state, navigate, say])

  return (
    <div className="shell">
      <div className="bg">
        <div className="blobs" data-sy>
          <div className="blob a" /><div className="blob b" /><div className="blob c" />
          <div className="blob d" /><div className="blob e" />
        </div>
        <div className="aurora" />
      </div>

      {toast && <div className="toast glass">{toast}</div>}

      {inDoodle ? (
        <DoodlePad onExit={exitDoodle} />
      ) : inMilkTea ? (
        <Suspense fallback={<div className="page center"><div className="h-sub">正在开店…</div></div>}>
          <MilkTea onExit={exitDoodle} />
        </Suspense>
      ) : inCrystal ? (
        <Suspense fallback={<div className="page center"><div className="h-sub">正在擦亮…</div></div>}>
          <Crystal onExit={exitDoodle} incoming={location.state && location.state.crystal} />
        </Suspense>
      ) : (
        <main className="page">
          <div className="top">
            <div className="col" style={{ gap: 6 }}>
              <div className="date">04 小物</div>
              <h1 className="h-title">小物</h1>
            </div>
            <button type="button" className="glass icon-btn tap" onClick={toggle} aria-label="切换明暗主题">
              <Svg name={theme === 'light' ? 'moon' : 'sun'} size={20} />
            </button>
          </div>

          <section className="win">
            <header className="tb">
              <Svg name="drawer" size={14} />
              <b>小物.cab</b>
              <span className="grow" />
              <span className="mono">{DRAWERS.length} 格</span>
              <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
            </header>
            <div className="wb">
              <div className="cab">
                {DRAWERS.map((d, i) => {
                  const isOpen = open === d.id
                  return (
                    <div key={d.id} className={`dw${isOpen ? ' open' : ''}${i === 0 && !touched ? ' hint' : ''}`}>
                      <div className="dw-in">
                        <button
                          type="button"
                          className={`dw-item${d.ready ? '' : ' off'}`}
                          tabIndex={isOpen ? 0 : -1}
                          aria-label={d.ready ? `拿出${d.name}` : `${d.name}，敬请期待`}
                          onClick={() => pick(d)}
                        >
                          <d.Art />
                          <span className="dw-cap">
                            <b>{d.name}</b>
                            <small>{d.cap}</small>
                            <span className={`dw-go${d.ready ? '' : ' off'}`}>{d.go}</span>
                          </span>
                        </button>
                      </div>
                      <button type="button" className="dw-front" aria-expanded={isOpen} onClick={() => toggleDrawer(d.id)}>
                        <span className="dw-plate"><i>{d.no}</i>{d.name}</span>
                        <span className="dw-handle" />
                        {d.id === 'doodle' && hasDraft && <span className="badge">有草稿</span>}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            <footer className="wf"><span>点抽屉拉开，再点里面的东西拿出来</span></footer>
          </section>
        </main>
      )}

      <TabBar hidden={inDoodle || inMilkTea || inCrystal} />
    </div>
  )
}