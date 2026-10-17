import { useEffect, useMemo, useState } from 'react'
import { normalizeOrder, lineItems, countdown, fmtEta, fmtStamp } from './milktea/menu'
import './milktea.css'

/* ===========================================================================
   奶茶小票：用代码画出来的热敏纸小票（不存成图片，换主题 / 改样式都清晰）。
   两个地方复用同一个组件：
   - 点单页寄出前的预览：<MilkTeaTicket payload={...} mode="preview" />
   - TA 拆信时：          <MilkTeaTicket payload={o_payload} mode="received" />
   纸张颜色固定（不跟明暗主题走），TA 看到的永远和你寄出的一样。
   payload 的形状见 milktea/menu.js 顶部。
   =========================================================================== */

// 装饰条形码：用单号当种子，同一张小票每次画出来都一样
function Barcode({ seed }) {
  const bars = useMemo(() => {
    let s = 0
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0
    const out = []
    let x = 0
    let ink = true // 一条深色、一条留白，交替着走
    while (x < 196) {
      s = (s * 1664525 + 1013904223) >>> 0
      const w = 1 + ((s >>> 28) % 4) // 1~4
      if (ink) out.push({ x, w })
      ink = !ink
      x += w
    }
    return out
  }, [seed])
  return (
    <svg className="mt-tk-bar" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b, i) => <rect key={i} x={b.x} y="0" width={b.w} height="34" fill="currentColor" />)}
    </svg>
  )
}

export default function MilkTeaTicket({ payload, mode = 'received' }) {
  const o = useMemo(() => normalizeOrder(payload), [payload])
  const etaMs = o && o.eta ? Date.parse(o.eta) : null
  const [now, setNow] = useState(() => Date.now())

  // 倒计时每秒走一次；到点之后就不用再走了
  useEffect(() => {
    if (!etaMs) return undefined
    setNow(Date.now())
    const id = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= etaMs) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [etaMs])

  if (!o) return <div className="h-sub">这张小票打不开</div>

  const rows = lineItems(o)
  const cd = etaMs ? countdown(etaMs, now) : null
  const stamp = fmtStamp(o.at ? Date.parse(o.at) : now)

  return (
    <div className={`mt-tk mt-tk-${mode}`}>
      <div className="mt-tk-paper">
        <div className="mt-tk-hd">
          <b>US</b>
          <span>TEA ROOM · 手作茶饮</span>
        </div>
        <div className="mt-tk-meta">
          <span>NO.{o.no}</span>
          <span>{stamp}</span>
        </div>

        {o.snap && (
          <div className="mt-tk-snap">
            <img src={o.snap} alt="这杯奶茶" />
          </div>
        )}

        <div className="mt-tk-line" />
        <ul className="mt-tk-items">
          {rows.map((r, i) => (
            <li key={i}>
              <span>{r.label}</span>
              <i />
              <em>{r.price ? `¥${r.price}` : '—'}</em>
            </li>
          ))}
        </ul>
        <div className="mt-tk-line" />

        <div className="mt-tk-total">
          <span>合计</span>
          <b>¥{o.price}</b>
        </div>
        <div className="mt-tk-pay">付款方式：爱（免单）</div>

        {o.note && (
          <>
            <div className="mt-tk-line" />
            <div className="mt-tk-note">
              <small>留言</small>
              <p>{o.note}</p>
            </div>
          </>
        )}

        {etaMs && cd && (
          <>
            <div className="mt-tk-line" />
            <div className={`mt-tk-eta${cd.done ? ' done' : ''}`}>
              <small>预计送达</small>
              <b>{fmtEta(etaMs, now)}</b>
              <div className="mt-tk-cd">{cd.done ? cd.text : `距离送到 ${cd.text}`}</div>
            </div>
          </>
        )}

        <Barcode seed={o.no + o.price} />
        <div className="mt-tk-foot">谢谢惠顾 · 下次还点你</div>
      </div>
    </div>
  )
}