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

export const SCENES = { office: '办公室', cafe: '咖啡馆' }
export const SCENE_ICON = { office: '🏢', cafe: '☕' }

export const THEMES = {
  cream: { n: '奶油', wall: '#f4e7d4', dot: '#ead5ba', base: '#e2d2bd', blanket: '#ff9fb6', rug: '#f3bccb' },
  mint: { n: '薄荷', wall: '#d4efe1', dot: '#bde2cf', base: '#b9dcc9', blanket: '#73c9a8', rug: '#a6dac3' },
  night: { n: '星空', wall: '#2d345f', dot: '#55609a', base: '#222849', blanket: '#7c6cff', rug: '#5b4f9e' },
}

// 礼物（第二轮开始送；这一轮只负责把已经有的摆进房间）
export const GIFTS = [
  { k: 'plant', e: '🪴', n: '盆栽', cost: 30 },
  { k: 'lamp', e: '💡', n: '小台灯', cost: 40 },
  { k: 'cat', e: '🐱', n: '猫猫玩偶', cost: 50 },
]

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
  home_theme: 'cream',
  wake_h: 6,
  work_h: 7,
  off_h: 17,
  sleep_h: 23,
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

export function normalizeSettings(row, slot) {
  const r = row || {}
  const d = DEFAULT_SETTINGS
  return {
    work_scene: has(SCENES, r.work_scene) ? r.work_scene : d.work_scene,
    home_theme: has(THEMES, r.home_theme) ? r.home_theme : d.home_theme,
    wake_h: clampH(r.wake_h, d.wake_h),
    work_h: clampH(r.work_h, d.work_h),
    off_h: clampH(r.off_h, d.off_h),
    sleep_h: clampH(r.sleep_h, d.sleep_h),
    buttons: normalizeButtons(r.buttons, slot),
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

// 起床 ≤ 上班 < 下班 ≤ 睡觉，否则一天的顺序就乱了。返回一句给人看的话，没问题返回 ''
export function checkSchedule(s) {
  if (s.work_h < s.wake_h) return '上班时间不能比起床还早'
  if (s.off_h <= s.work_h) return '下班要在上班之后'
  if (s.sleep_h < s.off_h) return '睡觉要在下班之后'
  return ''
}

export function stateOf(s, h) {
  if (h >= s.work_h && h < s.off_h) return 'work'
  if (h >= s.sleep_h || h < s.wake_h) return 'sleep'
  return 'home'
}

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
const PLANT = ['..g.g..', '.gGgGg.', 'gGgGgGg', '..gGg..', '.PPPPP.', '.PPPPP.', '..PPP..']
const LAMP = ['.YYYYY.', 'YYYYYYY', '...B...', '...B...', '..BBB..']
const CAT = ['K...K.', 'KK.KK.', 'KKKKKK', 'KEKKEK', 'KKpKKK', '.KKKK.']
const MOON = ['.MMM.', 'MMMM.', 'MMM..', 'MMMM.', '.MMM.']

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

function drawWindow(ctx, x, y, w, h, hr, t) {
  let top, bot, mode
  if (hr < 5.5 || hr >= 19.5) { top = '#10163a'; bot = '#26306a'; mode = 'night' }
  else if (hr < 7) { top = '#7b7cc4'; bot = '#ffbe9e'; mode = 'dawn' }
  else if (hr < 16.5) { top = '#6cbaff'; bot = '#c4e8ff'; mode = 'day' }
  else { top = '#6a55a6'; bot = '#ffa07a'; mode = 'dusk' }
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  R(ctx, top, x, y, w, h)
  const sp = y + Math.floor(h * 0.6)
  R(ctx, bot, x, sp, w, h)
  for (let i = 0; i < w; i += 2) R(ctx, bot, x + i, sp - 1, 1, 1)
  if (mode === 'night') {
    for (let i = 0; i < 12; i++) {
      const sx = x + (i * 53) % w
      const sy = y + (i * 29) % (h - 6)
      if (Math.floor(t * 2 + i) % 5) R(ctx, '#fff', sx, sy, 1, 1)
    }
    pat(ctx, MOON, { M: '#fff3c4' }, x + w - 9, y + 3)
  }
  if (mode === 'day') {
    R(ctx, '#ffe066', x + w - 11, y + 3, 6, 6)
    R(ctx, '#fff6b8', x + w - 10, y + 4, 2, 2)
    const cx = x + ((t * 3) % (w + 24)) - 16
    R(ctx, '#fff', cx, y + h * 0.36, 12, 3)
    R(ctx, '#fff', cx + 3, y + h * 0.36 - 2, 6, 2)
  }
  if (mode === 'dusk' || mode === 'dawn') R(ctx, '#ff7a4f', x + 5, y + h - 9, 7, 7)
  ctx.restore()
  const f = '#fbfbff'
  R(ctx, f, x - 2, y - 2, w + 4, 2); R(ctx, f, x - 2, y + h, w + 4, 2)
  R(ctx, f, x - 2, y, 2, h); R(ctx, f, x + w, y, 2, h)
  R(ctx, f, x + Math.floor(w / 2) - 1, y, 2, h); R(ctx, f, x, y + Math.floor(h / 2) - 1, w, 1)
  R(ctx, '#d6d6e6', x - 4, y + h + 2, w + 8, 2)
}

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
  if (m.gifts.includes('lamp')) pat(ctx, LAMP, { Y: '#ffd77a', B: '#6b5a4a' }, 114, 43)
  if (m.gifts.includes('plant')) pat(ctx, PLANT, { g: '#62c46e', G: '#3f9a4f', P: '#c56a4a' }, 142, FLOOR - 7)
  if (m.gifts.includes('cat')) pat(ctx, CAT, { K: '#f2f2f2', E: '#333', p: '#ff9fb6' }, 46, 72)
}

/* ---------- 小人 ---------- */

export function createActor(slot) {
  const sp = SPRITES[slot] || SPRITES.u1
  return {
    slot, sp,
    x: 96, tx: 96, pause: 0, react: 0, blushT: 0, blink: 0, blinkT: 2, walking: false,
    state: null, zT: 0, particles: [],
  }
}

export const headTop = (a) => (a.state === 'sleep' ? 64 : FLOOR - 23)

export function hearts(a, n) {
  for (let i = 0; i < n; i++) a.particles.push({ k: 'heart', x: a.x + rand(-7, 5), y: headTop(a) - 2, vx: rand(-10, 10), vy: rand(-34, -16), life: rand(0.9, 1.4) })
}

export function stepActor(a, settings, hr, dt, mood) {
  const st = stateOf(settings, hr)
  if (a.state && a.state !== st && st === 'home') { a.x = 90; a.tx = 90 }
  a.state = st
  if (st === 'sleep') {
    a.x = 16; a.walking = false; a.zT -= dt
    if (a.zT <= 0) { a.zT = 1.1; a.particles.push({ k: 'z', x: 26, y: 62, vx: 6, vy: -7, life: 2 }) }
  } else if (Math.abs(a.x - a.tx) < 0.5) {
    a.walking = false; a.pause -= dt
    if (a.pause <= 0) {
      a.tx = st === 'work' ? rand(80, 92) : rand(66, 132)
      a.pause = st === 'work' ? rand(3, 6) : rand(1.5, 4)
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
  for (const p of a.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt }
  a.particles = a.particles.filter((p) => p.life > 0)
  return st
}

function drawChar(ctx, a, mood, t) {
  let yo = 0
  if (a.react > 0) yo = -Math.round(Math.abs(Math.sin(a.react * 9)) * 4)
  else if (a.walking) yo = Math.floor(t * 8) % 2 ? -1 : 0
  const x = Math.round(a.x) - 8
  const y = FLOOR - 23 + yo
  R(ctx, 'rgba(0,0,0,.18)', x + 3, FLOOR - 1, 10, 2)
  drawSprite(ctx, a.sp.spr, a.sp.pal, x, y, { blink: a.blink > 0, blush: a.blushT > 0 })
  if (mood < 30) {
    pat(ctx, CLOUD, { G: '#8a93a8' }, x + 4, y - 9)
    if (Math.floor(t * 3) % 2) R(ctx, '#7fb6ea', x + 7, y - 4, 1, 2)
  }
}

function drawParticles(ctx, a) {
  for (const p of a.particles) {
    if (p.k === 'heart') pat(ctx, HEART, { X: '#ff5c8a' }, p.x, p.y)
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
  if (a.state === 'work') (m.settings.work_scene === 'cafe' ? drawCafe : drawOffice)(ctx, job, hr, t)
  else drawHome(ctx, m, a, hr, t)
  if (a.state !== 'sleep') drawChar(ctx, a, m.mood, t)
  if (a.state === 'sleep') {
    R(ctx, 'rgba(8,10,34,.55)', 0, 0, W, H)
    if (m.gifts.includes('lamp')) {
      const g = ctx.createRadialGradient(117, 45, 2, 117, 45, 34)
      g.addColorStop(0, 'rgba(255,214,130,.45)')
      g.addColorStop(1, 'rgba(255,214,130,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
  } else if (a.state === 'home' && (hr >= 19 || hr < 6.5)) {
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