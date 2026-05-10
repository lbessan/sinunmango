import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// ─── Validaciones ─────────────────────────────────────────────────────────────
const ALLOWED_CARPETAS = new Set(['cuentas', 'bancos', 'categorias'])
const ID_PATTERN       = /^[a-zA-Z0-9_-]{1,64}$/
const MAX_BYTES        = 5 * 1024 * 1024  // 5 MB

/**
 * Detecta el MIME real desde los magic bytes del archivo.
 * Más confiable que `file.type`, que viene del cliente y puede mentir.
 * Solo permitimos los formatos que la app realmente necesita.
 */
function detectImageMime(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' }
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  // WebP: "RIFF" + 4 bytes de tamaño + "WEBP"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

// ─── POST /api/upload-imagen ──────────────────────────────────────────────────
// Sube una imagen al bucket "app-imagenes". Body: multipart/form-data con:
//   - file:    archivo (PNG / JPEG / WebP, máx 5 MB)
//   - carpeta: 'cuentas' | 'bancos' | 'categorias'
//   - id:      identificador del recurso (alfanumérico + _ y -, hasta 64 chars)

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Form data inválido' }, { status: 400 })
  }

  const file    = formData.get('file')
  const carpeta = String(formData.get('carpeta') ?? '')
  const id      = String(formData.get('id') ?? '')

  // ── Validación de inputs ────────────────────────────────────────────────────
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  }
  if (!ALLOWED_CARPETAS.has(carpeta)) {
    return NextResponse.json({ error: 'Carpeta no permitida' }, { status: 400 })
  }
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera el máximo de ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 }
    )
  }

  // ── Leer bytes y validar tipo real (magic bytes, no file.type) ─────────────
  const buffer   = await file.arrayBuffer()
  const detected = detectImageMime(new Uint8Array(buffer))
  if (!detected) {
    return NextResponse.json(
      { error: 'Formato no permitido. Solo PNG, JPEG o WebP.' },
      { status: 400 }
    )
  }

  // ── Construir path solo con bytes ya validados (path traversal-safe) ───────
  const ts   = Date.now()
  const path = `${carpeta}/${id}_${ts}.${detected.ext}`

  // ── Limpiar archivos anteriores del mismo id ────────────────────────────────
  const { data: archivosExistentes } = await adminClient.storage
    .from('app-imagenes')
    .list(carpeta, { search: id })

  if (archivosExistentes && archivosExistentes.length > 0) {
    const aEliminar = archivosExistentes.map(a => `${carpeta}/${a.name}`)
    await adminClient.storage.from('app-imagenes').remove(aEliminar)
  }

  // ── Subir con el MIME detectado (no con file.type del cliente) ─────────────
  const { error } = await adminClient.storage
    .from('app-imagenes')
    .upload(path, buffer, { contentType: detected.mime, upsert: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { data } = adminClient.storage
    .from('app-imagenes')
    .getPublicUrl(path)

  return NextResponse.json({ url: data.publicUrl })
}
