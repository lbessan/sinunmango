import { describe, it, expect, vi } from 'vitest'
import {
  checkMonthlyLimit,
  commitMonthlyUsage,
  readMonthlyUsage,
  checkMonthlyUsageAsAdmin,
  enforceMonthlyLimitAsAdmin,
  usageHeaders,
  USAGE_LIMITS_FREE,
} from '@/lib/usage-limits'
import { createSupabaseMock } from './__helpers__/mock-supabase'

// usageHeaders ── puro, sin deps externas.
describe('usageHeaders', () => {
  it('devuelve headers para Free', () => {
    const headers = usageHeaders({ allowed: true, remaining: 3, limit: 5, used: 2 })
    expect(headers).toEqual({
      'X-Usage-Used':      '2',
      'X-Usage-Limit':     '5',
      'X-Usage-Remaining': '3',
    })
  })

  it('vacío para Pro (limit === -1)', () => {
    const headers = usageHeaders({ allowed: true, remaining: -1, limit: -1, used: -1 })
    expect(headers).toEqual({})
  })

  it('devuelve headers para Free agotado (allowed=false)', () => {
    const headers = usageHeaders({ allowed: false, remaining: 0, limit: 5, used: 5 })
    expect(headers).toEqual({
      'X-Usage-Used':      '5',
      'X-Usage-Limit':     '5',
      'X-Usage-Remaining': '0',
    })
  })
})

// checkMonthlyLimit ── lee usage actual via RPC get_usage, NO incrementa.
describe('checkMonthlyLimit', () => {
  it('Pro pasa sin tocar la RPC', async () => {
    const supabase = createSupabaseMock()
    const r = await checkMonthlyLimit(supabase, 'asistente', true)
    expect(r).toEqual({ allowed: true, remaining: -1, limit: -1, used: -1 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('Free bajo el límite → allowed=true con remaining correcto', async () => {
    const supabase = createSupabaseMock({
      rpc: { get_usage: { data: 2, error: null } },
    })
    const r = await checkMonthlyLimit(supabase, 'asistente', false)
    expect(r).toEqual({
      allowed: true,
      remaining: USAGE_LIMITS_FREE.asistente - 2,
      limit: USAGE_LIMITS_FREE.asistente,
      used: 2,
    })
  })

  it('Free al límite exacto → allowed=false', async () => {
    const supabase = createSupabaseMock({
      rpc: { get_usage: { data: USAGE_LIMITS_FREE.asistente, error: null } },
    })
    const r = await checkMonthlyLimit(supabase, 'asistente', false)
    expect(r).toEqual({
      allowed: false,
      remaining: 0,
      limit: USAGE_LIMITS_FREE.asistente,
      used: USAGE_LIMITS_FREE.asistente,
    })
  })

  it('Free sobre el límite (race condition) → allowed=false con used real', async () => {
    const supabase = createSupabaseMock({
      rpc: { get_usage: { data: 99, error: null } },
    })
    const r = await checkMonthlyLimit(supabase, 'mail_tarjeta', false)
    expect(r).toEqual({
      allowed: false,
      remaining: 0,
      limit: USAGE_LIMITS_FREE.mail_tarjeta,
      used: 99,
    })
  })

  it('Free con get_usage devolviendo null → trata como 0', async () => {
    const supabase = createSupabaseMock({
      rpc: { get_usage: { data: null, error: null } },
    })
    const r = await checkMonthlyLimit(supabase, 'asistente', false)
    expect(r.allowed).toBe(true)
    if (r.allowed && r.limit !== -1) {
      expect(r.used).toBe(0)
      expect(r.remaining).toBe(USAGE_LIMITS_FREE.asistente)
    }
  })
})

// commitMonthlyUsage ── incrementa via RPC increment_usage.
describe('commitMonthlyUsage', () => {
  it('Pro pasa sin tocar la RPC', async () => {
    const supabase = createSupabaseMock()
    const r = await commitMonthlyUsage(supabase, 'ticket', true)
    expect(r).toEqual({ allowed: true, remaining: -1, limit: -1, used: -1 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('Free OK → devuelve nuevo count y remaining', async () => {
    const supabase = createSupabaseMock({
      rpc: { increment_usage: { data: 3, error: null } },
    })
    const r = await commitMonthlyUsage(supabase, 'ticket', false)
    expect(r).toEqual({
      allowed: true,
      remaining: USAGE_LIMITS_FREE.ticket - 3,
      limit: USAGE_LIMITS_FREE.ticket,
      used: 3,
    })
  })

  it('Free con error de RPC → fail-open con used=1', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = createSupabaseMock({
      rpc: { increment_usage: { data: null, error: { message: 'db down' } } },
    })
    const r = await commitMonthlyUsage(supabase, 'asistente', false)
    expect(r.allowed).toBe(true)
    if (r.allowed && r.limit !== -1) {
      expect(r.used).toBe(1)
      expect(r.remaining).toBe(USAGE_LIMITS_FREE.asistente - 1)
    }
    consoleError.mockRestore()
  })

  it('remaining nunca es negativo si count supera el límite', async () => {
    const supabase = createSupabaseMock({
      rpc: { increment_usage: { data: 100, error: null } },
    })
    const r = await commitMonthlyUsage(supabase, 'ticket', false)
    expect(r.allowed).toBe(true)
    if (r.allowed && r.limit !== -1) {
      expect(r.remaining).toBe(0)
    }
  })
})

// readMonthlyUsage ── solo lectura, para UI.
describe('readMonthlyUsage', () => {
  it('Pro devuelve isPro=true y limits -1', async () => {
    const supabase = createSupabaseMock()
    const r = await readMonthlyUsage(supabase, 'asistente', true)
    expect(r).toEqual({ used: 0, limit: -1, remaining: -1, isPro: true })
  })

  it('Free con usage parcial', async () => {
    const supabase = createSupabaseMock({
      rpc: { get_usage: { data: 2, error: null } },
    })
    const r = await readMonthlyUsage(supabase, 'asistente', false)
    expect(r).toEqual({
      used: 2,
      limit: USAGE_LIMITS_FREE.asistente,
      remaining: USAGE_LIMITS_FREE.asistente - 2,
      isPro: false,
    })
  })

  it('Free sin uso (null en DB) usa 0', async () => {
    const supabase = createSupabaseMock({
      rpc: { get_usage: { data: null, error: null } },
    })
    const r = await readMonthlyUsage(supabase, 'asistente', false)
    expect(r.used).toBe(0)
  })

  it('remaining nunca negativo cuando used > limit', async () => {
    const supabase = createSupabaseMock({
      rpc: { get_usage: { data: 999, error: null } },
    })
    const r = await readMonthlyUsage(supabase, 'mail_tarjeta', false)
    expect(r.remaining).toBe(0)
  })
})

// checkMonthlyUsageAsAdmin ── lee usage_monthly por user_id directamente.
describe('checkMonthlyUsageAsAdmin', () => {
  it('Pro pasa sin tocar la tabla', async () => {
    const admin = createSupabaseMock()
    const r = await checkMonthlyUsageAsAdmin(admin, 'user-uuid', 'mail_tarjeta', true)
    expect(r).toEqual({ allowed: true, remaining: -1, limit: -1, used: -1 })
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('Free con uso 0 (sin fila) → allowed con remaining=limit', async () => {
    const admin = createSupabaseMock({
      table: { usage_monthly: { data: null, error: null } },
    })
    const r = await checkMonthlyUsageAsAdmin(admin, 'user-uuid', 'mail_tarjeta', false)
    expect(r).toEqual({
      allowed: true,
      remaining: USAGE_LIMITS_FREE.mail_tarjeta,
      limit: USAGE_LIMITS_FREE.mail_tarjeta,
      used: 0,
    })
  })

  it('Free al límite exacto → allowed=false', async () => {
    const admin = createSupabaseMock({
      table: { usage_monthly: {
        data: { count: USAGE_LIMITS_FREE.mail_tarjeta },
        error: null,
      } },
    })
    const r = await checkMonthlyUsageAsAdmin(admin, 'user-uuid', 'mail_tarjeta', false)
    expect(r.allowed).toBe(false)
  })

  it('Free uno bajo el límite → allowed con remaining=1', async () => {
    const admin = createSupabaseMock({
      table: { usage_monthly: {
        data: { count: USAGE_LIMITS_FREE.asistente - 1 },
        error: null,
      } },
    })
    const r = await checkMonthlyUsageAsAdmin(admin, 'user-uuid', 'asistente', false)
    expect(r.allowed).toBe(true)
    if (r.allowed && r.limit !== -1) {
      expect(r.remaining).toBe(1)
    }
  })
})

// enforceMonthlyLimitAsAdmin ── check+commit atómico via RPC.
describe('enforceMonthlyLimitAsAdmin', () => {
  it('Pro: la RPC retorna allowed=true con used>0 → mapeamos a pro response', async () => {
    const admin = createSupabaseMock({
      rpc: { increment_usage_admin: { data: { allowed: true, used: 42 }, error: null } },
    })
    const r = await enforceMonthlyLimitAsAdmin(admin, 'user-uuid', 'asistente', true)
    expect(r).toEqual({ allowed: true, remaining: -1, limit: -1, used: -1 })
  })

  it('Pro pasa p_limit=-1 a la RPC', async () => {
    const admin = createSupabaseMock({
      rpc: { increment_usage_admin: { data: { allowed: true, used: 1 }, error: null } },
    })
    await enforceMonthlyLimitAsAdmin(admin, 'user-uuid', 'asistente', true)
    expect(admin.rpc).toHaveBeenCalledWith('increment_usage_admin', {
      p_user_id: 'user-uuid',
      p_feature: 'asistente',
      p_limit:   -1,
    })
  })

  it('Free pasa p_limit=USAGE_LIMITS_FREE a la RPC', async () => {
    const admin = createSupabaseMock({
      rpc: { increment_usage_admin: { data: { allowed: true, used: 1 }, error: null } },
    })
    await enforceMonthlyLimitAsAdmin(admin, 'user-uuid', 'mail_tarjeta', false)
    expect(admin.rpc).toHaveBeenCalledWith('increment_usage_admin', {
      p_user_id: 'user-uuid',
      p_feature: 'mail_tarjeta',
      p_limit:   USAGE_LIMITS_FREE.mail_tarjeta,
    })
  })

  it('Free OK (commit exitoso): devuelve used y remaining correcto', async () => {
    const admin = createSupabaseMock({
      rpc: { increment_usage_admin: { data: { allowed: true, used: 1 }, error: null } },
    })
    const r = await enforceMonthlyLimitAsAdmin(admin, 'user-uuid', 'mail_tarjeta', false)
    expect(r).toEqual({
      allowed: true,
      remaining: 0,                                  // mail_tarjeta=1, used=1 → remaining=0
      limit: USAGE_LIMITS_FREE.mail_tarjeta,
      used: 1,
    })
  })

  it('Free agotado (RPC rechazó): devuelve allowed=false', async () => {
    const admin = createSupabaseMock({
      rpc: { increment_usage_admin: { data: { allowed: false, used: 1 }, error: null } },
    })
    const r = await enforceMonthlyLimitAsAdmin(admin, 'user-uuid', 'mail_tarjeta', false)
    expect(r).toEqual({
      allowed: false,
      remaining: 0,
      limit: USAGE_LIMITS_FREE.mail_tarjeta,
      used: 1,
    })
  })

  it('error de la RPC → fail-open (allowed=true sin consumir)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = createSupabaseMock({
      rpc: { increment_usage_admin: { data: null, error: { message: 'db down' } } },
    })
    const r = await enforceMonthlyLimitAsAdmin(admin, 'user-uuid', 'mail_tarjeta', false)
    expect(r.allowed).toBe(true)
    if (r.allowed && r.limit !== -1) {
      expect(r.used).toBe(0)
      expect(r.remaining).toBe(USAGE_LIMITS_FREE.mail_tarjeta)
    }
    consoleError.mockRestore()
  })

  it('error de la RPC con Pro → fail-open con shape pro', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = createSupabaseMock({
      rpc: { increment_usage_admin: { data: null, error: { message: 'down' } } },
    })
    const r = await enforceMonthlyLimitAsAdmin(admin, 'user-uuid', 'mail_tarjeta', true)
    expect(r).toEqual({ allowed: true, remaining: -1, limit: -1, used: -1 })
    consoleError.mockRestore()
  })
})
