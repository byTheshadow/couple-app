import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { Svg } from './Icon'
import { usePal, usePalLog, usePresets, saveSettings, palPoke, palSettle } from './pixelpals/store'
import {
  W, H, CHARS, SCENES, SCENE_ICON, THEMES, GIFTS, LINES,
  createActor, stepActor, renderFrame, headTop, hearts,
  normalizeButtons, checkSchedule, cleanEmoji, cleanLabel, moodNow, fmtHour, pad2, pick, stateOf,
} from './pixelpals/art'
import { dropItem, stepDrops, drawDrops } from './pixelpals/fx'
import { PLAY_KINDS, reactionFor } from './pixelpals/voice'
import { startCelebration, stepCelebration, drawCelebration, celebrateEvent, estimateIncome, localDay, INCOME } from './pixelpals/celebrate'
import { DAILY_PRESETS, SPECIAL_PRESETS, MAX_PRESETS, applyPreset, activePreset, homeHour, makeCustomPreset } from './pixelpals/presets'
import Visitor from './pixelpals/Visitor'
import Diary from './pixelpals/Diary'
import './pixelpals.css'

/* ===========================================================================
   像素小屋：两个人各有一台像素游戏机，互相能看到对方的小人在干嘛，但只能改自己的。
   第一轮：自己的安排面板（上班地点 / 墙纸 / 作息 / 三个互动按钮）+ 看 TA 的小屋。
   第二轮：去看 TA（互动按钮 / 投喂 / 送礼 / 悄悄话 / 聊天 / 戳一戳）+ 小人日记。
   第三轮：下班结算（服务端每天发一次工资 + 庆祝动画）、一键预设、墙纸预览、重置时一并清空。
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

// profiles.slot 可能是 'u1' / 'u2'，也可能只有数字；只认其中的数字，认不出来返回 null
const slotOf = (p) => {
  const n = String((p && p.slot) || '').replace(/\D/g, '')
  return n === '2' ? 'u2' : n === '1' ? 'u1' : null
}

const hourOptions = () => Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{pad2(i)}:00</option>)

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

const Console = forwardRef(function Console({ slot, name, settings, state, hr, mine, preview, onA }, ref) {
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
  live.current = { slot, settings, state, hr }

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

      const label = actor.state === 'work' ? `上班中 · ${SCENES[cur.settings.work_scene]}` : actor.state === 'home' ? '在家' : '睡觉中'
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
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [slot])

  const poke = () => {
    if (onA) { onA(); return } // 去戳 TA：交给父组件走服务端，成功后小人才有反应
    const a = actorRef.current
    if (!a) return
    a.react = 0.6
    a.blushT = 1.5
    hearts(a, 2)
    say(pick(LINES[slot].poke))
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
          {preview && <span className="pp-tag">预览中 · 还没保存</span>}
        </div>
        <div className="pp-bezel">
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
      {mine && <footer className="wf"><span>A 戳一戳 · B 打招呼（只有你自己看得到）</span></footer>}
      {!mine && onA && <footer className="wf"><span>A 戳一戳（会写进 TA 的日记）· B 打招呼</span></footer>}
    </section>
  )
})

/* ---------- 自己的安排面板 ---------- */

function Planner({ name, draft, setDraft, dirty, saving, onSave, onReset, sim, setSim, hr, onPreset, onTheme, onReplay, settleNote, income, mine, onSavePreset, onDeletePreset }) {
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const [pe, setPe] = useState('⭐') // 要存的预设：图标 + 名字
  const [pn, setPn] = useState('')
  const [pBusy, setPBusy] = useState(false)
  const active = activePreset(draft, [...DAILY_PRESETS, ...SPECIAL_PRESETS, ...mine.items])
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

        <div className="pp-blk">
          <div className="pp-h">一键预设 <small>套上去只是预览，保存了才算数</small></div>
          <div className="pp-sub">日常</div>
          <div className="pp-chips">{DAILY_PRESETS.map(presetBtn)}</div>
          <div className="pp-sub">特殊日 / 纪念日</div>
          <div className="pp-chips">{SPECIAL_PRESETS.map(presetBtn)}</div>
          <div className="pp-sub">我的预设 <small>存的是你现在看到的这一整套：地点、墙纸、作息、3 个按钮</small></div>
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
          <p className="pp-hint">{active ? `${active.e} ${active.n}：${active.d}` : '日常预设只换上班地点和作息；特殊日和「我的预设」整套都换，连墙纸和 3 个互动按钮一起。套错了点最下面的「还原」。同名再存一次就是覆盖。'}</p>
        </div>

        <div className="pp-blk">
          <div className="pp-h">上班地点</div>
          <div className="pp-chips">
            {Object.entries(SCENES).map(([k, n]) => (
              <button key={k} type="button" className={`pp-chip${draft.work_scene === k ? ' on' : ''}`} onClick={() => set('work_scene', k)}>{SCENE_ICON[k]} {n}</button>
            ))}
          </div>
        </div>

        <div className="pp-blk">
          <div className="pp-h">家里的墙纸 <small>只有在家的时候看得到</small></div>
          <div className="pp-chips">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} type="button" className={`pp-chip${draft.home_theme === k ? ' on' : ''}`} onClick={() => onTheme(k)}>{t.n}</button>
            ))}
          </div>
        </div>

        <div className="pp-blk">
          <div className="pp-h">作息 <small>其余时间在家，睡觉时间之后关灯</small></div>
          <div className="pp-sched">
            <label>起床 <select className="pp-sel" value={draft.wake_h} onChange={(e) => set('wake_h', +e.target.value)}>{hourOptions()}</select></label>
            <label>上班 <select className="pp-sel" value={draft.work_h} onChange={(e) => set('work_h', +e.target.value)}>{hourOptions()}</select></label>
            <label>下班 <select className="pp-sel" value={draft.off_h} onChange={(e) => set('off_h', +e.target.value)}>{hourOptions()}</select></label>
            <label>睡觉 <select className="pp-sel" value={draft.sleep_h} onChange={(e) => set('sleep_h', +e.target.value)}>{hourOptions()}</select></label>
          </div>
        </div>

        <div className="pp-blk">
          <div className="pp-h">今天的 3 个互动按钮 <small>TA 点了以后，{name}会根据场景回应</small></div>
          <div className="pp-edits">
            {draft.buttons.map((b, i) => (
              <div className="pp-edit" key={i}>
                <input className="pp-in c" type="text" value={b.e} onChange={(e) => setBtn(i, 'e', e.target.value)} aria-label={`第 ${i + 1} 个按钮的图标`} />
                <input className="pp-in" type="text" value={b.t} onChange={(e) => setBtn(i, 't', e.target.value)} placeholder="按钮文字（8 个字以内）" aria-label={`第 ${i + 1} 个按钮的文字`} />
              </div>
            ))}
          </div>
          <p className="pp-hint">图标或文字留空，保存时会换回默认的。</p>
        </div>

        <div className="pp-blk">
          <div className="pp-h">下班结算 <small>{settleNote}</small></div>
          <p className="pp-hint" style={{ margin: '0 0 8px' }}>下班后打开小屋，会自动结算当天的工资，每天一次。按现在的作息：上 {income.hours} 小时班 = ¥{income.base}，心情不低于 70 再加 ¥{income.bonus}。</p>
          <div className="pp-chips"><button type="button" className="pp-chip" onClick={onReplay}>🎬 回放下班庆祝（不发钱）</button></div>
        </div>

        <div className="pp-blk">
          <div className="pp-h">预览时间 <small>只在你这台手机上看效果，不会保存</small></div>
          <div className="pp-time">
            <input type="range" min="0" max="23.75" step="0.25" value={sim == null ? hr : sim} onChange={(e) => setSim(+e.target.value)} aria-label="预览时间" />
            <b>{fmtHour(sim == null ? hr : sim)}</b>
            <button type="button" className={`pp-chip${sim == null ? ' on' : ''}`} onClick={() => setSim(null)}>实时</button>
          </div>
        </div>

        <div className="pp-actions">
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
    setDraft((d) => (d == null || same(d, old) ? myPal.settings : d))
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
  const dirty = !!draft && !same(draft, myPal.settings)
  const est = estimateIncome(shownDraft, 0)
  const settledToday = !!(myPal.raw && myPal.raw.settled_day === localDay())
  const settleNote = settledToday ? '今天已结算 ✓' : real >= myPal.settings.off_h ? '今天还没结算' : '下班后自动结算'
  live.current = { tab, hr, mySlot, taSlot, myId: me && me.id, mySettings: myPal.settings, taSettings: taPal.settings }

  // TA 对我的小人做了什么：我正好在看自己的小屋，小人就当场反应；不在看就只进日记
  const onLogInsert = useCallback((row) => {
    const L = live.current
    if (!PLAY_KINDS.includes(row.kind)) return
    if (row.owner_id !== L.myId || row.actor_id === L.myId) return
    if (L.tab !== 'mine' || !myConsole.current) return
    myConsole.current.play(reactionFor(L.mySlot, stateOf(L.mySettings, L.hr), row.kind, row.data))
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
    if (taConsole.current) taConsole.current.play(reactionFor(L.taSlot, stateOf(L.taSettings, L.hr), kind, data))
    myPal.reload()
    taPal.reload()
    return true
  }

  const onSave = async () => {
    if (!me || !draft) return
    const clean = { ...draft, buttons: normalizeButtons(draft.buttons, mySlot) }
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

  // 套预设：只改草稿，小人马上预览，保存了才算数
  const onPreset = (p) => {
    setDraft((d) => applyPreset(d || myPal.settings, p))
    say(`套上了「${p.n}」，看看预览，满意就保存`)
  }

  // 把现在看到的整套（含还没保存的草稿）存成「我的预设」
  const onSavePreset = async (emoji, rawName) => {
    const name = cleanLabel(rawName)
    if (!name) { say('先给这套起个名字（8 个字以内）'); return false }
    const clean = { ...shownDraft, buttons: normalizeButtons(shownDraft.buttons, mySlot) }
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
    if (stateOf(next, hr) === 'home') return
    const h = homeHour(next)
    if (h == null) return
    setSim(h)
    say(`墙纸只在家里看得到，预览时间先拨到 ${fmtHour(h)}`)
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

      {err && <div className="pp-err">{err}</div>}

      {tab === 'mine' ? (
        <>
          <Console ref={myConsole} key={`me-${mySlot}`} slot={mySlot} name={myName} settings={shownDraft} state={myPal.state} hr={hr} mine preview={dirty} />
          <Planner
            name={myName}
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
            settleNote={settleNote}
            income={{ hours: est.hours, base: est.base, bonus: INCOME.moodBonus }}
          />
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
            onA={() => onAct('poke', () => palPoke(partner.id), {})}
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
        />
      )}
    </main>
  )
}