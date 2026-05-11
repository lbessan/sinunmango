import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateHexColor,
  type Validated,
} from '@/lib/validators'

type BancoInsert = {
  nombre:            string
  color:             string
  imagen_url:        string | null
  imagen_banner_url: string | null
}

function validateBanco(raw: unknown): Validated<BancoInsert> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const nombre = validateString(b.nombre, { max: 50, field: 'nombre' })
  if (!nombre.ok) return nombre

  let color = '#475569'
  if (b.color !== undefined && b.color !== null && b.color !== '') {
    const v = validateHexColor(b.color, 'color')
    if (!v.ok) return v
    color = v.data
  }

  let imagen_url: string | null = null
  if (b.imagen_url !== undefined && b.imagen_url !== null && b.imagen_url !== '') {
    const v = validateString(b.imagen_url, { max: 500, field: 'imagen_url' })
    if (!v.ok) return v
    imagen_url = v.data
  }

  let imagen_banner_url: string | null = null
  if (b.imagen_banner_url !== undefined && b.imagen_banner_url !== null && b.imagen_banner_url !== '') {
    const v = validateString(b.imagen_banner_url, { max: 500, field: 'imagen_banner_url' })
    if (!v.ok) return v
    imagen_banner_url = v.data
  }

  return { ok: true, data: { nombre: nombre.data, color, imagen_url, imagen_banner_url } }
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('bancos_custom')
    .select('*')
    .eq('user_id', user.id)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateBanco(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const id = crypto.randomUUID()
  const { error } = await supabase.from('bancos_custom').insert({ id, user_id: user.id, ...v.data })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}
