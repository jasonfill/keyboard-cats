import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Component tests need a DOM; the pure-logic tests do not care either way, so
// one jsdom environment for everything keeps the config to one file.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Count everything, not just what a test happened to import. Without
      // this the percentage only describes the files already under test, which
      // is the one number guaranteed to look good.
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      // Data tables, generated types and entry points carry no logic worth
      // asserting on; counting them would flatter the number.
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/data/**',
        'src/test/**',
        '**/*.test.{ts,tsx}',
        '**/*.config.*',
        'scripts/**',
        'dist/**',
      ],
    },
  },
})
