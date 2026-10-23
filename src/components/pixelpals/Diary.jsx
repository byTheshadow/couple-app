import { useState } from 'react'
import { Svg } from '../Icon'
import { fmtTime } from '../../lib/hooks'
import { logLine } from './voice'
import { settleLine } from './celebrate'
import './extra.css'

/* ===========================================================================
   小人日记：两个小人今天都发生了什么（实时更新）。
   每条记录服务器里只存「谁对谁的小人做了什么 + 参数」，句子按这个小人自己的口吻在 voice.js 里拼。
   悄悄话的内容：只有收件人看得到；寄件人只看到「已经送到了」；服务器本来就不会把它给第三个人。
   =========================================================================== */

const SHOW = 6 // 默认只显示最新几条，其余点「展开」

export default function Diary({ items, notes, loading, myId, myName, mySlot, taName, taSlot, onClear }) {
  const [filter, setFilter] = useState('all')
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)

  const rows = items
    .map((e) => {
      const mine = e.owner_id === myId
      const ownerSlot = mine ? mySlot : taSlot
      const ownerName = mine ? myName : taName
      const actorName = e.actor_id === myId ? myName : taName
      // 下班结算是第三轮加的记录类型，句子在 celebrate.js 里拼；其余都走 voice.js
      const text = e.kind === 'settle' ? settleLine(ownerSlot, e.data) : logLine(e, ownerSlot, actorName)
      return { e, mine, ownerSlot, ownerName, text }
    })
    .filter((r) => r.text && (filter === 'all' || (filter === 'mine' ? r.mine : !r.mine)))
  const shown = all ? rows : rows.slice(0, SHOW)
  const clear = async () => {
    setBusy(true)
    await onClear()
    setBusy(false)
    setAll(false)
  }

  return (
    <section className="win">
      <header className="tb">
        <Svg name="doc" size={14} />
        <b>小人日记.log</b>
        <span className="grow" />
        <span className="mono">{rows.length} 条</span>
        <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
      </header>
      <div className="wb">
        <div className="pp-chips pp-filter">
          <button type="button" className={`pp-chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>全部</button>
          <button type="button" className={`pp-chip${filter === 'mine' ? ' on' : ''}`} onClick={() => setFilter('mine')}>{myName}</button>
          <button type="button" className={`pp-chip${filter === 'ta' ? ' on' : ''}`} onClick={() => setFilter('ta')}>{taName}</button>
        </div>
        <ul className="pp-log">
          {shown.map(({ e, mine, ownerSlot, ownerName, text }) => {
            let secret = null
            if (e.kind === 'note' && e.data && e.data.note_id != null) {
              if (mine) secret = notes[e.data.note_id] != null ? `🔒 “${notes[e.data.note_id]}”` : '🔒 纸条还在送来的路上'
              else secret = '🔒 你写的纸条已经送到了'
            }
            return (
              <li key={e.id}>
                <span className={`pp-ava ${ownerSlot}`}>{Array.from(ownerName)[0] || '?'}</span>
                <div>
                  <div className="pp-who">{ownerName}的日记</div>
                  <div className="pp-txt">{text}</div>
                  {secret && <span className="pp-secret">{secret}</span>}
                </div>
                <span className="pp-t">{fmtTime(e.created_at)}</span>
              </li>
            )
          })}
          {!rows.length && <li className="pp-empty">{loading ? '正在翻日记…' : '还没有日记，去看看对方的小人吧。'}</li>}
        </ul>
        <div className="pp-logbar">
          {rows.length > SHOW && (
            <button type="button" className="pp-chip" onClick={() => setAll((v) => !v)}>{all ? '收起' : `展开全部（还有 ${rows.length - SHOW} 条）`}</button>
          )}
          <span className="grow" />
          {onClear && items.length > 0 && <button type="button" className="pp-chip" disabled={busy} onClick={clear}>{busy ? '清空中…' : '🗑 清空日记'}</button>}
        </div>
      </div>
    </section>
  )
}