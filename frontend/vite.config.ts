import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Preserve /api/auth and its HttpOnly cookie path through the existing Nginx gateway.
      '/api/auth': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
})
