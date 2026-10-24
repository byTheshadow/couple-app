/* ===========================================================================
   像素小屋 · 第八轮：AI 聊天的服务端读写（人设 + 聊天记录）
   表和函数见 supabase/pixelpals-round8.sql：
   - pal_persona  人设：只能通过 pal_persona_save / pal_persona_get 读写
   - pal_chats    聊天记录：我和某个小人聊过的每一次来回，只能通过 pal_chat_add / pal_chat_clear 写
   这个文件只管读写，不碰界面。读写函数不抛错，返回 { error: '给人看的一句话' | null, ... }。
   =========================================================================== */
import { supabase } from '../../lib/supabase'

const NO_SQL = '服务端还没有第八轮的表和函数，先把 pixelpals-round8.sql 在 Supabase 的 SQL Editor 里跑一下'

const missing = (e) => !!e && (
  e.code === 'PGRST202' || e.code === '42P01' || e.code === 'PGRST205'
  || /could not find the (function|table)|does not exist/i.test(e.message || '')
)

function mapError(e) {
  const m = (e && e.message) || ''
  if (missing(e)) return NO_SQL
  if (m.includes('not logged in')) return '登录状态过期了，刷新一下再试'
  if (m.includes('bad persona')) return '人设有一项超长或格式不对（性格、关系各 400 字，称呼 10 字，禁忌 200 字，示范最多 3 组每句 40 字）'
  if (m.includes('self interaction')) return '只能和 TA 的小人聊天'
  if (m.includes('bad chat')) return '这句话太长或是空的，没存上'
  return `出错：${m || '未知原因'}`
}

/* ---------- 人设 ---------- */

export const EMPTY_PERSONA = { persona: '', relation: '', callname: '', avoid: '', examples: [] }

const str = (v, n) => (typeof v === 'string' ? Array.from(v.trim()).slice(0, n).join('') : '')

/** 服务端存的 → 界面用的（缺的补空，超长的截断，示范最多 3 组） */
export function personaFromRow(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {}
  const ex = Array.isArray(o.examples) ? o.examples : []
  return {
    persona: str(o.persona, 400),
    relation: str(o.relation, 400),
    callname: str(o.callname, 10),
    avoid: str(o.avoid, 200),
    examples: ex.map((e) => ({ q: str(e && e.q, 40), a: str(e && e.a, 40) })).filter((e) => e.q || e.a).slice(0, 3),
  }
}

/** 界面用的 → 存服务端的：空的项不存；示范只存两句都写了的 */
export function personaToRow(p) {
  const c = personaFromRow(p)
  const out = {}
  if (c.persona) out.persona = c.persona
  if (c.relation) out.relation = c.relation
  if (c.callname) out.callname = c.callname
  if (c.avoid) out.avoid = c.avoid
  const ex = c.examples.filter((e) => e.q && e.a)
  if (ex.length) out.examples = ex
  return out
}

/** 读某个人的人设（自己的或 TA 的）。返回 { error, persona } */
export async function personaGet(owner) {
  if (!supabase || !owner) return { error: null, persona: personaFromRow(null) }
  const { data, error } = await supabase.rpc('pal_persona_get', { p_owner: owner })
  if (error) return { error: mapError(error), persona: personaFromRow(null), missing: missing(error) }
  return { error: null, persona: personaFromRow(data) }
}

export async function personaSave(p) {
  if (!supabase) return { error: '还没有连上服务器' }
  const { error } = await supabase.rpc('pal_persona_save', { p_data: personaToRow(p) })
  return { error: error ? mapError(error) : null }
}

/* ---------- 聊天记录 ---------- */

/** 我和 owner 的小人最近聊的（旧的在前）。返回 { error, rows: [{ id, q, a, created_at }], missing } */
export async function chatHistory(owner, visitor, limit = 30) {
  if (!supabase || !owner || !visitor) return { error: null, rows: [], missing: false }
  const { data, error } = await supabase
    .from('pal_chats').select('id, q, a, created_at')
    .eq('owner_id', owner).eq('visitor_id', visitor)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) return { error: mapError(error), rows: [], missing: missing(error) }
  return { error: null, rows: (data || []).slice().reverse(), missing: false }
}

export async function chatAdd(owner, q, a) {
  if (!supabase) return { error: '还没有连上服务器' }
  const { error } = await supabase.rpc('pal_chat_add', { p_owner: owner, p_q: q, p_a: a })
  return { error: error ? mapError(error) : null }
}

export async function chatClear(owner) {
  if (!supabase) return { error: '还没有连上服务器' }
  const { error } = await supabase.rpc('pal_chat_clear', { p_owner: owner })
  return { error: error ? mapError(error) : null }
}