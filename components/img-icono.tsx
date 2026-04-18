'use client'

// Componente de imagen con fallback automático al slug 'alt'
// Usar en pickers y modales donde no se puede usar IconoCategoria (no tiene acceso al estado)

import { useState } from 'react'
import { urlIcono, ICONOS_CATEGORIAS } from '@/lib/iconos-categorias'

type Props = {
  nombre: string
  size: number
  className?: string
}

export function ImgIcono({ nombre, size, className = '' }: Props) {
  const [failedMain, setFailedMain] = useState(false)
  const [failedAlt,  setFailedAlt]  = useState(false)

  const alt = ICONOS_CATEGORIAS.find(i => i.nombre === nombre)?.alt ?? null

  if (failedAlt || (!alt && failedMain)) {
    return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>🏷️</span>
  }

  if (failedMain && alt) {
    return (
      <img src={urlIcono(alt, 64)} alt={nombre}
        width={size} height={size}
        className={`object-contain ${className}`}
        loading="lazy"
        onError={() => setFailedAlt(true)}
      />
    )
  }

  return (
    <img src={urlIcono(nombre, 64)} alt={nombre}
      width={size} height={size}
      className={`object-contain ${className}`}
      loading="lazy"
      onError={() => setFailedMain(true)}
    />
  )
}
