import { createRoot } from 'react-dom/client'
import './lib/theme.js'
import './styles.css'
import './dusk.css'
import './lib/perfhud.js' // 只在地址带 perf 时显示性能读数
import { checkVersion, watchPreloadError } from './lib/update.js'
import App from './App.jsx'

/* 部署之后分块会换名字、旧的被删掉：旧页面懒加载那一条路由就会 404。
   这两行让它自己恢复，不需要用户清缓存（详见 lib/update.js）。 */
watchPreloadError()
checkVersion()

// 不用 StrictMode：拆"阅后即焚"的信时，开发模式下 effect 会跑两次，会误触发焚毁
createRoot(document.getElementById('root')).render(<App />)