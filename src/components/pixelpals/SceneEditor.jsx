import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { BMP_W, BMP_H, BMP_CELLS, CLEAR, encodeLayer, decodeLayer, validateScene, registerUserScene, unregisterUserScene, paintCells } from './scenes'
import { W, H, createActor, stepActor, renderFrame, normalizeSettings } from './art'
import './studio.css'

/* ===========================================================================
   像素画编辑器：画一个自己的场景（80×60 格，每格 2×2 个像素），分「背景」和「前景」两层。
   - 背景：先画，在小人后面，每一格都要有颜色
   - 前景：后画，盖在小人前面，可以有透明的格子（比如近处的盆栽、桌子边）
   - 站位：小人脚站的那条线在第 49 行；上班时在「能走的范围」里来回走，放空时站在「放空站的位置」
   画出来的只是一份数据（调色板 + 两层格子 + 站位），页面按格子涂色，不会执行任何东西。
   =========================================================================== */

const CELL = 8 // 画布内部每格画 8 个像素；显示时按宽度缩放
const FLOOR_ROW = 49 // 小人脚站的地面线（画面第 98 像素 ÷ 2）
export const PREVIEW_ID = 'u:00000000-0000-0000-0000-000000000000' // 编辑时用来预览的临时名字，离开就注销

// 默认调色板：16 种好搭的颜色
export const DEFAULT_PAL = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
]

const TOOLS = [
  ['pen', '✏️', '铅笔'],
  ['erase', '🩹', '橡皮（前景）'],
  ['fill', '🪣', '填充'],
  ['rect', '▭', '矩形'],
  ['line', '／', '直线'],
  ['pick', '💧', '吸管'],
  ['pan', '✋', '平移（放大后用）'],
]
const TIMES = [['白天', 12], ['傍晚', 18.5], ['深夜', 22.5]]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const cleanName = (s) => Array.from(String(s == null ? '' : s).trim()).slice(0, 8).join('')

function bresenham(x0, y0, x1, y1, fn) {
  let dx = Math.abs(x1 - x0)
  let dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    fn(x0, y0)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}

/** 填充：从 (x, y) 开始，把相连的同色格子换成 to（四个方向相连）。没变化返回 false */
function floodFill(cells, x, y, to) {
  const from = cells[y * BMP_W + x]
  if (from === to) return false
  const stack = [x, y]
  while (stack.length) {
    const cy = stack.pop()
    const cx = stack.pop()
    if (cx < 0 || cy < 0 || cx >= BMP_W || cy >= BMP_H) continue
    const i = cy * BMP_W + cx
    if (cells[i] !== from) continue
    cells[i] = to
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1)
  }
  return true
}

/** 新场景的起步：上面是墙（灰蓝），从地面线起是地板 */
function starterBg() {
  const bg = new Uint8Array(BMP_CELLS)
  for (let y = 0; y < BMP_H; y++) bg.fill(y < FLOOR_ROW ? 13 : 14, y * BMP_W, (y + 1) * BMP_W)
  return bg
}

function buildInit(initial) {
  const d = initial && initial.data
  if (d && !validateScene(d) && d.bmp) {
    const bg = decodeLayer(d.bmp.bg, d.pal.length, false)
    const fg = d.bmp.fg ? decodeLayer(d.bmp.fg, d.pal.length, true) : new Uint8Array(BMP_CELLS).fill(CLEAR)
    if (bg && fg) {
      return { name: cleanName(initial.name || d.name), pal: d.pal.slice(), bg, fg, walk: d.spot.walk.slice(), stand: d.spot.stand, dim: d.bmp.dim === 1 }
    }
  }
  return { name: cleanName(initial && initial.name), pal: DEFAULT_PAL.slice(), bg: starterBg(), fg: new Uint8Array(BMP_CELLS).fill(CLEAR), walk: [40, 120], stand: 80, dim: false }
}

export default function SceneEditor({ initial, slot, saving, onSave, onCancel, say }) {
  const init = useMemo(() => buildInit(initial), []) // eslint-disable-line react-hooks/exhaustive-deps
  const bgRef = useRef(init.bg)
  const fgRef = useRef(init.fg)
  const palRef = useRef(init.pal)
  const [pal, setPalState] = useState(init.pal)
  const [name, setName] = useState(init.name)
  const [layer, setLayer] = useState('bg')
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState(init.pal.length > 13 ? 13 : 0)
  const [brush, setBrush] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [grid, setGrid] = useState(true)
  const [guides, setGuides] = useState(true)
  const [walk, setWalk] = useState(init.walk)
  const [stand, setStand] = useState(init.stand)
  const [dim, setDim] = useState(init.dim)
  const [pmode, setPmode] = useState('work') // 预览：上班 / 放空
  const [phr, setPhr] = useState(12) // 预览的钟点
  const [exp, setExp] = useState({ char: false, url: '', file: '' })
  const [tick, bump] = useReducer((n) => n + 1, 0)
  const hist = useRef({ undo: [], redo: [] })
  const drag = useRef(null)
  const canvasRef = useRef(null)
  const prevRef = useRef(null)
  const expUrl = useRef('')

  const setPal = (p) => { palRef.current = p; setPalState(p) }
  const cur = () => (layer === 'fg' ? fgRef.current : bgRef.current)
  const paintVal = (t) => (t === 'erase' ? CLEAR : color)

  /* ---------- 撤销 / 重做：整幅画（两层 + 调色板）存一份快照，最多 60 步 ---------- */
  const snap = () => ({ bg: bgRef.current.slice(), fg: fgRef.current.slice(), pal: palRef.current.slice() })
  const pushHist = () => {
    hist.current.undo.push(snap())
    if (hist.current.undo.length > 60) hist.current.undo.shift()
    hist.current.redo = []
  }
  const restore = (s) => {
    bgRef.current = s.bg
    fgRef.current = s.fg
    setPal(s.pal)
    setColor((c) => (c === CLEAR || c < s.pal.length ? c : 0))
    bump()
  }
  const undo = () => {
    const s = hist.current.undo.pop()
    if (!s) return
    hist.current.redo.push(snap())
    restore(s)
  }
  const redo = () => {
    const s = hist.current.redo.pop()
    if (!s) return
    hist.current.undo.push(snap())
    restore(s)
  }

  /* ---------- 画 ---------- */
  const stamp = (x, y, v) => {
    const c = cur()
    for (let dy = 0; dy < brush; dy++) {
      for (let dx = 0; dx < brush; dx++) {
        const px = x + dx
        const py = y + dy
        if (px < BMP_W && py < BMP_H) c[py * BMP_W + px] = v
      }
    }
  }
  const cellAt = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return [clamp(Math.floor(((e.clientX - r.left) / r.width) * BMP_W), 0, BMP_W - 1), clamp(Math.floor(((e.clientY - r.top) / r.height) * BMP_H), 0, BMP_H - 1)]
  }
  const onDown = (e) => {
    if (tool === 'pan') return
    e.preventDefault()
    try { canvasRef.current.setPointerCapture(e.pointerId) } catch { /* 个别浏览器不支持就算了 */ }
    const [x, y] = cellAt(e)
    if (tool === 'pick') {
      const v = cur()[y * BMP_W + x]
      if (v === CLEAR) { if (layer === 'fg') setColor(CLEAR) } else setColor(v)
      setTool('pen')
      return
    }
    pushHist()
    const v = paintVal(tool)
    if (tool === 'fill') { floodFill(cur(), x, y, v); bump(); return }
    drag.current = { tool, x0: x, y0: y, x, y, lx: x, ly: y, v }
    if (tool === 'pen' || tool === 'erase') { stamp(x, y, v); bump() }
    else bump()
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const [x, y] = cellAt(e)
    if (x === d.x && y === d.y) return
    d.x = x
    d.y = y
    if (d.tool === 'pen' || d.tool === 'erase') {
      bresenham(d.lx, d.ly, x, y, (px, py) => stamp(px, py, d.v))
      d.lx = x
      d.ly = y
    }
    bump()
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const c = cur()
    if (d.tool === 'rect') {
      for (let y = Math.min(d.y0, d.y); y <= Math.max(d.y0, d.y); y++) for (let x = Math.min(d.x0, d.x); x <= Math.max(d.x0, d.x); x++) c[y * BMP_W + x] = d.v
    } else if (d.tool === 'line') {
      bresenham(d.x0, d.y0, d.x, d.y, (px, py) => stamp(px, py, d.v))
    }
    bump()
  }

  const changeLayer = (l) => {
    setLayer(l)
    if (l === 'bg') {
      if (color === CLEAR) setColor(0)
      if (tool === 'erase') setTool('pen')
    }
  }
  const clearFg = () => {
    pushHist()
    fgRef.current.fill(CLEAR)
    bump()
  }

  /* ---------- 调色板 ---------- */
  const editColor = (hex) => setPal(palRef.current.map((c, i) => (i === color ? hex : c)))
  const addColor = () => {
    if (palRef.current.length >= 32) return
    pushHist()
    const next = [...palRef.current, '#ffffff']
    setPal(next)
    setColor(next.length - 1)
  }
  const used = (idx) => bgRef.current.includes(idx) || fgRef.current.includes(idx)
  const delColor = () => {
    if (color === CLEAR || palRef.current.length <= 1 || used(color)) return
    pushHist()
    const idx = color
    for (const c of [bgRef.current, fgRef.current]) for (let i = 0; i < c.length; i++) if (c[i] !== CLEAR && c[i] > idx) c[i] -= 1
    const next = palRef.current.filter((_, i) => i !== idx)
    setPal(next)
    setColor(Math.min(idx, next.length - 1))
    bump()
  }

  /* ---------- 把现在的画变成一份场景数据 ---------- */
  const buildData = useCallback((nm) => {
    const hasFg = fgRef.current.some((v) => v !== CLEAR)
    return {
      name: nm || '预览',
      pal: palRef.current.slice(),
      spot: { walk: [walk[0], walk[1]], stand },
      draw: [],
      front: [],
      jobs: {},
      bmp: { w: BMP_W, h: BMP_H, dim: dim ? 1 : 0, bg: encodeLayer(bgRef.current), ...(hasFg ? { fg: encodeLayer(fgRef.current) } : {}) },
    }
  }, [walk, stand, dim])

  const save = async () => {
    const nm = cleanName(name)
    if (!nm) { say('先给这个场景起个名字（8 个字以内）'); return }
    const d = buildData(nm)
    const bad = validateScene(d)
    if (bad) { say(bad); return }
    await onSave(nm, d)
  }

  /* ---------- 画布重绘 ---------- */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const PW = BMP_W * CELL
    const PH = BMP_H * CELL
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PW, PH)
    ctx.globalAlpha = layer === 'fg' ? 0.5 : 1 // 画前景时，背景淡一点，透明的地方一眼看得出来
    paintCells(ctx, bgRef.current, palRef.current, CELL)
    ctx.globalAlpha = 1
    paintCells(ctx, fgRef.current, palRef.current, CELL)
    // 画到一半的矩形 / 直线
    const d = drag.current
    if (d && (d.tool === 'rect' || d.tool === 'line')) {
      ctx.globalAlpha = 0.75
      ctx.fillStyle = d.v === CLEAR ? '#ff3b6b' : palRef.current[d.v]
      const f = (x, y) => ctx.fillRect(x * CELL, y * CELL, brush === 1 || d.tool === 'rect' ? CELL : CELL * brush, brush === 1 || d.tool === 'rect' ? CELL : CELL * brush)
      if (d.tool === 'rect') {
        for (let y = Math.min(d.y0, d.y); y <= Math.max(d.y0, d.y); y++) for (let x = Math.min(d.x0, d.x); x <= Math.max(d.x0, d.x); x++) f(x, y)
      } else bresenham(d.x0, d.y0, d.x, d.y, f)
      ctx.globalAlpha = 1
    }
    if (grid) {
      ctx.strokeStyle = 'rgba(0,0,0,.13)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= BMP_W; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, PH) }
      for (let y = 0; y <= BMP_H; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(PW, y * CELL + 0.5) }
      ctx.stroke()
    }
    if (guides) {
      const fy = FLOOR_ROW * CELL
      ctx.setLineDash([10, 6])
      ctx.strokeStyle = '#ff3b6b'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(PW, fy); ctx.stroke()
      // 小人：脚在地面线上，身高约 23 个像素 ≈ 11.5 格，宽约 16 个像素 = 8 格
      const sx = (stand / 2 - 4) * CELL
      ctx.strokeRect(sx, fy - 11.5 * CELL, 8 * CELL, 11.5 * CELL)
      ctx.setLineDash([])
      ctx.fillStyle = '#ff3b6b'
      ctx.font = `bold ${CELL * 2}px sans-serif`
      ctx.fillText('放空站这', sx - 2, fy - 11.5 * CELL - 6)
      // 上班时能走的范围
      ctx.fillStyle = '#1fb6a6'
      ctx.fillRect((walk[0] / 2) * CELL, fy + 4, ((walk[1] - walk[0]) / 2) * CELL, 6)
      ctx.fillRect((walk[0] / 2) * CELL, fy - 6, 4, 16)
      ctx.fillRect((walk[1] / 2) * CELL - 4, fy - 6, 4, 16)
    }
  }, [tick, layer, grid, guides, walk, stand, pal, brush])

  /* ---------- 真实预览：把现在的画临时登记成一个场景，用真的画法 + 真的小人画一遍 ---------- */
  useEffect(() => {
    const t = setTimeout(() => {
      const d = buildData('预览')
      if (!validateScene(d)) registerUserScene(PREVIEW_ID, d)
    }, 120)
    return () => clearTimeout(t)
  }, [tick, pal, walk, stand, dim, buildData])
  useEffect(() => () => unregisterUserScene(PREVIEW_ID), [])

  useEffect(() => {
    const d = buildData('预览')
    if (!validateScene(d)) registerUserScene(PREVIEW_ID, d)
    const settings = normalizeSettings(
      pmode === 'work'
        ? { work_scene: PREVIEW_ID, wake_h: 0, work_h: 1, off_h: 23, sleep_h: 23 }
        : { idle_scene: PREVIEW_ID, wake_h: 0, work_h: 1, off_h: 2, sleep_h: 23, idle_from: 3, idle_to: 23 },
      slot,
    )
    const a = createActor(slot)
    let raf = 0
    let last = performance.now()
    let acc = 0
    let tt = 0
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      acc += dt
      if (acc >= 0.08) { // 画面一秒约 12 帧，省电
        tt += acc
        stepActor(a, settings, phr, acc, 70)
        const cv = prevRef.current
        if (cv) renderFrame(cv.getContext('2d'), a, { slot, settings, gifts: [], mood: 70 }, phr, tt)
        acc = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmode, phr, slot])

  /* ---------- 导出 PNG / JPG ---------- */
  useEffect(() => () => { if (expUrl.current) URL.revokeObjectURL(expUrl.current) }, [])
  const doExport = (type) => {
    const out = document.createElement('canvas')
    out.width = BMP_W * CELL
    out.height = BMP_H * CELL
    const ctx = out.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    if (exp.char && prevRef.current) ctx.drawImage(prevRef.current, 0, 0, out.width, out.height) // 带小人：就是下面「真实预览」此刻的画面
    else {
      paintCells(ctx, bgRef.current, palRef.current, CELL)
      paintCells(ctx, fgRef.current, palRef.current, CELL)
    }
    const ext = type === 'image/jpeg' ? 'jpg' : 'png'
    const file = `像素小屋-${cleanName(name) || '场景'}.${ext}`
    out.toBlob((blob) => {
      if (!blob) { say('导出失败了，换个浏览器试试'); return }
      if (expUrl.current) URL.revokeObjectURL(expUrl.current)
      const url = URL.createObjectURL(blob)
      expUrl.current = url
      setExp((x) => ({ ...x, url, file }))
      const a = document.createElement('a')
      a.href = url
      a.download = file
      document.body.appendChild(a)
      a.click()
      a.remove()
      say(`已导出 ${ext.toUpperCase()}（640×480）。手机上如果没有自动保存，长按下面的图片保存`)
    }, type, 0.92)
  }

  const fgLayer = layer === 'fg'
  const unusedColor = color !== CLEAR && pal.length > 1 && !used(color)
  const stand2 = (v) => clamp(Math.round(v / 2) * 2, 0, 160)

  return (
    <div className="se">
      <div className="se-row">
        <input className="pp-in" type="text" maxLength={8} value={name} placeholder="给场景起个名字（8 个字以内）" aria-label="场景名字" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="pp-chips se-layers">
        <button type="button" className={`pp-chip${layer === 'bg' ? ' on' : ''}`} onClick={() => changeLayer('bg')}>🏞 背景（在小人后面）</button>
        <button type="button" className={`pp-chip${fgLayer ? ' on' : ''}`} onClick={() => changeLayer('fg')}>🌿 前景（盖在小人前面）</button>
      </div>

      <div className="se-tools" role="toolbar" aria-label="工具">
        {TOOLS.map(([k, e, n]) => (
          <button key={k} type="button" className={`se-tool${tool === k ? ' on' : ''}`} title={n} aria-label={n} aria-pressed={tool === k} disabled={k === 'erase' && !fgLayer} onClick={() => setTool(k)}>{e}</button>
        ))}
        <span className="se-sp" />
        <button type="button" className="se-tool" title="撤销" aria-label="撤销" disabled={!hist.current.undo.length} onClick={undo}>↩️</button>
        <button type="button" className="se-tool" title="重做" aria-label="重做" disabled={!hist.current.redo.length} onClick={redo}>↪️</button>
      </div>

      <div className={`se-cv${zoom === 2 ? ' z2' : ''}`}>
        <canvas
          ref={canvasRef}
          width={BMP_W * CELL}
          height={BMP_H * CELL}
          style={{ width: `${zoom * 100}%`, touchAction: tool === 'pan' ? 'pan-x pan-y' : 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="像素画布"
        />
      </div>

      <div className="pp-chips se-opts">
        <button type="button" className={`pp-chip${zoom === 2 ? ' on' : ''}`} onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}>🔍 放大 ×2{zoom === 2 ? '（用 ✋ 平移）' : ''}</button>
        <button type="button" className={`pp-chip${grid ? ' on' : ''}`} onClick={() => setGrid((g) => !g)}>▦ 格线</button>
        <button type="button" className={`pp-chip${guides ? ' on' : ''}`} onClick={() => setGuides((g) => !g)}>📍 站位参考线</button>
        <button type="button" className={`pp-chip${brush === 2 ? ' on' : ''}`} onClick={() => setBrush((b) => (b === 1 ? 2 : 1))}>🖌 粗笔 2×2</button>
        {fgLayer && <button type="button" className="pp-chip" onClick={clearFg}>🧽 清空前景</button>}
      </div>

      <div className="pp-sub">调色板 <small>{pal.length}/32 色{fgLayer ? ' · 前景可以选「透明」' : ''}</small></div>
      <div className="se-pal">
        {fgLayer && (
          <button type="button" className={`se-sw clear${color === CLEAR ? ' on' : ''}`} aria-label="透明" title="透明" onClick={() => setColor(CLEAR)} />
        )}
        {pal.map((c, i) => (
          <button key={i} type="button" className={`se-sw${color === i ? ' on' : ''}`} style={{ background: c }} aria-label={`颜色 ${i + 1}`} onClick={() => setColor(i)} />
        ))}
      </div>
      <div className="se-row se-colorrow">
        {color !== CLEAR && (
          <label className="se-pick">调这个颜色
            <input type="color" value={pal[color] || '#000000'} onChange={(e) => editColor(e.target.value)} aria-label="调整当前颜色" />
          </label>
        )}
        <button type="button" className="pp-chip" disabled={pal.length >= 32} onClick={addColor}>＋ 加一个颜色</button>
        <button type="button" className="pp-chip" disabled={!unusedColor} title="只能删没用到的颜色" onClick={delColor}>删掉这个颜色</button>
      </div>

      <div className="pp-sub">站位 <small>青色横条 = 上班时能走的范围；红框 = 放空时站的位置</small></div>
      <div className="se-sliders">
        <label>上班能走：左边界 <b>{walk[0]}</b>
          <input type="range" min="0" max={Math.max(0, walk[1] - 8)} step="2" value={walk[0]} onChange={(e) => setWalk([stand2(+e.target.value), walk[1]])} aria-label="上班能走的左边界" />
        </label>
        <label>上班能走：右边界 <b>{walk[1]}</b>
          <input type="range" min={Math.min(160, walk[0] + 8)} max="160" step="2" value={walk[1]} onChange={(e) => setWalk([walk[0], stand2(+e.target.value)])} aria-label="上班能走的右边界" />
        </label>
        <label>放空站的位置 <b>{stand}</b>
          <input type="range" min="0" max="160" step="2" value={stand} onChange={(e) => setStand(stand2(+e.target.value))} aria-label="放空站的位置" />
        </label>
      </div>
      <label className="se-check"><input type="checkbox" checked={dim} onChange={(e) => setDim(e.target.checked)} /> 傍晚和夜里自动变暗（和别的场景一样）</label>

      <div className="pp-sub">真实预览 <small>用真正的小人和画法画出来，就是 TA 看到的样子</small></div>
      <div className="pp-chips se-opts">
        {[['work', '上班'], ['idle', '放空']].map(([k, n]) => (
          <button key={k} type="button" className={`pp-chip${pmode === k ? ' on' : ''}`} onClick={() => setPmode(k)}>{n}</button>
        ))}
        {TIMES.map(([n, h]) => (
          <button key={h} type="button" className={`pp-chip${phr === h ? ' on' : ''}`} onClick={() => setPhr(h)}>{n}</button>
        ))}
      </div>
      <canvas ref={prevRef} className="se-prev" width={W} height={H} aria-label="场景预览" />

      <div className="pp-sub">导出图片</div>
      <label className="se-check"><input type="checkbox" checked={exp.char} onChange={(e) => setExp((x) => ({ ...x, char: e.target.checked }))} /> 带上预览里的小人（不勾 = 只导出你画的画）</label>
      <div className="pp-chips">
        <button type="button" className="pp-chip" onClick={() => doExport('image/png')}>⬇ 导出 PNG</button>
        <button type="button" className="pp-chip" onClick={() => doExport('image/jpeg')}>⬇ 导出 JPG</button>
      </div>
      {exp.url && (
        <div className="se-exp">
          <img src={exp.url} alt={exp.file} />
          <small>{exp.file} · 长按图片可以保存到相册</small>
        </div>
      )}

      <div className="pp-actions se-actions">
        <button type="button" className="btn ghost" disabled={saving} onClick={onCancel}>不存了，返回</button>
        <button type="button" className="btn" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存这个场景'}</button>
      </div>
    </div>
  )
}