import { useEffect, useState } from 'react'
import { Svg } from './Icon'

const KIND_ICON = { note: 'mail', doodle: 'pen', milktea: 'cup', capsule: 'clock', burn: 'flame' }

/** 收到新信时，一封信从角落飞入屏幕中央再淡出的提示动画 */
export default function LetterArrival({ letter, onDone }) {
  const [landed, setLanded] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!letter) return
    setLanded(false); setLeaving(false)
    const t1 = setTimeout(() => setLanded(true), 30)
    const t2 = setTimeout(() => setLeaving(true), 1500)
    const t3 = setTimeout(() => onDone?.(), 2100)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [letter, onDone])

  if (!letter) return null

  return (
    <div className="letter-fly-wrap">
      <div className={`letter-fly${landed ? ' land' : ''}${leaving ? ' away' : ''}`}>
        <div className="env">
          <div className="env-back" />
          <div className="env-paper"><i /><i /><i /></div>
          <div className="env-front" />
          <div className="env-flap" />
          <div className="seal"><Svg name={KIND_ICON[letter.kind] || 'mail'} size={18} /></div>
        </div>
        <div className="letter-fly-tag glass h-sub">收到一封新信</div>
      </div>
    </div>
  )
}