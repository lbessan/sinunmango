import Image from 'next/image'

type Props = {
  imagenUrl?: string | null
  icono?: string | null
  nombre: string
  size?: 'sm' | 'md' | 'lg'
  shape?: 'circle' | 'rounded'
  fallbackBg?: string
}

const sizes = {
  sm: { container: 'w-8 h-8',   text: 'text-base', img: 'w-8 h-8',   px: 32  },
  md: { container: 'w-10 h-10', text: 'text-xl',   img: 'w-10 h-10', px: 40  },
  lg: { container: 'w-16 h-16', text: 'text-3xl',  img: 'w-16 h-16', px: 64  },
}

export function EntidadImagen({
  imagenUrl, icono, nombre,
  size = 'md', shape = 'rounded', fallbackBg = '#f1f5f9',
}: Props) {
  const s     = sizes[size]
  const radio = shape === 'circle' ? 'rounded-full' : 'rounded-lg'

  if (imagenUrl) {
    return (
      <Image
        src={imagenUrl}
        alt={nombre}
        width={s.px}
        height={s.px}
        className={`${s.img} ${radio} object-cover shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${s.container} ${radio} flex items-center justify-center shrink-0 ${s.text}`}
      style={{ background: fallbackBg }}
    >
      {icono ?? nombre.charAt(0).toUpperCase()}
    </div>
  )
}
