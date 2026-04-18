import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  const carpeta  = formData.get('carpeta') as string
  const id       = formData.get('id') as string

  if (!file || !carpeta || !id) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const ext    = file.name.split('.').pop() ?? 'png'
  const ts     = Date.now()
  const path   = `${carpeta}/${id}_${ts}.${ext}`
  const buffer = await file.arrayBuffer()

  // Primero eliminar archivos anteriores del mismo id para no acumular basura
  const { data: archivosExistentes } = await adminClient.storage
    .from('app-imagenes')
    .list(carpeta, { search: id })

  if (archivosExistentes && archivosExistentes.length > 0) {
    const aEliminar = archivosExistentes.map(a => `${carpeta}/${a.name}`)
    await adminClient.storage.from('app-imagenes').remove(aEliminar)
  }

  const { error } = await adminClient.storage
    .from('app-imagenes')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { data } = adminClient.storage
    .from('app-imagenes')
    .getPublicUrl(path)

  return NextResponse.json({ url: data.publicUrl })
}
