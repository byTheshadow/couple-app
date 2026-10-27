/* ===========================================================================
   小物 · 气人顾客（打地鼠）—— 纯逻辑 + 绘制 + 音效
   这个文件里没有 React、没有 supabase；音效那段所有 window / localStorage 访问都先判断，
   所以这台机器可以用 F:\github\_pixel-preview\raster.mjs 打桩出 PNG 核对画面。
   画布 160×120，和像素小屋同一套画法（fillRect 逐像素）。
   数值的准绳是 docs/whack-design.md；改数值先改那边，再改这里。
   =========================================================================== */

export const W = 160
export const H = 200

/* ---------- 数值（spec 第 3 节） ---------- */
export const DURATION = 45
export const PENALTY = 3
export const MAX_ALIVE = 3
export const RISE = 0.18
export const SINK = 0.25
export const HIT_ANIM = 0.35
export const BAD_LIFE = 1.9
export const GOOD_LIFE = 1.6
export const GOOD_CHANCE = 0.2
export const COMBO_PER = 3
export const COIN_PER = 10
export const ROUND_COIN_CAP = 30
export const SPAWN_FROM = 1.1
export const SPAWN_TO = 0.55
export const SPAWN_RAMP = 10
export const BUBBLE_FOR = 1.5

/* ---------- 两档出怪速度（spec 第 3 节） ---------- */
// mult 乘在出怪间隔上：慢档间隔更长（人更少），快档间隔更短（人更密）
export const SPEEDS = {
  slow: { key: 'slow', name: '慢', mult: 1.5 },
  fast: { key: 'fast', name: '快', mult: 0.7 },
}
export const SPEED_KEY = 'whack.speed'
export const DEFAULT_SPEED = 'slow'

export const SFX_KEY = 'whack.sfx'
export const BEST_KEY = 'whack.best'
export const DAY_COIN_CAP = 60
export const SWING = 0.2        // 按一下：抬手 → 落锤 → 回手，总共 0.2 s
export const SWING_LAND = 0.075 // 锤头落到点击处的时间，之后才开始回手

/* ---------- 柜台：9 个洞，3 排 × 3 列（spec 第 4 节） ---------- */
// s = 这一排小人画多大：越靠后越小，9 个洞才看得出纵深
export const ROWS = [
  { y: 78, s: 0.78 },
  { y: 118, s: 0.88 },
  { y: 158, s: 1 },
]
export const HOLES = []
for (const r of ROWS) for (const x of [30, 80, 130]) HOLES.push({ x, y: r.y, s: r.s })

// 点击区：往上只给到头顶（按这一排的大小算），排与排之间留了空，不会点错格
export const HIT = { half: 13, down: 3 }
export function hitUp(h) { return Math.round(26 * h.s) }

export function slotAt(x, y) {
  for (let i = 0; i < HOLES.length; i++) {
    const h = HOLES[i]
    if (x >= h.x - HIT.half && x <= h.x + HIT.half && y >= h.y - hitUp(h) && y <= h.y + HIT.down) return i
  }
  return -1
}

/** 锤子跟到哪儿：鼠标移动 / 手指按下 / 键盘 1~6 都走这里 */
export function aimAt(g, x, y) {
  if (!g.aim) g.aim = { x: 0, y: 0, on: false }
  // 夹到锤子放得下的范围：右下留出柄的长度，上面别压 HUD（点击判定用的是原始坐标，不受影响）
  g.aim.x = clamp(x, 6, W - 28)
  g.aim.y = clamp(y, 34, H - 24)
  g.aim.on = true
}

/** 指针离开画面：锤子收起来（触屏抬手后也走这里） */
export function aimOff(g) {
  if (g.aim) g.aim.on = false
}

/* ---------- 顾客（3 坏 + 1 好） ---------- */
export const KINDS = {
  complain: {
    key: 'complain', name: '抱怨', bad: true,
    skin: '#f2c7a0', skin2: '#d9a274', hair: '#3b2b4a', cloth: '#c9694a', cloth2: '#a9513a',
    apron: '#f6e8d4',
    lines: [
      // 原句
      '等多久了？', '我赶时间', '叫你们店长', '快点快点',
      // 催促施压
      '这都半小时了', '到底好了没', '隔壁都吃上了', '催一下行不行',
      '别磨磨蹭蹭的', '饿死了都', '菜单都没人给', '人呢？没人吗',
      // 威胁/投诉
      '我要投诉', '再不上菜我走了', '差评差评', '你们效率呢',
      '叫经理出来', '这服务也太慢了',
    ],
  },
  cut: {
    key: 'cut', name: '插队', bad: true,
    skin: '#f6d0ab', skin2: '#dcae82', hair: '#8a5a2b', cloth: '#4a7fc9', cloth2: '#3a63a0',
    apron: '#e2ebf7',
    lines: [
      // 原句
      '我先来的', '让我插一下队嘛', '就一个', '让我先',
      // 找借口
      '我朋友在前面', '我赶车呢', '就点一份，很快', '队伍这么长',
      '我先站这儿的', '就插一下下',
      // 装可怜/理直气壮
      '通融通融呗', '别那么较真嘛', '让个位子嘛', '我又不耽误事',
      '我认识你们老板', '让我挤一下',
    ],
  },
  picky: {
    key: 'picky', name: '挑刺', bad: true,
    skin: '#eec49b', skin2: '#d3a274', hair: '#2b2b32', cloth: '#6a9a5b', cloth2: '#527a46',
    apron: '#eaf1dd',
    lines: [
      // 原句
      '这也不太对', '换一个吧', '太少了', '不太行',
      // 挑毛病
      '这菜怎么这样', '看着不新鲜', '这颜色不对啊', '分量太抠了',
      '太咸了', '不够辣', '油太多了',
      // 改要求/比较
      '不要葱姜蒜', '给我重做一份', '能不能加点量', '别人那桌比我多',
      '小份不是这个价',
    ],
  },
  nice: {
    key: 'nice', name: '好顾客', bad: false,
    skin: '#f9d8bb', skin2: '#e0b591', hair: '#a86a3a', cloth: '#e0adc4', cloth2: '#c290a7',
    apron: '#fff5e8',
    lines: ['谢谢你呀', '辛苦啦', '慢慢来', '不着急'],
  },
}
const BAD_KINDS = ['complain', 'cut', 'picky']

/* ---------- 随机（带种子，出图时可复现） ---------- */
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------- 一局 ---------- */
export function createGame(opts) {
  const o = opts || {}
  const g = {
    seed: o.seed == null ? (Date.now() % 1000000) : o.seed,
    reduce: !!o.reduce,
    speed: o.speed && SPEEDS[o.speed] ? o.speed : DEFAULT_SPEED,
    t: 0, left: DURATION,
    score: 0, combo: 0, bestCombo: 0, coins: 0,
    spawnIn: SPAWN_FROM, spawnCount: 0, lastGood: false,
    slots: HOLES.map(() => null),
    floats: [], flash: 0, over: false,
    hits: 0, mistakes: 0, missed: 0, spawned: 0,
    aim: { x: W / 2, y: H / 2, on: false },
    swing: null,   // { t, x, y, hit, landed }
    impact: null,  // { t, x, y } 落锤那一下的火花
  }
  g.rng = mulberry32(g.seed)
  g.spawnIn = spawnInterval(0, g.speed)
  return g
}

/** 出怪间隔：前 10 秒从 1.1 线性缩到 0.55，之后固定 0.55；再乘这一档的倍率（speed 不传就是 1 倍） */
export function spawnInterval(t, speed) {
  const sp = SPEEDS[speed]
  const mult = sp ? sp.mult : 1
  return (SPAWN_FROM - (SPAWN_FROM - SPAWN_TO) * Math.min(1, Math.max(0, t) / SPAWN_RAMP)) * mult
}

export function fmtClock(left) {
  const s = Math.max(0, Math.ceil(left))
  const p = (n) => String(n).padStart(2, '0')
  return `00:${p(s)}`
}

const eas = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p)) // smoothstep

function addFloat(g, text, x, y, color, life) {
  g.floats.push({ text, x, y, color, t: 0, life: life || 0.9 })
}

function stepFloats(g, dt) {
  for (const f of g.floats) f.t += dt
  g.floats = g.floats.filter((f) => f.t < f.life)
}

/* ---------- 生成一个顾客 ---------- */
function spawn(g, ev) {
  const free = []
  for (let i = 0; i < g.slots.length; i++) if (!g.slots[i]) free.push(i)
  if (!free.length) return
  const slot = free[Math.floor(g.rng() * free.length)]

  let kind = null
  const goodAlive = g.slots.some((c) => c && !KINDS[c.kind].bad)
  if (!goodAlive && !g.lastGood && g.spawnCount >= 3 && g.rng() < GOOD_CHANCE) kind = 'nice'
  if (!kind) kind = BAD_KINDS[Math.floor(g.rng() * BAD_KINDS.length)]

  const k = KINDS[kind]
  const lines = k.lines
  const text = lines[Math.floor(g.rng() * lines.length)]
  g.lastGood = kind === 'nice'
  g.spawnCount += 1
  g.spawned += 1
  g.slots[slot] = {
    slot, kind, age: 0,
    life: k.bad ? BAD_LIFE : GOOD_LIFE,
    phase: g.rng() * 6.28,
    state: 'up', anim: 0,
    text, bubble: BUBBLE_FOR,
  }
  ev.push({ type: 'spawn', slot, kind })
}

/* ---------- 走一帧 ---------- */
export function stepGame(g, dt) {
  const ev = []
  if (g.over || !(dt > 0)) return ev
  dt = Math.min(dt, 0.1)
  g.t += dt
  g.left -= dt

  for (let i = 0; i < g.slots.length; i++) {
    const c = g.slots[i]
    if (!c) continue
    c.age += dt
    if (c.state === 'up') {
      if (c.age >= c.life) {
        c.state = 'sink'
        c.anim = 0
        if (KINDS[c.kind].bad) {
          // 漏掉：连击清零、不扣分，飘一句
          g.combo = 0
          g.missed += 1
          addFloat(g, '他骂骂咧咧走了', HOLES[i].x, HOLES[i].y - 30, '#ffe0cc', 1.1)
          ev.push({ type: 'miss', slot: i })
        }
      }
    } else {
      c.anim += dt
      if (c.state === 'hit' && c.anim >= HIT_ANIM) g.slots[i] = null
      else if (c.state === 'sink' && c.anim >= SINK) g.slots[i] = null
    }
  }

  g.spawnIn -= dt
  if (g.spawnIn <= 0) {
    g.spawnIn = spawnInterval(g.t, g.speed)
    if (g.slots.filter(Boolean).length < MAX_ALIVE) spawn(g, ev)
  }

  stepFloats(g, dt)

  // 锤子：落锤那一刻记一个火花，挥完就收回抬手姿势
  if (g.swing) {
    const sw = g.swing
    sw.t += dt
    if (sw.hit && !sw.landed && sw.t >= SWING_LAND) {
      sw.landed = true
      g.impact = { t: 0, x: sw.x, y: sw.y }
    }
    if (sw.t >= SWING) g.swing = null
  }
  if (g.impact) {
    g.impact.t += dt
    if (g.impact.t >= 0.16) g.impact = null
  }

  if (g.flash > 0) g.flash = Math.max(0, g.flash - dt)

  if (g.left <= 0) {
    g.left = 0
    g.over = true
    ev.push({ type: 'end' })
  }
  return ev
}

/* ---------- 点某一格 ---------- */
export function tapAt(g, x, y) {
  const ev = []
  if (g.over) return ev
  aimAt(g, x, y) // 键盘 1~6 也要让锤子出现在那一格
  const i = slotAt(x, y)
  const c = i < 0 ? null : g.slots[i]
  const hittable = !!(c && c.state === 'up')
  g.swing = { t: 0, x, y, hit: hittable, landed: false }
  g.impact = null
  ev.push({ type: 'swing' })
  if (!hittable) {
    // 空挥：不罚、不扣分，只有很轻的一声「呼」
    ev.push({ type: 'whiff' })
    return ev
  }
  const k = KINDS[c.kind]
  const hx = HOLES[i].x
  const hy = HOLES[i].y

  if (k.bad) {
    g.score += 1
    g.hits += 1
    g.combo += 1
    g.bestCombo = Math.max(g.bestCombo, g.combo)
    c.state = 'hit'
    c.anim = 0
    addFloat(g, '+1', hx, hy - 30, '#fff3b0', 0.7)
    ev.push({ type: 'hit', slot: i, combo: g.combo })
    if (g.combo % COMBO_PER === 0 && g.coins < ROUND_COIN_CAP) {
      const add = Math.min(COIN_PER, ROUND_COIN_CAP - g.coins)
      g.coins += add
      addFloat(g, '+' + add, hx, hy - 38, '#ffd34d', 1.0)
      ev.push({ type: 'coin', amount: add })
    }
  } else {
    // 误伤好顾客：连击清零 + 罚 3 秒 + 红闪
    g.combo = 0
    g.mistakes += 1
    g.left = Math.max(0, g.left - PENALTY)
    g.flash = 0.35
    c.state = 'hit'
    c.anim = 0
    addFloat(g, '打错了！', hx, hy - 36, '#ffb9b9', 1.0)
    addFloat(g, '-3s', hx, hy - 22, '#ff8f8f', 1.0)
    ev.push({ type: 'wrong', slot: i })
    if (g.left <= 0) {
      g.over = true
      ev.push({ type: 'end' })
    }
  }
  return ev
}

/* ===========================================================================
   画面：底色、柜台、洞
   =========================================================================== */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function R(ctx, c, x, y, w, h) {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
}

// 5×5 的小图标：'1' 画一个像素
function blit(ctx, rows, x, y, color, scale) {
  const s = scale || 1
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === '1') R(ctx, color, x + c * s, y + r * s, s, s)
    }
  }
}

// 3×5 的数字/符号（HUD 用，比 canvas 文字清楚）
const GLYPH = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ':': ['000', '010', '000', '010', '000'],
  '/': ['001', '001', '010', '100', '100'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  'x': ['000', '101', '010', '101', '000'],
  ' ': ['000', '000', '000', '000', '000'],
}
const CLOCK = ['01110', '10001', '10101', '10001', '01110']
const STAR = ['00100', '01110', '11111', '01110', '01010']

export function tinyWidth(str, scale) {
  const s = scale || 1
  return String(str).length * 4 * s - s
}

function drawTiny(ctx, str, x, y, color, scale) {
  const s = scale || 1
  let cx = x
  for (const ch of String(str)) {
    blit(ctx, GLYPH[ch] || GLYPH[' '], cx, y, color, s)
    cx += 4 * s
  }
}

// canvas 里的中文小字（HUD 数字不用它；打桩渲染里没有 fillText，会直接跳过）
// 9px 是底线：8px 的中文在 1x 画、再放大之后基本认不出来
const TEXT_FONT = '9px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", monospace'

function drawText(ctx, str, x, y, color) {
  if (typeof ctx.fillText !== 'function') return
  ctx.font = TEXT_FONT
  ctx.fillStyle = color
  ctx.fillText(str, Math.round(x), Math.round(y))
}

/* ---------- 墙 ---------- */
function drawWall(ctx) {
  R(ctx, '#f7e8d1', 0, 14, W, 32)                                   // 壁纸
  for (let x = 4; x < W; x += 16) R(ctx, '#eedcc0', x, 20, 1, 26)   // 壁纸竖纹
  R(ctx, '#ead6b6', 0, 46, W, 14)                                   // 墙裙
  R(ctx, '#dcc39d', 0, 46, W, 1)
  R(ctx, '#c9ad86', 0, 58, W, 1)
  R(ctx, '#d8bd97', 0, 59, W, 1)
}

/* ---------- 柜台 ---------- */
function drawCounter(ctx) {
  R(ctx, '#6f452c', 0, 60, W, 2)
  R(ctx, '#c08450', 0, 62, W, 1)
  R(ctx, '#b07a45', 0, 63, W, 113)
  for (let x = 0; x < W; x += 40) R(ctx, '#a06b3b', x, 63, 1, 113)
  // 两排之间的浅分隔线：一眼看出是三排
  R(ctx, '#a06b3b', 0, 98, W, 1)
  R(ctx, '#c08450', 0, 99, W, 1)
  R(ctx, '#a06b3b', 0, 138, W, 1)
  R(ctx, '#c08450', 0, 139, W, 1)
  // 柜台上的一小盆绿植（在最后一格右边，不挡点击区）
  R(ctx, '#c96a4a', 147, 166, 8, 5)
  R(ctx, '#e08a63', 146, 165, 10, 2)
  R(ctx, '#5b8a4a', 149, 158, 4, 5)
  R(ctx, '#6fa25a', 147, 160, 3, 3)
  R(ctx, '#4e7a40', 151, 161, 3, 3)
  // 前脸（比台面深一档，才看得出是「立起来的那一面」）
  R(ctx, '#5c3620', 0, 176, W, 3)
  R(ctx, '#d0985f', 0, 176, W, 1)
  R(ctx, '#6b3f24', 0, 179, W, 17)
  for (let x = 0; x < W; x += 32) R(ctx, '#57311c', x, 179, 1, 17)
  R(ctx, '#432513', 0, 196, W, 3)
  R(ctx, '#331d0f', 0, 199, W, 1)
  // 前脸上贴的小票
  R(ctx, '#fffdf4', 6, 179, 14, 8)
  R(ctx, '#d8cfc0', 8, 181, 10, 1)
  R(ctx, '#d8cfc0', 8, 183, 8, 1)
  R(ctx, '#d8cfc0', 8, 185, 9, 1)
}

/* ---------- 洞 ---------- */
function drawHole(ctx, h) {
  const x = h.x
  const y = h.y
  // 洞比人窄一点（顾客身体 16 宽，洞 20 宽），看起来才是「从洞里冒出来」
  R(ctx, '#e0b078', x - 10, y - 5, 20, 1) // 远侧高光
  R(ctx, '#3a2317', x - 10, y - 4, 20, 9)
  R(ctx, '#4a2c1a', x - 9, y - 3, 18, 7)
  R(ctx, '#221108', x - 7, y - 2, 14, 4)
  R(ctx, '#5e3822', x - 10, y + 5, 20, 1) // 近侧边
  R(ctx, '#a8703f', x - 9, y + 4, 18, 1)
}

/* ===========================================================================
   顾客：身体 + 三种坏脸 + 好顾客
   =========================================================================== */

function drawCustomer(ctx, c, g) {
  const k = KINDS[c.kind]
  const h = HOLES[c.slot]
  const s = h.s // 这一排的大小（越靠后越小）
  const rise = c.state === 'up' ? Math.min(1, c.age / RISE) : 1
  let dy = (1 - eas(rise)) * 16
  let sx = 1
  let alpha = 1

  if (c.state === 'hit') {
    const p = Math.min(1, c.anim / HIT_ANIM)
    dy -= eas(p) * 16                     // 往上飞
    sx = Math.cos(p * Math.PI * 2) * (1 - 0.3 * p) // 横着翻一圈 + 缩一点，别糊成一条
    alpha = 1 - p * p
  } else if (c.state === 'sink') {
    const p = Math.min(1, c.anim / SINK)
    dy += eas(p) * 16          // 缩回洞里
    alpha = 1 - p
  }

  const bob = c.state === 'up' && !g.reduce ? Math.round(Math.sin(c.age * 3.4 + c.phase)) : 0
  const cx = h.x
  const cy = h.y + 1 + dy + bob

  ctx.save()
  ctx.beginPath()
  ctx.rect(cx - 14, h.y - 30, 28, 33)
  ctx.clip()
  ctx.globalAlpha = Math.max(0, alpha)
  if (Math.abs(sx) < 0.12) { ctx.restore(); return } // 转到侧面时先不画，看起来像在转

  // 这个函数把「以洞心为原点」的坐标换成画布坐标；sx 取负就是镜像（转圈用）
  const P = (color, x, y, w, hh) => {
    const a = cx + x * s * sx
    const b = cx + (x + w) * s * sx
    R(ctx, color, Math.min(a, b), cy + y * s, Math.abs(b - a), hh * s)
  }
  const px = (color, x, y) => P(color, x, y, 1, 1)

  /* 影子 + 身体 */
  P('rgba(0,0,0,.24)', -8, -2, 16, 3)
  P(k.cloth, -8, -13, 16, 13)
  P(k.cloth2, -8, -13, 16, 1)
  P(k.apron, -4, -11, 8, 11)
  P(k.cloth2, -3, -13, 6, 2)
  P(k.cloth2, -10, -11, 2, 8)
  P(k.cloth2, 8, -11, 2, 8)
  P(k.skin, -10, -4, 2, 2)
  P(k.skin, 8, -4, 2, 2)
  P(k.skin2, -1, -15, 2, 2)

  /* 头 */
  P(k.skin, -5, -26, 11, 12)
  P(k.skin2, -5, -15, 11, 1)
  P(k.skin2, -6, -22, 1, 3)
  P(k.skin2, 6, -22, 1, 3)

  /* 头发 */
  P(k.hair, -6, -28, 13, 4)
  P(k.hair, -6, -25, 2, 4)
  P(k.hair, 5, -25, 2, 4)

  /* 脸 */
  if (k.key === 'complain') {
    P('#4a2020', -4, -23, 3, 1)          // 竖起来的怒眉
    P('#4a2020', 2, -23, 3, 1)
    P('#2a1a20', -3, -22, 2, 2)
    P('#2a1a20', 2, -22, 2, 2)
    P('#7a2a2a', -2, -17, 4, 3)          // 张嘴在嚷
    P('#d06060', -1, -16, 2, 1)
    px('#e5484d', 8, -30)                // 额头上的火气十字
    px('#e5484d', 10, -30)
    px('#e5484d', 9, -31)
    px('#e5484d', 9, -29)
    P(k.skin, 9, -14, 3, 3)              // 一只拳头扒在柜台上
    P(k.skin2, 9, -14, 3, 1)
  } else if (k.key === 'cut') {
    P('#4a3020', -4, -23, 3, 1)
    P('#4a3020', 2, -23, 3, 1)
    P('#2a1a20', -4, -22, 3, 1)          // 半眯着眼，一副理所当然
    P('#2a1a20', 2, -22, 3, 1)
    P('#7a3a3a', -1, -17, 4, 1)          // 撇嘴
    P('#7a3a3a', 2, -18, 1, 1)
    P(k.skin, -12, -21, 3, 6)            // 举着手「我在这儿」
    P(k.skin2, -12, -22, 1, 2)
    P(k.skin2, -10, -22, 1, 2)
  } else if (k.key === 'picky') {
    P('#3a3a3a', -4, -24, 3, 1)          // 一条眉挑起来
    P('#3a3a3a', 2, -22, 3, 1)
    P('#2a2a30', -3, -21, 2, 1)
    P('#2a2a30', 2, -21, 2, 1)
    P('#2a2a30', -2, -20, 1, 1)
    P('#2a2a30', 3, -20, 1, 1)
    P('#6a4040', -2, -17, 4, 1)          // 抿着嘴，看什么都不顺眼
    P(k.skin, 9, -13, 5, 2)              // 指指点点
    P(k.skin2, 12, -13, 1, 1)
  } else {
    P('#a07a5a', -4, -23, 3, 1)
    P('#a07a5a', 2, -23, 3, 1)
    P('#2a1a20', -3, -22, 2, 2)
    P('#2a1a20', 2, -22, 2, 2)
    P('#ffffff', -3, -22, 1, 1)          // 眼里的高光
    P('#ffffff', 2, -22, 1, 1)
    P('#b05a5a', -2, -17, 4, 1)          // 笑
    P('#b05a5a', -3, -16, 1, 1)
    P('#b05a5a', 2, -16, 1, 1)
    P('#e8c86a', 9, -9, 5, 9)            // 手里拎着东西
    P('#c8a24a', 9, -9, 5, 1)
    P('#a8802a', 10, -11, 3, 2)
    P('#ef7fb0', 7, -30, 3, 2)           // 头顶的小爱心
    px('#ef7fb0', 8, -28)
  }

  ctx.restore()
}

/* ===========================================================================
   气泡、飘字、HUD
   =========================================================================== */

function wrapText(t) {
  const n = 5
  if (t.length <= n) return [t]
  return [t.slice(0, n), t.slice(n, n * 2) + (t.length > n * 2 ? '…' : '')]
}

/** 气泡的框：drawBubble 和「谁说话」的判断共用这一套算法 */
function bubbleBox(c) {
  const h = HOLES[c.slot]
  const s = h.s
  const lines = wrapText(c.text)
  const w = Math.max(...lines.map((l) => l.length)) * 9 + 6
  const hh = lines.length * 12 + 5
  const bx = clamp(Math.round(h.x - w / 2), 1, W - 1 - w)
  const headTop = Math.round(h.y + 1 - 28 * s)
  const by = Math.max(15, headTop - 3 - hh)
  return { x: bx, y: by, w, h: hh + 3 }
}

function bubbleFits(c, rects) {
  const b = bubbleBox(c)
  for (const r of rects) {
    if (r.c === c) continue
    if (b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y) return false
  }
  return true
}

function drawBubble(ctx, c) {
  if (c.state !== 'up' || c.age > BUBBLE_FOR) return
  const h = HOLES[c.slot]
  const lines = wrapText(c.text)
  const box = bubbleBox(c)
  const bx = box.x
  const by = box.y
  const w = box.w
  const hh = box.h - 3
  R(ctx, 'rgba(0,0,0,.18)', bx + 2, by + 2, w, hh) // 一点投影，别像贴在木头上
  R(ctx, '#2a2138', bx, by, w, hh)
  R(ctx, '#fffaf0', bx + 1, by + 1, w - 2, hh - 2)
  R(ctx, '#2a2138', h.x - 2, by + hh, 5, 3)      // 气泡的尖角，正好接到头顶
  R(ctx, '#fffaf0', h.x - 1, by + hh - 1, 3, 2)
  lines.forEach((l, i) => drawText(ctx, l, bx + 3, by + 11 + i * 12, '#241c33'))
}

function drawFloat(ctx, f) {
  const p = f.t / f.life
  const y = f.y - p * 10
  const w = f.text.length * 9
  const x = clamp(f.x - w / 2, 1, W - 1 - w)
  ctx.save()
  ctx.globalAlpha = Math.max(0, 1 - p * p)
  for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, f.text, x + d[0], y + d[1], '#2a1a20')
  drawText(ctx, f.text, x, y, f.color)
  ctx.restore()
}

function drawHud(ctx, g) {
  R(ctx, '#241a2b', 0, 0, W, 14)
  R(ctx, '#e0a96d', 0, 14, W, 1)
  blit(ctx, CLOCK, 4, 5, '#ffd9a8')
  drawTiny(ctx, fmtClock(g.left), 12, 5, g.left <= 10 ? '#ff9d9d' : '#fff3e2')
  blit(ctx, STAR, 56, 5, '#ffd34d')
  drawTiny(ctx, String(g.score), 64, 5, '#fff3e2')
  const t = 'x' + g.combo
  const cw = tinyWidth(t)
  const cx = W - 5 - cw
  if (g.combo >= COMBO_PER) R(ctx, '#8a4a1a', cx - 3, 2, cw + 6, 10)
  drawTiny(ctx, t, cx, 5, g.combo >= COMBO_PER ? '#ffe27a' : '#b9a9c4')
}

/* ===========================================================================
   一帧
   =========================================================================== */

/* ===========================================================================
   锤子：木柄 + 铁头，跟着指针；按下去挥一下
   打桩环境没有 ctx.rotate，所以不旋转贴图：握点钉在指针右下，锤头绕着它转。
   =========================================================================== */

const WOOD = ['#c08a52', '#a26b39', '#4a2c16']                 // 高光 / 木色 / 描边
const RUB = ['#ff8f7d', '#e0524a', '#a83029', '#3a1512']       // 高光 / 胶红 / 暗面 / 描边

/** 从握点 (gx,gy) 到锤头 (hx,hy) 画一根 3px 木柄，再画一个 14x9 的铁头 */
function drawHammerAt(ctx, hx, hy, gx, gy) {
  const n = Math.max(4, Math.round(Math.hypot(hx - gx, hy - gy) / 2))
  const x0 = Math.round(hx) - 10
  const y0 = Math.round(hy) - 7

  // 影子先落，锤子才不像贴在背景上（比锤头大一圈、往右下偏）
  ctx.save()
  ctx.globalAlpha = 0.2
  R(ctx, '#1e100c', x0 + 3, y0 + 5, 21, 13)
  ctx.restore()

  // 木柄：5px 深色描边 + 2px 木色，米色墙和木柜台上都认得出来
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1)
    R(ctx, WOOD[2], gx + (hx - gx) * k - 2, gy + (hy - gy) * k - 2, 5, 5)
  }
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1)
    const x = gx + (hx - gx) * k
    const y = gy + (hy - gy) * k
    R(ctx, WOOD[1], x - 1, y - 1, 2, 2)
    if (i % 3 === 0) R(ctx, WOOD[0], x - 1, y - 1, 1, 1)
  }

  // 胶锤头：20 x 14，四角收 1px，2px 深色描边
  R(ctx, RUB[3], x0 + 1, y0, 18, 14)
  R(ctx, RUB[3], x0, y0 + 1, 20, 12)
  R(ctx, RUB[1], x0 + 2, y0 + 2, 16, 10)
  R(ctx, RUB[0], x0 + 2, y0 + 2, 16, 3)   // 受光的顶面
  R(ctx, RUB[2], x0 + 2, y0 + 9, 16, 3)   // 背光的底面
  R(ctx, RUB[0], x0 + 2, y0 + 2, 3, 8)    // 左侧反光
  R(ctx, RUB[0], x0 + 6, y0 + 5, 8, 2)    // 胶面上的一道亮带
  R(ctx, '#ffc3ba', x0 + 4, y0 + 3, 3, 2)
}

/** 抬手（锤头在指针左上）→ 落锤（锤头压在指针上）→ 回手 */
function drawHammer(ctx, g) {
  if (!g.aim || !g.aim.on) return
  const ax = g.aim.x
  const ay = g.aim.y
  // 握点在指针右下，锤子举在指针右侧：不挡顾客、不压气泡，手指也盖不住它
  const gx = ax + 22
  const gy = ay + 20
  const bob = g.reduce ? 0 : Math.round(Math.sin(g.t * 2.6))
  const upX = ax + 17
  const upY = ay + 4 + bob
  const hitX = ax
  const hitY = ay - 4
  let hx = upX
  let hy = upY

  if (g.swing) {
    const p = Math.min(1, g.swing.t / SWING)
    const land = SWING_LAND / SWING
    if (p < 0.18) {
      const q = eas(p / 0.18)                     // 蓄力：往右上再抬一点
      hx = upX + 2 * q
      hy = upY - 3 * q
    } else if (p < land) {
      const q = eas((p - 0.18) / (land - 0.18))   // 砸下去
      hx = upX + 2 + (hitX - upX - 2) * q
      hy = upY - 3 + (hitY - upY + 3) * q
    } else {
      const q = eas((p - land) / (1 - land))      // 回手
      hx = hitX + (upX - hitX) * q
      hy = hitY + (upY - hitY) * q
    }
  }
  drawHammerAt(ctx, hx, hy, gx, gy)
}

/** 落锤的火花：8 个亮点向外散开，0.16 s 消失 */
function drawImpact(ctx, g) {
  const im = g.impact
  if (!im) return
  const p = Math.min(1, im.t / 0.16)
  const rad = 5 + Math.round(p * 11)
  const cols = ['#fff3b0', '#ffd34d', '#ff9d4d']
  ctx.save()
  ctx.globalAlpha = Math.max(0, 1 - p * p)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.4
    const rr = i % 2 ? rad : rad * 0.66
    R(ctx, cols[i % cols.length], im.x + Math.cos(a) * rr - 1, im.y + Math.sin(a) * rr - 1, 3, 3)
  }
  R(ctx, '#fff8dc', im.x - 2, im.y - 2, 5, 5)
  ctx.restore()
}

export function drawGame(ctx, g) {
  drawWall(ctx)
  drawCounter(ctx)
  for (const h of HOLES) drawHole(ctx, h)
  // 从后排往前排画（HOLES 本来就是按排排好的），气泡再盖在上面
  for (const c of g.slots) if (c) drawCustomer(ctx, c, g)
  // 谁说话：最新的那位优先，但如果他的气泡会压到别人身上，就退给下一个能说清楚的
  // （同一列前后排都有人时，谁的气泡都会糊住另一个人，这时候宁可不显示）
  const talkers = g.slots.filter((c) => c && c.state === 'up' && c.age <= BUBBLE_FOR).sort((a, b) => a.age - b.age)
  drawHammer(ctx, g)
  const rects = g.slots.filter(Boolean).map((c) => {
    const h = HOLES[c.slot]
    return { c, x: h.x - 10, y: h.y - 30, w: 20, h: 33 }
  })
  for (const t of talkers) {
    if (bubbleFits(t, rects)) { drawBubble(ctx, t); break }
  }
  for (const f of g.floats) drawFloat(ctx, f)
  drawImpact(ctx, g)
  if (g.flash > 0) {
    ctx.save()
    ctx.globalAlpha = (g.reduce ? 0.14 : 0.26) * (g.flash / 0.35)
    R(ctx, '#ff3b3b', 0, 0, W, H)
    ctx.restore()
  }
  drawHud(ctx, g)
  if (g.over) {
    ctx.save()
    ctx.globalAlpha = 0.42
    R(ctx, '#241a2b', 0, 0, W, H)
    ctx.restore()
  }
}

/** 结算页要的数字 */
export function resultOf(g) {
  return {
    score: g.score,
    bestCombo: g.bestCombo,
    coins: g.coins,
    hits: g.hits,
    mistakes: g.mistakes,
    missed: g.missed,
  }
}

/* ===========================================================================
   音效（WebAudio 现场合成，没有音频文件）
   =========================================================================== */

export function createSfx() {
  let on = true
  try { on = (localStorage.getItem(SFX_KEY) || '1') !== '0' } catch (e) { on = true }
  let ac = null
  let master = null

  function ctxOf() {
    if (!on || typeof window === 'undefined') return null
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    if (!ac) {
      try {
        ac = new C()
        master = ac.createGain()
        master.gain.value = 0.2
        master.connect(ac.destination)
      } catch (e) { ac = null; return null }
    }
    if (ac.state === 'suspended') { try { ac.resume() } catch (e) { /* 等下一次点击 */ } }
    return ac
  }

  function tone(freq, to, dur, type, gain, delay) {
    const c = ctxOf()
    if (!c || !master) return
    const t0 = c.currentTime + (delay || 0)
    const o = c.createOscillator()
    const gn = c.createGain()
    o.type = type || 'square'
    o.frequency.setValueAtTime(freq, t0)
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur)
    gn.gain.setValueAtTime(0.0001, t0)
    gn.gain.linearRampToValueAtTime(gain == null ? 0.5 : gain, t0 + 0.01)
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(gn)
    gn.connect(master)
    o.start(t0)
    o.stop(t0 + dur + 0.03)
  }

  /** 一小段噪声过带通：挥空的「呼」和落锤的「咚」用它，比纯振荡器更像物理的声音 */
  function noiseBurst(dur, gain, freq) {
    const c = ctxOf()
    if (!c || !master) return
    const n = Math.max(1, Math.floor(c.sampleRate * dur))
    let buf = null
    try { buf = c.createBuffer(1, n, c.sampleRate) } catch (e) { return }
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq || 1200
    bp.Q.value = 1.1
    const gn = c.createGain()
    gn.gain.value = gain == null ? 0.3 : gain
    src.connect(bp)
    bp.connect(gn)
    gn.connect(master)
    src.start()
  }

  return {
    get on() { return on },
    setOn(v) {
      on = !!v
      try { localStorage.setItem(SFX_KEY, on ? '1' : '0') } catch (e) { /* 存不了就算了 */ }
      if (on) ctxOf()
    },
    unlock() { ctxOf() },
    play(kind, extra) {
      if (!on) return
      if (kind === 'hit') {
        const step = Math.floor(((extra && extra.combo) || 1) / COMBO_PER)
        tone(660 + Math.min(400, step * 60), null, 0.07, 'square', 0.5)
      } else if (kind === 'coin') {
        tone(880, 1320, 0.09, 'triangle', 0.5)
        tone(1320, null, 0.09, 'square', 0.22, 0.09)
      } else if (kind === 'wrong') {
        tone(150, 90, 0.22, 'sawtooth', 0.45)
      } else if (kind === 'swing') {
        noiseBurst(0.06, 0.13, 1500)          // 挥锤的风声，很轻
      } else if (kind === 'whack') {
        tone(150, 62, 0.09, 'sine', 0.5)      // 落锤的「咚」
        noiseBurst(0.05, 0.24, 620)
      } else if (kind === 'whiff') {
        noiseBurst(0.05, 0.09, 900)           // 打空了：一点空气声，别吵
      } else if (kind === 'miss') {
        tone(220, null, 0.1, 'sine', 0.35)
      } else if (kind === 'start') {
        tone(520, null, 0.1, 'triangle', 0.4)
        tone(780, null, 0.1, 'triangle', 0.4, 0.1)
        tone(1040, null, 0.12, 'triangle', 0.4, 0.2)
      } else if (kind === 'end') {
        tone(780, null, 0.1, 'triangle', 0.4)
        tone(520, null, 0.2, 'triangle', 0.35, 0.1)
      }
    },
  }
}
