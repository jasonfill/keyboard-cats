import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// On GitHub Pages this is served from https://<user>.github.io/keyboard-cats/,
// so production builds need that base path. Dev stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/keyboard-cats/' : '/',
  plugins: [react()],
}))
