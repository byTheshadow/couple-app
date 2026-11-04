// 图标套装：一套 = 主屏上一个可选的「安装入口」。
//
// 一套需要三个文件（放在 public/icon-sets/<id>/）：
//   icon-192.png / icon-512.png  必须
//   apple-touch-icon.png         180×180，iOS 用；没有就退回 icon-192
// 加一套：放目录 + 在下面加一行。构建时会自动生成 <id>.html（见 scripts/stamp-icon-entries.mjs）。
export const ICON_SETS = [
  { id: 'default', name: '夜（默认）', desc: '原来的两枚圆，不换也行', builtin: true },
  { id: 'ink', name: '墨', desc: '纯黑底，衬线字标' },
  { id: 'night', name: '夜空', desc: '深蓝夜空，雪花在上' },
  { id: 'snow', name: '雪', desc: '冰蓝，雪花居中' },
  { id: 'dawn', name: '柔光', desc: '淡紫柔光' },
  { id: 'wave', name: '波纹', desc: '靛黑，一道光波' },
]