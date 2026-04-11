import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/web/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['apps/web/src/lib/**/*.ts'],
      exclude: ['apps/web/src/lib/**/*.test.ts', 'apps/web/src/lib/**/*.d.ts'],
      reporter: ['text', 'lcov'],
    },
    setupFiles: [],
  },
})
