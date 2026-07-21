import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ConectorAfip } from '../conectar-afip'

export default function ConectarAfipPage() {
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <Link href="/configuracion/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={15} /> Volver a Monotributo
      </Link>
      <h1 className="text-xl font-bold text-slate-800">Conectar con AFIP</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Automatizá la lectura de tu monotributo con tu certificado digital — sin darnos tu clave fiscal.
      </p>
      <ConectorAfip />
    </div>
  )
}
