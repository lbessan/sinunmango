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
    .select('id, imagen_url, color_primario, tarjeta_principal_id, nombre_titular')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', wsId)

  type ExtraRow = {
    id: string
    imagen_url: string | null
    color_primario: string | null
    tarjeta_principal_id: string | null
    nombre_titular: string | null
  }
  const extraMap: Record<string, ExtraRow> = Object.fromEntries(
    ((extras ?? []) as unknown as ExtraRow[]).map(c => [c.id, c])
  )

  // Agrupamos por principal: cada principal arriba, sus adicionales debajo
  // (indentadas). Las que están huérfanas (principal_id apunta a algo que
  // no existe o que está inactivo) se renderean como principales.
  type Tarjeta = NonNullable<typeof tarjetas>[number]
  const isPrincipal = (t: Tarjeta) => {
    const principalId = t.id ? extraMap[t.id]?.tarjeta_principal_id : null
    return !principalId
  }
  const adicionalesDe = (principalId: string): Tarjeta[] =>
    (tarjetas ?? []).filter(t => t.id && extraMap[t.id]?.tarjeta_principal_id === principalId)
  const tarjetasPrincipales = (tarjetas ?? []).filter(isPrincipal)
  const tarjetasHuerfanas = (tarjetas ?? []).filter(t => {
    if (!t.id) return false
    const pid = extraMap[t.id]?.tarjeta_principal_id
    if (!pid) return false
    // adicional cuya principal NO está en la lista (filtered out)
    return !tarjetasPrincipales.some(p => p.id === pid)
  })

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
        <div className="space-y-4">
          {/* Por cada principal, su card + las adicionales indentadas. */}
          {tarjetasPrincipales.concat(tarjetasHuerfanas).map(t => {
            if (!t.id || !t.nombre_cuenta) return null
            const hijas = adicionalesDe(t.id)

            return (
              <div key={t.id} className="space-y-1">
                {/* Principal */}
                {renderTarjetaCard(t)}
                {/* Adicionales indentadas */}
                {hijas.length > 0 && (
                  <div className="pl-4 sm:pl-8 space-y-1 border-l-2 border-slate-100 ml-3 sm:ml-6">
                    {hijas.map(h => h.id ? <div key={h.id}>{renderTarjetaCard(h, true)}</div> : null)}
                  </div>
                )}
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

  // Render helper para una tarjeta individual (principal o adicional).
  // Mantenemos la misma estructura visual; solo cambia el contexto en el
  // que está embebida (la adicional viene dentro de un div indentado).
  function renderTarjetaCard(t: NonNullable<typeof tarjetas>[number], esAdicional = false) {
    if (!t.id || !t.nombre_cuenta) return null
    const extra      = extraMap[t.id]
    const imgUrl     = extra?.imagen_url
    const color      = extra?.color_primario ?? '#1e293b'
    const titular    = extra?.nombre_titular ?? null
    const cierre     = t.fecha_cierre_tarjeta
      ? new Date(t.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
    const vence      = t.fecha_vencimiento_tarjeta
      ? new Date(t.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null
    const saldo      = t.saldo_actual ?? 0

    return (
              <div
                className={`bg-white rounded-xl border ${esAdicional ? 'border-slate-100' : 'border-slate-100'} flex items-center justify-between hover:border-slate-200 transition-colors overflow-hidden`}
              >
                <Link href={`/tarjetas/${t.id}`} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 px-3 sm:px-4 py-3">
                  <CardThumbnailServer imagenUrl={imgUrl} color={color} nombre={t.nombre_cuenta} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{t.nombre_cuenta}</p>
                      {esAdicional && (
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide">
                          adicional
                        </span>
                      )}
                    </div>
                    {esAdicional && titular ? (
                      <p className="text-xs text-slate-400 truncate">{titular}</p>
                    ) : cierre && vence ? (
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
  }
}
