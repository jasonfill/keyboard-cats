import { defineConfig } from 'vitest/config'

// Pure domain logic — no DOM, no React, so a node environment is the honest one.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Count everything, not just what a test happened to import — the same
      // rule the other two workspaces use, for the same reason.
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.config.*', 'dist/**'],
    },
  },
})
