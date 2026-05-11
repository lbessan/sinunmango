import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Algunos tests setean process.env / mockean Date — aislamos por archivo
    isolate: true,
  },
})
