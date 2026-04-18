import { adminClient } from '@/lib/supabase/admin'
import { ImportarEmailClient } from '@/components/importar-email-client'
import { Mail } from 'lucide-react'

export default async function ImportarEmailPage() {
  const [{ data: cuentas }, { data: categorias }] =
    await Promise.all([
      adminClient
        .from('cuentas')
        .select('id, nombre_cuenta, tipo_cuenta, moneda, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta')
        .eq('activa', true)
        .order('nombre_cuenta'),
      adminClient.from('categorias').select('id, nombre_categoria, icono, tipo_default').order('nombre_categoria'),
    ])

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
          <Mail size={16} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Importar desde email</h1>
          <p className="text-xs text-slate-400">Pegá el texto del mail de tu tarjeta y cargamos el movimiento automáticamente</p>
        </div>
      </div>

      <ImportarEmailClient
        cuentas={cuentas ?? []}
        categorias={categorias ?? []}
      />
    </div>
  )
}
