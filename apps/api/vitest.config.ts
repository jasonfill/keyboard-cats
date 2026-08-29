import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      exclude: [
        'src/server.ts',
        'src/cli/**',
        '**/*.test.ts',
        '**/*.config.*',
        'scripts/**',
        'dist/**',
      ],
    },
  },
})
