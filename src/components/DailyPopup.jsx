import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { todayKey, parseDay, weekdayOf, WEEKDAY_CN } from '../lib/calendar'
import { dailyCard } from '../lib/stories'
import { useSystemProgress } from '../lib/hooks'
import { usePalTogether } from './pixelpals/store'
import './daily-popup.css'

/* ===========================================================================
   每日弹窗（第十五轮）：一天第一次打开时弹一次
   - 左边是撕页日历（拟物），进来那天会「翻」掉昨天那页，还配一声很轻的纸响
   - 中间是今天的卡 + 今天的小任务（状态读 cal_system_progress）
   - 下面这一行是唯一在日历里看不到的：今天你们在小屋里一起待了多久
   - 关掉之后首页顶上留一条「今天」，点它重开；一天只自动弹一次
   =========================================================================== */

const LS_KEY = 'pp.day.v1'
const MON = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
const BAND = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function readSeen() {
  try { return window.localStorage.getItem(LS_KEY) || '' } catch { return '' }
}
function writeSeen(day) {
  try { window.localStorage.setItem(LS_KEY, day) } catch { /* 存不了就下次再弹一遍 */ }
}

/* 纸被掀起来那一下：一小段带通的白噪音，够了。不引音频文件，也不占体积 */
function paperSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ac = new AC()
    if (ac.state === 'suspended') { ac.close(); return } // 没有用户手势，静音放不了，直接放弃
    const dur = 0.4
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) {
      const t = i / ac.sampleRate
      const env = Math.min(1, t * 26) * Math.exp(-t * 7)
      ch[i] = (Math.random() * 2 - 1) * env * (0.55 + 0.45 * Math.sin(t * 120))
    }
    const src = ac.createBufferSource()
    src.buffer = buf
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8
    const g = ac.createGain(); g.gain.value = 0.14
    src.connect(bp); bp.connect(g); g.connect(ac.destination)
    src.start()
    src.onended = () => { try { ac.close() } catch { /* 关不掉就算了 */ } }
  } catch { /* 没声就没声，不影响弹窗 */ }
}

const pad2 = (n) => String(n).padStart(2, '0')

export default function DailyPopup() {
  const { me, partner } = useAuth()
  const nav = useNavigate()
  const day = todayKey()
  const { y, m, d } = parseDay(day)
  const card = dailyCard(day)
  const prog = useSystemProgress(day, me && me.id, partner && partner.id)
  const tog = usePalTogether(me && me.id, partner && partner.id, day)

  const [open, setOpen] = useState(() => readSeen() !== day)
  const [flip, setFlip] = useState(() => readSeen() !== day)
  const doneRef = useRef(false)

  // 今天第一次打开：响一声 + 翻页（同一次会话里关掉再开不再翻）
  useEffect(() => {
    if (!open || doneRef.current) return undefined
    doneRef.current = true
    paperSound()
    const id = setTimeout(() => setFlip(false), 1300)
    writeSeen(day)
    return () => clearTimeout(id)
  }, [open, day])

  const mineDone = !!(prog.mine && prog.mine.state === 'done')
  const taDone = !!(prog.theirs && prog.theirs.state === 'done')
  const task = card.challenge && card.challenge.task
  const meta = (card.challenge && card.challenge.meta) || '今天没有任务卡'
  const teaser = useMemo(() => {
    const first = (card.body && card.body[0]) || ''
    return first.length > 40 ? first.slice(0, 39) + '…' : first
  }, [card])

  const prev = new Date(y, m - 1, d - 1)
  const prevD = prev.getDate()

  const close = useCallback(() => { writeSeen(day); setOpen(false) }, [day])
  const goCal = useCallback(() => { close(); nav('/calendar') }, [close, nav])

  const page = (num, wd, old) => (
    <div className={`ppd-page${old ? ' old' : ''}`} aria-hidden={old ? 'true' : undefined}>
      <span className="ppd-band">{BAND[m - 1]}</span>
      <b>{pad2(num)}</b>
      <i>{wd}</i>
    </div>
  )

  const dialog = open ? createPortal(
    <div className="ppd-dim" onClick={close} role="presentation">
      <div className="ppd-glow" aria-hidden="true" />
      <section
        className="ppd-win"
        role="dialog"
        aria-modal="true"
        aria-label={`${m} 月 ${d} 日的今天`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ppd-head">
          <div className="ppd-pad">
            <i className="ppd-sheet s3" />
            <i className="ppd-sheet s2" />
            {page(d, `周${WEEKDAY_CN[weekdayOf(day)]}`, false)}
            {flip && page(prevD, `周${WEEKDAY_CN[weekdayOf(todayKey(prev))]}`, true)}
          </div>
          <div className="ppd-headtext">
            <div className="ppd-title">{MON[m - 1]}月 · 第 {d} 天</div>
            <div className="ppd-sub">今天的第一眼</div>
          </div>
          <button type="button" className="ppd-x" onClick={close} aria-label="关闭">×</button>
        </div>

        <div className="ppd-label">今日卡</div>
        <div className="ppd-card">
          <div className="ppd-kind">{card.kind === 'story' ? '故事' : '冷知识'}</div>
          <h3 className="ppd-ct">{card.title}</h3>
          {card.sub && <p className="ppd-cs">{card.sub}</p>}
          {teaser && <p className="ppd-cte">{teaser}</p>}
          <div className="ppd-cfoot">
            <span>{card.festivals && card.festivals.length ? `今天还有 ${card.festivals.length} 条节日` : '今天没有别的节日'}</span>
            <button type="button" className="ppd-more" onClick={goCal}>展开全文 →</button>
          </div>
        </div>

        <div className="ppd-task">
          <div className="ppd-trow">
            <span className="ppd-pill">双人</span>
            <span className="ppd-meta">{meta}</span>
          </div>
          <p className="ppd-tt">{task || '今天的任务还没排上——去日历看看有没有新的'}</p>
          <div className="ppd-who">
            <span className={`ppd-w${mineDone ? ' on' : ''}`}>我 · {mineDone ? '已交回执' : '还没交'}</span>
            <span className={`ppd-w${taDone ? ' on' : ''}`}>TA · {taDone ? '已交回执' : '还没交'}</span>
          </div>
        </div>

        <div className="ppd-tog">
          <span className="ppd-heart" aria-hidden="true">♥</span>
          <b>{tog.total > 0 ? `今天一起待了 ${tog.total} 分钟` : '今天还没在小屋里遇见'}</b>
          <span className="ppd-note">{tog.total > 0 ? '在小屋的同场景里站一会儿就会涨' : '都去同一个场景，就能看见对方'}</span>
        </div>

        <div className="ppd-foot">
          <span className="ppd-foot-note">一天只弹一次</span>
          <div className="ppd-btns">
            <button type="button" className="ppd-btn ghost" onClick={close}>收下</button>
            <button type="button" className="ppd-btn" onClick={goCal}>{taDone && !mineDone ? '看 TA 交了什么 →' : '今天的小任务 →'}</button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  ) : null

  const bar = !open ? (
    <button type="button" className="ppd-bar" onClick={() => setOpen(true)} aria-label="打开今天的卡">
      <span className="ppd-barchip">{BAND[m - 1]}<b>{pad2(d)}</b></span>
      <span className="ppd-bartext">
        <b>{card.title}</b>
        <span>{tog.total > 0 ? `今天一起待了 ${tog.total} 分钟` : '今天的卡 · 今天的小任务'}</span>
      </span>
      <span className="ppd-bargo" aria-hidden="true">›</span>
    </button>
  ) : null

  return <>{bar}{dialog}</>
}