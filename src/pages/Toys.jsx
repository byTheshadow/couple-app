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
const PixelPals = lazy(() => import('../components/PixelPals'))
const WhackGame = lazy(() => import('../components/WhackGame'))
const BubbleWrap = lazy(() => import('../components/BubbleWrap'))
const MustacheStudio = lazy(() => import('../components/MustacheStudio'))
const JumpGame = lazy(() => import('../components/JumpGame'))

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

function ArtPixel() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <rect x="30" y="6" width="72" height="84" rx="9" style={PAPER} />
      <rect x="38" y="14" width="56" height="38" rx="3" style={{ fill: '#17171c' }} />
      <g stroke="none">
        <rect x="58" y="24" width="16" height="4" style={{ fill: '#fbfbff' }} />
        <rect x="56" y="28" width="20" height="10" style={{ fill: '#fbfbff' }} />
        <rect x="60" y="31" width="3" height="3" style={{ fill: '#17171c' }} />
        <rect x="69" y="31" width="3" height="3" style={{ fill: '#17171c' }} />
        <rect x="60" y="38" width="12" height="8" style={{ fill: '#e5484d' }} />
      </g>
      <path d="M49 66v12M43 72h12" strokeWidth="4" />
      <circle cx="80" cy="76" r="4.5" style={{ fill: '#f2c94c' }} />
      <circle cx="91" cy="69" r="4.5" style={{ fill: '#ef7fb0' }} />
    </svg>
  )
}

// 第 05 格：柜台 + 三个冒出来的坏顾客
function ArtWhack() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <circle cx="36" cy="46" r="11" style={PAPER} />
      <circle cx="67" cy="40" r="12" style={PAPER} />
      <circle cx="98" cy="47" r="10.5" style={PAPER} />
      <path d="M28 39a11 11 0 0 1 16-3" />
      <path d="M58 32a12 12 0 0 1 18-2" />
      <path d="M90 41a10.5 10.5 0 0 1 13-2" />
      <g stroke="none" style={{ fill: 'var(--paperInk)' }}>
        <circle cx="32" cy="46" r="1.7" />
        <circle cx="40" cy="46" r="1.7" />
        <circle cx="62" cy="40" r="1.8" />
        <circle cx="72" cy="40" r="1.8" />
        <circle cx="94" cy="47" r="1.6" />
        <circle cx="102" cy="47" r="1.6" />
      </g>
      <path d="M31 53q4 3 8 0" />
      <path d="M61 47q6 4 11 0" />
      <path d="M93 54q4 2 7 0" />
      <path d="M79 24v7M75.5 27.5h7" />
      <path d="M48 18v6M45 21h6" opacity=".45" />
      <path d="M12 58h108l-4 7H16z" style={PAPER} />
      <path d="M16 65h100l-3 15H19z" style={PAPER} />
      <path d="M40 58v9M84 58v9" opacity=".3" />
    </svg>
  )
}


// 第 06 格：一张泡泡纸，几颗已经捏瘪了
function ArtBubble() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <rect x="16" y="13" width="100" height="70" rx="8" style={PAPER} />
      <g stroke="none" style={{ fill: '#f7f1e5' }}>
        <circle cx="27" cy="26" r="6.2" />
        <circle cx="43" cy="26" r="6.2" />
        <circle cx="59" cy="26" r="6.2" />
        <circle cx="75" cy="26" r="6.2" />
        <circle cx="91" cy="26" r="6.2" />
        <circle cx="107" cy="26" r="6.2" />
        <circle cx="27" cy="44" r="6.2" />
        <circle cx="43" cy="44" r="6.2" />
        <circle cx="59" cy="44" r="6.2" />
        <circle cx="91" cy="44" r="6.2" />
        <circle cx="107" cy="44" r="6.2" />
        <circle cx="27" cy="62" r="6.2" />
        <circle cx="59" cy="62" r="6.2" />
        <circle cx="75" cy="62" r="6.2" />
        <circle cx="107" cy="62" r="6.2" />
      </g>
      <g fill="none" opacity=".42">
        <circle cx="75" cy="44" r="6.2" />
        <circle cx="43" cy="62" r="6.2" />
        <circle cx="91" cy="62" r="6.2" />
      </g>
      <g stroke="none" style={{ fill: '#fff' }} opacity=".9">
        <circle cx="25" cy="24" r="1.6" />
        <circle cx="41" cy="24" r="1.6" />
        <circle cx="57" cy="24" r="1.6" />
        <circle cx="73" cy="24" r="1.6" />
        <circle cx="25" cy="42" r="1.6" />
        <circle cx="57" cy="42" r="1.6" />
        <circle cx="25" cy="60" r="1.6" />
        <circle cx="57" cy="60" r="1.6" />
      </g>
      <path d="M72 42l6 4M73 47l5-3" opacity=".4" />
      <path d="M40 60l6 4M41 65l5-3" opacity=".4" />
      <path d="M88 60l6 4M89 65l5-3" opacity=".4" />
      <path d="M24 78h84" opacity=".22" />
    </svg>
  )
}

// 第 07 格：一张顾客脸，已经贴上两撇胡和一颗痘
function ArtMustache() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <rect x="17" y="8" width="98" height="78" rx="8" style={PAPER} />
      <circle cx="66" cy="44" r="24" style={{ fill: '#f2c7a0' }} />
      <path d="M42 42q1-23 24-23 22 0 24 23" style={{ fill: '#3b2b4a' }} stroke="none" />
      <path d="M45 32q9-9 21-9 13 0 21 9" style={{ fill: '#58416b' }} stroke="none" />
      <circle cx="56" cy="45" r="1.8" style={{ fill: 'var(--paperInk)' }} stroke="none" />
      <circle cx="76" cy="45" r="1.8" style={{ fill: 'var(--paperInk)' }} stroke="none" />
      <path d="M62 49l2 4h4l2-4" opacity=".5" />
      <path d="M47 57q8-8 19-2 10-6 19 2-9 8-19 2-10 6-19-2z" style={{ fill: '#3a2418' }} stroke="none" />
      <path d="M42 63q-7 0-9-8M90 63q7 0 9-8" strokeWidth="2.4" />
      <circle cx="83" cy="53" r="2.6" style={{ fill: '#d9534f' }} stroke="none" />
      <path d="M29 76q37 8 74 0" opacity=".24" />
      <path d="M26 84h80" opacity=".2" />
    </svg>
  )
}

// 第 08 格：一条悬在空中的路，小人正准备往问号平台跳
function ArtJump() {
  return (
    <svg className="il" viewBox="0 0 132 92" {...ART}>
      <rect x="10" y="70" width="44" height="10" rx="2" style={PAPER} />
      <rect x="78" y="52" width="40" height="10" rx="2" style={PAPER} />
      <path d="M50 63q14-28 26-6" strokeDasharray="2 5" opacity=".5" />
      <circle cx="32" cy="48" r="8" style={PAPER} />
      <path d="M24 47q0-9 8-9t8 9" style={{ fill: 'var(--paperInk)' }} stroke="none" />
      <circle cx="29" cy="49" r="1.2" style={{ fill: 'var(--paperInk)' }} stroke="none" />
      <circle cx="35" cy="49" r="1.2" style={{ fill: 'var(--paperInk)' }} stroke="none" />
      <path d="M25 56h14v13H25z" style={PAPER} />
      <path d="M28 69v10M36 69v10" />
      <rect x="86" y="30" width="18" height="18" rx="3" style={{ fill: '#f2c94c' }} />
      <path d="M92 36q3-4 6 0t-3 5v2M95 47v1" strokeWidth="1.8" />
      <path d="M108 24v5M105.5 26.5h5" opacity=".6" />
      <path d="M68 30v4M66 32h4" opacity=".4" />
      <path d="M14 86h104" opacity=".18" />
    </svg>
  )
}

const DRAWERS = [
  { id: 'doodle', no: '01', name: '涂鸦小纸条', cap: '画一张，寄给 TA', go: '拿出来', Art: ArtDoodle, ready: true },
  { id: 'milktea', no: '02', name: '奶茶店', cap: '做一杯，寄张小票给 TA', go: '拿出来', Art: ArtMilkTea, ready: true },
  { id: 'crystal', no: '03', name: '水晶球', cap: '摇一摇，看看今天', go: '拿出来', Art: ArtCrystal, ready: true },
  { id: 'pixel', no: '04', name: '像素小屋', cap: '看看 TA 的小人在干嘛', go: '拿出来', Art: ArtPixel, ready: true },
  { id: 'whack', no: '05', name: '气人顾客', cap: '打一打柜台里的坏顾客', go: '拿出来', Art: ArtWhack, ready: true },
  { id: 'bubble', no: '06', name: '捏泡泡', cap: '一张泡泡纸，划过去一串啵', go: '拿出来', Art: ArtBubble, ready: true },
  { id: 'mustache', no: '07', name: '画小胡子', cap: '给顾客画点奇怪的东西', go: '拿出来', Art: ArtMustache, ready: true },
  { id: 'jump', no: '08', name: '一起跳一跳', cap: '一条路，两个人接力跳', go: '拿出来', Art: ArtJump, ready: true },
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
  const inPixel = sub === 'pixel'
  const inWhack = sub === 'whack'
  const inBubble = sub === 'bubble'
  const inMustache = sub === 'mustache'
  const inJump = sub === 'jump'

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
    else if (d.id === 'pixel') navigate({ pathname: '/toys', search: '?p=pixel' }, { state: { fromHub: true } })
    else if (d.id === 'whack') navigate({ pathname: '/toys', search: '?p=whack' }, { state: { fromHub: true } })
    else if (d.id === 'bubble') navigate({ pathname: '/toys', search: '?p=bubble' }, { state: { fromHub: true } })
    else if (d.id === 'mustache') navigate({ pathname: '/toys', search: '?p=mustache' }, { state: { fromHub: true } })
    else if (d.id === 'jump') navigate({ pathname: '/toys', search: '?p=jump' }, { state: { fromHub: true } })
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
      ) : inPixel ? (
        <Suspense fallback={<div className="page center"><div className="h-sub">正在开机…</div></div>}>
          <PixelPals onExit={exitDoodle} />
        </Suspense>
      ) : inWhack ? (
        <Suspense fallback={<div className="page center"><div className="h-sub">正在摆柜台…</div></div>}>
          <WhackGame onExit={exitDoodle} />
        </Suspense>
      ) : inBubble ? (
        <Suspense fallback={<div className="page center"><div className="h-sub">正在铺泡泡纸…</div></div>}>
          <BubbleWrap onExit={exitDoodle} />
        </Suspense>
      ) : inMustache ? (
        <Suspense fallback={<div className="page center"><div className="h-sub">正在找顾客…</div></div>}>
          <MustacheStudio onExit={exitDoodle} />
        </Suspense>
      ) : inJump ? (
        <Suspense fallback={<div className="page center"><div className="h-sub">正在铺路…</div></div>}>
          <JumpGame onExit={exitDoodle} />
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

      <TabBar hidden={inDoodle || inMilkTea || inCrystal || inPixel || inWhack || inBubble || inMustache || inJump} />
    </div>
  )
}