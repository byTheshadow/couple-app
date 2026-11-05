import { NavLink } from 'react-router-dom'
import { Svg } from './Icon'
import NoticeDot from './NoticeDot'
import { useAuth } from '../lib/auth'
import { useChatUnread } from '../lib/chat'
import { useOutfitBadge } from '../lib/badges'
import { useAppBadge } from '../lib/appBadge'
import { useCalPendingCount } from '../lib/hooks'
import { appBadgeCount } from '../lib/badgeCount'

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
  const { me } = useAuth()
  const pending = useOutfitBadge(me && me.id) // 小物里有几件事等着处理（目前只有像素小屋的换装请求）
  const unread = useChatUnread(me && me.id) // 没读的聊天
  const calPending = useCalPendingCount(me && me.id) // 日历里 TA 交了、等我验收的卡
  // 手机主屏图标上那个角标：三样加起来。只想要小物的话，把 unread / calPending 去掉
  useAppBadge(appBadgeCount(pending, unread, calPending))
  return (
    <nav className={`tabbar glass${hidden ? ' hide' : ''}`} aria-label="主导航" aria-hidden={hidden || undefined}>
      {TABS.map((t) => {
        const badged = t.to === '/toys' && pending > 0
        return (
          <NavLink key={t.to} to={t.to} end={t.end} tabIndex={hidden ? -1 : undefined} style={{ flex: '1 1 0', width: 'auto', maxWidth: 76, minWidth: 0 }} aria-label={badged ? `${t.label}，${pending} 件待处理` : undefined} className={({ isActive }) => `tab tap${isActive ? ' on' : ''}`}>
            <Svg name={t.icon} size={20} stroke={1.7} /><span>{t.label}</span>
            {badged && <NoticeDot n={pending} dot />}
          </NavLink>
        )
      })}
    </nav>
  )
}
