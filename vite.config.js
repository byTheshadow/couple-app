import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 相对路径：部署在任意子目录（GitHub Pages / 自己的服务器）都能用
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // 图标安装入口（ink.html / night.html…）是构建完成后才生成的，不在预缓存里。
        // 不挡住的话 navigateFallback 会把它们替换成缓存里的 index.html：
        // 地址栏变了但页面还是原来那份，iOS 读到的 apple-touch-icon 也就是默认图标。
        navigateFallbackDenylist: [/\.html$/],
      },
      manifest: {
              name: 'US',
        short_name: 'US',
        description: '只属于两个人的小空间',
        theme_color: '#08080a',
        background_color: '#08080a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
