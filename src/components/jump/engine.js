/* ===========================================================================
   小物 · 一起跳一跳 —— 物理 / 落地 / 分数（纯函数，不碰 DOM / 网络）
   规则见 docs/jump-design.md §3、§6、§8。所有数字都是「可调常数」。
   蓄力：按住 0..900ms，满蓄力 vx = 390，目标落点约 210px。
   =========================================================================== */

export const VIEW = { W: 360, H: 540, camX: 120 }

export const PHYS = {
  chargeMs: 900,   // 按住多久算满蓄力
  vx0: 90,         // 蓄力 0 时的水平速度
  vxD: 300,        // 满蓄力再加多少
  vy0: -520,       // 起跳竖直速度
  g: 1800,         // 重力
  maxStep: 3,      // 一跳最多前进几块（和 RPC 的 1..3 对齐）
  fallY: 700,      // 脚底越过这里就算掉下去
  fallMs: 600,     // 掉下去以后多久回到上一块
  springMs: 250,   // 落弹簧后多久自动弹
  hopMs: 620,      // 弹簧自动弹的飞行时间（固定弧线，不会失手）
  perfect: 0.18,   // 离中心 < 18% 平台宽 = 完美
  narrow: 0.35,    // 答错：下一块窄 35%
}

/** 按住时长 → 蓄力 0..1。按住 0ms 也给 0.04，免得点一下原地抖 */
export function powerOf(heldMs) {
  const p = (heldMs || 0) / PHYS.chargeMs
  return Math.max(0.04, Math.min(1, p))
}

/** 蓄力 → 起跳速度 */
export function velocityOf(power) {
  return { vx: PHYS.vx0 + power * PHYS.vxD, vy: PHYS.vy0 }
}

/** 平台当前的 x：移动平台左右 ±24px，周期 2.4s，相位由生成器给 */
export function platformX(p, t) {
  if (!p || p.type !== 'moving') return p ? p.x : 0
  return p.x + Math.sin(t * (Math.PI * 2 / 2.4) + p.phase) * 24
}

/** 平台的当前宽度（答错以后下一块窄 35%） */
export function widthOf(p, narrow) {
  return p.w * (1 - (narrow ? PHYS.narrow : 0))
}

/** 落点离中心够近 = 完美 */
export function isPerfect(x, p, w) {
  return Math.abs(x - p.x) <= Math.max(4, (w == null ? p.w : w) * PHYS.perfect)
}

/** 一帧重力：直接改 ball（x, y, vx, vy） */
export function stepBall(ball, dt) {
  ball.vy += PHYS.g * dt
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt
  return ball
}

/**
 * 这一子步有没有踩到某块平台的顶面：上一帧还在上面，这一帧已经穿过去，且 x 落在宽度里。
 * 只判下落（vy > 0），只判 i > from 的几块。
 */
export function hitPlatform(prevY, ball, p, w, t) {
  if (ball.vy <= 0) return false
  const top = p.y
  if (prevY > top || ball.y < top) return false
  const cx = platformX(p, t)
  return Math.abs(ball.x - cx) <= (w == null ? p.w : w) / 2 + 2
}

/** 连击奖励：每 3 连完美额外 +1（第 3、6、9… 次） */
export function comboBonus(combo) {
  return combo > 0 && combo % 3 === 0 ? 1 : 0
}

/**
 * 一次落地加多少分。
 * 普通 = 1；完美 +2；每 3 连完美 +1；礼物 +3；传送直接 3（1 + 跳过 2 块，不叠完美）。
 * 单跳最大 7（普通 1 + 完美 2 + 连击 1 + 礼物 3），RPC 再夹到 0..8。
 */
export function jumpGain({ type, perfect, combo }) {
  if (type === 'teleport') return 3
  let gain = 1
  if (perfect) {
    gain += 2
    gain += comboBonus(combo)
  }
  if (type === 'gift') gain += 3
  return gain
}

/** 弹簧：落弹簧 +1，自动落地 +1，一共 2 */
export const SPRING_GAIN = 2

/** 平地上满蓄力能飞多远（用于测试和调参，不参与游戏判定） */
export function rangeOf(power) {
  const v = velocityOf(power)
  return v.vx * (2 * Math.abs(v.vy) / PHYS.g)
}

/**
 * 离线模拟一次起跳（测试用）：从 (x, y) 出发，落到 from+1..from+3 里的哪一块。
 * 返回 { land, x, perfect, distance, time }；没踩到就是 land: null。
 */
export function simulate({ x, y, power, platforms, from, t = 0, narrow = null, dt = 1 / 120, maxT = 3 }) {
  const v = velocityOf(power)
  const ball = { x, y, vx: v.vx, vy: v.vy }
  const last = Math.min(platforms.length - 1, from + PHYS.maxStep)
  for (let time = 0; time < maxT; time += dt) {
    const prevY = ball.y
    stepBall(ball, dt)
    if (ball.vy > 0) {
      for (let i = from + 1; i <= last; i++) {
        const p = platforms[i]
        if (!p) continue
        const w = widthOf(p, narrow && narrow[i])
        if (hitPlatform(prevY, ball, p, w, t + time)) {
          return { land: p, x: ball.x, perfect: isPerfect(ball.x, p, w), distance: ball.x - x, time }
        }
      }
    }
    if (ball.y > PHYS.fallY) break
  }
  return { land: null, x: ball.x, perfect: false, distance: ball.x - x, time: maxT }
}