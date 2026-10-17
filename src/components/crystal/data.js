/* ===========================================================================
   水晶球：数据 + 校验。纯数据 + 纯函数，不依赖 three / React。
   3D 场景（scene.js）、摆件（items.js）、页面（Crystal.jsx）、摆件架（shelf.js）共用这一份。
   以后加景色 / 飘落物 / 底座 / 音色，只改这里；加新摆件：items.js 里写 BUILD.xxx，再到下面 ITEMS 里加一行。

   一颗球的数据（globe）：
   { env, fall, base, sound, note,
     items: [{ t, x, z, rot, s }…] }          x、z 是离球心的距离（0~0.8，单位是地面半径），s 是大小 0.55~1.6

   寄出时放进信的 payload 的形状（kind = 'crystal'）：
   { v: 1, globe, thumb: 'data:image/webp;base64,…' }
   服务器返回的 payload、摆件架里取出来的球，一律先过 normalizeGlobe / normalizePayload。
   =========================================================================== */

export const MAX_ITEMS = 12
export const MAX_NOTE = 16
export const MAX_SHELF = 12
export const MAX_JSON = 120000
export const MAX_THUMB = 90000
export const REACH = 0.8 // 摆件离球心的最远距离（和 scene.js 里 PR / GR 对得上）

/* ---------------------------------------------------------------- 景色 */
export const ENVS = [
  { id: 'snownight', name: '雪夜', em: '❄',
    sky: ['#0d1430', '#243a63', '#4a6a96'], ground: 0xf2f6ff, star: 1, moon: 1,
    hemi: [0x9fc4ff, 0x2a3350, 0.55], dir: [0xcfe0ff, 0.75, [-2, 3, 2]], amb: 0x1a2440, exp: 1.02 },
  { id: 'clearday', name: '晴日', em: '☀',
    sky: ['#9fd4f5', '#cfe9fb', '#f3f0e4'], ground: 0xeaf3ea, star: 0, moon: 0,
    hemi: [0xffffff, 0x8f9a86, 0.85], dir: [0xfff1d8, 1.25, [2.4, 3.4, 1.8]], amb: 0xbcd6ea, exp: 1.08 },
  { id: 'dusk', name: '黄昏', em: '🌇',
    sky: ['#2a1b3d', '#a24a5c', '#f2a65a'], ground: 0xe6cdb0, star: 0, moon: 0,
    hemi: [0xffb98a, 0x4a2d3a, 0.7], dir: [0xffa05c, 1.1, [-2.8, 1.8, 1.4]], amb: 0x6b3a4a, exp: 1.1 },
  { id: 'aurora', name: '极光', em: '🌌',
    sky: ['#040a18', '#0b2a3a', '#123a3a'], ground: 0xe8f1f6, star: 1, moon: 0, aur: 1,
    hemi: [0x7cf3c6, 0x101a2a, 0.5], dir: [0x9ad8ff, 0.5, [-1.6, 2.6, 2.2]], amb: 0x0d2030, exp: 1.14 },
  { id: 'sakura', name: '樱花', em: '🌸',
    sky: ['#3b2340', '#9a4e74', '#f6c3cf'], ground: 0xf7e2e7, star: 0, moon: 1,
    hemi: [0xffd3e2, 0x4a2e3e, 0.72], dir: [0xffd9e6, 0.95, [1.8, 3, 2]], amb: 0x5e3346, exp: 1.08 },
  { id: 'ocean', name: '海边', em: '🌊',
    sky: ['#0a2a47', '#1f6f96', '#8fd3d6'], ground: 0xe8d8b4, star: 0, moon: 0, sea: 1,
    hemi: [0x9fe3e8, 0x1d4455, 0.7], dir: [0xfff0cc, 1.0, [2.2, 3, -1.4]], amb: 0x14415a, exp: 1.06 },
]

/* ------------------------------------------------------------ 飘落物 */
export const FALLS = [
  { id: 'snow', name: '雪', em: '❄', n: 520, size: 0.062, color: 0xffffff, add: false, mode: 'fall', vy: [0.1, 0.26], spin: 0.5, sprite: 'disc' },
  { id: 'rain', name: '雨', em: '💧', n: 420, size: 0.05, color: 0xbfd8f0, add: true, mode: 'fall', vy: [0.9, 1.5], spin: 0, sprite: 'streak' },
  { id: 'petal', name: '花瓣', em: '🌸', n: 300, size: 0.085, color: 0xffc8d8, add: false, mode: 'fall', vy: [0.1, 0.2], spin: 1.3, sprite: 'petal' },
  { id: 'star', name: '星屑', em: '✦', n: 320, size: 0.075, color: 0xffe7a8, add: true, mode: 'fall', vy: [0.06, 0.16], spin: 0.3, sprite: 'spark' },
  { id: 'fire', name: '萤火', em: '🪰', n: 70, size: 0.1, color: 0xc8ff8a, add: true, mode: 'float', vy: [0.02, 0.06], spin: 0, sprite: 'glow' },
  { id: 'bubble', name: '气泡', em: '○', n: 180, size: 0.07, color: 0xc8f2ff, add: true, mode: 'rise', vy: [0.14, 0.34], spin: 0, sprite: 'ring' },
  { id: 'none', name: '无', em: '·', n: 0, size: 0.05, color: 0xffffff, add: false, mode: 'fall', vy: [0, 0], spin: 0, sprite: 'disc' },
]

/* -------------------------------------------------------------- 底座 */
export const BASES = [
  { id: 'wood', name: '胡桃木', em: '🟫', col: 0x7a4a2c, col2: 0x5c3620, metal: 0.05, rough: 0.6, ring: 0xd9b067 },
  { id: 'brass', name: '黄铜', em: '🟡', col: 0xc9a14a, col2: 0x8e6c28, metal: 0.85, rough: 0.3, ring: 0xf0dca0 },
  { id: 'stone', name: '白石', em: '⬜', col: 0xdedad2, col2: 0xb8b3aa, metal: 0.02, rough: 0.8, ring: 0xa8a49c },
  { id: 'ink', name: '墨黑', em: '⬛', col: 0x24242a, col2: 0x141418, metal: 0.4, rough: 0.35, ring: 0x6f7380 },
]

/* -------------------------------------------------------------- 音色 */
export const SOUNDS = [
  { id: 'none', name: '静音', em: '🔇' },
  { id: 'rain', name: '屋檐雨', em: '🌧' },
  { id: 'wave', name: '海浪', em: '🌊' },
  { id: 'fire', name: '壁炉', em: '🔥' },
  { id: 'chime', name: '风铃', em: '🎐' },
  { id: 'box', name: '八音盒', em: '🎵' },
  { id: 'wind', name: '雪原风', em: '🌬' },
]

/* ------------------------------------------------------- 摆件名录（外形在 items.js） */
export const ITEMS = [
  { t: 'cabin', name: '小木屋', em: '🏠' },
  { t: 'pine', name: '松树', em: '🌲' },
  { t: 'lamp', name: '路灯', em: '💡' },
  { t: 'snowman', name: '雪人', em: '⛄' },
  { t: 'bench', name: '长椅', em: '🪑' },
  { t: 'deer', name: '小鹿', em: '🦌' },
  { t: 'cat', name: '猫', em: '🐈' },
  { t: 'tower', name: '灯塔', em: '🗼' },
  { t: 'post', name: '信箱', em: '📮' },
  { t: 'torii', name: '鸟居', em: '⛩' },
  { t: 'shroom', name: '蘑菇', em: '🍄' },
  { t: 'boat', name: '小船', em: '⛵' },
]
export const ITEM_OF = (t) => ITEMS.find((x) => x.t === t) || ITEMS[0]

/* 默认开局：一屋一树一灯 */
export const DEFAULT_GLOBE = () => ({
  env: 'snownight', fall: 'snow', base: 'wood', sound: 'rain', note: '',
  items: [
    { t: 'cabin', x: -0.18, z: -0.1, rot: 0.5, s: 1 },
    { t: 'pine', x: 0.42, z: -0.3, rot: 0, s: 1.05 },
    { t: 'pine', x: 0.62, z: 0.1, rot: 0, s: 0.8 },
    { t: 'lamp', x: -0.02, z: 0.46, rot: 0, s: 1 },
    { t: 'snowman', x: 0.2, z: 0.5, rot: -0.6, s: 1 },
  ],
})

/* 摆件架上内置的几个（用户自己存的会追加在后面） */
export const PRESETS = [
  { id: 'p1', name: '雪夜小屋', ro: 1, g: DEFAULT_GLOBE() },
  { id: 'p2', name: '海边的下午', ro: 1, g: { env: 'ocean', fall: 'bubble', base: 'brass', sound: 'wave', note: '',
    items: [{ t: 'boat', x: 0.3, z: 0.22, rot: 0.4, s: 1.1 }, { t: 'tower', x: -0.5, z: -0.3, rot: 0, s: 1 }, { t: 'bench', x: 0.08, z: 0.6, rot: -0.3, s: 1 }] } },
  { id: 'p3', name: '樱花树下', ro: 1, g: { env: 'sakura', fall: 'petal', base: 'ink', sound: 'chime', note: '',
    items: [{ t: 'torii', x: -0.1, z: -0.42, rot: 0, s: 1.1 }, { t: 'pine', x: 0.55, z: -0.1, rot: 0, s: 0.9 }, { t: 'cat', x: 0.12, z: 0.44, rot: 2.2, s: 1 }, { t: 'shroom', x: -0.55, z: 0.25, rot: 0, s: 1 }] } },
]

/* ---------------------------------------------------------------- 校验 */
const hasId = (list, id) => list.some((x) => x.id === id)
const hasItem = (t) => ITEMS.some((x) => x.t === t)
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clampN = (v, a, b) => Math.max(a, Math.min(b, v))

// 去掉控制字符和首尾空白，限制长度（按字符数，不会把汉字劈成两半）
export function cleanNote(s, max = MAX_NOTE) {
  if (typeof s !== 'string') return ''
  return Array.from(s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, max).join('')
}

/** 把任意来源（服务器 / 摆件架 / 本机草稿）的球整理成干净的 globe；认不出来就返回 null */
export function normalizeGlobe(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const base = DEFAULT_GLOBE()
  const g = {
    env: hasId(ENVS, raw.env) ? raw.env : base.env,
    fall: hasId(FALLS, raw.fall) ? raw.fall : base.fall,
    base: hasId(BASES, raw.base) ? raw.base : base.base,
    sound: hasId(SOUNDS, raw.sound) ? raw.sound : 'none',
    note: cleanNote(raw.note),
    items: [],
  }
  const list = Array.isArray(raw.items) ? raw.items : []
  for (const it of list) {
    if (g.items.length >= MAX_ITEMS) break
    if (!it || typeof it !== 'object' || !hasItem(it.t)) continue
    let x = num(it.x, 0)
    let z = num(it.z, 0)
    const r = Math.hypot(x, z)
    if (r > REACH) { x = (x * REACH) / r; z = (z * REACH) / r }
    g.items.push({
      t: it.t,
      x: Math.round(x * 1000) / 1000,
      z: Math.round(z * 1000) / 1000,
      rot: Math.round(clampN(num(it.rot, 0), -60, 60) * 1000) / 1000,
      s: Math.round(clampN(num(it.s, 1), 0.55, 1.6) * 1000) / 1000,
    })
  }
  return g
}

const THUMB_RE = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/

/** 信里的 payload → { globe, thumb }；球认不出来就返回 null（拆信时显示「打不开」） */
export function normalizePayload(p) {
  if (!p || typeof p !== 'object') return null
  const globe = normalizeGlobe(p.globe)
  if (!globe) return null
  const thumb = typeof p.thumb === 'string' && p.thumb.length <= MAX_THUMB && THUMB_RE.test(p.thumb) ? p.thumb : ''
  return { globe, thumb }
}

/* ---------------------------------------------------------------- 文案 */
const envName = (g) => (ENVS.find((e) => e.id === g.env) || ENVS[0]).name
const fallName = (g) => (FALLS.find((f) => f.id === g.fall) || FALLS[0]).name

// 信的标题 / 摆件架里的名字：有底座上那句话就用它，没有就用「景色里的水晶球」
export const makeTitle = (g) => (g.note ? g.note : `${envName(g)}里的水晶球`)
// letter_bodies.body 不能为空，没有留言时放一句默认的
export const makeBody = (g) => g.note || '一颗水晶球'
export const describe = (g) => `${envName(g)} · ${fallName(g)}`