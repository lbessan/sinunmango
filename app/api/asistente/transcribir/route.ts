import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { checkRateLimit } from '@/lib/rate-limit'

// ─── POST /api/asistente/transcribir ────────────────────────────────────────
//
// Recibe un audio (multipart FormData), lo manda a OpenAI Whisper para
// transcribir, devuelve el texto.
//
// Whisper es lo más maduro/preciso para español argentino. Costo:
// $0.006/min ($0.0001 por audio de 1 segundo). Para un volumen normal
// (50 Pro × 30 audios/mes de 10s = 1500/mes), son ~$1.50/mes. Negligible.
//
// Por qué no usamos Web Speech API browser-side:
//   - Chrome desktop tira 'network' errors cuando hay VPN/blockers
//   - Safari iOS a veces no devuelve transcripción
//   - Calidad variable según motor del browser
//
// El audio puede venir en cualquier formato que MediaRecorder produzca
// (webm, ogg, mp4 según el browser). Whisper acepta todos.
//
// Body: FormData con campo "audio" (Blob).
// Response: { text: string } | { error: string }

// Límite: 25 MB es el máximo de Whisper (1 hora de audio típica).
// Audios de Manguito son cortos (~10-30s), no esperamos pasar 2 MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Rate limit defensivo — máx 30 transcripciones/minuto por user. Protege
  // contra loops en el cliente o abuso.
  const rl = await checkRateLimit(user.id, '/api/asistente/transcribir', { max: 30, windowSeconds: 60 })
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.message }, { status: 429 })
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.error('[transcribir] OPENAI_API_KEY no configurada')
    return NextResponse.json(
      { error: 'Transcripción no disponible — falta configuración del servidor.' },
      { status: 503 },
    )
  }

  // Recibir el audio del FormData
  let audioBlob: Blob
  try {
    const formData = await req.formData()
    const file = formData.get('audio')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'No recibí el audio.' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Audio vacío.' }, { status: 400 })
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio demasiado largo (máx 25 MB).' }, { status: 413 })
    }
    audioBlob = file
  } catch (err) {
    console.error('[transcribir] formData parse error:', err)
    return NextResponse.json({ error: 'No pude leer el audio.' }, { status: 400 })
  }

  // Llamar a Whisper. La API espera multipart con file + model + language.
  // language='es' mejora precisión vs auto-detect, y reduce alucinaciones
  // en otros idiomas cuando el audio es corto.
  const whisperForm = new FormData()
  // Whisper requiere un filename con extensión. Usamos webm como default
  // porque la mayoría de browsers (Chrome/Edge/Firefox) producen webm con
  // MediaRecorder. Safari usa mp4 — funciona también.
  const filename = guessFilename(audioBlob.type)
  whisperForm.append('file',     audioBlob, filename)
  whisperForm.append('model',    'whisper-1')
  whisperForm.append('language', 'es')
  // response_format='json' es el default — devuelve { text: "..." }

  let whisperRes: Response
  try {
    whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body:    whisperForm,
      // Timeout amplio — audios largos pueden tardar varios segundos en
      // transcribirse. Vercel Hobby corta a 60s; con 50s de margen estamos OK
      // para audios de hasta ~5 minutos.
      signal:  AbortSignal.timeout(50_000),
    })
  } catch (err) {
    console.error('[transcribir] fetch error:', err)
    return NextResponse.json(
      { error: 'No pude conectar con el servicio de transcripción. Probá de nuevo.' },
      { status: 502 },
    )
  }

  if (!whisperRes.ok) {
    const body = await whisperRes.text().catch(() => '')
    console.error('[transcribir] Whisper error:', whisperRes.status, body.slice(0, 300))
    return NextResponse.json(
      { error: 'Error del servicio de transcripción. Probá de nuevo.' },
      { status: 502 },
    )
  }

  const data = await whisperRes.json() as { text?: string }
  const text = (data.text ?? '').trim()

  if (!text) {
    // Audio se transcribió pero no se entendió nada (silencio o ruido).
    return NextResponse.json(
      { error: 'No te escuché bien. Probá de nuevo más cerca del micrófono.' },
      { status: 422 },
    )
  }

  return NextResponse.json({ text })
}

// Whisper requiere filename con extensión. Mapeo simple desde mime type.
function guessFilename(mimeType: string): string {
  if (mimeType.includes('webm')) return 'audio.webm'
  if (mimeType.includes('ogg'))  return 'audio.ogg'
  if (mimeType.includes('mp4'))  return 'audio.mp4'
  if (mimeType.includes('mpeg')) return 'audio.mp3'
  if (mimeType.includes('wav'))  return 'audio.wav'
  return 'audio.webm'  // fallback razonable
}
