/* ===========================================================================
   小物 · 给顾客画小胡子（抽屉第 07 格）
   - 4 张顾客脸，手指直接在 96×96 canvas 上画；换脸保留笔迹
   - 像素硬笔两档 / 8 色 / 橡皮 / 撤销 / 清空
   - 笔迹和脸分开：橡皮只去笔迹，不会把顾客擦掉
   - 导出发到聊天：复用 sendImageToChat（chat-images + send_message）
   =========================================================================== */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { sendImageToChat } from '../lib/chatImage'
import { Svg } from './Icon'
import { FACES, FACE_SIZE, getFace } from './mustache/face'
import { BRUSHES, COLORS, CANVAS, buildLayer, emptyLayer, line, stamp, renderDrawing } from './mustache/draw'
import './mustache.css'

const CAPTION = '给这位顾客画了一下'

export default function MustacheStudio({ onExit }) {
  const { me } = useAuth()
  const canvasRef = useRef(null)
  const layerRef = useRef(emptyLayer())
  const strokesRef = useRef([])
  const historyRef = useRef([])
  const activeRef = useRef(null)
  const beforeRef = useRef([])
  const aliveRef = useRef(true)
  const sendLock = useRef(false)
  const toastT = useRef(0)

  const [faceKey, setFaceKey] = useState(FACES[0].key)
  const [color, setColor] = useState(COLORS[0].value)
  const [colorKey, setColorKey] = useState(COLORS[0].key)
  const [brushKey, setBrushKey] = useState(BRUSHES[0].key)
  const [eraser, setEraser] = useState(false)
  const [frame, setFrame] = useState(0)
  const [histN, setHistN] = useState(0)
  const [strokeCount, setStrokeCount] = useState(0)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')

  const face = getFace(faceKey)
  const brush = BRUSHES.find((b) => b.key === brushKey) || BRUSHES[0]

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2200)
  }, [])

  useEffect(() => () => {
    aliveRef.current = false
    clearTimeout(toastT.current)
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = false
    renderDrawing(ctx, FACE_SIZE, faceKey, layerRef.current)
  }, [faceKey, frame])

  useEffect(() => {
    if (!onExit) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onExit() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const toCell = (e) => {
    const c = canvasRef.current
    if (!c) return null
    const r = c.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return {
      x: Math.max(0, Math.min(CANVAS, ((e.clientX - r.left) / r.width) * CANVAS)),
      y: Math.max(0, Math.min(CANVAS, ((e.clientY - r.top) / r.height) * CANVAS)),
    }
  }

  const bump = () => setFrame((n) => n + 1)

  const startStroke = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (activeRef.current) return
    const p = toCell(e)
    if (!p) return
    if (e.cancelable) e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 老浏览器 */ }
    beforeRef.current = strokesRef.current
    activeRef.current = {
      tool: eraser ? 'eraser' : 'brush',
      color,
      size: brush.size,
      points: [{ x: p.x, y: p.y }],
    }
    stamp(layerRef.current, p.x, p.y, brush.size, eraser ? null : color)
    bump()
  }

  const moveStroke = (e) => {
    const st = activeRef.current
    if (!st) return
    if (e.cancelable) e.preventDefault()
    const p = toCell(e)
    if (!p) return
    const last = st.points[st.points.length - 1]
    if (Math.abs(p.x - last.x) < 0.35 && Math.abs(p.y - last.y) < 0.35) return
    line(layerRef.current, last.x, last.y, p.x, p.y, st.size, st.tool === 'eraser' ? null : st.color)
    st.points.push(p)
    bump()
  }

  const finishStroke = () => {
    const st = activeRef.current
    if (!st) return
    activeRef.current = null
    if (!st.points.length) return
    strokesRef.current = strokesRef.current.concat(st)
    historyRef.current.push(beforeRef.current)
    if (historyRef.current.length > 40) historyRef.current.shift()
    setHistN(historyRef.current.length)
    setStrokeCount(strokesRef.current.length)
  }

  const cancelStroke = () => {
    if (!activeRef.current) return
    activeRef.current = null
    layerRef.current = buildLayer(strokesRef.current)
    bump()
  }

  const undo = () => {
    if (activeRef.current) return
    const prev = historyRef.current.pop()
    if (!prev) return
    strokesRef.current = prev
    layerRef.current = buildLayer(prev)
    setHistN(historyRef.current.length)
    setStrokeCount(prev.length)
    bump()
  }

  const clear = () => {
    if (activeRef.current) return
    if (!strokesRef.current.length) return
    historyRef.current.push(strokesRef.current)
    if (historyRef.current.length > 40) historyRef.current.shift()
    strokesRef.current = []
    layerRef.current = emptyLayer()
    setHistN(historyRef.current.length)
    setStrokeCount(0)
    bump()
  }

  const changeFace = () => {
    if (FACES.length < 2) return
    let i = Math.floor(Math.random() * FACES.length)
    if (FACES[i].key === faceKey) i = (i + 1) % FACES.length
    setFaceKey(FACES[i].key)
  }

  const pickColor = (c) => {
    setColor(c.value)
    setColorKey(c.key)
    setEraser(false)
  }

  const exportBlob = () => new Promise((resolve, reject) => {
    const c = document.createElement('canvas')
    c.width = 288
    c.height = 288
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = false
    renderDrawing(ctx, 288, faceKey, layerRef.current)
    c.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('export')) }, 'image/jpeg', 0.85)
  })

  const send = async () => {
    if (sendLock.current) return
    const myId = me && me.id
    if (!myId) { say('还没登录，发不了'); return }
    sendLock.current = true
    setSending(true)
    try {
      const blob = await exportBlob()
      const r = await sendImageToChat(blob, CAPTION, myId)
      if (r.error) throw new Error(r.error)
      if (aliveRef.current) say('发到聊天了')
    } catch (e) {
      if (aliveRef.current) say(e && e.message === 'too big' ? '图片太大，发不出去' : '图片发送失败，再试一次')
    } finally {
      sendLock.current = false
      if (aliveRef.current) setSending(false)
    }
  }

  return (
    <div className="ms-root">
      <div className="ms-ui">
        <header className="ms-top">
          <button type="button" className="ms-icon" onClick={() => onExit && onExit()} aria-label="返回小物">
            <Svg name="back" size={20} />
          </button>
          <div className="ms-title">
            <h1>画小胡子</h1>
            <span>用手指画，画完发给 TA</span>
          </div>
          <button type="button" className="ms-small" onClick={changeFace} title="换一张脸，笔迹保留">换脸</button>
          <button type="button" className="ms-small" onClick={undo} disabled={!histN}>撤销</button>
        </header>

        <main className="ms-main">
          <div className="ms-stage">
            <div className="ms-frame">
              <canvas
                ref={canvasRef}
                width={FACE_SIZE}
                height={FACE_SIZE}
                className={eraser ? 'erasing' : ''}
                role="application"
                aria-label={`${face.name}顾客的画像。用手指在脸上画画；可以换脸、撤销、用橡皮擦笔迹。`}
                onPointerDown={startStroke}
                onPointerMove={moveStroke}
                onPointerUp={finishStroke}
                onPointerCancel={cancelStroke}
                onLostPointerCapture={finishStroke}
                onContextMenu={(e) => e.preventDefault()}
              />
              <span className="ms-face-tag">顾客 · {face.name}</span>
            </div>
          </div>

          <div className={`ms-palette${eraser ? ' erasing' : ''}`} role="group" aria-label="画笔颜色">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`ms-color${!eraser && colorKey === c.key ? ' on' : ''}`}
                style={{ background: c.value }}
                onClick={() => pickColor(c)}
                aria-label={`颜色：${c.name}`}
                aria-pressed={!eraser && colorKey === c.key}
              />
            ))}
          </div>

          <div className="ms-tools">
            <div className="ms-sizes" role="group" aria-label="笔触粗细">
              {BRUSHES.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={`ms-size${brushKey === b.key ? ' on' : ''}`}
                  onClick={() => setBrushKey(b.key)}
                  aria-pressed={brushKey === b.key}
                >
                  <i style={{ width: b.size * 3, height: b.size * 3 }} />
                  {b.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`ms-tool${eraser ? ' on' : ''}`}
              onClick={() => setEraser((v) => !v)}
              aria-pressed={eraser}
            >
              橡皮
            </button>
            <button type="button" className="ms-tool" onClick={clear} disabled={!strokeCount}>清空</button>
            <span className="ms-tools-note">橡皮只擦笔迹</span>
          </div>
        </main>

        <footer className="ms-foot">
          <button type="button" className="ms-send" disabled={sending} onClick={send}>
            {sending ? '发送中…' : '发给 TA'}
          </button>
          <p className="ms-hint">配文「{CAPTION}」· 会出现在聊天里</p>
        </footer>
      </div>

      {toast && <div className="ms-toast" role="status">{toast}</div>}
    </div>
  )
}
