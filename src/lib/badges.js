import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { REQ_TTL_MS } from './badgeCount'

let seq = 0

/**
 * 「像素小屋有几个换装请求等我回话」——底部导航的点和抽屉上的数字共用这一个数。
 * 写法照抄 useChatUnread：count 查一次 + realtime 补变化，卸载时 removeChannel。
 * 24 小时过期的不算（和 PixelPals 的 reqExpired 同一条规则，所以直接按时间过滤，不拉全表）。
 */
export function useOutfitBadge(myId) {
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!myId || !supabase) return undefined
    let alive = true

    const load = async () => {
      const { count, error } = await supabase
        .from('pal_outfit_req')
        .select('id', { count: 'exact', head: true })
        .eq('to_id', myId)
        .eq('status', 'pending')
        .gt('created_at', new Date(Date.now() - REQ_TTL_MS).toISOString())
      if (alive && !error) setN(count || 0)
    }

    // 从后台切回来补一次：realtime 断线重连不保证把断线期间的变化推回来
    const onVis = () => { if (!document.hidden) load() }
    load()
    document.addEventListener('visibilitychange', onVis)

    const ch = supabase
      .channel(`pal-outfit-badge-${myId}-${++seq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pal_outfit_req' }, load)
      .subscribe()

    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch) }
  }, [myId])

  return n
}
