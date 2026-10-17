import { useNavigate } from 'react-router-dom'
import { ENVS, describe, cleanNote } from './crystal/data'
import './crystalletter.css'

/* ===========================================================================
   TA 寄来的水晶球：拆信时显示的那一块（快照小图 + 底座上的那句话 + 打开按钮）
   这里只放轻量的东西：不引入 three.js，3D 的球在水晶球页面里（懒加载），点按钮才会去下载。
   payload 由 LetterModal 先过 normalizePayload，所以这里拿到的一定是干净的 { globe, thumb }。
   用法：<CrystalLetter payload={normalizePayload(o_payload)} onClose={...} />
   =========================================================================== */
export default function CrystalLetter({ payload, onClose }) {
  const navigate = useNavigate()
  const { globe, thumb } = payload
  const note = cleanNote(globe.note)
  const sky = (ENVS.find((e) => e.id === globe.env) || ENVS[0]).sky

  const open = () => {
    if (onClose) onClose()
    // fromHub：水晶球页退出时回到上一页（信箱），而不是跳去小物抽屉柜；只带球本身，不带小图，别把历史记录撑大
    navigate({ pathname: '/toys', search: '?p=crystal' }, { state: { fromHub: true, crystal: { v: 1, globe } } })
  }

  return (
    <div className="crl">
      {thumb
        ? <img className="crl-snap" src={thumb} alt="TA 寄来的水晶球" />
        : <div className="crl-snap crl-none" style={{ background: `linear-gradient(${sky[0]}, ${sky[1]})` }}>水晶球</div>}
      <div className="crl-note">{note ? `底座上刻着「${note}」` : '底座上没有刻字'}</div>
      <div className="h-sub crl-sub">{describe(globe)} · {globe.items.length} 件摆件</div>
      <button type="button" className="btn crl-btn" onClick={open}>打开这个球</button>
      <div className="h-sub crl-sub">打开后可以转着看、摇一摇，喜欢的话收进自己的摆件架</div>
    </div>
  )
}