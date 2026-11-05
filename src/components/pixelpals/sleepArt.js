/* 梦海兔 · 睡眠页的画法（纯 canvas，不碰 React）。
   160×120，兔兔 sprite 18×20（参考 bunny.html），深色描边；船 30×10。 */
export const W = 160
export const H = 120

const MOON = '#efe0b8'
const MOON_HI = '#fbf2d8'
const CREAM = '#fdf8ee'
const INK = '#3b2a26'

const BUNNY_ROWS = [
  '..WW....', '.WPW....', '.WPW....', '.WPW....', '.WPW....',
  '.WWWWWWW', 'WWWWWWWW', 'WWWBWWWW', 'WWWBWWWW', 'WPPWWWWP',
  'WWWWWWWK', '.WWWWWWW', '..WWWWWW', '..WwWWWW', '..WWWWWW', '..wwWWWW',
]
const PAL = { W: '#fdf8ee', w: '#e2d6bd', P: '#f4a8b8', B: '#1f1411', K: '#3b2a26' }
const PAL_GREY = { W: '#c9d0dc', w: '#a8b0c0', P: '#e0a8b8', B: '#1f1411', K: '#2a303c' }
const BUNNY_CACHE = { cream: null, grey: null }

function bunnyGrid(grey) {
  const key = grey ? 'grey' : 'cream'
  if (BUNNY_CACHE[key]) return BUNNY_CACHE[key]
  const pal = grey ? PAL_GREY : PAL
  const GW = 18
  const GH = 20
  const g = Array.from({ length: GH }, () => new Array(GW).fill(null))
  const n = BUNNY_ROWS.length
  const ox = 1
  const oy = 18 - n
  for (let j = 0; j < n; j++) {
    const l = (BUNNY_ROWS[j] + '........').slice(0, 8)
    const full = l + l.split('').reverse().join('')
    for (let i = 0; i < 16; i++) {
      const ch = full[i]
      if (ch !== '.') g[oy + j][ox + i] = pal[ch]
    }
  }
  for (const [x, y] of [[14, 13], [15, 13], [14, 14], [15, 14]]) g[oy + y][ox + x] = pal.W
  const out = g.map((r) => r.slice())
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (g[y][x]) continue
      let nb = false
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const yy = y + dy
        const xx = x + dx
        if (yy >= 0 && yy < GH && xx >= 0 && xx < GW && g[yy][xx]) { nb = true; break }
      }
      if (nb) out[y][x] = pal.K
    }
  }
  BUNNY_CACHE[key] = out
  return out
}

export function drawBunny(ctx, x, y, scale, grey = false) {
  const g = bunnyGrid(grey)
  for (let j = 0; j < 20; j++) {
    for (let i = 0; i < 18; i++) {
      const c = g[j][i]
      if (c) { ctx.fillStyle = c; ctx.fillRect(x + i * scale, y + j * scale, scale, scale) }
    }
  }
}

const BOAT = [
  '....KKKKKKKKKKKKKKKKKKKKKK....',
  '..KKHHHHHHHHHHHHHHHHHHHHHHKK..',
  '.KHHHHHHHHHHHHHHHHHHHHHHHHHHK.',
  'KHHHHHHHHHHHHHHHHHHHHHHHHHHHHK',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  '.KWWWWWWWWWWWWWWWWWWWWWWWWWWK.',
  '..KWWWWWWWWWWWWWWWWWWWWWWWWK..',
  '...KWWWWWWWWWWWWWWWWWWWWWWK...',
  '....KKKKKKKKKKKKKKKKKKKKKK....',
  '..............................',
]
const BOAT_PAL = { K: '#30221e', H: '#c48e60', W: '#946244' }

export function drawBoat(ctx, x, y, scale) {
  for (let j = 0; j < BOAT.length; j++) {
    for (let i = 0; i < BOAT[j].length; i++) {
      const ch = BOAT[j][i]
      if (ch === '.') continue
      let c = BOAT_PAL[ch]
      if (j === 5 || j === 7) c = '#6e4a32'
      ctx.fillStyle = c
      ctx.fillRect(x + i * scale, y + j * scale, scale, scale)
    }
  }
}

const FISH = [
  '.......KKK..........', '.....KBBBBK.........', '...KBBBBBBBBK.......',
  '..KBBBBBBBBBBK......', '.KBBBBBBBBBBBBK.....', 'KTKBBBBBBBBEBBK.....',
  '.KTBBBBBBBBBBBK.....', '..KBBBBBBBBBBK......', '...KBBBBBBBBK.......',
  '....KBBBBBBK........', '.....KKFKKK.........', '......K..K..........',
]
const KOI = [
  '.......BBBB.........', '.....BBBBBBBB.......', '...BBBBBBBBBBBB.....',
  '..BBBBBBBBBBBBBB....', '.BBBBBBBBBBBBBBBB...', 'TTTBBBBBBBBBBEBB....',
  'TTTTBBBBBBBBBBBBB...', 'TTTBBBBBBBBBBBBBB...', '.TTBBBBBBBBBBBBB....',
  '..TTBBBBBBBBBBB.....', '...TTBBBBBBBBBB.....', '.....BBBBBBBB.......',
]
const PUFFER = [
  '...D..DD..D...', '..DDDDDDDDDD..', '.DDBBBBBBBBDD.', 'DDBBBBBBBBBBDD',
  'DBBBEBBBBBBBBD', 'TTBBBBBBBBBBBB', 'TTBBBBBBBBBBBB', '.DBBBBBBBBBBD.',
  '..DDBBBBBBDD..', '...DDDDDDDD...', '.....DDDD.....', '..............',
]
const JELLY = [
  '...KKKKK...', '..KBBBBBK..', '.KBBBBBBBK.', 'KBBBBBBBBBK', 'KBBBBBBBBBK',
  '.KBBBBBBBK.', '..KB..BK...', '..K.K..K...', '.K..KK..K..', '.K..K...K..',
  '..K.K..K...', '...K..K....',
]

function paint(ctx, x, y, cell, rows, cmap) {
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i]
      if (ch === '.') continue
      const c = cmap[ch]
      if (c) { ctx.fillStyle = c; ctx.fillRect(x + i * cell, y + j * cell, cell, cell) }
    }
  }
}

const SIL = { K: '#232c38', B: '#2c3644', T: '#242c38', F: '#1d2530', E: '#2c3644', D: '#242c38' }

/** 画一条鱼；locked = 图鉴里没钓到的剪影 */
export function drawFish(ctx, def, x, y, cell = 1, locked = false) {
  if (!def) return
  const shape = def.shape || 'oval'
  const cmap = locked
    ? SIL
    : { K: '#1f1411', B: def.body, T: def.tail || def.body, F: def.fin || def.body, E: def.eye || '#fdf8ee', D: def.fin || def.body }
  if (shape === 'round') {
    paint(ctx, x, y, cell, PUFFER, cmap)
    return
  }
  if (shape === 'koi') {
    paint(ctx, x, y, cell, KOI, cmap)
    if (!locked && def.patches) {
      ctx.fillStyle = '#e87850'
      ctx.fillRect(x + 9 * cell, y + 3 * cell, 4 * cell, 2 * cell)
      ctx.fillRect(x + 5 * cell, y + 6 * cell, 3 * cell, 2 * cell)
    }
    return
  }
  if (shape === 'jelly') {
    paint(ctx, x, y, cell, JELLY, cmap)
    if (!locked) {
      ctx.fillStyle = def.tail || '#ffc4dc'
      for (const [dx, dy] of [[3, 6], [4, 7], [5, 8], [6, 9], [7, 10]]) ctx.fillRect(x + dx * cell, y + dy * cell, cell, cell)
    }
    return
  }
  if (shape === 'paper') {
    const b = locked ? '#2c3644' : (def.body || '#ece2c6')
    ctx.fillStyle = b
    for (let i = 0; i < 16; i++) {
      const w = Math.max(1, 8 - Math.abs(i - 8))
      ctx.fillRect(x + i * cell, y + (6 - Math.floor(w / 2)) * cell, cell, w * cell)
    }
    if (!locked) {
      ctx.fillStyle = def.tail || '#d8c8a4'
      ctx.fillRect(x + 2 * cell, y + 4 * cell, cell, 3 * cell)
      ctx.fillStyle = def.eye || '#4a3a2c'
      ctx.fillRect(x + 12 * cell, y + 5 * cell, cell, cell)
    }
    return
  }
  // oval / crescent 共用椭圆鱼
  paint(ctx, x, y, cell, FISH, cmap)
  if (!locked && def.bands) {
    ctx.fillStyle = '#fdf8ee'
    ctx.fillRect(x + 8 * cell, y + 2 * cell, cell, 7 * cell)
    ctx.fillRect(x + 11 * cell, y + 2 * cell, cell, 7 * cell)
  }
  if (!locked && def.spots) {
    ctx.fillStyle = '#f5d06a'
    for (const [dx, dy] of [[6, 3], [9, 5], [12, 4], [7, 7]]) ctx.fillRect(x + dx * cell, y + dy * cell, cell, cell)
  }
  if (!locked && shape === 'crescent') {
    ctx.fillStyle = '#fdfcf4'
    ctx.fillRect(x + 6 * cell, y + 3 * cell, 3 * cell, cell)
    ctx.fillRect(x + 7 * cell, y + 2 * cell, cell, 3 * cell)
  }
}

function drawSky(ctx, t) {
  const bands = [
    [0, '#10122c'], [16, '#1a1840'], [32, '#2c2454'], [46, '#4a3260'],
    [58, '#6e4468'], [68, '#8a5470'], [73, '#3a3a52'], [76, '#24465a'],
  ]
  for (let i = 0; i < bands.length - 1; i++) {
    ctx.fillStyle = bands[i][1]
    ctx.fillRect(0, bands[i][0], W, bands[i + 1][0] - bands[i][0])
  }
  // 月亮
  ctx.fillStyle = MOON
  for (let y = -9; y <= 9; y++) {
    const w = Math.round(Math.sqrt(81 - y * y))
    ctx.fillRect(30 - w, 22 + y, w * 2, 1)
  }
  ctx.fillStyle = MOON_HI
  ctx.fillRect(27, 18, 4, 3)
  ctx.fillStyle = '#d8c8a0'
  ctx.fillRect(33, 24, 3, 2)
  // 星星
  const stars = [[12, 8], [42, 5], [58, 18], [74, 9], [88, 22], [104, 6], [118, 16], [136, 8], [148, 22], [22, 34], [50, 30], [66, 40], [98, 34], [126, 40], [140, 30], [8, 46], [36, 50], [78, 52], [112, 48], [150, 46]]
  for (let i = 0; i < stars.length; i++) {
    const [x, y] = stars[i]
    if (Math.floor(t * 1.5 + i) % 7 === 0) continue
    ctx.fillStyle = i % 4 === 0 ? '#cfe0e8' : '#f5eccf'
    ctx.fillRect(x, y, 1, 1)
  }
  // 云（两条）
  ctx.fillStyle = '#3a3a62'
  ctx.fillRect(60, 26, 22, 1)
  ctx.fillRect(64, 25, 12, 1)
  ctx.fillStyle = '#4a4068'
  ctx.fillRect(110, 34, 18, 1)
}

function drawSea(ctx, t) {
  ctx.fillStyle = '#123040'
  ctx.fillRect(0, 76, W, H - 76)
  ctx.fillStyle = '#1e4a58'
  ctx.fillRect(0, 76, W, 1)
  for (let y = 82; y < 118; y += 8) {
    for (let x = ((y / 8) % 2) * 4; x < W; x += 9) {
      ctx.fillStyle = y % 16 === 6 ? '#1a4452' : '#1e4a58'
      ctx.fillRect(x, y, 4, 1)
    }
  }
  // 月光路径
  for (let y = 80; y < 118; y += 4) {
    const w = 2 + Math.round((y / 4) % 3)
    const off = Math.round(Math.sin(y * 0.7 + t * 0.4) * 2)
    ctx.fillStyle = '#a8a080'
    ctx.fillRect(30 - w + off, y, w * 2, 1)
  }
}

function drawLantern(ctx, x, y, t) {
  ctx.fillStyle = '#30221e'
  ctx.fillRect(x, y, 1, 12)
  ctx.fillRect(x - 4, y - 4, 9, 2)
  ctx.fillStyle = '#ffd07a'
  ctx.fillRect(x - 2, y - 2, 5, 5)
  ctx.fillStyle = '#fff8dc'
  ctx.fillRect(x - 1, y - 1, 3, 3)
  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#ffcf7a'
  ctx.fillRect(x - 6, y - 6, 13, 13)
  ctx.globalAlpha = 1
  // 水面暖光
  ctx.fillStyle = '#8a6a3a'
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 3 + (i % 2), 78 + i * 3, 5, 1)
}

function drawFloat(ctx, x, y, t) {
  const yy = y + Math.round(Math.sin(t * 2) * 1)
  ctx.fillStyle = '#e25c52'
  ctx.fillRect(x - 2, yy - 3, 4, 2)
  ctx.fillStyle = '#fdf8ee'
  ctx.fillRect(x - 2, yy - 1, 4, 3)
  ctx.fillStyle = '#5a4438'
  ctx.fillRect(x - 1, yy + 2, 2, 1)
}

function drawRing(ctx, x, y, t) {
  ctx.fillStyle = '#ffe4aa'
  const r = 8
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16 + t * 0.5
    const px = Math.round(x + Math.cos(a) * r)
    const py = Math.round(y + Math.sin(a) * (r * 0.6))
    ctx.fillRect(px, py, 1, 1)
  }
}

/** 主入口：s = { t, grey, fish, p, biting, dim, phase } */
export function drawScene(ctx, s) {
  const t = s.t || 0
  drawSky(ctx, t)
  drawSea(ctx, t)
  // 灰兔（TA 也在）
  if (s.grey) {
    drawBunny(ctx, 14, 46, 1, true)
    drawBoat(ctx, 6, 66, 1)
  }
  // 主兔 + 船
  drawBunny(ctx, 62, 26, 2, false)
  drawBoat(ctx, 50, 56, 2)
  drawLantern(ctx, 104, 48, t)
  // 鱼线
  ctx.fillStyle = '#ece4d4'
  const x0 = 98
  const y0 = 50
  const fx = 134
  const fy = 84
  const steps = 26
  for (let i = 1; i < steps; i++) {
    const k = i / steps
    const x = Math.round(x0 + (fx - x0) * k)
    const y = Math.round(y0 + (fy - y0) * k + Math.sin(k * Math.PI) * 4)
    ctx.fillRect(x, y, 1, 1)
  }
  // 浮标 + 鱼影
  drawFloat(ctx, fx, fy, t)
  if (s.fish) {
    const rise = (s.p || 0) * 8
    drawFish(ctx, s.fish, 118, 86 - rise, 1)
  }
  if (s.biting) drawRing(ctx, fx, fy, t)
  // 变暗
  if (s.dim != null && s.dim < 1) {
    ctx.fillStyle = `rgba(4,8,14,${((1 - s.dim) * 0.55).toFixed(3)})`
    ctx.fillRect(0, 0, W, H)
  }
}