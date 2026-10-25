import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { Svg } from './Icon'
import { usePal, usePalLog, usePresets, usePalScenes, usePalOutfits, useOutfitReqs, saveSettings, palPoke, palSettle, palLogClear, outfitSave, outfitDelete, outfitSend, outfitRespond } from './pixelpals/store'
import {
  W, H, CHARS, SCENES, SCENE_LIST, THEMES, GIFTS, LINES,
  createActor, stepActor, renderFrame, drawAvatar, headTop, hearts,
  normalizeButtons, compactBtnLines, checkSchedule, cleanEmoji, cleanLabel, moodNow, fmtHour, pad2, pick, stateOf,
  placeOf, atHome, compactPokeLines, clipLine, hourText, shiftHour, reflow, fitWindows, homeSegments, WINDOW_KINDS, POKE_MAX, POKE_LEN, POKE_STREAK, POKE_STREAK_MS,
} from './pixelpals/art'
import { dropItem, stepDrops, drawDrops } from './pixelpals/fx'
import { PLAY_KINDS, reactionFor, pokeLine, defaultPokes, defaultBtnLines } from './pixelpals/voice'
import { startCelebration, stepCelebration, drawCelebration, celebrateEvent, estimateIncome, shiftDay, INCOME } from './pixelpals/celebrate'
import { DAILY_PRESETS, SPECIAL_PRESETS, MAX_PRESETS, applyPreset, activePreset, homeHour, makeCustomPreset } from './pixelpals/presets'
import { BUILTINS, SLOT_KEYS, SLOT_NAMES, resolveWorn, outfitOf, outfitMessages, parseOutfitText, splitOutfitJson, validateOutfit } from './pixelpals/outfits'
import { chat, loadAi, aiReady } from './pixelpals/ai'
import Visitor from './pixelpals/Visitor'
import Diary from './pixelpals/Diary'
import Studio from './pixelpals/Studio'
import AiSettings from './pixelpals/AiSettings'
import PersonaEditor from './pixelpals/PersonaEditor'
import './pixelpals.css'

/* ===========================================================================
   像素小屋：两个人各有一台像素游戏机，互相能看到对方的小人在干嘛，但只能改自己的。
   第一轮：自己的安排面板（上班地点 / 墙纸 / 作息 / 三个互动按钮）+ 看 TA 的小屋。
   第二轮：去看 TA（互动按钮 / 投喂 / 送礼 / 悄悄话 / 聊天 / 戳一戳）+ 小人日记。
   第三轮：下班结算（服务端每天发一次工资 + 庆祝动画）、一键预设、墙纸预览、重置时一并清空。
   第四轮：自定义被戳反应（上班 / 在家 / 睡觉 / 被戳烦了，连戳 3 下起换「被戳烦了」，可跟预设一起存）、
          在家时间里可选的「玩耍」「放空」两段时间。
   第五轮：新场景（便利店 / 图书馆 / 海边 / 星空，上班和放空都能选；放空选了场景，整个画面就换成那里）、
          新礼物（五件，价格和心情加成放在服务端的 pal_gift_catalog 表）、点「重置全部数据」时一并清空像素小屋。
   第五轮半：作息支持跨午夜（夜班 / 睡过午夜，时间里选「次日」）、作息下拉互相联动、
          小屋画面滚出屏幕后变成一个可以拖动的悬浮小窗（带 A / B 键），一直跟着你。
   - 画面和数据整理在 pixelpals/art.js，掉落动画在 fx.js，台词在 voice.js，服务器读写在 store.js，
     「去看 TA」在 Visitor.jsx，日记在 Diary.jsx，这个文件只管把它们拼成页面
   - user1 = 代码小人（白发），user2 = 打工小人（黑发），由登录账号的 slot 决定
   用法：<PixelPals onExit={(message) => ...} />
   =========================================================================== */

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=DotGothic16&family=Silkscreen:wght@400;700&display=swap'

// 像素字体：在这里按需加载，不用改 index.html；加载不了就退回系统等宽字体，不影响使用
function useFonts() {
  useEffect(() => {
    if (document.getElementById('pp-fonts')) return
    const l = document.createElement('link')
    l.id = 'pp-fonts'
    l.rel = 'stylesheet'
    l.href = FONT_HREF
    document.head.appendChild(l)
  }, [])
}

const realHour = () => {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// 草稿里的被戳反应输入框允许带空位（['你好','','','']），比较「有没有改动」之前先整理成存进服务器的样子
const canon = (d) => (d ? { ...d, poke_lines: compactPokeLines(d.poke_lines), btn_lines: compactBtnLines(d.btn_lines) } : d)

// 被戳反应的 4 套：键和服务端 / art.js 的 POKE_KEYS 一一对应
const POKE_SETS = [
  { k: 'work', n: '上班时', hint: '上班时被戳（不管在哪个上班地点）' },
  { k: 'home', n: '在家时', hint: '在家、玩耍、放空时被戳' },
  { k: 'sleep', n: '睡觉时', hint: '睡着时被戳' },
  { k: 'annoyed', n: `被戳烦了（连戳 ${POKE_STREAK} 下起）`, hint: '同一个人 60 秒内连着戳' },
]

// 互动按钮「点了以后说什么」的 3 种状态：键和 art.js 的 BTN_STATES 一一对应（玩耍和放空沿用「在家时」）
const BTN_SETS = [['work', '上班时'], ['home', '在家时'], ['sleep', '睡觉时']]

const pad4 = (arr) => {
  const a = Array.isArray(arr) ? arr.slice(0, POKE_MAX) : []
  while (a.length < POKE_MAX) a.push('')
  return a
}

// profiles.slot 可能是 'u1' / 'u2'，也可能只有数字；只认其中的数字，认不出来返回 null
const slotOf = (p) => {
  const n = String((p && p.slot) || '').replace(/\D/g, '')
  return n === '2' ? 'u2' : n === '1' ? 'u1' : null
}

// 作息的时间下拉：24 以上显示成「次日 xx:00」；每一项只列出合规矩的范围（起床 ≤ 上班 < 下班 ≤ 睡觉 ≤ 起床+23）
const hourOpts = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => <option key={from + i} value={from + i}>{hourText(from + i)}</option>)
// 玩耍 / 放空的时间选择：第一项「不设」，后面只列出落在「在家的时间」里的钟点
const winOpts = (list) => [<option key="none" value="">不设</option>, ...list.map((h) => <option key={h} value={h}>{hourText(h)}</option>)]
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
const winFromList = (s) => homeSegments(s).flatMap(([f, t]) => range(f, t - 1))
const winToList = (s, from) => homeSegments(s).filter(([f, t]) => from == null || (from >= f && from < t)).flatMap(([f, t]) => range(Math.max(f + 1, from == null ? 0 : from + 1), t))
const PLAN_TABS = [['preset', '预设'], ['scene', '场景'], ['wear', '换装'], ['sched', '作息'], ['touch', '互动'], ['persona', '人设']]
const SCHED_NAMES = { wake_h: '起床', work_h: '上班', off_h: '下班', sleep_h: '睡觉' }
const MINI_KEY = 'pp-mini'
const MINI_POS_KEY = 'pp-mini-pos'
const lsGet = (k) => { try { return window.localStorage.getItem(k) } catch { return null } }
const lsSet = (k, v) => { try { window.localStorage.setItem(k, v) } catch { /* 存不了就算了，下次打开用默认的 */ } }

/* ---------- 一台游戏机 ---------- */

// 结算横幅里的数字：从 0 跳到工资，有点「叮叮叮」的感觉
function CountUp({ to }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 1200)
      setN(Math.round(to * k))
      if (k >= 1) clearInterval(id)
    }, 40)
    return () => clearInterval(id)
  }, [to])
  return <>{n}</>
}

const Console = forwardRef(function Console({ slot, name, settings, state, hr, mine, preview, onA, onReplay }, ref) {
  const [banner, setBanner] = useState(null)
  const bannerT = useRef(0)
  const canvasRef = useRef(null)
  const actorRef = useRef(null)
  const bubbleRef = useRef(null)
  const bubbleT = useRef(0)
  const clockRef = useRef(null)
  const whereRef = useRef(null)
  const segsRef = useRef(null)
  const live = useRef({})
  const selfPokes = useRef([]) // 我自己戳自己的小人（预览被戳反应）的时间，用来算「连戳」
  // 悬浮小窗：屏幕滚出视野以后，在页面上方浮一个小画面（镜像同一块画布），开关和位置记在这台手机上
  const bezelRef = useRef(null)
  const miniRef = useRef(null)
  const miniCanvasRef = useRef(null)
  const miniCtxRef = useRef(null)
  const miniBubbleRef = useRef(null)
  const miniClockRef = useRef(null)
  const dragRef = useRef(null)
  const [mini, setMini] = useState(() => lsGet(MINI_KEY) !== '0')
  const [away, setAway] = useState(false)
  const [miniPos, setMiniPos] = useState(() => {
    try {
      const p = JSON.parse(lsGet(MINI_POS_KEY) || 'null')
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x < window.innerWidth - 60 && p.y < window.innerHeight - 60) return p
    } catch { /* 位置坏了就用默认的 */ }
    return null
  })
  live.current = { slot, settings, state, hr }

  useEffect(() => {
    const el = bezelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => {
      // 只有「屏幕从上面滚出去了」才浮出小窗；屏幕在下面（页面还没滚到）时不用
      setAway(e.intersectionRatio < 0.15 && e.boundingClientRect.top < 0)
    }, { threshold: [0, 0.15, 1] })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => { if (!mini || !away) miniCtxRef.current = null }, [mini, away])
  const toggleMini = () => setMini((v) => { lsSet(MINI_KEY, v ? '0' : '1'); return !v })

  // 拖动小窗：按住画面拖；松手时记住位置。拖动过程直接改样式，不重绘整个页面
  const dragDown = (e) => {
    if (e.target.closest('button')) return
    const box = miniRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x: r.left, y: r.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const dragMove = (e) => {
    const d = dragRef.current
    const box = miniRef.current
    if (!d || !box) return
    const r = box.getBoundingClientRect()
    d.x = Math.max(4, Math.min(window.innerWidth - r.width - 4, e.clientX - d.dx))
    d.y = Math.max(4, Math.min(window.innerHeight - r.height - 4, e.clientY - d.dy))
    box.style.left = `${d.x}px`
    box.style.top = `${d.y}px`
    box.style.right = 'auto'
  }
  const dragUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    const p = { x: Math.round(d.x), y: Math.round(d.y) }
    setMiniPos(p)
    lsSet(MINI_POS_KEY, JSON.stringify(p))
  }

  const say = useCallback((text, dur = 3.6) => {
    const el = bubbleRef.current
    if (!el) return
    el.textContent = text
    el.classList.add('on')
    bubbleT.current = dur
  }, [])

  // 父组件用这个让小人当场做出反应（互动成功 / 收到 TA 的互动）：东西先掉下来，落到头顶才反应
  const play = useCallback((ev) => {
    const a = actorRef.current
    if (!a || !ev) return
    const land = () => {
      if (ev.celebrate) startCelebration(a, ev.celebrate)
      if (ev.banner) {
        setBanner({ ...ev.banner, k: Date.now() })
        clearTimeout(bannerT.current)
        bannerT.current = setTimeout(() => setBanner(null), 5200)
      }
      if (ev.react) a.react = ev.react
      if (ev.blush) a.blushT = ev.blush
      if (ev.hearts) hearts(a, ev.hearts)
      if (ev.text) say(ev.text, ev.dur || 3.6)
    }
    if (ev.drop) dropItem(a, ev.drop, land)
    else land()
  }, [say])
  useImperativeHandle(ref, () => ({ play, say }), [play, say])
  useEffect(() => () => clearTimeout(bannerT.current), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    const actor = createActor(slot)
    actorRef.current = actor
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const gap = 1 / (reduce ? 8 : 24) // 画面只有 160×120，24 帧足够，也省电
    let raf = 0
    let last = performance.now()
    let hudKey = ''
    let moodKey = -1
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) { last = now; return }
      const dtRaw = (now - last) / 1000
      if (dtRaw < gap) return
      last = now
      const dt = Math.min(0.1, dtRaw)
      const cur = live.current
      const mood = moodNow(cur.state)
      stepActor(actor, cur.settings, cur.hr, dt, mood)
      stepDrops(actor, dt)
      stepCelebration(actor, dt)
      renderFrame(ctx, actor, { slot: cur.slot, sp: actor.sp, settings: cur.settings, gifts: cur.state.gifts, mood }, cur.hr, now / 1000)
      drawDrops(ctx, actor)
      drawCelebration(ctx, actor)

      // 悬浮小窗开着就把同一帧复制过去（画布是 160×120 的小图，复制几乎不费力）
      const mc = miniCanvasRef.current
      if (mc) {
        let mctx = miniCtxRef.current
        if (!mctx) { mctx = mc.getContext('2d'); mctx.imageSmoothingEnabled = false; miniCtxRef.current = mctx }
        mctx.drawImage(canvas, 0, 0)
        const clockText = fmtHour(cur.hr)
        if (miniClockRef.current && miniClockRef.current.textContent !== clockText) miniClockRef.current.textContent = clockText
      }

      const place = placeOf(cur.settings, actor.state) // 在哪个场景（在家 = null）
      const label = actor.state === 'work' ? `上班中 · ${SCENES[place] || '自己画的场景'}`
        : actor.state === 'play' ? '在家 · 玩耍中'
          : actor.state === 'idle' ? (place ? `放空中 · ${SCENES[place] || '自己画的场景'}` : '在家 · 放空中')
            : actor.state === 'home' ? '在家' : '睡觉中'
      const key = `${fmtHour(cur.hr)}|${label}`
      if (key !== hudKey) {
        hudKey = key
        if (clockRef.current) clockRef.current.textContent = fmtHour(cur.hr)
        if (whereRef.current) whereRef.current.textContent = label
      }
      const m = Math.ceil(mood / 10)
      if (m !== moodKey && segsRef.current) {
        moodKey = m
        segsRef.current.querySelectorAll('i').forEach((s, i) => s.classList.toggle('f', i < m))
        segsRef.current.classList.toggle('low', mood < 30)
      }
      const b = bubbleRef.current
      if (b) {
        b.style.left = `${Math.max(24, Math.min(76, (actor.x / W) * 100))}%`
        b.style.top = `${(headTop(actor) / H) * 100}%`
        if (bubbleT.current > 0) {
          bubbleT.current -= dt
          if (bubbleT.current <= 0) b.classList.remove('on')
        }
        const mb = miniBubbleRef.current
        if (mb) {
          if (mb.textContent !== b.textContent) mb.textContent = b.textContent
          mb.classList.toggle('on', b.classList.contains('on'))
          mb.style.left = b.style.left
          mb.style.top = b.style.top
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [slot])

  const poke = () => {
    if (onA) { onA(); return } // 去戳 TA：交给父组件走服务端，成功后小人才有反应
    // 戳自己的小人：只有自己看得到，用来预览自己写的被戳反应（草稿里还没保存的也算）；60 秒内连点 3 下起换「被戳烦了」
    const a = actorRef.current
    if (!a) return
    const cur = live.current
    const now = Date.now()
    const recent = selfPokes.current.filter((t) => now - t < POKE_STREAK_MS)
    const annoyed = recent.length >= POKE_STREAK - 1
    selfPokes.current = [...recent, now]
    if (annoyed) {
      a.react = 0.9
    } else {
      a.react = 0.6
      a.blushT = 1.5
      hearts(a, 2)
    }
    say(pokeLine(cur.slot, a.state || stateOf(cur.settings, cur.hr), annoyed, cur.settings.poke_lines), 4.2)
  }
  const wave = () => {
    const a = actorRef.current
    if (!a) return
    a.react = 0.4
    say(pick(LINES[slot].wave))
  }

  const gifts = state.gifts.map((k) => GIFTS.find((g) => g.k === k)?.e).filter(Boolean).join(' ')

  return (
    <section className="win">
      <header className="tb">
        <Svg name="eye" size={14} />
        <b>{mine ? '我的小屋.exe' : 'TA 的小屋.exe'}</b>
        <span className="grow" />
        <span className="mono">{CHARS[slot].jobName}</span>
        <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
      </header>
      <div className="wb">
        <div className="pp-con-top">
          <span className="pp-led" />
          <b>{name}</b>
          <span className="pp-tags">
            {preview && <span className="pp-tag">预览中 · 还没保存</span>}
            <button type="button" className={`pp-tag pp-tagbtn${mini ? '' : ' off'}`} onClick={toggleMini} aria-pressed={mini} title="往下翻页的时候，小屋画面会变成一个悬浮小窗跟着你">悬浮窗 {mini ? '开' : '关'}</button>
          </span>
        </div>
        <div className="pp-bezel" ref={bezelRef}>
          <div className="pp-screen">
            <canvas ref={canvasRef} width={W} height={H} />
            <div className="pp-hud"><span ref={clockRef} /><span ref={whereRef} className="where" /></div>
            <div ref={bubbleRef} className="pp-bubble" />
            {banner && (
              <div key={banner.k} className={`pp-banner ${banner.cls}`} role="status">
                <small>{banner.head}</small>
                <b>{banner.title}</b>
                <span>+¥<CountUp to={banner.amount} /></span>
                {banner.note && <em>{banner.note}</em>}
              </div>
            )}
          </div>
        </div>
        <div className="pp-status">
          <div className="pp-mood">心情<div className="pp-segs" ref={segsRef}>{Array.from({ length: 10 }, (_, i) => <i key={i} />)}</div></div>
          <span className="pp-gifts">{gifts}</span>
          <span className="pp-wallet">¥ {state.coins}</span>
        </div>
        {(mine || onA) && (
          <div className="pp-pad">
            <div className="pp-dpad" aria-hidden="true"><i /><i /></div>
            <div className="pp-ab">
              <button type="button" className="a" onClick={poke} aria-label="戳一戳">A</button>
              <button type="button" className="b" onClick={wave} aria-label="打招呼">B</button>
            </div>
          </div>
        )}
      </div>
      {mini && away && createPortal(
        <div
          ref={miniRef}
          className="pp-mini"
          style={miniPos ? { left: miniPos.x, top: miniPos.y, right: 'auto' } : undefined}
          role="group"
          aria-label="小屋悬浮窗"
        >
          <div className="pp-mini-screen" onPointerDown={dragDown} onPointerMove={dragMove} onPointerUp={dragUp} onPointerCancel={dragUp}>
            <canvas ref={miniCanvasRef} width={W} height={H} />
            <span ref={miniClockRef} className="pp-mini-clock" />
            <div ref={miniBubbleRef} className="pp-bubble pp-mini-bubble" />
          </div>
          <div className="pp-mini-bar">
            <b>{name}</b>
            {(mine || onA) && (
              <span className="pp-mini-ab">
                <button type="button" className="a" onClick={poke} aria-label="戳一戳">A</button>
                <button type="button" className="b" onClick={wave} aria-label="打招呼">B</button>
              </span>
            )}
            <button type="button" className="x" onClick={toggleMini} aria-label="关掉悬浮窗">×</button>
          </div>
        </div>,
        document.body,
      )}
      {mine && (
        <footer className="wf pp-wf">
          <span>A 戳一戳（试试你写的被戳反应，连点 3 下看「被戳烦了」）· B 打招呼（只有你自己看得到）</span>
          {onReplay && <button type="button" className="pp-chip" onClick={onReplay}>🎬 回放下班庆祝</button>}
        </footer>
      )}
      {!mine && onA && <footer className="wf"><span>A 戳一戳（会写进 TA 的日记）· B 打招呼</span></footer>}
    </section>
  )
})

/* ---------- 自己的安排面板 ---------- */

/* ---------- 换装：衣橱 ---------- */

// 一条请求是不是已经过期（服务端接受时也会按同样的 24 小时判断，这里只是用来显示）
const reqExpired = (r) => Date.now() - new Date(r.created_at).getTime() > 24 * 3600 * 1000
const reqText = (r) => {
  const parts = r.parts || {}
  const names = SLOT_KEYS.filter((k) => parts[k]).map((k) => {
    const g = outfitOf(parts[k])
    return g ? g.name : '（已删除）'
  })
  return names.join(' + ') || '空'
}
const reqStatus = (r) => {
  if (r.status === 'pending') return reqExpired(r) ? '已过期' : '等 TA 回话'
  if (r.status === 'accepted') return 'TA 穿上了'
  if (r.status === 'declined') return 'TA 没答应'
  if (r.status === 'cancelled') return '撤回了'
  if (r.status === 'expired') return '已过期'
  return String(r.status)
}

function Wardrobe({ slot, draft, setDraft, outfits }) {
  const cvRef = useRef(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('top') // 让 AI 做哪个部位
  const [idea, setIdea] = useState('')
  const [rawJson, setRawJson] = useState('') // 粘贴导入用的
  const worn = draft.outfit || {}
  const mine = outfits.mine || []
  const ta = outfits.ta || []
  const reqs = outfits.reqs || []
  const taName = outfits.taName || 'TA'
  const wornList = resolveWorn(worn)

  // 预览和小屋里的小人走同一套绘制代码，看到的就是真的
  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const g = cv.getContext('2d')
    g.clearRect(0, 0, 16, 23)
    drawAvatar(g, slot, wornList)
  })

  const wear = (k, id) => setDraft((d) => {
    const next = { ...(d.outfit || {}) }
    if (id) next[k] = id
    else delete next[k]
    return { ...d, outfit: next }
  })

  const run = async (fn, okText) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (r && r.error) outfits.say(r.error)
    else if (okText) outfits.say(okText)
    return r
  }

  const del = (o) => run(async () => {
    const r = await outfitDelete(o.id)
    if (!r.error) {
      if (worn[o.slot] === o.id) wear(o.slot, null)
      await outfits.reload()
    }
    return r
  }, '删掉了')

  const send = () => {
    const parts = {}
    for (const k of SLOT_KEYS) if (worn[k]) parts[k] = worn[k]
    if (!Object.keys(parts).length) { outfits.say('先在下面挑点东西穿上，再发给 TA'); return }
    run(async () => {
      const r = await outfitSend(outfits.taId, parts, note.trim())
      if (!r.error) { setNote(''); await outfits.reload() }
      return r
    }, `已经发给 ${taName} 了，等 TA 点头`)
  }

  const respond = (r, accept) => run(async () => {
    const res = await outfitRespond(r.id, accept)
    if (!res.error) {
      await outfits.reload()
      if (res.status === 'accepted') { outfits.say('换好了，就是小屋里这个样'); outfits.onAccepted() }
      else if (res.status === 'declined') outfits.say('拒绝啦')
      else if (res.status === 'expired') outfits.say('这条已经过期了')
      else outfits.say('这条已经处理过了')
    }
    return res
  })

  // 让 AI 做一件：走用户自己填的 AI 设置（浏览器直连），回来看格式对不对，不对就带着原因再试一次
  const makeByAi = async () => {
    const cfg = loadAi()
    if (!aiReady(cfg)) { outfits.say('先去页面最下面的「AI 设置」把地址、key、模型填上'); return }
    setBusy(true)
    let why = ''
    for (let i = 0; i < 2; i++) {
      const { error, text } = await chat(cfg, outfitMessages(pick, idea, why), { maxTokens: 900 })
      if (error) { setBusy(false); outfits.say(error); return }
      const parsed = parseOutfitText(text)
      if (parsed.error) { why = parsed.error; continue }
      const { name, data } = splitOutfitJson(parsed.data)
      const bad = validateOutfit(data)
      if (bad) { why = bad; continue }
      const r = await outfitSave(null, name || cleanLabel(idea) || 'AI 做的', pick, data)
      setBusy(false)
      if (r.error) { outfits.say(r.error); return }
      setIdea('')
      await outfits.reload()
      outfits.say('做好了，点它就能穿上')
      return
    }
    setBusy(false)
    outfits.say('AI 画得不对：' + (why || '再试一次'))
  }

  // 粘贴一段 JSON 导入（AI 在别处生成的、或者别人给的）
  const importJson = () => {
    const parsed = parseOutfitText(rawJson)
    if (parsed.error) { outfits.say(parsed.error); return }
    const { name, data } = splitOutfitJson(parsed.data)
    const bad = validateOutfit(data)
    if (bad) { outfits.say(bad); return }
    run(async () => {
      const r = await outfitSave(null, name || '导入的衣服', data.slot, data)
      if (!r.error) { setRawJson(''); await outfits.reload() }
      return r
    }, '导进来了，点它就能穿上')
  }

  const incoming = reqs.filter((r) => r.status === 'pending' && r.to_id === outfits.myId && !reqExpired(r))
  const outgoing = reqs.filter((r) => r.from_id === outfits.myId && r.to_id === outfits.taId).slice(0, 3)

  const chipsFor = (k) => (
    <>
      <button type="button" className={`pp-chip${worn[k] ? '' : ' on'}`} onClick={() => wear(k, null)}>不穿</button>
      {BUILTINS.filter((b) => b.slot === k).map((b) => (
        <button key={b.id} type="button" className={`pp-chip${worn[k] === b.id ? ' on' : ''}`} onClick={() => wear(k, b.id)}>{b.name}</button>
      ))}
      {mine.filter((o) => o.slot === k).map((o) => (
        <span className="pp-wear-item" key={o.id}>
          <button type="button" className={`pp-chip${worn[k] === o.id ? ' on' : ''}`} onClick={() => wear(k, o.id)}>{o.name}</button>
          <button type="button" className="pp-wear-x" onClick={() => del(o)} aria-label={`删掉 ${o.name}`}>×</button>
        </span>
      ))}
      {ta.filter((o) => o.slot === k).map((o) => (
        <button key={o.id} type="button" className={`pp-chip${worn[k] === o.id ? ' on' : ''}`} onClick={() => wear(k, o.id)}>{taName}·{o.name}</button>
      ))}
    </>
  )

  return (
    <div className="pp-wear">
      <div className="pp-wear-top">
        <canvas ref={cvRef} className="pp-wear-cv" width={16} height={23} aria-hidden="true" />
        <div className="pp-wear-say">
          <b>{wornList.length ? wornList.map((g) => g.name).join(' + ') : '什么都没穿'}</b>
          <small>上面的小屋会立刻跟着变；点保存，TA 那边才看得到</small>
        </div>
      </div>

      {!!incoming.length && (
        <div className="pp-req">
          {incoming.map((r) => (
            <div key={r.id} className="pp-req-card">
              <div><b>{taName} 想让你穿</b>：{reqText(r)}</div>
              {r.note && <div className="pp-req-note">“{r.note}”</div>}
              <div className="pp-req-btns">
                <button type="button" className="btn" disabled={busy} onClick={() => respond(r, true)}>穿上</button>
                <button type="button" className="pp-chip" disabled={busy} onClick={() => respond(r, false)}>不要</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {SLOT_KEYS.map((k) => (
        <div className="pp-wear-row" key={k}>
          <div className="pp-wear-key">{SLOT_NAMES[k]}</div>
          <div className="pp-chips">{chipsFor(k)}</div>
        </div>
      ))}

      <div className="pp-wear-send">
        <input className="pp-wear-in" value={note} maxLength={20} onChange={(e) => setNote(clipLine(e.target.value))} placeholder="留一句话（可不写）" aria-label="给这次请求的备注" />
        <button type="button" className="btn" disabled={busy} onClick={send}>让 {taName} 穿这套</button>
      </div>
      {!!outgoing.length && (
        <div className="pp-wear-log">
          {outgoing.map((r) => <div key={r.id} className="pp-wear-line">{reqText(r)} · <b>{reqStatus(r)}</b></div>)}
        </div>
      )}

      <div className="pp-sub">让 AI 做一件 <small>用「AI 设置」里填的模型，做好直接进你的衣橱</small></div>
      <div className="pp-wear-send">
        <select className="pp-sel" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="新衣服是哪个部位">
          {SLOT_KEYS.map((k) => <option key={k} value={k}>{SLOT_NAMES[k]}</option>)}
        </select>
        <input className="pp-wear-in" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="比如：奶白色粗针毛衣，袖口有一道橘色" aria-label="想要什么衣服" />
        <button type="button" className="btn" disabled={busy} onClick={makeByAi}>{busy ? '…' : '生成'}</button>
      </div>

      <details className="pp-fold pp-wear-fold">
        <summary><b>粘贴一段 JSON</b><small>别处生成的衣服、或者别人给的</small></summary>
        <textarea className="pp-wear-area" rows={4} value={rawJson} onChange={(e) => setRawJson(e.target.value)} placeholder='{"name":"粗针毛衣","slot":"top","y0":12,"pal":["#c96a4a"],"rows":["................"]}' aria-label="衣服 JSON" />
        <button type="button" className="btn" disabled={busy || !rawJson.trim()} onClick={importJson}>存进衣橱</button>
      </details>
      <p className="pp-hint">
        上装能画到第 20 行（长裙 / 长风衣），下装 17–20，鞋 21–22，配饰是帽子（0–4）和围巾（11–14）。
        衣服只会在身体轮廓里上色，不会盖住头发、手和脸。{mine.length === 0 ? '' : ` 你已经做了 ${mine.length} 件。`}
      </p>
    </div>
  )
}

function Planner({ name, slot, draft, setDraft, dirty, saving, onSave, onReset, sim, setSim, hr, onPreset, onTheme, onReplay, onTryButton, settleNote, income, mine, userScenes, onSavePreset, onDeletePreset, say, sec, setSec, outfits }) {
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const [pe, setPe] = useState('⭐') // 要存的预设：图标 + 名字
  const [pn, setPn] = useState('')
  const [pBusy, setPBusy] = useState(false)
  const active = activePreset(draft, [...DAILY_PRESETS, ...SPECIAL_PRESETS, ...mine.items], slot)
  const schedProblem = checkSchedule(draft)
  const defs = defaultPokes(slot)

  // 作息：改一项，另外几项顺势挪到合规矩的位置（起床 ≤ 上班 < 下班 ≤ 睡觉 ≤ 起床+23）；对不上的玩耍/放空时段取消，并告诉你
  const setSched = (k, v) => {
    const next = reflow({ ...draft, [k]: v }, k)
    const moved = Object.keys(SCHED_NAMES).filter((x) => x !== k && next[x] !== draft[x]).map((x) => SCHED_NAMES[x])
    const fitted = fitWindows(next)
    const dropped = WINDOW_KINDS.filter(({ k: w }) => next[`${w}_from`] != null && fitted[`${w}_from`] == null).map(({ n }) => n)
    setDraft(fitted)
    const msgs = []
    if (moved.length) msgs.push(`${moved.join('、')}也跟着挪了`)
    if (dropped.length) msgs.push(`${dropped.join('、')}的时段落到了上班/睡觉时间里，已取消`)
    if (msgs.length) say(msgs.join('；'))
  }

  // 玩耍 / 放空：下拉里只有「在家的时间」里的钟点；选「不设」两头一起清掉；只选了一头，另一头自动补成差一小时；两段撞在一起时取消另一段
  const setWin = (kind, which, v) => {
    const f = `${kind}_from`
    const t = `${kind}_to`
    let from = draft[f]
    let to = draft[t]
    if (v === '') {
      from = null
      to = null
    } else {
      const n = +v
      const segs = homeSegments(draft)
      if (which === 'from') {
        const seg = segs.find(([a, b]) => n >= a && n < b)
        if (!seg) return
        from = n
        if (to == null || to <= n || to > seg[1]) to = n + 1
      } else {
        const seg = segs.find(([a, b]) => n > a && n <= b)
        if (!seg) return
        to = n
        if (from == null || from < seg[0] || from >= n) from = n - 1
      }
    }
    const next = { ...draft, [f]: from, [t]: to }
    const o = kind === 'play' ? 'idle' : 'play'
    const oName = kind === 'play' ? '放空' : '玩耍'
    if (from != null && next[`${o}_from`] != null && !(to <= next[`${o}_from`] || next[`${o}_to`] <= from)) {
      next[`${o}_from`] = null
      next[`${o}_to`] = null
      say(`和「${oName}」的时间撞上了，「${oName}」已取消`)
    }
    setDraft(next)
  }

  // 放空去哪：选了就把预览时间拨到放空的时段里，马上能看到画面换成那里
  const setIdleScene = (k) => {
    set('idle_scene', k)
    if (!k || draft.idle_from == null || draft.idle_to == null) return
    const h = shiftHour(draft, hr)
    if (h >= draft.idle_from && h < draft.idle_to) return
    setSim(((draft.idle_from + draft.idle_to) / 2) % 24)
  }

  // 被戳反应：每套 4 个输入框，改的是草稿（带空位），存之前才整理
  const setPoke = (k, i, v) => setDraft((d) => {
    const cur = pad4(d.poke_lines && d.poke_lines[k])
    cur[i] = clipLine(v)
    return { ...d, poke_lines: { ...(d.poke_lines || {}), [k]: cur } }
  })
  const savePreset = async () => {
    setPBusy(true)
    const ok = await onSavePreset(pe, pn)
    setPBusy(false)
    if (ok) setPn('')
  }
  const presetBtn = (p) => (
    <button key={p.id} type="button" className={`pp-chip${active && active.id === p.id ? ' on' : ''}`} onClick={() => onPreset(p)} title={p.d}>{p.e} {p.n}</button>
  )
  const setBtn = (i, f, v) => setDraft((d) => ({
    ...d,
    buttons: d.buttons.map((b, j) => (j === i ? { ...b, [f]: f === 'e' ? cleanEmoji(v) : cleanLabel(v) } : b)),
  }))

  // 按钮「点了以后说什么」：每个按钮 3 个输入框，改的是草稿（带空位），存之前才整理
  const setBtnLine = (i, k, v) => setDraft((d) => {
    const cur = [0, 1, 2].map((j) => ({ ...((d.btn_lines && d.btn_lines[j]) || {}) }))
    cur[i][k] = clipLine(v)
    return { ...d, btn_lines: cur }
  })

  return (
    <section className="win">
      <header className="tb">
        <Svg name="sliders" size={14} />
        <b>今天的安排.cfg</b>
        <span className="grow" />
        <span className="mono">{dirty ? '有改动' : '已保存'}</span>
        <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
      </header>
      <div className="wb">
        <p className="pp-lead">只有你能改{name}。TA 来看小屋时，看到的就是你保存的这一份。</p>
        <div className="pp-tabs" role="tablist">
          {PLAN_TABS.map(([k, n]) => (
            <button key={k} type="button" role="tab" aria-selected={sec === k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{n}</button>
          ))}
        </div>

        <div className="pp-blk" hidden={sec !== 'preset'}>
          <div className="pp-h">一键预设 <small>套上去只是预览，保存了才算数</small></div>
          <div className="pp-sub">日常</div>
          <div className="pp-chips">{DAILY_PRESETS.map(presetBtn)}</div>
          <div className="pp-sub">特殊日 / 纪念日</div>
          <div className="pp-chips">{SPECIAL_PRESETS.map(presetBtn)}</div>
          <div className="pp-sub">我的预设 <small>存的是你现在看到的这一整套：地点、墙纸、作息、玩耍/放空、3 个按钮、被戳反应</small></div>
          {mine.missing ? (
            <p className="pp-hint" style={{ margin: 0 }}>服务端还没有存预设的表，把第三轮的 SQL（pixelpals-round3.sql）整段再跑一遍就能用了。</p>
          ) : (
            <>
              <div className="pp-chips">
                {mine.items.map((p) => (
                  <span className="pp-cp" key={p.id}>
                    {presetBtn(p)}
                    <button type="button" className="pp-x" onClick={() => onDeletePreset(p)} aria-label={`删除预设 ${p.n}`}>×</button>
                  </span>
                ))}
                {!mine.items.length && <span className="pp-hint" style={{ margin: 0 }}>{mine.loading ? '读取中…' : '还没有。把上面的安排调好，在下面起个名字存起来。'}</span>}
              </div>
              <div className="pp-inrow pp-mk">
                <input className="pp-in c" type="text" value={pe} onChange={(e) => setPe(cleanEmoji(e.target.value))} aria-label="预设的图标" />
                <input className="pp-in" type="text" value={pn} onChange={(e) => setPn(cleanLabel(e.target.value))} placeholder="给这套起个名字（8 个字以内）" aria-label="预设的名字" />
                <button type="button" className="btn" disabled={pBusy || !pn.trim()} onClick={savePreset}>{pBusy ? '…' : '存起来'}</button>
              </div>
            </>
          )}
          <p className="pp-hint">{active ? `${active.e} ${active.n}：${active.d}` : '日常预设只换上班地点和作息；特殊日和「我的预设」整套都换，连墙纸、3 个互动按钮和被戳反应一起（第四轮之前存的老预设不动你的被戳反应）。套错了点最下面的「还原」。同名再存一次就是覆盖。'}</p>
        </div>

        <div className="pp-blk" hidden={sec !== 'scene'}>
          <div className="pp-h">上班地点</div>
          <div className="pp-chips">
            {SCENE_LIST.map(({ k, n, e }) => (
              <button key={k} type="button" className={`pp-chip${draft.work_scene === k ? ' on' : ''}`} onClick={() => set('work_scene', k)}>{e} {n}</button>
            ))}
            {userScenes.map((s) => (
              <button key={s.id} type="button" className={`pp-chip${draft.work_scene === s.id ? ' on' : ''}`} onClick={() => set('work_scene', s.id)}>🎨 {s.name}</button>
            ))}
          </div>
          <p className="pp-hint">🎨 是自己画的场景，在页面最下面的「像素画室」里画；画好了就会出现在这里。</p>
        </div>

        <div className="pp-blk" hidden={sec !== 'scene'}>
          <div className="pp-h">家里的墙纸 <small>只有在家的时候看得到</small></div>
          <div className="pp-chips">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} type="button" className={`pp-chip${draft.home_theme === k ? ' on' : ''}`} onClick={() => onTheme(k)}>{t.n}</button>
            ))}
          </div>
        </div>

        <div className="pp-blk" hidden={sec !== 'wear'}>
          <Wardrobe slot={slot} draft={draft} setDraft={setDraft} outfits={outfits} />
        </div>

        <div className="pp-blk" hidden={sec !== 'sched'}>
          <div className="pp-h">作息 <small>其余时间在家，睡觉时间之后关灯</small></div>
          <div className="pp-sched">
            <label>起床 <select className="pp-sel" value={draft.wake_h} onChange={(e) => setSched('wake_h', +e.target.value)}>{hourOpts(0, 23)}</select></label>
            <label>上班 <select className="pp-sel" value={draft.work_h} onChange={(e) => setSched('work_h', +e.target.value)}>{hourOpts(draft.wake_h, draft.wake_h + 22)}</select></label>
            <label>下班 <select className="pp-sel" value={draft.off_h} onChange={(e) => setSched('off_h', +e.target.value)}>{hourOpts(draft.wake_h + 1, draft.wake_h + 23)}</select></label>
            <label>睡觉 <select className="pp-sel" value={draft.sleep_h} onChange={(e) => setSched('sleep_h', +e.target.value)}>{hourOpts(draft.wake_h + 1, draft.wake_h + 23)}</select></label>
          </div>
          <p className="pp-hint">夜班、睡过午夜都可以：上班 / 下班 / 睡觉能选「次日」。改其中一项，别的会自动跟着挪，不会出现顺序乱掉的情况。</p>
          {schedProblem && <p className="pp-warn">{schedProblem}</p>}
        </div>

        <div className="pp-blk" hidden={sec !== 'sched'}>
          <div className="pp-h">在家的活动 <small>可选：在家的时间里，安排一段玩耍、一段放空</small></div>
          {WINDOW_KINDS.map(({ k, n, e }) => (
            <div className="pp-sched" key={k} style={{ marginBottom: 8 }}>
              <label>{e} {n} <select className="pp-sel" value={draft[`${k}_from`] == null ? '' : draft[`${k}_from`]} onChange={(ev) => setWin(k, 'from', ev.target.value)} aria-label={`${n}的开始时间`}>{winOpts(winFromList(draft))}</select></label>
              <label>到 <select className="pp-sel" value={draft[`${k}_to`] == null ? '' : draft[`${k}_to`]} onChange={(ev) => setWin(k, 'to', ev.target.value)} aria-label={`${n}的结束时间`}>{winOpts(winToList(draft, draft[`${k}_from`]))}</select></label>
            </div>
          ))}
          <div className="pp-sub">放空时去哪儿 <small>{draft.idle_from == null ? '先在上面设一段放空时间，才会去那里' : '放空的那段时间里，画面会换成这个地方'}</small></div>
          <div className="pp-chips">
            <button type="button" className={`pp-chip${!draft.idle_scene ? ' on' : ''}`} onClick={() => setIdleScene(null)}>🏠 在家窗前</button>
            {SCENE_LIST.map(({ k, n, e }) => (
              <button key={k} type="button" className={`pp-chip${draft.idle_scene === k ? ' on' : ''}`} onClick={() => setIdleScene(k)}>{e} {n}</button>
            ))}
            {userScenes.map((s) => (
              <button key={s.id} type="button" className={`pp-chip${draft.idle_scene === s.id ? ' on' : ''}`} onClick={() => setIdleScene(s.id)}>🎨 {s.name}</button>
            ))}
          </div>
          <p className="pp-hint">不设就是没有。时间要完整落在「起床后到上班前」或「下班后到睡觉前」里，两段不能重叠。玩耍时小人{slot === 'u2' ? '弹吉他' : '玩掌机'}；放空时站着发呆（在家就在窗前，选了别的地方就去那里）；拖下面的「预览时间」就能看到。</p>
        </div>

        <div className="pp-blk" hidden={sec !== 'touch'}>
          <div className="pp-h">被戳反应 <small>TA 戳{name}的时候，{name}会在 TA 的屏幕上说这些话</small></div>
          {POKE_SETS.map(({ k, n, hint }) => (
            <details key={k} className="pp-fold" open={k === 'work'}>
              <summary><b>{n}</b><small>{hint}</small><i>{pad4(draft.poke_lines && draft.poke_lines[k]).filter((s) => s.trim()).length}/{POKE_MAX}</i></summary>
              <div className="pp-edits" style={{ gridTemplateColumns: '1fr' }}>
                {pad4(draft.poke_lines && draft.poke_lines[k]).map((s, i) => (
                  <input
                    key={i}
                    className="pp-in"
                    type="text"
                    maxLength={POKE_LEN}
                    value={s}
                    placeholder={defs[k][i] ? `默认：${defs[k][i]}` : '留空 = 不用这一句'}
                    onChange={(e) => setPoke(k, i, e.target.value)}
                    aria-label={`${n}的第 ${i + 1} 句`}
                  />
                ))}
              </div>
            </details>
          ))}
          <p className="pp-hint">每套最多 {POKE_MAX} 句，每句 {POKE_LEN} 个字以内，TA 每次戳会随机挑一句；一套都留空就用默认台词（灰字）。睡觉时用「睡觉时」，玩耍和放空沿用「在家时」。想先看看效果：点上面小屋的 A 键，连点 3 下就是「被戳烦了」。</p>
        </div>

        <div className="pp-blk" hidden={sec !== 'touch'}>
          <div className="pp-h">今天的 3 个互动按钮 <small>TA 点了以后，{name}会根据场景回应</small></div>
          {draft.buttons.map((b, i) => {
            const nb = normalizeButtons(draft.buttons, slot)[i]
            const defs = defaultBtnLines(slot, nb.e, nb.t)
            const mineLines = (draft.btn_lines && draft.btn_lines[i]) || {}
            const filled = BTN_SETS.filter(([k]) => String(mineLines[k] || '').trim()).length
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div className="pp-edit">
                  <input className="pp-in c" type="text" value={b.e} onChange={(e) => setBtn(i, 'e', e.target.value)} aria-label={`第 ${i + 1} 个按钮的图标`} />
                  <input className="pp-in" type="text" value={b.t} onChange={(e) => setBtn(i, 't', e.target.value)} placeholder="按钮文字（8 个字以内）" aria-label={`第 ${i + 1} 个按钮的文字`} />
                </div>
                <details className="pp-fold" style={{ marginTop: 6, marginBottom: 0 }}>
                  <summary><b>点了以后{name}说</b><small>留空 = 用默认台词</small><i>{filled}/3</i></summary>
                  <div className="pp-edits" style={{ gridTemplateColumns: '1fr' }}>
                    {BTN_SETS.map(([k, n]) => (
                      <div className="pp-edit" key={k}>
                        <small style={{ alignSelf: 'center', color: 'var(--ink2)', fontSize: 12 }}>{n}</small>
                        <input
                          className="pp-in"
                          type="text"
                          maxLength={POKE_LEN}
                          value={mineLines[k] || ''}
                          placeholder={`默认：${defs[k]}`}
                          onChange={(e) => setBtnLine(i, k, e.target.value)}
                          aria-label={`第 ${i + 1} 个按钮，${n}说的话`}
                        />
                      </div>
                    ))}
                    <div className="pp-chips"><button type="button" className="pp-chip" onClick={() => onTryButton(i)}>▶ 在上面的小屋里试一下</button></div>
                  </div>
                </details>
              </div>
            )
          })}
          <p className="pp-hint">图标或文字留空，保存时会换回默认的。每句 {POKE_LEN} 个字以内；睡觉时用「睡觉时」，玩耍和放空沿用「在家时」。「试一下」按现在的预览时间处在上班 / 在家 / 睡觉来挑那一句，拖下面的「预览时间」可以换。改了按钮的图标或文字，写好的话还跟着这一格；套用预设如果换了按钮，这些话会清掉（点「还原」能找回）。</p>
        </div>

        <div hidden={sec !== 'persona'}>
          <PersonaEditor name={name} slot={slot} say={say} />
        </div>

        <div className="pp-blk" hidden={sec !== 'sched'}>
          <div className="pp-h">下班结算 <small>{settleNote}</small></div>
          <p className="pp-hint" style={{ margin: '0 0 8px' }}>下班后打开小屋，会自动结算当天的工资，每天一次。按现在的作息：上 {income.hours} 小时班 = ¥{income.base}，心情不低于 70 再加 ¥{income.bonus}。</p>
          <div className="pp-chips"><button type="button" className="pp-chip" onClick={onReplay}>🎬 回放下班庆祝（不发钱）</button></div>
        </div>

        <div className="pp-blk" hidden={sec === 'persona'}>
          <div className="pp-h">预览时间 <small>只在你这台手机上看效果，不会保存</small></div>
          <div className="pp-time">
            <input type="range" min="0" max="23.75" step="0.25" value={sim == null ? hr : sim} onChange={(e) => setSim(+e.target.value)} aria-label="预览时间" />
            <b>{fmtHour(sim == null ? hr : sim)}</b>
            <button type="button" className={`pp-chip${sim == null ? ' on' : ''}`} onClick={() => setSim(null)}>实时</button>
          </div>
        </div>

        <div className="pp-actions" style={sec === 'persona' ? { display: 'none' } : undefined}>
          <button type="button" className="btn ghost" disabled={!dirty || saving} onClick={onReset}>还原</button>
          <button type="button" className="btn" disabled={!dirty || saving} onClick={onSave}>{saving ? '保存中…' : '保存安排'}</button>
        </div>
      </div>
    </section>
  )
}

/* ---------- 页面 ---------- */

export default function PixelPals({ onExit }) {
  useFonts()
  const { toggle } = useTheme()
  const { me, partner } = useAuth()

  const mySlot = slotOf(me) || 'u1'
  const taSlot = slotOf(partner) || (mySlot === 'u1' ? 'u2' : 'u1')
  const myName = (me && me.display_name) || '我'
  const taName = (partner && partner.display_name) || 'TA'

  const myPal = usePal(me && me.id, mySlot, true)
  const presets = usePresets(me && me.id, mySlot)
  const taPal = usePal(partner && partner.id, taSlot, false)
  // 自己画的场景：我的 + TA 的都读下来、登记进场景表（TA 换了新场景，这边跟着重新读，才画得出来）
  const myScenes = usePalScenes(me && me.id)
  const taScenes = usePalScenes(partner && partner.id, `${taPal.settings.work_scene}|${taPal.settings.idle_scene}`)
  // 换装：我做的和 TA 做的都读下来登记，谁穿的是什么都画得出来；请求走同一个收件箱
  const myOutfits = usePalOutfits(me && me.id)
  const taOutfits = usePalOutfits(partner && partner.id)
  const outfitReqs = useOutfitReqs(me && me.id, partner && partner.id)
  const [sec, setSec] = useState('preset') // 设置面板当前翻到哪一页（信封角标要能直接跳到换装）

  const [tab, setTab] = useState('mine')
  const [sim, setSim] = useState(null) // null = 用真实时间
  const [real, setReal] = useState(realHour)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false) // 正在等服务端结算一次互动：期间互动按钮都点不了，避免连点
  const busyRef = useRef(false)
  const baseRef = useRef(null)
  const toastT = useRef(0)
  const myConsole = useRef(null)
  const taConsole = useRef(null)
  const pokeHist = useRef([]) // 我最近戳 TA 的时间（只记成功的），用来算「连戳」
  const settledRef = useRef(false) // 这次打开页面已经问过服务端结算了
  const pendingRef = useRef(null) // 刚结算到的工资，等「我的小屋」在屏幕上了就放庆祝
  const [celebTick, setCelebTick] = useState(0)
  const live = useRef({}) // 给回调用的「最新值」，免得回调里拿到旧的

  useEffect(() => {
    const id = setInterval(() => setReal(realHour()), 20000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => () => clearTimeout(toastT.current), [])
  useEffect(() => { window.scrollTo(0, 0) }, [])

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2600)
  }, [])

  // 服务器上的设置变了（刚保存完 / 别的设备改了）：没有未保存的改动就跟着更新，有就保留你正在改的
  useEffect(() => {
    if (myPal.loading) return
    const old = baseRef.current
    baseRef.current = myPal.settings
    setDraft((d) => (d == null || same(canon(d), old) ? myPal.settings : d))
  }, [myPal.settings, myPal.loading])

  // 下班结算：打开页面时问一次服务端。每天只发一次钱由服务端判断，这里重复问也不会多发
  useEffect(() => {
    if (!me || myPal.loading || myPal.error || settledRef.current) return
    settledRef.current = true
    ;(async () => {
      const { error, res } = await palSettle()
      if (error) { say(error); return }
      if (!res || !res.settled) return
      await myPal.reload()
      pendingRef.current = res
      if (live.current.tab !== 'mine') say(`下班结算：钱包 +¥${res.coins}`)
      setCelebTick((n) => n + 1)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, myPal.loading, myPal.error])

  // 庆祝要在「我的小屋」的屏幕上放：不在这个页签就等切回来
  useEffect(() => {
    const res = pendingRef.current
    if (!res || tab !== 'mine' || !myConsole.current) return
    pendingRef.current = null
    myConsole.current.play(celebrateEvent(mySlot, res))
  }, [tab, celebTick, mySlot])

  const hr = sim == null ? real : sim
  const shownDraft = draft || myPal.settings
  const dirty = !!draft && !same(canon(draft), myPal.settings)
  const est = estimateIncome(shownDraft, 0)
  // 夜班（下班时间在次日）算的是「上班那天」的班：次日下班后结算的是昨天上的那一班
  const night = myPal.settings.off_h >= 24
  const settledToday = !!(myPal.raw && myPal.raw.settled_day === shiftDay(myPal.settings))
  const offPassed = (night ? real + 24 : real) >= myPal.settings.off_h
  const settleNote = settledToday ? (night ? '上一班已结算 ✓' : '今天已结算 ✓') : offPassed ? (night ? '上一班还没结算' : '今天还没结算') : '下班后自动结算'
  live.current = { tab, hr, mySlot, taSlot, myId: me && me.id, mySettings: myPal.settings, taSettings: taPal.settings }

  // 换装的一揽子数据 + 动作：给衣橱和信封角标用
  const outfits = {
    mine: myOutfits.items,
    ta: taOutfits.items,
    reqs: outfitReqs.items,
    myId: me && me.id,
    taId: partner && partner.id,
    taName,
    say,
    reload: async () => { await myOutfits.reload(); await outfitReqs.reload() },
    onAccepted: () => { myPal.reload(); taPal.reload() },
  }
  const myPending = outfitReqs.items.filter((r) => r.status === 'pending' && r.to_id === (me && me.id) && !reqExpired(r)).length

  // TA 对我的小人做了什么：我正好在看自己的小屋，小人就当场反应；不在看就只进日记
  const onLogInsert = useCallback((row) => {
    const L = live.current
    if (!PLAY_KINDS.includes(row.kind)) return
    if (row.owner_id !== L.myId || row.actor_id === L.myId) return
    if (L.tab !== 'mine' || !myConsole.current) return
    myConsole.current.play(reactionFor(L.mySlot, stateOf(L.mySettings, L.hr), row.kind, row.data, L.mySettings))
  }, [])
  const log = usePalLog(me && me.id, partner && partner.id, onLogInsert)

  // 我对 TA 的小人做一件事：先让服务端结算（扣钱、加心情、写日记），成功了 TA 的小人才当场反应
  const onAct = async (kind, call, data) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    const { error } = await call()
    busyRef.current = false
    setBusy(false)
    if (error) { say(error); return false }
    const L = live.current
    if (taConsole.current) taConsole.current.play(reactionFor(L.taSlot, stateOf(L.taSettings, L.hr), kind, data, L.taSettings))
    myPal.reload()
    taPal.reload()
    return true
  }

  // 戳 TA：同一个人（就是我）60 秒内戳到第 3 下起，TA 的小人换成「被戳烦了」那一套。
  // 说哪一句由这里按 TA 自己写的被戳反应挑好（没写就用默认台词），连同「是不是被连戳烦了」一起交给服务端存进日记；
  // 服务端结算成功以后，TA 的小人才在我的屏幕上说出这句话
  const onPokeTa = async () => {
    if (!partner) return
    const L = live.current
    const now = Date.now()
    const recent = pokeHist.current.filter((t) => now - t < POKE_STREAK_MS)
    const annoyed = recent.length >= POKE_STREAK - 1
    const line = pokeLine(L.taSlot, stateOf(L.taSettings, L.hr), annoyed, L.taSettings.poke_lines)
    const ok = await onAct('poke', () => palPoke(partner.id, line, annoyed), { line, annoyed })
    if (ok) pokeHist.current = [...recent, Date.now()]
  }

  const onSave = async () => {
    if (!me || !draft) return
    const clean = { ...draft, buttons: normalizeButtons(draft.buttons, mySlot), poke_lines: compactPokeLines(draft.poke_lines), btn_lines: compactBtnLines(draft.btn_lines) }
    const bad = checkSchedule(clean)
    if (bad) { say(bad); return }
    setSaving(true)
    const { error } = await saveSettings(me.id, clean)
    setSaving(false)
    if (error) { say(error); return }
    setDraft(clean)
    baseRef.current = clean
    await myPal.reload()
    say('已保存，TA 来看的时候就是这样')
  }

  const onReset = () => setDraft(myPal.settings)

  // 删掉了自己画的场景：服务端已经把正在用它的设置换回默认；草稿里如果还选着它也换掉，再读一遍设置
  const onSceneDeleted = (id) => {
    setDraft((d) => (d ? { ...d, work_scene: d.work_scene === id ? 'office' : d.work_scene, idle_scene: d.idle_scene === id ? null : d.idle_scene } : d))
    myPal.reload()
  }

  // 套预设：只改草稿，小人马上预览，保存了才算数
  const onPreset = (p) => {
    const base = draft || myPal.settings
    const next = applyPreset(base, p, mySlot)
    setDraft(next)
    const winChanged = ['play_from', 'play_to', 'idle_from', 'idle_to', 'idle_scene'].some((k) => base[k] !== next[k])
    say(winChanged ? `套上了「${p.n}」（玩耍/放空跟着变了），看看预览，满意就保存` : `套上了「${p.n}」，看看预览，满意就保存`)
  }

  // 把现在看到的整套（含还没保存的草稿）存成「我的预设」
  const onSavePreset = async (emoji, rawName) => {
    const name = cleanLabel(rawName)
    if (!name) { say('先给这套起个名字（8 个字以内）'); return false }
    const clean = { ...shownDraft, buttons: normalizeButtons(shownDraft.buttons, mySlot), poke_lines: compactPokeLines(shownDraft.poke_lines), btn_lines: compactBtnLines(shownDraft.btn_lines) }
    const bad = checkSchedule(clean)
    if (bad) { say(bad); return false }
    const list = presets.items
    const old = list.find((p) => p.n === name)
    if (!old && list.length >= MAX_PRESETS) { say(`最多存 ${MAX_PRESETS} 套，先删掉一个`); return false }
    const p = makeCustomPreset(clean, cleanEmoji(emoji) || '⭐', name, old ? old.id : undefined)
    const { error } = await presets.save(old ? list.map((x) => (x.id === old.id ? p : x)) : [...list, p])
    if (error) { say(error); return false }
    say(old ? `「${name}」已经覆盖` : `存好了：「${name}」`)
    return true
  }

  const onDeletePreset = async (p) => {
    if (!window.confirm(`删掉预设「${p.n}」？`)) return
    const { error } = await presets.save(presets.items.filter((x) => x.id !== p.id))
    say(error || `已删掉「${p.n}」`)
  }

  // 换墙纸：墙纸只画在「家里」，上班时间选了什么都看不到，所以把预览时间拨到家里的时段
  const onTheme = (k) => {
    const next = { ...(draft || myPal.settings), home_theme: k }
    setDraft(next)
    if (atHome(next, stateOf(next, hr))) return // 在家 / 玩耍 / 在家放空时都看得到墙纸（放空去了别的场景的不算）
    const h = homeHour(next)
    if (h == null) return
    setSim(h)
    say(`墙纸只在家里看得到，预览时间先拨到 ${fmtHour(h)}`)
  }

  // 清空日记：服务端删掉和我有关的所有记录，删完重新读一遍
  const onClearLog = async () => {
    if (!window.confirm('清空小人日记？\n会删掉你的小人的日记，以及你对 TA 的小人做过的事（包括悄悄话），清了就找不回来了。')) return
    const { error } = await palLogClear()
    if (error) { say(error); return }
    await log.reload()
    say('日记已清空')
  }

  // 试一下某个按钮「点了以后说什么」：用你现在看到的（含没保存的草稿）和预览时间对应的状态，在上面的小屋里演一遍
  const onTryButton = (i) => {
    if (!myConsole.current) { say('先回到上面的「我的小屋」再试'); return }
    const nb = normalizeButtons(shownDraft.buttons, mySlot)[i]
    myConsole.current.play(reactionFor(mySlot, stateOf(shownDraft, hr), 'button', { e: nb.e, t: nb.t }, { ...shownDraft, buttons: normalizeButtons(shownDraft.buttons, mySlot), btn_lines: compactBtnLines(shownDraft.btn_lines) }))
  }

  // 回放下班庆祝：不发钱，只是看看动画
  const onReplay = () => {
    if (!myConsole.current) return
    myConsole.current.play(celebrateEvent(mySlot, estimateIncome(shownDraft, moodNow(myPal.state)), true))
  }

  const err = tab === 'mine' ? myPal.error : taPal.error

  return (
    <main className="page pp-page">
      {toast && <div className="toast glass">{toast}</div>}

      <div className="top">
        <div className="col" style={{ gap: 6 }}>
          <div className="date">04 小物</div>
          <h1 className="h-title">像素小屋</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="glass icon-btn tap" onClick={() => { if (onExit) onExit() }} aria-label="返回小物"><Svg name="back" size={20} /></button>
          <button type="button" className="glass icon-btn tap" onClick={toggle} aria-label="切换明暗主题"><Svg name="moon" size={20} /></button>
        </div>
      </div>

      <div className="pp-seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>我的小屋</button>
        <button type="button" role="tab" aria-selected={tab === 'ta'} className={tab === 'ta' ? 'on' : ''} onClick={() => setTab('ta')}>{taName}的小屋</button>
      </div>

      {myPending > 0 && (
        <button type="button" className="pp-mail" onClick={() => { setTab('mine'); setSec('wear') }}>
          ✉ {taName} 想让你穿点什么（{myPending}）
        </button>
      )}

      {err && <div className="pp-err">{err}</div>}

      {tab === 'mine' ? (
        <>
          <Console ref={myConsole} key={`me-${mySlot}`} slot={mySlot} name={myName} settings={shownDraft} state={myPal.state} hr={hr} mine preview={dirty} onReplay={onReplay} />
          <Planner
            name={myName}
            slot={mySlot}
            draft={shownDraft}
            setDraft={setDraft}
            dirty={dirty}
            saving={saving}
            onSave={onSave}
            onReset={onReset}
            sim={sim}
            setSim={setSim}
            hr={hr}
            onPreset={onPreset}
            mine={presets}
            onSavePreset={onSavePreset}
            onDeletePreset={onDeletePreset}
            onTheme={onTheme}
            onReplay={onReplay}
            onTryButton={onTryButton}
            say={say}
            settleNote={settleNote}
            userScenes={myScenes.items}
            sec={sec}
            setSec={setSec}
            outfits={outfits}
            income={{ hours: est.hours, base: est.base, bonus: INCOME.moodBonus }}
          />
          <Studio mine={myScenes} ta={taScenes} taName={taName} slot={mySlot} settings={myPal.settings} say={say} onDeleted={onSceneDeleted} />
<AiSettings say={say} />
        </>
      ) : partner ? (
        <>
          <Console
            ref={taConsole}
            key={`ta-${taSlot}`}
            slot={taSlot}
            name={taName}
            settings={taPal.settings}
            state={taPal.state}
            hr={hr}
            mine={false}
            preview={false}
            onA={onPokeTa}
          />
          <Visitor
            ownerId={partner.id}
            name={taName}
            slot={taSlot}
            st={stateOf(taPal.settings, hr)}
            buttons={taPal.settings.buttons}
            coins={myPal.state.coins}
            gifts={taPal.state.gifts}
            busy={busy}
            onAct={onAct}
            consoleRef={taConsole}
            aiCtx={{ myName, mood: moodNow(taPal.state), coins: taPal.state.coins, settings: taPal.settings }}
            say={say}
          />
        </>
      ) : (
        <section className="win"><div className="wb"><p className="pp-lead">还没有另一半的账号，等 TA 加入就能互相看到小屋了。</p></div></section>
      )}

      {me && (
        <Diary
          items={log.items}
          notes={log.notes}
          loading={log.loading}
          myId={me.id}
          myName={myName}
          mySlot={mySlot}
          taName={taName}
          taSlot={taSlot}
          mySettings={myPal.settings}
          taSettings={taPal.settings}
          onClear={onClearLog}
        />
      )}
    </main>
  )
}