'use client'

// ─── IconoCategoria — render robusto de iconos de categorías ────────────────
//
// Soporta 3 tipos de valores en el campo `icono`:
//   1. PascalCase Lucide (ej: "ShoppingCart") → renderiza el componente Lucide
//   2. Emoji Unicode (ej: "🛒") → renderiza el emoji
//   3. legacy Icons8 (ej: "shopping-cart") → fallback a emoji genérico 🏷️
//   4. null / undefined → emoji genérico 🏷️
//
// El sistema nuevo usa Lucide. Los legacy emojis siguen funcionando para no
// romper categorías existentes ni el seed default que usa emojis.

import * as Icons from 'lucide-react'

type Props = {
  icono: string | null
  size?: number
  className?: string
  color?: string
}

export function IconoCategoria({ icono, size = 20, className = '', color }: Props) {
  if (!icono) {
    return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>🏷️</span>
  }

  // Intentar como Lucide (PascalCase)
  if (/^[A-Z][a-zA-Z0-9]+$/.test(icono)) {
    const Icon = (Icons as Record<string, unknown>)[icono] as React.ComponentType<{ size?: number; className?: string; color?: string; strokeWidth?: number }> | undefined
    if (Icon) {
      return <Icon size={size} className={`inline-block ${className}`} color={color} strokeWidth={1.75} />
    }
  }

  // Legacy Icons8 (kebab-case): ya no se renderiza, va a emoji generico.
  // Para forzar la migración, cualquier categoría que tenga un icono kebab-case
  // muestra el genérico hasta que el user lo cambie con el picker.
  if (/^[a-z][a-z0-9-]+$/.test(icono)) {
    return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>🏷️</span>
  }

  // Emoji o texto: render directo
  return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{icono}</span>
}
