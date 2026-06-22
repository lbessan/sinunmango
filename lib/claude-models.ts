// ─── Claude models — single source of truth ────────────────────────────────
//
// Cada endpoint de Claude usa una constante de este módulo en lugar de
// hardcodear el modelo. Las constantes leen primero la env var
// correspondiente, después caen al default.
//
// Esto permite experimentar con modelos distintos en producción sin
// redeploy: cambiamos la env var en Vercel, redeploy, y monitoreamos
// resultados en Anthropic Console. Si funciona, cambiamos el default
// acá. Si no, removemos la env var y vuelve al default.
//
// Ver docs/scaling-plan.md para análisis detallado de qué modelo
// conviene usar en cada endpoint.

/** Asistente conversacional ("Manguito"). Usa tool use. */
export const MODEL_ASISTENTE = process.env.CLAUDE_MODEL_ASISTENTE
  ?? 'claude-sonnet-4-6'

/** Misma tarea que asistente pero variante mobile. */
export const MODEL_ASISTENTE_MOBILE = process.env.CLAUDE_MODEL_ASISTENTE_MOBILE
  ?? 'claude-sonnet-4-6'

/** Parsear PDF de resumen de tarjeta (extracción estructurada con
 *  edge cases jugados: cuotas, impuestos, ajustes).
 *  Haiku 4.5: ~3x más rápido que Sonnet, calidad muy buena para
 *  parsing estructurado. Crítico en Vercel Hobby (60s tope). */
export const MODEL_PARSEAR_TARJETA_PDF = process.env.CLAUDE_MODEL_PARSEAR_TARJETA_PDF
  ?? 'claude-haiku-4-5-20251001'

/** Idéntica tarea a la anterior — variante histórica que conviene unificar. */
export const MODEL_PARSEAR_RESUMEN = process.env.CLAUDE_MODEL_PARSEAR_RESUMEN
  ?? 'claude-haiku-4-5-20251001'

/** Parsear PDF de factura emitida (monotributo). Extracción estructurada de
 *  1 comprobante: cliente, monto, CAE, período, etc. Más simple que un
 *  resumen de tarjeta (1 doc, pocos campos) — Haiku sobra. */
export const MODEL_PARSEAR_FACTURA = process.env.CLAUDE_MODEL_PARSEAR_FACTURA
  ?? 'claude-haiku-4-5-20251001'

/** Leer foto de ticket → JSON con monto + comercio + fecha. Tarea visual
 *  simple, Haiku la maneja igual de bien que Sonnet. */
export const MODEL_LEER_TICKET = process.env.CLAUDE_MODEL_LEER_TICKET
  ?? 'claude-haiku-4-5-20251001'

/** Email del banco → transacciones. Texto simple, Haiku alcanza. */
export const MODEL_EMAIL_INBOUND = process.env.CLAUDE_MODEL_EMAIL_INBOUND
  ?? 'claude-haiku-4-5-20251001'

/** Insights de analytics (texto narrativo sobre movimientos). Haiku. */
export const MODEL_ANALITICA_INSIGHT = process.env.CLAUDE_MODEL_ANALITICA_INSIGHT
  ?? 'claude-haiku-4-5-20251001'
