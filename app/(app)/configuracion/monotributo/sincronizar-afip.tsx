'use client'

// ─── Sincronizar monotributo con AFIP (clave fiscal) ─────────────────────────
//
// Flujo simple, "de un botón": ponés tu CUIT + clave fiscal y traemos de ARCA
// tu categoría, facturación, tope y cuota — reemplaza la carga manual.
//
// Por debajo usa la automation `monotributo-info` de Afip SDK (fire-and-poll):
// arrancamos la consulta y polleamos el resultado cada 4s.
//
// La clave fiscal va por HTTPS a nuestro server, se usa solo para consultar
// ARCA y se guarda ENCRIPTADA (opcional, para sincronizar sola). Nunca se
// muestra ni se comparte.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2, Check, RefreshCw, Lock, AlertCircle } from 'lucide-react'

type Snapshot = {
  categoria: string | null
  facturado: number | null
  fechaFacturado: string | null
  topeCategoria: number | null
  proximoVencimiento: string | null
  cuotaMensual: number | null
}

type Fase = 'form' | 'sincronizando' | 'ok' | 'error'

const money = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function SincronizarAfip({
  cuitInicial,
  claveGuardada,
  ultimaSync,
  estadoError = false,
  syncError = null,
}: {
  cuitInicial: string
  claveGuardada: boolean
  ultimaSync: string | null
  estadoError?: boolean
  syncError?: string | null
}) {
  const router = useRouter()
  const [cuit, setCuit] = useState(cuitInicial)
  const [clave, setClave] = useState('')
  const [recordar, setRecordar] = useState(true)
  // En estado de error (clave probablemente rotada) forzamos reingresar la clave.
  const [cambiarClave, setCambiarClave] = useState(estadoError)
  const [fase, setFase] = useState<Fase>('form')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [configOk, setConfigOk] = useState(false)
  const [error, setError] = useState('')

  const cuitOk = cuit.replace(/\D/g, '').length === 11
  const usarGuardada = claveGuardada && !cambiarClave

  function finalizar(res: { data: Snapshot; configActualizada: boolean }) {
    setSnap(res.data)
    setConfigOk(res.configActualizada)
    setFase('ok')
    router.refresh()
  }

  async function sincronizar() {
    setError('')
    setFase('sincronizando')
    try {
      const startRes = await fetch('/api/monotributo/afip/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usarGuardada ? { cuit } : { cuit, clave, recordar }),
      })
      const start = await startRes.json()
      if (!startRes.ok) throw new Error(start.error || 'No se pudo iniciar la consulta')
      if (start.status === 'error') { setError(start.error); setFase('error'); return }
      if (start.status === 'complete') return finalizar(start)

      // in_process → pollear
      const jobId: string = start.jobId
      const t0 = Date.now()
      while (Date.now() - t0 < 150_000) {
        await sleep(4000)
        const r = await fetch(`/api/monotributo/afip/sincronizar?jobId=${encodeURIComponent(jobId)}`)
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Error consultando AFIP')
        if (j.status === 'error') { setError(j.error); setFase('error'); return }
        if (j.status === 'complete') return finalizar(j)
      }
      throw new Error('La consulta a AFIP tardó demasiado. Probá de nuevo en un rato.')
    } catch (e) {
      setError((e as Error).message)
      setFase('error')
    }
  }

  // ── Resultado OK ───────────────────────────────────────────────────────────
  if (fase === 'ok' && snap) {
    const pct = snap.facturado != null && snap.topeCategoria
      ? Math.min(100, Math.round((snap.facturado / snap.topeCategoria) * 100))
      : null
    return (
      <div className="max-w-2xl space-y-5">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Check className="text-emerald-600" size={20} />
          </div>
          <div>
            <p className="font-semibold text-slate-800">¡Listo! Traído de ARCA</p>
            <p className="text-sm text-slate-500">
              {configOk
                ? 'Tu configuración de monotributo se actualizó sola con estos valores.'
                : 'Guardamos los datos de ARCA. Revisá tu configuración de monotributo abajo.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Dato label="Categoría" valor={snap.categoria ? `Categoría ${snap.categoria}` : '—'} destacado />
          <Dato label="Cuota mensual" valor={money(snap.cuotaMensual)} />
          <Dato label="Facturado (ARCA)" valor={money(snap.facturado)} sub={snap.fechaFacturado ? `al ${snap.fechaFacturado}` : undefined} />
          <Dato label="Tope de la categoría" valor={money(snap.topeCategoria)} />
          {snap.proximoVencimiento && <Dato label="Próximo vencimiento" valor={snap.proximoVencimiento} />}
        </div>

        {pct != null && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Uso del tope anual</span><span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#dc2626' : pct >= 75 ? '#f59e0b' : 'var(--accent)' }} />
            </div>
          </div>
        )}

        <button
          onClick={() => { setFase('form'); setCambiarClave(false); setClave('') }}
          className="text-sm inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
        >
          <RefreshCw size={14} /> Volver a sincronizar
        </button>
      </div>
    )
  }

  // ── Sincronizando ──────────────────────────────────────────────────────────
  if (fase === 'sincronizando') {
    return (
      <div className="max-w-2xl bg-slate-50 border border-slate-100 rounded-xl p-8 text-center">
        <Loader2 className="animate-spin mx-auto text-slate-400 mb-3" size={28} />
        <p className="font-medium text-slate-700">Consultando ARCA…</p>
        <p className="text-sm text-slate-500 mt-1">Nos estamos logueando en AFIP con tu clave. Puede tardar hasta un minuto — no cierres la página.</p>
      </div>
    )
  }

  // ── Form (y error) ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl space-y-5">
      {estadoError && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Pausamos la sincronización automática</p>
            <p className="text-amber-800/90 mt-0.5">
              Tu clave fiscal dejó de funcionar — casi siempre es porque AFIP te obligó a cambiarla.
              Reingresá tu clave nueva para reconectar.{syncError ? ` (${syncError})` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
        <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={20} />
        <p className="text-sm text-slate-600">
          Traemos tu <b>categoría, facturación, tope y cuota</b> directo de ARCA. Tu clave fiscal se usa solo
          para esta consulta y se guarda <b>encriptada</b> — nunca la mostramos ni la compartimos.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Tu CUIT</label>
        <input
          value={cuit} onChange={e => setCuit(e.target.value)} inputMode="numeric" placeholder="20-12345678-9"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{ ['--tw-ring-color' as string]: 'var(--accent)' }}
        />
      </div>

      {usarGuardada ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm text-slate-600">
            <Lock size={14} className="text-slate-400" /> Usamos tu clave fiscal guardada
          </span>
          <button onClick={() => setCambiarClave(true)} className="text-xs text-[color:var(--accent)] hover:underline">Cambiar</button>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Clave fiscal</label>
            <input
              type="password" value={clave} onChange={e => setClave(e.target.value)} placeholder="Tu clave fiscal de AFIP"
              autoComplete="off"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: 'var(--accent)' }}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} className="mt-0.5" />
            <span>Guardar mi clave (encriptada) para sincronizar sola cada tanto. Si la destildás, te la vamos a pedir cada vez.</span>
          </label>
        </>
      )}

      <button
        onClick={sincronizar}
        disabled={!cuitOk || (!usarGuardada && !clave.trim())}
        className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2"
        style={{ background: 'var(--accent)' }}
      >
        <RefreshCw size={15} /> {ultimaSync ? 'Sincronizar de nuevo' : 'Sincronizar con AFIP'}
      </button>

      {ultimaSync && (
        <p className="text-xs text-slate-400">Última sincronización: {new Date(ultimaSync).toLocaleString('es-AR')}</p>
      )}
    </div>
  )
}

function Dato({ label, valor, sub, destacado }: { label: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-semibold ${destacado ? 'text-emerald-700 text-lg' : 'text-slate-800'}`}>{valor}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
