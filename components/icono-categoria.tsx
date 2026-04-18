'use client'

import { useState } from 'react'
import * as Icons from 'lucide-react'

// Importamos urlIcono e ICONOS_CATEGORIAS para el fallback
let _iconos: Array<{ nombre: string; alt?: string }> = []
let _urlFn: (n: string, s?: number) => string = (n) => `https://img.icons8.com/stickers/96/${n}.png`

try {
  const mod = require('@/lib/iconos-categorias')
  _iconos = mod.ICONOS_CATEGORIAS ?? []
  _urlFn  = mod.urlIcono ?? _urlFn
} catch {}

function tipoIcono(str: string): 'icons8' | 'lucide' | 'emoji' {
  if (/^[A-Z][a-zA-Z0-9]+$/.test(str)) return 'lucide'
  if (/^[a-z][a-z0-9-]+$/.test(str))   return 'icons8'
  return 'emoji'
}

type Props = {
  icono: string | null
  size?: number
  className?: string
  color?: string
}

export function IconoCategoria({ icono, size = 20, className = '', color }: Props) {
  const [failedMain, setFailedMain] = useState(false)
  const [failedAlt,  setFailedAlt]  = useState(false)

  if (!icono) return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>🏷️</span>

  const tipo = tipoIcono(icono)

  if (tipo === 'icons8') {
    const entry = _iconos.find(i => i.nombre === icono)
    const alt   = entry?.alt ?? null

    if (failedAlt || (!alt && failedMain)) {
      return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>🏷️</span>
    }

    if (failedMain && alt) {
      return (
        <img src={_urlFn(alt, 96)} alt={icono}
          width={size} height={size}
          className={`object-contain inline-block ${className}`}
          loading="lazy"
          onError={() => setFailedAlt(true)}
        />
      )
    }

    return (
      <img src={_urlFn(icono, 96)} alt={icono}
        width={size} height={size}
        className={`object-contain inline-block ${className}`}
        loading="lazy"
        onError={() => setFailedMain(true)}
      />
    )
  }

  if (tipo === 'lucide') {
    const Icon = (Icons as Record<string, any>)[icono]
    if (Icon) return <Icon size={size} className={`inline-block ${className}`} color={color} strokeWidth={1.75} />
  }

  // emoji / texto legacy
  return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{icono}</span>
}
