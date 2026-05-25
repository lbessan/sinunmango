import { defineConfig, devices } from '@playwright/test'

// ─── Playwright config ──────────────────────────────────────────────────────
//
// Pensado para SMOKE TESTS, no flows end-to-end completos. Los tests acá
// validan que la app bootea, rutea correctamente y que las páginas
// críticas no crashean. Los flows con DB van por unit/integration.
//
// Por qué no E2E completo en este momento:
//   - Requeriría un proyecto Supabase aislado para tests o mocks pesados
//     a nivel de network (MSW + intercepts en el navegador).
//   - El cost/benefit no compensa hasta que la app tenga más volumen de
//     bugs E2E reales (que no encuentren los unit tests).
//
// Cuando llegue ese momento, migrar a un setup con:
//   - Supabase test project + service_role para sembrar usuarios
//   - Storage state pre-autenticado (saveState/loadState)
//   - Mock de MP API responses (MSW o playwright route intercept)
//   - Mock de OpenAI/Anthropic con fixtures grabados

export default defineConfig({
  testDir:    './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries:    process.env.CI ? 2 : 0,
  workers:    process.env.CI ? 1 : undefined,
  reporter:   process.env.CI ? [['github'], ['html']] : 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace:   'on-first-retry',
    // No grabamos videos/screenshots en cada test — solo en retries
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport para validar layout responsive (sin emular touch real)
    {
      name: 'mobile-chrome',
      use:  { ...devices['Pixel 7'] },
    },
  ],

  // Boot del Next dev server antes de correr los tests. Si el server ya
  // está corriendo (dev local), `reuseExistingServer: true` lo aprovecha.
  webServer: {
    command:                 'npm run dev',
    url:                     'http://localhost:3000',
    reuseExistingServer:     !process.env.CI,
    timeout:                 120_000,
    stdout:                  'ignore',
    stderr:                  'pipe',
  },
})
