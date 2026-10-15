import { useRef, useState } from 'react'
import { StatusIcon, Svg } from './Icon'
import { fmtTime } from '../lib/hooks'
import './badge.css'

const initial = (name) => (name || '?').trim().slice(0, 1).toUpperCase()

// 用 id 做种子生成稳定的条形码，同一个人永远是同一条
function barcode(seed = '') {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const out = []
  for (let i = 0; i < 34; i++) {
    h = (h * 1664525 + 1013904223) >>> 0
    out.push([1 + ((h >>> 28) % 3), 1 + ((h >>> 24) % 2)])
  }
  return out
}

/** 心情条：心情 emoji + 一句话。
 *  mine=true 且两样都没填时显示虚线占位（hint 可自定义提示文字）；对方没填就整条不显示 */
export function MoodStrip({ mood, text, mine = false, hint = '还没设置心情，点「编辑状态」选一个' }) {
  if (!mood && !text) {
    if (!mine) return null
    return (
      <div className="mood-strip empty">
        <div className="ms-emoji"><Svg name="plus" size={18} stroke={1.8} /></div>
        <div className="ms-text"><small>心情</small><p className="dim">{hint}</p></div>
      </div>
    )
  }
  return (
    <div className="mood-strip">
      <div className={`ms-emoji${mood ? '' : ' quote'}`}>{mood || '“'}</div>
      <div className="ms-text">
        <small>此刻心情</small>
        <p className={text ? undefined : 'dim'}>{text || '没有留下一句话'}</p>
      </div>
    </div>
  )
}

/** 挂绳工牌（TA 看到的你）。首页用真实数据，状态编辑页用表单里的值做预览，两边是同一个组件。
 *  person: { id, name, slot }    status: status 表的一行（或长得一样的对象）    preview: 编辑页预览时为 true */
export default function Badge({ person, status, preview = false }) {
  const [flip, setFlip] = useState(false)
  const p3d = useRef(null)
  const s = status || {}
  const now = new Date()
  const shortDate = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
  const slotNo = person?.slot ? `NO.${String(person.slot).replace(/\D/g, '').padStart(2, '0')}` : ''

  // 工牌：指针移动时 3D 倾斜，离开时回正
  const tilt = (e) => {
    const el = p3d.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`)
    el.classList.add('tilting')
  }
  const untilt = () => {
    const el = p3d.current
    if (!el) return
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--rx', '0deg')
    el.classList.remove('tilting')
  }

  return (
    <div className="badge-wrap">
      <div className="swing">
        <div className="strap" /><div className="clip" />
        <div className="pass">
          <div className="p3d" ref={p3d} style={{ '--fl': flip ? '180deg' : '0deg' }}
            onPointerMove={tilt} onPointerLeave={untilt} onPointerCancel={untilt} onClick={() => setFlip((f) => !f)}>
            <div className="face front" data-cardbg={s.card_bg || 'none'}>
              <div className="band"><span>TA</span><i className="hole" /><span className="mono">{slotNo}</span></div>
              <div className="pbody">
                {/* 头像装饰和首页「我的卡」共用同一套 [data-deco] 样式，换了装饰这里会同步显示 */}
                <div className="pic-wrap" data-deco={s.decoration_id || 'none'}>
                  <i className="av-ring" /><i className="av-ring r2" /><i className="av-ring r3" />
                  <span className="d d-polaroid" data-cap={shortDate} />
                  <span className="d d-ears"><i /><i /></span>
                  <span className="d d-halo" />
                  <span className="d d-orbit" />
                  <span className="d d-pixel" />
                  <div className="pic" style={s.avatar_url ? { backgroundImage: `url(${s.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                    {!s.avatar_url && initial(person?.name)}
                  </div>
                </div>
                <div className="pf">
                  <div className="fld">
                    <small>姓名</small>
                    <div className="nm-row">
                      <span className="nm ellipsis">{person?.name}</span>
                    </div>
                  </div>
                  <div className="fld"><small>此刻</small>
                    <div className="nowchip"><StatusIcon id={s.icon_id} /><b>{s.status_text || '还没设置状态'}</b></div>
                  </div>
                </div>
                <div className="stamp">{preview ? 'DEMO' : 'LIVE'}</div>
              </div>
              <MoodStrip mood={s.mood} text={s.mood_text} />
              <div className="pfoot">
                <div className="bars">{barcode(person?.id || '').map(([w, g], i) => <i key={i} style={{ width: w, marginRight: g }} />)}</div>
                <div className="holo" />
              </div>
              <div className="sheen" />
            </div>
            <div className="face back">
              <div className="mag" />
              <div className="bk">
                <h4>{preview ? '预览' : '最近一次更新'}</h4>
                <div className="big">{preview ? '保存后生效' : s.updated_at ? fmtTime(s.updated_at) : '暂无记录'}</div>
                <div className="fine">
                  {preview ? '这就是 TA 手机上看到的你。' : 'TA 改状态时，这张工牌会实时刷新。'}<br />再点一下翻回正面。
                </div>
              </div>
              <div className="sheen" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}