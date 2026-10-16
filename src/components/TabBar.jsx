import { NavLink } from 'react-router-dom'
import { Svg } from './Icon'
import { useAuth } from '../lib/auth'
import { useChatUnread } from '../lib/chat'

// 画板 / 小游戏做完后在这里加一行即可
const TABS = [
  { to: '/', label: '首页', icon: 'home', end: true },
  { to: '/chat', label: '聊天', icon: 'chat' },
  { to: '/status', label: '状态', icon: 'sliders' },
  { to: '/toys', label: '小物', icon: 'drawer' },
]

// hidden：聊天页输入文字时把导航收起来
export default function TabBar({ hidden = false }) {
  const { me } = useAuth()
  const unread = useChatUnread(me?.id)
  return (
    <nav className={`tabbar glass${hidden ? ' hide' : ''}`} aria-label="主导航" aria-hidden={hidden || undefined}>
      {TABS.map((t) => (
               <NavLink key={t.to} to={t.to} end={t.end} tabIndex={hidden ? -1 : undefined} style={{ flex: '1 1 0', width: 'auto', maxWidth: 76, minWidth: 0 }} className={({ isActive }) => `tab tap${isActive ? ' on' : ''}`}>
          {({ isActive }) => (
            <>
              <Svg name={t.icon} size={20} stroke={1.7} /><span>{t.label}</span>
              {t.to === '/chat' && unread > 0 && !isActive && <i className="tab-unread">{unread > 9 ? '9+' : unread}</i>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
