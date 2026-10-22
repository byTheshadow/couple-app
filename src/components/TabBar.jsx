import { NavLink } from 'react-router-dom'
import { Svg } from './Icon'

// 画板 / 小游戏做完后在这里加一行即可
// 聊天已经从底部导航拿出去了，入口在首页「我的档案」标题栏（见 ChatEntry.jsx）
const TABS = [
  { to: '/', label: '首页', icon: 'home', end: true },
  { to: '/status', label: '状态', icon: 'sliders' },
  { to: '/toys', label: '小物', icon: 'drawer' },
   { to: '/grudge', label: '记仇本', icon: 'grudge' },
]

// hidden：聊天页输入文字时把导航收起来
export default function TabBar({ hidden = false }) {
  return (
    <nav className={`tabbar glass${hidden ? ' hide' : ''}`} aria-label="主导航" aria-hidden={hidden || undefined}>
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} tabIndex={hidden ? -1 : undefined} style={{ flex: '1 1 0', width: 'auto', maxWidth: 76, minWidth: 0 }} className={({ isActive }) => `tab tap${isActive ? ' on' : ''}`}>
          <Svg name={t.icon} size={20} stroke={1.7} /><span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}