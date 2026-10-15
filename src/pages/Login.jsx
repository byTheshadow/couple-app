import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { configured } from '../lib/supabase'
import { loginWithPassword, useAuth } from '../lib/auth'
import { useScrollFx } from '../lib/scrollfx'
import { Svg } from '../components/Icon'

export default function Login() {
  const { session, me, loading } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(false)

  useScrollFx()

  if (!loading && session) return <Navigate to="/" replace />

  const submit = async (e) => {
    e?.preventDefault()
    if (!pw || busy) return
    setBusy(true); setMsg('')
    const r = await loginWithPassword(pw)
    setBusy(false)
    if (r.ok) return nav('/', { replace: true })
    setMsg(r.error === 'invalid' ? '密码不对，再想想' : `登录失败：${r.error}`)
    setBad(true); setTimeout(() => setBad(false), 500)
  }

  return (
    <div className="shell">
      <div className="bg">
        <div className="blobs">
          <div className="blob a" /><div className="blob b" /><div className="blob c" />
          <div className="blob d" /><div className="blob e" />
        </div>
        <div className="aurora" />
      </div>

      <div className="page center">
        <div className="glass lock-badge rv"><Svg name="lock" size={28} /></div>

        <div className="col rv" style={{ gap: 8, textAlign: 'center', '--rd': '.12s' }}>
          <h1 className="h-title" style={{ fontSize: 34 }}>欢迎回来</h1>
          <div className="muted" style={{ fontSize: 15 }}>输入只属于你的那串密码</div>
        </div>

        {!configured ? (
          <div className="glass col rv" style={{ borderRadius: 24, padding: 18, gap: 8, width: '100%', '--rd': '.24s' }}>
            <div style={{ fontWeight: 600 }}>还没连接数据库</div>
            <div className="h-sub">复制 .env.example 为 .env，填入 Supabase 的 URL 和 anon key，重启开发服务器即可。</div>
          </div>
        ) : (
          <form className={`glass login-card col rv${bad ? ' shake' : ''}`} style={{ borderRadius: 32, padding: 18, gap: 14, width: '100%', '--rd': '.24s' }} onSubmit={submit}>
            <div className="row" style={{ gap: 10 }}>
              <input className="pw-input" type="password" autoComplete="current-password"
                placeholder="••••••" value={pw} onChange={(e) => { setPw(e.target.value); setMsg('') }}
                aria-label="密码" />
              <button className="go" type="submit" disabled={busy || !pw} aria-label="进入">
                <Svg name="arrow" size={20} stroke={2} />
              </button>
            </div>
            {msg && <div className="h-sub" style={{ textAlign: 'center' }}>{msg}</div>}
          </form>
        )}
        {me && <div className="h-sub">已识别：{me.display_name}</div>}
      </div>
    </div>
  )
}