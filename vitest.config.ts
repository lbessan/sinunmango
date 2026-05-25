import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` tira "no se puede importar desde client" cuando vitest
      // lo importa fuera del runtime de Next. Lo aliasamos a un noop para
      // que los tests puedan importar libs marcadas como server-only.
      'server-only': path.resolve(__dirname, '__tests__/__helpers__/server-only-noop.ts'),
    },
  },
  test: {
    environment: 'node',
    // Soporta .ts (tests de API/lib en node env) y .tsx (component tests
    // que opt-in al happy-dom env con // @vitest-environment happy-dom).
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    // El archivo de setup corre antes de cada test file. Lo usamos para
    // setear env vars fake que algunos módulos requieren al import time
    // (ej: lib/supabase/admin.ts instancia el cliente en module load).
    setupFiles: ['__tests__/__helpers__/setup.ts'],
    // Algunos tests setean process.env / mockean Date — aislamos por archivo
    isolate: true,
  },
})
