import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createClientForRequest } from '@/lib/supabase/route'
import type { Database } from '@/lib/database.types'

type TableName = keyof Database['public']['Tables']

// ─── GET /api/me/export ───────────────────────────────────────────────────────
//
// Descarga un ZIP con todos los datos del user en formato CSV. Cumple con
// derecho de portabilidad (Habeas Data Art. 14 / GDPR Art. 20).
//
// Contenido del ZIP:
//   - README.txt              — explicación de cada archivo
//   - perfil.json             — info del user (email, plan, fechas)
//   - cuentas.csv             — bancos, billeteras, efectivo
//   - tarjetas.csv            — tarjetas de crédito (subset de cuentas)
//   - categorias.csv          — categorías + tipo
//   - subcategorias.csv       — subcategorías + categoría padre
//   - movimientos.csv         — todos los movimientos
//   - gastos_fijos.csv        — gastos recurrentes
//   - inversiones.csv         — PF, FCI, dólares, crypto, CEDEAR, bonos
//   - parametros.csv          — config personal (dólar histórico, etc.)
//
// El ZIP se arma en memoria con jszip (~50KB lib) y se streamea como
// application/zip al user. Filename: sinunmango-export-YYYY-MM-DD.zip

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const zip = new JSZip()

  // ── Profile (datos del user de auth + plan) ───────────────────────────────
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  zip.file(
    'perfil.json',
    JSON.stringify({
      id:           user.id,
      email:        user.email,
      created_at:   user.created_at,
      last_sign_in: user.last_sign_in_at,
      profile:      profile ?? null,
      exported_at:  new Date().toISOString(),
    }, null, 2),
  )

  // ── Datos transaccionales ────────────────────────────────────────────────
  // Cada tabla → CSV. RLS asegura que solo se devuelven las filas del user
  // (no hace falta filtrar manualmente por user_id, pero igual lo agregamos
  // como defensa en profundidad).
  const tables: Array<{ name: string; from: TableName }> = [
    { name: 'cuentas.csv',        from: 'cuentas' },
    { name: 'categorias.csv',     from: 'categorias' },
    { name: 'subcategorias.csv',  from: 'subcategorias' },
    { name: 'movimientos.csv',    from: 'movimientos' },
    { name: 'gastos_fijos.csv',   from: 'gastos_fijos' },
    { name: 'inversiones.csv',    from: 'inversiones' },
    { name: 'parametros.csv',     from: 'parametros' },
  ]

  for (const t of tables) {
    // Las tablas en `tables` arriba todas tienen user_id, pero TableName
    // (autogenerado de la DB) ahora incluye account_shares (sin user_id),
    // y el TS hace union de columnas → .eq('user_id', x) deja de tipear.
    // Cast del query builder con `unknown` + interface mínima.
    type Eqable = { eq: (col: string, val: string) => Promise<{ data: unknown; error: { message: string } | null }> }
    const builder = supabase.from(t.from).select('*') as unknown as Eqable
    const { data, error } = await builder.eq('user_id', user.id)

    if (error) {
      console.warn(`[me/export] error fetching ${t.from}:`, error.message)
      zip.file(t.name, `# Error al obtener datos de ${t.from}: ${error.message}\n`)
      continue
    }

    zip.file(t.name, rowsToCsv((data ?? []) as Record<string, unknown>[]))
  }

  // ── README explicativo ───────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  zip.file('README.txt', readme(user.email ?? '', today))

  // ── Generar y enviar el ZIP ──────────────────────────────────────────────
  // Generamos como nodebuffer (Buffer) — Next.js Response acepta cualquier
  // BodyInit incluido Uint8Array/Buffer.
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="sinunmango-export-${today}.zip"`,
      'Cache-Control':       'no-store',
    },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convierte un array de rows (objects) a string CSV.
 * - Headers de la primera row.
 * - Strings con coma, comillas o newline van envueltos en comillas dobles.
 * - Comillas dobles dentro de un valor se escapan duplicándolas (RFC 4180).
 * - null → string vacío.
 */
function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape  = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ]
  return lines.join('\n')
}

function readme(email: string, exportDate: string): string {
  return `sinunmango — exportación de tus datos
==============================================

Fecha de exportación: ${exportDate}
Cuenta: ${email}

Este archivo ZIP contiene todos tus datos en formato fácil de procesar.
Podés abrir los .csv en Excel, Google Sheets o cualquier editor de texto.

CONTENIDO
---------

perfil.json
  Tu información de cuenta: email, fecha de alta, plan actual.

cuentas.csv
  Tus bancos, billeteras virtuales, efectivo y tarjetas de crédito.
  Cada fila es una cuenta con su saldo inicial, moneda, tipo, etc.

categorias.csv + subcategorias.csv
  Las categorías que usás para clasificar tus movimientos.
  Subcategorias tiene un campo "categoria_padre" que referencia a categorias.

movimientos.csv
  Todos tus gastos, ingresos y transferencias.
  - Columnas relevantes: fecha, detalle, monto, moneda, cuenta_origen,
    cuenta_destino, categoria, subcategoria, tipo_movimiento.
  - Si tipo_movimiento es "Transferencia", cuenta_origen y cuenta_destino
    apuntan a las dos cuentas involucradas.
  - cuotas_total > 1 indica que el movimiento es parte de una serie de
    cuotas; cuota_actual indica cuál de las N.

gastos_fijos.csv
  Recurrentes mensuales: Netflix, expensas, prepaga, etc.

inversiones.csv
  Plazos fijos, FCI, dólares, crypto, CEDEAR, bonos, ON.
  El campo "tipo" indica de cuál se trata; "datos" tiene info específica.

parametros.csv
  Parámetros personales (ej. cotización del dólar usada en cálculos).

PRIVACIDAD
----------

Estos datos son tuyos. sinunmango no se queda con copia después de la
exportación. Si querés eliminar tu cuenta y datos del servicio, andá a
Configuración → Eliminar cuenta.

Si tenés dudas: luchobessan@gmail.com
`
}
