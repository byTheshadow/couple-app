/* ===========================================================================
   日历的纯函数：不碰 DOM、不碰 supabase，node 里能直接 import 来跑。
   日期一律用 'YYYY-MM-DD' 字符串，配 new Date(y, m - 1, d) 构造——
   别写 new Date('2026-11-04')，那是 UTC 解析，东八区会退一天。
   =========================================================================== */

export const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

export function pad2(n) {
  return String(n).padStart(2, '0')
}

/** (2026, 11, 4) → '2026-11-04'；月份是 1~12 */
export function dayKey(y, m, d) {
  return y + '-' + pad2(m) + '-' + pad2(d)
}

export function keyOf(date) {
  return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function parseDay(key) {
  const parts = key.split('-').map(Number)
  return { y: parts[0], m: parts[1], d: parts[2] }
}

export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate()
}

/** 周日开头。返回 7 的整数倍个格子，前后补的日子标 out */
export function monthGrid(year, month) {
  const offset = new Date(year, month - 1, 1).getDay()
  const total = daysInMonth(year, month)
  const cells = Math.ceil((offset + total) / 7) * 7
  const list = []
  for (let i = 0; i < cells; i++) {
    const d = new Date(year, month - 1, 1 - offset + i)
    list.push({
      key: keyOf(d),
      d: d.getDate(),
      m: d.getMonth() + 1,
      y: d.getFullYear(),
      out: d.getMonth() !== month - 1,
    })
  }
  return list
}

/** 加减月份：用 year * 12 + month 做整数运算，31 号不会溢出到别的月 */
export function addMonth(year, month, delta) {
  const n = year * 12 + (month - 1) + delta
  return { y: Math.floor(n / 12), m: (n % 12) + 1 }
}

export function groupByDay(rows, getKey) {
  const map = {}
  for (const row of rows) {
    const k = getKey(row)
    if (!k) continue
    if (!map[k]) map[k] = []
    map[k].push(row)
  }
  return map
}

/** 每年都算的纪念日搬到目标年份；2 月 29 日落到平年时按 28 日算 */
export function expandYearly(list, year) {
  return list.map((a) => {
    if (!a.repeat_yearly) return a
    const { m, d } = parseDay(a.date)
    const dd = Math.min(d, daysInMonth(year, m))
    return { ...a, date: dayKey(year, m, dd) }
  })
}

export function hash32(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 同一天永远同一条：两边算出来一样，不用存库 */
export function pickDaily(key, pool) {
  if (!pool || !pool.length) return null
  return pool[hash32(key) % pool.length]
}

export function todayKey(now) {
  return keyOf(now || new Date())
}

export function weekdayOf(key) {
  const { y, m, d } = parseDay(key)
  return new Date(y, m - 1, d).getDay()
}

/** 这天怎么拆：周末直接开，平时刮开。等有了题库，answer 从这儿排进去 */
export function gateFor(key) {
  const wd = weekdayOf(key)
  return wd === 0 || wd === 6 ? 'free' : 'scratch'
}

export function fmtMD(key) {
  const { m, d } = parseDay(key)
  return m + ' 月 ' + d + ' 日'
}