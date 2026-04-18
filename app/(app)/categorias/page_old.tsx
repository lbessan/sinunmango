import { adminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Pencil, Plus } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

export default async function CategoriasPage() {
  const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
    adminClient.from('categorias').select('*').order('tipo_default').order('nombre_categoria'),
    adminClient.from('subcategorias').select('*').order('nombre_subcategoria'),
  ])

  const grupos = (categorias ?? []).reduce<Record<string, typeof categorias>>((acc, cat) => {
    const tipo = cat.tipo_default ?? 'Otros'
    if (!acc[tipo]) acc[tipo] = []
    acc[tipo]!.push(cat)
    return acc
  }, {})

  const colorGrupo: Record<string, { badge: string; dot: string }> = {
    Gasto:         { badge: 'text-red-500 bg-red-50',       dot: 'bg-red-400' },
    Ingreso:       { badge: 'text-emerald-600 bg-emerald-50', dot: 'bg-emerald-400' },
    Transferencia: { badge: 'text-blue-500 bg-blue-50',     dot: 'bg-blue-400' },
    Otros:         { badge: 'text-slate-500 bg-slate-100',  dot: 'bg-slate-400' },
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Categorías</h1>
        <Link href="/categorias/nueva"
          className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium"
          style={{ background: 'linear-gradient(90deg, #1B3A6B, #1a6b5a)' }}>
          <Plus size={15} />Nueva categoría
        </Link>
      </div>

      {Object.entries(grupos).map(([tipo, cats]) => {
        const colors = colorGrupo[tipo] ?? colorGrupo.Otros
        return (
          <div key={tipo} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {/* Header del grupo */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.badge}`}>
                {tipo}
              </span>
              <span className="text-xs text-slate-400">{cats?.length} categorías</span>
            </div>

            {/* Lista de categorías */}
            {cats?.map(cat => {
              const subs = (subcategorias ?? []).filter(s => s.categoria_padre === cat.id)
              return (
                <div key={cat.id} className="border-b border-slate-50 last:border-0">
                  {/* Fila de categoría */}
                  <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 flex items-center justify-center shrink-0">
                        <IconoCategoria icono={cat.icono} size={30} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{cat.nombre_categoria}</p>
                        {subs.length > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {subs.length} subcategoría{subs.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Link href={`/categorias/${cat.id}/nueva-subcat`}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                        <Plus size={11} />Subcat
                      </Link>
                      <Link href={`/categorias/${cat.id}/editar`}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                        <Pencil size={14} />
                      </Link>
                    </div>
                  </div>

                  {/* Subcategorías expandidas */}
                  {subs.length > 0 && (
                    <div className="px-5 pb-3 space-y-1">
                      {subs.map(sub => (
                        <div key={sub.id}
                          className="flex items-center justify-between pl-12 pr-2 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors group">
                          <div className="flex items-center gap-2.5">
                            {/* Ícono de subcategoría (si tiene) o fallback */}
                            <div className="w-6 h-6 flex items-center justify-center shrink-0">
                              <IconoCategoria icono={(sub as any).icono ?? null} size={18} />
                            </div>
                            <span className="text-xs font-medium text-slate-600">
                              {sub.nombre_subcategoria}
                            </span>
                          </div>
                          <Link href={`/categorias/${cat.id}/subcategorias/${sub.id}/editar`}
                            className="p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-200 transition-colors opacity-0 group-hover:opacity-100">
                            <Pencil size={11} />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
