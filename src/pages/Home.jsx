import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, greeting, useActivityLog, useLetterArrivals, useLetterStats, useLetters, usePokes, useStatus } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import { useScrollFx } from '../lib/scrollfx'
import { StatusIcon, Svg } from '../components/Icon'
import Whisper from '../components/Whisper'
import { NowPlaying } from '../components/Music'
import LetterModal from '../components/LetterModal'
import LetterComposer from '../components/LetterComposer'
import LetterArrival from '../components/LetterArrival'
import Album from '../components/Album'
import Anniversaries from '../components/Anniversaries'
import TabBar from '../components/TabBar'

// 状态编辑页的路由如果你的 App.jsx 里不是 /status，只改这一行
const EDIT_ROUTE = '/status'

const KIND_ICON = { note: 'mail', doodle: 'pen', capsule: 'clock', burn: 'flame' }
const KIND_LABEL = { note: '普通便签', doodle: '涂鸦', capsule: '时间胶囊', burn: '阅后即焚' }

const isLocked = (l) => l.kind === 'capsule' && l.unlock_at && Date.parse(l.unlock_at) > Date.now()
const daysLeft = (l) => Math.ceil((Date.parse(l.unlock_at) - Date.now()) / 86400000)
const initial = (name) => (name || '?').trim().slice(0, 1).toUpperCase()

// 肢体互动手势：以后要加新的预设互动，在这里加一条就行；想要完全自定义的动作走下面的「自定义」分支
const GESTURES = {
  poke: { verb: '戳一戳', icon: 'heart', sub: '想要抱抱', doneWord: '戳', vibrate: [30, 40, 30] },
  pat: { verb: '拍一拍', icon: 'wave', sub: '摸摸头', doneWord: '拍', vibrate: [20, 20, 20, 20] },
  hug: { verb: '抱一抱', icon: 'hug', sub: '抱紧一点', doneWord: '抱', vibrate: [50, 30, 50, 30, 80] },
  kiss: { verb: '亲一口', icon: 'kiss', sub: '么么哒', doneWord: '亲', vibrate: [25, 25, 25] },
  bonk: { verb: '揍一拳', icon: 'fist', sub: '哼，不理你', doneWord: '揍', vibrate: [60, 20, 60] },
}

// 更新日志里每种动作对应的图标；自定义动作统一用 heart
const ACTIVITY_ICON = { poke: 'heart', pat: 'wave', hug: 'hug', kiss: 'kiss', bonk: 'fist', custom: 'heart', letter_sent: 'mail', letter_received: 'mail' }
const LOG_PAGE = 10
const LOG_MAX = 20

function letterMeta(l) {
  if (isLocked(l)) return `${KIND_LABEL.capsule} · ${daysLeft(l)} 天后开启`
  return `${KIND_LABEL[l.kind]} · ${fmtTime(l.created_at)}`
}

// 用 id 做种子生成稳定的条形码，同一个人永远是同一条
function barcode(seed = '') {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const out = []
  for (let i = 0; i < 34; i++) {
    h = (h * 1664525 + 1013904223) >>> 0
    out.push([1 + ((h >>> 28) % 3), 1 + ((h >>> 24) % 2)])
  }
  return out
}

// 更新日志里一行要显示的文字：按方向（我做的 / TA 做的）换说法，并带上自定义留言
// verb 优先读数据库里存的那一条（自定义动作靠这个字段还原动词），老数据没有这个字段时退回预设表
function activityText(p, myId) {
  if (p.kind === 'letter_sent') return '你寄出了一封信'
  if (p.kind === 'letter_received') return '收到一封信'
  const verb = p.verb || GESTURES[p.kind]?.doneWord || '戳'
  const mine = p.sender_id === myId
  const base = mine ? `你${verb}了 TA` : `TA ${verb}了你`
  return p.message ? `${base}："${p.message}"` : base
}


function Envelope({ l }) {
  const locked = isLocked(l)
  const fresh = l.status === 'sent' && !locked
  return (
    <div className={`env${fresh || locked ? '' : ' read'}`}>
      <div className="env-back" />
      <div className="env-paper"><i /><i /><i /></div>
      <div className="env-front" />
      <div className="env-flap" />
      <div className="seal"><Svg name={KIND_ICON[l.kind]} size={18} /></div>
      {locked && <div className="lockchip">{daysLeft(l)} 天</div>}
    </div>
  )
}

const FOLDERS = [
  { t: 0, fn: '01', ft: '状态' },
  { t: 1, fn: '02', ft: '信箱' },
  { t: 2, fn: '03', ft: '我们' },
]

export default function Home() {
  const { me, partner, signOut, session } = useAuth()
  const { theme, toggle } = useTheme()
  const partnerStatus = useStatus(partner?.id)
  const myStatus = useStatus(me?.id)
  const { letters, reload } = useLetters(me?.id)
  const { items: activityLog } = useActivityLog(me?.id, LOG_MAX)
  const { stats } = useLetterStats(me?.id, partner?.id)
  const [tab, setTab] = useState(0)
    const [openLetter, setOpenLetter] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [counts, setCounts] = useState({})
  const [gestureKind, setGestureKind] = useState('poke')
  const [gestureMsg, setGestureMsg] = useState('')
  const [customVerb, setCustomVerb] = useState('')
  const [hit, setHit] = useState(null)
  const [logExpanded, setLogExpanded] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPwd, setResetPwd] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetErr, setResetErr] = useState('')
  const [flip, setFlip] = useState(false)
  const [deckIdx, setDeckIdx] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [arrivedLetter, setArrivedLetter] = useState(null)
  const [notif, setNotif] = useState(null)
  const statusSeenRef = useRef(null)
  const p3d = useRef(null)
  const deckRef = useRef(null)

  useScrollFx()

  const say = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2600) }, [])

  usePokes(me?.id, (row) => {
    const verb = row?.verb || GESTURES[row?.kind]?.doneWord || '戳'
    try { navigator.vibrate?.(row?.kind === 'pat' ? [20, 20, 20, 20] : [40, 50, 40, 50, 80]) } catch { /* iOS 不支持 */ }
    say(row?.message ? `TA ${verb}了你："${row.message}"` : `TA ${verb}了你`)
  })

  useLetterArrivals(me?.id, (row) => setArrivedLetter(row))

  // TA 更新状态时弹一条横幅；用 ref 记住首次看到的时间，避免刚进页面就误报
  useEffect(() => {
    const seenAt = partnerStatus.row?.updated_at
    if (!seenAt) return
    if (statusSeenRef.current === null) { statusSeenRef.current = seenAt; return }
    if (seenAt !== statusSeenRef.current) {
      statusSeenRef.current = seenAt
      setNotif(`${partner?.display_name || 'TA'} 刚刚更新了状态`)
    }
  }, [partnerStatus.row?.updated_at, partner?.display_name])

  useEffect(() => {
    if (!notif) return
    const t = setTimeout(() => setNotif(null), 6000)
    return () => clearTimeout(t)
  }, [notif])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000)
    return () => clearInterval(t)
  }, [])

  // 自定义动作时没有预设条目，现场拼一个一样形状的对象出来用
  const isCustom = gestureKind === 'custom'
  const activeGesture = isCustom
    ? { verb: customVerb.trim() ? `${customVerb.trim()}一下` : '自定义动作', icon: 'heart', sub: '专属于你们的小动作', doneWord: customVerb.trim() || '互动', vibrate: [30, 30, 30] }
    : GESTURES[gestureKind]

  const sendGesture = async () => {
    if (!partner) return say('还没有另一半的账号')
    const verb = isCustom ? customVerb.trim().slice(0, 8) : GESTURES[gestureKind].doneWord
    if (isCustom && !verb) return say('先给这个动作起个名字')
    const msg = gestureMsg.trim().slice(0, 40)
    const { error } = await supabase.from('pokes').insert({
      sender_id: me.id, receiver_id: partner.id, label: `${verb}了你一下`, kind: gestureKind, verb, message: msg || null,
    })
    if (error) return say(`没${verb}到，再试一次`)
    try { navigator.vibrate?.(activeGesture.vibrate) } catch { /* ignore */ }
    setCounts((c) => ({ ...c, [gestureKind]: (c[gestureKind] || 0) + 1 }))
    say(msg ? `已送达给 TA："${msg}"` : `${verb}到啦，TA 应该感觉到了`)
    setGestureMsg('')
    setHit(gestureKind); setTimeout(() => setHit(null), 650)
  }

  const tapLetter = (l) => {
    if (isLocked(l)) return say(`还没到时间，${new Date(l.unlock_at).toLocaleDateString()} 才能打开`)
    setOpenLetter(l)
  }

  const confirmReset = async () => {
    const pwd = resetPwd.trim()
    if (!pwd || !session?.user?.email) return
    setResetBusy(true); setResetErr('')
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: session.user.email, password: pwd })
    if (authErr) {
      // 之前这里不管什么错误都显示"密码不对"，导致限流/网络问题也被误判成密码错；
      // 现在把 Supabase 返回的真实原因显示出来，方便排查
      setResetErr(authErr.status === 400 ? '密码不对，再试一次' : `验证失败：${authErr.message}`)
      setResetBusy(false); return
    }
    const { error } = await supabase.rpc('reset_all_data')
    if (error) { setResetErr(`重置失败：${error.message}`); setResetBusy(false); return }
    setResetOpen(false); setResetPwd(''); setResetBusy(false)
    say('已全部重置')
    setTimeout(() => window.location.reload(), 900)
  }

  // 工牌：指针移动时 3D 倾斜，离开时回正
  const tilt = (e) => {
    const el = p3d.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`)
    el.classList.add('tilting')
  }
  const untilt = () => {
    const el = p3d.current
    if (!el) return
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--rx', '0deg')
    el.classList.remove('tilting')
  }

  // 信封牌组：按每张牌离中心的距离写 --d / --da，CSS 据此缩放和后仰
  useEffect(() => {
    if (tab !== 1) return
    const el = deckRef.current
    if (!el) return
    let raf = 0
    const run = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      let best = 0
      let bestD = Infinity
      el.querySelectorAll('.dcard').forEach((c, i) => {
        const r = c.getBoundingClientRect()
        const d = (r.left + r.width / 2 - mid) / 262
        c.style.setProperty('--d', d.toFixed(3))
        c.style.setProperty('--da', Math.min(1, Math.abs(d)).toFixed(3))
        if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i }
      })
      setDeckIdx(best)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run) }
    run()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [letters.length, tab])

  const unread = letters.filter((l) => l.status === 'sent' && !isLocked(l)).length
  const s = partnerStatus.row
  const m = myStatus.row
  const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
  const shortDate = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
  const clock = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const tk = `${me?.display_name || ''}  /  ${clock}  /  ${shortDate}  /  ONLINE`
  const slotNo = partner?.slot ? `NO.${partner.slot.replace(/\D/g, '').padStart(2, '0')}` : ''

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
      <LetterArrival letter={arrivedLetter} onDone={() => setArrivedLetter(null)} />

      {/* 滚动后淡入的迷你条：一眼看到 TA 此刻的状态 */}
      <div className="minibar glass" data-sp aria-hidden="true">
        {partner && s ? (
          <>
            <StatusIcon id={s.icon_id} />
            <span className="ellipsis">{s.status_text || '还没设置状态'}</span>
            <span className="dim">{partner.display_name}</span>
          </>
        ) : <span>{greeting()}</span>}
      </div>

      <div className="page">
        {notif && (
          <div className="notif glass">
            <div className="bellc"><Svg name="bell" size={18} /></div>
            <span className="ellipsis">{notif}</span>
            <button className="notif-close tap" onClick={() => setNotif(null)} aria-label="关闭通知">
              <Svg name="x" size={16} stroke={2} />
            </button>
          </div>
        )}

        {/* 头部 */}
        <div className="top hdr" data-sp>
          <div className="col" style={{ gap: 6 }}>
            <div className="date">{date}<span className="clk">{clock}</span></div>
            <h1 className="h-title">{greeting()}，{me?.display_name || ''}</h1>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="glass icon-btn tap" onClick={toggle} aria-label="切换明暗主题">
              <Svg name={theme === 'light' ? 'moon' : 'sun'} size={20} />
            </button>
            <button className="glass icon-btn tap" onClick={signOut} aria-label="退出登录">
              <Svg name="out" size={20} />
            </button>
          </div>
        </div>

        {/* ===== 我的档案窗口：标题栏 + 头像 + 装饰，可编辑 ===== */}
        <section className="win hero rv" data-depth data-cardbg={m?.card_bg || 'none'}>
          <header className="tb">
            <Svg name="doc" size={14} />
            <b>{me?.display_name || '我'}.profile</b>
            <span className="grow" />
            <span className="mono">{clock}</span>
            <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
          </header>
          <div className="wb col" style={{ gap: 14 }}>
            <div className="hero-top">
              <div className="av-wrap" data-deco={m?.decoration_id || 'none'}>
                <i className="av-ring" /><i className="av-ring r2" /><i className="av-ring r3" />
                <span className="d d-polaroid" data-cap={shortDate} />
                <span className="d d-ears"><i /><i /></span>
                <span className="d d-halo" />
                <span className="d d-orbit" />
                <span className="d d-pixel" />
                <div className="av" style={m?.avatar_url ? { backgroundImage: `url(${m.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                  {!m?.avatar_url && initial(me?.display_name)}
                </div>
              </div>
              <div className="hero-info">
                <div className="handle"><b>{me?.display_name || ''}</b>{m?.mood && <span className="mood-badge">{m.mood}</span>}<span className="u" /></div>
                <div className="on-tag"><span className="live" />在线，这张卡只有你能编辑</div>
                <div className="mychip">
                  <StatusIcon id={m?.icon_id} />
                  <span className="ellipsis">{m?.status_text || '还没设置状态'}</span>
                </div>
                <Link className="mini tap" to={EDIT_ROUTE}>编辑状态<Svg name="arrow" size={14} stroke={2} /></Link>
              </div>
            </div>
            <NowPlaying row={m} label="我在听" />
            {m?.secret_text && (
              <div className="about">
                <div className="row muted" style={{ gap: 6, fontSize: 12 }}><Svg name="lock" size={13} stroke={1.8} /><span>我的悄悄话，你自己看到的是明文</span></div>
                <Whisper row={m} mine />
              </div>
            )}
            <div className="ticker"><div className="tk">
              {[0, 1].map((i) => <span key={i}>{Array(6).fill(tk).join('   ·   ')}</span>)}
            </div></div>
          </div>
        </section>

        {/* ===== 文件夹导航：状态 / 信箱 / 我们 ===== */}
        <nav className="folders rv" aria-label="主页分区">
          {FOLDERS.map((f) => (
            <button key={f.t} type="button" className={`folder${tab === f.t ? ' on' : ''}`} onClick={() => setTab(f.t)}>
              <i className="fl-back" /><i className="fl-paper" /><i className="fl-front" />
              <span className="fn">{f.fn}</span>
              <span className="ft">
                {f.ft}
                {f.t === 1 && unread > 0 && <span className="badge" style={{ marginLeft: 5 }}>{unread}</span>}
              </span>
            </button>
          ))}
        </nav>

        {/* ===== 01 状态：TA 的工牌 + 此刻 + 悄悄话 ===== */}
        {tab === 0 && (
          <section className="panel in">
            {!partner ? (
              <div className="glass h-sub" style={{ borderRadius: 24, padding: 18 }}>另一半的账号还没创建，创建后这里会实时显示 TA 的状态。</div>
            ) : (
              <>
                <div className="badge-wrap">
                  <div className="swing">
                    <div className="strap" /><div className="clip" />
                    <div className="pass">
                      <div className="p3d" ref={p3d} style={{ '--fl': flip ? '180deg' : '0deg' }}
                        onPointerMove={tilt} onPointerLeave={untilt} onPointerCancel={untilt} onClick={() => setFlip((f) => !f)}>
                        <div className="face front" data-cardbg={s?.card_bg || 'none'}>
                          <div className="band"><span>TA</span><i className="hole" /><span className="mono">{slotNo}</span></div>
                          <div className="pbody">
                            {/* 头像装饰和首页「我的卡」共用同一套 [data-deco] 样式，TA 换了装饰这里会同步显示 */}
                            <div className="pic-wrap" data-deco={s?.decoration_id || 'none'}>
                              <i className="av-ring" /><i className="av-ring r2" /><i className="av-ring r3" />
                              <span className="d d-polaroid" data-cap={shortDate} />
                              <span className="d d-ears"><i /><i /></span>
                              <span className="d d-halo" />
                              <span className="d d-orbit" />
                              <span className="d d-pixel" />
                              <div className="pic" style={s?.avatar_url ? { backgroundImage: `url(${s.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                                {!s?.avatar_url && initial(partner.display_name)}
                              </div>
                            </div>
                            <div className="pf">
                              <div className="fld">
                                <small>姓名</small>
                                <div className="nm-row">
                                  <span className="nm ellipsis">{partner.display_name}</span>
                                  {s?.mood && <span className="mood-badge">{s.mood}</span>}
                                </div>
                              </div>
                              <div className="fld"><small>此刻</small>
                                <div className="nowchip"><StatusIcon id={s?.icon_id} /><b>{s?.status_text || '还没设置状态'}</b></div>
                              </div>
                            </div>
                            <div className="stamp">LIVE</div>
                          </div>
                          <div className="pfoot">
                            <div className="bars">{barcode(partner.id).map(([w, g], i) => <i key={i} style={{ width: w, marginRight: g }} />)}</div>
                            <div className="holo" />
                          </div>
                          <div className="sheen" />
                        </div>
                        <div className="face back">
                          <div className="mag" />
                          <div className="bk">
                            <h4>最近一次更新</h4>
                            <div className="big">{s?.updated_at ? fmtTime(s.updated_at) : '暂无记录'}</div>
                            <div className="fine">TA 改状态时，这张工牌会实时刷新。<br />再点一下翻回正面。</div>
                          </div>
                          <div className="sheen" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 此刻.txt 已经去掉了：状态文字 + 心情已经在上面工牌里了，没必要重复一遍 */}
                <NowPlaying row={s} />

                <div className="win">
                  <header className="tb"><Svg name="lock" size={13} stroke={1.8} /><b>悄悄话.lock</b><span className="grow" /></header>
                  <div className="wb"><Whisper row={s} /></div>
                  <footer className="wf"><span>TA 的悄悄话，解锁后才能看到</span></footer>
                </div>
              </>
            )}
          </section>
        )}

        {/* ===== 02 信箱：横向信封牌组 ===== */}
        {tab === 1 && (
          <section className="panel in">
            <div className="win">
              <header className="tb"><Svg name="mail" size={14} /><b>收件箱.mail</b><span className="grow" />
                <button type="button" className="tb-btn tap" onClick={() => (partner ? setComposeOpen(true) : say('还没有另一半的账号'))}><Svg name="pen" size={12} stroke={2} />写信</button>
                <span className="mono">{letters.length} 封</span></header>
              {stats && (
                <div className="cells">
                  <span className="muted">已读 {stats.read} · 未读 {stats.unread}</span>
                  <span className="muted">你寄 {stats.mine} 封 · TA 寄 {stats.partner} 封</span>
                </div>
              )}
              {letters.length === 0 ? (
                <div className="wb mb-empty rv" data-depth style={{ margin: 0 }}>
                  <svg className="mb-empty-env" width="112" height="78" viewBox="0 0 112 78" fill="none" aria-hidden="true">
                    <rect x="3" y="3" width="106" height="72" rx="13" stroke="currentColor" strokeWidth="2" strokeDasharray="6 7" />
                    <path d="M8 13 L56 47 L104 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="h-sub">邮筒还是空的，等 TA 的第一封信</div>
                  <div className="mb-empty-dots"><i /><i /><i /></div>
                </div>
              ) : (
                <>
                  <div className="deck" ref={deckRef}>
                    {letters.map((l) => (
                      <button key={l.id} className="dcard tap" onClick={() => tapLetter(l)}>
                        <Envelope l={l} />
                        <div className="dmeta">
                          <div className="t">
                            {l.status === 'sent' && !isLocked(l) && <span className="udot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)' }} />}
                            <span className="ellipsis" style={{ maxWidth: 200 }}>{l.title || '一封信'}</span>
                          </div>
                          <div className="s">{letterMeta(l)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="deck-foot">{deckIdx + 1} / {letters.length}</div>
                </>
              )}
              <footer className="wf"><span>左右滑动翻看，点信封拆开</span><span>{unread > 0 ? `${unread} 封未读` : '全部已读'}</span></footer>
            </div>
          </section>
        )}

        {/* ===== 03 我们：纪念日 + 相册 + 戳一戳 + 更新日志 ===== */}
        {tab === 2 && (
          <section className="panel in">
            <Anniversaries />
            <Album />

            <div className="win">
              <header className="tb"><Svg name="doc" size={14} /><b>戳一戳.cmd</b><span className="grow" /></header>
              <div className="wb col" style={{ gap: 12 }}>
                <div className="gesture-pick">
                  {Object.entries(GESTURES).map(([kind, g]) => (
                    <button key={kind} type="button" className={`pill${gestureKind === kind ? ' on' : ''}`} onClick={() => setGestureKind(kind)}>
                      <Svg name={g.icon} size={14} />{g.verb}
                    </button>
                  ))}
                  <button type="button" className={`pill${isCustom ? ' on' : ''}`} onClick={() => setGestureKind('custom')}>
                    <Svg name="plus" size={14} />自定义
                  </button>
                </div>
                {isCustom && (
                  <input
                    className="field" maxLength={8} placeholder="给这个动作起个名字，比如「揉」「捏脸」"
                    value={customVerb} onChange={(e) => setCustomVerb(e.target.value)}
                  />
                )}
                <input
                  className="field" maxLength={40} placeholder="想对 TA 说句话（可选）"
                  value={gestureMsg} onChange={(e) => setGestureMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendGesture() }}
                />
                <div className="poke-circle-wrap">
                  <button type="button" className={`poke-circle tap${hit === gestureKind ? ' fire' : ''}`} onClick={sendGesture} aria-label={activeGesture.verb}>
                    <Svg name={activeGesture.icon} size={28} />
                    <i className="rp" /><i className="rp two" />
                  </button>
                  <div className="col" style={{ gap: 4 }}>
                    <b style={{ fontSize: 15 }}>
                      {counts[gestureKind] > 0 ? `已${activeGesture.doneWord} TA ${counts[gestureKind]} 次` : `${activeGesture.verb} TA`}
                    </b>
                    <span className="h-sub">{activeGesture.sub}</span>
                  </div>
                </div>
              </div>
              <footer className="wf"><span>实时送达</span><span>{partner ? '对方已连接' : '还没有另一半的账号'}</span></footer>
            </div>

            <div className="win">
              <header className="tb"><Svg name="doc" size={14} /><b>更新日志.txt</b><span className="grow" /><span className="mono">{activityLog.length}</span></header>
              {activityLog.length === 0 ? (
                <div className="wb h-sub">还没有记录，戳一戳、拍一拍或寄信之后会出现在这里</div>
              ) : (
                <div className="actlog">
                  {activityLog.slice(0, logExpanded ? LOG_MAX : LOG_PAGE).map((p) => {
                    const mine = p.sender_id === me?.id
                    return (
                      <div key={p.id} className={`act-row${mine ? ' mine' : ''}`}>
                        <div className="act-ic"><Svg name={ACTIVITY_ICON[p.kind] || 'heart'} size={13} /></div>
                        <div className="act-bubble">
                          <span className="act-text">{activityText(p, me?.id)}</span>
                          <span className="act-time">{fmtTime(p.created_at)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <footer className="wf">
                {activityLog.length > LOG_PAGE ? (
                  <button className="mini tap" onClick={() => setLogExpanded((v) => !v)}>
                    {logExpanded ? '收起' : `查看更多（还有 ${Math.min(activityLog.length, LOG_MAX) - LOG_PAGE} 条）`}
                  </button>
                ) : <span />}
                <button className="mini tap" style={{ color: '#e5484d' }} onClick={() => setResetOpen(true)}>
                  <Svg name="flame" size={13} stroke={1.8} />全部重置
                </button>
              </footer>
            </div>
          </section>
        )}
      </div>

      <TabBar />
      {openLetter && <LetterModal letter={openLetter} onClose={() => setOpenLetter(null)} onChanged={reload} />}
      {composeOpen && <LetterComposer onClose={() => setComposeOpen(false)} onSent={() => say('信已寄出，TA 会收到一个信封')} />}
      {resetOpen && (
        <div className="overlay" onClick={() => !resetBusy && setResetOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ fontSize: 18, fontWeight: 650 }}>全部重置</div>
            <div className="h-sub">这会清空所有信件、纪念日、更新日志，并把状态卡恢复成默认样式。此操作无法撤销。</div>
            <input
              type="password"
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              placeholder="输入你的登录密码确认"
              autoFocus
              style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--chip)', padding: '0 14px', fontSize: 15, color: 'var(--ink)' }}
            />
            {resetErr && <div className="h-sub" style={{ color: '#e5484d' }}>{resetErr}</div>}
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setResetOpen(false)} disabled={resetBusy}>取消</button>
              <button className="btn" onClick={confirmReset} disabled={resetBusy || !resetPwd}>
                {resetBusy ? '重置中…' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}