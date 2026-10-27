/* ===========================================================================
   小物 · 气人顾客（打地鼠）—— 页面外壳
   - 画面全在 whack.js（纯逻辑 + 绘制 + 音效 + 锤子），这里只管：壳子、指针/键盘、暂停、结算页、音效开关
   - 网络全在 whackStore.js：打完一局交一次 RPC（金币由服务端算），再读一次 TA 今天的分
   - 缺表 / 缺函数（SQL 没跑）时静默降级：结算页说明「只在本地记着」，不弹红错、不挡再来一局
   - 用法：<WhackGame onExit={(msg) => ...} />
   =========================================================================== */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { Svg } from './Icon'
import {
  W, H, HOLES, BEST_KEY, DURATION, ROUND_COIN_CAP, DAY_COIN_CAP,
  createGame, stepGame, tapAt, drawGame, resultOf, createSfx, aimAt, aimOff,
} from './whack'
import { reportWhack, dayRow, localDay } from './whackStore'
import './whack.css'

export default function WhackGame({ onExit }) {
  const { partner } = useAuth()
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const phaseRef = useRef('idle')
  const reduceRef = useRef(false)
  const fireRef = useRef(() => {})
  const aliveRef = useRef(true)
  const seqRef = useRef(0) // 每次开局 / 结算 +1：晚回来的网络结果不许覆盖新一局的状态
  const holdRef = useRef(0) // 手指抬起后让锤子多待一会儿的定时器

  const [sfx] = useState(() => createSfx())
  const [sfxOn, setSfxOn] = useState(sfx.on)
  const [phase, setPhase] = useState('idle')
  const [result, setResult] = useState(null)
  const [settle, setSettle] = useState(null)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch (e) { return 0 }
  })

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      clearTimeout(holdRef.current)
    }
  }, [])

  /* ---------- 打完一局：本机最高分 + 交给服务端 ---------- */
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

    const seq = ++seqRef.current
    setSettle({ loading: true, res: null, missing: false, error: null, day: null, ta: null, taMissing: false, taError: null })

    ;(async () => {
      let rep = { res: null, missing: false, error: null }
      try {
        rep = await reportWhack(r.score, r.bestCombo)
      } catch (e) {
        rep = { res: null, missing: false, error: '网络不通' }
      }
      const day = (rep.res && rep.res.day) || localDay()
      let ta = { row: null, missing: false, error: null }
      const pid = partner && partner.id
      if (pid) {
        try {
          ta = await dayRow(pid, day)
        } catch (e) {
          ta = { row: null, missing: false, error: '网络不通' }
        }
      }
      if (!aliveRef.current || seq !== seqRef.current) return
      setSettle({
        loading: false,
        res: rep.res, missing: rep.missing, error: rep.error,
        day, ta: ta.row, taMissing: ta.missing, taError: ta.error,
      })
    })()
  }, [sfx, partner])

  /* ---------- 游戏事件 → 声音 / 结算 ---------- */
  const fire = useCallback((ev) => {
    for (const e of ev) {
      if (e.type === 'swing') {
        sfx.play('swing')
      } else if (e.type === 'whiff') {
        sfx.play('whiff')
      } else if (e.type === 'hit') {
        sfx.play('whack')
        sfx.play('hit', { combo: e.combo })
        try { navigator.vibrate?.(6) } catch (err) { /* 跟随系统 */ }
      } else if (e.type === 'coin') {
        sfx.play('coin')
      } else if (e.type === 'wrong') {
        sfx.play('whack')
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
    seqRef.current += 1
    setSettle(null)
    gameRef.current = createGame({ reduce: reduceRef.current })
    aimAt(gameRef.current, W / 2, H / 2)
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
      const i = '123456789'.indexOf(e.key)
      if (i < 0 || phaseRef.current !== 'playing') return
      const h = HOLES[i]
      const ev = tapAt(gameRef.current, h.x, h.y - 12)
      if (ev.length) fireRef.current(ev)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  /* ---------- 指针：按 = 挥锤，移 = 锤子跟着走，离开 = 收起来 ---------- */
  const toGame = (e) => {
    const c = canvasRef.current
    if (!c) return null
    const r = c.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  // 触屏抬手以后锤子再逗留 0.32 s：不然指头一抬就没了，点了什么根本看不清
  const hideHammer = (delay) => {
    clearTimeout(holdRef.current)
    const g = gameRef.current
    if (!g) return
    holdRef.current = setTimeout(() => { if (gameRef.current === g) aimOff(g) }, delay)
  }

  const onDown = (e) => {
    if (phaseRef.current !== 'playing') return
    e.preventDefault()
    clearTimeout(holdRef.current)
    sfx.unlock()
    const p = toGame(e)
    if (!p) return
    const ev = tapAt(gameRef.current, p.x, p.y)
    if (ev.length) fireRef.current(ev)
  }

  const onMove = (e) => {
    if (phaseRef.current !== 'playing') return
    const p = toGame(e)
    if (p) aimAt(gameRef.current, p.x, p.y)
  }

  const onUp = (e) => {
    if (phaseRef.current !== 'playing') return
    // 鼠标点完还停在画布上：锤子得留着，不然每点一下都要等指针动一下才回来
    if (e && e.pointerType === 'mouse') return
    hideHammer(320)
  }

  const onLeave = (e) => {
    // 鼠标移出画布马上收（不然锤子卡在边上）；手指/触控笔抬起就让它多待一下
    if (e && e.pointerType === 'mouse') {
      clearTimeout(holdRef.current)
      if (gameRef.current) aimOff(gameRef.current)
    } else {
      hideHammer(320)
    }
  }

  const onCancel = () => {
    clearTimeout(holdRef.current)
    if (gameRef.current) aimOff(gameRef.current)
  }

  const toggleSfx = () => {
    const next = !sfxOn
    sfx.setOn(next)
    setSfxOn(next)
    if (next) { sfx.unlock(); sfx.play('swing') }
  }

  /* ---------- 结算页上的几个数 ---------- */
  const rec = settle && settle.res ? settle.res : null
  const coins = rec ? rec.coins : result ? result.coins : 0
  const cap = (rec && rec.day_cap) || DAY_COIN_CAP
  const hasPartner = !!(partner && partner.id)
  const taText = !settle || settle.loading ? '…' : settle.ta ? `${settle.ta.best_score} 分` : settle.taMissing ? '—' : '还没打'
  const dayText = !settle || settle.loading ? '…' : rec ? `${rec.day_coins} / ${cap}` : '—'
  let settleNote = '正在交给服务端…'
  if (settle && !settle.loading) {
    if (settle.missing) settleNote = '服务端还没跑 SQL（docs/whack-design.sql），金币暂时只在本地记着'
    else if (settle.error) settleNote = `没记上：${settle.error}（金币暂时只在本地记着）`
    else if (settle.taError) settleNote = `金币已入账；TA 的分数没读到：${settle.taError}`
    else if (rec && rec.day_coins >= cap) settleNote = `今天的 ${cap} 金币已经赚满，再打只记分数`
    else if (rec) settleNote = `金币已加进钱包：每局封顶 ${ROUND_COIN_CAP}，每天 ${cap}`
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
              className={phase === 'playing' ? 'wk-live' : ''}
              role="img"
              aria-label="柜台打地鼠：九宫格里会冒出抱怨、插队、挑刺的坏顾客，还有不能打的笑着的好顾客；点一下挥锤"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onLeave}
              onPointerCancel={onCancel}
              onContextMenu={(e) => e.preventDefault()}
            />

            {phase === 'idle' && (
              <div className="wk-overlay">
                <b className="wk-ot">气人顾客</b>
                <p className="wk-op">45 秒。柜台里冒出坏顾客，<b>点一下挥锤</b>，打中 +1 分。</p>
                <p className="wk-op">连击每满 3 个 +10 金币（一局封顶 {ROUND_COIN_CAP}，每天 {DAY_COIN_CAP}）。</p>
                <p className="wk-op">笑着的好顾客<b>不能打</b>：连击清零，还罚 3 秒。</p>
                <button type="button" className="btn wk-start" onClick={start}>开始</button>
                <span className="wk-os">键盘 1~9 也能挥锤</span>
              </div>
            )}

            {phase === 'result' && result && (
              <div className="wk-overlay">
                <b className="wk-ot">{result.isBest ? '新纪录！' : '打完了'}</b>
                <div className="wk-rows">
                  <div><span>本局得分</span><b>{result.score}</b></div>
                  <div><span>最高连击</span><b>{result.bestCombo}</b></div>
                  <div><span>这局赚到</span><b className="coin">+{coins}</b></div>
                  {hasPartner && (
                    <div><span>{partner.display_name || 'TA'} 今天</span><b>{taText}</b></div>
                  )}
                  {hasPartner && (
                    <div><span>今天已赚</span><b>{dayText}</b></div>
                  )}
                </div>
                <p className="wk-op tiny">{settleNote}</p>
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
