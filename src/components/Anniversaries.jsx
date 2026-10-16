import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useAnniversaries } from '../lib/hooks'
import { Svg } from './Icon'
import './anniversaries.css'

const DAY = 86400000
const GAP = 10 // 要和 anniversaries.css 里 .an-track 的 gap 一致
const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const daysBetween = (a, b) => Math.round((b - a) / DAY)
const dotDate = (s) => s.replaceAll('-', '.')
const cnDate = (s) => { const [y, m, d] = s.split('-').map(Number); return `${y} 年 ${m} 月 ${d} 日` }
const cnMD = (s) => { const [, m, d] = s.split('-').map(Number); return `${m} 月 ${d} 日` }

// 算下一次「每年都算」的日子落在哪一天（今年过了就顺到明年）
function nextOccurrence(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const today = startOfDay(new Date())
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate())
  if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate())
  return next
}

// 三种展示：一次性过去日期 → 正计时（在一起多少天）；一次性未来日期 → 倒计时；每年都算 → 倒计时 + 第几年
// 返回：sortKey 排序用；label 数字上方的小字；num 大数字；footL / footR 窗口底栏左右两段字
function describe(a) {
  const start = new Date(`${a.date}T00:00:00`)
  const today = startOfDay(new Date())
  if (a.repeat_yearly) {
    const next = nextOccurrence(a.date)
    const daysLeft = daysBetween(today, next)
    const yearNum = next.getFullYear() - start.getFullYear()
    return {
      sortKey: 1000 + daysLeft,
      label: daysLeft === 0 ? '就是今天' : '还有',
      num: daysLeft,
      footL: `每年 ${cnMD(a.date)}`,
      footR: yearNum > 0 ? `第 ${yearNum} 年` : '今天开始',
    }
  }
  if (start <= today) {
    return {
      sortKey: -1e6 + start.getTime(),
      label: '已经',
      num: daysBetween(start, today),
      footL: `从 ${cnDate(a.date)}开始`,
      footR: '还在继续',
    }
  }
  return {
    sortKey: 1000 + daysBetween(today, start),
    label: '还有',
    num: daysBetween(today, start),
    footL: cnDate(a.date),
    footR: '倒计时',
  }
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
  const [idx, setIdx] = useState(0)
  const trackRef = useRef(null)

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
  const cur = Math.min(idx, Math.max(0, sorted.length - 1))

  // 滑动时算出当前是第几张，用来点亮下面的分页点
  const onScroll = () => {
    const el = trackRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / (el.clientWidth + GAP))
    if (i !== idx) setIdx(i)
  }
  const goTo = (i) => {
    const el = trackRef.current
    if (el) el.scrollTo({ left: i * (el.clientWidth + GAP), behavior: 'smooth' })
  }

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
      ) : sorted.length > 0 && (
        <>
          <div className="an-track" ref={trackRef} onScroll={onScroll}>
            {sorted.map((a) => {
              const d = describe(a)
              const len = String(d.num).length
              return (
                <article key={a.id} className="win an-win">
                  <header className="tb">
                    <Svg name="doc" size={14} />
                    <b className="ellipsis">{a.title}</b>
                    <span className="grow" />
                    <span className="mono">{dotDate(a.date)}</span>
                    <button type="button" className="tb-btn tap" onClick={() => startEdit(a)} aria-label={`编辑 ${a.title}`}>
                      <Svg name="pen" size={12} stroke={2} />编辑
                    </button>
                  </header>

                  <div className="wb an-body">
                    <div className="an-orbit" aria-hidden="true">
                      <div className="an-spin"><i className="an-ball" /><i className="an-ball k" /></div>
                      <span className="an-heart"><Svg name="heart" size={26} stroke={1.8} /></span>
                    </div>

                    <div className="an-top">
                      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                        <path d="M16 4 V28 M5.6 10 L26.4 22 M5.6 22 L26.4 10" />
                      </svg>
                      <span>{d.label}</span>
                    </div>

                    <div className="an-numrow">
                      <div className={`an-num${len >= 5 ? ' l5' : len === 4 ? ' l4' : ''}`}>{d.num}</div>
                      <span className="an-unit">天</span>
                    </div>
                  </div>

                  <footer className="wf"><span>{d.footL}</span><span>{d.footR}</span></footer>
                </article>
              )
            })}
          </div>

          {sorted.length > 1 && (
            <div className="an-dots" role="tablist" aria-label="切换纪念日">
              {sorted.map((a, i) => (
                <button key={a.id} type="button" role="tab" aria-selected={i === cur} aria-label={a.title}
                  className={i === cur ? 'on' : undefined} onClick={() => goTo(i)} />
              ))}
            </div>
          )}
        </>
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