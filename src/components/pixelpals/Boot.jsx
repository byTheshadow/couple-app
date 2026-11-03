import { useEffect, useState } from 'react'
import './boot.css'

/* 像素小屋的专属加载页：纯 CSS 画的窗 + 两个小人从两头走到中间相遇，只负责「别白屏」。
   这一层不 import scenes.js / art.js，也不用 canvas —— 它自己必须比它等的东西轻。
      <PalBoot stage="script" />   等 Vite 的懒加载块（Toys.jsx 的 Suspense fallback）
      <PalBoot stage="data" />     等 pal_settings / pal_state（PixelPals 里 myPal.loading）
      <PalBoot stage="scene" where="巴黎 · 黄昏" />  等场景数据（下一轮接上） */

const STEP = { script: 0, data: 1, scene: 2 }
const TIP = ['正在加载页面', '正在读你们两个的小屋', '正在铺场景']
const STARS = [['12.4%', '17.5%', ''], ['24.2%', '10.5%', 'b'], ['39.2%', '25.3%', ''], ['64%', '13.1%', 'b'], ['81.7%', '28.8%', '']]

export default function PalBoot({ stage = 'script', where = '', onRetry }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(t)
  }, [])

  const i = STEP[stage] || 0

  return (
    <div className="ppb" role="status" aria-live="polite">
      <div className="ppb-win">
        <div className="ppb-sc">
          <i className="ppb-moon" />
          {STARS.map(([left, top, k]) => (
            <i key={left} className={`ppb-st ${k}`} style={{ left, top }} />
          ))}
          <i className="ppb-hill" />
          <i className="ppb-ground" />
          <div className="ppb-house">
            <i className="ppb-rf ppb-rf1" /><i className="ppb-rf ppb-rf2" /><i className="ppb-rf ppb-rf3" />
            <i className="ppb-body" /><i className="ppb-warm l" /><i className="ppb-warm r" /><i className="ppb-door" />
          </div>
          <div className="ppb-pals a"><i className="ppb-pal" /></div>
          <div className="ppb-pals b"><i className="ppb-pal b" /></div>
          <i className="ppb-heart" />
        </div>
      </div>

      <div className="ppb-msg"><b>正在进屋…</b><span>把你们两个的小屋点亮</span></div>
      <div className="ppb-steps">
        {[0, 1, 2].map((k) => <i key={k} className={k < i ? 'on' : k === i ? 'cur' : ''} />)}
      </div>
      <div className="ppb-where">第 {i + 1} 步 / 3 · {TIP[i]}{where ? ` · ${where}` : ''}</div>

      {slow && (
        <div className="ppb-slow">
          网好像有点慢
          <button type="button" onClick={onRetry || (() => window.location.reload())}>重试</button>
        </div>
      )}
    </div>
  )
}