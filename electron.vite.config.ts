  import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
  import react from '@vitejs/plugin-react'
  import { resolve } from 'path'
  import { createRequire } from 'module'
  
  const require = createRequire(import.meta.url)
  const monacoEditorPlugin = require('vite-plugin-monaco-editor').default || require('vite-plugin-monaco-editor')

  export default defineConfig({
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'electron/main.ts')
          },
          external: ['dotenv']
        }
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, './electron')
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'electron/preload.ts')
          },
          output: {
            format: 'cjs',
            entryFileNames: 'index.js'
          }
        }
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, './electron')
        }
      }
    },
    renderer: {
      root: resolve(__dirname, 'src'),
      server: {
        port: 5173,
        strictPort: true,
        fs: {
          // Allow serving files from node_modules for Monaco Editor
          allow: ['..']
        }
      },
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/index.html')
          }
        }
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, './src')
        }
      },
      plugins: [
        react(),
        monacoEditorPlugin({})
      ]
    }
  })
