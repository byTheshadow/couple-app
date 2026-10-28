/* ===========================================================================
   临时性能读数：地址里带 perf 才会出现（例如 /#/chat?perf=1），平时完全不存在。
   显示：FPS、这一秒里最慢的一帧、长任务次数（长任务 = 主线程卡了 >50ms 的那次）。
   点一下读数就清零，方便「滑动 / 打字 / 什么都不做」分别看一遍。
   不需要了：删掉本文件，再删掉 main.jsx 里那一行 import 即可。
   =========================================================================== */

const ON = typeof location !== 'undefined' && /[?&]perf(=|&|$)/.test(location.hash || '')

if (ON && typeof document !== 'undefined') {
  const el = document.createElement('div')
  el.style.cssText = [
    'position:fixed', 'top:6px', 'left:6px', 'z-index:99999',
    'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
    'background:rgba(0,0,0,.72)', 'color:#9ff29f', 'padding:5px 7px',
    'border-radius:6px', 'pointer-events:auto', 'white-space:nowrap',
  ].join(';')
  el.title = '点一下清零'
  document.body.appendChild(el)

  let frames = 0
  let worst = 0
  let longTasks = 0
  let last = performance.now()
  let t0 = last

  try {
    new PerformanceObserver((list) => { longTasks += list.getEntries().length })
      .observe({ entryTypes: ['longtask'] })
  } catch (e) { /* Safari 不支持 longtask，那就不显示次数 */ }

  const loop = (now) => {
    frames += 1
    const dt = now - last
    last = now
    if (dt > worst) worst = dt
    if (now - t0 >= 1000) {
      const fps = Math.round((frames * 1000) / (now - t0))
      el.textContent = `${fps} fps · 最慢 ${Math.round(worst)}ms · 长任务 ${longTasks}`
      frames = 0
      worst = 0
      t0 = now
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  el.addEventListener('click', () => { longTasks = 0 })
}