import { useState } from 'react'
import { StatusIcon, Svg } from './Icon'
import './idcard.css'

const initial = (name) => (name || '?').trim().slice(0, 1).toUpperCase()
const pad = (n) => String(n).padStart(2, '0')

// 用 id 做种子生成一串稳定的 18 位"证件号码"，同一个人永远是同一串
function idNumber(seed = '') {
  let h = 11
  for (const ch of seed) h = (h * 131 + ch.charCodeAt(0)) >>> 0
  let out = ''
  for (let i = 0; i < 18; i++) {
    h = (h * 1664525 + 1013904223) >>> 0
    out += (h >>> 24) % 10
  }
  return `${out.slice(0, 6)} ${out.slice(6, 14)} ${out.slice(14)}`
}

/** 首页「我自己」的证件：身份证式卡片，装在透明毛玻璃袋子里，点一下从袋子里抽出来，再点放回去。
 *  person: { id, name, slot }    status: status 表的一行（我自己的） */
export default function IdCard({ person, status, onEditAvatar, editBusy = false, startOut = false }) {
  // null = 还没点过（不播动画）, true = 已取出, false = 已放回；startOut 让编辑页一进来证件就是取出状态
  const [out, setOut] = useState(startOut ? true : null)
  const s = status || {}
  const now = new Date()
  const shortDate = `${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
  const upd = s.updated_at ? new Date(s.updated_at) : now
  const slotNo = person?.slot ? `NO.${String(person.slot).replace(/\D/g, '').padStart(2, '0')}` : ''

  const toggle = () => {
    try { navigator.vibrate?.(out ? 10 : [12, 30, 12]) } catch { /* iOS 不支持 */ }
    setOut((v) => !v)
  }

  const cardClass = `idc-card${out === true ? ' is-out' : out === false ? ' is-in' : ''}`

  return (
    <div className="idc">
      <div
        className="idc-stage" role="button" tabIndex={0} aria-pressed={out === true}
        aria-label={out ? '把证件放回袋子' : '把证件从袋子里取出来'}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <div className="idc-hint">
          <Svg name={out ? 'down' : 'up'} size={12} stroke={2} />
          {out ? '再点一下，放回袋子' : '轻点，把证件取出来'}
        </div>

        {/* 袋子后片 → 证件 → 袋子前片（毛玻璃）。证件先在前后片之间向上滑，再翻到最前面，就是"抽出来"的效果 */}
        <div className="idc-back" />

        <div className={cardClass} data-cardbg={s.card_bg || 'none'}>
          <header className="idc-head">
            <span className="idc-emb"><Svg name="heart" size={13} stroke={1.8} /></span>
            <b>US · 居民身份卡</b>
            <span className="idc-no">{slotNo}</span>
          </header>

          <div className="idc-body">
            <dl className="idc-fields">
              <div>
                <dt>姓名</dt>
                <dd className="idc-name ellipsis">{person?.name || ''}</dd>
              </div>
              <div>
                <dt>此刻</dt>
                <dd className="idc-now"><StatusIcon id={s.icon_id} size={18} /><span className="ellipsis">{s.status_text || '还没设置状态'}</span></dd>
              </div>
              <div>
                <dt>心情</dt>
                <dd className="idc-mood">
                  {s.mood && <i>{s.mood}</i>}
                  <span className={s.mood_text ? undefined : 'dim'}>
                    {s.mood_text || (s.mood ? '没有留下一句话' : '还没设置心情')}
                  </span>
                </dd>
              </div>
            </dl>

            {/* 头像装饰和「TA 的工牌」共用同一套 [data-deco] 样式 */}
            <div className="pic-wrap idc-photo" data-deco={s.decoration_id || 'none'}>
              <i className="av-ring" /><i className="av-ring r2" /><i className="av-ring r3" />
              <span className="d d-polaroid" data-cap={shortDate} />
              <span className="d d-ears"><i /><i /></span>
              <span className="d d-halo" />
              <span className="d d-orbit" />
              <span className="d d-pixel" />
              <div className="pic" style={s.avatar_url ? { backgroundImage: `url(${s.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                               {!s.avatar_url && initial(person?.name)}
              </div>
              {onEditAvatar && (
                <button
                  type="button" className="idc-edit tap" aria-label="更换头像" disabled={editBusy}
                  onClick={(e) => { e.stopPropagation(); onEditAvatar() }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Svg name="pen" size={13} />
                </button>
              )}
            </div>
          </div>

          <footer className="idc-foot">
            <span>{idNumber(person?.id || '')}</span>
            <span>更新 {pad(upd.getMonth() + 1)}.{pad(upd.getDate())}</span>
            <i className="holo" />
          </footer>
          <div className="sheen" />
        </div>

        <div className="idc-bag" aria-hidden="true">
          <i className="idc-zip" />
          <i className="idc-tab" />
          <span className="idc-print">PRIVATE · 只属于两个人</span>
        </div>
      </div>
    </div>
  )
}