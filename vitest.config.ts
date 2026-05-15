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
    // El archivo de setup corre antes de cada test file. Lo usamos para
    // setear env vars fake que algunos módulos requieren al import time
    // (ej: lib/supabase/admin.ts instancia el cliente en module load).
    setupFiles: ['__tests__/__helpers__/setup.ts'],
    // Algunos tests setean process.env / mockean Date — aislamos por archivo
    isolate: true,
  },
})
