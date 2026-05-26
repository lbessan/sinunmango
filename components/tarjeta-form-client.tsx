'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BankSelector, CardNetworkSelector, CardVariantSelector, CardThumbnail } from './bank-selector'
import { cardImageUrl, getNetworkVariants, type BankEntry, type CardNetwork, type CardVariant } from '@/constants/banks'
import { DeleteButton } from '@/components/delete-button'

type TarjetaForm = {
  id?: string
  nombre: string
  banco_id: string
  banco_nombre: string
  banco_color: string
  network_id: string
  variant_id: string
  imagen_url: string
  color_primario: string
  fecha_cierre: string
  fecha_vencimiento: string
  terminacion: string
  activa: boolean
  /** True si la tarjeta tiene resumen_password_cipher guardado en DB.
   *  Nunca exponemos el plaintext al cliente — solo este bool.
   *  El client setea/cambia/borra la password via PATCH. */
  has_resumen_password?: boolean
  /** Si es adicional, apunta a la principal. String vacío si es principal. */
  tarjeta_principal_id?: string
  /** Lo que figura en el PDF del resumen (ej: "Celeste Cerono"). Usado
   *  para dispatch automático de consumos al procesar el resumen. */
  nombre_titular?: string
}

// Candidata a "tarjeta principal" para el dropdown — solo principales
// (no adicionales) activas del user, excluyendo la editada.
type CandidataPrincipal = { id: string; nombre_cuenta: string }

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export function TarjetaFormClient({
  inicial,
  candidatasPrincipal = [],
}: {
  inicial: TarjetaForm
  candidatasPrincipal?: CandidataPrincipal[]
}) {
  const router = useRouter()
  const [form, setForm]       = useState<TarjetaForm>(inicial)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  // ¿Es adicional? Se controla con un toggle. Cuando se prende, mostramos
  // el dropdown de principales y ocultamos los campos heredados (fechas
  // de cierre/vencimiento + password del resumen — heredan).
  const [esAdicional, setEsAdicional] = useState(!!inicial.tarjeta_principal_id)

  // Password del resumen (PDF protegido). `has_resumen_password` viene del
  // server e indica si ya hay una guardada. Nunca recibimos el plaintext.
  // El user puede:
  //   - Ingresar una nueva (plaintext en `resumenPassword`) → reemplaza la guardada
  //   - Marcar `resumenPasswordClear` para borrar la guardada
  //   - No tocar nada → no se manda en el PATCH (preserva estado actual)
  // `editingPassword` controla qué branch se muestra cuando ya hay una
  // guardada: el chip "•••" con botones, o el input para escribir nueva.
  const [resumenPassword,      setResumenPassword]      = useState('')
  const [resumenPasswordClear, setResumenPasswordClear] = useState(false)
  const [showResumenPassword,  setShowResumenPassword]  = useState(false)
  const [editingPassword,      setEditingPassword]      = useState(false)

  const [selectedBank,    setSelectedBank]    = useState<BankEntry | null>(null)
  const [selectedNetwork, setSelectedNetwork] = useState<CardNetwork | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<CardVariant | null>(null)

  const set = (k: keyof TarjetaForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleBankChange = (bank: BankEntry) => {
    setSelectedBank(bank.id ? bank : null)
    setSelectedVariant(null)
    if (!bank.id) return
    // Auto-nombre solo si estaba vacío
    if (!form.nombre && selectedNetwork) {
      set('nombre', `${selectedNetwork.nombre} ${bank.nombre}`)
    }
    set('banco_id',     bank.id)
    set('banco_nombre', bank.nombre)
    set('banco_color',  bank.color)
    // El color del banco se aplica al banner por defecto (como en CuentaFormClient)
    // Si hay variante seleccionada, la variante tiene prioridad
    if (selectedNetwork && selectedVariant) {
      set('imagen_url',     cardImageUrl(selectedNetwork.id, selectedVariant.id, bank.id))
      set('color_primario', selectedVariant.color)
    } else if (selectedNetwork) {
      set('imagen_url',     cardImageUrl(selectedNetwork.id, 'standard', bank.id))
      set('color_primario', bank.color)
    } else {
      // Sin red seleccionada: usar color del banco directamente
      set('color_primario', bank.color)
    }
  }

  const handleNetworkChange = (net: CardNetwork) => {
    setSelectedNetwork(net)
    setSelectedVariant(null)
    set('network_id', net.id)
    // Variante default para esta red
    const variants = getNetworkVariants(net.id)
    const defaultVariant = variants[0]
    if (defaultVariant) {
      setSelectedVariant(defaultVariant)
      set('variant_id', defaultVariant.id)
      set('color_primario', defaultVariant.color)
    }
    // Auto-nombre
    if (selectedBank && !form.nombre) {
      set('nombre', `${net.nombre} ${selectedBank.nombre}`)
    }
    set('imagen_url', cardImageUrl(net.id, defaultVariant?.id ?? 'standard', selectedBank?.id))
  }

  const handleVariantChange = (variant: CardVariant) => {
    setSelectedVariant(variant)
    set('variant_id',    variant.id)
    set('color_primario', variant.color)
    if (selectedNetwork) {
      set('imagen_url', cardImageUrl(selectedNetwork.id, variant.id, selectedBank?.id))
    }
  }

  const isEditing = !!form.id

  const handleGuardar = async () => {
    if (!form.nombre) { setError('Ingresá un nombre para la tarjeta'); return }
    setSaving(true); setError('')

    // Validación: si marcó "es adicional" tiene que haber elegido principal.
    if (esAdicional && !form.tarjeta_principal_id) {
      setError('Seleccioná la tarjeta principal'); setSaving(false); return
    }

    // Guardamos en la tabla `cuentas` con tipo_cuenta = 'Tarjeta Credito'
    const body: Record<string, unknown> = {
      nombre_cuenta:             form.nombre,
      institucion:               form.banco_nombre || null,
      tipo_cuenta:               'Tarjeta Credito',
      moneda:                    'ARS',
      saldo_inicial:             0,
      activa:                    form.activa,
      imagen_url:                form.imagen_url || null,
      imagen_banner_url:         null,
      color_primario:            form.color_primario || '#1e293b',
      terminacion_tarjeta:       form.terminacion || null,
      // Si es adicional, NO mandamos fechas — el server las hereda de la
      // principal. Si después dejá de ser adicional, sí mandamos lo que
      // tenga el form.
      ...(esAdicional ? {
        tarjeta_principal_id:      form.tarjeta_principal_id,
        nombre_titular:            form.nombre_titular || null,
      } : {
        tarjeta_principal_id:      null,
        nombre_titular:            form.nombre_titular || null,
        fecha_cierre_tarjeta:      form.fecha_cierre || null,
        fecha_vencimiento_tarjeta: form.fecha_vencimiento || null,
      }),
    }
    // Password del resumen: solo incluir si hay cambio.
    //   - resumenPasswordClear true → mandamos null (= borrar)
    //   - resumenPassword no vacío → mandamos plaintext (server encripta)
    //   - Ninguno → no mandamos el campo (preserva valor en DB)
    if (resumenPasswordClear) {
      body.resumen_password = null
    } else if (resumenPassword) {
      body.resumen_password = resumenPassword
    }

    const res = await fetch(
      isEditing ? `/api/tarjetas/${form.id}` : '/api/tarjetas',
      { method: isEditing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )

    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/tarjetas'), 1000) }
    else { const d = await res.json(); setError(d.error ?? 'Error al guardar') }
  }

  const networkId = selectedNetwork?.id ?? form.network_id
  const variantId = selectedVariant?.id ?? form.variant_id ?? 'standard'
  const bankColor = selectedBank?.color ?? form.banco_color

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">
        {isEditing ? 'Editar tarjeta' : 'Nueva tarjeta'}
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        {/* ── Banco emisor ── */}
        <BankSelector
          value={selectedBank?.id ?? form.banco_id ?? ''}
          onChange={handleBankChange}
          label="Banco emisor"
        />

        {/* ── Red ── */}
        <CardNetworkSelector
          value={selectedNetwork?.id ?? form.network_id ?? ''}
          onChange={handleNetworkChange}
        />

        {/* ── Variante (requiere red) ── */}
        {networkId && (
          <CardVariantSelector
            networkId={networkId}
            bankId={selectedBank?.id ?? form.banco_id}
            bankColor={bankColor}
            value={variantId}
            onChange={handleVariantChange}
          />
        )}

        {/* ── Preview de la tarjeta ── */}
        {networkId && (
          <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <CardThumbnail
              networkId={networkId}
              variantId={variantId}
              bankId={selectedBank?.id ?? form.banco_id}
              bankColor={bankColor}
              width={80}
              height={51}
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">{form.nombre || 'Sin nombre'}</p>
              <p className="text-xs text-slate-400">
                {selectedNetwork?.nombre ?? networkId}
                {form.terminacion ? ` ···· ${form.terminacion}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* ── Nombre ── */}
        <div>
          <label className={labelClass}>Nombre de la tarjeta *</label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => set('nombre', e.target.value)}
            placeholder={selectedBank && selectedNetwork ? `${selectedNetwork.nombre} ${selectedBank.nombre}` : 'Ej: Visa Galicia'}
            className={inputClass}
          />
        </div>

        {/* ── Color de fondo del banner ── */}
        <div>
          <label className={labelClass}>Color de fondo del banner</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color_primario}
              onChange={e => set('color_primario', e.target.value)}
              className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={form.color_primario}
              onChange={e => set('color_primario', e.target.value)}
              placeholder="#1e293b"
              className={`flex-1 ${inputClass} font-mono text-sm`}
            />
            <div className="w-10 h-10 rounded-lg shrink-0 border border-slate-200" style={{ background: form.color_primario }} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Se aplica al fondo del encabezado de la tarjeta. Se actualiza automáticamente al elegir la variante.
          </p>
        </div>

        {/* ── ¿Es tarjeta adicional? ──
            Si está prendido: dropdown con tarjetas principales del user.
            Una adicional hereda fechas (cierre/venc) y password del resumen
            de la principal, así que ocultamos esos campos.
            Si el user no tiene tarjetas principales (lista vacía) y no es
            edit de una adicional existente, ocultamos todo el toggle. */}
        {(candidatasPrincipal.length > 0 || esAdicional) && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={esAdicional}
                onChange={e => {
                  setEsAdicional(e.target.checked)
                  if (!e.target.checked) set('tarjeta_principal_id', '')
                }}
                className="w-4 h-4 mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Esta es una tarjeta adicional
                </p>
                <p className="text-xs text-slate-500">
                  Pertenece a otro titular pero comparte el resumen. Hereda fechas + contraseña del PDF de la principal.
                </p>
              </div>
            </label>

            {esAdicional && (
              <>
                <div>
                  <label className={labelClass}>Tarjeta principal *</label>
                  <select
                    value={form.tarjeta_principal_id ?? ''}
                    onChange={e => set('tarjeta_principal_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">— seleccionar —</option>
                    {candidatasPrincipal.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre_cuenta}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Nombre del titular ──
            Lo que figura en el PDF del resumen (ej: "Celeste Cerono").
            Para tarjeta principal es opcional. Para adicional es muy
            recomendado: es la pieza que usamos al procesar el resumen
            para mandar los consumos a la cuenta correcta. */}
        <div>
          <label className={labelClass}>
            Nombre del titular {esAdicional && <span className="text-amber-600 font-normal">(recomendado para distinguir consumos en el resumen)</span>}
          </label>
          <input
            type="text"
            value={form.nombre_titular ?? ''}
            onChange={e => set('nombre_titular', e.target.value)}
            placeholder={esAdicional ? 'Tal cual aparece en el PDF (ej: Celeste Cerono)' : 'Tu nombre completo (opcional)'}
            className={inputClass}
            maxLength={100}
          />
        </div>

        {/* ── Datos de la tarjeta ──
            Las fechas se ocultan si es adicional (hereda de la principal).
            La terminación SÍ se muestra (cada tarjeta física tiene la suya). */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Datos de la tarjeta</p>
          {/* Fechas: solo se editan en la principal. La adicional las hereda. */}
          {esAdicional ? (
            <p className="text-xs text-blue-700/80 italic">
              Las fechas de cierre y vencimiento se heredan automáticamente de la tarjeta principal.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1.5">Fecha de cierre</label>
                <input
                  type="date"
                  value={form.fecha_cierre}
                  onChange={e => set('fecha_cierre', e.target.value)}
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-lg text-sm outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1.5">Fecha de vencimiento</label>
                <input
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={e => set('fecha_vencimiento', e.target.value)}
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-lg text-sm outline-none bg-white"
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-blue-700 mb-1.5">
              Últimos 4 dígitos
              <span className="ml-1.5 font-normal text-blue-500">— para importación desde email</span>
            </label>
            <div className="relative max-w-[140px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-300 text-sm font-mono pointer-events-none">····</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={form.terminacion}
                onChange={e => set('terminacion', e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="w-full pl-10 pr-3 py-2.5 border border-blue-200 rounded-lg text-sm font-mono outline-none bg-white focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>
        </div>

        {/* ── Password del resumen (opcional, solo principal) ──
            Algunos bancos mandan el PDF del resumen protegido con
            password (típicamente DNI). Si la guardás acá, al subir el
            PDF en /conciliaciones se descifra solo. Se guarda
            encriptada at-rest. La adicional la hereda. */}
        {!esAdicional && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Contraseña del PDF
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Si tu banco manda el resumen protegido (típicamente tu DNI), guardala acá para que el descifrado sea automático.
            </p>
          </div>

          {form.has_resumen_password && !editingPassword && !resumenPasswordClear ? (
            // Estado: ya hay una guardada, el user no la está cambiando.
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-400 font-mono">
                ••••••••
              </div>
              <button
                type="button"
                onClick={() => setEditingPassword(true)}
                className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={() => setResumenPasswordClear(true)}
                className="text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                Borrar
              </button>
            </div>
          ) : resumenPasswordClear ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                Se borrará al guardar.
              </p>
              <button
                type="button"
                onClick={() => setResumenPasswordClear(false)}
                className="text-xs underline text-amber-900"
              >
                Cancelar
              </button>
            </div>
          ) : (
            // Input para ingresar nueva (o cambiar la existente).
            <div className="flex items-center gap-2">
              <input
                type={showResumenPassword ? 'text' : 'password'}
                value={resumenPassword}
                onChange={e => setResumenPassword(e.target.value)}
                placeholder="Tu DNI (ej: 30123456)"
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowResumenPassword(s => !s)}
                className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white"
              >
                {showResumenPassword ? 'Ocultar' : 'Mostrar'}
              </button>
              {form.has_resumen_password && (
                <button
                  type="button"
                  onClick={() => { setResumenPassword(''); setEditingPassword(false) }}
                  className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-white"
                  title="Volver al estado guardado"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="activa-tarjeta"
            checked={form.activa}
            onChange={e => set('activa', e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="activa-tarjeta" className="text-sm text-slate-600 cursor-pointer">Tarjeta activa</label>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving || saved}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Agregar tarjeta'}
          </button>
        </div>

        {isEditing && form.id && (
          <div className="pt-2 flex justify-end">
            <DeleteButton
              endpoint={`/api/tarjetas/${form.id}`}
              redirectTo="/tarjetas"
              label={form.nombre}
              variant="button"
            />
          </div>
        )}
      </div>
    </div>
  )
}
