/* ===========================================================================
   水晶球摆件架：存在 Supabase 的 crystal_shelf 表里（每个人只能看到、删掉自己的）。
   这个文件只管和服务器说话，不碰界面。每个函数都返回 { ... , error: '给人看的一句话' | null }，不会抛错。
   表结构见交付时单独给的 SQL。一行 = { id, name, thumb（小图 data URL）, globe（整颗球的数据）, created_at }。
   =========================================================================== */
import { supabase } from '../../lib/supabase'
import { MAX_SHELF, normalizeGlobe, makeTitle } from './data'

const COLS = 'id, name, thumb, globe, created_at'

const mapError = (e) => {
  const m = e?.message || ''
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /could not find the table|does not exist/i.test(m)) {
    return '服务端还没有摆件架这张表，先把 crystal_shelf 的 SQL 跑一下'
  }
  if (e?.code === '42501' || /row-level security|permission denied/i.test(m)) return '没有权限，检查一下 crystal_shelf 的行级权限（RLS）策略'
  if (e?.code === '23514' || /check constraint/i.test(m)) return '这颗球太大了，放不进摆件架（摆件少放几个，或者再试一次）'
  return `摆件架出错：${m || '未知原因'}`
}

// 服务器返回的每一行都要过 normalizeGlobe；认不出来的整行丢掉
const toRow = (r) => {
  const globe = normalizeGlobe(r && r.globe)
  if (!globe || !r.id) return null
  return { id: r.id, name: String(r.name || '').slice(0, 40), thumb: typeof r.thumb === 'string' ? r.thumb : '', globe, at: r.created_at || '' }
}

export async function listShelf() {
  if (!supabase) return { rows: [], error: '还没有连上服务器' }
  const { data, error } = await supabase.from('crystal_shelf').select(COLS).order('created_at', { ascending: false }).limit(MAX_SHELF)
  if (error) return { rows: [], error: mapError(error) }
  return { rows: (data || []).map(toRow).filter(Boolean), error: null }
}

export async function saveToShelf({ globe, thumb }) {
  if (!supabase) return { row: null, error: '还没有连上服务器' }
  const clean = normalizeGlobe(globe)
  if (!clean) return { row: null, error: '这颗球存不了' }
  const { data, error } = await supabase
    .from('crystal_shelf')
    .insert({ name: makeTitle(clean).slice(0, 40), thumb: thumb || '', globe: clean })
    .select(COLS)
    .single()
  if (error) return { row: null, error: mapError(error) }
  return { row: toRow(data), error: null }
}

export async function removeFromShelf(id) {
  if (!supabase) return { error: '还没有连上服务器' }
  // select() 把被删的行带回来：一行都没有，说明权限不对或者已经被删了
  const { data, error } = await supabase.from('crystal_shelf').delete().eq('id', id).select('id')
  if (error) return { error: mapError(error) }
  if (!data || !data.length) return { error: '没删掉，刷新一下再试' }
  return { error: null }
}