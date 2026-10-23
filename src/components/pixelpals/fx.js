/* ===========================================================================
   像素小屋 · 从天上掉下来的东西（面包、礼物盒、小纸条）
   投喂 / 送礼 / 悄悄话的时候，东西先从屏幕上方掉到小人头顶，落到的那一刻才触发小人的反应。
   只管掉落的位置和画面，不碰界面也不碰服务器；掉落物挂在小人身上：actor.drops
   =========================================================================== */
import { headTop } from './art'

const BREAD = ['.TTTT.', 'TttttT', 'TttttT', 'TTTTTT']
const NOTE = ['WWWWW', 'WLLLW', 'WWWWW', 'WLLWW']
const BOX = ['.r.r.', 'RRRRR', 'RyRyR', 'RRRRR']

const LOOKS = {
  bread: { rows: BREAD, map: { T: '#c98a4b', t: '#f4d39a' } },
  note: { rows: NOTE, map: { W: '#fffdf2', L: '#9aa3c7' } },
  box: { rows: BOX, map: { R: '#ff6fa6', r: '#ffd34d', y: '#ffd34d' } },
}

/** 放一个掉落物。onLand 在它落到小人头顶时调用一次 */
export function dropItem(a, kind, onLand) {
  if (!a.drops) a.drops = []
  a.drops.push({ k: LOOKS[kind] ? kind : 'box', x: a.x - 3, y: -6, vy: 20, ty: headTop(a) - 6, onLand })
}

export function stepDrops(a, dt) {
  if (!a.drops || !a.drops.length) return
  const keep = []
  for (const p of a.drops) {
    p.vy += 90 * dt
    p.y += p.vy * dt
    if (p.y >= p.ty) { if (p.onLand) p.onLand() } else keep.push(p)
  }
  a.drops = keep
}

export function drawDrops(ctx, a) {
  if (!a.drops) return
  for (const p of a.drops) {
    const look = LOOKS[p.k]
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    for (let r = 0; r < look.rows.length; r++) {
      for (let i = 0; i < look.rows[r].length; i++) {
        const ch = look.rows[r][i]
        if (ch === '.') continue
        ctx.fillStyle = look.map[ch]
        ctx.fillRect(x + i, y + r, 1, 1)
      }
    }
  }
}