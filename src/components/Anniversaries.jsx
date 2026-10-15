import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useAnniversaries } from '../lib/hooks'
import { Svg } from './Icon'

const DAY = 86400000
const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const daysBetween = (a, b) => Math.round((b - a) / DAY)

// 算下一次「每年都算」的日子落在哪一天（今年过了就顺到明年）
function nextOccurrence(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const today = startOfDay(new Date())
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate())
  if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate())
  return next
}

// 三种展示：一次性未来日期 → 倒计时；一次性过去日期 → 正计时（比如"在一起多少天"）；每年都算 → 倒计时 + 第几年
function describe(a) {
  const start = new Date(`${a.date}T00:00:00`)
  const today = startOfDay(new Date())
  if (a.repeat_yearly) {
    const next = nextOccurrence(a.date)
    const daysLeft = daysBetween(today, next)
    const yearNum = next.getFullYear() - start.getFullYear()
    return {
      sortKey: 1000 + daysLeft,
      text: daysLeft === 0 ? `就是今天 · 第 ${yearNum} 年` : `还有 ${daysLeft} 天 · 第 ${yearNum} 年`,
    }
  }
  if (start <= today) {
    const daysPassed = daysBetween(start, today)
    return { sortKey: -1e6 + start.getTime(), text: `已经 ${daysPassed} 天` }
  }
  const daysLeft = daysBetween(today, start)
  return { sortKey: 1000 + daysLeft, text: `还有 ${daysLeft} 天` }
}

const emptyForm = () => ({ title: '', date: todayStr(), repeat_yearly: false })

export default function Anniversaries() {
  const { me } = useAuth()
  const { items, reload } = useAnniversaries()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null) // 'new' 或某条记录的 id
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const say = (t) => { setToast(t); setTimeout(() => setToast(''), 2400) }

  const startNew = () => { setForm(emptyForm()); setEditing('new'); setOpen(true) }
  const startEdit = (a) => { setForm({ title: a.title, date: a.date, repeat_yearly: a.repeat_yearly }); setEditing(a.id); setOpen(true) }
  const cancel = () => { setEditing(null); setOpen(false) }

  const save = async () => {
    const title = form.title.trim()
    if (!title) return say('起个名字吧')
    if (!form.date) return say('选个日期吧')
    setSaving(true)
    const payload = { title, date: form.date, repeat_yearly: form.repeat_yearly }
    const { error } = editing === 'new'
      ? await supabase.from('anniversaries').insert({ ...payload, created_by: me.id })
      : await supabase.from('anniversaries').update(payload).eq('id', editing)
    setSaving(false)
    if (error) return say('保存失败，再试一次')
    cancel()
    reload()
    say('已保存')
  }

  const remove = async (id) => {
    setSaving(true)
    const { error } = await supabase.from('anniversaries').delete().eq('id', id)
    setSaving(false)
    if (error) return say('删除失败，再试一次')
    cancel()
    reload()
  }

  const sorted = [...items].sort((a, b) => describe(a).sortKey - describe(b).sortKey)

  return (
    <section className="col rv" style={{ gap: 10 }} data-depth>
      <div className="sect">
        <b>我们的纪念日</b>
        <button className="mini tap" onClick={startNew}><Svg name="plus" size={14} stroke={2} />添加</button>
      </div>

      {toast && <div className="toast glass">{toast}</div>}

      {sorted.length === 0 && !open ? (
        <div className="glass h-sub" style={{ borderRadius: 24, padding: 18, textAlign: 'center' }}>
          还没有纪念日，点右上角「添加」记一个吧
        </div>
      ) : (
        <div className="anniv-list">
          {sorted.map((a) => {
            const d = describe(a)
            return (
              <button key={a.id} className="glass anniv-card tap" onClick={() => startEdit(a)}>
                <div className="anniv-title ellipsis">{a.title}</div>
                <div className="anniv-sub">{d.text}</div>
              </button>
            )
          })}
        </div>
      )}

      {open && (
        <div className="glass anniv-form" data-depth>
          <input className="field" maxLength={20} placeholder="叫它什么（比如：在一起的日子）"
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input className="field" type="date" style={{ flex: 1, minWidth: 160 }}
              value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <button type="button" className={`pill${form.repeat_yearly ? ' on' : ''}`}
              onClick={() => setForm((f) => ({ ...f, repeat_yearly: !f.repeat_yearly }))}>
              每年都算（生日/周年）
            </button>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            {editing !== 'new' && (
              <button type="button" className="mini tap" onClick={() => remove(editing)} disabled={saving}>删除</button>
            )}
            <button type="button" className="mini tap" onClick={cancel}>取消</button>
            <button type="button" className="btn" style={{ height: 38, padding: '0 18px' }} onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}