import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, usePhotoComments } from '../lib/hooks'
import { Svg } from './Icon'

export default function PhotoModal({ photo, onClose }) {
  const { me, partner } = useAuth()
  const { comments } = usePhotoComments(photo.id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const nameOf = (uid) => (uid === me?.id ? me?.display_name || '我' : partner?.display_name || 'TA')

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
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <img src={photo.url} alt="" style={{ width: '100%', borderRadius: 16, display: 'block', objectFit: 'cover', maxHeight: '50vh' }} />
        <div className="h-sub">{nameOf(photo.uploader_id)}上传 · {fmtTime(photo.created_at)}</div>

        <div className="col" style={{ gap: 10, maxHeight: '28vh', overflowY: 'auto' }}>
          {comments.length === 0 ? (
            <div className="h-sub">还没有评论，说点什么吧</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <div className="col" style={{ flex: 1, gap: 2 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b style={{ fontSize: 13 }}>{nameOf(c.user_id)}</b>
                    <span className="mono muted" style={{ fontSize: 11 }}>{fmtTime(c.created_at)}</span>
                  </div>
                  {editingId === c.id ? (
                    <div className="row" style={{ gap: 6 }}>
                      <input className="field" style={{ padding: '8px 12px', fontSize: 14 }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                      <button className="mini tap" onClick={() => saveEdit(c)}>保存</button>
                      <button className="mini tap" onClick={() => setEditingId(null)}>取消</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 14 }}>{c.body}</span>
                  )}
                </div>
                {c.user_id === me?.id && editingId !== c.id && (
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn tap" style={{ width: 28, height: 28 }} onClick={() => startEdit(c)} aria-label="编辑">
                      <Svg name="pen" size={13} />
                    </button>
                    <button className="icon-btn tap" style={{ width: 28, height: 28 }} onClick={() => remove(c)} aria-label="删除">
                      <Svg name="x" size={13} stroke={2} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <input
            className="field" style={{ flex: 1 }} value={text} maxLength={200}
            onChange={(e) => setText(e.target.value)} placeholder="写句评论…"
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          />
          <button className="btn" style={{ height: 44 }} disabled={busy || !text.trim()} onClick={send}>发送</button>
        </div>
      </div>
    </div>
  )
}