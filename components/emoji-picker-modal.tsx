'use client'

// ─── EmojiPickerModal — selector de emojis para categorías ───────────────────
//
// Reemplaza al IconPickerModal (que usaba iconos Lucide en indigo hardcoded).
// Usamos emojis porque el seed inicial del trigger SQL guarda emojis
// (`docs/migration-seed-categorias-en-trigger.sql`) — así el sistema queda
// unificado: lo que ves al onboarding, en la lista de categorías y en el
// editor es siempre el mismo emoji.
//
// La lista está agrupada para facilitar la búsqueda visual. El buscador filtra
// por keywords asociados a cada emoji (sin tildes, lowercase).

import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'

// Normaliza: lowercase + sin tildes
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

type EmojiEntry = {
  emoji: string
  keywords: string[]   // términos de búsqueda (sin tildes)
  grupo: string
}

// Catálogo de emojis curado para finanzas personales AR.
// Mantenemos un set acotado (~120) en lugar del Unicode completo (~3000)
// para que sea relevante y rápido de scrolear.
const EMOJIS: EmojiEntry[] = [
  // ── Comida y delivery ────────────────────────────────────────────────────
  { emoji: '🛒', keywords: ['supermercado', 'super', 'almacen', 'compras', 'mercado'], grupo: 'Comida' },
  { emoji: '🍔', keywords: ['hamburguesa', 'fast food', 'comida rapida', 'mcdonald'], grupo: 'Comida' },
  { emoji: '🍕', keywords: ['pizza', 'pizzeria', 'italiana'], grupo: 'Comida' },
  { emoji: '🍣', keywords: ['sushi', 'japonesa', 'asiatica'], grupo: 'Comida' },
  { emoji: '🥘', keywords: ['restaurante', 'cena', 'almuerzo', 'comida', 'plato'], grupo: 'Comida' },
  { emoji: '🍴', keywords: ['restaurante', 'cubiertos', 'comer afuera'], grupo: 'Comida' },
  { emoji: '☕', keywords: ['cafe', 'starbucks', 'desayuno', 'merienda'], grupo: 'Comida' },
  { emoji: '🍺', keywords: ['cerveza', 'bar', 'alcohol', 'birra'], grupo: 'Comida' },
  { emoji: '🍷', keywords: ['vino', 'bar', 'alcohol', 'bodega'], grupo: 'Comida' },
  { emoji: '🥐', keywords: ['panaderia', 'medialunas', 'desayuno', 'pan'], grupo: 'Comida' },
  { emoji: '🍦', keywords: ['helado', 'heladeria', 'postre', 'dulce'], grupo: 'Comida' },
  { emoji: '🛍️', keywords: ['delivery', 'pedidos ya', 'rappi', 'comida online'], grupo: 'Comida' },
  // ── Transporte ────────────────────────────────────────────────────────────
  { emoji: '🚗', keywords: ['auto', 'transporte', 'nafta', 'combustible'], grupo: 'Transporte' },
  { emoji: '⛽', keywords: ['nafta', 'combustible', 'ypf', 'shell', 'gasolina'], grupo: 'Transporte' },
  { emoji: '🚌', keywords: ['colectivo', 'bondi', 'omnibus', 'transporte publico', 'sube'], grupo: 'Transporte' },
  { emoji: '🚇', keywords: ['subte', 'tren', 'metro'], grupo: 'Transporte' },
  { emoji: '🚕', keywords: ['taxi', 'uber', 'cabify', 'didi'], grupo: 'Transporte' },
  { emoji: '🚲', keywords: ['bici', 'bicicleta', 'monopatin'], grupo: 'Transporte' },
  { emoji: '🛵', keywords: ['moto', 'motocicleta'], grupo: 'Transporte' },
  { emoji: '✈️', keywords: ['avion', 'vuelo', 'pasaje', 'viaje', 'aeropuerto'], grupo: 'Transporte' },
  { emoji: '🅿️', keywords: ['estacionamiento', 'parking', 'cochera'], grupo: 'Transporte' },
  { emoji: '🛣️', keywords: ['peaje', 'autopista', 'ruta'], grupo: 'Transporte' },
  // ── Hogar y servicios ────────────────────────────────────────────────────
  { emoji: '🏠', keywords: ['casa', 'hogar', 'vivienda'], grupo: 'Hogar' },
  { emoji: '🏘️', keywords: ['alquiler', 'expensas', 'vivienda'], grupo: 'Hogar' },
  { emoji: '🔑', keywords: ['alquiler', 'llaves', 'inmobiliaria'], grupo: 'Hogar' },
  { emoji: '⚡', keywords: ['luz', 'electricidad', 'edenor', 'edesur'], grupo: 'Hogar' },
  { emoji: '💧', keywords: ['agua', 'aysa', 'servicios'], grupo: 'Hogar' },
  { emoji: '🔥', keywords: ['gas', 'metrogas', 'servicios'], grupo: 'Hogar' },
  { emoji: '📡', keywords: ['internet', 'wifi', 'fibertel', 'telecentro', 'movistar'], grupo: 'Hogar' },
  { emoji: '📱', keywords: ['telefono', 'celular', 'movil', 'claro', 'personal'], grupo: 'Hogar' },
  { emoji: '🛠️', keywords: ['mantenimiento', 'reparacion', 'plomero', 'electricista'], grupo: 'Hogar' },
  { emoji: '🛋️', keywords: ['muebles', 'decoracion', 'easy', 'home'], grupo: 'Hogar' },
  { emoji: '🧺', keywords: ['limpieza', 'lavanderia', 'productos limpieza'], grupo: 'Hogar' },
  // ── Salud ────────────────────────────────────────────────────────────────
  { emoji: '💊', keywords: ['salud', 'medicamento', 'farmacia', 'remedios'], grupo: 'Salud' },
  { emoji: '🏥', keywords: ['hospital', 'medico', 'consulta', 'salud'], grupo: 'Salud' },
  { emoji: '💉', keywords: ['vacuna', 'inyeccion', 'salud'], grupo: 'Salud' },
  { emoji: '🦷', keywords: ['dentista', 'odontologo', 'odontologia'], grupo: 'Salud' },
  { emoji: '🩺', keywords: ['medico', 'prepaga', 'osde', 'swiss', 'medicus'], grupo: 'Salud' },
  { emoji: '🧘', keywords: ['yoga', 'meditacion', 'pilates', 'bienestar'], grupo: 'Salud' },
  { emoji: '🏋️', keywords: ['gimnasio', 'gym', 'entrenamiento', 'fitness'], grupo: 'Salud' },
  { emoji: '👓', keywords: ['anteojos', 'lentes', 'optica'], grupo: 'Salud' },
  // ── Educación y trabajo ──────────────────────────────────────────────────
  { emoji: '🎓', keywords: ['educacion', 'universidad', 'facultad', 'estudios'], grupo: 'Educación' },
  { emoji: '📚', keywords: ['libros', 'lectura', 'libreria', 'apuntes'], grupo: 'Educación' },
  { emoji: '✏️', keywords: ['estudios', 'utiles', 'escolares', 'colegio'], grupo: 'Educación' },
  { emoji: '🎒', keywords: ['colegio', 'escuela', 'mochila', 'utiles'], grupo: 'Educación' },
  { emoji: '💻', keywords: ['compu', 'computadora', 'tecnologia', 'software'], grupo: 'Educación' },
  { emoji: '🎨', keywords: ['arte', 'pintura', 'curso', 'taller'], grupo: 'Educación' },
  { emoji: '💼', keywords: ['trabajo', 'oficina', 'empresa'], grupo: 'Trabajo' },
  { emoji: '👔', keywords: ['ropa de trabajo', 'oficina', 'formal'], grupo: 'Trabajo' },
  // ── Entretenimiento ──────────────────────────────────────────────────────
  { emoji: '🎬', keywords: ['cine', 'pelicula', 'film', 'entrada'], grupo: 'Entretenimiento' },
  { emoji: '📺', keywords: ['netflix', 'streaming', 'tv', 'cable', 'disney'], grupo: 'Entretenimiento' },
  { emoji: '🎵', keywords: ['musica', 'spotify', 'apple music'], grupo: 'Entretenimiento' },
  { emoji: '🎮', keywords: ['videojuegos', 'gaming', 'playstation', 'xbox', 'steam'], grupo: 'Entretenimiento' },
  { emoji: '🎸', keywords: ['musica', 'instrumento', 'rock'], grupo: 'Entretenimiento' },
  { emoji: '🎤', keywords: ['recital', 'concierto', 'show', 'evento'], grupo: 'Entretenimiento' },
  { emoji: '🎟️', keywords: ['entradas', 'tickets', 'evento'], grupo: 'Entretenimiento' },
  { emoji: '⚽', keywords: ['futbol', 'deporte', 'cancha', 'partido'], grupo: 'Entretenimiento' },
  { emoji: '🎉', keywords: ['salida', 'fiesta', 'cumple', 'evento'], grupo: 'Entretenimiento' },
  { emoji: '🍻', keywords: ['salida', 'bar', 'amigos', 'birra'], grupo: 'Entretenimiento' },
  { emoji: '🎪', keywords: ['evento', 'show', 'entretenimiento'], grupo: 'Entretenimiento' },
  // ── Compras y belleza ────────────────────────────────────────────────────
  { emoji: '👕', keywords: ['ropa', 'indumentaria', 'shopping'], grupo: 'Compras' },
  { emoji: '👖', keywords: ['ropa', 'jeans', 'pantalon'], grupo: 'Compras' },
  { emoji: '👟', keywords: ['zapatillas', 'calzado', 'zapatos'], grupo: 'Compras' },
  { emoji: '👜', keywords: ['cartera', 'bolso', 'accesorios'], grupo: 'Compras' },
  { emoji: '💄', keywords: ['belleza', 'maquillaje', 'cosmetica'], grupo: 'Compras' },
  { emoji: '🧴', keywords: ['cosmetica', 'cuidado personal', 'farmacia'], grupo: 'Compras' },
  { emoji: '💅', keywords: ['belleza', 'manicura', 'salon'], grupo: 'Compras' },
  { emoji: '💇', keywords: ['peluqueria', 'pelo', 'cabello'], grupo: 'Compras' },
  { emoji: '🎁', keywords: ['regalo', 'cumple', 'evento'], grupo: 'Compras' },
  { emoji: '💎', keywords: ['joyas', 'lujo', 'regalo'], grupo: 'Compras' },
  // ── Mascotas y familia ───────────────────────────────────────────────────
  { emoji: '🐶', keywords: ['perro', 'mascota', 'veterinario'], grupo: 'Mascotas' },
  { emoji: '🐱', keywords: ['gato', 'mascota', 'veterinario'], grupo: 'Mascotas' },
  { emoji: '🐾', keywords: ['mascota', 'veterinario', 'pet shop'], grupo: 'Mascotas' },
  { emoji: '🍼', keywords: ['bebe', 'hijo', 'familia'], grupo: 'Familia' },
  { emoji: '👶', keywords: ['bebe', 'hijo', 'familia', 'panales'], grupo: 'Familia' },
  { emoji: '👨‍👩‍👧', keywords: ['familia', 'hijos', 'casa'], grupo: 'Familia' },
  // ── Viajes ───────────────────────────────────────────────────────────────
  { emoji: '🏖️', keywords: ['vacaciones', 'playa', 'turismo'], grupo: 'Viajes' },
  { emoji: '🏨', keywords: ['hotel', 'alojamiento', 'hospedaje', 'airbnb'], grupo: 'Viajes' },
  { emoji: '🧳', keywords: ['viaje', 'maleta', 'turismo'], grupo: 'Viajes' },
  { emoji: '🗺️', keywords: ['turismo', 'viaje', 'aventura'], grupo: 'Viajes' },
  // ── Dinero (Ingresos) ────────────────────────────────────────────────────
  { emoji: '💰', keywords: ['plata', 'dinero', 'ingreso', 'ganancia'], grupo: 'Dinero' },
  { emoji: '💵', keywords: ['efectivo', 'sueldo', 'pago'], grupo: 'Dinero' },
  { emoji: '💸', keywords: ['gasto', 'pago', 'transferencia'], grupo: 'Dinero' },
  { emoji: '🏦', keywords: ['banco', 'cuenta', 'transferencia'], grupo: 'Dinero' },
  { emoji: '📈', keywords: ['inversion', 'inversiones', 'rentabilidad', 'ganancia'], grupo: 'Dinero' },
  { emoji: '💳', keywords: ['tarjeta', 'credito', 'debito'], grupo: 'Dinero' },
  { emoji: '🎯', keywords: ['ahorro', 'objetivo', 'meta'], grupo: 'Dinero' },
  { emoji: '💼', keywords: ['sueldo', 'trabajo', 'salario'], grupo: 'Dinero' },
  { emoji: '🤝', keywords: ['comision', 'venta', 'freelance', 'extra'], grupo: 'Dinero' },
  { emoji: '🎰', keywords: ['premio', 'juego', 'extra'], grupo: 'Dinero' },
  // ── Generales / otros ────────────────────────────────────────────────────
  { emoji: '🏷️', keywords: ['etiqueta', 'categoria', 'otros'], grupo: 'Otros' },
  { emoji: '📦', keywords: ['paquete', 'envio', 'correo'], grupo: 'Otros' },
  { emoji: '🔧', keywords: ['herramientas', 'reparacion'], grupo: 'Otros' },
  { emoji: '📝', keywords: ['nota', 'otros', 'varios'], grupo: 'Otros' },
  { emoji: '⭐', keywords: ['favorito', 'destacado'], grupo: 'Otros' },
  { emoji: '🚀', keywords: ['proyecto', 'meta', 'lanzamiento'], grupo: 'Otros' },
  { emoji: '🌱', keywords: ['planta', 'ecologia', 'medio ambiente'], grupo: 'Otros' },
  { emoji: '🌍', keywords: ['donacion', 'caridad', 'beneficencia'], grupo: 'Otros' },
  { emoji: '🧠', keywords: ['terapia', 'psicologo', 'salud mental'], grupo: 'Otros' },
  { emoji: '💡', keywords: ['idea', 'proyecto', 'creativo'], grupo: 'Otros' },
]

const GRUPOS = Array.from(new Set(EMOJIS.map(e => e.grupo)))

type Props = {
  open:     boolean
  current:  string | null
  onPick:   (emoji: string) => void
  onClose:  () => void
}

export function EmojiPickerModal({ open, current, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [grupo, setGrupo] = useState<string>('')
  const [customEmoji, setCustomEmoji] = useState('')

  const filtered = useMemo<EmojiEntry[]>(() => {
    const q = norm(query.trim())
    return EMOJIS.filter(e => {
      if (grupo && e.grupo !== grupo) return false
      if (!q) return true
      // El haystack incluye el grupo (así "transporte" matchea todos los
      // de transporte sin necesidad de keyword explícito en cada uno).
      const haystack = [norm(e.grupo), ...e.keywords].join(' ')
      return haystack.includes(q)
    })
  }, [query, grupo])

  if (!open) return null

  const pickAndClose = (emoji: string) => {
    onPick(emoji)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header con search */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar emoji... (ej: super, nafta, gym, sueldo)"
            autoFocus
            className="flex-1 outline-none text-sm placeholder:text-slate-400"
          />
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filtro por grupo (chip scroll horizontal). Color de marca para el activo. */}
        <div className="px-5 py-3 border-b border-slate-100 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setGrupo('')}
            className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap font-medium transition-colors ${!grupo ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            style={!grupo ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
          >
            Todos
          </button>
          {GRUPOS.map(g => (
            <button
              key={g}
              onClick={() => setGrupo(g)}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap font-medium transition-colors ${grupo === g ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              style={grupo === g ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Grid de emojis */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="text-sm">Sin resultados para "{query}"</p>
              <button
                onClick={() => { setQuery(''); setGrupo('') }}
                className="text-xs mt-2 hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
              {filtered.map(e => {
                const isActive = current === e.emoji
                return (
                  <button
                    key={e.emoji + e.grupo}
                    onClick={() => pickAndClose(e.emoji)}
                    title={e.keywords[0]}
                    className="aspect-square flex items-center justify-center rounded-xl text-2xl transition-all hover:scale-110"
                    style={isActive
                      ? { background: 'color-mix(in srgb, var(--accent) 12%, white)', outline: '2px solid var(--accent)', outlineOffset: '1px' }
                      : { background: '#f8fafc' }}
                  >
                    {e.emoji}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer: input custom emoji (fallback para emojis fuera del catálogo) */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-500">
          <span className="shrink-0">¿Otro?</span>
          <input
            type="text"
            value={customEmoji}
            onChange={e => setCustomEmoji(e.target.value)}
            placeholder="Pegá tu emoji"
            maxLength={4}
            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-center text-base focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,var(--accent))]"
          />
          <button
            onClick={() => customEmoji.trim() && pickAndClose(customEmoji.trim())}
            disabled={!customEmoji.trim()}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            Usar
          </button>
          <span className="ml-auto text-slate-400">{filtered.length} emojis</span>
        </div>
      </div>
    </div>
  )
}
