import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import PageBoundary from './components/PageBoundary'

// 每个页面都是独立的懒加载块 + 独立的错误边界：一页崩了不会连累别的页
const Login = lazy(() => import('./pages/Login'))
const Home = lazy(() => import('./pages/Home'))
const StatusEditor = lazy(() => import('./pages/StatusEditor'))
const Chat = lazy(() => import('./pages/Chat'))
const Toys = lazy(() => import('./pages/Toys'))

function Loading() {
  return (
    <div className="shell"><div className="page center"><div className="h-sub">加载中…</div></div></div>
  )
}

/** 用路由路径当 key：换页面就重置错误边界 */
function Sandbox({ children }) {
  const { pathname } = useLocation()
  return (
    <PageBoundary key={pathname}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </PageBoundary>
  )
}

function Protected({ children }) {
  const { loading, session } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Sandbox><Login /></Sandbox>} />
          <Route path="/" element={<Protected><Sandbox><Home /></Sandbox></Protected>} />
          <Route path="/status" element={<Protected><Sandbox><StatusEditor /></Sandbox></Protected>} />
                 <Route path="/chat" element={<Protected><Sandbox><Chat /></Sandbox></Protected>} />
          <Route path="/toys" element={<Protected><Sandbox><Toys /></Sandbox></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}
