import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useGrudges, useGrudgeComments } from '../lib/hooks'
import TabBar from '../components/TabBar'
import { Svg } from '../components/Icon'
import './grudge.css'

const LV = ['', '小事一桩', '有点不爽', '先记下了', '真的很气', '不共戴天']
const WHO = { all: '全部', open: '未原谅', done: '已原谅' }

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtDate = (s) => { const [, m, d] = s.split('-'); return `${+m}月${+d}日` }

function Flames({ level, size = 15 }) {
  return (
    <span className="gr-flames">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} className={n <= level ? 'f' : ''} width={size} height={size} viewBox="0 0 24 24"
          fill={n <= level ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2.2C11 8.5 11 5.5 12 3z" />
        </svg>
      ))}
    </span>
  )
}

export default function Grudge() {
  const { me, partner } = useAuth()
  const { items, loading, reload } = useGrudges()
  const { comments, reload: reloadComments } = useGrudgeComments()

  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [armedId, setArmedId] = useState(null)
  const [popId, setPopId] = useState(null)
  const [sheet, setSheet] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const say = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1800)
  }

  const myId = me?.id
  const partnerName = partner?.display_name || 'TA'
  const myName = me?.display_name || '我'

  const commentsBy = useMemo(() => {
    const m = {}
    for (const c of comments) (m[c.grudge_id] ||= []).push(c)
    return m
  }, [comments])

  const open = items.filter((x) => !x.forgiven)
  const mineOpen = open.filter((x) => x.created_by === myId).length
  const theirOpen = open.length - mineOpen
  const max = Math.max(mineOpen, theirOpen, 1)

  const shown = items
    .filter((x) => filter === 'all' || (filter === 'open' ? !x.forgiven : x.forgiven))
    .sort((a, b) => (a.forgiven - b.forgiven) || b.happened_on.localeCompare(a.happened_on) || b.created_at.localeCompare(a.created_at))

  /* ---------- 操作(权限由数据库 RLS 兜底,这里只是体验层) ---------- */
  const setForgiven = async (g, v) => {
    const { error } = await supabase.from('grudges')
      .update({ forgiven: v, forgiven_at: v ? new Date().toISOString() : null }).eq('id', g.id)
    if (error) return say('操作失败,稍后再试')
    if (v) setPopId(g.id)
    say(v ? '已原谅,这笔清了' : '已撤回,继续记着')
    reload()
  }

  const remove = async (g) => {
    if (armedId !== g.id) {
      setArmedId(g.id)
      setTimeout(() => setArmedId((cur) => (cur === g.id ? null : cur)), 2600)
      return
    }
    const { error } = await supabase.from('grudges').delete().eq('id', g.id)
    setArmedId(null)
    if (error) return say('删除失败')
    say('已删除')
    reload()
  }

  const addGrudge = async (f) => {
    const { error } = await supabase.from('grudges').insert({
      title: f.title, detail: f.detail || null, level: f.level, happened_on: f.date,
    })
    if (error) return say('保存失败,稍后再试')
    setSheet(false); setFilter('all'); say('记下了'); reload()
  }

  const addComment = async (g, body) => {
    const { error } = await supabase.from('grudge_comments').insert({ grudge_id: g.id, body })
    if (error) return say('评论失败'), false
    reloadComments()
    return true
  }

  const removeComment = async (c) => {
    const { error } = await supabase.from('grudge_comments').delete().eq('id', c.id)
    if (error) return say('删除失败')
    reloadComments()
  }

  return (
    <div className="gr-page">
      <div className="bg">
        <div className="blobs"><div className="blob a" /><div className="blob b" /><div className="blob c" /><div className="blob d" /></div>
        <div className="aurora" />
      </div>

      <main className="gr-main">
        <header className="gr-head">
          <div>
            <h1>记仇本</h1>
            <p>小账本,一笔一笔记清楚</p>
          </div>
          <button className="icon-btn glass tap gr-go" onClick={() => setSheet(true)} aria-label="新增一笔">
            <Svg name="plus" size={20} stroke={2} />
          </button>
        </header>

        <section className="gr-sum glass" aria-label="概览">
          <div className="gr-sum-main">
            <span className="gr-sum-label">还没原谅</span>
            <div className="gr-sum-num"><b>{open.length}</b><span>笔</span></div>
          </div>
          <div className="gr-sum-side">
            <div className="gr-who-row">
              <span className="nm ellipsis">{myName}记的</span>
              <div className="gr-meter"><i style={{ width: `${(mineOpen / max) * 100}%` }} /></div>
              <span className="ct">{mineOpen}</span>
            </div>
            <div className="gr-who-row">
              <span className="nm ellipsis">{partnerName}记的</span>
              <div className="gr-meter"><i style={{ width: `${(theirOpen / max) * 100}%` }} /></div>
              <span className="ct">{theirOpen}</span>
            </div>
          </div>
        </section>

        <div className="gr-seg glass" role="tablist" aria-label="筛选">
          {Object.entries(WHO).map(([k, label]) => (
            <button key={k} role="tab" className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setArmedId(null) }}>{label}</button>
          ))}
        </div>

        <section className="gr-list" aria-live="polite">
          {loading ? null : shown.length === 0 ? (
            <div className="gr-empty glass">
              <b>{filter === 'done' ? '还没有原谅过谁' : '这里很干净'}</b>
              {filter === 'done' ? '被原谅的记录会收在这里。' : '有事就记下来,别憋着。'}
            </div>
          ) : shown.map((g) => {
            const mine = g.created_by === myId
            const cs = commentsBy[g.id] || []
            const isOpen = openId === g.id
            return (
              <article key={g.id} className={`gr-card glass${g.forgiven ? ' done' : ''}${isOpen ? ' open' : ''}`} style={{ '--lv': g.level }}>
                <div className="gr-card-top">
                  <span className="gr-by">
                    <span className={`gr-av${mine ? ' me' : ''}`}>{(mine ? myName : partnerName).slice(0, 1)}</span>
                    {mine ? '我记的' : `${partnerName}记的`}
                  </span>
                  <span className="gr-date">{fmtDate(g.happened_on)}</span>
                </div>

                <div className="gr-card-main" role="button" tabIndex={0} aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : g.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(isOpen ? null : g.id) } }}>
                  <h3 className="gr-title"><span>{g.title}</span></h3>
                  {g.detail ? <p className="gr-detail">{g.detail}</p> : null}
                </div>

                {g.forgiven ? <span className={`gr-stamp${popId === g.id ? ' pop' : ''}`}>已原谅</span> : null}

                <div className="gr-foot">
                  <div className="gr-level"><Flames level={g.level} /><span>{LV[g.level]}</span></div>
                  <div className="gr-acts">
                    {cs.length > 0 && !isOpen ? <span className="gr-cmt-n">评论 {cs.length}</span> : null}
                    {mine ? (
                      <>
                        {g.forgiven
                          ? <button className="gr-btn tap" onClick={() => setForgiven(g, false)}>撤回</button>
                          : <button className="gr-btn forgive tap" onClick={() => setForgiven(g, true)}><Svg name="check" size={15} stroke={2} />原谅</button>}
                        <button className={`gr-btn del tap${armedId === g.id ? ' armed' : ''}`} onClick={() => remove(g)} aria-label="删除">
                          {armedId === g.id ? '确认删除' : <Svg name="trash" size={16} stroke={1.7} />}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {isOpen ? (
                  <Comments list={cs} myId={myId} nameOf={(id) => (id === myId ? myName : partnerName)}
                    onAdd={(body) => addComment(g, body)} onDelete={removeComment} />
                ) : null}
              </article>
            )
          })}
        </section>
      </main>

      <Sheet open={sheet} onClose={() => setSheet(false)} onSave={addGrudge} />
      <div className={`gr-toast toast glass${toast ? ' on' : ''}`} role="status">{toast}</div>
      <TabBar />
    </div>
  )
}

function Comments({ list, myId, nameOf, onAdd, onDelete }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    if (await onAdd(body)) setText('')
    setBusy(false)
  }
  return (
    <div className="gr-cmts">
      {list.map((c) => (
        <div key={c.id} className="gr-cmt">
          <span className="gr-cmt-who">{nameOf(c.author_id)}</span>
          <span className="gr-cmt-body">{c.body}</span>
          {c.author_id === myId
            ? <button className="gr-cmt-del tap" onClick={() => onDelete(c)} aria-label="删除评论"><Svg name="x" size={14} stroke={2} /></button>
            : null}
        </div>
      ))}
      <div className="gr-cmt-new">
        <input className="gr-inp" value={text} maxLength={200} placeholder="说点什么……"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }} />
        <button className="gr-btn tap" onClick={send} disabled={!text.trim() || busy}>发送</button>
      </div>
    </div>
  )
}

function Sheet({ open, onClose, onSave }) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [level, setLevel] = useState(3)
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)

  const close = () => { onClose() }
  const save = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    await onSave({ title: title.trim(), detail: detail.trim(), level, date: date || today() })
    setBusy(false)
    setTitle(''); setDetail(''); setLevel(3); setDate(today())
  }

  return (
    <>
      <div className={`gr-scrim${open ? ' on' : ''}`} onClick={close} />
      <form className={`gr-sheet glass${open ? ' on' : ''}`} onSubmit={(e) => e.preventDefault()} aria-label="新增一笔" aria-hidden={!open}>
        <div className="gr-grab" />
        <h2>记一笔</h2>
        <div className="gr-field">
          <label htmlFor="gr-t">发生了什么</label>
          <input id="gr-t" className="gr-inp" maxLength={40} value={title} placeholder="一句话说清楚" autoComplete="off"
            onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="gr-field">
          <label htmlFor="gr-d">详细经过(可不填)</label>
          <textarea id="gr-d" className="gr-inp" maxLength={300} value={detail} placeholder="当时的情况、说过的话……"
            onChange={(e) => setDetail(e.target.value)} />
        </div>
        <div className="gr-field">
          <span className="gr-lbl">仇恨值</span>
          <div className="gr-lv-pick">
            <div className="gr-flames">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={n <= level ? 'f' : ''} onClick={() => setLevel(n)} aria-label={`仇恨值 ${n}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill={n <= level ? 'currentColor' : 'none'} stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2.2C11 8.5 11 5.5 12 3z" />
                  </svg>
                </button>
              ))}
            </div>
            <span className="gr-lv-txt">{LV[level]}</span>
          </div>
        </div>
        <div className="gr-field">
          <label htmlFor="gr-date">发生日期</label>
          <input id="gr-date" className="gr-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="button" className="gr-save tap" onClick={save} disabled={!title.trim() || busy}>记下来</button>
      </form>
    </>
  )
}