import { useEffect } from 'react'

/**
 * 手机主屏图标右上角那个角标（Badging API）。
 * - 只有「添加到主屏幕」的 PWA 才会显示：iOS 16.4+（Safari）、Android Chrome 81+、桌面 Chrome / Edge 81+
 * - 浏览器不支持就静默跳过（Firefox、老 Safari），不报错、不影响页面
 * - 只在 app 开着的时候能改；关掉以后角标停在最后一次的值，等下次打开才刷新
 *   （想让 app 关着也变，只能上 Web Push：service worker + VAPID + 服务端发推送，那是另一轮）
 */
export function useAppBadge(n) {
  useEffect(() => {
    const nav = typeof navigator === 'undefined' ? null : navigator
    if (!nav) return
    const v = Math.max(0, Math.floor(Number(n) || 0))
    const p = v > 0 ? nav.setAppBadge?.(v) : nav.clearAppBadge?.()
    // 没装到主屏 / 不支持时返回的是 rejected promise，别让它冒到控制台
    if (p && typeof p.catch === 'function') p.catch(() => {})
  }, [n])
}
