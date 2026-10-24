import { useState } from 'react'
import { Svg } from '../Icon'
import { GIFTS } from './art'
import { FOODS } from './voice'
import { palButton, palFeed, palGift, palNote } from './store'
import AiChat from './AiChat'
import './extra.css'

/* ===========================================================================
   去看 TA 的小人：点 TA 准备的互动按钮、投喂、送礼物、写悄悄话、聊两句
   你只能做这些事，改不了 TA 的任何设定；钱和心情都由服务端函数结算。
   这个组件只管界面；真正的动作由父组件的 onAct 执行（调服务端、成功后让 TA 的小人当场做出反应）。
   onAct(kind, call, data) → Promise<boolean>：call 是返回 { error } 的函数，data 是日记里要存的参数
   =========================================================================== */

export default function Visitor({ ownerId, name, slot, st, buttons, coins, gifts, busy, onAct, consoleRef, say, aiCtx }) {
  const [note, setNote] = useState('')
 
  const [sec, setSec] = useState('act')

  const sendNote = async () => {
    const v = note.trim()
    if (!v) { say('先写点什么吧'); return }
    const ok = await onAct('note', () => palNote(ownerId, v), {})
    if (ok) setNote('')
  }



  return (
    <section className="win">
      <header className="tb">
        <Svg name="heart" size={14} />
        <b>去看看{name}.exe</b>
        <span className="grow" />
        <span className="mono">¥ {coins}</span>
        <span className="ctl"><i>–</i><i>□</i><i>×</i></span>
      </header>
      <div className="wb">
        <p className="pp-lead">你改不了{name}的设定，但你做的每件事，都会写进{name}的日记。</p>
        <div className="pp-tabs" role="tablist">
          {[['act', '互动 · 投喂'], ['gift', '礼物'], ['talk', '纸条 · 聊天']].map(([k, n]) => (
            <button key={k} type="button" role="tab" aria-selected={sec === k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{n}</button>
          ))}
        </div>

        <div className="pp-blk" hidden={sec !== 'act'}>
          <div className="pp-h">{name}今天准备的互动</div>
          <div className="pp-acts">
            {buttons.map((b, i) => (
              <button key={i} type="button" className="pp-act" disabled={busy} onClick={() => onAct('button', () => palButton(ownerId, b.e, b.t), { e: b.e, t: b.t })}>
                <span>{b.e}</span>{b.t}
              </button>
            ))}
          </div>
        </div>

        <div className="pp-blk" hidden={sec !== 'act'}>
          <div className="pp-h">投喂 <small>我的钱包 ¥{coins}</small></div>
          <div className="pp-chips">
            {FOODS.map((f) => (
              <button key={f.k} type="button" className="pp-chip" disabled={busy} onClick={() => onAct('feed', () => palFeed(ownerId, f.k), { food: f.k })}>
                {f.e} {f.n}<i className="pp-price">¥{f.cost}</i>
              </button>
            ))}
          </div>
        </div>

        <div className="pp-blk" hidden={sec !== 'gift'}>
          <div className="pp-h">送礼物 <small>会摆进{name}的家里</small></div>
          <div className="pp-chips">
            {GIFTS.map((g) => {
              const has = gifts.includes(g.k)
              return (
                <button key={g.k} type="button" className="pp-chip" disabled={busy || has} onClick={() => onAct('gift', () => palGift(ownerId, g.k), { gift: g.k })}>
                  {g.e} {g.n}<i className="pp-price">{has ? '已送' : `¥${g.cost}`}</i>
                </button>
              )
            })}
          </div>
        </div>

        <div className="pp-blk" hidden={sec !== 'talk'}>
          <div className="pp-h">悄悄话 <small>只有{name}自己能打开</small></div>
          <div className="pp-inrow">
            <input className="pp-in" type="text" maxLength={40} value={note} placeholder="写一张小纸条……" aria-label="悄悄话"
              onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendNote() }} />
            <button type="button" className="btn" disabled={busy} onClick={sendNote}>折好送出</button>
          </div>
        </div>

                <div className="pp-blk" hidden={sec !== 'talk'}>
          <AiChat ownerId={ownerId} name={name} slot={slot} st={st} buttons={buttons} gifts={gifts} busy={busy} onAct={onAct} consoleRef={consoleRef} say={say} aiCtx={aiCtx} />
        </div>
      </div>
    </section>
  )
}