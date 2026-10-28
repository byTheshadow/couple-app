/* ===========================================================================
   小物 · 给顾客画小胡子 —— 4 张脸的纯绘制
   画法直接沿用 PixelPals 的 16×12 小头：头发包边、2×2 眼睛、2×1 嘴、腮红，
   只放大 5 倍，不另画写实五官。所有像素都走 fillRect，打桩可出图。
   =========================================================================== */
export const FACE_SIZE = 96
export const SCALE = 5
export const HX = 8
export const HY = 8

export const FACES = [
  { key: 'complain', name: '抱怨', hair: '#3b2b4a', hair2: '#58416b', cloth: '#c25d42', cloth2: '#99452f', apron: '#f8ead1' },
  { key: 'cut', name: '插队', hair: '#7a4a22', hair2: '#a86a31', cloth: '#3f72b5', cloth2: '#2f5890', apron: '#e5eef9' },
  { key: 'picky', name: '挑刺', hair: '#24242b', hair2: '#3f3f4a', cloth: '#5d8a50', cloth2: '#456b3b', apron: '#edf4df' },
  { key: 'nice', name: '好顾客', hair: '#a86636', hair2: '#c98a50', cloth: '#d99bb7', cloth2: '#b97a96', apron: '#fff5e8' },
]
const BY = {}
FACES.forEach((f) => { BY[f.key] = f })
export function getFace(key) { return BY[key] || FACES[0] }

const SKIN = '#f6d5bd'
const SKIN2 = '#e2b497'
const SKIN3 = '#c99678'
const EYE1 = '#8fc4ff'
const EYE2 = '#2f6fe0'
const BLUSH = '#f0a3a3'
const MOUTH = '#b0645f'

function R(ctx, color, x, y, w, h, s, ox, oy) {
  if (w <= 0 || h <= 0) return
  ctx.fillStyle = color
  ctx.fillRect(Math.round((ox + x * s)), Math.round((oy + y * s)), Math.round(w * s), Math.round(h * s))
}

function blit(ctx, rows, pal, s, ox, oy) {
  for (let y = 0; y < rows.length; y++) {
    const line = rows[y]
    for (let x = 0; x < line.length; x++) {
      const ch = line[x]
      const c = pal[ch]
      if (c) R(ctx, c, x, y, 1, 1, s, ox, oy)
    }
  }
}

// 16×12 头：沿用 PixelPals 的五官位置
const HEAD = [
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '..HHHHHHHHHHHH..',
  '..HHhHHHHHHhHH..',
  '..HHHSHHHSHHHH..',
  '..HHHSSSSSSHHH..',
  '..HHSESSSSESHH..',
  '..HHSFSSSSFSHH..',
  '..HHSbSSSSbSHH..',
  '..HHSSSmmSSSHH..',
  '..HHHsSSSSsHHH..',
  '...HHsSSSSsHH...',
  '......sSSs......',
]

// 身体：6 行，5 倍后是 30px，正好露到胸口
const BODY = [
  '.....CCCCCC.....',
  '...CCCccccCCC...',
  '..CCCCCCCCCCCC..',
  '.CCCCCCCCCCCCCC.',
  '.CCCCCCCCCCCCCC.',
  '.CCCCCCCCCCCCCC.',
]

function headFor(p) {
  const rows = HEAD.slice()
  if (p.key === 'complain') {
    // 怒眉 + 下撇嘴
    rows[5] = '..HHSSSSSSSSHH..'
    rows[9] = '..HHSSmmmmSSHH..'
    rows[10] = '..HHHsSSSSsHHH..'
  } else if (p.key === 'cut') {
    // 齐刘海 + 歪嘴
    rows[4] = '..HHHHHHHHHHHH..'
    rows[9] = '..HHSSSmmmSSHH..'
    rows[10] = '..HHHsSmmSsHHH..'
  } else if (p.key === 'picky') {
    // 高发际线 + 半眯眼
    rows[3] = '..HHhHHHHHHhHH..'
    rows[4] = '..HHSSSSSSSSHH..'
    rows[6] = '..HHSEsSSSEsHH..'
    rows[7] = '..HHSSSSSSSSHH..'
    rows[9] = '..HHSSSmmmSSHH..'
  } else {
    // 侧分 + 笑眼
    rows[3] = '..HHhHHHHHHhHH..'
    rows[4] = '..HHHSHHHSHHHH..'
    rows[9] = '..HHSSSmmmSSHH..'
    rows[10] = '..HHHsSSSSsHHH..'
  }
  return rows
}

function bodyFor() {
  return BODY.slice()
}

export function drawFace(ctx, key, size) {
  const p = getFace(key)
  const u = (size || FACE_SIZE) / FACE_SIZE
  const s = SCALE * u
  const ox = HX * u
  const oy = HY * u

  // 纸底
  ctx.fillStyle = '#f7eedc'
  ctx.fillRect(0, 0, Math.round(96 * u), Math.round(96 * u))
  ctx.fillStyle = '#e7d7be'
  for (let y = 5; y < 96; y += 8) for (let x = 5; x < 96; x += 8) ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.max(1, Math.round(u)), Math.max(1, Math.round(u)))

  const palBase = {
    S: SKIN, s: SKIN2, b: BLUSH, E: EYE1, F: EYE2, m: MOUTH,
    H: p.hair, h: p.hair2,
    C: p.cloth, c: p.cloth2, A: p.apron,
  }

  // 身体在头下面，先画
  const bodyPal = { ...palBase, C: p.cloth, c: p.cloth2, A: p.apron }
  // 身体坐标：与头的第 10 行重叠
  blit(ctx, bodyFor(p), bodyPal, s, ox, oy + 12 * SCALE * u)

  // 头
  blit(ctx, headFor(p), palBase, s, ox, oy)

  // 嘴巴/眉毛的额外点（用 1 格 = 5px 的块）
  if (p.key === 'complain') {
    R(ctx, p.hair, 4, 5.3, 2, 0.6, s, ox, oy)
    R(ctx, p.hair, 10, 5.3, 2, 0.6, s, ox, oy)
    R(ctx, '#7a2a2a', 7, 9, 2, 0.6, s, ox, oy)
  } else if (p.key === 'cut') {
    R(ctx, p.hair, 4, 5.3, 2, 0.6, s, ox, oy)
    R(ctx, p.hair, 10, 4.5, 2, 0.8, s, ox, oy)
    R(ctx, '#86c9e6', 14, 3, 1, 1.4, s, ox, oy)
    R(ctx, '#fff8ed', 7.5, 9.2, 1.5, 0.5, s, ox, oy)
  } else if (p.key === 'picky') {
    R(ctx, p.hair, 4, 5.1, 2, 0.6, s, ox, oy)
    R(ctx, p.hair, 10, 3.8, 2, 0.9, s, ox, oy)
    R(ctx, p.skin3, 4, 8.2, 2, 0.5, s, ox, oy)
    R(ctx, p.skin3, 10, 8.2, 2, 0.5, s, ox, oy)
  } else {
    R(ctx, p.hair2, 4, 4.6, 2, 0.6, s, ox, oy)
    R(ctx, p.hair2, 10, 4.6, 2, 0.6, s, ox, oy)
    R(ctx, '#fff8ed', 6.7, 9.2, 2.6, 0.5, s, ox, oy)
    // 耳钉
    R(ctx, '#f2c94c', 2, 10.5, 1, 1, s, ox, oy)
  }
  return p
}
