import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// The app is deployed behind a custom domain (whizzo.app), so production
// builds must use root-relative paths. Dev also stays at root.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
