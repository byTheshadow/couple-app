import { useEffect, useRef, useState } from 'react'
import { Svg } from '../Icon'
import { SCENES, SCENE_LIST } from './art'
import { drawCatRoom } from './rooms'
import { catWhyLine } from './cat'
import { composeCatPhoto, saveCatPhoto } from './photo'

/* ===========================================================================
   猫屋（第十五轮，十八轮改成可折叠）：任何时候都能进来看
   - 收起时只占一行：▸ 猫屋 · 在家 · 今天去了公园
   - 展开才有画布，收起就卸载，别让它一直跑 requestAnimationFrame 白烧电
   - SCENE_LIST 有 27 个场景，不再平铺：只露「你指的」+「换地方 ▾」，
     点开才横滑出来（和投喂区共用 .pp-feedslide 那套）
   =========================================================================== */

const W = 160
const H = 120

/** 画布单独拆出来：只有展开时才挂载，收起就停 rAF */
function CatCanvas({ hr, cat }) {
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

  return (
    <div className="pp-bezel">
      <div className="pp-screen">
        <canvas ref={ref} width={W} height={H} />
      </div>
    </div>
  )
}

export default function CatRoom({ cat, hr, persona, bothPicked, todayDest, myPick, taPick, catVoice, aiOn, onPick, myId, mySlot, taSlot, myWorn, taWorn, say }) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [shooting, setShooting] = useState(false)

  const where = cat.justLeft ? '刚走开' : cat.home ? '在家' : '出门了'
  const destLine = bothPicked && todayDest
    ? `今天去了 ${SCENES[todayDest.to] || todayDest.to}`
    : '等两个人都指完'
  const mine = SCENE_LIST.find((s) => s.k === myPick)

  // 拍一张合影：本地画好 → 传进相册（复用 Album 那套 storage + photos 表）
  const shoot = async () => {
    if (shooting) return
    setShooting(true)
    try {
      const d = new Date()
      const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
      const cv = composeCatPhoto({ hr, cat, mySlot, taSlot, myWorn, taWorn, date })
      const { error } = await saveCatPhoto(cv, myId)
      if (say) say(error || '合影存进相册了')
    } catch {
      if (say) say('拍照没成功，再试一次')
    } finally {
      setShooting(false)
    }
  }

  return (
    <details className="pp-fold" id="pp-catroom" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Svg name="home" size={13} />
        <b>猫屋</b>
        <small>{where} · {destLine}</small>
        {catVoice ? <i>💬</i> : null}
      </summary>
      {open && (
        <div className="pp-edits pp-cat-inner">
          <CatCanvas hr={hr} cat={cat} />

          <div className="pp-wf">
            <button type="button" className={`pp-chip${mine ? ' on' : ''}`} onClick={() => setPicking(false)}>
              {mine ? `${mine.e} ${mine.n}` : '还没指地方'}
            </button>
            <button type="button" className="pp-chip" onClick={() => setPicking((v) => !v)}>换地方 {picking ? '▴' : '▾'}</button>
            <button type="button" className="pp-chip" disabled={shooting} onClick={shoot}>{shooting ? '拍照中…' : '📷 拍张合影'}</button>
          </div>

          {picking && (
            <div className="pp-feedslide">
              <div className="pp-chips">
                {SCENE_LIST.map((sc) => (
                  <button
                    key={sc.k}
                    type="button"
                    className={`pp-chip${myPick === sc.k ? ' on' : ''}`}
                    onClick={() => { onPick(sc.k); setPicking(false) }}
                  >{sc.e} {sc.n}</button>
                ))}
              </div>
            </div>
          )}

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
      )}
    </details>
  )
}