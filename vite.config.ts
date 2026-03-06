import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const monacoEditorPlugin =
  require('vite-plugin-monaco-editor').default ?? require('vite-plugin-monaco-editor')

/** Remove emoji and other decorative symbols from log messages. */
function stripEmoji(msg: string): string {
  return msg.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, '').replace(/\s{2,}/g, ' ').trim()
}

const defaultLogger = createLogger()
const customLogger = {
  ...defaultLogger,
  info: (msg: string, options?: { timestamp?: boolean }) => defaultLogger.info(stripEmoji(msg), options),
  warn: (msg: string, options?: { timestamp?: boolean }) => defaultLogger.warn(stripEmoji(msg), options),
  warnOnce: (msg: string, options?: { timestamp?: boolean }) => defaultLogger.warnOnce(stripEmoji(msg), options),
  error: (msg: string, options?: { timestamp?: boolean; error?: Error }) => defaultLogger.error(stripEmoji(msg), options),
}

export default defineConfig({
  root: 'src',
  customLogger,
  plugins: [react(), monacoEditorPlugin({})],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
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
