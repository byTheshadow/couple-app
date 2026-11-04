// 图标套装：一套图标 = 主屏上一个可选的「安装入口」。
//
// 加一套：在 public/icon-sets/<id>/ 里放三个 PNG
//   icon-192.png / icon-512.png   （必须）
//   apple-touch-icon.png           （180×180，iOS 用；没有就退回 icon-192）
// 然后在下面加一行。构建时会自动生成 <id>.html（见 scripts/stamp-icon-entries.mjs）。
export const ICON_SETS = [
  { id: 'default', name: '夜（默认）', desc: '现在主屏上那枚，不用换', builtin: true },
  { id: 'cream', name: '奶油', desc: '暖沙底，琥珀光晕' },
  { id: 'rain', name: '雨夜', desc: '深夜蓝，冷光' },
  { id: 'forest', name: '森林', desc: '墨绿，苔光' },
  { id: 'snow', name: '雪', desc: '浅底冷灰，白光' },
]
