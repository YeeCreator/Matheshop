import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 在开发时直接将包名映射到源码目录以获得更好的 HMR 体验
      'main-ui': path.resolve(__dirname, '../main-ui/src'),
      'viewport-kit': path.resolve(__dirname, '../viewport-2d-kit/src'),
    },
  },
  server: {
    // 允许 Vite 访问工作区外的源码（本地库的源代码目录）
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
        path.resolve(__dirname, '../main-ui'),
        path.resolve(__dirname, '../viewport-2d-kit'),
      ],
    },
    proxy: {
      '/api/engine': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/engine/, ''),
      },
    },
  },
})
