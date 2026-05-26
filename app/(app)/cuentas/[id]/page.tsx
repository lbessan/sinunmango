import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { todayAR } from '@/lib/timezone'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Pencil, ArrowLeft } from 'lucide-react'
import { CuentaSaldoReactivo } from '@/components/cuenta-saldo-reactivo'
import { CuentaMovimientosTable } from '@/components/cuenta-movimientos-table'
import { DeleteButton } from '@/components/delete-button'
import { getCurrentWorkspace } from '@/lib/workspace'

type SaldoProps = ComponentProps<typeof CuentaSaldoReactivo>
type TableProps = ComponentProps<typeof CuentaMovimientosTable>

function formatPeriodo(p: string | null): string {
  if (!p) return 'Sin periodo'
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

function esColorOscuro(hex: string): boolean {
  const h = (hex ?? '#0d3b6e').replace('#', '').padEnd(6, '0')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

export default async function CuentaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')
  const workspace = await getCurrentWorkspace(user.id)
  const wsId = workspace.ownerUserId
  const isOwn = workspace.isOwn

  const { id } = await params
  const today   = todayAR()

  const [{ data: cuenta }, { data: extra }, { data: movPasados }, { data: movFuturos }, { data: categorias }, { data: subcategorias }, { data: otrasCuentas }] =
    await Promise.all([
      supabase.from('saldo_actual_cuentas').select('*').eq('id', id).eq('user_id', wsId).single(),
      supabase.from('cuentas').select('imagen_url, imagen_banner_url, color_primario').eq('id', id).eq('user_id', wsId).single(),
      // Movs scoped por cuenta (no por user_id). RLS filtra: own movs OR
      // movs en cuentas a las que tengo acceso. Sacar el filtro user_id
      // permite que el invitee vea TAMBIÉN sus propios movs cargados en
      // esta cuenta compartida (sino se "perdían" porque su user_id =
      // invitee y wsId = owner).
      supabase.from('movimientos_completos').select('*')
        .or(`cuenta_origen.eq.${id},cuenta_destino.eq.${id}`)
        .lte('fecha', today).order('fecha', { ascending: false }).limit(200),
      supabase.from('movimientos_completos').select('*')
        .or(`cuenta_origen.eq.${id},cuenta_destino.eq.${id}`)
        .gt('fecha', today)
        .order('periodo_tarjeta', { ascending: true }).order('fecha', { ascending: true }),
      supabase.from('categorias').select('id, nombre_categoria, icono, tipo_default').eq('user_id', wsId).order('nombre_categoria'),
      supabase.from('subcategorias').select('id, categoria_padre, nombre_subcategoria').eq('user_id', wsId),
      supabase.from('cuentas').select('id, nombre_cuenta').eq('activa', true).eq('user_id', wsId).neq('id', id).order('nombre_cuenta'),
    ])

  if (!cuenta) notFound()

  const isTarjeta  = cuenta.tipo_cuenta === 'Tarjeta Credito'
  const isEfectivo = cuenta.tipo_cuenta === 'Efectivo'
  const cierre     = cuenta.fecha_cierre_tarjeta ? new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
  const vence      = cuenta.fecha_vencimiento_tarjeta ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null
  const imagenUrl  = extra?.imagen_url
  const bannerUrl  = extra?.imagen_banner_url
  const colorPrim  = extra?.color_primario ?? '#0d3b6e'
  const textoClaro = esColorOscuro(colorPrim)
  const textColor  = textoClaro ? 'white' : '#1e293b'
  const fallbackEmoji = isEfectivo ? '💵' : isTarjeta ? '💳' : '🏦'

  type MovItem = NonNullable<typeof movFuturos>[number]
  const futurosPorPeriodo = (movFuturos ?? []).reduce<Record<string, MovItem[]>>((acc, mov) => {
    const key = mov.periodo_tarjeta ?? 'sin-periodo'
    if (!acc[key]) acc[key] = []
    acc[key].push(mov)
    return acc
  }, {})
  const periodosOrdenados = Object.keys(futurosPorPeriodo).sort()

  const backHref = isTarjeta ? '/tarjetas' : '/cuentas'
  const deleteEndpoint = isTarjeta ? `/api/tarjetas/${id}` : `/api/cuentas/${id}`

  const navBar = (
    <div className="flex items-center justify-between px-5 py-4">
      <Link href={backHref} className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg"
        style={{ background: 'rgba(255,255,255,0.18)', color: textColor }}>
        <ArrowLeft size={14} />{isTarjeta ? 'Tarjetas' : 'Cuentas'}
      </Link>
      {isOwn && (
        <div className="flex items-center gap-2">
          <DeleteButton
            endpoint={deleteEndpoint}
            redirectTo={backHref}
            label={cuenta.nombre_cuenta ?? ''}
            variant="icon"
          />
          <Link href={isTarjeta ? `/tarjetas/${id}/editar` : `/cuentas/${id}/editar`}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.18)', color: textColor }}>
            <Pencil size={13} />Editar
          </Link>
        </div>
      )}
    </div>
  )

  // Props compartidas para CuentaSaldoReactivo
  const saldoProps: SaldoProps = {
    movimientos:   (movPasados ?? []) as SaldoProps['movimientos'],
    cuentaId:      id,
    categorias:    (categorias ?? []) as SaldoProps['categorias'],
    subcategorias: (subcategorias ?? []) as SaldoProps['subcategorias'],
    cuentas:       (otrasCuentas ?? []) as SaldoProps['cuentas'],
    saldoInicial:  cuenta.saldo_actual ?? 0,
    moneda:        cuenta.moneda ?? 'ARS',
    isTarjeta,
    colorPrim,
    textoClaro,
    cierre,
    vence,
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Banner tarjeta: fondo de color de la tarjeta, imagen sin recorte */}
      {isTarjeta ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: colorPrim }}>
          {navBar}
          <div className="flex items-center justify-center px-8 pb-6">
            {imagenUrl
              ? <img
                  src={imagenUrl}
                  alt={cuenta.nombre_cuenta ?? ''}
                  className="w-full max-w-sm rounded-xl shadow-2xl"
                  style={{ aspectRatio: '1.586/1', objectFit: 'cover' }}
                />
              : <div className="w-full max-w-sm rounded-xl flex items-center justify-center" style={{ aspectRatio: '1.586/1', background: 'rgba(255,255,255,0.1)' }}>
                  <span className="text-7xl">{fallbackEmoji}</span>
                </div>
            }
          </div>
          <CuentaSaldoReactivo {...saldoProps} />
        </div>
      ) : (
        /* Banner con logo: banco/billetera/efectivo */
        <div className="rounded-2xl overflow-hidden" style={{ background: colorPrim }}>
          {navBar}
          <div className="flex items-center justify-center px-8 py-6">
            {bannerUrl
              ? <img src={bannerUrl} alt={cuenta.nombre_cuenta ?? ''} className="max-h-16 max-w-xs object-contain" style={{ filter: textoClaro ? 'brightness(0) invert(1)' : 'none' }} />
              : (() => {
                  const efectivoSrc = isEfectivo
                    ? (cuenta.moneda === 'USD' ? '/logo_dollar.png' : '/logo_peso.png')
                    : null
                  const src = imagenUrl ?? efectivoSrc
                  return src
                    ? <img src={src} alt={cuenta.nombre_cuenta ?? ''} className="h-16 w-16 object-contain" />
                    : <p className="text-2xl font-bold" style={{ color: textColor }}>{cuenta.nombre_cuenta}</p>
                })()
            }
          </div>
          <CuentaSaldoReactivo {...saldoProps} />
        </div>
      )}

      {/* Futuros agrupados por periodo */}
      {periodosOrdenados.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-600">Movimientos futuros</h2>
            <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">
              {(movFuturos ?? []).length} registros
            </span>
          </div>
          {periodosOrdenados.map(periodoKey => {
            const movs  = futurosPorPeriodo[periodoKey]
            const label = formatPeriodo(periodoKey === 'sin-periodo' ? null : periodoKey)
            const total = movs.reduce((acc, m) => {
              const esDestino = m.cuenta_destino === id
              const monto = m.monto_estimado ?? m.monto ?? 0
              return acc + ((m.tipo_movimiento === 'Ingreso' || (m.tipo_movimiento === 'Transferencia' && esDestino)) ? monto : -monto)
            }, 0)
            return (
              <div key={periodoKey} className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-blue-50 bg-blue-50 flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">{label}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-blue-400">{movs.length} movimiento{movs.length !== 1 ? 's' : ''}</span>
                    <span className={`text-xs font-semibold ${total >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {total >= 0 ? '+' : ''}${Math.abs(total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <CuentaMovimientosTable
                    movimientos={movs as TableProps['movimientos']}
                    cuentaId={id}
                    categorias={(categorias ?? []) as TableProps['categorias']}
                    subcategorias={(subcategorias ?? []) as TableProps['subcategorias']}
                    futuro
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
