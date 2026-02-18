import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const monacoEditorPlugin =
  require('vite-plugin-monaco-editor').default ?? require('vite-plugin-monaco-editor')

export default defineConfig({
  root: 'src',
  plugins: [react(), monacoEditorPlugin({})],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html'),
    },
  },
})
