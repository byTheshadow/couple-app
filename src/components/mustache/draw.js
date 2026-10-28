/* ===========================================================================
   小物 · 给顾客画小胡子 —— 自由手绘的纯像素逻辑
   96 × 96 的绘制层，只有 fillRect；笔刷/橡皮都落在这一层上，
   脸在下面，所以擦橡皮不会把顾客擦掉。raster.mjs 可以直接打桩。
   =========================================================================== */
import { drawFace } from './face.js'

export const CANVAS = 96

export const BRUSHES = [
  { key: 'fine', name: '细', size: 2 },
  { key: 'bold', name: '粗', size: 5 },
]

export const COLORS = [
  { key: 'ink', name: '墨黑', value: '#2a1a20' },
  { key: 'brown', name: '深棕', value: '#6d3b35' },
  { key: 'red', name: '红', value: '#c9473f' },
  { key: 'pink', name: '粉', value: '#ef7fb0' },
  { key: 'yellow', name: '黄', value: '#f2c94c' },
  { key: 'blue', name: '蓝', value: '#4a7fc9' },
  { key: 'green', name: '绿', value: '#5d8a50' },
  { key: 'cream', name: '奶油白', value: '#fff8ed' },
]

export function emptyLayer() {
  return new Array(CANVAS * CANVAS).fill(null)
}

function setPx(layer, x, y, color) {
  if (x < 0 || y < 0 || x >= CANVAS || y >= CANVAS) return
  layer[y * CANVAS + x] = color
}

/** 方形像素笔：size=2 就是 2×2 格，size=5 就是 5×5 格 */
export function stamp(layer, x, y, size, color) {
  const half = Math.floor(size / 2)
  const x0 = Math.round(x) - half
  const y0 = Math.round(y) - half
  for (let yy = 0; yy < size; yy++) {
    for (let xx = 0; xx < size; xx++) setPx(layer, x0 + xx, y0 + yy, color)
  }
}

/** 两个点之间补点，防止手指甩太快断线 */
export function line(layer, x0, y0, x1, y1, size, color) {
  const dx = x1 - x0
  const dy = y1 - y0
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    stamp(layer, x0 + dx * t, y0 + dy * t, size, color)
  }
}

export function paintStroke(layer, stroke) {
  const pts = stroke && stroke.points
  if (!pts || !pts.length) return
  const size = stroke.size
  const color = stroke.tool === 'eraser' ? null : stroke.color
  stamp(layer, pts[0].x, pts[0].y, size, color)
  for (let i = 1; i < pts.length; i++) {
    line(layer, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, size, color)
  }
}

export function buildLayer(strokes) {
  const layer = emptyLayer()
  for (const s of strokes || []) paintStroke(layer, s)
  return layer
}

/** 把绘制层画到脸上面；按同色横向连续段合并 fillRect，省调用 */
export function drawLayer(ctx, layer, size) {
  const scale = (size || CANVAS) / CANVAS
  for (let y = 0; y < CANVAS; y++) {
    let x = 0
    while (x < CANVAS) {
      const color = layer[y * CANVAS + x]
      if (!color) { x += 1; continue }
      let run = 1
      while (x + run < CANVAS && layer[y * CANVAS + x + run] === color) run += 1
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x * scale), Math.round(y * scale), Math.round(run * scale), Math.round(scale))
      x += run
    }
  }
}

/** 页面显示和导出共用：脸 + 绘制层 */
export function renderDrawing(ctx, size, faceKey, layer) {
  drawFace(ctx, faceKey, size)
  drawLayer(ctx, layer, size)
}

/** 打桩自检用：从笔画数据直接合成 */
export function renderStrokes(ctx, size, faceKey, strokes) {
  renderDrawing(ctx, size, faceKey, buildLayer(strokes))
}
