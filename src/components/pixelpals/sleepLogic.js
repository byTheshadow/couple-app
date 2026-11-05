/* 梦海兔 · 纯逻辑（可在 node 里测，不碰 DOM）。 */
export const FISH_KEY = 'pal.sleep.fish'
export const SOUND_KEY = 'pal.sleep.sound'
export const LAST_KEY = 'pal.sleep.last'

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/** 只按「字符」截，不按字节；中文/emoji 都算一个 */
export function clipLine(s, n = 20) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  return Array.from(t).slice(0, n).join('')
}

export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const WEIGHT = { 1: 6, 2: 3, 3: 1 }

/** 先抽没钓到的；都钓到了就随机重复。seed 用整数，保证同一次抽签可复现 */
export function pickFish(list, store, seed = 1) {
  if (!list || !list.length) return null
  const caught = store || {}
  const left = list.filter((f) => !caught[f.k])
  const pool = left.length ? left : list
  let s = (Math.floor(seed) % 233280 + 233280) % 233280
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  const total = pool.reduce((a, f) => a + (WEIGHT[f.r] || 1), 0)
  let x = rnd() * total
  for (const f of pool) { x -= WEIGHT[f.r] || 1; if (x <= 0) return f }
  return pool[pool.length - 1]
}

/** 收线：按住涨、松手回退一点；到 1 就钓上来。不设失败 */
export function reelStep(g, dt, hold) {
  const r = (g && g.fish && g.fish.r) || 1
  const pull = 0.36 - r * 0.05
  const resist = 0.10 + r * 0.03
  const p = clamp((g.p || 0) + (hold ? pull : -resist) * Math.max(0, dt), 0, 1)
  return { ...g, p, done: p >= 1, idle: hold ? 0 : (g.idle || 0) + Math.max(0, dt) }
}

/** 每 3 条暗一档，最低 0.55 */
export function dimFor(caught) {
  return Math.max(0.55, 1 - Math.floor((caught || 0) / 3) * 0.08)
}

export function emptyStore() { return {} }

export function loadStore() {
  try {
    const raw = window.localStorage.getItem(FISH_KEY)
    const o = raw ? JSON.parse(raw) : null
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out = {}
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (v && typeof v === 'object' && Number.isFinite(v.n) && v.n > 0) out[k] = { n: Math.floor(v.n), at: Number(v.at) || 0 }
    }
    return out
  } catch { return {} }
}

export function saveStore(store) {
  try { window.localStorage.setItem(FISH_KEY, JSON.stringify(store || {})) } catch { /* 存不了就算了 */ }
}

export function addCatch(store, key) {
  const s = { ...(store || {}) }
  const old = s[key] || { n: 0, at: 0 }
  s[key] = { n: old.n + 1, at: Date.now() }
  return s
}

export function collectionStats(list, store) {
  const caught = list.filter((f) => store && store[f.k] && store[f.k].n > 0).length
  const total = list.length
  const stars = list.reduce((a, f) => a + Math.max(0, ((store && store[f.k] && store[f.k].n) || 0) - 1), 0)
  return { caught, total, stars, pct: total ? Math.round((caught / total) * 100) : 0 }
}

export function soundOn() {
  try { return window.localStorage.getItem(SOUND_KEY) === '1' } catch { return false }
}
export function saveSound(on) {
  try { window.localStorage.setItem(SOUND_KEY, on ? '1' : '0') } catch { /* ignore */ }
}

export function loadLast() {
  try {
    const raw = window.localStorage.getItem(LAST_KEY)
    const o = raw ? JSON.parse(raw) : null
    return o && typeof o === 'object' ? o : null
  } catch { return null }
}
export function saveLast(last) {
  try { window.localStorage.setItem(LAST_KEY, JSON.stringify(last || {})) } catch { /* ignore */ }
}

export function formatMinutes(min) {
  const m = Math.max(0, Math.round(min || 0))
  return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${m % 60} 分`
}