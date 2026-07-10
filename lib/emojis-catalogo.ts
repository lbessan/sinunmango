// ─── Catálogo de iconos de categorías ────────────────────────────────────────
//
// Fuente única de verdad para el picker y el render. Cada entrada tiene:
//   - emoji: el carácter Unicode (lo que se guarda en DB como `icono`)
//   - slug:  el nombre en el set `fluent-emoji` de Iconify (Microsoft, MIT).
//            Renderizamos la imagen 3D desde /public/emojis/{slug}.svg — así se
//            ve igual en todos los dispositivos (no depende del emoji del OS).
//   - keywords + grupo: para el buscador del picker.
//
// Los SVG se bajan con scripts/download-emojis.mjs. Si un emoji no tiene
// imagen local, IconoCategoria cae al emoji Unicode como fallback.

export type EmojiEntry = {
  emoji:    string
  slug:     string
  keywords: string[]
  grupo:    string
}

export const EMOJIS: EmojiEntry[] = [
  // ── Comida y delivery ──────────────────────────────────────────────────────
  { emoji: '🛒', slug: 'shopping-cart',        keywords: ['supermercado', 'super', 'almacen', 'compras', 'mercado'], grupo: 'Comida' },
  { emoji: '🍔', slug: 'hamburger',            keywords: ['hamburguesa', 'fast food', 'comida rapida', 'mcdonald'], grupo: 'Comida' },
  { emoji: '🍕', slug: 'pizza',                keywords: ['pizza', 'pizzeria', 'italiana'], grupo: 'Comida' },
  { emoji: '🍣', slug: 'sushi',                keywords: ['sushi', 'japonesa', 'asiatica'], grupo: 'Comida' },
  { emoji: '🥘', slug: 'shallow-pan-of-food',  keywords: ['restaurante', 'cena', 'almuerzo', 'comida', 'plato'], grupo: 'Comida' },
  { emoji: '🍴', slug: 'fork-and-knife',       keywords: ['restaurante', 'cubiertos', 'comer afuera'], grupo: 'Comida' },
  { emoji: '☕', slug: 'hot-beverage',         keywords: ['cafe', 'starbucks', 'desayuno', 'merienda'], grupo: 'Comida' },
  { emoji: '🍺', slug: 'beer-mug',             keywords: ['cerveza', 'bar', 'alcohol', 'birra'], grupo: 'Comida' },
  { emoji: '🍷', slug: 'wine-glass',           keywords: ['vino', 'bar', 'alcohol', 'bodega'], grupo: 'Comida' },
  { emoji: '🥐', slug: 'croissant',            keywords: ['panaderia', 'medialunas', 'desayuno', 'pan'], grupo: 'Comida' },
  { emoji: '🍦', slug: 'soft-ice-cream',       keywords: ['helado', 'heladeria', 'postre', 'dulce'], grupo: 'Comida' },
  { emoji: '🛍️', slug: 'shopping-bags',        keywords: ['delivery', 'pedidos ya', 'rappi', 'comida online'], grupo: 'Comida' },
  // ── Transporte ──────────────────────────────────────────────────────────────
  { emoji: '🚗', slug: 'automobile',           keywords: ['auto', 'transporte', 'nafta', 'combustible'], grupo: 'Transporte' },
  { emoji: '⛽', slug: 'fuel-pump',            keywords: ['nafta', 'combustible', 'ypf', 'shell', 'gasolina'], grupo: 'Transporte' },
  { emoji: '🚌', slug: 'bus',                  keywords: ['colectivo', 'bondi', 'omnibus', 'transporte publico', 'sube'], grupo: 'Transporte' },
  { emoji: '🚇', slug: 'metro',                keywords: ['subte', 'tren', 'metro'], grupo: 'Transporte' },
  { emoji: '🚕', slug: 'taxi',                 keywords: ['taxi', 'uber', 'cabify', 'didi'], grupo: 'Transporte' },
  { emoji: '🚲', slug: 'bicycle',              keywords: ['bici', 'bicicleta', 'monopatin'], grupo: 'Transporte' },
  { emoji: '🛵', slug: 'motor-scooter',        keywords: ['moto', 'motocicleta'], grupo: 'Transporte' },
  { emoji: '✈️', slug: 'airplane',             keywords: ['avion', 'vuelo', 'pasaje', 'viaje', 'aeropuerto'], grupo: 'Transporte' },
  { emoji: '🅿️', slug: 'p-button',             keywords: ['estacionamiento', 'parking', 'cochera'], grupo: 'Transporte' },
  { emoji: '🛣️', slug: 'motorway',             keywords: ['peaje', 'autopista', 'ruta'], grupo: 'Transporte' },
  // ── Hogar y servicios ───────────────────────────────────────────────────────
  { emoji: '🏠', slug: 'house',                keywords: ['casa', 'hogar', 'vivienda'], grupo: 'Hogar' },
  { emoji: '🏘️', slug: 'houses',               keywords: ['alquiler', 'expensas', 'vivienda'], grupo: 'Hogar' },
  { emoji: '🔑', slug: 'key',                  keywords: ['alquiler', 'llaves', 'inmobiliaria'], grupo: 'Hogar' },
  { emoji: '⚡', slug: 'high-voltage',         keywords: ['luz', 'electricidad', 'edenor', 'edesur'], grupo: 'Hogar' },
  { emoji: '💧', slug: 'droplet',              keywords: ['agua', 'aysa', 'servicios'], grupo: 'Hogar' },
  { emoji: '🔥', slug: 'fire',                 keywords: ['gas', 'metrogas', 'servicios'], grupo: 'Hogar' },
  { emoji: '📡', slug: 'satellite-antenna',    keywords: ['internet', 'wifi', 'fibertel', 'telecentro', 'movistar'], grupo: 'Hogar' },
  { emoji: '📱', slug: 'mobile-phone',         keywords: ['telefono', 'celular', 'movil', 'claro', 'personal'], grupo: 'Hogar' },
  { emoji: '🛠️', slug: 'hammer-and-wrench',    keywords: ['mantenimiento', 'reparacion', 'plomero', 'electricista'], grupo: 'Hogar' },
  { emoji: '🛋️', slug: 'couch-and-lamp',       keywords: ['muebles', 'decoracion', 'easy', 'home'], grupo: 'Hogar' },
  { emoji: '🧺', slug: 'basket',               keywords: ['limpieza', 'lavanderia', 'productos limpieza'], grupo: 'Hogar' },
  // ── Salud ───────────────────────────────────────────────────────────────────
  { emoji: '💊', slug: 'pill',                 keywords: ['salud', 'medicamento', 'farmacia', 'remedios'], grupo: 'Salud' },
  { emoji: '🏥', slug: 'hospital',             keywords: ['hospital', 'medico', 'consulta', 'salud'], grupo: 'Salud' },
  { emoji: '💉', slug: 'syringe',              keywords: ['vacuna', 'inyeccion', 'salud'], grupo: 'Salud' },
  { emoji: '🦷', slug: 'tooth',                keywords: ['dentista', 'odontologo', 'odontologia'], grupo: 'Salud' },
  { emoji: '🩺', slug: 'stethoscope',          keywords: ['medico', 'prepaga', 'osde', 'swiss', 'medicus'], grupo: 'Salud' },
  { emoji: '🧘', slug: 'person-in-lotus-position', keywords: ['yoga', 'meditacion', 'pilates', 'bienestar'], grupo: 'Salud' },
  { emoji: '🏋️', slug: 'person-lifting-weights', keywords: ['gimnasio', 'gym', 'entrenamiento', 'fitness'], grupo: 'Salud' },
  { emoji: '👓', slug: 'glasses',              keywords: ['anteojos', 'lentes', 'optica'], grupo: 'Salud' },
  // ── Educación y trabajo ─────────────────────────────────────────────────────
  { emoji: '🎓', slug: 'graduation-cap',       keywords: ['educacion', 'universidad', 'facultad', 'estudios'], grupo: 'Educación' },
  { emoji: '📚', slug: 'books',                keywords: ['libros', 'lectura', 'libreria', 'apuntes'], grupo: 'Educación' },
  { emoji: '✏️', slug: 'pencil',               keywords: ['estudios', 'utiles', 'escolares', 'colegio'], grupo: 'Educación' },
  { emoji: '🎒', slug: 'backpack',             keywords: ['colegio', 'escuela', 'mochila', 'utiles'], grupo: 'Educación' },
  { emoji: '💻', slug: 'laptop',               keywords: ['compu', 'computadora', 'tecnologia', 'software'], grupo: 'Educación' },
  { emoji: '🎨', slug: 'artist-palette',       keywords: ['arte', 'pintura', 'curso', 'taller'], grupo: 'Educación' },
  { emoji: '💼', slug: 'briefcase',            keywords: ['trabajo', 'oficina', 'empresa'], grupo: 'Trabajo' },
  { emoji: '👔', slug: 'necktie',              keywords: ['ropa de trabajo', 'oficina', 'formal'], grupo: 'Trabajo' },
  // ── Entretenimiento ─────────────────────────────────────────────────────────
  { emoji: '🎬', slug: 'clapper-board',        keywords: ['cine', 'pelicula', 'film', 'entrada'], grupo: 'Entretenimiento' },
  { emoji: '📺', slug: 'television',           keywords: ['netflix', 'streaming', 'tv', 'cable', 'disney'], grupo: 'Entretenimiento' },
  { emoji: '🎵', slug: 'musical-note',         keywords: ['musica', 'spotify', 'apple music'], grupo: 'Entretenimiento' },
  { emoji: '🎮', slug: 'video-game',           keywords: ['videojuegos', 'gaming', 'playstation', 'xbox', 'steam'], grupo: 'Entretenimiento' },
  { emoji: '🎸', slug: 'guitar',               keywords: ['musica', 'instrumento', 'rock'], grupo: 'Entretenimiento' },
  { emoji: '🎤', slug: 'microphone',           keywords: ['recital', 'concierto', 'show', 'evento'], grupo: 'Entretenimiento' },
  { emoji: '🎟️', slug: 'admission-tickets',    keywords: ['entradas', 'tickets', 'evento'], grupo: 'Entretenimiento' },
  { emoji: '⚽', slug: 'soccer-ball',          keywords: ['futbol', 'deporte', 'cancha', 'partido'], grupo: 'Entretenimiento' },
  { emoji: '🎉', slug: 'party-popper',         keywords: ['salida', 'fiesta', 'cumple', 'evento'], grupo: 'Entretenimiento' },
  { emoji: '🍻', slug: 'clinking-beer-mugs',   keywords: ['salida', 'bar', 'amigos', 'birra'], grupo: 'Entretenimiento' },
  { emoji: '🎪', slug: 'circus-tent',          keywords: ['evento', 'show', 'entretenimiento'], grupo: 'Entretenimiento' },
  // ── Compras y belleza ───────────────────────────────────────────────────────
  { emoji: '👕', slug: 't-shirt',              keywords: ['ropa', 'indumentaria', 'shopping'], grupo: 'Compras' },
  { emoji: '👖', slug: 'jeans',                keywords: ['ropa', 'jeans', 'pantalon'], grupo: 'Compras' },
  { emoji: '👟', slug: 'running-shoe',         keywords: ['zapatillas', 'calzado', 'zapatos'], grupo: 'Compras' },
  { emoji: '👜', slug: 'handbag',              keywords: ['cartera', 'bolso', 'accesorios'], grupo: 'Compras' },
  { emoji: '💄', slug: 'lipstick',             keywords: ['belleza', 'maquillaje', 'cosmetica'], grupo: 'Compras' },
  { emoji: '🧴', slug: 'lotion-bottle',        keywords: ['cosmetica', 'cuidado personal', 'farmacia'], grupo: 'Compras' },
  { emoji: '💅', slug: 'nail-polish',          keywords: ['belleza', 'manicura', 'salon'], grupo: 'Compras' },
  { emoji: '💇', slug: 'person-getting-haircut', keywords: ['peluqueria', 'pelo', 'cabello'], grupo: 'Compras' },
  { emoji: '🎁', slug: 'wrapped-gift',         keywords: ['regalo', 'cumple', 'evento'], grupo: 'Compras' },
  { emoji: '💎', slug: 'gem-stone',            keywords: ['joyas', 'lujo', 'regalo'], grupo: 'Compras' },
  // ── Mascotas y familia ──────────────────────────────────────────────────────
  { emoji: '🐶', slug: 'dog-face',             keywords: ['perro', 'mascota', 'veterinario'], grupo: 'Mascotas' },
  { emoji: '🐱', slug: 'cat-face',             keywords: ['gato', 'mascota', 'veterinario'], grupo: 'Mascotas' },
  { emoji: '🐾', slug: 'paw-prints',           keywords: ['mascota', 'veterinario', 'pet shop'], grupo: 'Mascotas' },
  { emoji: '🍼', slug: 'baby-bottle',          keywords: ['bebe', 'hijo', 'familia'], grupo: 'Familia' },
  { emoji: '👶', slug: 'baby',                 keywords: ['bebe', 'hijo', 'familia', 'panales'], grupo: 'Familia' },
  { emoji: '🫂', slug: 'people-hugging',       keywords: ['familia', 'hijos', 'casa', 'personas', 'abrazo'], grupo: 'Familia' },
  // ── Viajes ──────────────────────────────────────────────────────────────────
  { emoji: '🏖️', slug: 'beach-with-umbrella',  keywords: ['vacaciones', 'playa', 'turismo'], grupo: 'Viajes' },
  { emoji: '🏨', slug: 'hotel',                keywords: ['hotel', 'alojamiento', 'hospedaje', 'airbnb'], grupo: 'Viajes' },
  { emoji: '🧳', slug: 'luggage',              keywords: ['viaje', 'maleta', 'turismo'], grupo: 'Viajes' },
  { emoji: '🗺️', slug: 'world-map',            keywords: ['turismo', 'viaje', 'aventura'], grupo: 'Viajes' },
  // ── Dinero (Ingresos) ───────────────────────────────────────────────────────
  { emoji: '💰', slug: 'money-bag',            keywords: ['plata', 'dinero', 'ingreso', 'ganancia'], grupo: 'Dinero' },
  { emoji: '💵', slug: 'dollar-banknote',      keywords: ['efectivo', 'sueldo', 'pago'], grupo: 'Dinero' },
  { emoji: '💸', slug: 'money-with-wings',     keywords: ['gasto', 'pago', 'transferencia'], grupo: 'Dinero' },
  { emoji: '🏦', slug: 'bank',                 keywords: ['banco', 'cuenta', 'transferencia'], grupo: 'Dinero' },
  { emoji: '📈', slug: 'chart-increasing',     keywords: ['inversion', 'inversiones', 'rentabilidad', 'ganancia'], grupo: 'Dinero' },
  { emoji: '💳', slug: 'credit-card',          keywords: ['tarjeta', 'credito', 'debito'], grupo: 'Dinero' },
  { emoji: '🎯', slug: 'bullseye',             keywords: ['ahorro', 'objetivo', 'meta'], grupo: 'Dinero' },
  { emoji: '🤝', slug: 'handshake',            keywords: ['comision', 'venta', 'freelance', 'extra'], grupo: 'Dinero' },
  { emoji: '🎰', slug: 'slot-machine',         keywords: ['premio', 'juego', 'extra'], grupo: 'Dinero' },
  // ── Generales / otros ───────────────────────────────────────────────────────
  { emoji: '🏷️', slug: 'label',                keywords: ['etiqueta', 'categoria', 'otros'], grupo: 'Otros' },
  { emoji: '📦', slug: 'package',              keywords: ['paquete', 'envio', 'correo'], grupo: 'Otros' },
  { emoji: '🔧', slug: 'wrench',               keywords: ['herramientas', 'reparacion'], grupo: 'Otros' },
  { emoji: '📝', slug: 'memo',                 keywords: ['nota', 'otros', 'varios'], grupo: 'Otros' },
  { emoji: '⭐', slug: 'star',                 keywords: ['favorito', 'destacado'], grupo: 'Otros' },
  { emoji: '🚀', slug: 'rocket',               keywords: ['proyecto', 'meta', 'lanzamiento'], grupo: 'Otros' },
  { emoji: '🌱', slug: 'seedling',             keywords: ['planta', 'ecologia', 'medio ambiente'], grupo: 'Otros' },
  { emoji: '🌍', slug: 'globe-showing-europe-africa', keywords: ['donacion', 'caridad', 'beneficencia'], grupo: 'Otros' },
  { emoji: '🧠', slug: 'brain',                keywords: ['terapia', 'psicologo', 'salud mental'], grupo: 'Otros' },
  { emoji: '💡', slug: 'light-bulb',           keywords: ['idea', 'proyecto', 'creativo'], grupo: 'Otros' },
]

// Mapa emoji → slug (para que IconoCategoria resuelva la imagen desde el emoji
// guardado en DB).
export const EMOJI_TO_SLUG: Record<string, string> = Object.fromEntries(
  EMOJIS.map(e => [e.emoji, e.slug]),
)

// Mapa iconos Lucide legacy (PascalCase) → emoji equivalente. Las cuentas
// creadas antes del cambio a emojis guardaban nombres Lucide; esto las traduce
// tanto en el render (IconoCategoria) como en la migración de datos.
// Los que no estén acá caen al genérico 🏷️.
export const LUCIDE_TO_EMOJI: Record<string, string> = {
  ShoppingCart: '🛒', ShoppingBasket: '🛒', Store: '🛒',
  Coffee: '☕', Utensils: '🍴', UtensilsCrossed: '🥘', Pizza: '🍕',
  Beef: '🍔', Sandwich: '🍔', Beer: '🍺', Wine: '🍷', Croissant: '🥐',
  IceCream: '🍦', IceCream2: '🍦', ShoppingBag: '🛍️', Cake: '🍦',
  Car: '🚗', Fuel: '⛽', Bus: '🚌', Train: '🚇', TrainFront: '🚇',
  Bike: '🚲', Plane: '✈️', MapPin: '🅿️', Milestone: '🛣️', Truck: '🛍️',
  Home: '🏠', House: '🏠', Building: '🏘️', Building2: '🏘️', Key: '🔑',
  Zap: '⚡', Droplet: '💧', Droplets: '💧', Flame: '🔥', Wifi: '📡',
  Satellite: '📡', SatelliteDish: '📡', Smartphone: '📱', Phone: '📱',
  Hammer: '🛠️', Wrench: '🔧', Sofa: '🛋️', Lamp: '🛋️', WashingMachine: '🧺',
  Pill: '💊', Cross: '🏥', Hospital: '🏥', Syringe: '💉', Stethoscope: '🩺',
  Activity: '🩺', Dumbbell: '🏋️', Glasses: '👓',
  GraduationCap: '🎓', BookOpen: '📚', Book: '📚', Library: '📚',
  Pencil: '✏️', PenLine: '✏️', Backpack: '🎒', Laptop: '💻', Monitor: '💻',
  Palette: '🎨', Briefcase: '💼', Shirt: '👕',
  Film: '🎬', Clapperboard: '🎬', Tv: '📺', Tv2: '📺', Music: '🎵',
  Music2: '🎵', Music4: '🎵', Gamepad: '🎮', Gamepad2: '🎮', Guitar: '🎸',
  Mic: '🎤', Mic2: '🎤', Ticket: '🎟️', PartyPopper: '🎉', Trophy: '⚽',
  Volleyball: '⚽', Tent: '🎪',
  Watch: '👜', Glasses2: '👓', Sparkles: '💄', Scissors: '💇',
  Gift: '🎁', Gem: '💎', Diamond: '💎',
  Dog: '🐶', Cat: '🐱', PawPrint: '🐾', Baby: '👶',
  Luggage: '🧳', Map: '🗺️', Umbrella: '🏖️', Hotel: '🏨', BedDouble: '🏨',
  Wallet: '💰', PiggyBank: '💰', DollarSign: '💵', Banknote: '💵',
  Landmark: '🏦', TrendingUp: '📈', LineChart: '📈', CreditCard: '💳',
  Target: '🎯', Handshake: '🤝', Dice5: '🎰',
  Tag: '🏷️', Tags: '🏷️', Package: '📦', FileText: '📝', StickyNote: '📝',
  Star: '⭐', Rocket: '🚀', Sprout: '🌱', Leaf: '🌱', Globe: '🌍',
  Brain: '🧠', Lightbulb: '💡', HeartPulse: '🩺', Heart: '💊',
}

export const GRUPOS = Array.from(new Set(EMOJIS.map(e => e.grupo)))
