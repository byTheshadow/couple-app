/* ===========================================================================
   小物 · 一起跳一跳 —— 和服务器说话
   一条共享的路只有一行 pal_jump_run(id='main')，读写都走这些 RPC：
   - pal_jump_state()                     第一次打开时建行，返回 { ok, state, me }
   - pal_jump_step(p_from, p_to, p_gain, p_pick)  交一跳；stale = 别人先跳了；同一跳重试幂等
   - pal_jump_reset()                     换一条路（seed 换新，best 保留）
   - pal_jump_guard() / pal_jump_bag()    守护 / 用背包（每日 2 个）
   - pal_jump_buy('jet') / pal_jump_use_jet()     金币买喷气背包 / 用掉一个
   SQL 没跑（缺表 / 缺函数）时不当错误：返回 missing，界面自己说明。
   这个文件只管读写，不碰界面，也不抛错。SQL 见 docs/jump-design.sql。
   =========================================================================== */
import { supabase } from './supabase'

const isMissing = (e) =>
  !!e && (
    e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' ||
    /could not find the (table|function)|does not exist/i.test(e.message || '')
  )

/** 把错误翻成一句人话；认不出来的原样带出去，方便排查 */
function errText(e) {
  const m = (e && e.message) || ''
  if (/no auth|not logged in|jwt/i.test(m)) return '登录状态过期了，刷新一下再试'
  if ((e && e.code) === '42501' || /permission denied|row-level security/i.test(m)) return '没有权限，检查 pal_jump_run 的行级权限'
  return m || '服务端出错了'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clampGain = (v) => Math.max(0, Math.min(8, Math.round(Number(v) || 0)))

/** 读这条路。返回 { state, missing, error } */
export async function loadState() {
  if (!supabase) return { state: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_state')
    data = r.data
    error = r.error
  } catch (e) {
    return { state: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { state: null, missing: true, error: null }
    return { state: null, missing: false, error: errText(error) }
  }
  const state = data && data.ok ? data.state : null
  if (!state) return { state: null, missing: false, error: '服务端没有返回这条路' }
  return { state, me: (data && data.me) || null, missing: false, error: null }
}

/**
 * 交一跳。返回 { ok, reason, state, me, earn, wallet, missing, error }
 * - ok true：state 是最新的路；earn 是这一跳进钱包的金币，wallet=false 表示没有 pal_state 行
 * - reason 'stale'：p_from 对不上，state 是 TA 跳到的位置
 * - reason 'bad_step'：p_to / p_gain 不合法（正常不会出现）
 * - pick：这一跳吃到的拾取物数量（服务器只认 0/1）
 */
export async function submitStep(from, to, gain, pick, legacy = false) {
  if (!supabase) return { ok: false, reason: 'offline', state: null, missing: true, error: null }
  let data = null
  let error = null
  const args = {
    p_from: Math.max(0, Math.round(Number(from) || 0)),
    p_to: Math.max(0, Math.round(Number(to) || 0)),
    p_gain: clampGain(gain),
  }
  // legacy = 老 SQL 只有 3 个参数：这一跳照常交，只是没有金币 / 拾取物
  if (!legacy) args.p_pick = Number(pick) > 0 ? 1 : 0
  try {
    const r = await supabase.rpc('pal_jump_step', args)
    data = r.data
    error = r.error
  } catch (e) {
    return { ok: false, reason: 'network', state: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) {
      // SQL 还没跑到 v4：退回 3 参版本，别让整局游戏卡死
      if (!legacy) return submitStep(from, to, gain, 0, true)
      return { ok: false, reason: 'missing', state: null, missing: true, error: null }
    }
    return { ok: false, reason: 'error', state: null, missing: false, error: errText(error) }
  }
  if (!data || !data.state) {
    return { ok: false, reason: 'empty', state: null, missing: false, error: '服务端没有返回状态' }
  }
  return {
    ok: !!data.ok,
    reason: data.reason || '',
    state: data.state,
    me: data.me || null,
    earn: Number(data.earn) || 0,
    wallet: data.wallet !== false,
    legacy,
    missing: false,
    error: null,
  }
}

/**
 * 交一跳，网络错误自动重试（最多 3 次）。
 * 同一跳重试是幂等的（服务器 platform = p_to 且 last_uid = 我 → 直接成功），所以重复发安全。
 * stale / bad_step 不重试：那是位置不对，重试也没用。pick 在重试时保持同一个值。
 */
export async function submitStepRetry(from, to, gain, pick, tries = 3) {
  let last = null
  for (let i = 0; i < tries; i++) {
    last = await submitStep(from, to, gain, pick)
    if (!last.error) return last
    if (i < tries - 1) await sleep(350 * (i + 1))
  }
  return last
}

/** 换一条路：seed 换新，platform / score / steps / by_user 清零，best 保留 */
export async function resetRun() {
  if (!supabase) return { state: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_reset')
    data = r.data
    error = r.error
  } catch (e) {
    return { state: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { state: null, missing: true, error: null }
    return { state: null, missing: false, error: errText(error) }
  }
  const state = data && data.ok ? data.state : null
  if (!state) return { state: null, missing: false, error: '换路没有成功，再点一次' }
  return { state, missing: false, error: null }
}

/** 接棒：把棒拿过来（TA 正在跳的时候，这一下会被顶掉） */
export async function takeTurn() {
  if (!supabase) return { state: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_take')
    data = r.data
    error = r.error
  } catch (e) {
    return { state: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { state: null, missing: true, error: null }
    return { state: null, missing: false, error: errText(error) }
  }
  const state = data && data.ok ? data.state : null
  if (!state) return { state: null, missing: false, error: '接棒没有成功，再点一次' }
  return { state, missing: false, error: null }
}

/** 交棒：把棒交给 TA（p_uid = 对方 id），只有持棒的人能交 */
export async function handoffTurn(toUid) {
  if (!supabase) return { ok: false, state: null, missing: true, error: null }
  if (!toUid) return { ok: false, state: null, missing: false, error: '没找到 TA 的账号' }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_handoff', { p_uid: toUid })
    data = r.data
    error = r.error
  } catch (e) {
    return { ok: false, state: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { ok: false, state: null, missing: true, error: null }
    return { ok: false, state: null, missing: false, error: errText(error) }
  }
  if (!data || !data.state) return { ok: false, state: null, missing: false, error: '交棒没有成功，再点一次' }
  return { ok: !!data.ok, reason: data.reason || '', state: data.state, missing: false, error: null }
}

/** 掉下去：整条路回到第 0 块、分数清零、best 保留、棒悬空（谁先按谁接） */
export async function restartRun() {
  if (!supabase) return { state: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_restart')
    data = r.data
    error = r.error
  } catch (e) {
    return { state: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { state: null, missing: true, error: null }
    return { state: null, missing: false, error: errText(error) }
  }
  const state = data && data.ok ? data.state : null
  if (!state) return { state: null, missing: false, error: '重开没有成功，再试一次' }
  return { state, missing: false, error: null }
}

/** 掉落时掷一次守护：{ ok, kind: 'guard'|'freeze', reason, me } */
export async function guardFall() {
  if (!supabase) return { ok: false, reason: 'offline', me: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_guard')
    data = r.data
    error = r.error
  } catch (e) {
    return { ok: false, reason: 'network', me: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { ok: false, reason: 'missing', me: null, missing: true, error: null }
    return { ok: false, reason: 'error', me: null, missing: false, error: errText(error) }
  }
  return {
    ok: !!(data && data.ok),
    reason: (data && data.reason) || '',
    kind: (data && data.kind) || '',
    me: (data && data.me) || null,
    missing: false,
    error: null,
  }
}

/** 用掉一个背包：{ ok, me }；跳 3 格由客户端自己提交 */
export async function useBag() {
  if (!supabase) return { ok: false, me: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_bag')
    data = r.data
    error = r.error
  } catch (e) {
    return { ok: false, me: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { ok: false, me: null, missing: true, error: null }
    return { ok: false, me: null, missing: false, error: errText(error) }
  }
  return {
    ok: !!(data && data.ok),
    reason: (data && data.reason) || '',
    me: (data && data.me) || null,
    missing: false,
    error: null,
  }
}

/** 小卖部：用 20 金币买一个喷气背包，每天最多 2 个 */
export async function buyJet() {
  if (!supabase) return { ok: false, reason: 'offline', me: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_buy', { p_kind: 'jet' })
    data = r.data
    error = r.error
  } catch (e) {
    return { ok: false, reason: 'network', me: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { ok: false, reason: 'missing', me: null, missing: true, error: null }
    return { ok: false, reason: 'error', me: null, missing: false, error: errText(error) }
  }
  return {
    ok: !!(data && data.ok),
    reason: (data && data.reason) || '',
    price: Number(data && data.price) || 20,
    me: (data && data.me) || null,
    missing: false,
    error: null,
  }
}

/** 用掉一个喷气背包（飞行在客户端做，服务器只扣库存） */
export async function useJet() {
  if (!supabase) return { ok: false, reason: 'offline', me: null, missing: true, error: null }
  let data = null
  let error = null
  try {
    const r = await supabase.rpc('pal_jump_use_jet')
    data = r.data
    error = r.error
  } catch (e) {
    return { ok: false, reason: 'network', me: null, missing: false, error: '网络不通' }
  }
  if (error) {
    if (isMissing(error)) return { ok: false, reason: 'missing', me: null, missing: true, error: null }
    return { ok: false, reason: 'error', me: null, missing: false, error: errText(error) }
  }
  return {
    ok: !!(data && data.ok),
    reason: (data && data.reason) || '',
    me: (data && data.me) || null,
    missing: false,
    error: null,
  }
}
