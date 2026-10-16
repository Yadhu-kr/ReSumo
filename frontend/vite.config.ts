import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/upload-resume': 'http://127.0.0.1:8000',
      '/candidates': 'http://127.0.0.1:8000',
      '/jobs': 'http://127.0.0.1:8000',
      '/approvals': 'http://127.0.0.1:8000',
      '/offers': 'http://127.0.0.1:8000',
      '/interviews': 'http://127.0.0.1:8000',
      '/onboarding': 'http://127.0.0.1:8000',
      '/calendar': 'http://127.0.0.1:8000',
      '/notifications': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
