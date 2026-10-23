/* ===========================================================================
   像素小屋 · 数据 + 画面
   这个文件不碰界面也不碰服务器：只放常量、默认值、整理数据的小函数，和把小人/场景画到 canvas 上的代码。
   画布固定 160×120（像素风，CSS 里放大）。地面线 FLOOR = 98。
   user1 = 代码小人（白发少年，软萌可爱、蓝眼睛）；user2 = 打工小人（黑发少年，摇滚乐手、高冷）。
   「是谁」决定职业和庆祝动画（代码小人 / 打工小人），「什么性格」决定互动按钮、台词（见 voice.js）。
   =========================================================================== */

export const W = 160
export const H = 120
export const FLOOR = 98

// 场景（数据）、礼物、窗和天空都放在 scenes.js；这里重新导出，别的文件照旧从 art.js 里拿
import { SCENES, SCENE_ICON, SCENE_LIST, GIFTS, drawWindow, drawGifts, drawGiftGlows, drawScene, sceneSpot, isDataScene } from './scenes'
export { SCENES, SCENE_ICON, SCENE_LIST, GIFTS }

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const rand = (a, b) => a + Math.random() * (b - a)
export const pick = (a) => a[Math.floor(Math.random() * a.length)]
export const pad2 = (n) => String(n).padStart(2, '0')

function R(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }
function pat(ctx, rows, map, x, y) {
  x = Math.round(x); y = Math.round(y)
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < rows[r].length; i++) {
      const ch = rows[r][i]
      if (ch === '.') continue
      ctx.fillStyle = map[ch]
      ctx.fillRect(x + i, y + r, 1, 1)
    }
  }
}

/* ---------- 数据 ---------- */

export const THEMES = {
  cream: { n: '奶油', wall: '#f4e7d4', dot: '#ead5ba', base: '#e2d2bd', blanket: '#ff9fb6', rug: '#f3bccb' },
  mint: { n: '薄荷', wall: '#d4efe1', dot: '#bde2cf', base: '#b9dcc9', blanket: '#73c9a8', rug: '#a6dac3' },
  night: { n: '星空', wall: '#2d345f', dot: '#55609a', base: '#222849', blanket: '#7c6cff', rug: '#5b4f9e' },
}

export const CHARS = {
  u1: { job: 'coder', jobName: '代码小人' },
  u2: { job: 'worker', jobName: '打工小人' },
}

export const DEFAULT_BUTTONS = {
  u1: [{ e: '🫳', t: '摸摸头' }, { e: '🍬', t: '给颗糖' }, { e: '📣', t: '喊加油' }], // 白发 · 软萌
  u2: [{ e: '🤘', t: '碰个拳' }, { e: '☕', t: '递杯咖啡' }, { e: '🎸', t: '弹一段' }], // 黑发 · 摇滚
}

export const DEFAULT_SETTINGS = {
  work_scene: 'office',
  idle_scene: null, // 第五轮：放空时去哪（null = 在家窗前，和以前一样；也可以是任何一个场景）
  home_theme: 'cream',
  wake_h: 6,
  work_h: 7,
  off_h: 17,
  sleep_h: 23,
  // 第四轮：在家的时间里可以各安排一段「玩耍」「放空」（都可以不设，null = 没有）
  play_from: null,
  play_to: null,
  idle_from: null,
  idle_to: null,
  // 第四轮：被戳反应。{ work: [], home: [], sleep: [], annoyed: [] }，没写的那套用 voice.js 里的默认台词
  poke_lines: {},
}

export const DEFAULT_STATE = { mood: 70, coins: 100, gifts: [], mood_at: null }

// 心情随时间慢慢往下掉（每小时掉几点）。第三轮会和服务端对齐，这一轮只是显示用
export const MOOD_DECAY_PER_HOUR = 2

/* ---------- 整理数据（服务器返回的、用户输入的，都过一遍） ---------- */

const clampH = (v, d) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : d
}

export const cleanEmoji = (s) => Array.from(String(s == null ? '' : s).trim()).slice(0, 2).join('')
export const cleanLabel = (s) => Array.from(String(s == null ? '' : s).trim()).slice(0, 8).join('')

export function normalizeButtons(raw, slot) {
  const base = DEFAULT_BUTTONS[slot] || DEFAULT_BUTTONS.u1
  const arr = Array.isArray(raw) ? raw : []
  return [0, 1, 2].map((i) => {
    const b = arr[i]
    const e = b && typeof b === 'object' ? cleanEmoji(b.e) : ''
    const t = b && typeof b === 'object' ? cleanLabel(b.t) : ''
    return e && t ? { e, t } : base[i]
  })
}

/* ---------- 被戳反应：4 套（上班 / 在家 / 睡觉 / 被戳烦了），每套最多 4 句，每句 ≤ 20 字 ---------- */

export const POKE_KEYS = ['work', 'home', 'sleep', 'annoyed']
export const POKE_MAX = 4 // 每套最多几句
export const POKE_LEN = 20 // 每句最多几个字
export const POKE_STREAK = 3 // 同一个人 60 秒内戳到第几下起，换成「被戳烦了」
export const POKE_STREAK_MS = 60000

/** 输入框里边打边裁：只限制字数，不去掉首尾空格（不然打不出中间的空格） */
export const clipLine = (s) => Array.from(String(s == null ? '' : s)).slice(0, POKE_LEN).join('')

/**
 * 整理成存进服务器的样子：去掉空句、每套最多 4 句、没有句子的那套不留。键的顺序固定，方便比较「有没有改动」。
 * 输入框里的草稿允许带空位（['你好','','','']），存之前都走这里
 */
export function compactPokeLines(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out = {}
  for (const k of POKE_KEYS) {
    const arr = Array.isArray(r[k]) ? r[k] : []
    const lines = arr.map((s) => clipLine(String(s == null ? '' : s).trim())).filter(Boolean).slice(0, POKE_MAX)
    if (lines.length) out[k] = lines
  }
  return out
}

/* ---------- 玩耍 / 放空：在家的时间里的两段可选时间 [from, to)，to 不含 ---------- */

const hourOrNull = (v) => {
  if (v == null || v === '') return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : null
}
const normWin = (a, b) => {
  const f = hourOrNull(a)
  const t = hourOrNull(b)
  return f != null && t != null && f < t ? [f, t] : [null, null]
}

export const WINDOW_KINDS = [
  { k: 'play', n: '玩耍', e: '🎮' },
  { k: 'idle', n: '放空', e: '☁️' },
]

export function normalizeSettings(row, slot) {
  const r = row || {}
  const d = DEFAULT_SETTINGS
  const [pf, pt] = normWin(r.play_from, r.play_to)
  const [xf, xt] = normWin(r.idle_from, r.idle_to)
  return {
    work_scene: has(SCENES, r.work_scene) ? r.work_scene : d.work_scene,
    idle_scene: has(SCENES, r.idle_scene) ? r.idle_scene : null,
    home_theme: has(THEMES, r.home_theme) ? r.home_theme : d.home_theme,
    wake_h: clampH(r.wake_h, d.wake_h),
    work_h: clampH(r.work_h, d.work_h),
    off_h: clampH(r.off_h, d.off_h),
    sleep_h: clampH(r.sleep_h, d.sleep_h),
    buttons: normalizeButtons(r.buttons, slot),
    play_from: pf,
    play_to: pt,
    idle_from: xf,
    idle_to: xt,
    poke_lines: compactPokeLines(r.poke_lines),
  }
}

export function normalizeState(row) {
  const r = row || {}
  const mood = Number(r.mood)
  const coins = Number(r.coins)
  return {
    mood: Number.isFinite(mood) ? Math.max(0, Math.min(100, mood)) : DEFAULT_STATE.mood,
    coins: Number.isFinite(coins) ? Math.max(0, Math.round(coins)) : DEFAULT_STATE.coins,
    gifts: Array.isArray(r.gifts) ? r.gifts.filter((k) => GIFTS.some((g) => g.k === k)) : [],
    mood_at: typeof r.mood_at === 'string' ? r.mood_at : null,
  }
}

// 这一段时间要完整落在「在家」里：起床后到上班前，或者下班后到睡觉前（和服务端 pal_windows_ok 同一条规则）
const winProblem = (s, name, f, t) => {
  if (f == null && t == null) return ''
  if (f == null || t == null) return `「${name}」要同时选开始和结束`
  if (t <= f) return `「${name}」的结束要在开始之后`
  const morning = f >= s.wake_h && t <= s.work_h
  const evening = f >= s.off_h && t <= s.sleep_h
  if (!morning && !evening) return `「${name}」要完整落在在家的时间里（起床后到上班前，或下班后到睡觉前）`
  return ''
}

// 起床 ≤ 上班 < 下班 ≤ 睡觉，否则一天的顺序就乱了；玩耍/放空要落在在家的时间里、两段不能重叠。
// 返回一句给人看的话，没问题返回 ''
export function checkSchedule(s) {
  if (s.work_h < s.wake_h) return '上班时间不能比起床还早'
  if (s.off_h <= s.work_h) return '下班要在上班之后'
  if (s.sleep_h < s.off_h) return '睡觉要在下班之后'
  const a = winProblem(s, '玩耍', s.play_from, s.play_to)
  if (a) return a
  const b = winProblem(s, '放空', s.idle_from, s.idle_to)
  if (b) return b
  if (s.play_from != null && s.idle_from != null && !(s.play_to <= s.idle_from || s.idle_to <= s.play_from)) {
    return '「玩耍」和「放空」的时间不能重叠'
  }
  return ''
}

/** 换了作息以后，对不上的玩耍/放空时段直接取消（套预设时用）；返回新对象 */
export function fitWindows(s) {
  let next = { ...s }
  if (winProblem(next, '玩耍', next.play_from, next.play_to)) next = { ...next, play_from: null, play_to: null }
  if (winProblem(next, '放空', next.idle_from, next.idle_to)) next = { ...next, idle_from: null, idle_to: null }
  if (next.play_from != null && next.idle_from != null && !(next.play_to <= next.idle_from || next.idle_to <= next.play_from)) {
    next = { ...next, idle_from: null, idle_to: null }
  }
  return next
}

const inWin = (h, f, t) => f != null && t != null && h >= f && h < t

/** 小人此刻在哪个状态：work 上班 / sleep 睡觉 / play 玩耍 / idle 放空 / home 在家（其余时间） */
export function stateOf(s, h) {
  if (h >= s.work_h && h < s.off_h) return 'work'
  if (h >= s.sleep_h || h < s.wake_h) return 'sleep'
  if (inWin(h, s.play_from, s.play_to)) return 'play'
  if (inWin(h, s.idle_from, s.idle_to)) return 'idle'
  return 'home'
}

/** 在家的几种状态（在家 / 玩耍 / 放空）都画家里的房间、都看得到墙纸（放空去了别的场景的除外，见 atHome） */
export const isHomeLike = (st) => st === 'home' || st === 'play' || st === 'idle'

/** 小人此刻在哪个场景：上班 = 上班地点；放空且选了「放空去哪」= 那个场景；其余都在家，返回 null */
export function placeOf(settings, st) {
  if (st === 'work') return settings.work_scene
  if (st === 'idle' && settings.idle_scene) return settings.idle_scene
  return null
}

/** 此刻是不是真的在家里（画家里的房间、看得到墙纸、晚上有暖色滤镜）：放空去了海边之类的就不是 */
export const atHome = (settings, st) => isHomeLike(st) && !placeOf(settings, st)

export function moodNow(state, now = Date.now()) {
  if (!state) return DEFAULT_STATE.mood
  const t = state.mood_at ? Date.parse(state.mood_at) : NaN
  const hours = Number.isFinite(t) ? Math.max(0, (now - t) / 3600000) : 0
  return Math.max(5, Math.min(100, Math.round(state.mood - hours * MOOD_DECAY_PER_HOUR)))
}

export function fmtHour(h) {
  h = ((h % 24) + 24) % 24
  return `${pad2(Math.floor(h))}:${pad2(Math.floor((h % 1) * 60))}`
}

/* ---------- 像素图 ---------- */

const SPR_CODER = [
  '....H.HHH..H....',
  '...HHHHHHHHHH...',
  '..HHHHHHHHHHHH..',
  '..HHhHHHHHHhHH..',
  '..HHHSHHHSHHHH..',
  '..HHSSSSSSSSHH..',
  '..HHSESSSSESHH..',
  '..HHSFSSSSFSHH..',
  '..HHSbSSSSbSHH..',
  '..HHSSSmmSSSHH..',
  '..HHHsSSSSsHHH..',
  '..HH..SSSS..HH..',
  '...HJJRRRRJJH...',
  '...JJMRRRRMJJ...',
  '..JJJJRRRRJJJJ..',
  '..JjJJRRRRJJjJ..',
  '..SJJJJJJJJJJS..',
  '....PPPPPPPP....',
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....BBB..BBB....',
  '...BBBB..BBBB...',
]
// 白发少年
const PAL_CODER = {
  H: '#f3f5fb', h: '#c7cfe2', S: '#f6d5bd', s: '#e2b497', E: '#8fc4ff', F: '#2f6fe0', b: '#f0a3a3', m: '#b0645f',
  J: '#23232d', j: '#41414f', R: '#e5384f', M: '#d9dbe5', P: '#2b3049', B: '#0e0e14',
}
const SPR_WORKER = [
  '....hHHHHHHh....',
  '...HHHHHHHHHH...',
  '..HHHHHHHHHHHH..',
  '..HHHHhHHhHHHH..',
  '..HHHSHHHHSHHH..',
  '..HHSSSSSSSSHH..',
  '..HHSESSSSESHH..',
  '..HHSFSSSSFSHH..',
  '..HHSbSSSSbSHH..',
  '..HHSSSmmSSSHH..',
  '..HHHsSSSSsHHH..',
  '..HHH.SSSS.HHH..',
  '..HHCCCCCCCCHH..',
  '..HHCCcCCcCCHH..',
  '..HCCCcCCcCCCH..',
  '..HCCCCCCCCCCH..',
  '..hSCCCCCCCCSh..',
  '...hPPPPPPPPh...',
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....OOO..OOO....',
  '...OOOO..OOOO...',
]
// 黑发少年
const PAL_WORKER = {
  H: '#17171f', h: '#3d3d55', S: '#fde3d2', s: '#efc5ad', E: '#4a4560', F: '#14121c', b: '#ffaec0', m: '#d0848e',
  C: '#a9d5ff', c: '#ffffff', P: '#dfe5f2', O: '#7f97c6',
}
const SPRITES = {
  u1: { spr: SPR_CODER, pal: PAL_CODER },
  u2: { spr: SPR_WORKER, pal: PAL_WORKER },
}

const HEART = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..']
const CLOUD = ['..GGG...', '.GGGGGG.', 'GGGGGGGG', '.GGGGGG.']
const NOTE = ['.XXX', '.X.X', '.X..', 'XX..', 'XX..'] // 玩耍时冒出来的音符（打工小人弹吉他）
const SPARK = ['.X.', 'XXX', '.X.'] // 玩耍时冒出来的小星星（代码小人玩掌机）
const PLANT = ['..g.g..', '.gGgGg.', 'gGgGgGg', '..gGg..', '.PPPPP.', '.PPPPP.', '..PPP..']

function drawSprite(ctx, spr, pal, x, y, o = {}) {
  const r0 = o.rows ? o.rows[0] : 0
  const r1 = o.rows ? o.rows[1] : spr.length - 1
  for (let r = r0; r <= r1; r++) {
    const line = spr[r]
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '.') continue
      let col = pal[ch]
      if (o.blink && (ch === 'E' || ch === 'F')) col = r === 7 ? '#2a2a35' : pal.S
      if (o.blush && ch === 'b') col = '#ff7d9a'
      ctx.fillStyle = col
      ctx.fillRect(x + i, y + r, 1, 1)
    }
  }
}

/* ---------- 场景 ---------- */

function monitor(ctx, job, x, y, w, h, t) {
  if (job === 'coder') {
    R(ctx, '#0c1711', x, y, w, h)
    const off = Math.floor(t * 3)
    for (let i = 0; i < Math.floor(h / 2); i++) {
      const n = i + off
      const ind = ((n * 7) % 3) * 2
      const len = 3 + ((n * 37) % (w - 6 - ind))
      R(ctx, ['#4dff8a', '#5fd4ff', '#ff7eb3', '#e8e8e8'][n % 4], x + 2 + ind, y + 1 + i * 2, len, 1)
    }
  } else {
    R(ctx, '#eef4ff', x, y, w, h)
    R(ctx, '#cdd9f0', x, y, w, 2)
    for (let i = 0; i < 5; i++) {
      const hg = 2 + Math.floor((Math.sin(t * 1.3 + i) * 0.5 + 0.5) * (h - 6))
      R(ctx, ['#7c6cff', '#ff7eb3', '#4cc3ff', '#ffcf3f', '#4dd38a'][i], x + 2 + i * 5, y + h - 1 - hg, 3, hg)
    }
  }
}

function drawOffice(ctx, job, hr, t) {
  R(ctx, '#d9e0ec', 0, 0, W, FLOOR); R(ctx, '#c6cfdf', 0, FLOOR - 14, W, 14); R(ctx, '#b5bfd3', 0, FLOOR - 15, W, 1)
  R(ctx, '#7f889e', 0, FLOOR, W, H - FLOOR)
  for (let i = 0; i < W; i += 16) R(ctx, '#747d93', i, FLOOR, 1, H - FLOOR)
  R(ctx, '#6a7288', 0, FLOOR, W, 1)
  drawWindow(ctx, 12, 16, 40, 30, hr, t)
  R(ctx, '#3a3f55', 63, 11, 13, 13); R(ctx, '#fff', 64, 12, 11, 11); R(ctx, '#3a3f55', 69, 14, 1, 4); R(ctx, '#e5384f', 70, 17, 3, 1)
  if (job === 'coder') {
    R(ctx, '#ff7eb3', 80, 24, 15, 19)
    R(ctx, '#fff', 83, 30, 2, 1); R(ctx, '#fff', 82, 31, 1, 1); R(ctx, '#fff', 83, 32, 2, 1)
    R(ctx, '#fff', 87, 29, 1, 5); R(ctx, '#fff', 90, 30, 2, 1); R(ctx, '#fff', 92, 31, 1, 1); R(ctx, '#fff', 90, 32, 2, 1)
    R(ctx, '#fff', 82, 37, 11, 1); R(ctx, '#fff', 82, 39, 7, 1)
  } else {
    R(ctx, '#4cc3ff', 80, 24, 15, 19)
    R(ctx, '#fff', 83, 34, 2, 6); R(ctx, '#fff', 86, 31, 2, 9); R(ctx, '#fff', 89, 28, 2, 12)
  }
  pat(ctx, PLANT, { g: '#62c46e', G: '#3f9a4f', P: '#c56a4a' }, 62, FLOOR - 7)
  R(ctx, '#a77b5a', 98, 72, 56, 4); R(ctx, '#8a6249', 98, 76, 56, 2)
  R(ctx, '#8a6249', 100, 78, 3, 20); R(ctx, '#8a6249', 149, 78, 3, 20)
  R(ctx, '#946a50', 126, 78, 22, 12); R(ctx, '#c99c76', 135, 83, 4, 1)
  R(ctx, '#262a38', 110, 50, 30, 20); monitor(ctx, job, 112, 52, 26, 16, t)
  R(ctx, '#262a38', 123, 70, 4, 2); R(ctx, '#3a3f52', 118, 71, 14, 1)
  R(ctx, '#fff', 144, 66, 5, 6); R(ctx, '#e04a5f', 144, 68, 5, 1)
}

function drawCafe(ctx, job, hr, t) {
  R(ctx, '#efdcc4', 0, 0, W, FLOOR)
  for (let y = 5; y < FLOOR - 14; y += 6) {
    R(ctx, '#e3ccb0', 0, y, W, 1)
    for (let x = ((y / 6 | 0) % 2) * 6; x < W; x += 12) R(ctx, '#e3ccb0', x, y - 5, 1, 5)
  }
  R(ctx, '#9c6b4a', 0, FLOOR - 14, W, 14); R(ctx, '#86583a', 0, FLOOR - 14, W, 1)
  for (let y = FLOOR; y < H; y += 6) {
    for (let x = 0; x < W; x += 12) R(ctx, ((x / 12 + (y - FLOOR) / 6) % 2) ? '#d8c3a5' : '#c4ad8c', x, y, 12, 6)
  }
  drawWindow(ctx, 14, 18, 28, 26, hr, t)
  R(ctx, '#6b4a33', 52, 12, 38, 26); R(ctx, '#2f3b34', 54, 14, 34, 22)
  ;[[57, 17, 14], [57, 21, 22], [57, 25, 18], [57, 29, 20], [57, 33, 12]].forEach(([x, y, w]) => R(ctx, '#e8efe9', x, y, w, 1))
  ;[21, 25, 29].forEach((y) => R(ctx, '#ffcf6b', 83, y, 2, 1))
  ;[104, 136].forEach((lx) => {
    R(ctx, '#3a2a20', lx, 0, 1, 10); R(ctx, '#2e2a26', lx - 4, 10, 9, 4); R(ctx, '#ffe39a', lx - 2, 14, 5, 1)
  })
  R(ctx, '#c08657', 100, 72, 58, 3); R(ctx, '#8f5d3d', 100, 75, 58, 23)
  R(ctx, '#a26a46', 104, 79, 22, 15); R(ctx, '#a26a46', 130, 79, 22, 15)
  R(ctx, '#c9ced8', 130, 54, 18, 18); R(ctx, '#9aa1af', 130, 54, 18, 3)
  R(ctx, '#2c2f38', 134, 60, 10, 5); R(ctx, '#fff', 137, 67, 4, 5)
  if (Math.floor(t * 3) % 3) R(ctx, 'rgba(255,255,255,.75)', 138, 62 - Math.floor((t * 8) % 5), 1, 2)
  if (job === 'coder') {
    R(ctx, '#2a2e3a', 107, 61, 18, 11); monitor(ctx, job, 108, 62, 16, 8, t); R(ctx, '#3b4052', 105, 72, 22, 1)
  } else {
    R(ctx, '#fff', 108, 67, 4, 5); R(ctx, '#fff', 115, 67, 4, 5)
    R(ctx, '#ffb9d6', 108, 69, 4, 1); R(ctx, '#a9d5ff', 115, 69, 4, 1)
  }
  pat(ctx, PLANT, { g: '#62c46e', G: '#3f9a4f', P: '#c56a4a' }, 62, FLOOR - 7)
}

function drawHome(ctx, m, a, hr, t) {
  const th = THEMES[m.settings.home_theme] || THEMES.cream
  const night = m.settings.home_theme === 'night'
  R(ctx, th.wall, 0, 0, W, FLOOR)
  for (let y = 6; y < FLOOR - 10; y += 10) {
    for (let x = ((y / 10 | 0) % 2) * 8 + 4; x < W; x += 16) R(ctx, th.dot, x, y, night ? 1 : 2, night ? 1 : 2)
  }
  R(ctx, th.base, 0, FLOOR - 3, W, 3)
  R(ctx, '#b98b62', 0, FLOOR, W, H - FLOOR)
  for (let y = FLOOR + 5; y < H; y += 6) R(ctx, '#a77a54', 0, y, W, 1)
  for (let y = FLOOR; y < H; y += 6) R(ctx, '#a77a54', ((y / 6 | 0) * 37) % W, y, 1, 5)
  drawWindow(ctx, 68, 14, 30, 26, hr, t)
  if (m.slot === 'u1') {
    R(ctx, '#1d1d26', 112, 12, 16, 20); R(ctx, '#e5384f', 114, 15, 12, 2)
    R(ctx, '#fff', 119, 19, 3, 1); R(ctx, '#fff', 118, 20, 3, 1); R(ctx, '#fff', 117, 21, 5, 1); R(ctx, '#fff', 119, 22, 2, 1); R(ctx, '#fff', 118, 23, 2, 1)
    R(ctx, '#e5384f', 114, 28, 12, 1)
  } else {
    R(ctx, '#fff', 112, 12, 16, 20)
    R(ctx, '#ffcf3f', 119, 16, 2, 2); R(ctx, '#ffcf3f', 116, 18, 8, 2); R(ctx, '#ffcf3f', 117, 20, 6, 2)
    R(ctx, '#ffcf3f', 116, 22, 2, 2); R(ctx, '#ffcf3f', 122, 22, 2, 2)
  }
  R(ctx, '#9b7356', 108, 48, 44, 3); R(ctx, '#86603f', 110, 51, 2, 3); R(ctx, '#86603f', 148, 51, 2, 3)
  R(ctx, '#e5384f', 138, 40, 3, 8); R(ctx, '#4cc3ff', 141, 41, 3, 7); R(ctx, '#ffcf3f', 144, 42, 3, 6)
  R(ctx, th.rug, 66, FLOOR + 3, 58, 5); R(ctx, th.rug, 62, FLOOR + 4, 66, 3)
  // 床
  R(ctx, '#8c6a52', 4, 62, 5, 36); R(ctx, '#8c6a52', 6, 86, 54, 12); R(ctx, '#76563f', 6, 86, 54, 1)
  R(ctx, '#fbfbff', 8, 80, 50, 6); R(ctx, '#fff', 10, 74, 13, 6); R(ctx, '#e3e3ef', 10, 79, 13, 1)
  const sleeping = a.state === 'sleep'
  if (sleeping) drawSprite(ctx, m.sp.spr, m.sp.pal, 8, 64, { blink: true, rows: [0, 11] })
  const bx = sleeping ? 8 : 22
  const bw = sleeping ? 52 : 38
  R(ctx, th.blanket, bx, 76, bw, 10); R(ctx, 'rgba(255,255,255,.35)', bx, 76, bw, 1); R(ctx, 'rgba(0,0,0,.12)', bx, 85, bw, 1)
  drawGifts(ctx, m.gifts, t) // 收到的礼物按 scenes.js 里的数据摆进房间
}

/* ---------- 小人 ---------- */

export function createActor(slot) {
  const sp = SPRITES[slot] || SPRITES.u1
  return {
    slot, sp,
    x: 96, tx: 96, pause: 0, react: 0, blushT: 0, blink: 0, blinkT: 2, walking: false,
    state: null, zT: 0, nT: 0, particles: [],
    scene: null, // 此刻站在哪个数据场景里（null = 家里 / 办公室 / 咖啡馆），换地方时用来让小人直接出现在起点
  }
}

// 放空时站在窗前；玩耍时在地毯上这一块活动
const IDLE_X = 83
const PLAY_X = [92, 116]

export const headTop = (a) => (a.state === 'sleep' ? 64 : FLOOR - 23)

export function hearts(a, n) {
  for (let i = 0; i < n; i++) a.particles.push({ k: 'heart', x: a.x + rand(-7, 5), y: headTop(a) - 2, vx: rand(-10, 10), vy: rand(-34, -16), life: rand(0.9, 1.4) })
}

export function stepActor(a, settings, hr, dt, mood) {
  const st = stateOf(settings, hr)
  const was = a.state
  const place = placeOf(settings, st)
  const spot = place ? sceneSpot(place) : null // 数据场景里：能走的范围 + 放空站的位置（办公室、咖啡馆、家里没有，用下面的老位置）
  const walk = spot ? spot.walk : [80, 92]
  const stand = spot ? spot.stand : IDLE_X
  // 刚下班 / 刚起床回到家：先站到家里的中间；从在家切到玩耍/放空：直接走向各自的位置
  if (was && was !== st && isHomeLike(st) && !spot && (was === 'work' || was === 'sleep')) { a.x = 90; a.tx = 90 }
  // 进出数据场景（整个画面换了）：小人直接出现在那里的起点，不从上一个画面的位置滑过去
  const key = spot ? place : null
  if (a.scene !== key) {
    a.scene = key
    if (spot) { a.x = st === 'idle' ? stand : (walk[0] + walk[1]) / 2; a.tx = a.x } else if (was) { a.x = 90; a.tx = 90 }
  }
  if (was !== st) {
    if (st === 'idle') a.tx = stand
    else if (st === 'play') a.tx = rand(PLAY_X[0], PLAY_X[1])
  }
  a.state = st
  if (st === 'sleep') {
    a.x = 16; a.walking = false; a.zT -= dt
    if (a.zT <= 0) { a.zT = 1.1; a.particles.push({ k: 'z', x: 26, y: 62, vx: 6, vy: -7, life: 2 }) }
  } else if (Math.abs(a.x - a.tx) < 0.5) {
    a.walking = false; a.pause -= dt
    if (a.pause <= 0) {
      if (st === 'idle') { a.tx = stand; a.pause = 2 } // 放空：站在窗前（或放空去的那个场景里）不动
      else if (st === 'play') { a.tx = rand(PLAY_X[0], PLAY_X[1]); a.pause = rand(2.5, 5) }
      else {
        a.tx = st === 'work' ? rand(walk[0], walk[1]) : rand(66, 132)
        a.pause = st === 'work' ? rand(3, 6) : rand(1.5, 4)
      }
    }
  } else if (a.react <= 0) {
    a.walking = true
    const d = a.tx - a.x
    a.x += Math.sign(d) * Math.min(Math.abs(d), 16 * dt)
  }
  if (a.react > 0) a.react -= dt
  if (a.blushT > 0) a.blushT -= dt
  a.blinkT -= dt
  if (a.blinkT < 0) { a.blink = 0.12; a.blinkT = rand(2, 4.5) }
  if (a.blink > 0) a.blink -= dt
  if (mood >= 80 && st !== 'sleep' && Math.random() < dt * 0.35) {
    a.particles.push({ k: 'heart', x: a.x + rand(-4, 2), y: headTop(a) - 2, vx: rand(-4, 4), vy: -14, life: 1.2 })
  }
  if (st === 'play') {
    a.nT -= dt
    if (a.nT <= 0) {
      a.nT = rand(0.45, 0.8)
      // 从头的两侧冒出来往上飘（不盖在脸上）
      a.particles.push({
        k: a.slot === 'u2' ? 'note' : 'spark',
        x: a.x + pick([-13, 9]) + rand(-2, 2), y: headTop(a) + rand(2, 12), vx: rand(-4, 4), vy: rand(-22, -12), life: rand(0.9, 1.3),
        c: pick(['#ff7eb3', '#4cc3ff', '#ffcf3f', '#7c6cff']),
      })
    }
  }
  for (const p of a.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt }
  a.particles = a.particles.filter((p) => p.life > 0)
  return st
}

// 玩耍时手里的东西：代码小人玩粉色掌机，打工小人弹吉他（画在身体前面）
function drawPlayProp(ctx, slot, x, y, t) {
  if (slot === 'u2') {
    R(ctx, '#c9803f', x + 2, y + 15, 7, 6) // 琴身
    R(ctx, '#e5a05a', x + 2, y + 15, 7, 1)
    R(ctx, '#3a2412', x + 5, y + 17, 2, 2) // 音孔
    R(ctx, '#7a4a24', x + 9, y + 16, 7, 1) // 琴颈
    R(ctx, '#3a2412', x + 16, y + 15, 2, 3) // 琴头
    if (Math.floor(t * 8) % 2) R(ctx, '#fff5cf', x + 7, y + 17, 1, 2) // 拨弦的一闪
  } else {
    R(ctx, '#ff7eb3', x + 3, y + 14, 10, 6) // 机身
    R(ctx, '#d64f86', x + 3, y + 19, 10, 1)
    R(ctx, '#1b2a2a', x + 6, y + 15, 4, 4) // 屏幕
    R(ctx, '#4dff8a', x + 6 + (Math.floor(t * 6) % 3), y + 15 + (Math.floor(t * 4) % 3), 1, 1) // 屏幕里跳动的小点
    R(ctx, '#fff', x + 4, y + 17, 1, 1) // 方向键
    R(ctx, '#ffcf3f', x + 11, y + 16, 1, 1) // 按键
    R(ctx, '#4cc3ff', x + 10, y + 18, 1, 1)
  }
}

function drawChar(ctx, a, mood, t) {
  let yo = 0
  if (a.react > 0) yo = -Math.round(Math.abs(Math.sin(a.react * 9)) * 4)
  else if (a.walking) yo = Math.floor(t * 8) % 2 ? -1 : 0
  else if (a.state === 'play') yo = Math.floor(t * 5) % 2 ? -1 : 0 // 玩得起劲，一颠一颠
  const x = Math.round(a.x) - 8
  const y = FLOOR - 23 + yo
  R(ctx, 'rgba(0,0,0,.18)', x + 3, FLOOR - 1, 10, 2)
  drawSprite(ctx, a.sp.spr, a.sp.pal, x, y, { blink: a.blink > 0, blush: a.blushT > 0 })
  if (a.state === 'play') drawPlayProp(ctx, a.slot, x, y, t)
  if (a.state === 'idle') {
    // 放空：头的右上方一点一点冒出三个点，斜着往上排（像想心事的气泡；不和心情低落的小乌云重叠）
    const k = Math.floor(t * 1.5) % 4
    for (let i = 0; i < k && i < 3; i++) R(ctx, '#8a93a8', x + 14 + i * 3, y + 6 - i * 3, 2, 2)
  }
  if (mood < 30) {
    pat(ctx, CLOUD, { G: '#8a93a8' }, x + 4, y - 9)
    if (Math.floor(t * 3) % 2) R(ctx, '#7fb6ea', x + 7, y - 4, 1, 2)
  }
}

function drawParticles(ctx, a) {
  for (const p of a.particles) {
    if (p.k === 'heart') pat(ctx, HEART, { X: '#ff5c8a' }, p.x, p.y)
    else if (p.k === 'note') pat(ctx, NOTE, { X: p.c || '#7c6cff' }, p.x, p.y)
    else if (p.k === 'spark') pat(ctx, SPARK, { X: p.c || '#ffcf3f' }, p.x, p.y)
    else if (p.k === 'z') {
      const s = Math.round(p.y) > 40 ? 3 : 4
      const x = Math.round(p.x)
      const y = Math.round(p.y)
      const c = 'rgba(255,255,255,.85)'
      R(ctx, c, x, y, s, 1); R(ctx, c, x + s - 2, y + 1, 1, 1); R(ctx, c, x + 1, y + 2, 1, 1); R(ctx, c, x, y + 3, s, 1)
    }
  }
}

/** 画一帧。m = { slot, sp, settings, gifts, mood } */
export function renderFrame(ctx, a, m, hr, t) {
  const job = (CHARS[m.slot] || CHARS.u1).job
  const place = placeOf(m.settings, a.state) // 在哪个场景（在家 = null）
  const data = place && isDataScene(place)
  const o = { job, working: a.state === 'work', hr, t }
  if (data) drawScene(ctx, place, 'back', o)
  else if (place) (place === 'cafe' ? drawCafe : drawOffice)(ctx, job, hr, t) // 办公室、咖啡馆：第一轮手写的画法
  else drawHome(ctx, m, a, hr, t)
  if (a.state !== 'sleep') drawChar(ctx, a, m.mood, t)
  if (data) drawScene(ctx, place, 'front', o)
  if (a.state === 'sleep') {
    R(ctx, 'rgba(8,10,34,.55)', 0, 0, W, H)
    drawGiftGlows(ctx, m.gifts) // 台灯、蜡烛关灯后还亮着
  } else if (atHome(m.settings, a.state) && (hr >= 19 || hr < 6.5)) {
    R(ctx, 'rgba(255,170,90,.08)', 0, 0, W, H)
  }
  drawParticles(ctx, a)
}

/* ---------- 小人说的话（第一轮只有戳一戳/打招呼；互动回应、聊天第二轮加） ---------- */

export const LINES = {
  u1: {
    poke: ['呀！', '嘿嘿，好痒～', '再戳我就要咬你了哦'],
    wave: ['嗨嗨～', '你来看我啦！', '欢迎光临～'],
  },
  u2: {
    poke: ['干嘛。', '别戳了。……再戳一下也行。', '嗯？'],
    wave: ['哟。', '来了啊。', '嗯，看见你了。'],
  },
}