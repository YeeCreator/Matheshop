import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'main-ui/styles.css': path.resolve(__dirname, '../main-ui/src/vue/styles/main-ui.css'),
      'main-ui/core': path.resolve(__dirname, '../main-ui/src/core/index.ts'),
      'main-ui/vue': path.resolve(__dirname, '../main-ui/src/vue/index.ts'),
      'flow-graph-kit-vue': path.resolve(__dirname, '../flow-graph-kit/frontend/flow-graph-kit-vue/src/index.ts'),
      'viewport-2d-kit/core': path.resolve(__dirname, '../viewport-2d-kit/src/core/index.ts'),
      'viewport-2d-kit/vue': path.resolve(__dirname, '../viewport-2d-kit/src/vue/index.ts'),
    },
  },
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
