import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useSystemProgress } from '../lib/hooks'
import { compressImage } from '../lib/chatImage'
import { parseDay } from '../lib/calendar'
import './quest-popup.css'

/* 头像：20×16 的像素猫。白猫 = 还没交（或者我还没交），黑猫 = 我交了，两只 = 都完成。
   配色和预览稿一致：白猫米白身、灰紫描边；黑猫墨黑身、米色眼睛。 */
const CAT = {
  white: ['#fdfaf0', '#9a90b4', '#2b2436', '#e08aa8'],
  black: ['#2a2333', '#0e0a16', '#fff3d6', '#c07a96'],
}

function Cat({ tone = 'white', w = 56 }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const g = cv.getContext('2d')
    const [body, edge, eye, pink] = CAT[tone] || CAT.white
    const px = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x, y, ww, hh) }
    px(0, 0, 20, 16, '#a2d4fa')
    px(4, 1, 3, 3, edge); px(5, 2, 1, 1, pink)
    px(13, 1, 3, 3, edge); px(14, 2, 1, 1, pink)
    px(4, 3, 12, 8, edge)
    px(5, 4, 10, 6, body)
    px(7, 6, 2, 2, eye); px(12, 6, 2, 2, eye)
    px(10, 9, 1, 1, pink)
    px(6, 11, 8, 5, edge)
    px(7, 12, 6, 3, body)
    px(15, 10, 1, 4, edge); px(16, 9, 1, 3, edge); px(17, 8, 1, 2, edge)
  }, [tone])
  return <canvas ref={ref} width={20} height={16} style={{ width: w }} className="qp-cat" />
}

/**
 * 系统每日任务的弹窗。
 * day 是 'YYYY-MM-DD'，card 是 dailyCard(day)（challenge 在里面）。
 * 任务内容不读库——它来自内容数据；库里只存「谁在哪天交了回执」。
 */
export default function QuestPopup({ day, card, onClose }) {
  const { me, partner } = useAuth()
  const { mine, theirs, reload } = useSystemProgress(day, me && me.id, partner && partner.id)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const ch = (card && card.challenge) || {}
  const doneMe = Boolean(mine)
  const doneTa = Boolean(theirs)
  const both = doneMe && doneTa
  const { m, d } = parseDay(day)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const submit = async () => {
    if (busy || !me) return
    setErr('')
    if (!text.trim() && !file && !(mine && mine.photo_url)) {
      setErr('写一句话，或者放一张照片')
      return
    }
    setBusy(true)
    try {
      let url = (mine && mine.photo_url) || null
      if (file) {
        const blob = await compressImage(file, 1440, 0.82)
        const path = day + '/' + me.id + '.jpg'
        const up = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        if (up.error) throw up.error
        url = supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl
      }
      const row = {
        day,
        user_id: me.id,
        note: text.trim() || null,
        photo_url: url,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('cal_system_progress').upsert(row, { onConflict: 'day,user_id' })
      if (error) throw error
      setFile(null)
      setText('')
      await reload()
    } catch (e) {
      setErr('没交上：' + ((e && e.message) || '网络不稳，再试一次'))
    } finally {
      setBusy(false)
    }
  }

  const urge = async () => {
    if (!me || !partner || busy) return
    setBusy(true)
    setErr('')
    try {
      const { error } = await supabase.from('pokes').insert({
        sender_id: me.id,
        receiver_id: partner.id,
        label: '催你交今天的任务',
        kind: 'poke',
        verb: '催',
        message: null,
      })
      if (error) throw error
      onClose()
    } catch (e) {
      setErr('没催到：' + ((e && e.message) || '网络不稳'))
    } finally {
      setBusy(false)
    }
  }

  const pick = (e) => {
    const f = e.target.files && e.target.files[0]
    if (f) { setFile(f); setErr('') }
    e.target.value = ''
  }

  return (
    <div className="qp-dim" onClick={onClose} role="presentation">
      <section
        className="qp-win"
        role="dialog"
        aria-modal="true"
        aria-label="今日任务"
        onClick={(e) => e.stopPropagation()}
      >
        <i className="qp-rv qp-rv-tl" /><i className="qp-rv qp-rv-tr" />
        <i className="qp-rv qp-rv-bl" /><i className="qp-rv qp-rv-br" />

        <header className="qp-head">
          <div className="qp-portrait">
            {both ? (<><Cat tone="white" w={28} /><Cat tone="black" w={28} /></>) : <Cat tone={doneMe ? 'black' : 'white'} />}
          </div>
          <div className="qp-who">
            <div className="qp-name">{both ? '今日任务 · 已完成' : '今日任务'}</div>
            <div className="qp-sub">地球Online · 第 {d} 天 · {m}.{String(d).padStart(2, '0')}</div>
          </div>
          <button type="button" className="qp-x" onClick={onClose} aria-label="关闭">✕</button>
        </header>

        <div className="qp-parch">
          <span className="qp-kind">双人</span>
          <span className={both ? 'qp-ribbon qp-ribbon-win' : 'qp-ribbon'}>
            {both ? 'CLEAR!' : 'DAILY QUEST'}
          </span>
          <h3 className="qp-title">{ch.task || '今天的任务还没排上'}</h3>
          <p className="qp-say">
            {[ch.meta, ch.solo ? '一个人也能做：' + ch.solo : ''].filter(Boolean).join(' · ')}
          </p>

          <h4 className="qp-h4">目标</h4>
          <ul className="qp-objs">
            <li className={doneMe ? 'qp-ok' : ''}>
              我 · {doneMe ? '已交回执' : '还没交'}<span className="qp-num">{doneMe ? '1/1' : '0/1'}</span>
            </li>
            <li className={doneTa ? 'qp-ok' : ''}>
              TA · {doneTa ? '已交回执' : '还没交'}<span className="qp-num">{doneTa ? '1/1' : '0/1'}</span>
            </li>
          </ul>

          {doneMe && (mine.note || mine.photo_url) && (
            <div className="qp-receipt">
              {mine.note && <p className="qp-say">{mine.note}</p>}
              {mine.photo_url && <img className="qp-shot" src={mine.photo_url} alt="我的回执" />}
            </div>
          )}

          {!doneMe && (
            <>
              <h4 className="qp-h4">回执</h4>
              <textarea
                className="qp-field"
                value={text}
                onChange={(e) => { setText(e.target.value); setErr('') }}
                placeholder="写一句话，或者只放一张照片"
                rows={3}
              />
              <div className="qp-pick">
                <button type="button" className="qp-add" onClick={() => fileRef.current && fileRef.current.click()}>
                  {file ? '换一张' : '＋ 照片'}
                </button>
                <span className="qp-file">{file ? file.name.slice(0, 14) : '可以不放'}</span>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
              </div>
              {err && <p className="qp-err">{err}</p>}
            </>
          )}

          {both && <p className="qp-sum">两个人都交了。这一天的任务，算过。</p>}

          <h4 className="qp-h4">奖励</h4>
          <div className="qp-rewards">
            <div className="qp-rslot"><span className="qp-num">★</span></div>
            <div className="qp-rslot">小结</div>
          </div>
        </div>

        <footer className="qp-foot">
          <span className="qp-note">
            {both ? '明天换一张' : doneMe ? '等 TA 交上来就结算' : '两边都完成才算过'}
          </span>
          {both ? (
            <button type="button" className="qp-btn qp-btn-gold" onClick={onClose}>收下</button>
          ) : doneMe ? (
            <>
              <button type="button" className="qp-btn qp-btn-plain" onClick={onClose}>知道了</button>
              <button type="button" className="qp-btn qp-btn-gold" onClick={urge} disabled={busy}>
                {busy ? '…' : '催一下'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="qp-btn qp-btn-plain" onClick={onClose}>稍后</button>
              <button type="button" className="qp-btn" onClick={submit} disabled={busy}>
                {busy ? '上交中…' : '交回执'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}