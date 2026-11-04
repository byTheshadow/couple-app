// 角标数字：纯函数，不碰 React / DOM，node 能直接跑（_pixel-preview/badge_check.mjs）
// 规则：0 / 负数 / 非数字 → null（不渲染 DOM）；1~9 → '1'~'9'；超过 9 → '9+'
export const BADGE_MAX = 9

export function fmtBadge(n) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v) || v <= 0) return null
  return v > BADGE_MAX ? `${BADGE_MAX}+` : String(v)
}

// 换装请求 24 小时算过期：和 PixelPals.jsx 里的 reqExpired 是同一条规则，改一边记得改另一边
export const REQ_TTL_MS = 24 * 3600 * 1000

/** 从 pal_outfit_req 的行里数「等『我』回话、还没过期」的件数（给纯函数测试用；页面里走 count 查询） */
export function countPendingReqs(rows, myId, now = Date.now()) {
  if (!myId || !Array.isArray(rows)) return 0
  return rows.filter((r) => r && r.status === 'pending' && r.to_id === myId && now - new Date(r.created_at).getTime() < REQ_TTL_MS).length
}

/** 手机主屏图标角标要显示的数：几件事等着就显示几，一件都没有就是 0（调用方据此 clearAppBadge） */
export function appBadgeCount(...ns) {
  return Math.max(0, Math.floor(ns.reduce((sum, n) => sum + (Number(n) || 0), 0)))
}
