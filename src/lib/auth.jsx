import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ACCOUNT_DOMAIN, supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

/**
 * 登录方式：整个站只有两个 Supabase 账号（u1@域名 / u2@域名）。
 * 用户只输入密码；我们依次用两个账号去试，谁匹配就是谁。
 * 密码校验、加盐哈希、防暴力破解都由 Supabase Auth 在服务端完成。
 */
export async function loginWithPassword(password) {
  for (const slot of ['u1', 'u2']) {
    const { error } = await supabase.auth.signInWithPassword({
      email: `${slot}@${ACCOUNT_DOMAIN}`,
      password,
    })
    if (!error) return { ok: true, slot }
    // 400 = 密码不匹配，继续试下一个；其它状态码（限流、网络）直接报错
    if (error.status && error.status !== 400) return { ok: false, error: error.message }
  }
  return { ok: false, error: 'invalid' }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, session: null, me: null, partner: null })

  const load = useCallback(async (session) => {
    if (!session) {
      setState({ loading: false, session: null, me: null, partner: null })
      return
    }
    const { data } = await supabase.from('profiles').select('*')
    const me = data?.find((p) => p.id === session.user.id) || null
    const partner = data?.find((p) => p.id !== session.user.id) || null
    setState({ loading: false, session, me, partner })
  }, [])

  useEffect(() => {
    if (!supabase) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // 回调里不能直接 await supabase 请求（会死锁），丢到下一个 tick
      setTimeout(() => load(session), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await load(data.session)
  }, [load])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const value = useMemo(() => ({ ...state, reload, signOut }), [state, reload, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
