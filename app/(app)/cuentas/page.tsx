import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, ChevronRight } from 'lucide-react'
import { DeleteButton } from '@/components/delete-button'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function labelTipo(tipo: string): string {
  switch (tipo) {
    case 'Banco CA':  return 'Caja de Ahorro'
    case 'Banco CC':  return 'Cuenta Corriente'
    case 'Billetera': return 'Billetera virtual'
    case 'Efectivo':  return 'Efectivo'
    default:          return tipo
  }
}

function grupoDe(tipo: string): string {
  if (tipo === 'Banco CA' || tipo === 'Banco CC') return 'Bancos'
  if (tipo === 'Billetera') return 'Billeteras'
  return tipo  // 'Efectivo'
}

// Tarjetas → landscape 72×46 con fondo blanco; Efectivo y Bancos → cuadrado 40×40
function Thumbnail({ imagenUrl, colorPrim, tipo, nombre, moneda }: {
  imagenUrl?: string | null
  colorPrim: string
  tipo: string
  nombre: string
  moneda?: string | null
}) {
  // Tarjeta de crédito — landscape con color real del banco
  if (tipo === 'Tarjeta Credito') {
    return (
      <div
        className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ width: 128, height: 81, background: colorPrim }}
      >
        {imagenUrl
          ? <img src={imagenUrl} alt={nombre} className="w-full h-full object-contain" />
          : <span className="text-2xl">💳</span>
        }
      </div>
    )
  }

  // Efectivo y Banco/Billetera — cuadrado con logo
  // Si Efectivo y no hay imagen personalizada, usar ícono por moneda
  const efectivoFallback = moneda === 'USD' ? '/logo_dollar.png' : '/logo_peso.png'
  const srcImg = imagenUrl ?? (tipo === 'Efectivo' ? efectivoFallback : null)

  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 overflow-hidden"
      style={{ background: '#f1f5f9' }}
    >
      {srcImg
        ? <img src={srcImg} alt={nombre} className="w-10 h-10 object-contain p-1 rounded-lg" />
        : <span>🏦</span>
      }
    </div>
  )
}

export default async function CuentasPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { data: cuentas } = await supabase
    .from('saldo_actual_cuentas')
    .select('*')
    .eq('activa', true)
    .eq('user_id', user.id)
    .order('tipo_cuenta')

  const { data: cuentasExtra } = await supabase
    .from('cuentas')
    .select('id, imagen_url, color_primario')
    .eq('user_id', user.id)

  const extraMap = Object.fromEntries((cuentasExtra ?? []).map(c => [c.id, c]))

  const grupos: Record<string, typeof cuentas> = {
    'Bancos':     [],
    'Billeteras': [],
    'Efectivo':   [],
  }
  for (const c of cuentas ?? []) {
    if (!c.tipo_cuenta || c.tipo_cuenta === 'Tarjeta Credito') continue
    const g = grupoDe(c.tipo_cuenta)
    if (!grupos[g]) grupos[g] = []
    grupos[g]!.push(c)
  }

  const labelGrupo: Record<string, string> = {
    'Bancos':     'Bancos',
    'Billeteras': 'Billeteras virtuales',
    'Efectivo':   'Efectivo',
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Cuentas</h1>
        <Link
          href="/cuentas/nueva"
          className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
        >
          <Plus size={15} />
          Nueva cuenta
        </Link>
      </div>

      {Object.entries(grupos).map(([tipo, lista]) => {
        if (!lista || lista.length === 0) return null
        const isTarjeta  = tipo === 'Tarjeta Credito'
        const isEfectivo = tipo === 'Efectivo'
        const totalARS   = lista.filter(c => c.moneda === 'ARS').reduce((a, c) => a + (c.saldo_actual ?? 0), 0)

        return (
          <div key={tipo}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{labelGrupo[tipo]}</h2>
              <span className="text-sm font-medium text-slate-500">Total: ${fmt(totalARS)}</span>
            </div>

            <div className="space-y-2">
              {lista.map(c => {
                if (!c.id || !c.nombre_cuenta || !c.tipo_cuenta) return null
                const extra     = extraMap[c.id]
                const imgUrl    = extra?.imagen_url
                const colorPrim = extra?.color_primario ?? '#0d3b6e'

                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-xl border border-slate-100 flex items-center justify-between hover:border-slate-200 transition-colors overflow-hidden"
                  >
                    <Link href={`/cuentas/${c.id}`} className="flex items-center gap-4 flex-1 min-w-0 px-4 py-3">
                      <Thumbnail imagenUrl={imgUrl} colorPrim={colorPrim} tipo={tipo} nombre={c.nombre_cuenta} moneda={c.moneda} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{c.nombre_cuenta}</p>
                        <p className="text-xs text-slate-400">{labelTipo(c.tipo_cuenta)} · {c.moneda}</p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-3 shrink-0 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-800">
                        {c.moneda === 'USD' ? 'US$' : '$'}{fmt(c.saldo_actual ?? 0)}
                      </p>
                      <Link href={`/cuentas/${c.id}`} className="text-slate-300 hover:text-slate-500">
                        <ChevronRight size={16} />
                      </Link>
                      <Link href={`/cuentas/${c.id}/editar`} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                        <Pencil size={15} />
                      </Link>
                      <DeleteButton
                        endpoint={`/api/cuentas/${c.id}`}
                        redirectTo="/cuentas"
                        label={c.nombre_cuenta}
                        variant="icon"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
