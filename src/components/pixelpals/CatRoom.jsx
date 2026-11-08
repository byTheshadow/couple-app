import { useEffect, useRef } from 'react'
import { Svg } from '../Icon'
import { SCENES, SCENE_LIST } from './pixelpals/art'
import { drawCatRoom } from './pixelpals/rooms'
import { catWhyLine } from './pixelpals/cat'

/* ===========================================================================
   猫屋（第十五轮）：一个独立的卡片，任何时候都能进来看
   - 自己的 160×120 画布，跑和游戏机里同一个 drawCatRoom（画面完全一致）
   - 不跟「角色此刻在哪」绑定：上班、睡觉、不在家，都看得到这间屋子和猫
   - 下面是今天让它去哪、它现在在哪、它说的那句话
   =========================================================================== */

const W = 160
const H = 120

export default function CatRoom({ cat, hr, persona, bothPicked, todayDest, myPick, taPick, catVoice, aiOn, onPick }) {
  const ref = useRef(null)
  const catRef = useRef(cat)
  catRef.current = cat

  useEffect(() => {
    const cv = ref.current
    if (!cv) return undefined
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = false
    let raf = 0
    let last = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 120) return // 8 帧足够：猫只会眨眼和轻轻呼吸
      last = now
      drawCatRoom(ctx, hr, now / 1000, catRef.current)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [hr])

  const where = cat.justLeft ? '刚走开' : cat.home ? '在家' : '出门了'
  const destLine = bothPicked && todayDest
    ? `今天去了 ${SCENES[todayDest.to] || todayDest.to}`
    : '等两个人都指完'

  return (
    <section className="win">
      <header className="tb">
        <Svg name="home" size={14} />
        <b>猫屋</b>
        <span className="grow" />
        <span className="mono">{where}</span>
      </header>
      <div className="wb" style={{ gap: 12 }}>
        <div className="pp-bezel">
          <div className="pp-screen">
            <canvas ref={ref} width={W} height={H} />
          </div>
        </div>

        <div className="pp-chips">
          {SCENE_LIST.map((sc) => (
            <button
              key={sc.k}
              type="button"
              className={`pp-chip${myPick === sc.k ? ' on' : ''}`}
              onClick={() => onPick(sc.k)}
            >{sc.e} {sc.n}</button>
          ))}
        </div>

        <p className="pp-hint" style={{ margin: 0 }}>
          你：{myPick ? (SCENES[myPick] || myPick) : '还没指'}
          {' · '}TA：{taPick ? (SCENES[taPick] || taPick) : '还没指'}
          {' · '}{destLine}
        </p>
        <p className="pp-hint" style={{ margin: 0 }}>
          {persona.n} · {bothPicked && todayDest ? catWhyLine(persona, todayDest.why, SCENES[todayDest.to]) : persona.note}
        </p>
        {catVoice ? (
          <p className="pp-quote">「{catVoice}」</p>
        ) : (
          <p className="pp-hint" style={{ margin: 0 }}>{aiOn ? '它今天还没说话' : '配了 AI 之后，它会自己说一句'}</p>
        )}
      </div>
    </section>
  )
}