// ⚠ ENDPOINT TEMPORAL — verificar que Sentry está capturando eventos en prod.
// Después de confirmar que aparece en el feed de Issues, BORRAR este archivo.

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    throw new Error('Sentry test from sinunmango — verificar en Issues feed y borrar este endpoint')
  } catch (err) {
    Sentry.captureException(err)
    // En serverless la función puede terminar antes de que el evento se mande.
    // flush() espera hasta 2s para asegurar que se envió.
    await Sentry.flush(2000)
  }
  return NextResponse.json({
    ok: true,
    message: 'Error de prueba enviado. Verificá en https://sentry.io → tu proyecto → Issues',
  })
}
