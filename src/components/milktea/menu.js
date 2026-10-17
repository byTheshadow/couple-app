/* ===========================================================================
   奶茶店：菜单 + 小票逻辑。纯数据 + 纯函数，不依赖 three / React。
   3D 场景（scene.js）、点单页（MilkTea.jsx）、小票（MilkTeaTicket.jsx）共用这一份，
   以后加茶底 / 小料 / 甜度只改这里（小料的 3D 外形在 scene.js 的 TOP_MAKE 里按 id 对应）。

   寄出时放进信的 payload 的形状（kind = 'milktea'）：
   { v: 1, shop: 'US', no: 'A042', at: ISO, size, tea, sweet, milk, tops: [id…],
     shakes, straw, note, eta: ISO, price, snap: 'data:image/webp;base64,…' }
   =========================================================================== */

export const SIZES = {
  mid: { id: 'mid', label: '中杯', h: 1.9, rb: 0.5, rt: 0.68, price: 0 },
  big: { id: 'big', label: '大杯', h: 2.25, rb: 0.57, rt: 0.78, price: 3 },
}

export const TEAS = [
  { id: 'red', name: '红茶', color: 0x9c5a32 },
  { id: 'oolong', name: '乌龙', color: 0xb98247 },
  { id: 'matcha', name: '抹茶', color: 0x7fa557 },
  { id: 'taro', name: '芋泥', color: 0x9d7fcd },
]

// 甜度：pct 只用来决定糖浆倒多久、茶色亮多少，存进信里的是 id
export const SWEETS = [
  { id: 'none', name: '无糖', pct: 0 },
  { id: 'low', name: '微糖', pct: 30 },
  { id: 'half', name: '半糖', pct: 50 },
  { id: 'less', name: '少糖', pct: 70 },
  { id: 'full', name: '全糖', pct: 100 },
]

export const MILKS = [
  { id: 'milk', name: '鲜奶', color: 0xf7ece0, mixc: 0xe8c9a3, price: 2 },
  { id: 'foam', name: '奶盖', color: 0xfdf3e4, mixc: 0xdcb98f, price: 4 },
  { id: 'none', name: '清茶', color: null, mixc: null, price: 0 },
]

export const TOPPINGS = [
  { id: 'pearl', name: '珍珠', price: 3, css: '#2a1a14', n: 16 },
  { id: 'taro', name: '芋圆', price: 5, css: '#b98ade', n: 11 },
  { id: 'coco', name: '椰果', price: 4, css: '#fdf7ee', n: 11 },
  { id: 'pud', name: '布丁', price: 5, css: '#f5c95e', n: 7 },
  { id: 'bean', name: '红豆', price: 3, css: '#8e3a3f', n: 20 },
  { id: 'jelly', name: '仙草', price: 4, css: '#241c22', n: 10 },
]

export const STRAWS = ['#f06f9a', '#4aa3df', '#f2c94c', '#5fb878']
export const STRAW_NAMES = ['粉色吸管', '蓝色吸管', '黄色吸管', '绿色吸管']

export const BASE_PRICE = 16
export const MAX_TOPS = 3
export const MAX_NOTE = 60
export const SHAKES_NEEDED = 5

export const hexCss = (n) => '#' + n.toString(16).padStart(6, '0')

const byId = (list, id) => list.find((x) => x.id === id)

/* ---------- 价格 / 文案 ---------- */

export function priceOf(o) {
  const size = SIZES[o.size] || SIZES.mid
  const milk = byId(MILKS, o.milk)
  let p = BASE_PRICE + size.price + (milk ? milk.price : 0)
  ;(o.tops || []).forEach((id) => { const t = byId(TOPPINGS, id); if (t) p += t.price })
  return p
}

// 小票上的明细行：[{ label, price }]，price 为 0 时小票显示「—」
export function lineItems(o) {
  const size = SIZES[o.size] || SIZES.mid
  const tea = byId(TEAS, o.tea) || TEAS[0]
  const sweet = byId(SWEETS, o.sweet) || SWEETS[2]
  const milk = byId(MILKS, o.milk) || MILKS[2]
  const rows = [{ label: `${tea.name} · 手作茶底`, price: BASE_PRICE }]
  if (size.price) rows.push({ label: `${size.label}加大`, price: size.price })
  else rows.push({ label: size.label, price: 0 })
  rows.push({ label: sweet.name, price: 0 })
  if (milk.id !== 'none') rows.push({ label: milk.name, price: milk.price })
  const counts = {}
  ;(o.tops || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1 })
  Object.keys(counts).forEach((id) => {
    const t = byId(TOPPINGS, id)
    if (t) rows.push({ label: counts[id] > 1 ? `${t.name} ×${counts[id]}` : t.name, price: t.price * counts[id] })
  })
  return rows
}

// 信封上的标题：「大杯红茶鲜奶珍珠」，最多 16 个字
export function makeTitle(o) {
  const size = SIZES[o.size] || SIZES.mid
  const tea = byId(TEAS, o.tea) || TEAS[0]
  const milk = byId(MILKS, o.milk)
  const uniq = [...new Set((o.tops || []).map((id) => (byId(TOPPINGS, id) || {}).name).filter(Boolean))]
  return `${size.label}${tea.name}${milk && milk.id !== 'none' ? milk.name : ''}${uniq.join('')}`.slice(0, 16)
}

export const newOrderNo = () => 'A' + String(100 + Math.floor(Math.random() * 900))

/* ---------- 出发时间 ---------- */

// choice：{ mode: 'rel', min: 30 } 或 { mode: 'abs', hhmm: '18:30' }
// 自选的钟点如果已经过了（或不到 1 分钟后），就算明天的这个钟点
export function computeEta(choice, nowMs = Date.now()) {
  if (!choice) return null
  if (choice.mode === 'rel') return new Date(nowMs + Math.max(1, Number(choice.min) || 0) * 60000)
  const m = /^(\d{1,2}):(\d{2})$/.exec(choice.hhmm || '')
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  const d = new Date(nowMs)
  d.setHours(h, mi, 0, 0)
  if (d.getTime() <= nowMs + 60000) d.setDate(d.getDate() + 1)
  return d
}

const pad2 = (n) => String(n).padStart(2, '0')

// 倒计时文案：{ done, text }
export function countdown(etaMs, nowMs = Date.now()) {
  const diff = etaMs - nowMs
  if (diff <= 0) return { done: true, text: '应该到啦' }
  const s = Math.floor(diff / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return { done: false, text: `${d} 天 ${h} 小时` }
  return { done: false, text: `${pad2(h)}:${pad2(m)}:${pad2(sec)}` }
}

// 「今天 18:40」/「明天 09:00」/「10月20日 09:00」
export function fmtEta(etaMs, nowMs = Date.now()) {
  const e = new Date(etaMs)
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((startOf(e) - startOf(new Date(nowMs))) / 86400000)
  const day = diff === 0 ? '今天' : diff === 1 ? '明天' : `${e.getMonth() + 1}月${e.getDate()}日`
  return `${day} ${pad2(e.getHours())}:${pad2(e.getMinutes())}`
}

export function fmtStamp(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/* ---------- 解包 ---------- */

// 小票内容来自服务端，所以逐项校验；认不出的字段退回默认值。完全不是对象时返回 null
export function normalizeOrder(p) {
  if (!p || typeof p !== 'object') return null
  const size = SIZES[p.size] ? p.size : 'mid'
  const tea = byId(TEAS, p.tea) ? p.tea : 'red'
  const sweet = byId(SWEETS, p.sweet) ? p.sweet : 'half'
  const milk = byId(MILKS, p.milk) ? p.milk : 'none'
  const tops = Array.isArray(p.tops) ? p.tops.filter((id) => byId(TOPPINGS, id)).slice(0, MAX_TOPS) : []
  const straw = Number.isInteger(p.straw) && p.straw >= 0 && p.straw < STRAWS.length ? p.straw : 0
  const shakes = Number.isFinite(p.shakes) ? Math.max(0, Math.min(99, Math.round(p.shakes))) : 0
  const note = typeof p.note === 'string' ? p.note.slice(0, MAX_NOTE) : ''
  const eta = typeof p.eta === 'string' && Number.isFinite(Date.parse(p.eta)) ? p.eta : null
  const at = typeof p.at === 'string' && Number.isFinite(Date.parse(p.at)) ? p.at : null
  const no = typeof p.no === 'string' ? p.no.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() : ''
  const base = { size, tea, sweet, milk, tops }
  const price = Number.isFinite(p.price) ? Math.max(0, Math.min(999, Math.round(p.price))) : priceOf(base)
  // 杯子快照是 data URL，只放行图片格式，并限制体积
  const snap = typeof p.snap === 'string' && p.snap.length < 90000 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.snap) ? p.snap : ''
  return { ...base, straw, shakes, note, eta, at, no: no || 'A000', price, snap }
}