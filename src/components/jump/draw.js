/* ===========================================================================
   小物 · 一起跳一跳 —— 画布（纯绘制，不碰 React / 网络）
   画布 360 × 540，单位是逻辑像素；美术按 2px 一格，坐标尽量落在偶数上。
   这里只用 fillRect / fillText，方便用 _pixel-preview\raster.mjs 出静态帧。
   =========================================================================== */
import { VIEW, platformX, widthOf } from './engine.js'

const W = VIEW.W
const H = VIEW.H

/* ---------- 黄昏配色：上面偏紫，地平线偏橘 ---------- */
const SKY = ['#3a3160', '#463a6b', '#5b4675', '#775382', '#98648a', '#b97a8d', '#d5948f', '#e9ae9b']
const SKY_H = [70, 80, 80, 70, 60, 55, 45, 80]

const STARS = [
  [26, 30], [70, 54], [112, 22], [150, 70], [196, 34], [240, 58],
  [300, 26], [332, 74], [54, 110], [130, 124], [210, 102], [286, 120],
  [348, 116], [90, 160], [174, 150], [260, 166], [320, 150], [38, 190],
]

const TINT = {
  plain: { top: '#fbecd0', body: '#c99572', edge: '#7d5148' },
  quiz: { top: '#fff2bf', body: '#d3ac63', edge: '#7a5220' },
  spring: { top: '#d9f4df', body: '#7cc09f', edge: '#3f6f5a' },
  teleport: { top: '#dbeaff', body: '#7ea9d5', edge: '#3f5f86' },
  gift: { top: '#ffe1ea', body: '#d78ba6', edge: '#7d4358' },
  moving: { top: '#ffedbd', body: '#d4a95a', edge: '#7c5a24' },
}

/* ---------- 两个像素小人：沿用像素小屋的配色（u1 白发 / u2 黑发） ---------- */
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
  '......sSSs......',
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
  '..HH..sSSs..HH..',
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
const PAL_WORKER = {
  H: '#17171f', h: '#3d3d55', S: '#fde3d2', s: '#efc5ad', E: '#4a4560', F: '#14121c', b: '#ffaec0', m: '#d0848e',
  C: '#a9d5ff', c: '#ffffff', P: '#dfe5f2', O: '#7f97c6',
}
const FIG = { u1: { rows: SPR_CODER, pal: PAL_CODER }, u2: { rows: SPR_WORKER, pal: PAL_WORKER } }
const CELL = 2
const FIG_W = 16 * CELL
const FIG_H = 23 * CELL

/* ---------- 小工具 ---------- */
const even = (v) => Math.round(v / CELL) * CELL

function pat(ctx, rows, cx, y, cell, color) {
  ctx.fillStyle = color
  const ox = Math.round(cx - (rows[0].length * cell) / 2)
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === '.') continue
      ctx.fillRect(ox + c * cell, y + r * cell, cell, cell)
    }
  }
}

function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color
  for (let dy = -r; dy <= r; dy += 2) {
    const half = Math.sqrt(Math.max(0, r * r - dy * dy))
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), Math.max(2, Math.round(half * 2)), 2)
  }
}

/* ---------- 天空 / 星星 / 落日 / 云 / 远山 ---------- */
function drawSky(ctx, cam, t) {
  let y = 0
  for (let i = 0; i < SKY.length; i++) {
    ctx.fillStyle = SKY[i]
    ctx.fillRect(0, y, W, SKY_H[i])
    y += SKY_H[i]
  }

  for (let i = 0; i < STARS.length; i++) {
    const a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t * 1.5 + i * 1.7))
    ctx.globalAlpha = a
    ctx.fillStyle = '#fff3da'
    ctx.fillRect(STARS[i][0], STARS[i][1], 2, 2)
  }
  ctx.globalAlpha = 1

  // 落日：外面两圈光晕 + 圆盘
  const sx = 282
  const sy = 356
  ctx.globalAlpha = 0.14
  disc(ctx, sx, sy, 38, '#ffd9a8')
  ctx.globalAlpha = 0.22
  disc(ctx, sx, sy, 28, '#ffe2b6')
  ctx.globalAlpha = 1
  disc(ctx, sx, sy, 22, '#ffeecb')
  ctx.fillStyle = 'rgba(255,238,203,.45)'
  ctx.fillRect(sx - 48, sy + 10, 96, 2)
  ctx.fillRect(sx - 66, sy + 18, 132, 2)

  // 云：慢慢横着飘
  const span = W + 200
  for (let i = 0; i < 3; i++) {
    const raw = i * 170 + 30 - cam * 0.16
    const x = ((raw % span) + span) % span - 90
    cloud(ctx, x, 104 + i * 52, 62 + i * 14, 0.16)
  }
}

function cloud(ctx, x, y, w, alpha) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#ffd9c4'
  const u = Math.max(4, Math.round(w / 8))
  const bx = Math.round(x)
  const by = Math.round(y)
  ctx.fillRect(bx, by + u * 2, w, u * 2)
  ctx.fillRect(bx + u, by + u, w - u * 2, u * 2)
  ctx.fillRect(bx + u * 2, by, w - u * 4, u * 2)
  ctx.globalAlpha = 1
}

function hill(ctx, x, base, w, h, color) {
  ctx.fillStyle = color
  const steps = Math.max(3, Math.round(h / 8))
  const sh = Math.ceil(h / steps)
  for (let s = 0; s < steps; s++) {
    const inset = Math.round((((steps - 1 - s) / steps) * (w / 2)) / 2) * 2
    ctx.fillRect(Math.round(x + inset), Math.round(base - h + s * sh), Math.round(w - inset * 2), sh + 1)
  }
}

function drawHills(ctx, cam) {
  const span = 260
  let off = ((cam * 0.28) % span + span) % span
  for (let k = -1; k < 3; k++) hill(ctx, k * span - off + 10, 546, 250, 74, '#443560')
  const span2 = 320
  let off2 = ((cam * 0.5) % span2 + span2) % span2
  for (let k = -1; k < 3; k++) hill(ctx, k * span2 - off2 + 120, 574, 300, 66, '#2e2442')
}
/* ---------- 平台 ---------- */
function drawPlatform(ctx, p, cx, w) {
  const tint = TINT[p.type] || TINT.plain
  const x = even(cx - w / 2)
  const ww = Math.max(14, even(w))
  const top = even(p.y)

  ctx.globalAlpha = 0.12
  ctx.fillStyle = '#241a33'
  ctx.fillRect(x + 5, top + 18, ww - 10, 3)
  ctx.globalAlpha = 1

  ctx.fillStyle = tint.edge
  ctx.fillRect(x, top + 4, ww, 12)
  ctx.fillStyle = tint.body
  ctx.fillRect(x + 2, top + 4, ww - 4, 10)
  ctx.fillStyle = tint.edge
  ctx.fillRect(x + 2, top + 14, ww - 4, 2)

  ctx.fillStyle = tint.top
  ctx.fillRect(x, top, ww, 4)
  ctx.fillStyle = 'rgba(255,255,255,.5)'
  ctx.fillRect(x + 2, top, ww - 4, 1)
  ctx.fillStyle = 'rgba(255,255,255,.13)'
  ctx.fillRect(x + 2, top + 5, 1, 8)

  drawGlyph(ctx, p.type, x + ww / 2, top + 4, tint)
}

function drawGlyph(ctx, type, cx, y, tint) {
  if (type === 'plain') return
  const ink = tint.edge
  if (type === 'quiz') {
    pat(ctx, ['.###.', '#...#', '...#.', '..#..', '..#..'], cx, y, 2, '#8a5a1c')
  } else if (type === 'gift') {
    pat(ctx, ['..#..', '#####', '#.#.#', '#.#.#', '#####'], cx, y, 2, ink)
    ctx.fillStyle = '#fff1f6'
    ctx.fillRect(Math.round(cx - 1), y + 4, 2, 6)
  } else if (type === 'spring') {
    // 折线弹簧：三横 + 两端竖着连起来
    ctx.fillStyle = ink
    const x0 = Math.round(cx - 7)
    ctx.fillRect(x0, y + 1, 10, 2)
    ctx.fillRect(x0 + 8, y + 1, 2, 4)
    ctx.fillRect(x0 - 2, y + 5, 10, 2)
    ctx.fillRect(x0, y + 5, 2, 4)
    ctx.fillRect(x0, y + 9, 10, 2)
    ctx.fillStyle = '#eafff2'
    ctx.fillRect(x0 + 2, y + 1, 2, 1)
  } else if (type === 'teleport') {
    ctx.fillStyle = ink
    ctx.fillRect(Math.round(cx - 8), y + 1, 2, 8)
    ctx.fillRect(Math.round(cx + 6), y + 1, 2, 8)
    ctx.fillStyle = '#ecf7ff'
    ctx.fillRect(Math.round(cx - 2), y + 4, 4, 2)
    ctx.fillRect(Math.round(cx - 2), y + 1, 2, 2)
  } else if (type === 'moving') {
    pat(ctx, ['...#.', '..#..', '.#...', '..#..', '...#.'], cx - 9, y, 2, ink)
    pat(ctx, ['.#...', '..#..', '...#.', '..#..', '.#...'], cx + 9, y, 2, ink)
  }
}

function drawPlatforms(ctx, g, cam) {
  const from = Math.max(0, g.idx - 3)
  const to = Math.min(g.road.length - 1, g.idx + 9)
  for (let i = from; i <= to; i++) {
    const p = g.road[i]
    if (!p) continue
    const px = platformX(p, g.t) - cam
    if (px < -140 || px > W + 140) continue
    drawPlatform(ctx, p, px, widthOf(p, g.narrow && g.narrow[p.i]))
  }
}

/* ---------- 小人 ---------- */
export function drawFigure(ctx, cx, feetY, slot, squash, alpha) {
  const f = FIG[slot] || FIG.u1
  const s = squash || 1
  const top = feetY - FIG_H * s
  ctx.globalAlpha = alpha == null ? 1 : alpha
  for (let r = 0; r < f.rows.length; r++) {
    const line = f.rows[r]
    const ry = Math.round(top + r * CELL * s)
    for (let c = 0; c < line.length; c++) {
      const k = line[c]
      if (k === '.') continue
      const col = f.pal[k]
      if (!col) continue
      ctx.fillStyle = col
      ctx.fillRect(Math.round(cx - FIG_W / 2 + c * CELL), ry, CELL, CELL)
    }
  }
  ctx.globalAlpha = 1
}

function drawTrail(ctx, g, cam) {
  for (let i = 0; i < g.trail.length; i++) {
    const t = g.trail[i]
    ctx.globalAlpha = 0.06 + 0.16 * (i / g.trail.length)
    ctx.fillStyle = '#ffd9a0'
    ctx.fillRect(Math.round(t.x - cam - 5), Math.round(t.y - 18), 10, 18)
  }
  ctx.globalAlpha = 1
}

/* ---------- 粒子 / 浮字 ---------- */
function drawParticles(ctx, g, cam) {
  for (let i = 0; i < g.particles.length; i++) {
    const p = g.particles[i]
    if (p.life <= 0) continue
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max))
    ctx.fillStyle = p.color
    const s = p.size || 2
    ctx.fillRect(Math.round(p.x - cam), Math.round(p.y), s, s)
  }
  ctx.globalAlpha = 1
}

function drawFloats(ctx, g, cam) {
  if (!ctx.fillText) return
  ctx.font = '700 12px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < g.floats.length; i++) {
    const f = g.floats[i]
    if (f.life <= 0) continue
    const k = 1 - f.life / f.max
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.max))
    ctx.fillStyle = f.color
    ctx.fillText(f.text, Math.round(f.x - cam), Math.round(f.y - k * 18))
  }
  ctx.globalAlpha = 1
}

/* ---------- 左侧蓄力条 ---------- */
function drawBar(ctx, g) {
  const p = Math.max(0, Math.min(1, g.power || 0))
  if (p < 0.01) return
  const bx = 12
  const top = 196
  const bw = 10
  const bh = 172
  ctx.fillStyle = 'rgba(20,12,30,.52)'
  ctx.fillRect(bx - 3, top - 3, bw + 6, bh + 6)
  ctx.fillStyle = 'rgba(255,246,230,.12)'
  ctx.fillRect(bx, top, bw, bh)
  ctx.fillStyle = 'rgba(255,246,230,.22)'
  ctx.fillRect(bx - 3, top - 3, bw + 6, 1)
  ctx.fillRect(bx - 3, top + bh + 2, bw + 6, 1)
  {
    const hh = Math.round(bh * p)
    ctx.fillStyle = p < 0.5 ? '#8fe3a0' : p < 0.85 ? '#ffd45e' : '#ff835f'
    ctx.fillRect(bx, top + bh - hh, bw, hh)
  }
  ctx.fillStyle = 'rgba(255,246,230,.35)'
  ctx.fillRect(bx, top + Math.round(bh / 3), bw, 1)
  ctx.fillRect(bx, top + Math.round((bh * 2) / 3), bw, 1)
  ctx.fillStyle = 'rgba(255,246,230,.8)'
  ctx.fillRect(bx - 1, top - 6, bw + 2, 2)
}

/* ---------- 问号平台上的「先答题」提示 ---------- */
function drawQuizHint(ctx, g, cam) {
  const p = g.road[g.idx]
  if (!p || p.type !== 'quiz') return
  const bounce = Math.round(Math.sin(g.t * 4) * 2)
  const x = even(g.x - cam)
  const y = Math.round(g.y - FIG_H - 24 + bounce)
  ctx.fillStyle = 'rgba(28,18,34,.4)'
  ctx.fillRect(x - 12, y - 12, 24, 24)
  ctx.fillStyle = '#fff3cf'
  ctx.fillRect(x - 11, y - 11, 22, 22)
  pat(ctx, ['.###.', '#...#', '...#.', '..#..', '..#..'], x, y - 6, 2, '#7a5220')
}

/* ---------- 一帧 ---------- */
function squashOf(g) {
  if (g.mode === 'charge') return 1 - (g.power || 0) * 0.16
  if (g.mode === 'fly' || g.mode === 'hop') return 1 + Math.max(-0.04, Math.min(0.08, -g.vy / 9000))
  return 1 + (g.squash || 0) * 0.18
}

export function drawScene(ctx, g, opts) {
  const o = opts || {}
  const shake = g.shake > 0 ? Math.sin(g.t * 80) * 2 * g.shake : 0
  const cam = g.cam + shake
  drawSky(ctx, g.cam, g.t)
  drawHills(ctx, g.cam)
  drawPlatforms(ctx, g, cam)
  if (g.combo >= 3) drawTrail(ctx, g, cam)
  drawFigure(ctx, g.x - cam, g.y, o.slot, squashOf(g), g.mode === 'fall' ? 0.7 : 1)
  drawParticles(ctx, g, cam)
  drawFloats(ctx, g, cam)
  drawBar(ctx, g)
  if (o.quizHint) drawQuizHint(ctx, g, cam)
}

/** 还没有路的时候（登录中 / 报错）画个背景，别留一块黑 */
export function drawBackdrop(ctx) {
  drawSky(ctx, 0, 0)
  drawHills(ctx, 0)
}

export { W, H, FIG_W, FIG_H }