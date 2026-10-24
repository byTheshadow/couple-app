import { useMemo, useRef, useState } from 'react'
import { Svg } from '../Icon'
import { loadAi, saveAi, normalizeAi, normBase, aiReady, listModels, chat, SPEEDS } from './ai'
import './ai.css'

/* ===========================================================================
   AI 设置：给「去看 TA」的聊天接上 AI（OpenAI 兼容接口）。
   - 地址 / key / 模型 / 回复风格，全部只存在这台设备的 localStorage 里，不会上传
   - 「获取模型列表」调 {地址}/models；也可以直接手填模型名
   - 「测试一下」真的发一句话过去，告诉你通不通、花了多久
   用法：<AiSettings say={(text) => ...} />
   =========================================================================== */

const SPEED_NAMES = [['slow', '慢'], ['mid', '中'], ['fast', '快']]

export default function AiSettings({ say }) {
  const [saved, setSaved] = useState(loadAi)
  const [d, setD] = useState(saved)
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('') // '' | 'models' | 'test'
  const [status, setStatus] = useState(null) // { ok: bool, text }
  const run = useRef(0) // 点了新的操作，旧的结果就不要了

  const set = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const dirty = JSON.stringify(normalizeAi(d)) !== JSON.stringify(saved)
  const head = dirty ? '有改动' : aiReady(saved) ? '已设置' : '还没设置'

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? models.filter((m) => m.toLowerCase().includes(k)) : models
  }, [models, q])

  const fetchModels = async () => {
    const id = ++run.current
    setBusy('models')
    setStatus(null)
    const { error, models: list } = await listModels({ ...d, base: normBase(d.base) })
    if (id !== run.current) return
    setBusy('')
    if (error) { setStatus({ ok: false, text: error }); return }
    setModels(list)
    setStatus({ ok: true, text: `已获取 ${list.length} 个模型，点一下选用` })
    if (!d.model && list.length) {
      const pick = list.find((m) => /mini|flash|haiku|turbo|chat/i.test(m)) || list[0]
      set('model', pick)
    }
  }

  const test = async () => {
    const id = ++run.current
    setBusy('test')
    setStatus(null)
    const cfg = { ...normalizeAi(d), base: normBase(d.base) }
    const t0 = performance.now()
    const { error, text } = await chat(cfg, [{ role: 'user', content: '只回复一个字：好' }], { maxTokens: 64, allowEmpty: true })
    if (id !== run.current) return
    setBusy('')
    if (error) { setStatus({ ok: false, text: error }); return }
    const sec = ((performance.now() - t0) / 1000).toFixed(1)
    setStatus({ ok: true, text: `连通了，用时 ${sec} 秒${text ? `（AI 回了：${text.slice(0, 20)}）` : '（模型没返回文字，可能是推理模型，不影响聊天）'}` })
  }

  const save = () => {
    const next = normalizeAi({ ...d, base: normBase(d.base) || d.base })
    if (!saveAi(next)) { say('这台设备存不下（可能开了无痕模式），设置会在关掉页面后丢掉'); setSaved(next); setD(next); return }
    setSaved(next)
    setD(next)
    say('AI 设置已保存（只在这台设备上）')
  }

  const clearKey = () => {
    if (!window.confirm('清除这台设备上的 key？\n模型和其他设置会留着，重新填 key 就能用。')) return
    const next = { ...saved, key: '' }
    saveAi(next)
    setSaved(next)
    setD((x) => ({ ...x, key: '' }))
    setModels([])
    setStatus(null)
    say('key 已清除')
  }

  const cur = normalizeAi(d)

  return (
    <section className="win">
      <header className="tb">
        <Svg name="sliders" size={14} />
        <b>AI 设置.cfg</b>
        <span className="grow" />
        <span className="mono">{head}</span>
        <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
      </header>
      <div className="wb">
        <p className="pp-lead">给「去看 TA」的聊天接上 AI。支持所有 OpenAI 兼容的服务，换服务商只需要改地址和 key。</p>

        <div className="pp-blk">
          <div className="pp-h">连接 <small>填完点「获取模型列表」</small></div>
          <label className="ai-fl">接口地址（Base URL）
            <input className="pp-in ai-mono" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={d.base} onChange={(e) => set('base', e.target.value)} placeholder="https://api.openai.com/v1" aria-label="接口地址" />
          </label>
          <label className="ai-fl">API Key
            <span className="pp-inrow">
              <input className="pp-in ai-mono" type={showKey ? 'text' : 'password'} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={d.key} onChange={(e) => set('key', e.target.value)} placeholder="sk-……" aria-label="API Key" />
              <button type="button" className="pp-chip" onClick={() => setShowKey((v) => !v)}>{showKey ? '隐藏' : '显示'}</button>
            </span>
          </label>
          <div className="pp-inrow">
            <button type="button" className="btn" style={{ flex: 1 }} disabled={!!busy} onClick={fetchModels}>{busy === 'models' ? '获取中…' : '获取模型列表'}</button>
            <button type="button" className="btn ghost" disabled={!!busy || !d.key || !d.model} onClick={test}>{busy === 'test' ? '测试中…' : '测试一下'}</button>
          </div>
          {status && (
            <div className={`ai-status${status.ok ? '' : ' bad'}`} role="status">
              <span className="ai-led" />
              <span>{status.text}</span>
            </div>
          )}
        </div>

        <div className="pp-blk">
          <div className="pp-h">模型 <small>{cur.model ? <>当前：<b className="ai-mono">{cur.model}</b></> : '还没选，获取列表后点一个，或者手填'}</small></div>
          {models.length > 0 && (
            <>
              <input className="pp-in" style={{ width: '100%' }} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜一搜模型名……" aria-label="搜索模型" />
              <div className="ai-models" role="listbox" aria-label="模型列表">
                {shown.map((m) => (
                  <button key={m} type="button" role="option" aria-selected={d.model === m} className={`ai-mod${d.model === m ? ' on' : ''}`} onClick={() => set('model', m)}>
                    <span className="ai-mono">{m}</span>{d.model === m && <i>当前使用</i>}
                  </button>
                ))}
                {!shown.length && <p className="pp-hint" style={{ margin: 0, padding: '10px 12px' }}>没有匹配的，换个关键词</p>}
              </div>
            </>
          )}
          <label className="ai-fl" style={{ marginTop: models.length ? 10 : 0 }}>模型名也可以手动填（服务商不支持列表时用）
            <input className="pp-in ai-mono" type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={d.model} onChange={(e) => set('model', e.target.value)} placeholder="例如 gpt-4o-mini / deepseek-chat" aria-label="手动填写模型名" />
          </label>
        </div>

        <div className="pp-blk">
          <div className="pp-h">回复风格</div>
          <div className="ai-fl">
            <span>随机度（温度）：越高越有创意，越低越稳</span>
            <div className="ai-rg"><input type="range" min="0" max="1.5" step="0.1" value={cur.temp} onChange={(e) => set('temp', +e.target.value)} aria-label="温度" /><b>{cur.temp.toFixed(1)}</b></div>
          </div>
          <div className="ai-fl">
            <span>最长回复（字）</span>
            <div className="ai-rg"><input type="range" min="20" max="300" step="10" value={cur.maxChars} onChange={(e) => set('maxChars', +e.target.value)} aria-label="最长回复" /><b>{cur.maxChars}</b></div>
          </div>
          <div className="ai-fl">
            <span>聊天时带上多少句上文（越多越记得前面聊过什么，也越费 token）</span>
            <div className="ai-rg"><input type="range" min="0" max="20" step="2" value={cur.history} onChange={(e) => set('history', +e.target.value)} aria-label="上文条数" /><b>{cur.history} 句</b></div>
          </div>
          <div className="ai-tg">
            <div>打字机效果<small>一个字一个字蹦出来，像在打字</small></div>
            <button type="button" role="switch" aria-checked={cur.typewriter} aria-label="打字机效果" className={`ai-sw${cur.typewriter ? ' on' : ''}`} onClick={() => set('typewriter', !cur.typewriter)} />
          </div>
          {cur.typewriter && (
            <div className="ai-fl" style={{ marginTop: 12 }}>
              <span>打字速度（每个字约 {SPEEDS[cur.speed]} 毫秒）</span>
              <div className="pp-chips">
                {SPEED_NAMES.map(([k, n]) => (
                  <button key={k} type="button" className={`pp-chip${cur.speed === k ? ' on' : ''}`} onClick={() => set('speed', k)}>{n}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pp-blk">
          <p className="pp-warn">Key 只存在这台设备的浏览器里，不会传到服务器，所以你和 TA 的手机各填一次，换手机、清浏览器数据后要重新填。聊天时 key 会随请求发给你填的那个服务商，用开发者工具能在网络请求里看到它，别把截图发给别人。</p>
        </div>

        <div className="pp-actions">
          <button type="button" className="btn ghost" disabled={!saved.key && !d.key} onClick={clearKey}>清除 key</button>
          <button type="button" className="btn" disabled={!dirty} onClick={save}>保存</button>
        </div>
      </div>
    </section>
  )
}