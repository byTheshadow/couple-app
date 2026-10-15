import { useEffect } from 'react'

/**
 * 页面滚动交互。在页面组件里调用一次 useScrollFx() 即可。
 * 通过 DOM 属性声明，不需要给元素写任何 JS：
 *   .rv          进入视口时淡入上浮（.in 由本 hook 添加；用 style={{'--rd': '.1s'}} 控制延迟）
 *   data-depth   滚动时按"离屏幕中心的距离"倾斜 + 缩放（写 --dp / --da）
 *   data-sp      顶部滚动进度 0~1（写 --sp），用于标题收起、迷你状态条淡入
 *   data-sy      滚动像素（写 --sy），用于背景光斑视差
 * 另外在 <html> 上写 data-dir="up|down"，底部导航据此自动收起 / 弹出。
 *
 * 性能：自定义属性只写在具体元素上，不写 :root，避免整棵树样式重算。
 */
export function useScrollFx() {
  useEffect(() => {
    const root = document.documentElement
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ---- 进入视口显现 ----
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    )
    const scan = () => document.querySelectorAll('.rv:not(.in)').forEach((el) => io.observe(el))
    scan()
    const host = document.getElementById('root') || document.body
    const mo = new MutationObserver(scan)
    mo.observe(host, { childList: true, subtree: true })

    // ---- 滚动联动 ----
    let lastY = window.scrollY
    let raf = 0
    const setAttr = (k, v) => { if (root.dataset[k] !== v) root.dataset[k] = v }

    const frame = () => {
      raf = 0
      const y = Math.max(0, window.scrollY)
      const vh = window.innerHeight

      const sp = Math.min(1, y / 140).toFixed(3)
      document.querySelectorAll('[data-sp]').forEach((el) => el.style.setProperty('--sp', sp))

      if (!reduce) {
        const sy = y.toFixed(1)
        document.querySelectorAll('[data-sy]').forEach((el) => el.style.setProperty('--sy', sy))
        document.querySelectorAll('[data-depth]').forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.bottom < -240 || r.top > vh + 240) return
          const c = Math.max(-1.2, Math.min(1.2, (r.top + r.height / 2 - vh / 2) / (vh / 2)))
          el.style.setProperty('--dp', c.toFixed(3))
          el.style.setProperty('--da', Math.abs(c).toFixed(3))
        })
      }

      const dy = y - lastY
      if (Math.abs(dy) > 8) { setAttr('dir', dy > 0 ? 'down' : 'up'); lastY = y }
      if (y < 60 || y + vh >= root.scrollHeight - 48) setAttr('dir', 'up')
    }

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame) }
    frame()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
      io.disconnect()
      mo.disconnect()
      delete root.dataset.dir
    }
  }, [])
}