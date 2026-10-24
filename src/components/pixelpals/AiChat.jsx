import { Fragment, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { GIFTS, SCENES, placeOf } from './art'
import { chatReply } from './voice'
import { palChat } from './store'
import { loadAi, aiReady, chat, buildMessages, SPEEDS } from './ai'
import { personaGet, chatHistory, chatAdd, chatClear } from './aistore'
import './extra.css'
import './aichat.css'

/* ===========================================================================
   和 TA 的小人聊天（去看 TA · 纸条 · 聊天 页签里的聊天部分）
   - AI 设置好了：用 TA 写的人设 + 小人此刻的状态（在干嘛、心情、礼物）去问 AI，回复一个字一个字打出来
   - AI 没设置好：退回预设台词，和以前一样
   - 出错（key 不对、没网……）：在输入框上面显示一行错误，你说的话会放回输入框
   - 每一次来回：写进 TA 的日记（日记里最多 40 个字，超出的用 … 省略）+ 存进聊天记录表（完整的）
   props 和 Visitor 一样：ownerId / name / slot / st / buttons / gifts / busy / onAct / consoleRef / say；
   aiCtx = { myName, mood, coins, settings }（TA 小人的心情、钱包、设置，由 PixelPals 传进来）
   =========================================================================== */

const STATE_LABEL = { work: '上班中', home: '在家', sleep: '睡觉中', play: '玩耍中', idle: '放空中' }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clip = (s, n) => { const a = Array.from(String(s)); return a.length > n ? `${a.slice(0, n - 1).join('')}…` : String(s) }
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

// AI 回的话整理一下：去掉「小夏：」这样的开头和外面包的引号；太长的截断
function tidy(text, ownerName, maxChars) {
  let s = String(text || '').trim()
  s = s.replace(new RegExp(`^(${esc(ownerName)}|你)\\s*[：:]\\s*`), '')
  s = s.replace(/^["“「『]([\s\S]*)["”」』]$/, '$1').trim()
  const cap = Math.max(60, (maxChars || 120) * 2)
  return Array.from(s).length > cap ? `${Array.from(s).slice(0, cap).join('')}…` : s
}

// 每条之间隔了很久，就插一个时间标签
function stamp(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const today = d.toDateString() === now.toDateString()
  return today ? `今天 ${hhmm(d)}` : `${d.getMonth() + 1}-${d.getDate()} ${hhmm(d)}`
}

export default function AiChat({ ownerId, name, slot, st, buttons, gifts, busy, onAct, consoleRef, say, aiCtx }) {
  const { me } = useAuth()
  const ctxIn = aiCtx || {}
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pend, setPend] = useState(null) // 刚发出去、还在等回复的那句
  const [err, setErr] = useState('')
  const [note, setNote] = useState('') // 不影响聊天的提醒（比如读不到人设）
  const alive = useRef(true)
  const timer = useRef(0)
  const logRef = useRef(null)
  const pcache = useRef({ id: '', t: 0, p: null })
  const cfg = loadAi()
  const ready = aiReady(cfg)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; clearTimeout(timer.current) }
  }, [])

  // 读以前的聊天记录
  useEffect(() => {
    if (!me || !ownerId) return undefined
    let ok = true
    ;(async () => {
      const { error, rows, missing } = await chatHistory(ownerId, me.id, 30)
      if (!ok) return
      if (error) { setNote(missing ? '聊天记录表还没建（跑一下第八轮的 SQL），现在聊的不会保存' : error); return }
      setMsgs(rows.map((r) => ({ id: `r${r.id}`, q: r.q, a: r.a, t: r.created_at })))
    })()
    return () => { ok = false }
  }, [me, ownerId])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, pend])

  const getPersona = async () => {
    const c = pcache.current
    if (c.p && c.id === ownerId && Date.now() - c.t < 60000) return c.p
    const r = await personaGet(ownerId)
    if (r.error) { if (alive.current) setNote(`读不到${name}的人设（${r.error}），这次先用默认性格`); return r.persona }
    pcache.current = { id: ownerId, t: Date.now(), p: r.persona }
    if (alive.current) setNote('')
    return r.persona
  }

  const typeOut = (id, full, ms) => new Promise((resolve) => {
    const n = Array.from(full).length
    let k = 0
    const tick = () => {
      if (!alive.current) { resolve(); return }
      k += 1
      setMsgs((l) => l.map((m) => (m.id === id ? { ...m, shown: k } : m)))
      if (k >= n) { resolve(); return }
      timer.current = setTimeout(tick, ms)
    }
    tick()
  })

  const send = async () => {
    const q = input.trim()
    if (!q || sending || busy) return
    const c = loadAi()
    const isReady = aiReady(c)
    setInput('')
    setErr('')
    setSending(true)
    setPend(q)
    if (consoleRef && consoleRef.current) consoleRef.current.say('……', 1.5)
    try {
      let a = ''
      if (isReady) {
        const persona = await getPersona()
        const S = ctxIn.settings
        const place = S ? placeOf(S, st) : null
        const ctx = {
          ownerName: name,
          myName: ctxIn.myName || '我',
          slot,
          time: hhmm(new Date()),
          st,
          where: place ? (SCENES[place] || '自己画的场景') : '',
          mood: ctxIn.mood == null ? 70 : ctxIn.mood,
          coins: ctxIn.coins || 0,
          buttons: Array.isArray(buttons) ? buttons : [],
          gifts: (Array.isArray(gifts) ? gifts : []).map((k) => (GIFTS.find((g) => g.k === k) || {}).n).filter(Boolean),
        }
        const history = msgs.filter((m) => m.q && m.a).map((m) => ({ q: m.q, a: m.a }))
        const { error, text } = await chat(c, buildMessages(persona, ctx, history, q, c))
        if (!alive.current) return
        if (error) { setErr(error); setInput(q); setPend(null); return }
        a = tidy(text, name, c.maxChars)
        if (!a) { setErr('AI 回的话是空的（换个模型试试？）'); setInput(q); setPend(null); return }
      } else {
        await wait(700)
        a = chatReply(slot, st, q)
      }

      // 先存：日记（短的）+ 聊天记录（完整的）。存不上不影响这次聊天，只提醒一句
      const [d1, d2] = await Promise.all([palChat(ownerId, clip(q, 40), clip(a, 40)), chatAdd(ownerId, q, a)])
      const warn = [d1.error && `日记没记上：${d1.error}`, d2.error && `聊天记录没存上：${d2.error}`].filter(Boolean)
      if (warn.length) say(warn.join('；'))
      if (!alive.current) return

      const id = `n${Date.now()}`
      const typing = c.typewriter
      setPend(null)
      setMsgs((l) => [...l, { id, q, a, t: new Date().toISOString(), shown: typing ? 0 : undefined }].slice(-60))
      if (typing) await typeOut(id, a, SPEEDS[c.speed] || SPEEDS.mid)
      // 打完了，TA 的小人在屏幕上说一句（长的只说前面一段）
      if (alive.current) await onAct('chat', async () => ({ error: null }), { q, a: clip(a, 60) })
    } finally {
      if (alive.current) { setSending(false); setPend(null) }
    }
  }

  const clear = async () => {
    if (!window.confirm(`清空你和${name}的聊天记录？\n只清这里的记录，写进日记的几句不受影响。`)) return
    const { error } = await chatClear(ownerId)
    if (error) { say(error); return }
    setMsgs([])
    say('聊天记录已清空')
  }

  const first = Array.from(name || '')[0] || 'TA'
  const place = ctxIn.settings ? placeOf(ctxIn.settings, st) : null
  const mood10 = Math.max(0, Math.min(10, Math.round((Number(ctxIn.mood) || 0) / 10)))

  return (
    <>
      <div className="pp-h">和{name}聊聊 <small>{ready ? `AI 回复 · ${cfg.model}` : '预设台词'}</small></div>
      <div className="ai-strip" aria-label={`${name}现在的状态`}>
        <span>{name}现在</span><b>{STATE_LABEL[st] || '在家'}</b>
        {place && <><span>/</span><b>{SCENES[place] || '自己画的场景'}</b></>}
        {ctxIn.mood != null && <><span>/</span><span>心情 <b>{mood10}</b>/10</span></>}
        <span className="ai-note">{ready ? `聊天时 AI 会参考这些，回答更贴合${name}此刻的样子` : 'AI 还没设置好，先用预设台词；到「我的小屋 → AI 设置」填好就会换成真 AI'}</span>
      </div>

      {(msgs.length > 0 || pend) && (
        <div className="ai-log" ref={logRef} aria-live="polite">
          {msgs.map((m, i) => {
            const prev = msgs[i - 1]
            const gap = !prev || (new Date(m.t) - new Date(prev.t)) > 30 * 60 * 1000
            const full = Array.from(m.a)
            const typing = m.shown !== undefined && m.shown < full.length
            return (
              <Fragment key={m.id}>
                {gap && <div className="ai-when">{stamp(m.t)}</div>}
                <div className="ai-row me"><div className="ai-msg me">{m.q}</div></div>
                <div className="ai-row">
                  <div className={`ai-ava ${slot}`}>{first}</div>
                  <div className="ai-msg ta">{typing ? full.slice(0, m.shown).join('') : m.a}{typing && <span className="ai-cur" />}</div>
                </div>
              </Fragment>
            )
          })}
          {pend && (
            <>
              <div className="ai-row me"><div className="ai-msg me">{pend}</div></div>
              <div className="ai-row"><div className={`ai-ava ${slot}`}>{first}</div><div className="ai-msg ta">……<span className="ai-cur" /></div></div>
            </>
          )}
        </div>
      )}

      {err && <p className="ai-err" role="alert"><b>出错了：</b>{err}</p>}

      <div className="pp-inrow" style={{ marginTop: 10 }}>
        <input className="pp-in" type="text" maxLength={200} value={input} placeholder="说点什么……" aria-label="聊天"
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }} />
        <button type="button" className="btn" disabled={sending || busy} onClick={send}>{sending ? '…' : '发送'}</button>
      </div>
      <p className="pp-hint">每一句来回都会写进你们俩的日记，也会存进聊天记录。{note && <><br />{note}</>}</p>
      {msgs.length > 0 && <div className="ai-tools"><button type="button" className="pp-chip" onClick={clear}>清空聊天记录</button></div>}
    </>
  )
}