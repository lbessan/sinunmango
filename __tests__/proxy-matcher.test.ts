// El matcher del proxy decide en qué requests se refresca la sesión. Un typo
// acá puede dejar /api/movimientos sin refresco (vuelve el 401) o hacer correr
// el proxy sobre estáticos/webhooks. Lo fijamos con casos.
import { describe, it, expect } from 'vitest'
import { config } from '@/proxy'

const matcher = Array.isArray(config.matcher) ? config.matcher[0] : config.matcher
const re = new RegExp('^' + matcher + '$')
const corre = (path: string) => re.test(path)

describe('proxy matcher', () => {
  it('CORRE en las rutas que necesitan sesión fresca', () => {
    for (const p of [
      '/api/movimientos',
      '/api/parsear-resumen',
      '/conciliaciones/cta_10/2026-09-01',
      '/dashboard',
      '/monotributo',
      '/',            // landing/redirect: refresca si hay sesión, si no pasa
      '/login',       // sin sesión no hace nada, pero no debe romper
    ]) {
      expect(corre(p), `debería correr en ${p}`).toBe(true)
    }
  })

  it('NO corre en estáticos ni webhooks (no dependen de cookies)', () => {
    for (const p of [
      '/_next/static/chunks/main.js',
      '/_next/image',
      '/favicon.ico',
      '/manifest.webmanifest',
      '/sw.js',
      '/robots.txt',
      '/api/cron/afip-sync',
      '/api/email-inbound',
      '/api/webhooks/revenuecat',
      '/logo.png',
      '/banco.svg',
      '/fuente.woff2',
    ]) {
      expect(corre(p), `NO debería correr en ${p}`).toBe(false)
    }
  })
})
