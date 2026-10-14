import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const KIND_LABEL = { note: '便签', doodle: '涂鸦', capsule: '时间胶囊', burn: '阅后即焚' }

/** 拆信：正文只能通过服务端 open_letter 拿到（时间胶囊未到点会被拒绝） */
export default function LetterModal({ letter, onClose, onChanged }) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [left, setLeft] = useState(null)
  const opened = useRef(false)

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    supabase.rpc('open_letter', { p_id: letter.id }).then(({ data, error }) => {
      if (error) {
        const msg = error.message.includes('locked') ? '还没到时间哦'
          : error.message.includes('burned') ? '这封信已经焚毁了'
          : '打不开这封信'
        setState({ loading: false, error: msg, data: null })
      } else {
        setState({ loading: false, error: null, data: Array.isArray(data) ? data[0] : data })
        if (letter.kind === 'burn') setLeft(10)
      }
      onChanged?.()
    })
  }, [letter.id, letter.kind, onChanged])

  const burnNow = async () => {
    await supabase.rpc('burn_letter', { p_id: letter.id })
    onChanged?.()
    onClose()
  }

  useEffect(() => {
    if (left == null) return
    if (left <= 0) { burnNow(); return }
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  const close = () => (letter.kind === 'burn' && state.data ? burnNow() : onClose())

  return (
    <div className="overlay" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="h-sub">{KIND_LABEL[letter.kind]} · 来自 TA</div>
          {left != null && <div className="badge">{left}s 后焚毁</div>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>{letter.title || '一封信'}</div>
        {state.loading && <div className="h-sub">正在拆开…</div>}
        {state.error && <div className="h-sub">{state.error}</div>}
        {state.data && (
          <div style={{ fontSize: 17, lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 80 }}>{state.data.o_body}</div>
        )}
        <button className="btn" onClick={close}>{letter.kind === 'burn' && state.data ? '看完了，焚毁' : '收好'}</button>
      </div>
    </div>
  )
}
