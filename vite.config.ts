import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    proxy: {
      // Forward API calls to local Vercel dev server so serverless routes work in dev
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
