import { NavLink } from 'react-router-dom'
import { Svg } from './Icon'

// 目前只有两个入口；信箱 / 画板 / 聊天做完后在这里加一行即可
const TABS = [
  { to: '/', label: '首页', icon: 'home', end: true },
  { to: '/status', label: '状态', icon: 'sliders' },
]

export default function TabBar() {
  return (
    <nav className="tabbar glass" aria-label="主导航">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab tap${isActive ? ' on' : ''}`}>
          <Svg name={t.icon} size={20} stroke={1.7} /><span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
