import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Svg } from '../components/Icon'
import TabBar from '../components/TabBar'
import { ICON_SETS } from '../lib/iconSets'
import './icons.css'

/**
 * 换图标：主屏图标不是网页能改的，只能在「添加到主屏幕」那一刻定下来。
 * 所以每套图标都有一个自己的安装入口 <id>.html（构建时生成，见 scripts/stamp-icon-entries.mjs），
 * 这里只负责把用户送过去——必须是整页跳转，不能走路由。
 */
export default function IconSets() {
  const navigate = useNavigate()
  const [broken, setBroken] = useState([])
  const sets = ICON_SETS

  const install = (id) => {
    // 整页跳转：让浏览器真的去加载 <id>.html，那一刻它才读得到这套图标的 apple-touch-icon / manifest
    window.location.assign(`./${id}.html`)
  }

  return (
    <div className="shell">
      <div className="bg">
        <div className="blobs">
          <div className="blob a" /><div className="blob b" /><div className="blob c" />
          <div className="blob d" /><div className="blob e" />
        </div>
        <div className="aurora" />
      </div>

      <main className="page">
      <div className="top">
        <div className="col" style={{ gap: 6 }}>
          <div className="date">设置</div>
          <h1 className="h-title">换图标</h1>
        </div>
        <button type="button" className="glass icon-btn tap" onClick={() => navigate(-1)} aria-label="返回">
          <Svg name="back" size={20} />
        </button>
      </div>

      <section className="win">
        <header className="tb">
          <Svg name="phones" size={14} />
          <b>装到手机.app</b>
          <span className="grow" />
          <span className="mono">{sets.length} 套</span>
        </header>
        <div className="wb">
          <p className="h-sub ics-tip">挑一套，从这一页装到主屏，图标就是它。</p>
          {sets.map((s) => {
            const miss = broken.includes(s.id)
            return (
              <div className="ics" key={s.id}>
                {miss ? (
                  <span className="ics-miss" aria-hidden="true">?</span>
                ) : (
                  <img
                    src={s.builtin ? './icon-192.png' : `./icon-sets/${s.id}/icon-192.png`}
                    alt=""
                    width={56}
                    height={56}
                    onError={() => setBroken((b) => (b.includes(s.id) ? b : [...b, s.id]))}
                  />
                )}
                <div className="ics-txt">
                  <b>{s.name}</b>
                  <small>{miss ? `没找到图：icon-sets/${s.id}/` : s.desc}</small>
                </div>
                {s.builtin ? (
                  <span className="ics-now">默认</span>
                ) : miss ? (
                  <span className="ics-now">图没放</span>
                ) : (
                  <button type="button" className="mini tap" onClick={() => install(s.id)}>用这套装</button>
                )}
              </div>
            )
          })}
        </div>
        <footer className="wf">iOS：分享 → 添加到主屏幕　·　安卓：菜单 → 安装应用</footer>
      </section>

      <section className="win">
        <header className="tb"><Svg name="note" size={14} /><b>说明.txt</b></header>
        <div className="wb h-sub" style={{ lineHeight: 1.7 }}>
          装完想换：先把主屏上的旧图标删掉，再回来装另一套。桌面上同时装两套会变成两个图标。<br />
          iOS 16.4 以下不认这套；用浏览器标签页打开也不会生效——必须是主屏上那个图标。
        </div>
      </section>

      <TabBar />
      </main>
    </div>
  )
}
