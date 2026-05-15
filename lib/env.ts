import 'server-only'

// ─── Validación de env vars al boot ──────────────────────────────────────────
//
// Antes teníamos `process.env.X!` directo en los archivos consumers, así que
// un deploy sin la var crasheaba en runtime con un error opaco (`createClient
// of undefined` o "supabaseUrl is required").
//
// Esta función la llama instrumentation.ts al boot. Si faltan vars CRÍTICAS
// (sin las cuales la app no puede arrancar), tira un error claro. Si faltan
// OPCIONALES (features que pueden devolver 503), solo loggea en prod.

const CRITICAL_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

const OPTIONAL_PROD_VARS = [
  // Crons (todos los endpoints en /api/cron/* devuelven 503 sin esta)
  'CRON_SECRET',

  // Webhooks de subscripciones (sin estos no se reciben eventos de pago)
  'REVENUECAT_WEBHOOK_SECRET',
  'PUBSUB_VERIFICATION_TOKEN',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_PLAY_PACKAGE_NAME',

  // Email inbound (sin esto el endpoint devuelve 503)
  'RESEND_WEBHOOK_SECRET',

  // APIs externas (features individuales devuelven 503 si faltan)
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
] as const

export function validateEnv() {
  const missingCritical = CRITICAL_VARS.filter(v => !process.env[v])
  if (missingCritical.length > 0) {
    throw new Error(
      `[env] Missing critical env vars: ${missingCritical.join(', ')}\n` +
      `App cannot start without these. Set them in your deployment env.`
    )
  }

  // Warning suave en prod para las opcionales. En dev/preview no molestamos.
  if (process.env.VERCEL_ENV === 'production') {
    const missingOptional = OPTIONAL_PROD_VARS.filter(v => !process.env[v])
    if (missingOptional.length > 0) {
      console.warn(
        `[env] Production deploy missing optional env vars: ${missingOptional.join(', ')}\n` +
        `Las features que dependen de estas devolverán 503 hasta configurarlas.`
      )
    }
  }
}
