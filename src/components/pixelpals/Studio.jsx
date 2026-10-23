import { useEffect, useRef, useState } from 'react'
import { Svg } from '../Icon'
import { decodeLayer, paintCells } from './scenes'
import { sceneSave, sceneDelete, sceneCopy } from './store'
import SceneEditor from './SceneEditor'
import './studio.css'

/* ===========================================================================
   像素画室：自己画的场景（最多 6 个）的列表、新建 / 编辑 / 删除，以及把 TA 画的场景复制一份来用。
   画好以后，到上面「今天的安排」的「场景」页签里，就能把它选作上班地点或放空地点。
   所有保存 / 删除 / 复制都走服务端函数，服务端会再检查一遍格式和大小。
   =========================================================================== */

const MAX_SCENES = 6

// 缩略图：把背景和前景叠起来画在一张小画布上
function Thumb({ data }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || !data || !data.bmp) return
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, cv.width, cv.height)
    const bg = decodeLayer(data.bmp.bg, data.pal.length, false)
    const fg = data.bmp.fg ? decodeLayer(data.bmp.fg, data.pal.length, true) : null
    if (bg) paintCells(ctx, bg, data.pal, 2)
    if (fg) paintCells(ctx, fg, data.pal, 2)
  }, [data])
  return <canvas ref={ref} className="st-thumb" width={160} height={120} aria-hidden="true" />
}

export default function Studio({ mine, ta, taName, slot, settings, say, onDeleted }) {
  const [editing, setEditing] = useState(null) // { uuid, name, data } | null
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  const topRef = useRef(null)

  useEffect(() => {
    if (editing && topRef.current) topRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [editing])

  const full = mine.items.length >= MAX_SCENES

  const onSave = async (name, data) => {
    setSaving(true)
    const { error } = await sceneSave(editing.uuid, name, data)
    setSaving(false)
    if (error) { say(error); return }
    await mine.reload()
    setEditing(null)
    say(editing.uuid ? `「${name}」改好了` : `「${name}」存好了，到「今天的安排 → 场景」里就能选它`)
  }

  const remove = async (s) => {
    if (!window.confirm(`删掉场景「${s.name}」？\n如果正在用它，会自动换回默认的地方。`)) return
    setBusy(s.id)
    const { error } = await sceneDelete(s.uuid)
    setBusy('')
    if (error) { say(error); return }
    await mine.reload()
    if (onDeleted) onDeleted(s.id)
    say(`已删掉「${s.name}」`)
  }

  const copy = async (s) => {
    setBusy(s.id)
    const { error } = await sceneCopy(s.uuid)
    setBusy('')
    if (error) { say(error); return }
    await mine.reload()
    say(`「${s.name}」已经放进你的画室，可以直接用，也可以改成自己的样子`)
  }

  const where = (id) => (settings.work_scene === id ? '正在当上班地点' : settings.idle_scene === id ? '正在当放空地点' : '')

  return (
    <section className="win" ref={topRef}>
      <header className="tb">
        <Svg name="pen" size={14} />
        <b>像素画室.exe</b>
        <span className="grow" />
        <span className="mono">{mine.items.length}/{MAX_SCENES}</span>
        <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
      </header>
      <div className="wb">
        {editing ? (
          <SceneEditor initial={editing} slot={slot} saving={saving} onSave={onSave} onCancel={() => setEditing(null)} say={say} />
        ) : (
          <>
            <p className="pp-lead">自己画小人上班、放空的地方。画好了存起来，到上面「今天的安排 → 场景」里选它，{taName}来看的时候也能看到。</p>
            {mine.missing && <p className="pp-warn">服务端还没有画室的表，先把第七轮 B 的 SQL（pixelpals-round7b.sql）跑一下。</p>}

            <div className="pp-h">我的场景 <small>最多 {MAX_SCENES} 个</small></div>
            <div className="st-list">
              {mine.items.map((s) => (
                <div className="st-card" key={s.id}>
                  <Thumb data={s.data} />
                  <div className="st-info">
                    <b>{s.name}</b>
                    <small>{where(s.id) || '还没用上'}</small>
                    <div className="pp-chips">
                      <button type="button" className="pp-chip" disabled={!!busy} onClick={() => setEditing({ uuid: s.uuid, name: s.name, data: s.data })}>✏️ 编辑</button>
                      <button type="button" className="pp-chip" disabled={!!busy} onClick={() => remove(s)}>🗑 删除</button>
                    </div>
                  </div>
                </div>
              ))}
              {!mine.items.length && <p className="pp-hint">{mine.loading ? '正在翻画室…' : '还没有自己画的场景。'}</p>}
            </div>
            <div className="pp-chips">
              <button type="button" className="pp-chip on" disabled={full || mine.missing} onClick={() => setEditing({ uuid: null, name: '', data: null })}>＋ 画一个新场景</button>
              {full && <small className="st-note">已经满 {MAX_SCENES} 个了，先删掉一个</small>}
            </div>

            <div className="pp-h" style={{ marginTop: 14 }}>{taName}画的场景 <small>喜欢的话拿去用（复制一份给自己，不会影响{taName}的）</small></div>
            <div className="st-list">
              {ta.items.map((s) => (
                <div className="st-card" key={s.id}>
                  <Thumb data={s.data} />
                  <div className="st-info">
                    <b>{s.name}</b>
                    <div className="pp-chips">
                      <button type="button" className="pp-chip" disabled={!!busy || full} onClick={() => copy(s)}>📥 拿去用</button>
                    </div>
                  </div>
                </div>
              ))}
              {!ta.items.length && <p className="pp-hint">{taName}还没有画过场景。</p>}
            </div>
          </>
        )}
      </div>
    </section>
  )
}