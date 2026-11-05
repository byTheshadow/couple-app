/* 梦海兔 · 哄睡页。全屏 canvas + 仪式纸 + 图鉴 + 双人灰兔。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { SLEEP_FISH } from '../../data/sleepFish'
import { PRESETS, PROMPTS, EAT_LINES } from '../../data/sleepLines'
import { drawScene, drawFish } from './sleepArt'
import {
  pickFish, reelStep, dimFor, loadStore, saveStore, addCatch, collectionStats,
  clipLine, soundOn, saveSound, saveLast, ymd, loadLast,
} from './sleepLogic'
import { createSleepAudio } from './sleepAudio'
import './sleep.css'

function FishIcon({ def, locked }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    drawFish(ctx, def, 2, 2, 2, locked)
  }, [def, locked])
  return <canvas ref={ref} width={48} height={28} className="sl-fishicon" />
}

export default function Sleep({ open, onClose, myId, taId, taName, hr }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const storeRef = useRef({})
  const taHereRef = useRef(false)
  const taAtRef = useRef(0)
  const audioRef = useRef(null)
  const catchRef = useRef(() => {})
  const [phase, setPhase] = useState('ritual')
  const [eating, setEating] = useState(false)
  const [line, setLine] = useState(PRESETS[0])
  const [custom, setCustom] = useState('')
  const [book, setBook] = useState(false)
  const [store, setStore] = useState({})
  const [sound, setSound] = useState(() => soundOn())
  const [taHere, setTaHere] = useState(false)
  const [flash, setFlash] = useState(null)
  const [caught, setCaught] = useState(0)
  const [tip, setTip] = useState(PROMPTS[0])
  const [biting, setBiting] = useState(false)
  const [last, setLast] = useState(null)

  const stats = collectionStats(SLEEP_FISH, store)
  const textNow = clipLine(custom || line, 20)

  const catchFish = useCallback(() => {
    const g = gameRef.current
    if (!g || !g.fish) return
    const f = g.fish
    const next = addCatch(storeRef.current, f.k)
    storeRef.current = next
    setStore(next)
    saveStore(next)
    const n = (g.caught || 0) + 1
    g.caught = n
    g.dim = dimFor(n)
    g.fish = null
    g.biting = false
    g.p = 0
    g.idle = 0
    g.nextAt = g.t + 5
    setCaught(n)
    setBiting(false)
    const count = next[f.k].n
    setFlash(count > 1 ? `又一条 ${f.n} · 第 ${count} 条` : `新图鉴 · ${f.n}`)
    setTip(PROMPTS[(n + 2) % PROMPTS.length])
    try { audioRef.current && audioRef.current.setLevel(g.dim) } catch { /* ignore */ }
    window.setTimeout(() => setFlash(null), 2200)
  }, [])

  useEffect(() => { catchRef.current = catchFish }, [catchFish])
  useEffect(() => { taHereRef.current = taHere }, [taHere])

  // 打开时初始化
  useEffect(() => {
    if (!open) return undefined
    const s = loadStore()
    storeRef.current = s
    setStore(s)
    gameRef.current = { t: 0, phase: 'ritual', fish: null, nextAt: 0, biteAt: 0, p: 0, biting: false, hold: false, idle: 0, dim: 1, caught: 0 }
    setPhase('ritual'); setEating(false); setBook(false); setCaught(0); setFlash(null); setBiting(false)
    setLine(PRESETS[0]); setCustom(''); setTip(PROMPTS[0]); setTaHere(false)
    setLast(loadLast())
    taAtRef.current = 0
    const a = createSleepAudio()
    audioRef.current = a
    if (soundOn()) a.start()
    return () => { try { a.stop() } catch { /* ignore */ }; audioRef.current = null }
  }, [open])

  // 声音开关
  useEffect(() => {
    const a = audioRef.current
    saveSound(sound)
    if (!a) return
    if (sound) a.start()
    else a.stop()
  }, [sound])

  // 画 + 钓鱼循环
  useEffect(() => {
    if (!open) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const g = gameRef.current
      if (!g) return
      g.t += dt
      if (g.phase === 'fishing') {
        if (!g.fish && g.t >= g.nextAt) {
          g.fish = pickFish(SLEEP_FISH, storeRef.current, Math.floor(g.t * 977) + 1)
          g.biting = false
          g.biteAt = g.t + 3.5
          g.p = 0
          g.idle = 0
        }
        if (g.fish && !g.biting && g.t >= g.biteAt) {
          g.biting = true
          setBiting(true)
        }
        if (g.biting && g.fish) {
          const r = reelStep({ p: g.p, fish: g.fish, idle: g.idle }, dt, g.hold)
          g.p = r.p
          g.idle = r.idle
          if (r.done || g.idle > 10) catchRef.current()
        }
      }
      drawScene(ctx, { t: g.t, grey: taHereRef.current, fish: g.fish, p: g.p, biting: g.biting, dim: g.dim, phase: g.phase })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open])

  // 双人：sleep-<id> 广播，不建表
  useEffect(() => {
    if (!open || !myId || !supabase) return undefined
    let alive = true
    let taCh = null
    const ch = supabase.channel('sleep-' + myId)
    ch.subscribe()
    const send = () => {
      if (!alive) return
      try {
        ch.send({ type: 'broadcast', event: 'state', payload: { state: 'fishing', at: Date.now() } })
      } catch { /* ignore */ }
    }
    send()
    const hb = window.setInterval(send, 5000)
    if (taId) {
      taCh = supabase.channel('sleep-' + taId)
      taCh.on('broadcast', { event: 'state' }, () => {
        taAtRef.current = Date.now()
        setTaHere(true)
      })
      taCh.subscribe()
    }
    const dog = window.setInterval(() => {
      if (taAtRef.current && Date.now() - taAtRef.current > 10000) setTaHere(false)
    }, 1000)
    return () => {
      alive = false
      window.clearInterval(hb)
      window.clearInterval(dog)
      try { supabase.removeChannel(ch) } catch { /* ignore */ }
      try { if (taCh) supabase.removeChannel(taCh) } catch { /* ignore */ }
    }
  }, [open, myId, taId])

  const startFishing = () => {
    if (!textNow) return
    setEating(true)
    setPhase('eat')
    try { audioRef.current && audioRef.current.start() } catch { /* ignore */ }
    window.setTimeout(() => {
      const g = gameRef.current
      if (!g) return
      g.phase = 'fishing'
      g.nextAt = g.t + 1
      setPhase('fishing')
      setEating(false)
    }, 900)
  }

  const close = () => {
    const g = gameRef.current
    if (g) saveLast({ date: ymd(), caught: g.caught || 0, minutes: Math.round(g.t / 60) })
    try { audioRef.current && audioRef.current.stop() } catch { /* ignore */ }
    onClose()
  }

  const setHold = (v) => { const g = gameRef.current; if (g) g.hold = v }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="sl" role="dialog" aria-modal="true" aria-label="哄睡">
      <div className="sl-top">
        <div className="sl-title">梦海兔 <small>哄睡 · {hr ? `${Math.floor(hr)}:${String(Math.round((hr % 1) * 60) % 60).padStart(2, '0')}` : ''}</small></div>
        <div className="sl-tools">
          <button type="button" className={`sl-btn${sound ? ' on' : ''}`} onClick={() => setSound((v) => !v)} aria-pressed={sound} title="雨声开关">{sound ? '🔊' : '🔇'}</button>
          <button type="button" className="sl-btn" onClick={() => setBook(true)}>图鉴 {stats.caught}/{stats.total}</button>
          <button type="button" className="sl-btn sl-x" onClick={close} aria-label="退出">×</button>
        </div>
      </div>

      <div className="sl-stage" onPointerDown={(e) => { if (phase !== 'fishing' || book) return; e.preventDefault(); setHold(true) }} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)} onPointerCancel={() => setHold(false)}>
        <canvas ref={canvasRef} width={160} height={120} />
        {phase === 'ritual' && !eating && (
          <div className="sl-paper">
            <div className="sl-paper-h">今晚的海</div>
            <p>写一句今天最烦 / 最想说的话</p>
            <div className="sl-chips">
              {PRESETS.map((p) => (
                <button key={p} type="button" className={`sl-chip${textNow === p ? ' on' : ''}`} onClick={() => { setLine(p); setCustom('') }}>{p}</button>
              ))}
            </div>
            <input value={custom} maxLength={20} placeholder="或者自己写一句（20 字以内）" onChange={(e) => setCustom(clipLine(e.target.value, 20))} />
            <button type="button" className="sl-go" disabled={!textNow} onClick={startFishing}>交给兔兔</button>
            <small>吃掉就没了，只留在这台手机上</small>
          </div>
        )}
        {eating && <div className="sl-eat">{EAT_LINES[(textNow.length + 2) % EAT_LINES.length]}</div>}
        {flash && <div className="sl-flash">{flash}</div>}
        {book && (
          <div className="sl-book">
            <div className="sl-book-h">
              <b>梦海图鉴</b>
              <small>{stats.caught}/{stats.total} · 星星 {stats.stars}</small>
              <button type="button" className="sl-btn sl-x" onClick={() => setBook(false)} aria-label="关闭图鉴">×</button>
            </div>
            <div className="sl-grid">
              {SLEEP_FISH.map((f) => {
                const got = (store[f.k] && store[f.k].n) || 0
                return (
                  <div key={f.k} className={`sl-card${got ? ' got' : ''}`}>
                    <FishIcon def={f} locked={!got} />
                    <b>{got ? f.n : '???'}</b>
                    <small>{got ? (got > 1 ? `×${got}` : '新') : (f.tip || '')}</small>
                  </div>
                )
              })}
            </div>
            <div className="sl-book-f">重复的鱼会变成一颗星 · 不做用途 · 慢慢来</div>
          </div>
        )}
      </div>

      <div className="sl-bottom">
        <span>今晚钓到 <b>{caught}</b> 条</span>
        {last && last.caught > 0 && <span className="sl-last">昨晚 {last.caught} 条</span>}
        {taHere && <span className="sl-ta">🐰 {taName} 也在</span>}
        <span className="sl-hint">{biting ? '按住收线 · 松手让线' : tip}</span>
      </div>
    </div>,
    document.body,
  )
}