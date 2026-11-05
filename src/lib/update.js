/* ===========================================================================
   部署自愈。
   背景：每次部署，构建产物都换新的哈希文件名，旧的从服务器上删掉。
   如果浏览器还拿着上一版 index，懒加载就会去要一个已经不存在的分块 —— 404，
   那一条路由就「进不去」（别的路由因为缓存里还有，看着正常）。
   让用户手动清缓存不现实，所以这里做两件事：

   1) 分块加载失败（Vite 抛 vite:preloadError）：清掉旧 SW 和缓存，刷新一次；
   2) 启动时对一次现网 index：正在跑的不是现网那一版，同样自愈。

   两条都带刹车：同一个「目标版本」只自愈一次，30 秒内不重复刷新，
   免得真的坏掉时把页面刷成幻灯片。
   =========================================================================== */

const AT = 'app.heal.at'
const TRIED = 'app.heal.tried'
const COOL = 30000

function coolDown() {
  try { return Date.now() - Number(sessionStorage.getItem(AT) || 0) > COOL } catch (e) { return true }
}
function markAt() { try { sessionStorage.setItem(AT, String(Date.now())) } catch (e) { /* 隐身模式 */ } }
function alreadyTried(version) {
  try { return sessionStorage.getItem(TRIED) === version } catch (e) { return false }
}
function markTried(version) { try { sessionStorage.setItem(TRIED, String(version)) } catch (e) { /* 同上 */ } }

/** 清 Service Worker + Cache Storage。清不干净也继续刷新，最多多刷一次 */
async function purge() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch (e) { /* 有些浏览器没有 caches */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch (e) { /* 同上 */ }
}

/** version 传目标版本时才做「只试一次」的去重；不传就只受 30 秒冷却限制 */
async function heal(version) {
  if (!coolDown()) return
  if (version && alreadyTried(version)) return
  markAt()
  if (version) markTried(version)
  await purge()
  // 不只 reload：给 URL 挂一个时间戳，绕过 index.html 自己的 HTTP 缓存，
  // 否则清完 SW 还是可能又拿到同一份旧 html
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('v', String(Date.now()))
    window.location.replace(url.toString())
  } catch (e) {
    window.location.reload()
  }
}

/** 懒加载分块 404：这条路由进不去，直接自愈 */
export function watchPreloadError() {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    heal(null)
  })
}

/** 启动时对版本：跑的和现网不是同一版就自愈。离线 / 被拦 / 认不出来都静默跳过 */
export function checkVersion() {
  const run = async () => {
    let html = ''
    try {
      const r = await fetch('./index.html?v=' + Date.now(), { cache: 'no-store' })
      if (!r.ok) return
      html = await r.text()
    } catch (e) {
      return
    }
    const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)
    const script = [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(s))
    if (!m || !script) return
    const live = m[0].split('/').pop()
    const running = script.split('/').pop()
    if (live !== running) heal(live)
  }
  // 首屏先渲染完再说，别抢启动时间
  if (document.readyState === 'complete') setTimeout(run, 1500)
  else window.addEventListener('load', () => setTimeout(run, 1500), { once: true })
}