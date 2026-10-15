import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePhotoComments } from '../lib/hooks'
import { Svg } from './Icon'
import './album.css'

const initial = (s) => (s || '?').trim().slice(0, 1).toUpperCase()
const pad = (n) => String(n).padStart(2, '0')
const fullTime = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const shortTime = (iso) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 全屏看图：左右滑动（电脑上用方向键 / 两侧按钮）翻页，下面是评论。
 * photos 是相册当前的完整列表，openId 是正在看的那张；翻页通过 onChange(新的 id) 通知相册。
 */
export default function PhotoModal({ photos, openId, onChange, onClose, onDelete }) {
  const { me, partner } = useAuth()
  const idx = photos.findIndex((p) => p.id === openId)
  const photo = photos[idx]
  const { comments } = usePhotoComments(photo?.id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [delBusy, setDelBusy] = useState(false)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const delTimer = useRef(null)
  const drag = useRef({ x: 0, y: 0, on: false })
  const rootRef = useRef(null)

  // 照片被删了（比如对方删的）或者列表里找不到：自动关掉
  useEffect(() => { if (!photo) onClose() }, [photo, onClose])

  // 换了一张：评论输入、编辑状态、删除确认全部重置
  useEffect(() => {
    setText(''); setEditingId(null); setConfirmDel(false); setDx(0)
    clearTimeout(delTimer.current)
  }, [openId])
  useEffect(() => () => clearTimeout(delTimer.current), [])

  // 锁住底下页面的滚动；软键盘弹出时整个看图界面缩到键盘上面，评论输入框不会被挡住
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const vv = window.visualViewport
    const root = rootRef.current
    const apply = () => {
      if (!vv || !root) return
      root.style.setProperty('--vvh', `${vv.height}px`)
      root.style.setProperty('--vvt', `${vv.offsetTop}px`)
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    return () => {
      document.body.style.overflow = prev
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
    }
  }, [])

  const go = useCallback((step) => {
    const next = photos[idx + step]
    if (next) onChange(next.id)
  }, [photos, idx, onChange])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // 提前把前后两张加载好，翻页时不用等
  useEffect(() => {
    [photos[idx - 1], photos[idx + 1]].forEach((p) => { if (p) { const im = new Image(); im.src = p.url } })
  }, [photos, idx])

  if (!photo) return null
  const mine = photo.uploader_id === me?.id
  const nameOf = (uid) => (uid === me?.id ? me?.display_name || '我' : partner?.display_name || 'TA')

  // ---------- 滑动翻页 ----------
  const down = (e) => { drag.current = { x: e.clientX, y: e.clientY, on: true }; setDragging(true) }
  const move = (e) => {
    const d = drag.current
    if (!d.on) return
    const ddx = e.clientX - d.x
    if (Math.abs(ddx) > Math.abs(e.clientY - d.y)) {
      // 已经是第一张 / 最后一张时往外拖有阻力
      const blocked = (ddx > 0 && !photos[idx - 1]) || (ddx < 0 && !photos[idx + 1])
      setDx(blocked ? ddx * 0.25 : ddx)
    }
  }
  const up = (e) => {
    const d = drag.current
    if (!d.on) return
    drag.current.on = false
    setDragging(false)
    const ddx = e.clientX - d.x
    const ddy = e.clientY - d.y
    setDx(0)
    if (Math.abs(ddx) > 60 && Math.abs(ddx) > Math.abs(ddy)) go(ddx < 0 ? 1 : -1)
  }

  // ---------- 删除：先点一下变红，2.6 秒内再点一次才真的删 ----------
  const tapDelete = () => {
    if (!confirmDel) {
      setConfirmDel(true)
      clearTimeout(delTimer.current)
      delTimer.current = setTimeout(() => setConfirmDel(false), 2600)
      return
    }
    clearTimeout(delTimer.current)
    setConfirmDel(false)
    doDelete()
  }
  const doDelete = async () => {
    if (!onDelete) return
    setDelBusy(true)
    const ok = await onDelete(photo)
    setDelBusy(false)
    if (!ok) return
    const neighbor = photos[idx + 1] || photos[idx - 1]
    if (neighbor) onChange(neighbor.id)
    else onClose()
  }

  // ---------- 评论 ----------
  const send = async () => {
    const body = text.trim()
    if (!body || !me) return
    setBusy(true)
    const { error } = await supabase.from('photo_comments').insert({ photo_id: photo.id, user_id: me.id, body })
    setBusy(false)
    if (!error) setText('')
  }
  const startEdit = (c) => { setEditingId(c.id); setEditText(c.body) }
  const saveEdit = async (c) => {
    const body = editText.trim()
    if (!body) return
    await supabase.from('photo_comments').update({ body, updated_at: new Date().toISOString() }).eq('id', c.id)
    setEditingId(null)
  }
  const remove = async (c) => {
    await supabase.from('photo_comments').delete().eq('id', c.id)
  }

  return (
    <div ref={rootRef} className="al-lb" role="dialog" aria-modal="true" aria-label="查看照片">
      <div className="al-lb-top">
        <button type="button" className="al-ib tap" onClick={onClose} aria-label="关闭"><Svg name="x" size={18} stroke={2} /></button>
        <span className="grow al-pos" style={{ textAlign: 'center' }}>{idx + 1} / {photos.length}</span>
        {mine && onDelete ? (
          <button
            type="button" className={`al-ib tap${confirmDel ? ' on' : ''}`} onClick={tapDelete} disabled={delBusy}
            aria-label={confirmDel ? '再点一次确认删除' : '删除这张照片'}
          >
            <Svg name={confirmDel ? 'check' : 'flame'} size={17} stroke={2} />
          </button>
        ) : <span style={{ width: 38 }} />}
      </div>

      <div className="al-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img
          key={photo.id} src={photo.url} alt="" draggable={false}
          style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform .25s ease' }}
        />
        {photos[idx - 1] && <button type="button" className="al-ib al-nav l" onClick={() => go(-1)} aria-label="上一张"><span style={{ display: 'flex', transform: 'scaleX(-1)' }}><Svg name="arrow" size={17} stroke={2} /></span></button>}
        {photos[idx + 1] && <button type="button" className="al-ib al-nav r" onClick={() => go(1)} aria-label="下一张"><Svg name="arrow" size={17} stroke={2} /></button>}
      </div>

      <div className="al-info">
        <span className="al-by" aria-hidden="true">{initial(nameOf(photo.uploader_id))}</span>
        <b style={{ fontWeight: 600 }}>{nameOf(photo.uploader_id)}</b>
        <span className="t">{fullTime(photo.created_at)}</span>
      </div>

      <div className="al-panel">
        <div className="al-cm-list">
          {comments.length === 0 ? (
            <div className="al-cm-hint">还没有评论，说点什么吧</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="al-cm">
                <div className="bd">
                  <div><b>{nameOf(c.user_id)}</b><span className="t">{shortTime(c.created_at)}</span></div>
                  {editingId === c.id ? (
                    <div className="al-in" style={{ marginTop: 4 }}>
                      <input value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={200} />
                      <button type="button" className="al-save" onClick={() => saveEdit(c)}>保存</button>
                      <button type="button" className="al-cancel" onClick={() => setEditingId(null)}>取消</button>
                    </div>
                  ) : (
                    <p>{c.body}</p>
                  )}
                </div>
                {c.user_id === me?.id && editingId !== c.id && (
                  <div className="al-cm-act">
                    <button type="button" onClick={() => startEdit(c)} aria-label="编辑"><Svg name="pen" size={13} /></button>
                    <button type="button" onClick={() => remove(c)} aria-label="删除"><Svg name="x" size={13} stroke={2} /></button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="al-in">
          <input
            value={text} maxLength={200} placeholder="写句评论…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }}
          />
          <button type="button" className="send" disabled={busy || !text.trim()} onClick={send}>发送</button>
        </div>
      </div>
    </div>
  )
}