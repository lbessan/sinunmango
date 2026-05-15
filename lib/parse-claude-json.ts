// Helpers para parsear respuestas JSON de Claude API.
//
// Claude tiende a devolver respuestas que:
//   - Vienen envueltas en code fences ```json ... ```
//   - A veces se truncan cuando max_tokens se agota (especialmente en PDFs
//     largos donde max_tokens=16000 no alcanza)
//
// `parseClaudeJSON` cubre el happy path; `recoverPartialArray` rescata un
// array parcial cuando el JSON principal está cortado.

/** Quita backticks de markdown alrededor del JSON. */
export function stripMarkdownFences(s: string): string {
  return s
    .replace(/```(?:json)?\n?/g, '')
    .replace(/```/g, '')
    .trim()
}

/** Parsea respuesta de Claude como JSON. Devuelve null si no parsea. */
export function parseClaudeJSON<T = unknown>(rawText: string): T | null {
  const clean = stripMarkdownFences(rawText)
  try {
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}

/**
 * Intenta rescatar un array parcial de un JSON truncado.
 * Busca `"<key>": [...` en el texto y prueba variantes para cerrar el array:
 *   1. Si ya tiene `]` cerrado, usar el array tal cual
 *   2. Cerrar después del último `}` (último elemento completo, sin truncar)
 *   3. Cerrar antes del último `},` (descarta el último elemento incompleto)
 *
 * Devuelve null si no encuentra el array o si ninguna variante parsea.
 */
export function recoverPartialArray<T = unknown>(rawText: string, key: string): T[] | null {
  const clean   = stripMarkdownFences(rawText)
  const escKey  = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match   = clean.match(new RegExp(`"${escKey}"\\s*:\\s*(\\[[\\s\\S]*)`))
  if (!match) return null

  const arr = match[1]
  const candidates: string[] = []

  // Variante 1: array ya cerrado con `]` (caso más común)
  const closeIdx = arr.indexOf(']')
  if (closeIdx !== -1) candidates.push(arr.slice(0, closeIdx + 1))

  // Variante 2: cerrar después del último `}` (último elemento completo)
  const lastClose = arr.lastIndexOf('}')
  if (lastClose !== -1) candidates.push(arr.slice(0, lastClose + 1) + ']')

  // Variante 3: cortar antes del último `},` (descarta elemento truncado)
  const lastSep = arr.lastIndexOf('},')
  if (lastSep !== -1) candidates.push(arr.slice(0, lastSep + 1) + ']')

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return parsed as T[]
    } catch { /* try next */ }
  }
  return null
}

/**
 * Intenta extraer un objeto JSON nested por su key.
 * Útil cuando el JSON está truncado pero queremos rescatar un bloque
 * cerrado completo (ej. `"tarjeta": { ... }` del flow de parseo de PDFs).
 *
 * Solo matchea objetos sin llaves anidadas en el primer nivel — es una
 * heurística simple, no un parser completo.
 */
export function recoverObject<T = unknown>(rawText: string, key: string): T | null {
  const clean   = stripMarkdownFences(rawText)
  const escKey  = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match   = clean.match(new RegExp(`"${escKey}"\\s*:\\s*(\\{[^{}]+\\})`))
  if (!match) return null

  try {
    return JSON.parse(match[1]) as T
  } catch {
    return null
  }
}
