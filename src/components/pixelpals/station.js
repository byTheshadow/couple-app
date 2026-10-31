/* ===========================================================================
   像素小屋 · 雨夜车站（手写画法）
   为什么不用数据场景：数据场景只会画静态矩形，而这里的列车要「开出去」。
   规则见 docs/pixelpals-round7.sql（场景白名单）和 scenes.js 的 SCENE_LIST。
   16 秒一班：
     0 ~ 2     停着，门关
     2 ~ 6     车门打开（门里有暖光和座位）
     6 ~ 7.5   关门
     7.5 ~ 11  加速出站（从长椅和人后面滑过去）
     11 ~ 13.5 空站，只剩轨道和雨
     13.5 ~ 16 从右边回站，减速停稳
   小人由 art.js 在场景画完之后再画，所以车永远在人后面。
   =========================================================================== */
import { drawSky } from './scenes'

const R = (ctx, c, x, y, w, h) => {
  if (w <= 0 || h <= 0) return
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function glow(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r)
  g.addColorStop(0, `rgba(${rgb},${a})`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** 车的位置：0 = 停靠，-250 = 完全出站 */
export function trainOffset(t) {
  const u = ((t % 16) + 16) % 16
  if (u < 7.5) return 0
  if (u < 11) { const k = (u - 7.5) / 3.5; return -250 * Math.pow(k, 1.6) }
  if (u < 13.5) return -250
  const k = (u - 13.5) / 2.5
  return -250 * (1 - (1 - Math.pow(1 - k, 2)))
}

const doorOpen = (t) => { const u = ((t % 16) + 16) % 16; return u >= 2 && u < 6 }

function train(ctx, ox, t) {
  const X = (x) => x + ox
  R(ctx, '#1b5a8f', X(90), 26, 70, 66)
  R(ctx, '#123f66', X(90), 26, 70, 4)
  R(ctx, '#e8eefc', X(90), 30, 70, 2)
  // 车窗
  for (const wx of [94, 116, 138]) {
    R(ctx, '#e8eefc', X(wx), 36, 14, 12)
    R(ctx, '#0a1024', X(wx), 36, 14, 1); R(ctx, '#0a1024', X(wx), 47, 14, 1); R(ctx, '#0a1024', X(wx), 36, 1, 12)
  }
  // 红腰带
  R(ctx, '#c93a4a', X(90), 56, 70, 3); R(ctx, '#e8eefc', X(90), 59, 70, 1)
  // 下半截小窗 + 裙板
  for (let x = 94; x < 156; x += 22) { R(ctx, '#123f66', X(x), 64, 10, 8); R(ctx, '#8aa0c0', X(x), 64, 10, 1) }
  R(ctx, '#8aa0c0', X(90), 78, 70, 1)
  R(ctx, '#123f66', X(90), 82, 70, 10); R(ctx, '#8aa0c0', X(90), 82, 70, 1)
  // 车门
  if (doorOpen(t)) {
    R(ctx, '#0a1024', X(108), 40, 8, 46)
    R(ctx, '#1a2138', X(109), 42, 6, 42)
    R(ctx, '#3a2f3a', X(109), 62, 6, 1)
    R(ctx, '#6a4a3a', X(110), 64, 4, 2)
    R(ctx, '#ffe9c8', X(109), 82, 6, 2)
    R(ctx, '#c9d8ee', X(108), 40, 1, 46)
  } else {
    R(ctx, '#2f7fbf', X(108), 40, 8, 46)
    R(ctx, '#123f66', X(108), 40, 1, 46); R(ctx, '#123f66', X(115), 40, 1, 46)
    R(ctx, '#c9d8ee', X(110), 48, 4, 8)
  }
  // 车头灯
  R(ctx, '#ffe9c8', X(90), 40, 2, 4)
  glow(ctx, X(92), 42, 18, '255,207,107', 0.5)
}

/* 雨：竖直的细线，三层不同长度 / 速度 / 透明度 + 地面水花。
   x 和 y 必须用两个独立的哈希，否则雨滴会连成斜线簇（像划痕）。 */
const h1 = (i, s) => { let h = Math.imul(i ^ (s * 2654435761), 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296 }
const h2 = (i, s) => { let h = Math.imul(i + 0x7f4a7c15, (s * 40503) | 1); h ^= h >>> 16; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; return (h >>> 0) / 4294967296 }

function rainLayer(ctx, t, { n, seed, len, speed, alpha }) {
  for (let i = 0; i < n; i++) {
    const u = h1(i, seed)
    const v = h2(i, seed)
    const L = len + (i % 4)
    const x = (u * 186) % 186 - 10
    const y = ((t * speed + v * 150) % 156) - 12
    ctx.fillStyle = `rgba(178,208,255,${(alpha * 0.55).toFixed(3)})`
    ctx.fillRect(Math.round(x), Math.round(y), 1, L >> 1)
    ctx.fillStyle = `rgba(196,222,255,${alpha.toFixed(3)})`
    ctx.fillRect(Math.round(x), Math.round(y) + (L >> 1), 1, L - (L >> 1))
  }
}

function drawRain(ctx, t) {
  rainLayer(ctx, t, { n: 150, seed: 3, len: 4, speed: 150, alpha: 0.10 })
  rainLayer(ctx, t, { n: 80, seed: 11, len: 6, speed: 230, alpha: 0.15 })
  rainLayer(ctx, t, { n: 26, seed: 23, len: 9, speed: 330, alpha: 0.21 })
  // 水花：一冒就没，只落在站台和积水边上
  for (let i = 0; i < 12; i++) {
    const u = h1(i, 41)
    const ph = (t * 3.2 + u * 10) % 1
    if (ph > 0.3) continue
    const x = 8 + u * 144
    const y = 96 + ((i * 37) % 18)
    const a = 0.6 * (1 - ph / 0.3)
    ctx.fillStyle = `rgba(206,230,255,${a.toFixed(2)})`
    ctx.fillRect(Math.round(x), Math.round(y), ph < 0.15 ? 3 : 2, 1)
    if (ph < 0.15) ctx.fillRect(Math.round(x + 1), Math.round(y - 1), 1, 1)
  }
}

/** 画一帧雨夜车站（t = 秒；天空固定是夜里） */
export function drawRainStation(ctx, t) {
  const ox = trainOffset(t)
  drawSky(ctx, 0, 0, 160, 72, 21.4, t, true, true)
  // 雨里的楼影
  R(ctx, '#0a1024', 0, 48, 160, 26)
  R(ctx, '#141c3a', 0, 56, 22, 18); R(ctx, '#141c3a', 26, 52, 18, 22); R(ctx, '#141c3a', 48, 60, 22, 14); R(ctx, '#141c3a', 74, 54, 20, 20)
  R(ctx, '#1e2746', 0, 56, 22, 1); R(ctx, '#1e2746', 26, 52, 18, 1); R(ctx, '#1e2746', 48, 60, 22, 1); R(ctx, '#1e2746', 74, 54, 20, 1)
  for (const [x, y] of [[3, 60], [9, 66], [30, 56], [38, 64], [52, 64], [58, 70], [78, 58], [84, 66]]) R(ctx, '#ffcf6b', x, y, 1, 2)
  // 轨道区：道砟 + 两条钢轨（车开走以后露出来的就是这里）
  R(ctx, '#151d38', 0, 72, 160, 20)
  R(ctx, '#1c2544', 0, 76, 160, 2)
  R(ctx, '#2b3557', 0, 84, 160, 1); R(ctx, '#8aa0c0', 0, 85, 160, 1)
  R(ctx, '#2b3557', 0, 90, 160, 1); R(ctx, '#8aa0c0', 0, 91, 160, 1)
  for (let x = 0; x < 160; x += 9) { R(ctx, '#241f33', x, 78, 6, 1); R(ctx, '#241f33', x + 4, 82, 5, 1) }
  // 先画列车，再画站台 —— 车在长椅、柱子和人后面
  train(ctx, ox, t)
  // 站台
  R(ctx, '#2a3557', 0, 92, 160, 28); R(ctx, '#3a4770', 0, 92, 160, 2)
  R(ctx, '#1f2a4e', 0, 104, 160, 16)
  for (let x = 12; x < 160; x += 24) R(ctx, '#1f2a4e', x, 92, 1, 28)
  for (let y = 99; y < 120; y += 7) R(ctx, '#1f2a4e', 0, y, 160, 1)
  R(ctx, '#ffcf6b', 0, 94, 160, 2); R(ctx, '#ffe9c8', 0, 94, 160, 1)
  // 积水：暗水 + 灯的倒影
  for (const [cx, cy, rx, ry] of [[26, 110, 13, 3], [78, 106, 16, 3], [128, 114, 15, 3]]) {
    for (let yy = -ry; yy < ry; yy++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy / ry) * (yy / ry))))
      if (w > 0) { R(ctx, '#141c3a', cx - w, cy + yy + 1, w * 2, 1); R(ctx, '#0a1024', cx - w + 2, cy + yy, w * 2 - 4, 1) }
    }
    R(ctx, '#ffcf6b', cx - 1, cy, 2, 1); R(ctx, '#ffe9c8', cx + 5, cy + 1, 2, 1)
  }
  // 候车棚
  R(ctx, '#0c1428', 0, 0, 160, 8); R(ctx, '#1f2a4e', 0, 8, 160, 2); R(ctx, '#8aa0c0', 0, 8, 160, 1)
  R(ctx, '#0c1428', 14, 10, 4, 82); R(ctx, '#8aa0c0', 18, 10, 1, 82)
  R(ctx, '#0c1428', 146, 10, 4, 52); R(ctx, '#8aa0c0', 150, 10, 1, 52)
  // 两盏吊灯 + 地上的光斑
  for (const lx of [44, 118]) {
    R(ctx, '#8aa0c0', lx, 8, 1, 7); R(ctx, '#7a5a3a', lx - 4, 15, 9, 2); R(ctx, '#c9a24a', lx - 3, 17, 7, 1)
    R(ctx, '#ffe9c8', lx - 2, 18, 5, 2)
    glow(ctx, lx, 20, 18, '255,207,107', 0.55)
    for (let yy = -2; yy < 2; yy++) R(ctx, '#ffe9c8', lx - 8 + Math.abs(yy), 96 + yy, 16 - Math.abs(yy) * 2, 1)
  }
  // 站牌
  R(ctx, '#141c3a', 12, 18, 38, 18); R(ctx, '#c9d8ee', 12, 18, 38, 1); R(ctx, '#c9d8ee', 12, 35, 38, 1)
  R(ctx, '#c9d8ee', 12, 18, 1, 18); R(ctx, '#c9d8ee', 49, 18, 1, 18)
  R(ctx, '#c9d8ee', 16, 22, 12, 2); R(ctx, '#c9d8ee', 32, 22, 8, 2)
  R(ctx, '#c9d8ee', 16, 27, 26, 1); R(ctx, '#c9d8ee', 16, 31, 18, 1)
  R(ctx, '#c93a4a', 44, 22, 2, 2)
  // 长椅 + 靠着的伞
  R(ctx, '#7a5a3a', 24, 84, 30, 3); R(ctx, '#b98b62', 24, 84, 30, 1)
  R(ctx, '#7a5a3a', 26, 76, 3, 10); R(ctx, '#b98b62', 26, 76, 26, 1)
  R(ctx, '#7a5a3a', 26, 87, 3, 7); R(ctx, '#7a5a3a', 47, 87, 3, 7)
  R(ctx, '#7a5a3a', 24, 90, 30, 2)
  R(ctx, '#8aa0c0', 56, 78, 2, 14); R(ctx, '#2f7fbf', 52, 76, 8, 3); R(ctx, '#e8eefc', 54, 74, 5, 2); R(ctx, '#5a6b8c', 58, 90, 2, 2)
  // 雨在最前面（人前面也有一点）
  drawRain(ctx, t)
}