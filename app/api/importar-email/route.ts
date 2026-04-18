import { NextRequest, NextResponse } from 'next/server'
import { parseEmail, type ParsedMov } from '@/lib/email-parsers'

export type { ParsedMov }

export async function POST(req: NextRequest) {
  const { texto } = (await req.json()) as { texto: string }

  if (!texto?.trim()) {
    return NextResponse.json({ ok: false, error: 'El texto está vacío.' }, { status: 400 })
  }

  const parsed = parseEmail(texto)

  if (!parsed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No se reconoció el formato. Probá con emails de BBVA, Banco Provincia o Mercado Pago. ' +
          'Asegurate de copiar el cuerpo completo del mail.',
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ok: true, data: parsed })
}
