/* ===========================================================================
   小物 · 气人顾客（打地鼠）—— 页面外壳
   - 画面全在 whack.js（纯逻辑 + 绘制），这里只管：壳子、指针/键盘、暂停、结算页、音效开关
   - 金币服务端那一步（docs/whack-design.md 第 9 节）还没接：结算页写明「只在本地记着」
   - 用法：<WhackGame onExit={(msg) => ...} />
   =========================================================================== */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Svg } from './Icon'
import {
  W, H, HOLES, BEST_KEY, COMBO_PER, DURATION, ROUND_COIN_CAP,
  createGame, stepGame, tapAt, drawGame, resultOf, createSfx,
} from './whack'
import './whack.css'

export default function WhackGame({ onExit }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const phaseRef = useRef('idle')
  const reduceRef = useRef(false)
  const fireRef = useRef(() => {})

  const [sfx] = useState(() => createSfx())
  const [sfxOn, setSfxOn] = useState(sfx.on)
  const [phase, setPhase] = useState('idle')
  const [result, setResult] = useState(null)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch (e) { return 0 }
  })

  /* ---------- 打完一局 ---------- */
  const finish = useCallback((g) => {
    const r = resultOf(g)
    let prev = 0
    try { prev = Number(localStorage.getItem(BEST_KEY)) || 0 } catch (e) { prev = 0 }
    const isBest = r.score > prev
    if (isBest) {
      try { localStorage.setItem(BEST_KEY, String(r.score)) } catch (e) { /* 无痕模式存不了 */ }
    }
    setResult({ ...r, prevBest: prev, isBest })
    setBest((b) => (isBest ? r.score : b))
    phaseRef.current = 'result'
    setPhase('result')
    sfx.play('end')
  }, [sfx])

  /* ---------- 事件 → 声音 / 结算 ---------- */
  const fire = useCallback((ev) => {
    for (const e of ev) {
      if (e.type === 'hit') {
        sfx.play('hit', { combo: e.combo })
        try { navigator.vibrate?.(6) } catch (err) { /* 跟随系统 */ }
      } else if (e.type === 'coin') {
        sfx.play('coin')
      } else if (e.type === 'wrong') {
        sfx.play('wrong')
        try { navigator.vibrate?.([12, 30, 12]) } catch (err) { /* 跟随系统 */ }
      } else if (e.type === 'miss') {
        sfx.play('miss')
      } else if (e.type === 'end') {
        finish(gameRef.current)
      }
    }
  }, [sfx, finish])
  fireRef.current = fire

  /* ---------- 开始 / 再来一局 ---------- */
  const start = useCallback(() => {
    gameRef.current = createGame({ reduce: reduceRef.current })
    setResult(null)
    phaseRef.current = 'playing'
    setPhase('playing')
    sfx.unlock()
    sfx.play('start')
  }, [sfx])

  /* ---------- 主循环：一直画；只有 playing 才推进 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    reduceRef.current = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (!gameRef.current) gameRef.current = createGame({ reduce: reduceRef.current })

    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (document.hidden) return // 切后台就停住：回来的时候倒计时不会白跑
      const g = gameRef.current
      if (phaseRef.current === 'playing') {
        const ev = stepGame(g, dt)
        if (ev.length) fireRef.current(ev)
      }
      drawGame(ctx, g)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ---------- 键盘：1~6 打对应格，Esc 返回 ---------- */
  useEffect(() => {
    if (!onExit) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { onExit(); return }
      const i = '123456'.indexOf(e.key)
      if (i < 0 || phaseRef.current !== 'playing') return
      const h = HOLES[i]
      const ev = tapAt(gameRef.current, h.x, h.y - 12)
      if (ev.length) fireRef.current(ev)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  /* ---------- 点画面 ---------- */
  const onDown = (e) => {
    if (phaseRef.current !== 'playing') return
    e.preventDefault()
    sfx.unlock()
    const r = canvasRef.current.getBoundingClientRect()
    if (!r.width || !r.height) return
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    const ev = tapAt(gameRef.current, x, y)
    if (ev.length) fireRef.current(ev)
  }

  const toggleSfx = () => {
    const next = !sfxOn
    sfx.setOn(next)
    setSfxOn(next)
    if (next) sfx.play('start')
  }

  return (
    <div className="wk-root">
      <div className="wk-ui">
        <div className="wk-top">
          <button type="button" className="glass icon-btn tap" onClick={() => onExit && onExit()} aria-label="返回小物">
            <Svg name="back" size={20} />
          </button>
          <div className="wk-title">
            <h1>气人顾客</h1>
            <div className="sub">{phase === 'playing' ? `一局 ${DURATION} 秒 · 好顾客别打` : best > 0 ? `本机最高 ${best} 分` : '打坏顾客，出出气'}</div>
          </div>
          <button
            type="button"
            className={`glass icon-btn tap wk-sfx${sfxOn ? '' : ' off'}`}
            onClick={toggleSfx}
            aria-pressed={sfxOn}
            aria-label={sfxOn ? '关掉音效' : '打开音效'}
          >
            {sfxOn ? '🔊' : '🔇'}
          </button>
        </div>

        <div className="wk-bezel">
          <div className="wk-screen">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              role="img"
              aria-label="柜台打地鼠：六个格子里会冒出抱怨、插队、挑刺的坏顾客，还有不能打的笑着的好顾客"
              onPointerDown={onDown}
              onContextMenu={(e) => e.preventDefault()}
            />

            {phase === 'idle' && (
              <div className="wk-overlay">
                <b className="wk-ot">气人顾客</b>
                <p className="wk-op">45 秒。柜台里冒出来的坏顾客，打中 +1 分。</p>
                <p className="wk-op">连击每满 3 个 +10 金币（一局封顶 {ROUND_COIN_CAP}）。</p>
                <p className="wk-op">笑着的好顾客<b>不能打</b>：连击清零，还罚 3 秒。</p>
                <button type="button" className="btn wk-start" onClick={start}>开始</button>
                <span className="wk-os">键盘 1~6 也能打</span>
              </div>
            )}

            {phase === 'result' && result && (
              <div className="wk-overlay">
                <b className="wk-ot">{result.isBest ? '新纪录！' : '打完了'}</b>
                <div className="wk-rows">
                  <div><span>本局得分</span><b>{result.score}</b></div>
                  <div><span>最高连击</span><b>{result.bestCombo}</b></div>
                  <div><span>这局赚到</span><b className="coin">+{result.coins}</b></div>
                </div>
                <p className="wk-op tiny">金币这轮还没接到服务端，只在本地记着；连击每满 {COMBO_PER} 个 +10。</p>
                <div className="wk-acts">
                  <button type="button" className="btn wk-start" onClick={start}>再来一局</button>
                  <button type="button" className="btn ghost" onClick={() => onExit && onExit()}>返回小物</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="wk-foot">
          <span>坏顾客出气用，好顾客是来道谢的</span>
          {best > 0 && <span className="mono">BEST {best}</span>}
        </div>
      </div>
    </div>
  )
}
