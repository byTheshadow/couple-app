// 构建后给每套图标生成一个「安装入口」：
//   dist/<id>.html                 dist/index.html 的副本，只换 apple-touch-icon 和 manifest
//   dist/manifest-<id>.webmanifest 主 manifest 的副本，icons / start_url / id 换成这一套
//
// 为什么要独立文件：换主屏图标只能发生在「添加到主屏幕」那一刻——
// iOS 读那个页面的 <link rel="apple-touch-icon">，安卓读那个页面的 manifest。
// 同一个 index.html 没法同时是几套图标，所以每套一份入口。
//
// 跑法：node scripts/stamp-icon-entries.mjs（npm run build 会自动跑）
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ICON_SETS } from '../src/lib/iconSets.js'

/** 把 <link rel="x" href="..."> 换掉；页面里没有就插到 </head> 前 */
export function setLink(html, rel, href) {
  const re = new RegExp(`<link[^>]*\\brel="${rel}"[^>]*>`, 'i')
  const tag = `<link rel="${rel}" href="${href}">`
  if (re.test(html)) return html.replace(re, tag)
  return html.includes('</head>') ? html.replace('</head>', `  ${tag}\n</head>`) : html + tag
}

function readBaseManifest(dist) {
  for (const name of ['manifest.webmanifest', 'manifest.json']) {
    const p = path.join(dist, name)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  return null
}

/** 在安装入口页顶部插一条提示：让人确认「现在这页装的是哪一套」；装到主屏（standalone）后自动消失 */
export function withHint(html, name) {
  const css = 'position:fixed;left:0;right:0;top:0;z-index:9999;padding:10px 14px;background:#e5484d;color:#fff;font:13px/1.45 -apple-system,system-ui,sans-serif;text-align:center'
  const tag = `<div id="icon-hint" style="${css}">这一页装出来的是「${name}」图标 · 在 Safari 里点分享 → 添加到主屏幕<style>@media (display-mode:standalone){#icon-hint{display:none}}</style></div>`
  return html.replace(/<body([^>]*)>/, (m, attrs) => `<body${attrs}>${tag}`)
}
export function stampIconEntries({ dist = 'dist', publicDir = 'public', sets = ICON_SETS, log = console.log, warn = console.warn } = {}) {
  const index = path.join(dist, 'index.html')
  if (!fs.existsSync(index)) {
    warn('[icons] 没找到 dist/index.html，跳过（先 npm run build）')
    return { written: [], skipped: [] }
  }
  const html = fs.readFileSync(index, 'utf8')
  const base = readBaseManifest(dist)
  if (!base) warn('[icons] 没找到 manifest，生成的入口会沿用默认图标')

  const written = []
  const skipped = []
  for (const s of sets) {
    if (s.builtin) continue
    const dir = path.join(publicDir, 'icon-sets', s.id)
    const has = (n) => fs.existsSync(path.join(dir, n))
    if (!has('icon-192.png') || !has('icon-512.png')) {
      skipped.push(s.id)
      warn(`[icons] ${s.id} 缺 icon-192.png / icon-512.png，跳过`)
      continue
    }
    const touch = has('apple-touch-icon.png') ? `./icon-sets/${s.id}/apple-touch-icon.png` : `./icon-sets/${s.id}/icon-192.png`
    const out = setLink(setLink(html, 'apple-touch-icon', touch), 'manifest', `./manifest-${s.id}.webmanifest`)
    fs.writeFileSync(path.join(dist, `${s.id}.html`), withHint(out, s.name))

    const icons = [
      { src: `./icon-sets/${s.id}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `./icon-sets/${s.id}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `./icon-sets/${s.id}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]
    const m = {
      ...(base || { name: 'US', short_name: 'US', display: 'standalone', theme_color: '#08080a' }),
      id: `./${s.id}.html`,
      start_url: `./${s.id}.html`,
      icons,
    }
    fs.writeFileSync(path.join(dist, `manifest-${s.id}.webmanifest`), JSON.stringify(m, null, 2))
    written.push(s.id)
  }

  const setsDir = path.join(publicDir, 'icon-sets')
  if (fs.existsSync(setsDir)) {
    for (const d of fs.readdirSync(setsDir)) {
      if (d.startsWith('.')) continue
      if (!fs.statSync(path.join(setsDir, d)).isDirectory()) continue
      if (!sets.some((s) => s.id === d)) warn(`[icons] public/icon-sets/${d} 还没在 src/lib/iconSets.js 里登记`)
    }
  }
  log(`[icons] 生成 ${written.length} 套安装入口${written.length ? '：' + written.join(', ') : ''}${skipped.length ? `（跳过 ${skipped.join(', ')}）` : ''}`)
  return { written, skipped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  stampIconEntries({ dist: path.join(process.cwd(), 'dist'), publicDir: path.join(process.cwd(), 'public') })
}
