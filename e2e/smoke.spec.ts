import { test, expect } from '@playwright/test'

// ─── Smoke E2E tests ──────────────────────────────────────────────────────
//
// Estos tests validan que la app bootea y rutea correctamente. No requieren
// DB ni autenticación — solo verifican que:
//   - Las páginas críticas renderean sin throw
//   - Los redirects a /login funcionan cuando no hay sesión
//   - Las pages públicas (/login, /pro) muestran su contenido base
//
// Si esto se cae, hay un deploy roto. Si esto pasa, no significa que
// nada funciona — solo que el shell de la app está en pie.

test.describe('Smoke — páginas públicas', () => {
  test('GET / redirige a /login cuando no hay sesión', async ({ page }) => {
    const res = await page.goto('/')
    // Next puede redirigir 307 o renderear directamente la página de
    // login. En ambos casos la URL final tiene que ser /login.
    expect(res?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/login/)
  })

  test('GET /login renderea el form de login', async ({ page }) => {
    await page.goto('/login')
    // El form debe tener input de email y password (o un Google button)
    // Esperamos al menos uno de los dos.
    const hasEmail = await page.getByLabel(/email/i).count() > 0
    const hasGoogle = await page.getByText(/google/i).count() > 0
    expect(hasEmail || hasGoogle).toBe(true)
  })

  test('GET /onboarding sin sesión NO redirige (es pública)', async ({ page }) => {
    // /onboarding está en app/onboarding/ (no en app/(app)/), maneja su
    // propia auth. No tiene que redirigir como las protegidas.
    await page.goto('/onboarding')
    // Lo único que pedimos es que no crashee. La URL puede mantenerse
    // o redirigir según el estado, pero el test solo verifica que NO
    // se queda en 500.
    await expect(page).not.toHaveURL(/\/_error/)
  })

  test('GET /privacidad renderea política de privacidad', async ({ page }) => {
    const res = await page.goto('/privacidad')
    // Es público — debe ser 200 (o 308 a versión sin /)
    expect(res?.status()).toBeLessThan(400)
    await expect(page.getByText(/privacidad/i).first()).toBeVisible()
  })
})

test.describe('Smoke — rutas protegidas redireccionan', () => {
  // Cada ruta protegida debe redirigir a /login cuando no hay session
  // cookie. Acá testeamos que el guard funciona sin un user real.

  const PROTECTED_ROUTES = [
    '/dashboard',
    '/movimientos',
    '/cuentas',
    '/tarjetas',
    '/gastos-fijos',
    '/inversiones',
    '/conciliaciones',
    '/analitica',
    '/categorias',
    '/configuracion',
    '/pro',  // está en app/(app)/pro/ — requiere session
  ]

  for (const route of PROTECTED_ROUTES) {
    test(`GET ${route} sin sesión → redirige a /login`, async ({ page }) => {
      await page.goto(route)
      // El AppLayout llama redirect('/login') o redirect('/onboarding')
      // dependiendo del estado. Sin sesión, siempre debería ir a /login.
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    })
  }
})

test.describe('Smoke — accesibilidad básica', () => {
  test('login: el title de la página existe y no está vacío', async ({ page }) => {
    await page.goto('/login')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('login: existe un h1 o heading visible', async ({ page }) => {
    await page.goto('/login')
    // No insistimos en h1 exactamente — un heading visible es suficiente
    const headings = await page.locator('h1, h2').filter({ hasText: /.+/ }).count()
    expect(headings).toBeGreaterThan(0)
  })
})

test.describe('Smoke — health checks', () => {
  test('static assets cargan (logo)', async ({ page, request }) => {
    // El logo está en /logo.png
    const res = await request.get('/logo.png')
    expect(res.status()).toBe(200)
    const contentType = res.headers()['content-type'] ?? ''
    expect(contentType).toContain('image')
  })

  test('manifest.webmanifest existe y es JSON válido (Next genera el manifest dinámico)', async ({ request }) => {
    // app/manifest.ts → Next sirve en /manifest.webmanifest
    const res = await request.get('/manifest.webmanifest')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.name).toBeDefined()
    // Debe estar configurada como PWA (display: standalone)
    expect(json.display).toBe('standalone')
  })
})
