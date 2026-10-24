import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { personaGet, personaSave, personaFromRow, personaToRow, EMPTY_PERSONA } from './aistore'
import { buildMessages, loadAi } from './ai'
import './ai.css'
import './aichat.css'

/* ===========================================================================
   人设页签（放在「今天的安排」里）：写小人的性格、和 TA 的关系、称呼、禁忌、示范几句。
   - TA 的界面里看不到这页；但 TA 聊天时，TA 的手机要把这份人设发给 AI，所以懂技术的人用开发者工具能翻到原文
   - 有自己的「保存人设」键，不跟「保存安排」走
   用法：<PersonaEditor name="我的小人名字" slot="u1" say={(text) => ...} />
   =========================================================================== */

const LIMITS = { persona: 400, relation: 400, callname: 10, avoid: 200, example: 40 }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function Counter({ value, max }) {
  return <i className="ai-count">{Array.from(value).length}/{max}</i>
}

export default function PersonaEditor({ name, slot, say }) {
  const { me, partner } = useAuth()
  const [saved, setSaved] = useState(EMPTY_PERSONA)
  const [d, setD] = useState(EMPTY_PERSONA)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    if (!me) return undefined
    let alive = true
    ;(async () => {
      const { error, persona } = await personaGet(me.id)
      if (!alive) return
      setProblem(error || '')
      setSaved(persona)
      setD(persona)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [me])

  const set = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const setEx = (i, k, v) => setD((x) => ({ ...x, examples: x.examples.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }))
  const addEx = () => setD((x) => (x.examples.length >= 3 ? x : { ...x, examples: [...x.examples, { q: '', a: '' }] }))
  const delEx = (i) => setD((x) => ({ ...x, examples: x.examples.filter((_, j) => j !== i) }))

  const dirty = !same(personaToRow(d), personaToRow(saved))

  const save = async () => {
    setSaving(true)
    const { error } = await personaSave(d)
    setSaving(false)
    if (error) { say(error); return }
    const next = personaFromRow(d)
    setSaved(next)
    setD(next)
    say('人设已保存')
  }

  // 「AI 实际会看到什么」：用现在写的内容，配一份示例状态，拼出真正的提示词第一条
  const preview = useMemo(() => {
    const t = new Date()
    const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    const msgs = buildMessages(
      personaFromRow(d),
      { ownerName: name, myName: (partner && partner.display_name) || 'TA', slot, time, st: 'home', where: '', mood: 70, coins: 100, buttons: [], gifts: [] },
      [], '（对方说的话）', loadAi(),
    )
    return msgs[0].content
  }, [d, name, slot, partner])

  return (
    <div>
      <div className="ai-lock">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        <span><b>这一页 TA 的界面里看不到。</b>TA 和{name}聊天时，AI 会照着这份人设来回答，但 TA 只会看到聊天内容本身。</span>
      </div>

      {problem && <p className="pp-warn">{problem}</p>}

      <div className="pp-blk">
        <div className="pp-h">小人是谁 <small>AI 扮演{name}时的依据</small></div>
        <label className="ai-fl">
          <span className="ai-top"><span>性格和说话方式</span><Counter value={d.persona} max={LIMITS.persona} /></span>
          <textarea className="pp-in ai-ta" rows={5} maxLength={LIMITS.persona} disabled={loading} value={d.persona} onChange={(e) => set('persona', e.target.value)} placeholder="例：摇滚乐手，高冷，嘴硬心软。话少，句子短，爱用省略号……（留空就用默认性格）" aria-label="性格和说话方式" />
        </label>
        <label className="ai-fl">
          <span className="ai-top"><span>和 TA 的关系、共同的事</span><Counter value={d.relation} max={LIMITS.relation} /></span>
          <textarea className="pp-in ai-ta" rows={4} maxLength={LIMITS.relation} disabled={loading} value={d.relation} onChange={(e) => set('relation', e.target.value)} placeholder="例：我们是情侣。TA 常加班，总忘记吃饭。约好以后一起去看海。" aria-label="和 TA 的关系" />
        </label>
        <label className="ai-fl">
          <span className="ai-top"><span>怎么称呼 TA</span><Counter value={d.callname} max={LIMITS.callname} /></span>
          <input className="pp-in" type="text" maxLength={LIMITS.callname} disabled={loading} value={d.callname} onChange={(e) => set('callname', e.target.value)} placeholder="例：笨蛋" aria-label="怎么称呼 TA" />
        </label>
        <label className="ai-fl" style={{ marginBottom: 0 }}>
          <span className="ai-top"><span>千万别说的话（可选）</span><Counter value={d.avoid} max={LIMITS.avoid} /></span>
          <textarea className="pp-in ai-ta" rows={2} maxLength={LIMITS.avoid} disabled={loading} value={d.avoid} onChange={(e) => set('avoid', e.target.value)} placeholder="例：别说「加油」，别用感叹号刷屏，别太肉麻。" aria-label="千万别说的话" />
        </label>
      </div>

      <div className="pp-blk">
        <div className="pp-h">示范几句 <small>可选，最多 3 组，AI 会学这个语气</small></div>
        {d.examples.map((e, i) => (
          <div className="ai-ex" key={i}>
            <label><span>TA 说</span><input className="pp-in" type="text" maxLength={LIMITS.example} value={e.q} onChange={(ev) => setEx(i, 'q', ev.target.value)} aria-label={`示范 ${i + 1}：TA 说`} /></label>
            <label><span>{name}说</span><input className="pp-in" type="text" maxLength={LIMITS.example} value={e.a} onChange={(ev) => setEx(i, 'a', ev.target.value)} aria-label={`示范 ${i + 1}：${name}说`} /></label>
            <button type="button" className="pp-x ai-exx" onClick={() => delEx(i)} aria-label={`删掉第 ${i + 1} 组示范`}>×</button>
          </div>
        ))}
        <div className="pp-chips">
          <button type="button" className="pp-chip" disabled={d.examples.length >= 3} onClick={addEx}>＋ 加一组</button>
        </div>
        <p className="pp-hint">两句都写了的才会存。</p>
      </div>

      <div className="pp-blk">
        <details className="pp-fold">
          <summary><b>AI 实际会看到什么</b><small>人设 + 此刻的状态，自动拼好</small></summary>
          <pre className="ai-prompt">{preview}</pre>
        </details>
        <p className="pp-hint">「此刻的情况」那段是示例；聊天时会换成小人当时真实的状态（时间、在干嘛、心情、礼物）。TA 的手机会拿到这份人设来向 AI 发请求，所以人设里别写不想让 TA 知道的秘密。</p>
      </div>

      <div className="pp-actions">
        <button type="button" className="btn ghost" disabled={!dirty || saving} onClick={() => setD(saved)}>还原</button>
        <button type="button" className="btn" disabled={!dirty || saving || loading} onClick={save}>{saving ? '保存中…' : '保存人设'}</button>
      </div>
    </div>
  )
}