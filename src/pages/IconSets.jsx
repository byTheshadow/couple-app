import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Svg } from '../components/Icon'
import TabBar from '../components/TabBar'
import { ICON_SETS } from '../lib/iconSets'
import { useAuth } from '../lib/auth'
import { useChatUnread } from '../lib/chat'
import { useOutfitBadge } from '../lib/badges'
import { appBadgeCount } from '../lib/badgeCount'
import './icons.css'

const ACTIVE_KEY = 'icon-set'

/**
 * 换图标：主屏图标不是网页能改的，只能在「添加到主屏幕」那一刻定下来。
 * 所以每套图标都有一个自己的安装入口 <id>.html（构建时生成，见 scripts/stamp-icon-entries.mjs），
 * 这里只负责把用户送过去——必须是整页跳转，不能走路由。
 */
export default function IconSets() {
  const navigate = useNavigate()
  const [broken, setBroken] = useState([])
  const { me } = useAuth()
  const pending = useOutfitBadge(me && me.id)
  const unread = useChatUnread(me && me.id)
  const badgeN = appBadgeCount(pending, unread)
  const canBadge = typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function'
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  const isIOS = typeof navigator !== 'undefined'
    && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  // iOS 规定：没有通知权限就不画角标（WebKit 官方说明）。只申请权限，不会发推送。
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'))
  const askNotify = async () => {
    if (typeof Notification === 'undefined') return
    try {
      const r = await Notification.requestPermission()
      setPerm(r)
      if (r === 'granted' && typeof navigator.setAppBadge === 'function' && badgeN > 0) navigator.setAppBadge(badgeN)
    } catch { /* 用户拒绝 / 环境不支持 */ }
  }
  const sets = ICON_SETS

  // 网页改不了主屏图标：真正生效是在「添加到主屏幕」那一刻。
  // 这里记的是「你上次选的是哪套」，用来把「已启用」标出来——只记在本机。
  const [active, setActive] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY) || 'default' } catch { return 'default' }
  })
  const [note, setNote] = useState('')

  const remember = (id) => {
    try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* 隐身模式写不进去 */ }
    setActive(id)
  }

  const install = (id) => {
    remember(id)
    // 整页跳转：让浏览器真的去加载 <id>.html，那一刻它才读得到这套图标的 apple-touch-icon / manifest
    window.location.assign(`./${id}.html`)
  }

  const restoreDefault = () => {
    remember('default')
    setNote('已切回默认。把主屏上的旧图标删掉，再从这里「添加到主屏幕」一次，图标才会变回默认那个。')
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
          {note && <div className="ics-note">{note}</div>}
          <p className="h-sub ics-hint">「已启用」是这台手机上回选的那套；主屏上的图标要重新「添加到主屏幕」才会换。</p>
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
                {miss ? (
                  <span className="ics-now">图没放</span>
                ) : active === s.id ? (
                  <span className="ics-now">已启用</span>
                ) : s.builtin ? (
                  <button type="button" className="mini tap" onClick={restoreDefault}>恢复默认</button>
                ) : (
                  <button type="button" className="mini tap" onClick={() => install(s.id)}>用这套</button>
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
          <div className="ics-check">
            图标角标：{!canBadge ? (isAndroid ? '安卓浏览器没实现这个 API' : '这台设备 / 这个打开方式不支持')
              : isIOS && perm !== 'granted' ? 'iOS 要先允许通知，角标才会出现'
                : `已开启，当前 ${badgeN} 件`}
          </div>
          {!canBadge && (
            <div className="ics-check-sub">
              {isAndroid
                ? 'Chrome 和三星浏览器都不支持 Badging API；想让桌面图标有提示，只能走推送。'
                : 'iOS 需要 16.4 以上，而且必须从主屏图标打开；在 Safari 标签页里不算。'}
            </div>
          )}
          {canBadge && isIOS && perm === 'default' && (
            <>
              <button type="button" className="mini tap ics-check-btn" onClick={askNotify}>允许通知（角标要用）</button>
              <div className="ics-check-sub">只申请权限，不会给你发推送。iOS 没这个权限就不显示角标。</div>
            </>
          )}
          {canBadge && isIOS && perm === 'denied' && (
            <div className="ics-check-sub">通知被拒绝了：到 iPhone「设置 → 通知 → US」里打开，再回来这一页。</div>
          )}
          装完想换：先把主屏上的旧图标删掉，再回来装另一套。桌面上同时装两套会变成两个图标。<br />
          iOS 16.4 以下不认这套；用浏览器标签页打开也不会生效——必须是主屏上那个图标。
        </div>
      </section>

      <TabBar />
      </main>
    </div>
  )
}
