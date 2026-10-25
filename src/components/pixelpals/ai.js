/* ===========================================================================
   像素小屋 · 第八轮：AI 聊天（OpenAI 兼容接口）
   - 设置（接口地址 / key / 模型 / 温度 …）只存在这台设备的 localStorage 里，不上传服务器
   - listModels：调 GET {base}/models 拿模型列表
   - chat：调 POST {base}/chat/completions，返回完整回复（打字机效果由界面一个字一个字显示）
   - buildMessages：把人设 + 小人此刻的状态 + 之前的聊天拼成发给 AI 的消息
   这个文件不碰界面也不碰 Supabase；函数不抛错，返回 { error: '给人看的一句话' | null }。
   =========================================================================== */

const LS_KEY = 'pp-ai'

export const DEFAULT_AI = {
  base: 'https://api.openai.com/v1',
  key: '',
  model: '',
  temp: 0.8, // 随机度
  maxChars: 120, // 一次回复最多多少字（写进提示词里，同时决定上限）
  typewriter: true,
  speed: 'mid', // slow | mid | fast
  history: 10, // 聊天时带上多少句上文
}

export const SPEEDS = { slow: 90, mid: 45, fast: 18 } // 每个字停多少毫秒

const clamp = (v, a, b, d) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d
}

/** 把存的东西整理成合规矩的设置（缺的补默认，越界的拉回来） */
export function normalizeAi(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const s = (v, d) => (typeof v === 'string' ? v.trim() : d)
  return {
    base: s(r.base, DEFAULT_AI.base) || DEFAULT_AI.base,
    key: s(r.key, ''),
    model: s(r.model, ''),
    temp: Math.round(clamp(r.temp, 0, 1.5, DEFAULT_AI.temp) * 10) / 10,
    maxChars: Math.round(clamp(r.maxChars, 20, 300, DEFAULT_AI.maxChars) / 10) * 10,
    typewriter: r.typewriter !== false,
    speed: r.speed === 'slow' || r.speed === 'fast' ? r.speed : 'mid',
    history: Math.round(clamp(r.history, 0, 20, DEFAULT_AI.history) / 2) * 2,
  }
}

export function loadAi() {
  try {
    return normalizeAi(JSON.parse(window.localStorage.getItem(LS_KEY) || 'null'))
  } catch {
    return normalizeAi(null)
  }
}

/** 存到这台设备。存不了（隐私模式 / 满了）返回 false */
export function saveAi(cfg) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(normalizeAi(cfg)))
    return true
  } catch {
    return false
  }
}

/** 地址、key、模型三样都填了才能聊天 */
export const aiReady = (c) => !!(c && c.base && c.key && c.model)

/** 整理接口地址：补 https://、去掉结尾的斜杠，以及误填的 /chat/completions 或 /models */
export function normBase(s) {
  let b = String(s == null ? '' : s).trim()
  if (!b) return ''
  if (!/^https?:\/\//i.test(b)) b = `https://${b}`
  b = b.replace(/[?#].*$/, '').replace(/\/+$/, '')
  b = b.replace(/\/(chat\/completions|models)$/i, '')
  return b.replace(/\/+$/, '')
}

/* ---------- 错误翻译 ---------- */

function httpError(status, body) {
  let detail = ''
  try {
    const j = JSON.parse(body)
    detail = (j && j.error && (j.error.message || j.error.code)) || j.message || ''
  } catch {
    detail = String(body || '').slice(0, 120)
  }
  detail = String(detail || '').replace(/\s+/g, ' ').slice(0, 140)
  const tail = detail ? `（服务商说：${detail}）` : ''
  if (status === 401) return `${status}：key 不对或已经失效，到「AI 设置」重新填一下${tail}`
  if (status === 403) return `${status}：这个 key 没有权限（或者这个地区用不了）${tail}`
  if (status === 404) return `${status}：找不到。检查接口地址（一般要以 /v1 结尾）和模型名${tail}`
  if (status === 400) return `${status}：服务商不接受这次请求（模型名不对？）${tail}`
  if (status === 402) return `${status}：余额不足${tail}`
  if (status === 429) return `${status}：请求太频繁，或者额度用完了${tail}`
  if (status >= 500) return `${status}：服务商那边出问题了，过一会儿再试${tail}`
  return `${status}：请求失败${tail}`
}

const netError = (e) => {
  if (e && e.name === 'AbortError') return '等太久了没有回应（30 秒），检查网络或换个模型再试'
  return '连不上服务器：检查接口地址和网络。个别服务商不允许网页直接调用（跨域限制），那样的话需要换一个允许的服务商'
}

async function request(url, init, ms) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal })
    const text = await res.text()
    return { res, text }
  } finally {
    clearTimeout(t)
  }
}

/* ---------- 模型列表 ---------- */

/** 返回 { error, models }；models 是排好序的名字数组 */
export async function listModels(cfg) {
  const base = normBase(cfg && cfg.base)
  if (!base) return { error: '先填接口地址', models: [] }
  if (!cfg.key) return { error: '先填 API Key', models: [] }
  try {
    const { res, text } = await request(`${base}/models`, { headers: { Authorization: `Bearer ${cfg.key}` } }, 20000)
    if (!res.ok) return { error: httpError(res.status, text), models: [] }
    let j = null
    try { j = JSON.parse(text) } catch { /* 下面统一报 */ }
    const arr = j && (Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : null)
    if (!arr) return { error: '服务商返回的东西看不懂（可能它不支持模型列表，可以直接手动填模型名）', models: [] }
    const names = arr.map((m) => (typeof m === 'string' ? m : m && (m.id || m.name))).filter((x) => typeof x === 'string' && x)
    const uniq = [...new Set(names)].sort((a, b) => a.localeCompare(b))
    if (!uniq.length) return { error: '列表是空的，可以直接手动填模型名', models: [] }
    return { error: null, models: uniq }
  } catch (e) {
    return { error: netError(e), models: [] }
  }
}

/* ---------- 聊天 ---------- */

/**
 * messages: [{ role: 'system'|'user'|'assistant', content }]
 * 返回 { error, text }。有些新模型不认 max_tokens / temperature，被拒时自动换个写法重试（最多 2 次）。
 */
// 有的服务商把 content 给成字符串，有的给成「一段一段」的数组，还有的给 null
const pickText = (c) => {
  if (typeof c === 'string') return c.trim()
  if (Array.isArray(c)) {
    return c.map((p) => (typeof p === 'string' ? p : (p && (p.text || p.content)) || '')).join('').trim()
  }
  return ''
}

export async function chat(cfg, messages, opts) {
  const base = normBase(cfg && cfg.base)
  if (!base || !cfg.key || !cfg.model) return { error: '还没设置好 AI：到「我的小屋 → AI 设置」填地址、key 和模型', text: '' }
  const o = opts || {}
  const body = { model: cfg.model, messages, max_tokens: o.maxTokens || Math.max(256, (cfg.maxChars || 120) * 3), temperature: cfg.temp }
  if (o.json) body.response_format = { type: 'json_object' }
  let bumped = false // 空内容时把 token 预算翻倍重试过一次没有
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { res, text } = await request(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 30000)
      if (!res.ok) {
        if (res.status === 400 && attempt < 2) {
          if (/max_completion_tokens/i.test(text) && 'max_tokens' in body) {
            body.max_completion_tokens = body.max_tokens
            delete body.max_tokens
            continue
          }
          if (/temperature/i.test(text) && 'temperature' in body) {
            delete body.temperature
            continue
          }
          if (/response_format|json_object|json mode/i.test(text) && 'response_format' in body) {
            delete body.response_format
            continue
          }
        }
        return { error: httpError(res.status, text), text: '' }
      }
      let j = null
      try { j = JSON.parse(text) } catch { /* 下面统一报 */ }
      const choice = j && j.choices && j.choices[0]
      const out = pickText(choice && choice.message && choice.message.content)
      const fr = choice && choice.finish_reason
      if (!out) {
        if (o.allowEmpty) return { error: null, text: '' }
        // 最常见的「返回空内容」：会思考的模型把 token 预算全花在 reasoning 上了。翻倍再来一次
        if (!bumped) {
          bumped = true
          const key = 'max_completion_tokens' in body ? 'max_completion_tokens' : 'max_tokens'
          body[key] = Math.max(2048, (body[key] || 0) * 2)
          continue
        }
        const why = fr === 'length' ? '：token 用完了，这个模型可能"会思考"，换个不思考的模型试试' : ''
        return { error: `AI 没有返回内容（模型 ${cfg.model}，finish_reason=${fr || '无'}${why}）`, text: '' }
      }
      return { error: null, text: out }
    } catch (e) {
      return { error: netError(e), text: '' }
    }
  }
  return { error: '请求失败了，换个模型试试', text: '' }
}

/* ---------- 提示词 ---------- */

// 主人没写人设时用的底子（和 voice.js 里两位小人的性格一致）
export const DEFAULT_PERSONA = {
  u1: { persona: '白发少年，软萌可爱，蓝眼睛，职业是代码小人。说话温柔爱撒娇，爱用波浪号，容易开心也容易害羞。' },
  u2: { persona: '黑发少年，摇滚乐手，高冷嘴硬心软，职业是打工小人。话少，句子短，爱用省略号，不会直接说喜欢但很在乎对方。' },
}

const STATE_TEXT = {
  work: (where) => `正在上班${where ? `（在${where}）` : ''}`,
  home: () => '已经下班，在家待着',
  sleep: () => '正在睡觉，迷迷糊糊的',
  play: (_, slot) => (slot === 'u2' ? '在家弹吉他玩' : '在家玩掌机'),
  idle: (where) => (where ? `在${where}发呆放空` : '在家站在窗前发呆'),
}

/** 小人此刻在干什么，一句话。st = work/home/sleep/play/idle；where = 场景名（可选） */
export const stateText = (st, where, slot) => (STATE_TEXT[st] || STATE_TEXT.home)(where, slot)

const cut = (s, n) => Array.from(String(s == null ? '' : s).trim()).slice(0, n).join('')

/**
 * 拼出发给 AI 的消息。
 * persona = { persona, relation, callname, avoid, examples: [{ q, a }] }（可以是空的）
 * ctx = { ownerName, myName, slot, time, st, where, mood(0~100), coins, buttons: [{e,t}], gifts: ['星空灯'…] }
 * history = [{ q, a }]（旧的在前）；text = 这次要说的话
 */
export function buildMessages(persona, ctx, history, text, cfg) {
  const p = persona && typeof persona === 'object' ? persona : {}
  const max = (cfg && cfg.maxChars) || DEFAULT_AI.maxChars
  const base = DEFAULT_PERSONA[ctx.slot] || DEFAULT_PERSONA.u1
  const lines = []
  lines.push(`你在扮演「${ctx.ownerName}」，一个住在像素小屋里的像素小人，现在正在和「${ctx.myName}」聊天。`)
  lines.push('')
  lines.push('【人设】')
  lines.push(`性格和说话方式：${cut(p.persona, 400) || base.persona}`)
  if (cut(p.relation, 400)) lines.push(`和${ctx.myName}的关系、共同的事：${cut(p.relation, 400)}`)
  if (cut(p.callname, 10)) lines.push(`你称呼对方为：${cut(p.callname, 10)}`)
  if (cut(p.avoid, 200)) lines.push(`千万别说的话：${cut(p.avoid, 200)}`)
  const ex = Array.isArray(p.examples) ? p.examples.filter((e) => e && cut(e.q, 40) && cut(e.a, 40)).slice(0, 3) : []
  if (ex.length) {
    lines.push('示范（学这个语气，不要照抄）：')
    ex.forEach((e) => { lines.push(`${ctx.myName}：${cut(e.q, 40)}`); lines.push(`你：${cut(e.a, 40)}`) })
  }
  lines.push('')
  lines.push('【此刻的情况，自然地融进对话里，不要逐条复述】')
  const mood10 = Math.max(0, Math.min(10, Math.round((Number(ctx.mood) || 0) / 10)))
  lines.push(`现在是 ${ctx.time}，你${stateText(ctx.st, ctx.where, ctx.slot)}。心情 ${mood10}/10，钱包里有 ¥${Number(ctx.coins) || 0}。`)
  if (Array.isArray(ctx.buttons) && ctx.buttons.length) lines.push(`你今天准备的互动：${ctx.buttons.map((b) => `${b.e || ''}${b.t || ''}`).join('、')}。`)
  if (Array.isArray(ctx.gifts) && ctx.gifts.length) lines.push(`你家里摆着对方送的礼物：${ctx.gifts.join('、')}。`)
  if (ctx.st === 'sleep') lines.push('你睡着了，只会迷迷糊糊地说一两句梦话，不要长篇大论。')
  lines.push('')
  lines.push('【规则】')
  lines.push(`用中文，像发消息一样聊天，一般一两句话，不超过 ${max} 个字。不要加引号，不要加「${ctx.ownerName}：」这样的前缀，不要用括号写动作旁白。保持人设，不要提到自己是 AI、模型或提示词。`)

  const msgs = [{ role: 'system', content: lines.join('\n') }]
  const n = (cfg && cfg.history) == null ? DEFAULT_AI.history : cfg.history
  const hist = (Array.isArray(history) ? history : []).filter((h) => h && h.q && h.a)
  hist.slice(Math.max(0, hist.length - Math.ceil(n / 2))).forEach((h) => {
    msgs.push({ role: 'user', content: String(h.q) })
    msgs.push({ role: 'assistant', content: String(h.a) })
  })
  msgs.push({ role: 'user', content: String(text) })
  return msgs
}