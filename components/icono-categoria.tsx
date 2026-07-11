// ─── IconoCategoria — ícono sólido sobre pastilla pastel ────────────────────
//
// Renderiza un glifo sólido monocromo (set Phosphor, desde /public/iconos/{slug}.svg)
// sobre una pastilla de color pastel según el grupo de la categoría. Resuelve:
//   1. Lucide legacy PascalCase (ej "ShoppingCart") → LUCIDE_TO_EMOJI → emoji
//   2. emoji del catálogo → su slug + color de grupo
//   3. emoji custom (fuera del catálogo) → el emoji del sistema sobre pastilla gris
//   4. null / kebab-case legacy / desconocido → genérico (etiqueta sobre gris)
//
// El footprint total es `size` (la pastilla); el glifo ocupa ~62% adentro.
// Server-safe (sin hooks): sólo <span>/<img>.

import type { ReactNode } from 'react'
import {
  EMOJI_TO_SLUG, LUCIDE_TO_EMOJI, EMOJI_TO_GRUPO, GRUPO_COLOR, ICONOS_VERSION,
} from '@/lib/emojis-catalogo'

type Props = {
  icono: string | null
  size?: number
  className?: string
}

const GENERIC_SLUG = EMOJI_TO_SLUG['🏷️']       // etiqueta
const GENERIC_COLOR = GRUPO_COLOR['Otros']

export function IconoCategoria({ icono, size = 24, className = '' }: Props) {
  // 1. Resolver el emoji canónico (o null si es custom / desconocido)
  let emoji: string | null = null
  if (icono && /^[A-Z][a-zA-Z0-9]+$/.test(icono)) emoji = LUCIDE_TO_EMOJI[icono] ?? null
  else if (icono && EMOJI_TO_SLUG[icono]) emoji = icono

  const glyph = Math.round(size * 0.74)
  const tile = (bg: string, inner: ReactNode) => (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{ width: size, height: size, background: bg, borderRadius: Math.round(size * 0.28), flexShrink: 0 }}
    >
      {inner}
    </span>
  )
  const glyphImg = (slug: string) => (
    <img
      src={`/iconos/${slug}.svg?v=${ICONOS_VERSION}`}
      alt=""
      width={glyph}
      height={glyph}
      style={{ width: glyph, height: glyph }}
      draggable={false}
    />
  )

  // 2. emoji del catálogo → glifo sólido + color de grupo
  if (emoji) {
    const color = GRUPO_COLOR[EMOJI_TO_GRUPO[emoji]] ?? GENERIC_COLOR
    return tile(color, glyphImg(EMOJI_TO_SLUG[emoji]))
  }

  // 3. emoji custom (unicode fuera del catálogo, no Lucide ni kebab-case) → el emoji
  if (icono && !/^[A-Z][a-zA-Z0-9]+$/.test(icono) && !/^[a-z][a-z0-9-]+$/.test(icono)) {
    return tile(GENERIC_COLOR, <span style={{ fontSize: glyph * 0.9, lineHeight: 1 }}>{icono}</span>)
  }

  // 4. null / kebab-case legacy / Lucide desconocido → genérico
  return tile(GENERIC_COLOR, glyphImg(GENERIC_SLUG))
}
