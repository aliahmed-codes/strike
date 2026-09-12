import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        // Strip the /api prefix so a call to /api/auth/login reaches the
        // server's /auth/login route — matches docker/nginx.conf's rewrite,
        // so the client's API paths behave the same in dev and in Docker.
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
})
