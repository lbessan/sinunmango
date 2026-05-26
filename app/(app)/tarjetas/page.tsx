import { getAuthedClient } from '@/lib/supabase/server'
import { getCurrentWorkspace } from '@/lib/workspace'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, CreditCard } from 'lucide-react'
import { DeleteButton } from '@/components/delete-button'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function CardThumbnailServer({ imagenUrl, color, nombre }: {
  imagenUrl?: string | null
  color: string
  nombre: string
}) {
  // En mobile el thumbnail era 128x81 → con nombre + monto + 3 acciones
  // desbordaba en pantallas de 360px. Bajamos a 80x52 mobile / 128x81 sm+.
  return (
    <div
      className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center w-20 h-[52px] sm:w-32 sm:h-[81px]"
      style={{ background: color }}
    >
      {imagenUrl ? (
        <img
          src={imagenUrl}
          alt={nombre}
          className="w-full h-full object-contain"
          style={{ imageRendering: 'auto' }}
        />
      ) : (
        <CreditCard size={22} className="text-white/60" />
      )}
    </div>
  )
}

export default async function TarjetasPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')
  const workspace = await getCurrentWorkspace(user.id)
  const wsId = workspace.ownerUserId
  const isOwn = workspace.isOwn

  const { data: tarjetas } = await supabase
    .from('saldo_actual_cuentas')
    .select('*')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .eq('user_id', wsId)
    .order('nombre_cuenta')

  const { data: extras } = await supabase
    .from('cuentas')
    .select('id, imagen_url, color_primario')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', wsId)

  const extraMap = Object.fromEntries((extras ?? []).map(c => [c.id, c]))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800 min-w-0 truncate">Tarjetas de crédito</h1>
        {isOwn && (
          <Link
            href="/tarjetas/nueva"
            className="inline-flex items-center gap-2 text-sm text-white px-3 sm:px-4 py-2 rounded-lg font-medium shrink-0 whitespace-nowrap"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Nueva tarjeta</span>
            <span className="sm:hidden">Nueva</span>
          </Link>
        )}
      </div>

      {tarjetas && tarjetas.length > 0 ? (
        <div className="space-y-2">
          {tarjetas.map(t => {
            if (!t.id || !t.nombre_cuenta) return null
            const extra    = extraMap[t.id]
            const imgUrl   = extra?.imagen_url
            const color    = extra?.color_primario ?? '#1e293b'
            const cierre   = t.fecha_cierre_tarjeta
              ? new Date(t.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
            const vence    = t.fecha_vencimiento_tarjeta
              ? new Date(t.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null
            const saldo    = t.saldo_actual ?? 0

            return (
              <div
                key={t.id}
                className="bg-white rounded-xl border border-slate-100 flex items-center justify-between hover:border-slate-200 transition-colors overflow-hidden"
              >
                <Link href={`/tarjetas/${t.id}`} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 px-3 sm:px-4 py-3">
                  <CardThumbnailServer imagenUrl={imgUrl} color={color} nombre={t.nombre_cuenta} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{t.nombre_cuenta}</p>
                    {cierre && vence ? (
                      <p className="text-xs text-slate-400">Cierre {cierre} · Vence {vence}</p>
                    ) : (
                      <p className="text-xs text-slate-400">Tarjeta de crédito</p>
                    )}
                  </div>
                </Link>
                {/* Saqué el ChevronRight: el <Link> del thumb/nombre ya
                    navega al detalle (es toda la zona izquierda tocable).
                    Botones edit/delete suben a p-2.5 (~36px touch target). */}
                <div className="flex items-center gap-1 sm:gap-2 shrink-0 pr-2 sm:pr-3 py-2">
                  <div className="text-right mr-1 sm:mr-2">
                    <p className={`text-sm font-semibold tabular-nums ${saldo < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                      ${fmt(saldo)}
                    </p>
                    <p className="text-xs text-slate-400 hidden sm:block">acumulado</p>
                  </div>
                  {isOwn && (
                    <>
                      <Link
                        href={`/tarjetas/${t.id}/editar`}
                        className="inline-flex items-center justify-center p-2.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </Link>
                      <DeleteButton
                        endpoint={`/api/tarjetas/${t.id}`}
                        redirectTo="/tarjetas"
                        label={t.nombre_cuenta}
                        variant="icon"
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-slate-400">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {isOwn ? 'Todavía no tenés tarjetas cargadas.' : 'No hay tarjetas compartidas con vos en este workspace.'}
          </p>
          {isOwn && (
            <Link href="/tarjetas/nueva" className="mt-3 inline-block text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Agregar primera tarjeta →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
