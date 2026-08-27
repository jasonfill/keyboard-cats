import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// The app is deployed behind a custom domain (whizzo.app), so production
// builds must use root-relative paths. Dev also stays at root.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    // In production the SPA and the API are two components of one App Platform
    // app on one hostname, so requests to /api are same-origin. This makes dev
    // behave the same way, which means no environment-dependent base URL and
    // no CORS in the browser.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
