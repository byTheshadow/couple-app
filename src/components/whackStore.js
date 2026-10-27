/* ===========================================================================
   小物 · 气人顾客（打地鼠）—— 和服务器说话
   - 交一局：RPC pal_whack_report(p_score, p_combo, p_tz)。分数和最高连击由客户端报，
     金币由服务端算（每满 3 连击 +10、单局封顶 30、每天封顶 60）。
   - 读分数：pal_whack_day 只开了 select（RLS 只读），结算页读自己 + 读 TA 各一次。
   - SQL 没跑（缺表 / 缺函数）时不当错误：返回 missing，游戏照玩、分数存本地。
   SQL 见 docs/whack-design.sql；数据流见 docs/whack-design.md 第 9 节。
   这个文件只管读写，不碰界面，也不抛错。
   =========================================================================== */
import { supabase } from '../lib/supabase'
import { localDay } from './pixelpals/celebrate'

export { localDay }

const isMissingTable = (e) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /could not find the table|does not exist/i.test(e.message || ''))

const isMissingFn = (e) =>
  !!e && (e.code === 'PGRST202' || /could not find the function/i.test(e.message || ''))

/** 把错误翻成一句人话；认不出来的原样带出去，方便排查 */
function errText(e) {
  const m = (e && e.message) || ''
  if (/no auth|not logged in|jwt/i.test(m)) return '登录状态过期了，刷新一下再试'
  if ((e && e.code) === '42501' || /permission denied|row-level security/i.test(m)) return '没有权限，检查一下 pal_whack_day 的行级权限'
  return m || '服务端出错了'
}

function tzName() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch (e) { return '' }
}

/**
 * 交一局。返回 { res, missing, error }
 * res = { score, combo, coins, best, best_combo, day, day_coins, day_cap, tz }（全是服务端算的）
 * - missing: 表 / 函数还不存在（SQL 没跑）→ 静默降级
 */
export async function reportWhack(score, combo) {
  if (!supabase) return { res: null, missing: true, error: null }
  const { data, error } = await supabase.rpc('pal_whack_report', {
    p_score: Math.max(0, Math.round(score || 0)),
    p_combo: Math.max(0, Math.round(combo || 0)),
    p_tz: tzName(),
  })
  if (error) {
    if (isMissingFn(error) || isMissingTable(error)) return { res: null, missing: true, error: null }
    return { res: null, missing: false, error: errText(error) }
  }
  return { res: data || null, missing: false, error: null }
}

/**
 * 某人某天那一行（只读）。返回 { row, missing, error }
 * row = { best_score, coins } | null（没打过就是 null）
 */
export async function dayRow(userId, day) {
  if (!supabase || !userId) return { row: null, missing: false, error: null }
  const { data, error } = await supabase
    .from('pal_whack_day')
    .select('best_score, coins')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) return { row: null, missing: true, error: null }
    return { row: null, missing: false, error: errText(error) }
  }
  return { row: data || null, missing: false, error: null }
}
