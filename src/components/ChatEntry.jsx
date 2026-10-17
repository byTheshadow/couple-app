import { Link } from 'react-router-dom'
import { Svg } from './Icon'
import { useAuth } from '../lib/auth'
import { useChatUnread } from '../lib/chat'

/**
 * 聊天入口：不放在底部导航里了，缩成首页「我的档案」标题栏上的一个小图标。
 * 有未读消息时右上角亮一个小红点（不显示数字，保持低调）。
 * 想换位置：在别处 <ChatEntry /> 一下就行，它自己带未读逻辑。
 */
export default function ChatEntry() {
  const { me } = useAuth()
  const unread = useChatUnread(me?.id)
  return (
    <Link
      to="/chat"
      className="tap"
      aria-label={unread > 0 ? `聊天，${unread} 条未读` : '聊天'}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        color: 'inherit',
        opacity: 0.85,
      }}
    >
      <Svg name="chat" size={15} stroke={1.8} />
      {unread > 0 && (
        <i
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#e5484d',
          }}
        />
      )}
    </Link>
  )
}