import { fmtBadge } from '../lib/badgeCount'

/**
 * 全站统一的角标。n 是「有几件待办」，0 的时候直接不渲染 DOM
 * （不要用 opacity: 0 占位，读屏会念出来）。
 *   <NoticeDot n={2} />       数字，超过 9 显示 9+
 *   <NoticeDot n={2} dot />   只要一个点（底部导航用）
 * 定位交给父元素：父元素 position: relative，.bdg 自己就是 absolute。
 * 无障碍：角标本身 aria-hidden，件数写进父元素的 aria-label。
 */
export default function NoticeDot({ n = 0, dot = false }) {
  const text = fmtBadge(n)
  if (!text) return null
  return <span className={`bdg${dot ? ' bdg-dot' : ''}`} aria-hidden="true">{dot ? null : text}</span>
}
