/* ===========================================================================
   猫屋的「今天」：什么时候在家、今天带回来什么
   纯函数，不碰网络、不碰 canvas——服务器只记两个人各指了哪、猫最后去了哪。
   =========================================================================== */

/** 猫的作息：8 点出门，19 点回家（按你现在的钟） */
export const CAT_OUT_H = 8
export const CAT_BACK_H = 19

/** 此刻猫在家吗、刚走开吗（刚走开 = 出门两小时内，屋里还留着痕） */
export function catAt(hr) {
  const h = ((hr % 24) + 24) % 24
  const home = h >= CAT_BACK_H || h < CAT_OUT_H
  const justLeft = !home && h < CAT_OUT_H + 2
  return { home, justLeft }
}

/* 它可能叼回来的东西（和 rooms.js 里的 CAT_ITEMS 一一对应） */
export const CAT_LOOT = ['ticket', 'shell', 'leaf', 'marble', 'candy']

/** 同一天、同一个地方，两个人算出来是同一件东西 */
export function catItem(dayKey, scene) {
  if (!dayKey || !scene) return null
  const s = dayKey + '|' + scene
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return CAT_LOOT[h % CAT_LOOT.length]
}

/** 猫今天听谁的：两个人都指了才说得出口 */
export function catPickOf(row) {
  if (!row) return { a: null, b: null, to: null }
  return { a: row.pick_a || null, b: row.pick_b || null, to: row.to_scene || null }
}

/** 给界面用的一句话：今天它在哪、听谁的 */
export function catLine(row, myPick, taPick) {
  if (!row || !row.to_scene) {
    if (myPick && !taPick) return '你指了，等 TA 也指一个'
    if (!myPick && taPick) return 'TA 指了，你也指一个'
    return '两个人都还没指'
  }
  if (row.pick_a && row.pick_b && row.pick_a === row.pick_b) return '两个人指到一块儿去了，它没得选'
  return '它今天听了一边的'
}