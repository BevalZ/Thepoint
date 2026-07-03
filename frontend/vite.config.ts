import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-markdown') || id.includes('remark-gfm')) return 'markdown-vendor'
          if (id.includes('framer-motion')) return 'motion-vendor'
          if (id.includes('@tauri-apps')) return 'tauri-vendor'
          if (id.includes('react') || id.includes('zustand') || id.includes('scheduler')) return 'react-vendor'
          return undefined
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
})
