import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { Svg } from './Icon'
import { usePal, usePalLog, saveSettings, palPoke } from './pixelpals/store'
import {
  W, H, CHARS, SCENES, SCENE_ICON, THEMES, GIFTS, LINES,
  createActor, stepActor, renderFrame, headTop, hearts,
  normalizeButtons, checkSchedule, cleanEmoji, cleanLabel, moodNow, fmtHour, pad2, pick, stateOf,
} from './pixelpals/art'
import { dropItem, stepDrops, drawDrops } from './pixelpals/fx'
import { PLAY_KINDS, reactionFor } from './pixelpals/voice'
import Visitor from './pixelpals/Visitor'
import Diary from './pixelpals/Diary'
import './pixelpals.css'

/* ===========================================================================
   像素小屋：两个人各有一台像素游戏机，互相能看到对方的小人在干嘛，但只能改自己的。
   第一轮：自己的安排面板（上班地点 / 墙纸 / 作息 / 三个互动按钮）+ 看 TA 的小屋。
   第二轮：去看 TA（互动按钮 / 投喂 / 送礼 / 悄悄话 / 聊天 / 戳一戳）+ 小人日记。
   第三轮：下班结算、预设、心情衰减。
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

const Console = forwardRef(function Console({ slot, name, settings, state, hr, mine, preview, onA }, ref) {
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
      if (ev.react) a.react = ev.react
      if (ev.blush) a.blushT = ev.blush
      if (ev.hearts) hearts(a, ev.hearts)
      if (ev.text) say(ev.text, ev.dur || 3.6)
    }
    if (ev.drop) dropItem(a, ev.drop, land)
    else land()
  }, [say])
  useImperativeHandle(ref, () => ({ play, say }), [play, say])

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
      renderFrame(ctx, actor, { slot: cur.slot, sp: actor.sp, settings: cur.settings, gifts: cur.state.gifts, mood }, cur.hr, now / 1000)
      drawDrops(ctx, actor)

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

function Planner({ name, draft, setDraft, dirty, saving, onSave, onReset, sim, setSim, hr }) {
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
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
          <div className="pp-h">上班地点</div>
          <div className="pp-chips">
            {Object.entries(SCENES).map(([k, n]) => (
              <button key={k} type="button" className={`pp-chip${draft.work_scene === k ? ' on' : ''}`} onClick={() => set('work_scene', k)}>{SCENE_ICON[k]} {n}</button>
            ))}
          </div>
        </div>

        <div className="pp-blk">
          <div className="pp-h">家里的墙纸</div>
          <div className="pp-chips">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} type="button" className={`pp-chip${draft.home_theme === k ? ' on' : ''}`} onClick={() => set('home_theme', k)}>{t.n}</button>
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

  const hr = sim == null ? real : sim
  const shownDraft = draft || myPal.settings
  const dirty = !!draft && !same(draft, myPal.settings)
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