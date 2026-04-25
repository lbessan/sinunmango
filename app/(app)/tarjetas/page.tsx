import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, ChevronRight, CreditCard } from 'lucide-react'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function CardThumbnailServer({ imagenUrl, color, nombre }: {
  imagenUrl?: string | null
  color: string
  nombre: string
}) {
  return (
    <div
      className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
      style={{ width: 72, height: 46, background: color }}
    >
      {imagenUrl ? (
        <img src={imagenUrl} alt={nombre} className="w-full h-full object-cover" />
      ) : (
        <CreditCard size={20} className="text-white/60" />
      )}
    </div>
  )
}

export default async function TarjetasPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { data: tarjetas } = await adminClient
    .from('saldo_actual_cuentas')
    .select('*')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .eq('user_id', user.id)
    .order('nombre_cuenta')

  const { data: extras } = await adminClient
    .from('cuentas')
    .select('id, imagen_url, color_primario')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)

  const extraMap = Object.fromEntries((extras ?? []).map(c => [c.id, c]))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Tarjetas de crédito</h1>
        <Link
          href="/tarjetas/nueva"
          className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
        >
          <Plus size={15} />
          Nueva tarjeta
        </Link>
      </div>

      {tarjetas && tarjetas.length > 0 ? (
        <div className="space-y-2">
          {tarjetas.map(t => {
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
                <Link href={`/cuentas/${t.id}`} className="flex items-center gap-4 flex-1 min-w-0 px-4 py-3">
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
                <div className="flex items-center gap-3 shrink-0 px-4 py-3">
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${saldo < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                      ${fmt(saldo)}
                    </p>
                    <p className="text-xs text-slate-400">acumulado</p>
                  </div>
                  <Link href={`/cuentas/${t.id}`} className="text-slate-300 hover:text-slate-500">
                    <ChevronRight size={16} />
                  </Link>
                  <Link
                    href={`/tarjetas/${t.id}/editar`}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    <Pencil size={15} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-slate-400">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Todavía no tenés tarjetas cargadas.</p>
          <Link href="/tarjetas/nueva" className="mt-3 inline-block text-sm font-medium" style={{ color: 'var(--accent)' }}>
            Agregar primera tarjeta →
          </Link>
        </div>
      )}
    </div>
  )
}
