import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, greeting, useLetters, usePokes, useStatus } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import { StatusIcon, Svg } from '../components/Icon'
import Whisper from '../components/Whisper'
import LetterModal from '../components/LetterModal'
import TabBar from '../components/TabBar'

const KIND_ICON = { note: 'mail', doodle: 'pen', capsule: 'clock', burn: 'flame' }
const KIND_LABEL = { note: '普通便签', doodle: '涂鸦', capsule: '时间胶囊', burn: '阅后即焚' }

function letterMeta(l) {
  if (l.kind === 'capsule' && l.unlock_at && Date.parse(l.unlock_at) > Date.now()) {
    const days = Math.ceil((Date.parse(l.unlock_at) - Date.now()) / 86400000)
    return `${KIND_LABEL.capsule} · ${days} 天后开启`
  }
  return `${KIND_LABEL[l.kind]} · ${fmtTime(l.created_at)}`
}

export default function Home() {
  const { me, partner, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const partnerStatus = useStatus(partner?.id)
  const { letters, reload } = useLetters(me?.id)
  const [openLetter, setOpenLetter] = useState(null)
  const [toast, setToast] = useState('')
  const [pokes, setPokes] = useState(0)

  const say = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2600) }, [])

  usePokes(me?.id, () => {
    try { navigator.vibrate?.([40, 50, 40, 50, 80]) } catch { /* iOS 不支持 */ }
    say('TA 戳了你一下')
  })

  const poke = async () => {
    if (!partner) return say('还没有另一半的账号')
    const { error } = await supabase.from('pokes').insert({ sender_id: me.id, receiver_id: partner.id, label: '戳了你一下' })
    if (error) return say('没戳到，再试一次')
    try { navigator.vibrate?.([30, 40, 30]) } catch { /* ignore */ }
    setPokes((n) => n + 1)
  }

  const tapLetter = (l) => {
    const locked = l.kind === 'capsule' && l.unlock_at && Date.parse(l.unlock_at) > Date.now()
    if (locked) return say(`还没到时间，${new Date(l.unlock_at).toLocaleDateString()} 才能打开`)
    setOpenLetter(l)
  }

  const unread = letters.filter((l) => l.status === 'sent' && !(l.kind === 'capsule' && l.unlock_at && Date.parse(l.unlock_at) > Date.now())).length
  const s = partnerStatus.row
  const date = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="shell">
      <div className="blob a" /><div className="blob b" /><div className="blob c" />
      {toast && <div className="toast glass">{toast}</div>}

      <div className="page">
        {/* 头部 */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 6px' }}>
          <div className="col" style={{ gap: 4 }}>
            <div className="h-sub">{date}</div>
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

        {/* TA 的状态 */}
        <div className="glass col" style={{ borderRadius: 28, padding: 18, gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="label" style={{ padding: 0 }}>{partner ? `${partner.display_name} 的状态` : 'TA 的状态'}</div>
          </div>
          {!partner ? (
            <div className="h-sub">另一半的账号还没创建，创建后这里会实时显示 TA 的状态。</div>
          ) : (
            <>
              <div className="row" style={{ gap: 14 }}>
                <div className="icon-tile"><StatusIcon id={s?.icon_id} /></div>
                <div className="col" style={{ gap: 3, minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em' }}>
                    {s?.status_text || '还没设置状态'}
                  </div>
                </div>
              </div>
              <div className="divider" />
              <div className="col" style={{ gap: 8 }}>
                <div className="row muted" style={{ gap: 6, fontSize: 12 }}><Svg name="lock" size={13} stroke={1.8} /><span>悄悄话</span></div>
                <Whisper row={s} />
              </div>
            </>
          )}
        </div>

        {/* 戳一戳 */}
        <button className="glass tap row" onClick={poke}
          style={{ borderRadius: 22, padding: '14px 18px', justifyContent: 'space-between', width: '100%', border: '1px solid var(--gb)' }}>
          <span className="row" style={{ gap: 12, fontSize: 15, fontWeight: 500 }}>
            <Svg name="heart" />{pokes > 0 ? `已戳 TA ${pokes} 次` : '戳一戳 TA'}
          </span>
          <span className="h-sub">想要抱抱</span>
        </button>

        {/* 收到的信 */}
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between', padding: '0 6px' }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>收到的信</div>
            <div className="badge">{unread > 0 ? `${unread} 封未读` : '全部已读'}</div>
          </div>
          {letters.length === 0 && (
            <div className="glass h-sub" style={{ borderRadius: 24, padding: 18, textAlign: 'center' }}>邮筒还是空的，等 TA 的第一封信</div>
          )}
          {letters.map((l) => {
            const isUnread = l.status === 'sent'
            return (
              <button key={l.id} className="glass letter tap" onClick={() => tapLetter(l)}>
                <div className="icon-tile sm"><Svg name={KIND_ICON[l.kind]} /></div>
                <div className="col" style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <div className="ellipsis" style={{ fontSize: 15, fontWeight: 600 }}>{l.title || '一封信'}</div>
                  <div className="h-sub" style={{ fontSize: 12 }}>{letterMeta(l)}</div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
                  <div className="h-sub" style={{ fontSize: 11 }}>{isUnread ? '未读' : '已读'}</div>
                  <div className="dot" style={{ opacity: isUnread ? 1 : 0 }} />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <TabBar />
      {openLetter && <LetterModal letter={openLetter} onClose={() => setOpenLetter(null)} onChanged={reload} />}
    </div>
  )
}
