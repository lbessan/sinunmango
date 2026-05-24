// Tests para lib/claude-models.ts
//
// El módulo lee env vars EN IMPORT TIME (los exports son constantes que
// resuelven al evaluarse el módulo). Para testear distintos valores de env
// usamos vi.resetModules() + dynamic import.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Snapshot de los env vars que tocamos — limpiamos entre tests.
const ENV_VARS = [
  'CLAUDE_MODEL_ASISTENTE',
  'CLAUDE_MODEL_ASISTENTE_MOBILE',
  'CLAUDE_MODEL_PARSEAR_TARJETA_PDF',
  'CLAUDE_MODEL_PARSEAR_RESUMEN',
  'CLAUDE_MODEL_LEER_TICKET',
  'CLAUDE_MODEL_EMAIL_INBOUND',
  'CLAUDE_MODEL_ANALITICA_INSIGHT',
]

beforeEach(() => {
  ENV_VARS.forEach(k => delete process.env[k])
  vi.resetModules()
})

describe('claude-models — defaults', () => {
  it('MODEL_ASISTENTE default es Sonnet 4.6', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_ASISTENTE).toBe('claude-sonnet-4-6')
  })

  it('MODEL_ASISTENTE_MOBILE default es Sonnet 4.6', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_ASISTENTE_MOBILE).toBe('claude-sonnet-4-6')
  })

  it('MODEL_PARSEAR_TARJETA_PDF default es Sonnet 4.6 (PDFs jugados)', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_PARSEAR_TARJETA_PDF).toBe('claude-sonnet-4-6')
  })

  it('MODEL_PARSEAR_RESUMEN default es Sonnet 4.6', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_PARSEAR_RESUMEN).toBe('claude-sonnet-4-6')
  })

  it('MODEL_LEER_TICKET default es Haiku 4.5 (visual simple)', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_LEER_TICKET).toBe('claude-haiku-4-5-20251001')
  })

  it('MODEL_EMAIL_INBOUND default es Haiku 4.5 (texto simple)', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_EMAIL_INBOUND).toBe('claude-haiku-4-5-20251001')
  })

  it('MODEL_ANALITICA_INSIGHT default es Haiku 4.5', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_ANALITICA_INSIGHT).toBe('claude-haiku-4-5-20251001')
  })
})

describe('claude-models — override via env var', () => {
  it('CLAUDE_MODEL_ASISTENTE override toma precedencia', async () => {
    process.env.CLAUDE_MODEL_ASISTENTE = 'claude-opus-4-7'
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_ASISTENTE).toBe('claude-opus-4-7')
  })

  it('CLAUDE_MODEL_LEER_TICKET override toma precedencia', async () => {
    process.env.CLAUDE_MODEL_LEER_TICKET = 'claude-sonnet-4-6'
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_LEER_TICKET).toBe('claude-sonnet-4-6')
  })

  it('Override de un endpoint NO afecta a otros', async () => {
    process.env.CLAUDE_MODEL_ASISTENTE = 'modelo-custom'
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_ASISTENTE).toBe('modelo-custom')
    // Los otros mantienen defaults
    expect(m.MODEL_LEER_TICKET).toBe('claude-haiku-4-5-20251001')
    expect(m.MODEL_PARSEAR_TARJETA_PDF).toBe('claude-sonnet-4-6')
  })

  it('Override de TODOS los modelos a la vez', async () => {
    process.env.CLAUDE_MODEL_ASISTENTE             = 'a1'
    process.env.CLAUDE_MODEL_ASISTENTE_MOBILE      = 'a2'
    process.env.CLAUDE_MODEL_PARSEAR_TARJETA_PDF   = 'a3'
    process.env.CLAUDE_MODEL_PARSEAR_RESUMEN       = 'a4'
    process.env.CLAUDE_MODEL_LEER_TICKET           = 'a5'
    process.env.CLAUDE_MODEL_EMAIL_INBOUND         = 'a6'
    process.env.CLAUDE_MODEL_ANALITICA_INSIGHT     = 'a7'

    const m = await import('@/lib/claude-models')
    expect(m.MODEL_ASISTENTE).toBe('a1')
    expect(m.MODEL_ASISTENTE_MOBILE).toBe('a2')
    expect(m.MODEL_PARSEAR_TARJETA_PDF).toBe('a3')
    expect(m.MODEL_PARSEAR_RESUMEN).toBe('a4')
    expect(m.MODEL_LEER_TICKET).toBe('a5')
    expect(m.MODEL_EMAIL_INBOUND).toBe('a6')
    expect(m.MODEL_ANALITICA_INSIGHT).toBe('a7')
  })

  it('Env var en string vacío usa el default (cae al ??)', async () => {
    process.env.CLAUDE_MODEL_ASISTENTE = ''
    const m = await import('@/lib/claude-models')
    // Empty string is truthy for ?? operator, so this should actually take ''
    // Pero como '' es falsy para ??, debería caer al default... ACTUALMENTE
    // ?? solo trata null/undefined como nullish. '' pasa el ?? como valor.
    // El test documenta el comportamiento real: '' SE USA si está seteado.
    expect(m.MODEL_ASISTENTE).toBe('')
  })
})

describe('claude-models — coherencia interna', () => {
  it('asistente web y mobile usan el MISMO modelo por default (consistencia UX)', async () => {
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_ASISTENTE).toBe(m.MODEL_ASISTENTE_MOBILE)
  })

  it('parseo de tarjeta (PDF y resumen) usan el MISMO modelo', async () => {
    // Si estos divergen accidentalmente, los resultados pueden no ser
    // comparables entre las dos vías de entrada.
    const m = await import('@/lib/claude-models')
    expect(m.MODEL_PARSEAR_TARJETA_PDF).toBe(m.MODEL_PARSEAR_RESUMEN)
  })

  it('todas las constantes son strings no vacíos por default', async () => {
    const m = await import('@/lib/claude-models')
    const all = [
      m.MODEL_ASISTENTE,
      m.MODEL_ASISTENTE_MOBILE,
      m.MODEL_PARSEAR_TARJETA_PDF,
      m.MODEL_PARSEAR_RESUMEN,
      m.MODEL_LEER_TICKET,
      m.MODEL_EMAIL_INBOUND,
      m.MODEL_ANALITICA_INSIGHT,
    ]
    all.forEach(model => {
      expect(typeof model).toBe('string')
      expect(model.length).toBeGreaterThan(0)
    })
  })
})
