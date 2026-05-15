import { NextRequest, NextResponse } from 'next/server'

// ─── Auth obligatorio para endpoints de cron ─────────────────────────────────
//
// Vercel Cron invoca con `Authorization: Bearer ${CRON_SECRET}`. Si la env
// var no está configurada, devolvemos 503 — NUNCA queremos un cron público
// que pueda dispararse manualmente (manda mails, llama a Claude, muta DB).
//
// Uso típico en un route handler:
//   export async function GET(req: NextRequest) {
//     const unauthorized = requireCronAuth(req)
//     if (unauthorized) return unauthorized
//     // ... lógica del cron ...
//   }
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron-auth] CRON_SECRET no configurado — endpoint deshabilitado')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
