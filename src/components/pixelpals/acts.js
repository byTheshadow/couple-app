/* ===========================================================================
   第十四轮 · 相遇时的小动作（挥手 / 递奶茶 / 贴爱心）
   只负责「画」：PixelPals 把 { k, from, to, t0, dur } 丢进来，这里按 now 算出画在哪。
   不读设置、不碰网络、不写库——所有判断都在 PixelPals.jsx 里。
   每个笔触都带一圈深色描边：白天（天空、巴黎的铁塔）和雨夜（霓虹、路灯）都读得出来。
   =========================================================================== */

export const ACT_KINDS = ['wave', 'cup', 'heart']
export const ACT_DUR = { wave: 900, cup: 780, heart: 1000 }

const FLOOR = 98
const OUT = 'rgba(26,16,24,.55)' // 描边：半透明深色，压在亮背景上不脏，压在暗背景上也能分出来
const NB4 = [[-1, 0], [1, 0], [0, -1], [0, 1]]

const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }
const A = (ctx, v) => { ctx.globalAlpha = v < 0 ? 0 : v > 1 ? 1 : v }

/* 6×9 奶茶杯：S 吸管 / L 杯盖 / T 茶 / H 高光（和预览里的那张一致） */
const CUP = [
  '.S....',
  '.S....',
  '.SS...',
  'LLLLL.',
  'TTTTT.',
  'TTTTT.',
  'HHTTT.',
  'HTTTT.',
  '.TTT..',
]
const CUP_PAL = { S: '#e8604f', L: '#f7ead2', T: '#c98f5e', H: '#f6e3c6' }

const HEART = ['.X.X.', 'XXXXX', '.XXX.', '..X..']
const SPARK = ['.X.', 'XXX', '.X.']

/** 奶茶的抛物线：t=0 在我手边，t=1 到对面，中间拱起 7px */
export function cupPos(from, to, t) {
  const x = from + (to - from) * t
  const y = FLOOR - 20 - Math.sin(Math.PI * t) * 7
  return { x, y }
}

function drawCup(ctx, x, y) {
  const px = Math.round(x) - 3
  const py = Math.round(y) - 4
  const pts = []
  for (let r = 0; r < CUP.length; r++) {
    for (let i = 0; i < 6; i++) {
      if (CUP[r][i] !== '.') pts.push([px + i, py + r, CUP[r][i]])
    }
  }
  for (const p of pts) for (const d of NB4) R(ctx, OUT, p[0] + d[0], p[1] + d[1], 1, 1)
  for (const p of pts) R(ctx, CUP_PAL[p[2]], p[0], p[1], 1, 1)
}

/** 画一个小图案（heart / spark），outline 给了就先描一圈 */
function drawPat(ctx, pat, x, y, col, outline) {
  const px = Math.round(x)
  const py = Math.round(y)
  const pts = []
  for (let r = 0; r < pat.length; r++) {
    for (let i = 0; i < pat[r].length; i++) if (pat[r][i] === 'X') pts.push([px + i, py + r])
  }
  if (outline) for (const p of pts) for (const d of NB4) R(ctx, outline, p[0] + d[0], p[1] + d[1], 1, 1)
  for (const p of pts) R(ctx, col, p[0], p[1], 1, 1)
}

/* 一个「)」：三道这种弧线挨着排，就是「有人在跟你打招呼」 */
const ARC = ['..X', '.X.', 'X..', '.X.', '..X']

/** 挥手：TA 头顶右侧三道往外扇的弧线（一道一道冒出来，最后 1/4 淡出）+ 一颗小星 */
function drawWave(ctx, x, y, t) {
  const k = t < 0.26 ? 0 : t < 0.52 ? 1 : 2
  const up = Math.round(Math.sin(Math.PI * Math.min(1, t * 1.3)) * 2)
  A(ctx, t > 0.75 ? (1 - t) / 0.25 : 1)
  for (let i = 0; i <= k; i++) {
    drawPat(ctx, ARC, x + 3 + i * 4, y - 15 - i * 2 - up, i === 2 ? '#ffffff' : '#fff6d8', OUT)
  }
  if (k >= 1) drawPat(ctx, SPARK, x + 2, y - 23 - up, '#fff6d8', OUT)
  A(ctx, 1)
}

/** 递奶茶：杯子走抛物线，后面跟两颗淡掉的爱心 */
function drawCupAct(ctx, from, to, t) {
  const p = cupPos(from, to, t)
  if (t > 0.15) { A(ctx, 1 - t); drawPat(ctx, HEART, p.x - 9, p.y + 5, '#ff8fab', OUT) }
  if (t > 0.3) { A(ctx, (1 - t) * 0.8); drawPat(ctx, HEART, p.x - 14, p.y + 9, '#ffc2d4', OUT) }
  A(ctx, 1)
  drawCup(ctx, p.x, p.y)
}

/** 贴爱心：一颗心从对面头顶往上飘，旁边各飘一颗小的 */
function drawHeartAct(ctx, to, t) {
  const y = FLOOR - 26 - t * 16
  A(ctx, t > 0.8 ? (1 - t) / 0.2 : 1)
  drawPat(ctx, HEART, to - 2, y, '#ff5c8a', OUT)
  drawPat(ctx, HEART, to - 10, y - t * 6, '#ff9cba', OUT)
  drawPat(ctx, HEART, to + 6, y - 3 - t * 4, '#ffc2d4', OUT)
  A(ctx, 1)
}

/** 画一个动作。now 是毫秒时间戳，act 是 { k, from, to, t0, dur } */
export function drawAct(ctx, act, now) {
  if (!act || !act.k) return
  const dur = act.dur || ACT_DUR[act.k] || 800
  const t = (now - act.t0) / dur
  if (t < 0 || t > 1) return
  if (act.k === 'wave') drawWave(ctx, act.to, FLOOR - 23, t)
  else if (act.k === 'cup') drawCupAct(ctx, act.from, act.to, t)
  else if (act.k === 'heart') drawHeartAct(ctx, act.to, t)
}

/** 过期的扔掉，返回还活着的（一次相遇最多攒几条，不清理会一直画） */
export function pruneActs(list, now) {
  return list.filter((a) => now < a.t0 + (a.dur || ACT_DUR[a.k] || 800))
}