import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Svg } from './Icon'
import { useTheme } from '../lib/theme'
import { createCrystalScene } from './crystal/scene'
import { createSoundBox } from './crystal/sound'
import { listShelf, saveToShelf, removeFromShelf } from './crystal/shelf'
import {
  ENVS, FALLS, BASES, SOUNDS, ITEMS, ITEM_OF, PRESETS, DEFAULT_GLOBE,
  MAX_ITEMS, MAX_NOTE, MAX_SHELF, MAX_JSON,
  normalizeGlobe, normalizePayload, makeTitle, makeBody, describe, cleanNote,
} from './crystal/data'
import './crystal.css'

/* ===========================================================================
   水晶球：摆一颗球 → 收进摆件架，或者当一封信寄给 TA
   - 3D 场景在 crystal/scene.js，摆件在 crystal/items.js，音色在 crystal/sound.js（这个页面只管流程和界面）
   - 摆件架存在 Supabase 的 crystal_shelf 表（crystal/shelf.js）；做到一半的球自动存本机草稿，下次进来接着摆
   - 寄出走 send_letter，kind = 'crystal'，payload = { v: 1, globe, thumb }（形状见 crystal/data.js）
   用法：<Crystal onExit={(message) => ...} incoming={信里的 payload（可选，打开 TA 寄来的球）} />
   =========================================================================== */

export const CRYSTAL_DRAFT_KEY = 'us.crystal.draft'

const TABS = [
  { id: 'env', name: '景色' },
  { id: 'item', name: '摆件' },
  { id: 'fall', name: '飘落' },
  { id: 'sound', name: '音色' },
  { id: 'shelf', name: '摆件架' },
]
const FOOT = {
  env: '景色决定天光和地面，底座上会刻你写的那句话',
  item: '点一下放进球里；点球里的摆件可以拖着挪位置',
  fall: '换一种就会重新摇一次；萤火会自己飘，气泡往上走',
  sound: '声音是现场合成的，没有音频文件，能一直循环',
  shelf: '收起来的球，睡前随时能打开再看一次',
}
const TIMERS = [[0, '不限'], [15, '15 分'], [30, '30 分'], [60, '60 分']]

const pad2 = (n) => String(n).padStart(2, '0')
const len = (s) => Array.from(s || '').length

const mapError = (e) => {
  const m = e?.message || ''
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '服务端没找到 send_letter 函数，先检查 Supabase 里的 SQL'
  if (m.includes('bad kind') || /check constraint/i.test(m)) return '服务端还不认水晶球这种信，要先把水晶球的 SQL 跑一下'
  if (m.includes('no partner')) return '还没有另一半的账号'
  return `没寄出去：${m}`
}

// 进页面时用哪颗球：TA 寄来的 > 本机草稿 > 默认
function loadBoot(incoming) {
  const p = incoming ? normalizePayload(incoming) : null
  if (p) return { globe: p.globe, fromTA: true }
  try {
    const raw = localStorage.getItem(CRYSTAL_DRAFT_KEY)
    const g = raw ? normalizeGlobe(JSON.parse(raw)) : null
    if (g) return { globe: g, fromTA: false }
  } catch { /* 草稿坏了就当没有 */ }
  return { globe: null, fromTA: false }
}

function Cell({ on, em, name, onClick }) {
  return (
    <button type="button" className={`cr-cell${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on || undefined}>
      <span className="em">{em}</span>
      <span>{name}</span>
    </button>
  )
}

export default function Crystal({ onExit, incoming }) {
  const { toggle } = useTheme()
  const rootRef = useRef(null)
  const hostRef = useRef(null)
  const panelRef = useRef(null)
  const scRef = useRef(null)
  const sbRef = useRef(null)
  const aliveRef = useRef(true)
  const dirtyRef = useRef(false)
  const syncRaf = useRef(0)
  const draftT = useRef(0)
  const toastT = useRef(0)
  const hintT = useRef(0)
  const awayT = useRef(0)
  const boot = useRef(null)
  if (boot.current === null) boot.current = loadBoot(incoming)

  const [fail, setFail] = useState(false) // 这台设备开不了 WebGL
  const [ready, setReady] = useState(false)
  const [g, setG] = useState(() => boot.current.globe || DEFAULT_GLOBE())
  const [noteText, setNoteText] = useState(() => (boot.current.globe ? boot.current.globe.note : ''))
  const [tab, setTab] = useState('env')
  const [sel, setSel] = useState(null)
  const [vol, setVol] = useState(60)
  const [timerMin, setTimerMin] = useState(0)
  const [sleeping, setSleeping] = useState(false)
  const [clock, setClock] = useState('')
  const [toast, setToast] = useState('')
  const [hintMsg, setHintMsg] = useState('')
  const [shelf, setShelf] = useState({ loading: false, loaded: false, rows: [], error: '' })
  const [saving, setSaving] = useState(false)
  const [delId, setDelId] = useState('')
  const [sheet, setSheet] = useState(false)
  const [snap, setSnap] = useState('')
  const [sending, setSending] = useState(false)
  const [away, setAway] = useState(false)
  const [err, setErr] = useState('')

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2600)
  }, [])
  const hint = useCallback((t) => {
    setHintMsg(t)
    clearTimeout(hintT.current)
    hintT.current = setTimeout(() => setHintMsg(''), 2600)
  }, [])

  /* ---------- 草稿：改动后停 0.7 秒存一次；离开 / 切后台时立刻存 ---------- */
  const flushDraft = useCallback(() => {
    clearTimeout(draftT.current)
    const sc = scRef.current
    if (!sc || !dirtyRef.current || boot.current.fromTA) return
    dirtyRef.current = false
    try { localStorage.setItem(CRYSTAL_DRAFT_KEY, JSON.stringify(sc.getData())) } catch { /* 存不下就算了 */ }
  }, [])

  // 球的内容变了：界面同步（拖摆件时每帧都会来，所以合并到下一帧）+ 排一次草稿
  const touch = useCallback(() => {
    dirtyRef.current = true
    if (!syncRaf.current) {
      syncRaf.current = requestAnimationFrame(() => {
        syncRaf.current = 0
        if (scRef.current) setG(scRef.current.getData())
      })
    }
    clearTimeout(draftT.current)
    draftT.current = setTimeout(flushDraft, 700)
  }, [flushDraft])

  const onSelect = useCallback((i) => setSel(i < 0 ? null : i), [])

  /* ---------- 3D 场景：进页面建，离开页面必须拆 ---------- */
  useEffect(() => {
    aliveRef.current = true
    let sc = null
    try {
      sc = createCrystalScene(hostRef.current, { onSelect, onChange: touch })
    } catch (e) {
      setFail(true)
      return undefined
    }
    scRef.current = sc
    sbRef.current = createSoundBox()
    if (boot.current.globe) sc.apply(boot.current.globe)
    setG(sc.getData())
    setReady(true)

    const onHide = () => { if (document.hidden) flushDraft() }
    window.addEventListener('pagehide', flushDraft)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      aliveRef.current = false
      window.removeEventListener('pagehide', flushDraft)
      document.removeEventListener('visibilitychange', onHide)
      flushDraft()
      cancelAnimationFrame(syncRaf.current)
      syncRaf.current = 0
      clearTimeout(toastT.current)
      clearTimeout(hintT.current)
      clearTimeout(awayT.current)
      if (sbRef.current) sbRef.current.destroy()
      sbRef.current = null
      sc.dispose()
      scRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 进来先提示一下玩法（TA 寄来的球提示不一样）
  useEffect(() => {
    if (!ready) return undefined
    const id = setTimeout(() => hint(boot.current.fromTA ? 'TA 寄来的球 · 喜欢就收进摆件架' : '拖动转一圈，点球里的摆件可以挪位置'), 900)
    return () => clearTimeout(id)
  }, [ready, hint])

  useEffect(() => { if (sbRef.current) sbRef.current.setVolume(vol / 100) }, [vol, ready])

  // 把球顶到「底部面板上方」那块可见区域的中间；助眠时面板收起，球回到正中
  useEffect(() => {
    const sc = scRef.current
    const p = panelRef.current
    const root = rootRef.current
    if (!sc) return undefined
    if (!p || sleeping) {
      sc.setInset(0)
      if (root) root.style.setProperty('--cr-panel', '0px')
      return undefined
    }
    const update = () => {
      const h = p.getBoundingClientRect().height
      sc.setInset(h + 16)
      if (root) root.style.setProperty('--cr-panel', `${h}px`)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(update)
    ro.observe(p)
    return () => ro.disconnect()
  }, [ready, sleeping, fail])

  // 助眠时的时钟
  useEffect(() => {
    if (!sleeping) return undefined
    const tick = () => { const d = new Date(); setClock(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sleeping])

  /* ---------- 摆件架：第一次打开这一页才去服务器拿 ---------- */
  const refreshShelf = useCallback(async () => {
    setShelf((s) => ({ ...s, loading: true, error: '' }))
    const { rows, error } = await listShelf()
    if (!aliveRef.current) return
    setShelf({ loading: false, loaded: !error, rows, error: error || '' })
  }, [])
  useEffect(() => {
    if (tab === 'shelf' && !shelf.loaded && !shelf.loading) refreshShelf()
  }, [tab, shelf.loaded, shelf.loading, refreshShelf])

  /* ---------- 动作 ---------- */
  const S = () => scRef.current

  const pickSound = (id) => {
    const sc = S()
    const sb = sbRef.current
    if (!sc || !sb) return
    sc.setSound(id)
    sb.play(id)
    sb.fade(timerMin)
  }
  const pickTimer = (m) => {
    setTimerMin(m)
    if (sbRef.current) sbRef.current.fade(m)
    say(m ? `${m} 分钟后会慢慢变轻` : '不自动停了')
  }
  const addItem = (t) => {
    const sc = S()
    if (!sc) return
    if (sc.addItem(t) < 0) { say(`最多放 ${MAX_ITEMS} 件，再多就挤了`); return }
    hint('拖着它挪位置')
  }
  const nudge = (key, d) => {
    const sc = S()
    if (!sc || sel == null) return
    const it = sc.getData().items[sel]
    if (!it) return
    sc.patchItem(sel, { [key]: (it[key] == null ? (key === 's' ? 1 : 0) : it[key]) + d })
  }
  const removeSel = () => { const sc = S(); if (sc && sel != null) sc.removeItem(sel) }

  const onNote = (e) => {
    const v = Array.from(e.target.value).slice(0, MAX_NOTE).join('')
    setNoteText(v)
    if (S()) S().setNote(v)
  }

  const setSleep = (on) => {
    setSleeping(on)
    const sc = S()
    if (sc) { sc.setSleep(on); sc.setEditable(!on) }
    if (on) setHintMsg('')
  }

  const openGlobe = (name, globe) => {
    const sc = S()
    if (!sc) return
    sc.apply(globe)
    setG(sc.getData())
    setNoteText(globe.note || '')
    boot.current.fromTA = false // 从摆件架拿出来的球，从这一刻起算是自己的，改动照常存草稿
    touch()
    if (sbRef.current) { sbRef.current.play(globe.sound); sbRef.current.fade(timerMin) }
    say(`打开了「${name}」`)
  }

  const doSave = async () => {
    const sc = S()
    if (!sc || saving || shelf.loading) return
    if (shelf.loaded && shelf.rows.length >= MAX_SHELF) { say('架子满了，先拿掉一个吧'); return }
    setSaving(true)
    let thumb = ''
    try { thumb = sc.snapshot(120, 150) } catch (e) { thumb = '' }
    const { row, error } = await saveToShelf({ globe: sc.getData(), thumb })
    if (!aliveRef.current) return
    setSaving(false)
    if (error) { say(error); return }
    setShelf((s) => ({ ...s, loaded: true, rows: [row, ...s.rows].slice(0, MAX_SHELF) }))
    say('收好了')
  }

  const doRemove = async (id) => {
    if (delId) return
    setDelId(id)
    const { error } = await removeFromShelf(id)
    if (!aliveRef.current) return
    setDelId('')
    if (error) { say(error); return }
    setShelf((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id) }))
  }

  /* ---------- 寄出 ---------- */
  const openSend = () => {
    const sc = S()
    if (!sc) return
    sc.select(-1)
    let url = ''
    try { url = sc.snapshot(300, 380) } catch (e) { url = '' }
    setSnap(url)
    setErr('')
    setSheet(true)
  }
  const doSend = async () => {
    const sc = S()
    if (!sc || sending || away) return
    if (!supabase) { setErr('还没有连上服务器'); return }
    const globe = sc.getData()
    const payload = { v: 1, globe, thumb: snap }
    if (JSON.stringify(payload).length > MAX_JSON) { setErr('这颗球太大了，摆件少放几个再试'); return }
    setSending(true)
    setErr('')
    const { error } = await supabase.rpc('send_letter', {
      p_kind: 'crystal',
      p_title: makeTitle(globe),
      p_body: makeBody(globe), // 服务端不一定允许空正文，没写那句话就放一句默认的
      p_payload: payload,
    })
    if (!aliveRef.current) return
    if (error) { setSending(false); setErr(mapError(error)); return }
    try { navigator.vibrate?.([30, 60, 30]) } catch (e) { /* iOS 不支持 */ }
    setAway(true)
    awayT.current = setTimeout(() => { if (onExit) onExit('水晶球已寄出，TA 会收到一个信封') }, 800)
  }

  /* ---------- 界面 ---------- */
  const snd = SOUNDS.find((x) => x.id === g.sound)
  const stateLine = `${describe(g)}${snd && snd.id !== 'none' ? ` · ${snd.name}` : ''}`
  const selItem = sel != null ? g.items[sel] : null

  const lbl = (text, right) => <div className="cr-lbl"><span>{text}</span><span>{right || ''}</span></div>

  let body = null
  if (tab === 'env') {
    body = (
      <>
        {lbl('天气与景色')}
        <div className="cr-grid">
          {ENVS.map((e) => <Cell key={e.id} on={g.env === e.id} em={e.em} name={e.name} onClick={() => S() && S().setEnv(e.id)} />)}
        </div>
        <div className="cr-sep" />
        {lbl('底座')}
        <div className="cr-grid">
          {BASES.map((x) => <Cell key={x.id} on={g.base === x.id} em={x.em} name={x.name} onClick={() => S() && S().setBase(x.id)} />)}
        </div>
      </>
    )
  } else if (tab === 'item') {
    body = (
      <>
        {lbl('放进球里', `${g.items.length}/${MAX_ITEMS}`)}
        <div className="cr-grid">
          {ITEMS.map((it) => <Cell key={it.t} on={false} em={it.em} name={it.name} onClick={() => addItem(it.t)} />)}
        </div>
        {g.items.length > 0 && (
          <>
            <div className="cr-sep" />
            <div className="cr-row">
              <button type="button" className="btn ghost" onClick={() => S() && S().clearItems()}>清空球里的摆件</button>
            </div>
          </>
        )}
      </>
    )
  } else if (tab === 'fall') {
    body = (
      <>
        {lbl('飘落物')}
        <div className="cr-grid">
          {FALLS.map((f) => <Cell key={f.id} on={g.fall === f.id} em={f.em} name={f.name} onClick={() => S() && S().setFall(f.id)} />)}
        </div>
        <div className="cr-sep" />
        <div className="cr-row">
          <button type="button" className="btn" onClick={() => S() && S().shake(1)}>摇一摇</button>
        </div>
      </>
    )
  } else if (tab === 'sound') {
    body = (
      <>
        {lbl('音色', '现场合成')}
        <div className="cr-grid">
          {SOUNDS.map((s) => <Cell key={s.id} on={g.sound === s.id} em={s.em} name={s.name} onClick={() => pickSound(s.id)} />)}
        </div>
        <div className="cr-sep" />
        {lbl('音量')}
        <div className="cr-row">
          <input type="range" min="0" max="100" value={vol} onChange={(e) => setVol(Number(e.target.value))} aria-label="音量" />
        </div>
        {lbl('多久之后自己停')}
        <div className="cr-row tight">
          {TIMERS.map(([m, n]) => (
            <button key={m} type="button" className={`cr-tab${timerMin === m ? ' on' : ''}`} onClick={() => pickTimer(m)}>{n}</button>
          ))}
        </div>
      </>
    )
  } else {
    body = (
      <>
        {lbl('写在底座上的一句话', `${len(noteText)}/${MAX_NOTE}`)}
        <textarea
          className="cr-note"
          rows={2}
          value={noteText}
          onChange={onNote}
          placeholder="晚安，今天也辛苦了"
        />
        <div className="cr-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn ghost" onClick={doSave} disabled={saving || shelf.loading}>{saving ? '收起来…' : '收进摆件架'}</button>
          <button type="button" className="btn" onClick={openSend}>寄给 TA</button>
        </div>
        <div className="cr-sep" />
        {lbl('摆件架', shelf.loaded ? `${shelf.rows.length}/${MAX_SHELF}` : '')}
        <div className="cr-shelf">
          {PRESETS.map((p) => {
            const gg = normalizeGlobe(p.g)
            return (
              <div className="cr-sh" key={p.id}>
                <div className="cr-thumb" style={{ background: (ENVS.find((e) => e.id === gg.env) || ENVS[0]).sky[1] }} />
                <div className="t"><b>{p.name}</b><small>{gg.items.length} 件 · 自带</small></div>
                <button type="button" className="cr-tab" onClick={() => openGlobe(p.name, gg)}>打开</button>
              </div>
            )
          })}
          {shelf.loading && <div className="cr-empty">正在翻架子…</div>}
          {!shelf.loading && shelf.error && (
            <div className="cr-empty">
              {shelf.error}
              <div style={{ marginTop: 8 }}><button type="button" className="cr-tab" onClick={refreshShelf}>再试一次</button></div>
            </div>
          )}
          {!shelf.loading && !shelf.error && shelf.loaded && shelf.rows.length === 0 && (
            <div className="cr-empty">架子上还没有你自己的球。摆好一个，点「收进摆件架」。</div>
          )}
          {shelf.rows.map((r) => {
            const fl = FALLS.find((f) => f.id === r.globe.fall)
            return (
              <div className="cr-sh" key={r.id}>
                {r.thumb ? <img className="cr-thumb" src={r.thumb} alt="" /> : <div className="cr-thumb" style={{ background: (ENVS.find((e) => e.id === r.globe.env) || ENVS[0]).sky[1] }} />}
                <div className="t"><b>{r.name || '水晶球'}</b><small>{r.globe.items.length} 件 · {fl ? fl.name : ''}</small></div>
                <button type="button" className="cr-tab" onClick={() => openGlobe(r.name || '水晶球', r.globe)}>打开</button>
                <button type="button" className="cr-sq warn" aria-label="从架子上拿掉" disabled={delId === r.id} onClick={() => doRemove(r.id)}>
                  <Svg name="trash" size={15} />
                </button>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <div className="cr-root" ref={rootRef}>
      <div className="cr-stage" ref={hostRef} />
      <div className={`cr-load${ready || fail ? ' gone' : ''}`}><i /></div>
      {toast && <div className="toast glass">{toast}</div>}

      <div className={`cr-ui${sleeping ? ' off' : ''}`}>
        <div className="cr-top">
          <button type="button" className="glass icon-btn tap" onClick={() => { if (onExit) onExit() }} aria-label="返回小物"><Svg name="back" size={20} /></button>
          <div className="cr-title">
            <h1>水晶球</h1>
            <div className="sub mono">{stateLine}</div>
          </div>
          <button type="button" className="glass icon-btn tap cr-glyph" onClick={() => S() && S().shake(1)} aria-label="摇一摇">✺</button>
          <button type="button" className="glass icon-btn tap cr-glyph" onClick={() => setSleep(true)} aria-label="助眠">☾</button>
          <button type="button" className="glass icon-btn tap cr-glyph" onClick={toggle} aria-label="切换明暗主题">◐</button>
        </div>

        {hintMsg && <div className="cr-hint">{hintMsg}</div>}

        {selItem && !sleeping && (
          <div className="cr-sel">
            <b>{ITEM_OF(selItem.t).name}</b>
            <span className="grow" />
            <button type="button" className="cr-sq" aria-label="向左转" onClick={() => nudge('rot', -0.42)}>↺</button>
            <button type="button" className="cr-sq" aria-label="向右转" onClick={() => nudge('rot', 0.42)}>↻</button>
            <button type="button" className="cr-sq" aria-label="缩小" onClick={() => nudge('s', -0.12)}>−</button>
            <button type="button" className="cr-sq" aria-label="放大" onClick={() => nudge('s', 0.12)}>＋</button>
            <button type="button" className="cr-sq warn" aria-label="拿走" onClick={removeSel}>✕</button>
            <button type="button" className="cr-sq" aria-label="完成" onClick={() => S() && S().select(-1)}>✓</button>
          </div>
        )}

        {fail ? (
          <section className="win cr-panel">
            <header className="tb"><Svg name="eye" size={14} /><b>水晶球.obj</b><span className="grow" /><span className="ctl"><i>–</i><i>□</i><i>×</i></span></header>
            <div className="wb cr-wb">
              <div className="cr-ptitle"><b>这台设备打不开 3D 场景</b></div>
              <div className="h-sub">水晶球要用到 WebGL，换个浏览器，或者在系统设置里打开硬件加速再试试。</div>
              <button type="button" className="btn" onClick={() => { if (onExit) onExit() }}>返回小物</button>
            </div>
          </section>
        ) : (
          <section className="win cr-panel" ref={panelRef}>
            <header className="tb">
              <Svg name="eye" size={14} />
              <b>水晶球.obj</b>
              <span className="grow" />
              <span className="mono">{g.items.length} 件</span>
              <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
            </header>
            <div className="cr-tabs">
              {TABS.map((t) => (
                <button key={t.id} type="button" className={`cr-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.name}</button>
              ))}
            </div>
            <div className="cr-body">{body}</div>
            <footer className="wf"><span>{FOOT[tab]}</span></footer>
          </section>
        )}
      </div>

      {sleeping && (
        <div className="cr-sleep" onClick={() => setSleep(false)} role="button" tabIndex={0} aria-label="轻触退出助眠">
          <div className="cr-clock mono">{clock}</div>
          <div className="cr-tip">轻触任意处退出</div>
        </div>
      )}

      {sheet && (
        <div className="overlay" onClick={() => { if (!sending && !away) setSheet(false) }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ fontSize: 18, fontWeight: 650 }}>寄给 TA</div>
            <div className={`cr-sendcard${away ? ' away' : ''}`}>
              {snap ? <img className="cr-snap" src={snap} alt="水晶球快照" /> : <div className="cr-snap cr-nosnap">没拍到小图</div>}
              <div className="h-sub" style={{ textAlign: 'center' }}>{cleanNote(g.note) ? `底座上刻着「${cleanNote(g.note)}」` : '底座上还没刻字，可以回去写一句'}</div>
            </div>
            <div className="h-sub">TA 会在信箱收到一个信封，拆开能看到这颗球，还能把它收进自己的摆件架。</div>
            {err && <div className="cr-err">{err}</div>}
            <div className="cr-row">
              <button type="button" className="btn ghost" onClick={() => setSheet(false)} disabled={sending || away}>再改改</button>
              <button type="button" className="btn send" onClick={doSend} disabled={sending || away}>
                <Svg name="send" size={17} />{sending ? '寄出中…' : '寄出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}