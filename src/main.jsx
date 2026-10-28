import { createRoot } from 'react-dom/client'
import './lib/theme.js'
import './styles.css'
import './dusk.css'
import './lib/perfhud.js' // 只在地址带 perf 时显示性能读数
import App from './App.jsx'

// 不用 StrictMode：拆"阅后即焚"的信时，开发模式下 effect 会跑两次，会误触发焚毁
createRoot(document.getElementById('root')).render(<App />)
