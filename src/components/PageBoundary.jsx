import { Component } from 'react'

/**
 * 每个页面独立的"沙盒"：某个页面渲染出错，只会让这一页显示提示，
 * 其它页面、底部导航、登录状态都不受影响。
 * 路由切换时通过 key 重置，所以换个页面就能恢复。
 */
export default class PageBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[PageBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="shell">
        <div className="blob a" /><div className="blob b" />
        <div className="page center">
          <div className="glass col" style={{ borderRadius: 28, padding: 24, gap: 14, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>这个页面出了点小问题</div>
            <div className="h-sub">别的页面不受影响，可以重试，或者回到首页。</div>
            <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
              <button className="btn ghost" onClick={() => this.setState({ error: null })}>重试</button>
              <a className="btn" style={{ display: 'inline-flex', alignItems: 'center' }} href="#/">回首页</a>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
