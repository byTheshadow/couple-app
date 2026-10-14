import { useCallback, useState } from 'react'

const KEY = 'couple-theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'light' } catch { return 'light' }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* 隐私模式下忽略 */ }
}

// 首次加载立刻生效，避免闪一下
applyTheme(getTheme())

export function useTheme() {
  const [theme, setTheme] = useState(getTheme)
  const toggle = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light'
    applyTheme(next)
    setTheme(next)
  }, [theme])
  return { theme, toggle }
}
