// ─── IconoCategoria — render de iconos de categorías ────────────────────────
//
// Renderiza el icono 3D (Fluent Emoji de Microsoft) como imagen desde
// /public/emojis/{slug}.svg. Resuelve el slug así:
//   1. Lucide legacy PascalCase (ej "ShoppingCart") → LUCIDE_TO_EMOJI → imagen
//      (o genérico 🏷️ si no está mapeado)
//   2. kebab-case legacy / null → genérico 🏷️
//   3. Emoji Unicode con imagen en el catálogo → imagen Fluent
//   4. Emoji Unicode sin imagen (custom pegado por el user) → emoji del sistema
//
// Es server-safe (no usa hooks): solo <img> / <span>.

import { EMOJI_TO_SLUG, LUCIDE_TO_EMOJI } from '@/lib/emojis-catalogo'

type Props = {
  icono: string | null
  size?: number
  className?: string
}

const GENERIC_SLUG = EMOJI_TO_SLUG['🏷️']

export function IconoCategoria({ icono, size = 24, className = '' }: Props) {
  const img = (slug: string) => (
    <img
      src={`/emojis/${slug}.svg`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )

  // Lucide legacy (PascalCase) → emoji mapeado o genérico
  if (icono && /^[A-Z][a-zA-Z0-9]+$/.test(icono)) {
    const emoji = LUCIDE_TO_EMOJI[icono]
    return img(emoji ? EMOJI_TO_SLUG[emoji] ?? GENERIC_SLUG : GENERIC_SLUG)
  }

  // null o kebab-case legacy → genérico
  if (!icono || /^[a-z][a-z0-9-]+$/.test(icono)) {
    return img(GENERIC_SLUG)
  }

  // Emoji: si está en el catálogo, imagen Fluent; sino, el emoji del sistema
  const slug = EMOJI_TO_SLUG[icono]
  if (slug) return img(slug)
  return <span style={{ fontSize: size * 0.85, lineHeight: 1 }} className={className}>{icono}</span>
}
