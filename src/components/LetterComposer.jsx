import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Svg } from './Icon'
import './letter.css'

const KINDS = [
  { id: 'note', label: '便签', icon: 'mail', desc: '普通的一封信，TA 随时可以拆开。' },
  { id: 'capsule', label: '时间胶囊', icon: 'clock', desc: '到你选的时间 TA 才能拆开，没到点之前，谁也读不到里面的字。' },
  { id: 'burn', label: '阅后即焚', icon: 'flame', desc: 'TA 拆开后 10 秒就会焚毁，之后连你也看不到了。' },
]

const DRAFT_KEY = 'couple-letter-draft'
const MAX_BODY = 1000
const MAX_TITLE = 24

const pad = (n) => String(n).padStart(2, '0')
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// 时间胶囊的快捷时间，全部定在当天早上 9 点
const QUICK = [
  { label: '明天早上', at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d } },
  { label: '一周后', at: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d } },
  { label: '一个月后', at: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(9, 0, 0, 0); return d } },
]

// 草稿只存在这台设备的浏览器里：写到一半关掉也不会丢
const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {} } catch { return {} }
}

const mapError = (e) => {
  const m = e?.message || ''
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '还没在 Supabase 里创建 send_letter 函数，先跑那条 SQL'
  if (m.includes('no partner')) return '还没有另一半的账号'
  if (m.includes('bad unlock')) return '解锁时间要在现在之后'
  if (m.includes('empty body')) return '信还是空的，写点什么吧'
  return `没寄出去：${m}`
}

/** 全屏信纸。寄出成功后播放信封封口、飞走的动画，结束时调用 onSent 再关闭。 */
export default function LetterComposer({ onClose, onSent }) {
  const { me, partner } = useAuth()
  const [draft] = useState(loadDraft)
  const [kind, setKind] = useState(KINDS.some((k) => k.id === draft.kind) ? draft.kind : 'note')
  const [title, setTitle] = useState(draft.title || '')
  const [body, setBody] = useState(draft.body || '')
  const [unlockAt, setUnlockAt] = useState('')
  const [phase, setPhase] = useState('write') // write | sending | sent
  const [err, setErr] = useState('')
  const timer = useRef(null)

  const cur = KINDS.find((k) => k.id === kind)
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  const busy = phase !== 'write'

  // 打开时锁住底下页面的滚动，关掉时还原
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && phase === 'write') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  useEffect(() => () => clearTimeout(timer.current), [])

  // 草稿自动保存
  useEffect(() => {
    if (phase !== 'write') return
    try {
      if (!title && !body) localStorage.removeItem(DRAFT_KEY)
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, title, body }))
    } catch { /* 无痕模式等拿不到存储，忽略 */ }
  }, [kind, title, body, phase])

  const send = async () => {
    if (busy) return
    const text = body.trim()
    if (!text) return setErr('信还是空的，写点什么吧')
    if (kind === 'capsule') {
      if (!unlockAt) return setErr('选一个解锁时间')
      if (new Date(unlockAt).getTime() < Date.now() + 60000) return setErr('解锁时间要在现在之后')
    }
    setErr(''); setPhase('sending')
    const { error } = await supabase.rpc('send_letter', {
      p_kind: kind,
      p_title: title.trim(),
      p_body: text,
      p_unlock_at: kind === 'capsule' ? new Date(unlockAt).toISOString() : null,
    })
    if (error) { setPhase('write'); setErr(mapError(error)); return }
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    try { navigator.vibrate?.([30, 60, 30]) } catch { /* iOS 不支持 */ }
    setPhase('sent')
    timer.current = setTimeout(() => { onSent?.(); onClose() }, 2350)
  }

  return (
    <div className="lc-root" role="dialog" aria-modal="true" aria-label="写信">
      <div className={`lc-win win${phase === 'sent' ? ' away' : ''}`}>
        <header className="tb">
          <Svg name="pen" size={14} />
          <b>写给 {partner?.display_name || 'TA'}.letter</b>
          <span className="grow" />
          <button type="button" className="lc-x tap" onClick={onClose} disabled={busy} aria-label="关闭，草稿会保留">
            <Svg name="x" size={12} stroke={2.2} />
          </button>
        </header>

        <div className="lc-kinds">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className={`lc-kind tap${kind === k.id ? ' on' : ''}`} onClick={() => { setKind(k.id); setErr('') }} disabled={busy}>
              <Svg name={k.icon} size={18} stroke={1.7} />
              <span>{k.label}</span>
            </button>
          ))}
        </div>
        <div className="lc-desc">{cur.desc}</div>

        {kind === 'capsule' && (
          <div className="lc-when">
            <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
              {QUICK.map((q) => (
                <button key={q.label} type="button" className="pill" onClick={() => { setUnlockAt(toLocalInput(q.at())); setErr('') }} disabled={busy}>{q.label}</button>
              ))}
            </div>
            <input
              className="lc-dt" type="datetime-local" value={unlockAt} min={toLocalInput(new Date())}
              onChange={(e) => { setUnlockAt(e.target.value); setErr('') }} disabled={busy} aria-label="解锁时间"
            />
          </div>
        )}

        <div className="lc-paper">
          <div className="lc-eye"><span>TO {partner?.display_name || 'TA'}</span><span>{today}</span></div>
          <input
            className="lc-title" maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（可以不写）" disabled={busy}
          />
          <textarea
            className="lc-body" maxLength={MAX_BODY} value={body} onChange={(e) => { setBody(e.target.value); setErr('') }}
            placeholder="想对 TA 说的话……" disabled={busy}
          />
          <div className="lc-sign">— {me?.display_name || ''}</div>
        </div>

        {err && <div className="lc-err">{err}</div>}

        <footer className="wf">
          <span>{body.length} / {MAX_BODY} · 草稿自动保存</span>
          <button type="button" className="btn lc-send tap" onClick={send} disabled={busy || !body.trim()}>
            {phase === 'sending' ? '封好中…' : '寄出'}
          </button>
        </footer>
      </div>

      {phase === 'sent' && (
        <div className="lc-env" aria-hidden="true">
          <div className="back" />
          <div className="pp"><i /><i /><i /></div>
          <div className="front" />
          <div className="flap" />
          <div className="seal"><Svg name={cur.icon} size={18} /></div>
        </div>
      )}
    </div>
  )
}