'use client'

// Página /movimientos/[id]/editar — es solo el contenedor: el formulario en sí
// vive en components/movimiento-form.tsx y es EL MISMO que usa el modal de
// conciliaciones, para que editar un movimiento ofrezca lo mismo desde donde
// sea que lo abras.

import { useRouter } from 'next/navigation'
import {
  MovimientoForm,
  type MovimientoEditable,
  type CuentaOpcion,
  type CategoriaOpcion,
  type SubcategoriaOpcion,
} from '@/components/movimiento-form'

export function EditarMovimientoClient({
  movimiento,
  cuentas,
  categorias,
  subcategorias,
}: {
  movimiento:    MovimientoEditable
  cuentas:       CuentaOpcion[]
  categorias:    CategoriaOpcion[]
  subcategorias: SubcategoriaOpcion[]
}) {
  const router = useRouter()

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-800">Editar movimiento</h1>
        {(movimiento.cuotas_total ?? 0) > 1 && (
          <span className="text-xs bg-amber-50 text-amber-600 px-3 py-1 rounded-full font-medium">
            Cuota {movimiento.cuota_actual}/{movimiento.cuotas_total}
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
        <MovimientoForm
          movimiento={movimiento}
          cuentas={cuentas}
          categorias={categorias}
          subcategorias={subcategorias}
          onSaved={() => {
            // Pequeña pausa para que se vea el "✓ Guardado" antes de volver.
            setTimeout(() => { router.refresh(); router.back() }, 900)
          }}
          onCancel={() => router.back()}
          onDeleted={() => {
            // replace() en vez de back(): el movimiento que este form mostraba ya
            // no existe. Con back() + refresh() Next intenta revalidar la ruta de
            // editar con un id borrado y queda un render mezclado.
            router.replace('/movimientos')
          }}
        />
      </div>
    </div>
  )
}
