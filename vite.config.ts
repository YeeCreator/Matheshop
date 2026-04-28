import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), react()],
  server: {
    // 允许 Vite 访问工作区外的源码（本地库的源代码目录）
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
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
