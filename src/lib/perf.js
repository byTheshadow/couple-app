/* ===========================================================================
   背景动画的暂停开关（省电、防发烫）
   - 切到后台 / 锁屏：自动暂停（document.hidden）
   - 页面自己需要静态背景（比如聊天页要待很久）：holdBgPause('chat')，
     拿到一个释放函数，页面卸载时调用即可
   - 引用计数：多个人同时要求暂停时，最后一个松开才恢复。
     以前是直接 toggleAttribute，聊天页的暂停会被这里的「回到前台」清掉，
     结果切过一次后台、再回来，背景就一直转 —— 用久了发烫的一个来源。
   =========================================================================== */

const holders = new Set()

function sync() {
  if (typeof document === 'undefined') return
  const paused = holders.size > 0 || document.hidden
  document.documentElement.toggleAttribute('data-bg-paused', paused)
}

/** 要求背景静止；返回的函数用来撤销。owner 只是给人看的名字。 */
export function holdBgPause(owner) {
  holders.add(owner)
  sync()
  return () => {
    holders.delete(owner)
    sync()
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', sync)
  sync()
}