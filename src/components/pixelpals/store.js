/* ===========================================================================
   像素小屋 · 和服务器说话
   两张表（SQL 见交付时单独给的那一段）：
   - pal_settings  每人一行，自己能改：上班地点、墙纸、作息、三个互动按钮
   - pal_state     每人一行，客户端只能读：心情、钱包、礼物（以后只由服务端函数改，谁也不能直接改对方的小人）
   这个文件只管读写，不碰界面。读写函数不抛错，返回 { error: '给人看的一句话' | null }。
   =========================================================================== */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizeSettings, normalizeState } from './art'

const mapError = (e) => {
  const m = e?.message || ''
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /could not find the table|does not exist/i.test(m)) {
    return '服务端还没有像素小屋的表，先把像素小屋的 SQL 跑一下'
  }
  if (e?.code === 'PGRST202' || /could not find the function/i.test(m)) return '服务端没找到 pal_ensure 函数，先把像素小屋的 SQL 跑一下'
  if (e?.code === '42501' || /row-level security|permission denied/i.test(m)) return '没有权限，检查一下 pal_settings 的行级权限（RLS）策略'
  if (e?.code === '23514' || /check constraint/i.test(m)) return '有一项超出范围了，检查一下时间和按钮文字'
  return `像素小屋出错：${m || '未知原因'}`
}

/**
 * 某个人的小屋：{ settings, state, loading, error, reload }
 * 没有这一行（对方还没打开过）就用默认值；自己的那行会自动补上。实时更新。
 */
export function usePal(userId, slot, isMine) {
  const [settingsRow, setSettingsRow] = useState(null)
  const [stateRow, setStateRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!supabase || !userId) { setLoading(false); return }
    const [a, b] = await Promise.all([
      supabase.from('pal_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('pal_state').select('*').eq('user_id', userId).maybeSingle(),
    ])
    const err = a.error || b.error
    setError(err ? mapError(err) : '')
    setSettingsRow(a.data || null)
    setStateRow(b.data || null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return }
    let alive = true
    setLoading(true)
    ;(async () => {
      // 自己的两行不存在就补上（函数是幂等的，已经有就什么都不做）
      if (isMine) {
        const { error: e } = await supabase.rpc('pal_ensure')
        if (e && alive) setError(mapError(e))
      }
      if (alive) await reload()
    })()
    const ch = supabase
      .channel(`pal-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pal_settings', filter: `user_id=eq.${userId}` },
        (p) => { if (p.new && Object.keys(p.new).length) setSettingsRow(p.new) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pal_state', filter: `user_id=eq.${userId}` },
        (p) => { if (p.new && Object.keys(p.new).length) setStateRow(p.new) })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [userId, isMine, reload])

  // 用 useMemo 固定住，免得每次渲染都生成新对象，把依赖它的 effect 反复触发
  const settings = useMemo(() => normalizeSettings(settingsRow, slot), [settingsRow, slot])
  const state = useMemo(() => normalizeState(stateRow), [stateRow])

  return { settings, state, loading, error, reload }
}

/** 保存自己的安排（整行 upsert）。draft 是 normalizeSettings 整理过的那种对象 */
export async function saveSettings(userId, draft) {
  if (!supabase) return { error: '还没有连上服务器' }
  const { data, error } = await supabase
    .from('pal_settings')
    .upsert({
      user_id: userId,
      work_scene: draft.work_scene,
      home_theme: draft.home_theme,
      wake_h: draft.wake_h,
      work_h: draft.work_h,
      off_h: draft.off_h,
      sleep_h: draft.sleep_h,
      buttons: draft.buttons,
      updated_at: new Date().toISOString(),
    })
    .select('user_id')
    .single()
  if (error) return { error: mapError(error) }
  if (!data) return { error: '没存上，刷新一下再试' }
  return { error: null }
}