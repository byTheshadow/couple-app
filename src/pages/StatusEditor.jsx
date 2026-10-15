import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStatus } from '../lib/hooks'
import { useScrollFx } from '../lib/scrollfx'
import { DECORATIONS, STATUS_ICONS, StatusIcon, Svg } from '../components/Icon'
import Whisper from '../components/Whisper'
import TabBar from '../components/TabBar'

const REVEAL_TYPES = [
  { id: 'scratch', label: '刮刮乐', desc: 'TA 刮开涂层才能看到' },
  { id: 'password', label: '密码锁', desc: 'TA 输入你们约定的 4 位数字才能看到' },
  { id: 'longpress', label: '长按充能', desc: 'TA 长按按钮，充满才解锁' },
  { id: 'timelock', label: '时限解锁', desc: '到你设定的时间才会自动解开' },
]

const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const initial = (name) => (name || '?').trim().slice(0, 1).toUpperCase()

function Backdrop() {
  return (
    <div className="bg">
      <div className="blobs" data-sy>
        <div className="blob a" /><div className="blob b" /><div className="blob c" />
        <div className="blob d" /><div className="blob e" />
      </div>
      <div className="aurora" />
    </div>
  )
}

export default function StatusEditor() {
  const { me, reload } = useAuth()
  const { row, loading } = useStatus(me?.id)
  const [form, setForm] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useScrollFx()

  const say = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2600) }, [])

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

  if (!form) {
    return (
      <div className="shell">
        <Backdrop />
        <div className="page center"><div className="h-sub">加载中…</div></div>
      </div>
    )
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const type = REVEAL_TYPES.find((t) => t.id === form.reveal_type)
  const now = new Date()
  const shortDate = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`

  const save = async () => {
    if (form.reveal_type === 'password' && !/^\d{4}$/.test(form.pin)) return say('密码锁需要 4 位数字')
    if (form.reveal_type === 'timelock' && !form.unlockAt) return say('请选择解锁时间')
    setSaving(true)
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
    if (a.error || b.error) return say('保存失败，稍后再试')
    await reload()
    say('已保存，TA 那边会实时更新')
  }

  const preview = { user_id: me.id, updated_at: 'preview', secret_text: form.secret_text, reveal_type: form.reveal_type }

  return (
    <div className="shell">
      <Backdrop />
      {toast && <div className="toast glass">{toast}</div>}

      <div className="page">
        <div className="col hdr" data-sp style={{ padding: '0 6px', gap: 6 }}>
          <div className="h-sub">编辑我的状态</div>
          <h1 className="h-title">两层状态</h1>
        </div>

        {/* 实时预览：和首页"我的卡"是同一套样式，选装饰立刻看到效果 */}
        <section className="hero glass rv" data-depth>
          <div className="who">预览</div>
          <div className="hero-top">
            <div className="av-wrap" data-deco={form.decoration_id}>
              <i className="av-ring" /><i className="av-ring r2" /><i className="av-ring r3" />
              <span className="d d-polaroid" data-cap={shortDate} />
              <span className="d d-ears"><i /><i /></span>
              <span className="d d-halo" />
              <span className="d d-orbit" />
              <span className="d d-pixel" />
              <div className="av">{initial(name)}</div>
            </div>
            <div className="hero-info">
              <div className="handle"><b>{name || '你的名字'}</b><span className="u" /></div>
              <div className="mychip">
                <StatusIcon id={form.icon_id} />
                <span className="ellipsis">{form.status_text || '还没设置状态'}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="col rv" style={{ gap: 10 }}>
          <div className="label">我的名字</div>
          <input className="field glass" maxLength={12} value={name} onChange={(e) => setName(e.target.value)} placeholder="TA 看到的你的名字" />
        </section>

        <section className="col rv" style={{ gap: 10 }}>
          <div className="label">第一层 · 明面</div>
          <div className="glass editor-card">
            <input className="field" maxLength={16} value={form.status_text} onChange={(e) => set('status_text', e.target.value)} placeholder="搬砖中 / 电量低充电中…" />
            <div className="pickgrid">
              {STATUS_ICONS.map((i) => (
                <button key={i.id} className={`pick${form.icon_id === i.id ? ' on' : ''}`} onClick={() => set('icon_id', i.id)}>
                  <StatusIcon id={i.id} size={26} /><span>{i.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="label" style={{ marginTop: 4 }}>头像装饰</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {DECORATIONS.map((d) => (
              <button key={d.id} className={`pill${form.decoration_id === d.id ? ' on' : ''}`} onClick={() => set('decoration_id', d.id)}>{d.label}</button>
            ))}
          </div>
        </section>

        <section className="col rv" style={{ gap: 10 }}>
          <div className="label">第二层 · 暗面 · 想对 TA 说的话</div>
          <div className="field-wrap">
            <textarea className="field glass" rows={3} maxLength={120} value={form.secret_text} onChange={(e) => set('secret_text', e.target.value)} placeholder="写一句只想让 TA 解锁后看到的话" />
            <span className="cnt">{form.secret_text.length} / 120</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {REVEAL_TYPES.map((t) => (
              <button key={t.id} className={`pill${form.reveal_type === t.id ? ' on' : ''}`} onClick={() => set('reveal_type', t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="type-desc">{type?.desc}</div>
          {form.reveal_type === 'password' && (
            <input className="field glass" inputMode="numeric" maxLength={4} placeholder="约定的 4 位数字（纪念日）" value={form.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} />
          )}
          {form.reveal_type === 'timelock' && (
            <input className="field glass" type="datetime-local" value={form.unlockAt} onChange={(e) => set('unlockAt', e.target.value)} />
          )}
          <div className="glass col" style={{ borderRadius: 24, padding: 16, gap: 8 }} data-depth>
            <div className="h-sub row" style={{ gap: 6 }}><Svg name="lock" size={13} stroke={1.8} />你自己看到的是明文，TA 看到的是上锁版本</div>
            <Whisper row={preview} mine />
          </div>
        </section>

        <button className="btn rv" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
      </div>
      <TabBar />
    </div>
  )
}