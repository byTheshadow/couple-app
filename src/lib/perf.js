// 切到后台 / 锁屏时暂停背景光斑动画，省电防发烫；回到前台自动恢复。
// 只需在 App.jsx 里 import 一次（副作用模块，不需要调用任何函数）。

function applyBgPaused(paused) {
  document.documentElement.toggleAttribute('data-bg-paused', paused)
}

applyBgPaused(document.hidden)
document.addEventListener('visibilitychange', () => {
  applyBgPaused(document.hidden)
})