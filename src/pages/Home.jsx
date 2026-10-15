import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, greeting, useLetters, usePokes, useStatus } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import { useScrollFx } from '../lib/scrollfx'
import { StatusIcon, Svg } from '../components/Icon'
import Whisper from '../components/Whisper'
import LetterModal from '../components/LetterModal'
import TabBar from '../components/TabBar'

// 状态编辑页的路由；如果你的 App.jsx 里不是 /status，只改这一行
const EDIT_ROUTE = '/status'

const KIND_ICON = { note: 'mail', doodle: 'pen', capsule: 'clock', burn: 'flame' }
const KIND_LABEL = { note: '普通便签', doodle: '涂鸦', capsule: '时间胶囊', burn: '阅后即焚' }

const isLocked = (l) => l.kind === 'capsule' && l.unlock_at && Date.parse(l.unlock_at) > Date.now()
const daysLeft = (l) => Math.ceil((Date.parse(l.unlock_at) - Date.now()) / 86400000)
const initial = (name) => (name || '?').trim().slice(0, 1).toUpperCase()

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

export default function Home() {
  const { me, partner, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const partnerStatus = useStatus(partner?.id)
  const myStatus = useStatus(me?.id)
  const { letters, reload } = useLetters(me?.id)
  const [openLetter, setOpenLetter] = useState(null)
  const [toast, setToast] = useState('')
  const [pokes, setPokes] = useState(0)
  const [hit, setHit] = useState(false)
  const [flip, setFlip] = useState(false)
  const [deckIdx, setDeckIdx] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const p3d = useRef(null)
  const deckRef = useRef(null)

  useScrollFx()

  const say = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2600) }, [])

  usePokes(me?.id, () => {
    try { navigator.vibrate?.([40, 50, 40, 50, 80]) } catch { /* iOS 不支持 */ }
    say('TA 戳了你一下')
  })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000)
    return () => clearInterval(t)
  }, [])

  const poke = async () => {
    if (!partner) return say('还没有另一半的账号')
    const { error } = await supabase.from('pokes').insert({ sender_id: me.id, receiver_id: partner.id, label: '戳了你一下' })
    if (error) return say('没戳到，再试一次')
    try { navigator.vibrate?.([30, 40, 30]) } catch { /* ignore */ }
    setPokes((n) => n + 1)
    setHit(true); setTimeout(() => setHit(false), 650)
  }

  const tapLetter = (l) => {
    if (isLocked(l)) return say(`还没到时间，${new Date(l.unlock_at).toLocaleDateString()} 才能打开`)
    setOpenLetter(l)
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
  }, [letters.length])

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

        {/* ===== 我的卡：毛玻璃 + 圆形头像 + 装饰，可编辑 ===== */}
        <section className="hero glass rv" data-depth>
          <div className="who">我</div>
          <div className="hero-top">
            <div className="av-wrap" data-deco={m?.decoration_id || 'none'}>
              <i className="av-ring" /><i className="av-ring r2" /><i className="av-ring r3" />
              <span className="d d-polaroid" data-cap={shortDate} />
              <span className="d d-ears"><i /><i /></span>
              <span className="d d-halo" />
              <span className="d d-orbit" />
              <span className="d d-pixel" />
              <div className="av">{initial(me?.display_name)}</div>
            </div>
            <div className="hero-info">
              <div className="handle"><b>{me?.display_name || ''}</b><span className="u" /></div>
              <div className="on-tag"><span className="live" />在线，这张卡只有你能编辑</div>
              <div className="mychip">
                <StatusIcon id={m?.icon_id} />
                <span className="ellipsis">{m?.status_text || '还没设置状态'}</span>
              </div>
              <Link className="mini tap" to={EDIT_ROUTE}>编辑状态<Svg name="arrow" size={14} stroke={2} /></Link>
            </div>
          </div>
          {m?.secret_text && (
            <div className="about">
              <div className="row muted" style={{ gap: 6, fontSize: 12 }}><Svg name="lock" size={13} stroke={1.8} /><span>我的悄悄话，你自己看到的是明文</span></div>
              <Whisper row={m} mine />
            </div>
          )}
          <div className="ticker"><div className="tk">
            {[0, 1].map((i) => <span key={i}>{Array(6).fill(tk).join('   ·   ')}</span>)}
          </div></div>
        </section>

        {/* ===== TA 的卡：挂绳工牌，3D 倾斜，点一下翻面；只读 ===== */}
        <section className="col rv" style={{ gap: 10, '--rd': '.05s' }}>
          <div className="sect"><b>TA 此刻</b><span className="mono">{slotNo}</span></div>
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
                      <div className="face front">
                        <div className="band"><span>TA</span><i className="hole" /><span className="mono">{slotNo}</span></div>
                        <div className="pbody">
                          <div className="pic">{initial(partner.display_name)}</div>
                          <div className="pf">
                            <div className="fld"><small>姓名</small><div className="nm ellipsis">{partner.display_name}</div></div>
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

              <div className="whisper-card glass" data-depth>
                <div className="row muted" style={{ gap: 6, fontSize: 12 }}><Svg name="lock" size={13} stroke={1.8} /><span>TA 的悄悄话</span></div>
                <Whisper row={s} />
              </div>
            </>
          )}
        </section>

        {/* 戳一戳 */}
        <button className={`glass poke tap rv${hit ? ' hit' : ''}`} data-depth onClick={poke} style={{ '--rd': '.05s' }}>
          <span className="row" style={{ gap: 12, fontSize: 15, fontWeight: 500 }}>
            <Svg name="heart" />{pokes > 0 ? `已戳 TA ${pokes} 次` : '戳一戳 TA'}
          </span>
          <span className="h-sub">想要抱抱</span>
        </button>

        {/* 收到的信：横向信封牌组 */}
        <section className="col rv" style={{ gap: 4 }}>
          <div className="sect">
            <b>收到的信</b>
            <span className="badge">{unread > 0 ? `${unread} 封未读` : '全部已读'}</span>
          </div>
          {letters.length === 0 ? (
            <div className="glass h-sub" style={{ borderRadius: 24, padding: 18, textAlign: 'center', marginTop: 8 }}>邮筒还是空的，等 TA 的第一封信</div>
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
        </section>
      </div>

      <TabBar />
      {openLetter && <LetterModal letter={openLetter} onClose={() => setOpenLetter(null)} onChanged={reload} />}
    </div>
  )
}