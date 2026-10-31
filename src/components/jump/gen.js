/* ===========================================================================
   小物 · 一起跳一跳 —— 平台生成（纯函数，不碰 DOM / 网络）
   同一条路 = 同一个 seed：两个人各自生成，看到的平台一模一样。
   规则见 docs/jump-design.md §4。改这里的公式 = 换一条路的样子：
   GEN 加一，并且让「换一条路」重置，否则同一个 seed 会长出不同的路。

   第二版（GEN = 2）：每 25 块一段，段首一块宽 72 的休息台；
   间距不变（40 块以后已经封顶），难度加在移动块的「数量 + 速度」上：
   移动块占比 2% → 6%，周期 2.4s → 1.8s，到第 100 块封顶。
   第三版（GEN = 3）：加「磁铁」平台（2%），落在上面下一跳自动吸到下一块中心。
   第四版（2026-10-31）：拾取物（喷气背包）。用独立的 hash01 流，**不消耗 buildRoad 的
   rng**，所以平台布局一个像素都不变：不用升 GEN，也不用让两个人再「换一条路」。
   第五版（2026-10-31 晚，GEN = 4）：弹簧 3% → 6%（用户说「多一些弹跳方块」）。
   只动类型阈值：弹簧从 3% 提到 6%，后面几档整体后移 0.03、宽度不变（传送 2% / 礼物 3% /
   移动 2%+段 / 磁铁 2% 都没少），间距 / 宽度 / 高度一个像素没动。
   类型序列变了 → 同一条旧路会长出不同的块，两个人必须各点一次「换一条路」（best 保留）。
   =========================================================================== */

export const GEN = 4

// 平台本身：逻辑像素（画布 360 × 540），16 = 8 格 × 2px
export const PLAT = {
  h: 16,
  w0: 64,
  wMin: 40,
  y0: 380,
  yMin: 250,
  yMax: 420,
  x0: 80,
}

// 间距：相邻两块之间的空隙（不是中心距）。中心和中心还差两个半宽，约 208 封顶
export const GAP = { base: 64, grow: 2, growMax: 80, rand: 24 }

// 问号平台：骰子 20%，但两条问号之间至少隔 3 个 index（中间至少 2 块），
// 所以实际密度约 15%，不是 20%。§4 写的就是这个骰子值，先按这个来。
export const QUIZ_P = 0.20
export const QUIZ_GAP = 3

// 段落：每 25 块一段，段首是休息台；100 块以后停在最后一段
export const SECTION_SIZE = 25
export const SECTIONS = [
  { no: 1, name: '热身' },
  { no: 2, name: '顺手' },
  { no: 3, name: '起风' },
  { no: 4, name: '长路' },
  { no: 5, name: '星河' },
]

/** 第 i 块属于哪一段（0..4） */
export function sectionOf(i) {
  const k = Math.floor((i || 0) / SECTION_SIZE)
  return Math.max(0, Math.min(SECTIONS.length - 1, k))
}

/** 第 i 块的段信息 { no, name } */
export function sectionMeta(i) {
  return SECTIONS[sectionOf(i)]
}

/** 确定性随机数：同一个 seed 永远产出同一串 [0,1)。经典 mulberry32。 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 移动平台的相位：单独用 seed + index 算，不消耗 rng，
// 免得以后加一个「移动」标记就把后面所有平台挤歪
function hash01(seed, n) {
  let h = Math.imul((seed >>> 0) ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// ---------- 拾取物（v4） ----------
// 独立哈希、独立概率：改这里不会动到平台（间距 / 宽度 / 类型 / 段落）。
export const PICKUP_P = 0.08   // 约 8%，平均每 12 块一个
export const PICKUP_UP = 58    // 飘在平台顶面上方多少像素
export const PICKUP_R = 22     // 抓取半宽：人从这个半径内经过就算吃到（满蓄力也不会擦过去）

/**
 * 第 i 块上方有没有可拾取物：'jet' | null。
 * - 不掺「天」：同一块今天明天都在，不会出现飞到一半道具消失；
 * - 起点和第 25/50/75… 的休息台不出（开局就送 / 到站休息时别分心）。
 */
export function pickupAt(seed, i) {
  const n = i | 0
  if (n <= 0 || n % SECTION_SIZE === 0) return null
  return hash01((seed ^ 0x5bf03635) >>> 0, n * 7919 + 13) < PICKUP_P ? 'jet' : null
}

/**
 * 生成 0..count-1 块平台。
 * 每块：{ i, x(中心), y(顶面), w, type, phase, sec, rest, period }
 * type: plain | quiz | spring | teleport | gift | moving
 * period: 移动平台一个来回的秒数（其它块也存着，没用到）
 */
export function buildRoad(seed, count = 40) {
  const n = Math.max(1, Math.floor(count) || 1)
  const rng = mulberry32(seed)
  const road = [{
    i: 0, x: PLAT.x0, y: PLAT.y0, w: PLAT.w0, type: 'plain', phase: 0,
    sec: 0, rest: false, period: 2.4,
  }]
  let lastQuiz = -99

  for (let i = 1; i < n; i++) {
    const prev = road[i - 1]
    const sec = sectionOf(i)
    const rest = i % SECTION_SIZE === 0
    const afterRest = i % SECTION_SIZE === 1

    // 每个平台固定消耗三次 rng：间距 / 高度 / 类型；休息台也消耗，保持序列稳定
    const gRoll = rng()
    // 休息台有 72 宽，中心离下一块更远：紧跟它的那一块把间距收 20，
    // 免得出「从休息台中心满蓄力也够不到」的必死跳
    const gap = rest
      ? 52 + gRoll * 12
      : GAP.base + Math.min(GAP.growMax, i * GAP.grow) + gRoll * GAP.rand - (afterRest ? 20 : 0)
    const w = rest ? 72 : Math.max(PLAT.wMin, PLAT.w0 - i * 0.5)
    const jitter = rest ? 18 : 36
    const y = clamp(prev.y + (rng() * 2 - 1) * jitter, PLAT.yMin, PLAT.yMax)

    // 一次 r 决定类型：问号没资格的时候按普通处理，不再往下顺延成特殊块
    // 阈值（GEN 4）：问号 0.20 / 弹簧 6% / 传送 2% / 礼物 3% / 移动 2%+段 / 磁铁 2%
    const roll = rng()
    let type = 'plain'
    if (!rest && i > 2) {
      if (roll < QUIZ_P) {
        if (i - lastQuiz >= QUIZ_GAP) {
          type = 'quiz'
          lastQuiz = i
        }
      } else if (roll < 0.26) type = 'spring'
      else if (roll < 0.28) type = 'teleport'
      else if (roll < 0.31) type = 'gift'
      else if (roll < 0.33 + 0.01 * sec) type = 'moving'
      else if (roll < 0.35 + 0.01 * sec) type = 'magnet'
    }

    road.push({
      i,
      x: prev.x + prev.w / 2 + gap + w / 2,
      y,
      w,
      type,
      phase: hash01(seed, i) * Math.PI * 2,
      sec,
      rest,
      period: 2.4 - 0.15 * sec,
    })
  }
  return road
}

/** 取第 i 块；越界就退回最后一块（生成器是顺序的，按理不会越界） */
export function platformAt(road, i) {
  if (!road || !road.length) return null
  const k = Math.max(0, Math.min(road.length - 1, i | 0))
  return road[k]
}