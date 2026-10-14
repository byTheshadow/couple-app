import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStatus } from '../lib/hooks'
import { DECORATIONS, STATUS_ICONS, StatusIcon, Svg } from '../components/Icon'
import Whisper from '../components/Whisper'
import TabBar from '../components/TabBar'

const REVEAL_TYPES = [
  { id: 'scratch', label: '刮刮乐' },
  { id: 'password', label: '密码锁' },
  { id: 'longpress', label: '长按充能' },
  { id: 'timelock', label: '时限解锁' },
]

const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function StatusEditor() {
  const { me, reload } = useAuth()
  const { row, loading } = useStatus(me?.id)
  const [form, setForm] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { if (me) setName(me.display_name) }, [me])
  useEffect(() => {
    if (loading) return
    setForm({
      icon_id: row?.icon_id || 'coffee',
      status_text: row?.status_text || '',
      decoration_id: row?.decoration_id || 'none',
      secret_text: row?.secret_text || '',
      reveal_type: row?.reveal_type || 'scratch',
      pin: row?.reveal_config?.pin || '',
      unlockAt: toLocalInput(row?.reveal_config?.unlockAt),
    })
  }, [loading, row])

  if (!form) return <div className="shell"><div className="page center"><div className="h-sub">加载中…</div></div></div>

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setMsg('') }

  const save = async () => {
    if (form.reveal_type === 'password' && !/^\d{4}$/.test(form.pin)) return setMsg('密码锁需要 4 位数字')
    if (form.reveal_type === 'timelock' && !form.unlockAt) return setMsg('请选择解锁时间')
    setSaving(true); setMsg('')
    const cfg = form.reveal_type === 'password' ? { pin: form.pin }
      : form.reveal_type === 'timelock' ? { unlockAt: new Date(form.unlockAt).toISOString() } : {}
    const [a, b] = await Promise.all([
      supabase.from('status').upsert({
        user_id: me.id, icon_id: form.icon_id, status_text: form.status_text.trim(),
        decoration_id: form.decoration_id, secret_text: form.secret_text.trim(),
        reveal_type: form.reveal_type, reveal_config: cfg,
      }),
      name.trim() && name.trim() !== me.display_name
        ? supabase.from('profiles').update({ display_name: name.trim() }).eq('id', me.id)
        : Promise.resolve({}),
    ])
    setSaving(false)
    if (a.error || b.error) return setMsg('保存失败，稍后再试')
    await reload()
    setMsg('已保存，TA 那边会实时更新')
  }

  const preview = { user_id: me.id, updated_at: 'preview', secret_text: form.secret_text, reveal_type: form.reveal_type }

  return (
    <div className="shell">
      <div className="blob a" /><div className="blob b" /><div className="blob c" />
      <div className="page">
        <div className="col" style={{ padding: '0 6px', gap: 4 }}>
          <div className="h-sub">编辑我的状态</div>
          <h1 className="h-title">两层状态</h1>
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div className="label">我的名字</div>
          <input className="field glass" maxLength={12} value={name} onChange={(e) => { setName(e.target.value); setMsg('') }} placeholder="TA 看到的你的名字" />
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div className="label">第一层 · 明面</div>
          <div className="glass row" style={{ borderRadius: 28, padding: 18, gap: 14 }}>
            <div className="icon-tile"><StatusIcon id={form.icon_id} /></div>
            <input className="field" maxLength={16} value={form.status_text} onChange={(e) => set('status_text', e.target.value)} placeholder="搬砖中 / 电量低充电中…" />
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {STATUS_ICONS.map((i) => (
              <button key={i.id} className={`pill${form.icon_id === i.id ? ' on' : ''}`} onClick={() => set('icon_id', i.id)}>{i.label}</button>
            ))}
          </div>
          <div className="label" style={{ marginTop: 4 }}>装饰（先存下选择，样式做精修时接上）</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {DECORATIONS.map((d) => (
              <button key={d.id} className={`pill${form.decoration_id === d.id ? ' on' : ''}`} onClick={() => set('decoration_id', d.id)}>{d.label}</button>
            ))}
          </div>
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div className="label">第二层 · 暗面 · 想对 TA 说的话</div>
          <textarea className="field glass" rows={3} maxLength={120} value={form.secret_text} onChange={(e) => set('secret_text', e.target.value)} placeholder="写一句只想让 TA 解锁后看到的话" />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {REVEAL_TYPES.map((t) => (
              <button key={t.id} className={`pill${form.reveal_type === t.id ? ' on' : ''}`} onClick={() => set('reveal_type', t.id)}>{t.label}</button>
            ))}
          </div>
          {form.reveal_type === 'password' && (
            <input className="field glass" inputMode="numeric" maxLength={4} placeholder="约定的 4 位数字（纪念日）" value={form.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} />
          )}
          {form.reveal_type === 'timelock' && (
            <input className="field glass" type="datetime-local" value={form.unlockAt} onChange={(e) => set('unlockAt', e.target.value)} />
          )}
          <div className="glass col" style={{ borderRadius: 24, padding: 16, gap: 8 }}>
            <div className="h-sub row" style={{ gap: 6 }}><Svg name="lock" size={13} stroke={1.8} />你自己看到的是明文，TA 看到的是上锁版本</div>
            <Whisper row={preview} mine />
          </div>
        </div>

        <button className="btn" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
        {msg && <div className="h-sub" style={{ textAlign: 'center' }}>{msg}</div>}
      </div>
      <TabBar />
    </div>
  )
}
