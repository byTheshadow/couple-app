import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Svg } from './Icon'
import { useTheme } from '../lib/theme'
import MilkTeaTicket from './MilkTeaTicket'
import { createMilkTeaScene } from './milktea/scene'
import {
  SIZES, TEAS, SWEETS, MILKS, TOPPINGS, STRAWS, STRAW_NAMES,
  MAX_TOPS, MAX_NOTE, SHAKES_NEEDED,
  priceOf, makeTitle, newOrderNo, computeEta, hexCss,
} from './milktea/menu'
import './milktea.css'

/* ===========================================================================
   奶茶店：做一杯奶茶 → 写一张小票 → 当一封信寄给 TA
   - 3D 场景在 milktea/scene.js（这个页面只管流程和界面）
   - 小票在 MilkTeaTicket.jsx，寄出前的预览和 TA 拆信用的是同一个组件
   - 寄出走 send_letter，kind = 'milktea'，点单内容放在 payload（形状见 milktea/menu.js）
   用法：<MilkTea onExit={(message) => ...} />
   做到一半的奶茶存不下来（3D 过程没法存档），所以离开前一律先问一句。
   =========================================================================== */

const STEPS = ['size', 'tea', 'sweet', 'milk', 'topping', 'shake', 'seal', 'straw', 'ticket']
const LABEL = { size: '选杯', tea: '茶底', sweet: '甜度', milk: '加奶', topping: '小料', shake: '摇匀', seal: '封口', straw: '吸管', ticket: '小票' }
const EMPTY = { size: 'mid', tea: null, sweet: null, milk: null, tops: [], shakes: 0, straw: null }
const REL = [{ min: 30, label: '30 分钟后' }, { min: 60, label: '1 小时后' }, { min: 120, label: '2 小时后' }]
const MAX_JSON = 120000

const pad2 = (n) => String(n).padStart(2, '0')
const hhmm = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }

const mapError = (e) => {
  const m = e?.message || ''
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '服务端没找到 send_letter 函数，先检查 Supabase 里的 SQL'
  if (m.includes('bad kind') || /check constraint/i.test(m)) return '服务端还不认奶茶这种信，要先把奶茶的 SQL 跑一下'
  if (m.includes('no partner')) return '还没有另一半的账号'
  return `没寄出去：${m}`
}

export default function MilkTea({ onExit }) {
  const { theme } = useTheme()
  const hostRef = useRef(null)
  const panelRef = useRef(null)
  const stepsRef = useRef(null)
  const scRef = useRef(null)
  const busyRef = useRef(false)
  const pickRef = useRef(() => {})
  const toastT = useRef(0)
  const awayT = useRef(0)
  const nightInit = useRef(theme === 'dark')

  const [fail, setFail] = useState(false) // 这台设备开不了 WebGL
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState('size')
  const [order, setOrder] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [night, setNight] = useState(theme === 'dark')
  const [sheet, setSheet] = useState(null) // null | 'exit' | 'redo'
  const [note, setNote] = useState('')
  const [etaChoice, setEtaChoice] = useState({ mode: 'rel', min: 60 })
  const [absTime, setAbsTime] = useState('')
  const [snap, setSnap] = useState('')
  const [orderNo, setOrderNo] = useState(newOrderNo)
  const [placedAt, setPlacedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const [away, setAway] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2600)
  }, [])

  /* ---------- 3D 场景：进页面建，离开页面必须拆 ---------- */
  useEffect(() => {
    let sc = null
    try {
      sc = createMilkTeaScene(hostRef.current, { night: nightInit.current, onPick: (id) => pickRef.current(id) })
    } catch (e) {
      setFail(true)
      return undefined
    }
    scRef.current = sc
    setReady(true)
    return () => {
      sc.dispose()
      scRef.current = null
      clearTimeout(toastT.current)
      clearTimeout(awayT.current)
    }
  }, [])

  // 昼夜：默认跟着 app 的明暗主题，也可以手动切
  useEffect(() => { setNight(theme === 'dark') }, [theme])
  useEffect(() => { if (scRef.current) scRef.current.setNight(night) }, [night, ready])

  // 镜头跟着步骤走；只有「小料」这一步、没在忙、还没加满的时候，才允许直接点台面上的料桶
  useEffect(() => { if (scRef.current) scRef.current.setStep(step) }, [step, ready])
  useEffect(() => {
    if (scRef.current) scRef.current.setPickable(step === 'topping' && !busy && order.tops.length < MAX_TOPS)
  }, [step, busy, order.tops.length, ready])

  // 把杯子顶到「底部面板上方」那块可见区域的中间
  useEffect(() => {
    const sc = scRef.current
    const p = panelRef.current
    if (!sc) return undefined
    if (!p || step === 'ticket') { sc.setInset(0); return undefined }
    const update = () => sc.setInset(p.getBoundingClientRect().height + 16)
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(update)
    ro.observe(p)
    return () => ro.disconnect()
  }, [ready, step])

  // 顶部步骤条：当前这一步自动滚到中间
  useEffect(() => {
    const box = stepsRef.current
    const on = box && box.querySelector('.on')
    if (!box || !on) return
    box.scrollTo({ left: on.offsetLeft - box.clientWidth / 2 + on.clientWidth / 2, behavior: 'smooth' })
  }, [step])

  // 小票页：预计送达的相对时间（"1 小时后"）每隔一会儿刷新一次
  useEffect(() => {
    if (step !== 'ticket') return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 20000)
    return () => clearInterval(id)
  }, [step])

  /* ---------- 动作：一次只做一件事，做完才能点下一个 ---------- */
  const run = (fn) => {
    const sc = scRef.current
    if (!sc || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    fn(sc, () => { busyRef.current = false; setBusy(false) })
  }

  const chooseSize = (id) => {
    if (busyRef.current || order.tea) return
    setOrder((o) => ({ ...o, size: id }))
    if (scRef.current) scRef.current.buildCup(id)
  }
  const chooseTea = (id) => {
    if (order.tea) return
    run((sc, done) => { setOrder((o) => ({ ...o, tea: id })); sc.pourTea(id, done) })
  }
  const chooseSweet = (id) => {
    if (order.sweet) return
    run((sc, done) => { setOrder((o) => ({ ...o, sweet: id })); sc.pourSweet(id, done) })
  }
  const chooseMilk = (id) => {
    if (order.milk) return
    run((sc, done) => { setOrder((o) => ({ ...o, milk: id })); sc.pourMilk(id, done) })
  }
  const pickTopping = (id) => {
    if (step !== 'topping' || order.tops.length >= MAX_TOPS) return
    run((sc, done) => { setOrder((o) => ({ ...o, tops: [...o.tops, id] })); sc.addTopping(id, done) })
  }
  pickRef.current = pickTopping // 3D 场景里点料桶时调用最新的这一版

  const doShake = () => {
    if (order.shakes >= SHAKES_NEEDED) return
    run((sc, done) => { setOrder((o) => ({ ...o, shakes: o.shakes + 1 })); sc.shake(done) })
  }
  const doSeal = () => run((sc, done) => sc.seal(() => { done(); setStep('straw') }))

  // 吸管插好：拍一张杯子的小图贴在小票上，转一圈，进入写小票
  const finishCup = (sc) => {
    let url = ''
    try { url = sc.snapshot() } catch (e) { url = '' }
    setSnap(url)
    setPlacedAt(Date.now())
    setNow(Date.now())
    sc.celebrate()
    setStep('ticket')
  }
  const pickStraw = (i) => run((sc, done) => {
    setOrder((o) => ({ ...o, straw: i }))
    sc.addStraw(i, () => { done(); finishCup(sc) })
  })

  const next = () => {
    const i = STEPS.indexOf(step)
    if (i >= 0 && i < STEPS.length - 1) setStep(STEPS[i + 1])
  }

  /* ---------- 重做 / 离开 ---------- */
  const hasProgress = step !== 'size' || order.size !== 'mid'

  const restart = () => {
    const sc = scRef.current
    if (sc) { sc.reset('mid'); sc.setStep('size') }
    busyRef.current = false
    setBusy(false)
    setOrder(EMPTY)
    setStep('size')
    setNote('')
    setEtaChoice({ mode: 'rel', min: 60 })
    setAbsTime('')
    setSnap('')
    setOrderNo(newOrderNo())
    setErr('')
    setSheet(null)
  }
  const goBack = () => {
    if (!hasProgress) { if (onExit) onExit(); return }
    setSheet('exit')
  }
  const askRedo = () => { if (hasProgress) setSheet('redo'); else say('这杯还没开始做') }

  /* ---------- 小票 / 寄出 ---------- */
  const choice = etaChoice.mode === 'abs' ? { mode: 'abs', hhmm: absTime } : etaChoice
  const etaDate = computeEta(choice, now)
  const price = priceOf(order)

  const previewPayload = {
    v: 1, shop: 'US', no: orderNo, at: new Date(placedAt).toISOString(),
    size: order.size, tea: order.tea, sweet: order.sweet, milk: order.milk, tops: order.tops,
    shakes: order.shakes, straw: order.straw, note: note.trim(),
    eta: etaDate ? etaDate.toISOString() : null, price, snap,
  }

  const pickEta = (c) => {
    if (c.mode === 'abs' && !absTime) setAbsTime(hhmm(Date.now() + 3600000))
    setEtaChoice(c)
    setNow(Date.now())
  }

  const doSend = async () => {
    if (sending || away) return
    const eta = computeEta(choice, Date.now())
    if (!eta) { setErr('选一个送到的时间'); return }
    const payload = { ...previewPayload, at: new Date().toISOString(), eta: eta.toISOString() }
    if (JSON.stringify(payload).length > MAX_JSON) { setErr('这张小票太大了，把留言写短一点再试'); return }
    setSending(true)
    setErr('')
    const { error } = await supabase.rpc('send_letter', {
      p_kind: 'milktea',
      p_title: makeTitle(order),
      p_body: note.trim() || '一杯奶茶', // 服务端不一定允许空正文，没写留言就放一句默认的
      p_payload: payload,
    })
    if (error) { setSending(false); setErr(mapError(error)); return }
    try { navigator.vibrate?.([30, 60, 30]) } catch (e) { /* iOS 不支持 */ }
    setAway(true)
    awayT.current = setTimeout(() => { if (onExit) onExit('奶茶小票已寄出，TA 会收到一个信封') }, 800)
  }

  /* ---------- 底部面板：每一步显示什么 ---------- */
  const chip = (key, label, o = {}) => (
    <button
      key={key}
      type="button"
      className={`mt-op${o.on ? ' on' : ''}${o.wide ? ' wide' : ''}`}
      disabled={o.disabled}
      onClick={o.onClick}
      aria-pressed={o.on || undefined}
    >
      {o.swatch && <span className="sw" style={{ background: o.swatch }} />}
      {label}
      {o.extra && <em>{o.extra}</em>}
    </button>
  )

  let view = { title: '', tip: '', chips: [], main: null, meter: false }
  if (step === 'size') {
    view = {
      title: '① 选个杯型', tip: '大杯多 3 块，装得下更多料',
      chips: Object.values(SIZES).map((d) => chip(d.id, d.label, { on: order.size === d.id, disabled: busy, extra: d.price ? `+¥${d.price}` : '', onClick: () => chooseSize(d.id) })),
      main: { label: '下一步', onClick: next },
    }
  } else if (step === 'tea') {
    view = {
      title: '② 倒茶底', tip: order.tea ? '倒好啦，想换就点右上角重做' : '点一种茶，壶会自己过来',
      chips: TEAS.map((t) => chip(t.id, t.name, { on: order.tea === t.id, disabled: busy || !!order.tea, swatch: hexCss(t.color), onClick: () => chooseTea(t.id) })),
      main: { label: '下一步', disabled: !order.tea || busy, onClick: next },
    }
  } else if (step === 'sweet') {
    view = {
      title: '③ 甜度', tip: order.sweet ? '糖浆加好了' : '越甜糖浆倒得越久',
      chips: SWEETS.map((s) => chip(s.id, s.name, { on: order.sweet === s.id, disabled: busy || !!order.sweet, extra: `${s.pct}%`, onClick: () => chooseSweet(s.id) })),
      main: { label: '下一步', disabled: !order.sweet || busy, onClick: next },
    }
  } else if (step === 'milk') {
    view = {
      title: '④ 加奶', tip: '奶盖会浮在最上面一层',
      chips: MILKS.map((m) => chip(m.id, m.name, { on: order.milk === m.id, disabled: busy || !!order.milk, swatch: m.color ? hexCss(m.color) : '#8c8c94', extra: m.price ? `+¥${m.price}` : '', onClick: () => chooseMilk(m.id) })),
      main: { label: '下一步', disabled: !order.milk || busy, onClick: next },
    }
  } else if (step === 'topping') {
    view = {
      title: '⑤ 加小料', tip: `直接点台面上的料桶也行 · ${order.tops.length}/${MAX_TOPS}`,
      chips: TOPPINGS.map((t) => {
        const n = order.tops.filter((x) => x === t.id).length
        return chip(t.id, t.name + (n ? ` ×${n}` : ''), { on: n > 0, disabled: busy || order.tops.length >= MAX_TOPS, swatch: t.css, extra: `+¥${t.price}`, onClick: () => pickTopping(t.id) })
      }),
      main: { label: order.tops.length ? '加好了' : '不加料，直接走', disabled: busy, onClick: next },
    }
  } else if (step === 'shake') {
    view = {
      title: '⑥ 摇匀', tip: `连点 ${SHAKES_NEEDED} 下，把料摇起来`, meter: true,
      chips: [chip('shake', `摇一摇 (${order.shakes}/${SHAKES_NEEDED})`, { wide: true, disabled: busy || order.shakes >= SHAKES_NEEDED, onClick: doShake })],
      main: { label: '下一步', disabled: order.shakes < SHAKES_NEEDED || busy, onClick: next },
    }
  } else if (step === 'seal') {
    view = {
      title: '⑦ 封口', tip: '把杯子推进封口机压一张膜',
      chips: [chip('seal', '推进封口机', { wide: true, disabled: busy, onClick: doSeal })],
    }
  } else if (step === 'straw') {
    view = {
      title: '⑧ 插吸管', tip: '挑个颜色，一戳到底',
      chips: STRAWS.map((c, i) => chip(c, STRAW_NAMES[i].slice(0, 1), { on: order.straw === i, disabled: busy, swatch: c, onClick: () => pickStraw(i) })),
    }
  }

  const cur = STEPS.indexOf(step)

  /* ---------- 界面 ---------- */
  return (
    <div className="mt-root">
      <div className="mt-stage" ref={hostRef} />
      <div className="mt-vig" />
      <div className={`mt-load${ready || fail ? ' gone' : ''}`}><i /></div>
      {toast && <div className="toast glass">{toast}</div>}

      <div className="mt-ui">
        <div className="mt-top">
          <button type="button" className="glass icon-btn tap" onClick={goBack} aria-label="返回小物"><Svg name="back" size={20} /></button>
          <div className="mt-steps glass" ref={stepsRef}>
            {STEPS.map((s, i) => (
              <span key={s} className={`mt-sp${s === step ? ' on' : i < cur ? ' done' : ''}`}><i />{LABEL[s]}</span>
            ))}
          </div>
          <button type="button" className="glass icon-btn tap" onClick={() => setNight((n) => !n)} aria-label="切换昼夜"><Svg name={night ? 'sun' : 'moon'} size={20} /></button>
          <button type="button" className="glass icon-btn tap" onClick={askRedo} aria-label="重做这一杯"><Svg name="undo" size={20} /></button>
        </div>

        {fail && (
          <section className="win mt-panel">
            <header className="tb"><Svg name="cup" size={14} /><b>奶茶店.exe</b><span className="grow" /><span className="ctl"><i>–</i><i>□</i><i>×</i></span></header>
            <div className="wb mt-wb">
              <div className="mt-ptitle"><b>这台设备打不开 3D 场景</b></div>
              <div className="h-sub">奶茶店要用到 WebGL，换个浏览器，或者在系统设置里打开硬件加速再试试。</div>
              <button type="button" className="btn" onClick={() => { if (onExit) onExit() }}>返回小物</button>
            </div>
          </section>
        )}

        {!fail && step !== 'ticket' && (
          <section className={`win mt-panel${busy ? ' busy' : ''}`} ref={panelRef}>
            <header className="tb">
              <Svg name="cup" size={14} />
              <b>点单.exe</b>
              <span className="grow" />
              <span className="mono">STEP {cur + 1}/{STEPS.length - 1}</span>
              <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
            </header>
            <div className="wb mt-wb">
              <div className="mt-ptitle"><b>{view.title}</b><span>{view.tip}</span></div>
              <div className="mt-opts">{view.chips}</div>
              {view.meter && <div className="mt-meter"><i style={{ width: `${(order.shakes / SHAKES_NEEDED) * 100}%` }} /></div>}
              {view.main && (
                <button type="button" className="btn" disabled={view.main.disabled} onClick={view.main.onClick}>{view.main.label}</button>
              )}
            </div>
            <footer className="wf"><span>合计 ¥{price}</span><span>{busy ? '制作中…' : '轮到你了'}</span></footer>
          </section>
        )}
      </div>

      {step === 'ticket' && (
        <div className="mt-tl">
          <div className="mt-tl-in">
            <div className={`mt-tkwrap${away ? ' away' : ''}`}>
              <MilkTeaTicket payload={previewPayload} mode="preview" />
            </div>

            <div className="mt-form glass">
              <div className="mt-lab">写句话给 TA（可选）</div>
              <textarea
                className="field"
                rows={2}
                maxLength={MAX_NOTE}
                value={note}
                disabled={sending || away}
                onChange={(e) => setNote(e.target.value)}
                placeholder="比如：今天辛苦啦，我带着奶茶来找你"
              />
              <div className="mt-cnt">{note.length}/{MAX_NOTE}</div>

              <div className="mt-lab">几点给 TA 带到</div>
              <div className="mt-opts">
                {REL.map((r) => chip(`r${r.min}`, r.label, {
                  on: etaChoice.mode === 'rel' && etaChoice.min === r.min,
                  disabled: sending || away,
                  onClick: () => pickEta({ mode: 'rel', min: r.min }),
                }))}
                {chip('abs', '自选时间', { on: etaChoice.mode === 'abs', disabled: sending || away, onClick: () => pickEta({ mode: 'abs' }) })}
              </div>
              {etaChoice.mode === 'abs' && (
                <input
                  className="field mt-time"
                  type="time"
                  value={absTime}
                  disabled={sending || away}
                  onChange={(e) => { setAbsTime(e.target.value); setNow(Date.now()) }}
                />
              )}

              {err && <div className="mt-err">{err}</div>}
              <div className="row mt-send">
                <button type="button" className="btn ghost" onClick={() => setSheet('exit')} disabled={sending || away}>先不寄了</button>
                <button type="button" className="btn send" onClick={doSend} disabled={sending || away}>
                  <Svg name="send" size={17} />{sending ? '寄出中…' : '寄给 TA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <div className="overlay" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {sheet === 'exit' ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 650 }}>这杯奶茶还没寄出</div>
                <div className="h-sub">做到一半的奶茶存不下来，现在离开，下次要重新做。</div>
                <button type="button" className="btn ghost danger" onClick={() => { setSheet(null); if (onExit) onExit('已放弃这杯') }}><Svg name="trash" size={17} />离开，不要了</button>
                <button type="button" className="btn" onClick={() => setSheet(null)}>继续做</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 650 }}>重做这一杯？</div>
                <div className="h-sub">现在这杯会被倒掉，从选杯重新开始。</div>
                <button type="button" className="btn ghost danger" onClick={restart}><Svg name="undo" size={17} />倒掉重做</button>
                <button type="button" className="btn" onClick={() => setSheet(null)}>继续做</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}