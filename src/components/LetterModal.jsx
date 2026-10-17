import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

import { DoodleReplay } from './DoodlePad'
import MilkTeaTicket from './MilkTeaTicket'
import CrystalLetter from './crystal/CrystalLetter'
import RiddleBox from './RiddleBox'
import { normalizePayload } from './crystal/data'
const KIND_LABEL = { note: '便签', doodle: '涂鸦', milktea: '奶茶小票', crystal: '水晶球', capsule: '时间胶囊', burn: '阅后即焚', riddle: '破译信' }


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
  // 水晶球：payload 一律先过校验，认不出来就当普通信显示正文
  const crystal = state.data && letter.kind === 'crystal' ? normalizePayload(state.data.o_payload) : null
  // 破译信：服务端在没解开之前不会返回正文，只返回提示；猜对或放弃后才有正文
  const rp = state.data && letter.kind === 'riddle' && state.data.o_payload && state.data.o_payload.riddle ? state.data.o_payload : null
  const riddleLocked = !!rp && !rp.solved && !rp.gave_up
  const solveTo = (o_payload, o_body) => {
    setState({ loading: false, error: null, data: { o_body, o_payload, o_kind: 'riddle', o_title: letter.title } })
    onChanged?.()
  }

  return (
    <div className="overlay" onClick={close}>
           <div className="sheet" style={{ maxHeight: '94dvh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="h-sub">{KIND_LABEL[letter.kind]} · 来自 TA</div>
          {left != null && <div className="badge">{left}s 后焚毁</div>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>{letter.title || '一封信'}</div>
        {state.loading && <div className="h-sub">正在拆开…</div>}
        {state.error && <div className="h-sub">{state.error}</div>}
              {state.data && letter.kind === 'doodle' && state.data.o_payload && <DoodleReplay payload={state.data.o_payload} />}
        {state.data && letter.kind === 'milktea' && state.data.o_payload && state.data.o_payload.tea && <MilkTeaTicket payload={state.data.o_payload} mode="received" />}
        {crystal && <CrystalLetter payload={crystal} onClose={onClose} />}
        {riddleLocked && (
          <RiddleBox
            letterId={letter.id} hint={rp.hint} tries={rp.tries || 0}
            onSolved={(body, tries) => solveTo({ riddle: true, solved: true, tries }, body)}
            onGaveUp={(answer, body, tries) => solveTo({ riddle: true, gave_up: true, answer, tries }, body)}
          />
        )}
        {rp && !riddleLocked && (
          <div className="rd-tag">{rp.gave_up ? `放弃了，答案是「${rp.answer}」` : `猜了 ${rp.tries} 次，破解成功`}</div>
        )}
        {state.data && !riddleLocked && !(letter.kind === 'doodle' && state.data.o_payload) && !(letter.kind === 'milktea' && state.data.o_payload && state.data.o_payload.tea) && !crystal && (
          <div style={{ fontSize: 17, lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 80 }}>{state.data.o_body}</div>
        )}
        <button className="btn" onClick={close}>{letter.kind === 'burn' && state.data ? '看完了，焚毁' : riddleLocked ? '先放着' : '收好'}</button>
      </div>
    </div>
  )
}