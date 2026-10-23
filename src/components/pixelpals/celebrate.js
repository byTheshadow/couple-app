/* ===========================================================================
   像素小屋 · 下班结算的庆祝
   - 打工小人（u2）：金币雨 +「今日结算」
   - 代码小人（u1）：代码雨 + 彩纸 +「BUILD SUCCESS」
   画面里的粒子在这里画（canvas），中间那块文字横幅由 PixelPals.jsx 用 HTML 显示（字更清楚）。
   粒子挂在小人身上：actor.celeb。不碰服务器。
   =========================================================================== */
import { W, H, FLOOR, pick } from './art'

const rand = (a, b) => a + Math.random() * (b - a)
const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }

// 和服务端 pal_settle 同一条规则，只用来「回放动画」时估个数；真正发多少钱以服务端为准
export const INCOME = { base: 20, hourly: 5, maxHours: 12, moodBonus: 15 }
export function estimateIncome(settings, mood = 70) {
  const hours = Math.max(1, Math.min(INCOME.maxHours, settings.off_h - settings.work_h))
  const base = INCOME.base + INCOME.hourly * hours
  const bonus = mood >= 70 ? INCOME.moodBonus : 0
  return { hours, base, bonus, coins: base + bonus }
}

/* ---------- 粒子 ---------- */

const DUR = 4.6 // 一次庆祝持续几秒
const SPAWN_FOR = 2.6 // 前几秒一直往下掉东西，后面让它们自己落完

const CONF = ['#ff5c8a', '#ffd34d', '#5fd4ff', '#4dff8a', '#c7b8ff', '#ffffff']
const CODE = ['#4dff8a', '#4dff8a', '#5fd4ff', '#e8e8e8']

function makeCoin() {
  return { k: 'coin', x: rand(4, W - 4), y: -6, vy: rand(30, 60), ph: rand(0, 6.28), ground: FLOOR + rand(2, H - FLOOR - 7), bounced: false, landed: false }
}
function makeGlyph() {
  return { k: 'glyph', x: Math.round(rand(1, W - 2)), y: -8, vy: rand(55, 95), len: 2 + Math.floor(rand(0, 4)), c: pick(CODE) }
}
function makeConf() {
  return { k: 'conf', x: rand(2, W - 2), y: -4, vx: rand(-10, 10), vy: rand(22, 48), c: pick(CONF), ph: rand(0, 6.28) }
}

/** 开始一次庆祝。kind: 'coins'（打工小人）或 'build'（代码小人） */
export function startCelebration(a, kind) {
  a.celeb = { kind: kind === 'build' ? 'build' : 'coins', t: 0, spawn: 0, parts: [] }
}

export function stepCelebration(a, dt) {
  const c = a.celeb
  if (!c) return
  c.t += dt
  if (c.t >= DUR) { a.celeb = null; return }
  if (c.t < SPAWN_FOR) {
    c.spawn += dt * (c.kind === 'coins' ? 26 : 36)
    while (c.spawn >= 1) {
      c.spawn -= 1
      if (c.kind === 'coins') c.parts.push(makeCoin())
      else c.parts.push(Math.random() < 0.6 ? makeGlyph() : makeConf())
    }
  }
  for (const p of c.parts) {
    if (p.k === 'coin') {
      if (p.landed) continue
      p.vy += 70 * dt
      p.y += p.vy * dt
      p.ph += dt * 11
      if (p.y >= p.ground) {
        p.y = p.ground
        if (!p.bounced && p.vy > 20) { p.bounced = true; p.vy = -p.vy * 0.32 } else p.landed = true
      }
    } else if (p.k === 'glyph') {
      p.y += p.vy * dt
    } else {
      p.y += p.vy * dt
      p.ph += dt * 5
      p.x += (p.vx + Math.sin(p.ph) * 9) * dt
    }
  }
  c.parts = c.parts.filter((p) => p.y < H + 12)
}

export function drawCelebration(ctx, a) {
  const c = a.celeb
  if (!c) return
  // 开头闪一下
  const flash = Math.max(0, 1 - c.t / 0.5)
  if (flash > 0) R(ctx, c.kind === 'coins' ? `rgba(255,214,90,${(flash * 0.22).toFixed(3)})` : `rgba(77,255,138,${(flash * 0.2).toFixed(3)})`, 0, 0, W, H)
  const fade = Math.min(1, (DUR - c.t) / 0.8) // 最后 0.8 秒淡出
  ctx.save()
  ctx.globalAlpha = Math.max(0, fade)
  for (const p of c.parts) {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    if (p.k === 'coin') {
      const w = p.landed ? 4 : Math.max(1, Math.round(Math.abs(Math.cos(p.ph)) * 5))
      const half = Math.floor(w / 2)
      R(ctx, '#b8741a', x - half - 1, y, w + 2, 5)
      R(ctx, '#ffd34d', x - half, y + 1, w, 3)
      if (w >= 3) R(ctx, '#fff3b0', x - half, y + 1, 1, 1)
    } else if (p.k === 'glyph') {
      for (let i = 0; i < p.len; i++) {
        ctx.globalAlpha = Math.max(0, fade) * (1 - i / (p.len + 1))
        R(ctx, p.c, x, y - i * 2, 1, 1)
      }
      ctx.globalAlpha = Math.max(0, fade)
    } else {
      R(ctx, p.c, x, y, 2, 2)
    }
  }
  ctx.restore()
}

/* ---------- 文字：横幅、气泡、日记 ---------- */

const money = (n) => `¥${n}`

/**
 * 结算成功后，小人该怎么庆祝（交给 Console.play）。res 是服务端 pal_settle 的返回
 * { coins, hours, bonus, late, day }；replay = true 是「回放」，不会真的发钱
 */
export function celebrateEvent(slot, res, replay = false) {
  const coin = slot === 'u2'
  const r = res || {}
  const note = [
    r.late ? '昨天的' : '',
    r.hours ? `工时 ${r.hours}h` : '',
    r.bonus ? `心情奖金 +${r.bonus}` : '',
    replay ? '回放 · 不发钱' : '',
  ].filter(Boolean).join(' · ')
  return {
    react: 2.2,
    hearts: 6,
    dur: 4.6,
    // 打工小人（黑发 · 摇滚高冷）说话冷冷的；代码小人（白发 · 软萌）说话软软的
    text: coin ? (r.late ? '昨天的工资……补上了。' : '……发工资了。今晚去买琴弦。') : (r.late ? 'BUILD SUCCESS～昨天的也补上啦！' : 'BUILD SUCCESS！下班啦～'),
    celebrate: coin ? 'coins' : 'build',
    banner: coin
      ? { cls: 'coin', head: '★ 今日结算 ★', title: '今日结算', amount: r.coins || 0, note }
      : { cls: 'build', head: '$ ./ship --release', title: 'BUILD SUCCESS', amount: r.coins || 0, note: note ? `exit 0 · ${note}` : 'exit 0' },
  }
}

/** 日记里「下班结算」那一句，按这个小人自己的口吻 */
export function settleLine(ownerSlot, data) {
  const x = data || {}
  const amount = money(x.coins == null ? '?' : x.coins)
  const when = x.late ? '昨天' : '今天'
  if (ownerSlot === 'u2') return `${when}的工钱到手：${amount}。……还行。`
  return `${when}的班下完啦～BUILD SUCCESS！工时换成了 ${amount}～`
}

/**
 * 「刚下班的那一班」是哪一天的班（服务端 settled_day 记的就是它）：
 * 白班 = 今天；下班时间在次日的夜班 = 上班那天，也就是昨天
 */
export function shiftDay(settings, d = new Date()) {
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (settings && settings.off_h >= 24 ? 1 : 0))
  return localDay(y)
}

/** 钱包旁边的小字：今天结算过没有 */
export function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}