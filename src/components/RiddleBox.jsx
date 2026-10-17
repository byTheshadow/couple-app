import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Svg } from './Icon'
import './riddle.css'

/* ===========================================================================
   破译信的拆信面板：显示提示 → 输入答案 → 服务端判断对错。
   答案从头到尾都不在这台设备上，对错由 Supabase 的 guess_letter 函数判断。
   - 猜错后要等几秒才能再猜（冷却时间由服务端决定，这里只是倒计时显示）
   - 「放弃，直接看」要点两次才生效，防止手滑
   - 猜对 / 放弃后，把正文交回给 LetterModal 去显示
   =========================================================================== */

const one = (d) => (Array.isArray(d) ? d[0] : d)

const mapErr = (e) => {
  const m = e?.message || ''
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '还没在 Supabase 里运行破译信的 SQL'
  if (m.includes('closed')) return '这封信已经解开了，关掉再打开看看'
  return `没成功：${m}`
}

export default function RiddleBox({ letterId, hint, tries: tries0 = 0, onSolved, onGaveUp }) {
  const [guess, setGuess] = useState('')
  const [tries, setTries] = useState(tries0)
  const [wait, setWait] = useState(0)
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [sure, setSure] = useState(false)
  const sureT = useRef(0)
  const shakeT = useRef(0)

  // 冷却倒计时
  useEffect(() => {
    if (wait <= 0) return undefined
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  useEffect(() => () => { clearTimeout(sureT.current); clearTimeout(shakeT.current) }, [])

  const submit = async () => {
    const g = guess.trim()
    if (!g || busy || wait > 0) return
    setBusy(true); setMsg(''); setBad(false)
    const { data, error } = await supabase.rpc('guess_letter', { p_id: letterId, p_guess: g })
    setBusy(false)
    if (error) { setBad(true); setMsg(mapErr(error)); return }
    const row = one(data)
    if (!row) { setBad(true); setMsg('没有收到结果，再试一次'); return }
    setTries(row.o_tries)
    if (row.o_status === 'ok') {
      try { navigator.vibrate?.([20, 40, 20, 40, 70]) } catch { /* iOS 不支持 */ }
      onSolved?.(row.o_body, row.o_tries)
      return
    }
    setWait(row.o_wait || 3)
    if (row.o_status === 'wait') {
      setMsg('慢一点，等一下再猜')
    } else {
      setBad(true); setMsg('不对哦，再想想')
      try { navigator.vibrate?.(40) } catch { /* iOS 不支持 */ }
      setShaking(true)
      clearTimeout(shakeT.current)
      shakeT.current = setTimeout(() => setShaking(false), 450)
    }
  }

  const giveUp = async () => {
    if (busy) return
    if (!sure) {
      setSure(true)
      clearTimeout(sureT.current)
      sureT.current = setTimeout(() => setSure(false), 3000)
      return
    }
    setBusy(true); setMsg(''); setBad(false)
    const { data, error } = await supabase.rpc('give_up_letter', { p_id: letterId })
    setBusy(false); setSure(false)
    if (error) { setBad(true); setMsg(mapErr(error)); return }
    const row = one(data)
    if (!row) { setBad(true); setMsg('没有收到结果，再试一次'); return }
    onGaveUp?.(row.o_answer, row.o_body, tries)
  }

  return (
    <div className="rd-box">
      <div className="rd-hint">
        <Svg name="lock" size={14} stroke={1.8} />
        <small>提示</small>
        <b>{hint}</b>
      </div>

      <div className={`rd-row${shaking ? ' shake' : ''}`}>
        <input
          className="field" maxLength={40} value={guess} placeholder="猜一猜答案"
          autoComplete="off" autoCapitalize="off" enterKeyHint="send" disabled={busy}
          onChange={(e) => setGuess(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button type="button" className="btn tap" onClick={submit} disabled={busy || wait > 0 || !guess.trim()}>
          {wait > 0 ? `${wait}s` : busy ? '…' : '猜'}
        </button>
      </div>

      <div className="rd-foot">
        <span className={`rd-msg${bad ? ' bad' : ''}`}>{msg || (tries > 0 ? `已经猜了 ${tries} 次` : 'TA 给你出了一道题')}</span>
        <button type="button" className={`rd-giveup${sure ? ' sure' : ''}`} onClick={giveUp} disabled={busy}>
          {sure ? '真的放弃？再点一次' : '放弃，直接看'}
        </button>
      </div>
    </div>
  )
}