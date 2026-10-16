import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { Svg } from './Icon'
import './doodle.css'

/* ===========================================================================
   涂鸦小纸条
   - 默认导出 DoodlePad：画板页（画 → 预览 → 寄出，走 send_letter，kind = 'doodle'）
   - 具名导出 DoodleReplay：TA 拆信时把笔画一笔一笔重新画出来
   - 笔画存在信的 payload（jsonb）里，不存图片：几十 KB 以内，还能回放
   payload 形状：{ v: 1, w: 900, h: 1200, strokes: [{ t: 'p'|'m'|'e', c: '#rrggbb', w: 数字, p: [x0, y0, x1, y1, ...] }] }
   t：p 钢笔 / m 马克笔 / e 橡皮；坐标是 900×1200 画布上的整数像素
   =========================================================================== */

export const DOODLE_DRAFT_KEY = 'us-doodle-draft'

const W = 900
const H = 1200
const K = 2.5 // 滑杆数值 → 画布像素
const PAPER = '#fbfbf9' // 纸色固定，不跟明暗主题走：TA 看到的永远和你画的一样
const GRID = 'rgba(26,26,28,.09)'
const MAX_TITLE = 16
const MAX_JSON = 300000 // 序列化后超过这个大小就不让寄，避免撑爆数据库

const COLORS = ['#1a1a1c', '#e5484d', '#f08a4b', '#f2c94c', '#5fb878', '#4aa3df', '#7a6ff0', '#ef7fb0']
const NAMES = ['墨黑', '番茄红', '橘子橙', '奶油黄', '薄荷绿', '天空蓝', '葡萄紫', '樱花粉']
const MULT = { pen: 1, marker: 2.2, eraser: 2.4 }
const TOOLS = [
  { id: 'pen', label: '钢笔', icon: 'pen', code: 'p' },
  { id: 'marker', label: '马克笔', icon: 'marker', code: 'm' },
  { id: 'eraser', label: '橡皮', icon: 'eraser', code: 'e' },
]
const CODE_TO_TOOL = { p: 'pen', m: 'marker', e: 'eraser' }
const TOOL_TO_CODE = { pen: 'p', marker: 'm', eraser: 'e' }

/* ---------- 画笔 ---------- */

// 一笔：点之间用二次曲线平滑连接；马克笔半透明；橡皮用 destination-out 擦掉已有笔画
export function paintStroke(c, s) {
  const p = s.pts
  if (!p || !p.length) return
  c.save()
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.lineWidth = s.w
  c.strokeStyle = s.color
  c.fillStyle = s.color
  if (s.tool === 'marker') c.globalAlpha = 0.42
  if (s.tool === 'eraser') c.globalCompositeOperation = 'destination-out'
  if (p.length === 1) {
    c.beginPath()
    c.arc(p[0].x, p[0].y, s.w / 2, 0, Math.PI * 2)
    c.fill()
  } else {
    c.beginPath()
    c.moveTo(p[0].x, p[0].y)
    for (let i = 1; i < p.length - 1; i++) {
      c.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2)
    }
    c.lineTo(p[p.length - 1].x, p[p.length - 1].y)
    c.stroke()
  }
  c.restore()
}

/* ---------- 打包 / 解包 ---------- */

// 道格拉斯-普克抽稀：保留形状，去掉几乎在一条线上的点（用栈，不会爆调用栈）
function simplify(pts, eps) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const ax = pts[a].x
    const ay = pts[a].y
    const dx = pts[b].x - ax
    const dy = pts[b].y - ay
    const len = Math.sqrt(dx * dx + dy * dy)
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = len === 0
        ? Math.hypot(pts[i].x - ax, pts[i].y - ay)
        : Math.abs(dy * (pts[i].x - ax) - dx * (pts[i].y - ay)) / len
      if (d > max) { max = d; idx = i }
    }
    if (idx > 0 && max > eps) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

// 画板里的完整历史（含「清空」标记）→ 要存的 payload：只保留最后一次清空之后的笔画
export function pack(history) {
  let start = 0
  history.forEach((s, i) => { if (s.clear) start = i + 1 })
  const strokes = []
  history.slice(start).forEach((s) => {
    if (s.clear || !s.pts || !s.pts.length) return
    const flat = []
    simplify(s.pts, 1).forEach((q) => { flat.push(Math.round(q.x), Math.round(q.y)) })
    strokes.push({ t: TOOL_TO_CODE[s.tool], c: s.color, w: Math.round(s.w * 10) / 10, p: flat })
  })
  return { v: 1, w: W, h: H, strokes }
}

// payload → 可以直接画的笔画数组。内容来自服务端 / 本地存储，所以逐项校验
export function unpack(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.strokes)) return null
  const out = []
  let total = 0
  data.strokes.slice(0, 3000).forEach((s) => {
    const tool = CODE_TO_TOOL[s && s.t]
    if (!tool || !Array.isArray(s.p)) return
    const pts = []
    for (let i = 0; i + 1 < s.p.length && total < 80000; i += 2) {
      const x = Number(s.p[i])
      const y = Number(s.p[i + 1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      pts.push({ x, y })
      total += 1
    }
    if (!pts.length) return
    out.push({
      tool,
      color: /^#[0-9a-f]{6}$/i.test(s.c) ? s.c : COLORS[0],
      w: Math.min(200, Math.max(1, Number(s.w) || 6)),
      pts,
    })
  })
  return out
}

const inkOf = (list) => {
  let ink = false
  list.forEach((s) => { if (s.clear) ink = false; else if (s.tool !== 'eraser') ink = true })
  return ink
}

// 成品 PNG（只用来做寄出前的预览和飞走动画，不上传）：纸色 + 方格 + 笔画
function renderPNG(packed) {
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const c = out.getContext('2d')
  c.fillStyle = PAPER
  c.fillRect(0, 0, W, H)
  c.strokeStyle = GRID
  c.lineWidth = 2
  c.beginPath()
  for (let i = 0; i < 15; i++) { c.moveTo(i * 60 + 1, 0); c.lineTo(i * 60 + 1, H) }
  for (let j = 0; j < 20; j++) { c.moveTo(0, j * 60 + 1); c.lineTo(W, j * 60 + 1) }
  c.stroke()
  const layer = document.createElement('canvas')
  layer.width = W
  layer.height = H
  const lc = layer.getContext('2d')
  const list = unpack(packed) || []
  list.forEach((s) => paintStroke(lc, s))
  c.drawImage(layer, 0, 0)
  return out.toDataURL('image/png')
}

const mapError = (e) => {
  const m = e?.message || ''
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '服务端没找到 send_letter 函数，先检查 Supabase 里的 SQL'
  if (m.includes('no partner')) return '还没有另一半的账号'
  if (m.includes('empty body')) return '画布还是空的，先画点什么吧'
  if (m.includes('bad kind')) return '服务端还不认涂鸦这种信'
  return `没寄出去：${m}`
}

/* ===========================================================================
   拆信回放：TA 打开涂鸦信时，笔画一笔一笔重新画出来。点一下跳过 / 重播。
   用法：<DoodleReplay payload={o_payload} />
   =========================================================================== */
export function DoodleReplay({ payload }) {
  const cvRef = useRef(null)
  const rafRef = useRef(0)
  const strokes = useMemo(() => unpack(payload) || [], [payload])
  const total = useMemo(() => strokes.reduce((n, s) => n + s.pts.length, 0), [strokes])
  const [done, setDone] = useState(false)

  // 画到第 k 个点为止（按点数计，笔画之间依次接上）
  const drawUpTo = useCallback((k) => {
    const cv = cvRef.current
    if (!cv) return
    const c = cv.getContext('2d')
    c.clearRect(0, 0, W, H)
    let used = 0
    for (const s of strokes) {
      if (used >= k) break
      const n = s.pts.length
      const take = Math.min(n, k - used)
      used += n
      paintStroke(c, take === n ? s : { ...s, pts: s.pts.slice(0, take) })
    }
  }, [strokes])

  const run = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!total || reduce) { drawUpTo(total); setDone(true); return }
    setDone(false)
    const dur = Math.min(6000, Math.max(1600, total * 7))
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      drawUpTo(Math.floor(p * total))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
      else setDone(true)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [total, drawUpTo])

  useEffect(() => {
    run()
    return () => cancelAnimationFrame(rafRef.current)
  }, [run])

  const tap = () => {
    if (done) { run(); return }
    cancelAnimationFrame(rafRef.current)
    drawUpTo(total)
    setDone(true)
  }

  return (
    <div className="dd-replay">
      <div className="dd-sheet">
        <span className="dd-tape l" /><span className="dd-tape r" />
        <div className="dd-paper" role="img" aria-label="TA 画的涂鸦" onClick={tap}>
          <canvas ref={cvRef} className="dd-cv ro" width={W} height={H} />
        </div>
      </div>
      <div className="h-sub">{done ? '点一下画面，再看一遍它是怎么被画出来的' : '点一下画面，直接看完'}</div>
    </div>
  )
}

/* ===========================================================================
   画板页
   用法：<DoodlePad onExit={(message) => ...} />
   - 离开（返回 / 寄出完成）时调用 onExit，message 是想在上一页提示的一句话（可能为空）
   - 草稿会自动存在这台设备里：就算直接按系统返回键，下次进来也能接着画
   =========================================================================== */
export default function DoodlePad({ onExit }) {
  const { theme, toggle } = useTheme()
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState(0)
  const [size, setSize] = useState(6)
  const [, bump] = useReducer((n) => n + 1, 0)
  const [sheet, setSheet] = useState(null) // null | { kind: 'exit' } | { kind: 'send', url, packed }
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [saved, setSaved] = useState(false)
  const [paperW, setPaperW] = useState(340)

  const cvRef = useRef(null)
  const paperRef = useRef(null)
  const imgRef = useRef(null)
  const layerRef = useRef(null) // 已经画完的笔画（离屏画布）
  const strokesRef = useRef([]) // 历史：画过的每一笔，含 { clear: true } 标记
  const redoRef = useRef([])
  const curRef = useRef(null) // 正在画的这一笔
  const pidRef = useRef(null)
  const rafRef = useRef(0)
  const saveT = useRef(0)
  const toastT = useRef(0)
  const skipSave = useRef(false) // 已寄出 / 已丢弃：离开时不再写草稿
  const flyRef = useRef(null)

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const getLayer = useCallback(() => {
    if (!layerRef.current) {
      const l = document.createElement('canvas')
      l.width = W
      l.height = H
      layerRef.current = l
    }
    return layerRef.current
  }, [])

  const render = useCallback(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(getLayer(), 0, 0)
    if (curRef.current) paintStroke(ctx, curRef.current)
  }, [getLayer])

  // 画的时候每帧最多重绘一次
  const schedule = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; render() })
  }, [render])

  const rebuild = useCallback(() => {
    const lc = getLayer().getContext('2d')
    lc.clearRect(0, 0, W, H)
    strokesRef.current.forEach((s) => { if (s.clear) lc.clearRect(0, 0, W, H); else paintStroke(lc, s) })
    render()
  }, [getLayer, render])

  /* ---------- 草稿 ---------- */
  const flush = useCallback(() => {
    clearTimeout(saveT.current)
    try {
      if (!inkOf(strokesRef.current)) { localStorage.removeItem(DOODLE_DRAFT_KEY); return false }
      localStorage.setItem(DOODLE_DRAFT_KEY, JSON.stringify(pack(strokesRef.current)))
      return true
    } catch { return false }
  }, [])

  // 画布内容变了：刷新界面，0.7 秒后自动存草稿
  const touch = useCallback(() => {
    setSaved(false)
    bump()
    clearTimeout(saveT.current)
    saveT.current = setTimeout(() => { if (!skipSave.current && flush()) setSaved(true) }, 700)
  }, [flush])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOODLE_DRAFT_KEY)
      const list = raw ? unpack(JSON.parse(raw)) : null
      if (list && inkOf(list)) {
        strokesRef.current = list
        rebuild()
        bump()
        setSaved(true)
        say('已恢复上次没画完的涂鸦')
      }
    } catch { /* 草稿损坏就当没有 */ }
    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(toastT.current)
      clearTimeout(saveT.current)
      if (flyRef.current) flyRef.current.remove()
      if (!skipSave.current) flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 纸的实际宽度：用来让笔刷预览圆点和真实笔迹一样大
  useEffect(() => {
    const el = paperRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => setPaperW(el.getBoundingClientRect().width || 340))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ---------- 画 ---------- */
  const pt = (e) => {
    const r = cvRef.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height }
  }

  const onDown = (e) => {
    if (curRef.current || sheet) return // 第二根手指 / 手掌误触 / 弹层开着，忽略
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 个别浏览器不支持 */ }
    pidRef.current = e.pointerId
    curRef.current = { tool, color: COLORS[color], w: size * K * MULT[tool], pts: [pt(e)] }
    schedule()
    bump()
  }

  const onMove = (e) => {
    const cur = curRef.current
    if (!cur || e.pointerId !== pidRef.current) return
    const native = e.nativeEvent
    const evs = native.getCoalescedEvents ? native.getCoalescedEvents() : [native]
    const list = evs.length ? evs : [native]
    list.forEach((ev) => {
      const p = pt(ev)
      const l = cur.pts[cur.pts.length - 1]
      if (Math.abs(p.x - l.x) + Math.abs(p.y - l.y) > 1.5) cur.pts.push(p)
    })
    schedule()
  }

  const onEnd = (e) => {
    const cur = curRef.current
    if (!cur || e.pointerId !== pidRef.current) return
    strokesRef.current.push(cur)
    paintStroke(getLayer().getContext('2d'), cur)
    curRef.current = null
    redoRef.current = []
    render()
    touch()
  }

  const undo = useCallback(() => {
    const s = strokesRef.current.pop()
    if (!s) return
    redoRef.current.push(s)
    rebuild()
    touch()
  }, [rebuild, touch])

  const redo = useCallback(() => {
    const s = redoRef.current.pop()
    if (!s) return
    strokesRef.current.push(s)
    rebuild()
    touch()
  }, [rebuild, touch])

  const clearAll = () => {
    if (!inkOf(strokesRef.current)) { say('画布已经是空的'); return }
    strokesRef.current.push({ clear: true })
    redoRef.current = []
    rebuild()
    touch()
    say('已清空，可以点撤销找回')
  }

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  useEffect(() => {
    if (!sheet) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && !busy) setSheet(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, busy])

  /* ---------- 离开 ---------- */
  const goBack = () => {
    if (!inkOf(strokesRef.current)) { onExit?.(); return }
    setSheet({ kind: 'exit' })
  }

  const keepDraft = () => {
    const ok = flush()
    setSheet(null)
    onExit?.(ok ? '草稿已保存' : '')
  }

  const dropDraft = () => {
    skipSave.current = true
    clearTimeout(saveT.current)
    try { localStorage.removeItem(DOODLE_DRAFT_KEY) } catch { /* ignore */ }
    setSheet(null)
    onExit?.('已丢弃')
  }

  /* ---------- 寄出 ---------- */
  const openSend = () => {
    const packed = pack(strokesRef.current)
    if (!packed.strokes.some((s) => s.t !== 'e')) return
    if (JSON.stringify(packed).length > MAX_JSON) { say('画得太满啦，擦掉一些再寄吧'); return }
    setTitle('')
    setErr('')
    setBusy(false)
    setSheet({ kind: 'send', url: renderPNG(packed), packed })
  }

  // 成品飞走：先量好预览图的位置，关掉弹层，再让一张同样大小的图飞向屏幕上方
  const fly = (url) => {
    const done = () => onExit?.('涂鸦已寄出，TA 会收到一个信封')
    const r = imgRef.current ? imgRef.current.getBoundingClientRect() : null
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!r || reduce) { setSheet(null); done(); return }
    const el = document.createElement('div')
    el.className = 'dd-fly'
    el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`
    const im = document.createElement('img')
    im.alt = ''
    im.src = url
    el.appendChild(im)
    document.body.appendChild(el)
    flyRef.current = el
    setSheet(null)
    const a = el.animate([
      { transform: 'translateY(0) scale(1) rotate(-1.6deg)', opacity: 1 },
      { transform: 'translateY(-62vh) scale(.22) rotate(16deg)', opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' })
    a.onfinish = () => { el.remove(); flyRef.current = null; done() }
  }

  const doSend = async () => {
    if (busy || !sheet || sheet.kind !== 'send') return
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('send_letter', {
      p_kind: 'doodle',
      p_title: title.trim() || '一张涂鸦',
      p_body: '',
      p_payload: sheet.packed,
    })
    if (error) { setBusy(false); setErr(mapError(error)); return }
    skipSave.current = true
    clearTimeout(saveT.current)
    try { localStorage.removeItem(DOODLE_DRAFT_KEY) } catch { /* ignore */ }
    try { navigator.vibrate?.([30, 60, 30]) } catch { /* iOS 不支持 */ }
    fly(sheet.url)
  }

  /* ---------- 界面 ---------- */
  const history = strokesRef.current
  const ink = inkOf(history)
  let count = 0
  history.forEach((s) => {
    if (s.clear) count = 0
    else if (s.tool !== 'eraser') count += 1
  })
  const dotPx = Math.max(3, Math.min(38, size * MULT[tool] * (paperW / 360)))

  return (
    <div className="dd-root">
      {toast && <div className="toast glass">{toast}</div>}

      <main className="page dd">
        <div className="top">
          <div className="row" style={{ gap: 12, minWidth: 0 }}>
            <button type="button" className="glass icon-btn tap" onClick={goBack} aria-label="返回小物">
              <Svg name="back" size={20} />
            </button>
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <h1 className="h-title sm">涂鸦小纸条</h1>
              <div className="h-sub">画一张，单独寄给 TA</div>
            </div>
          </div>
          <button type="button" className="glass icon-btn tap" onClick={toggle} aria-label="切换明暗主题">
            <Svg name={theme === 'light' ? 'moon' : 'sun'} size={20} />
          </button>
        </div>

        <section className="win">
          <header className="tb">
            <Svg name="pen" size={14} />
            <b>涂鸦.paint</b>
            <span className="grow" />
            <span className="mono">{W}×{H}</span>
            <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
          </header>

          <div className="wb col" style={{ gap: 14 }}>
            <div className="dd-sheet">
              <span className="dd-tape l" /><span className="dd-tape r" />
              <div className="dd-paper" ref={paperRef}>
                <canvas
                  ref={cvRef}
                  className="dd-cv"
                  width={W}
                  height={H}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onEnd}
                  onPointerCancel={onEnd}
                />
                <div className={`dd-empty${ink || curRef.current ? ' gone' : ''}`}>
                  <Svg name="pen" size={28} />
                  <span>在这里画点什么吧</span>
                </div>
              </div>
            </div>

            <div className="dd-tools">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" className={`dd-tool${tool === t.id ? ' on' : ''}`} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
                  <Svg name={t.icon} size={18} />{t.label}
                </button>
              ))}
              <span className="dd-vsep" />
              <button type="button" className="dd-sq" onClick={undo} disabled={!history.length} aria-label="撤销"><Svg name="undo" size={18} /></button>
              <button type="button" className="dd-sq" onClick={redo} disabled={!redoRef.current.length} aria-label="重做"><Svg name="redo" size={18} /></button>
            </div>

            <div className="dd-size">
              <div className="dd-dotbox">
                <i
                  className="dd-dot"
                  style={{
                    width: dotPx,
                    height: dotPx,
                    background: tool === 'eraser' ? 'transparent' : COLORS[color],
                    boxShadow: tool === 'eraser' ? 'inset 0 0 0 1.5px #1a1a1c' : 'none',
                    opacity: tool === 'marker' ? 0.45 : 1,
                  }}
                />
              </div>
              <input className="dd-range" type="range" min="2" max="24" step="1" value={size} onChange={(e) => setSize(+e.target.value)} aria-label="笔刷粗细" />
              <span className="mono">{size}</span>
            </div>

            <div className={`dd-colors${tool === 'eraser' ? ' off' : ''}`} role="radiogroup" aria-label="颜色">
              {COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === i}
                  aria-label={NAMES[i]}
                  className={`dd-sw${color === i ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => { setColor(i); if (tool === 'eraser') setTool('pen') }}
                />
              ))}
            </div>
          </div>

          <footer className="wf"><span>笔画 {count}</span><span>{saved && ink ? '草稿已自动保存' : '未寄出'}</span></footer>
        </section>

        <div className="dd-actions glass">
          <button type="button" className="btn ghost" onClick={clearAll}><Svg name="trash" size={17} />清空</button>
          <button type="button" className="btn send" onClick={openSend} disabled={!ink}><Svg name="send" size={17} />寄出</button>
        </div>
      </main>

      {sheet && (
        <div className="overlay" onClick={() => { if (!busy) setSheet(null) }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {sheet.kind === 'exit' ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 650 }}>这张涂鸦还没寄出</div>
                <div className="h-sub">离开前想怎么处理？草稿会留着，下次进来接着画。</div>
                <button type="button" className="btn" onClick={keepDraft}><Svg name="doc" size={17} />保存草稿</button>
                <button type="button" className="btn ghost danger" onClick={dropDraft}><Svg name="trash" size={17} />丢弃</button>
                <button type="button" className="btn ghost" onClick={() => setSheet(null)}>继续画</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 650 }}>寄给 TA 之前，再看一眼</div>
                <div className="dd-pv">
                  <div className="dd-pv-paper">
                    <span className="dd-tape" />
                    <img ref={imgRef} src={sheet.url} alt="涂鸦预览" />
                  </div>
                </div>
                <div className="dd-cnt">
                  <input
                    className="field"
                    value={title}
                    maxLength={MAX_TITLE}
                    disabled={busy}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="给涂鸦起个名字（可选）"
                  />
                  <span>{title.length}/{MAX_TITLE}</span>
                </div>
                <div className="h-sub" style={{ padding: '0 6px' }}>TA 会在信箱里收到一个涂鸦信封，拆开就能看到这张画。</div>
                {err && <div className="dd-err">{err}</div>}
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="btn ghost" onClick={() => setSheet(null)} disabled={busy}>再改改</button>
                  <button type="button" className="btn" style={{ flex: 1 }} onClick={doSend} disabled={busy}>
                    <Svg name="send" size={17} />{busy ? '寄出中…' : '确认寄出'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}