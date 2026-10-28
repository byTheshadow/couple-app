/* =====================================================================
   晚霞主题的「时间配色」：根据当地时间算出 4 个颜色，写进 <html> 的
   --dk1（顶）--dk2 --dk3（底）--dk4（光晕），每分钟更新一次。
   颜色怎么变、变多慢，在 src/dusk.css 里（transition 那一行）。
   想改某个时段的颜色：改下面 STOPS 里对应那一行就行。
   ===================================================================== */

// [小时, [顶, 中, 底, 光晕]]；首尾相同，所以 24 点和 0 点能无缝接上
const STOPS = [
  [0, ['#9aa3d9', '#b9a9e0', '#dcb8d0', '#a98cf0']], // 深夜：月光般的淡紫
  [5.5, ['#b4b8ea', '#f1c4d3', '#ffd8b4', '#ff9a7a']], // 黎明：粉橘
  [9, ['#a8cdf0', '#cfe3f3', '#fbe9cc', '#ffd98a']], // 上午：清透的蓝与奶油
  [13, ['#9fcdf2', '#d3e8f6', '#fdf3d8', '#ffe9a0']], // 正午：明亮
  [17.5, ['#a4aee3', '#c4c4e7', '#f8dcc0', '#ff8a3d']], // 日落：和开屏页一样
  [20.5, ['#8f94d6', '#b49ddc', '#f0b79e', '#e5722b']], // 黄昏尾声：紫里透橙
  [24, ['#9aa3d9', '#b9a9e0', '#dcb8d0', '#a98cf0']],
]

const toRgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

export function palette(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60
  let i = STOPS.findIndex((s, k) => k < STOPS.length - 1 && h >= s[0] && h < STOPS[k + 1][0])
  if (i < 0) i = STOPS.length - 2
  const [h0, c0] = STOPS[i]
  const [h1, c1] = STOPS[i + 1]
  const t = (h - h0) / (h1 - h0)
  return c0.map((c, k) => {
    const a = toRgb(c)
    const b = toRgb(c1[k])
    return toHex(a.map((v, j) => v + (b[j] - v) * t))
  })
}

export function applyDusk() {
  if (typeof document === 'undefined') return
  const style = document.documentElement.style
  palette().forEach((c, k) => style.setProperty(`--dk${k + 1}`, c))
}

// 一加载就写好颜色（不管当前是不是晚霞主题，这样切过去时颜色是现成的）
applyDusk()
const isDusk = () => document.documentElement.dataset.theme === 'dusk'
const tick = () => { if (isDusk()) applyDusk() }

if (typeof window !== 'undefined') {
  // 以前是 1 分钟一次：颜色每次变一点、过渡要跑 40 秒，等于整屏渐变一直在重画。
  // 5 分钟对一次表就够（色的变化肉眼看不出来），省下来的都是电。
  setInterval(tick, 5 * 60 * 1000)
  // 回到前台立刻对一次表（补上离开这段时间的颜色变化）
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick() })
}