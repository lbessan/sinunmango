'use client'

// ─── ImgIcono — DEPRECATED ──────────────────────────────────────────────────
//
// Mantengo este wrapper como compat para cualquier import legacy que se haya
// escapado. La implementación nueva delega en <IconoCategoria> que soporta
// Lucide directamente.
//
// Borrar este archivo cuando todos los usos hayan migrado a IconoCategoria.

import { IconoCategoria } from './icono-categoria'

type Props = {
  nombre: string
  size: number
  className?: string
}

export function ImgIcono({ nombre, size, className = '' }: Props) {
  return <IconoCategoria icono={nombre} size={size} className={className} />
}
