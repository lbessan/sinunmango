// ─── Catálogo de iconos de categorías ────────────────────────────────────────
//
// Fuente única de verdad para el picker y el render. Cada entrada tiene:
//   - emoji: el carácter Unicode (lo que se guarda en DB como `icono`)
//   - slug:  identificador estable del ícono (lo usamos como filename). El
//            render nuevo muestra un glifo SÓLIDO monocromo desde
//            /public/iconos/{slug}.svg (set Phosphor) sobre una pastilla pastel
//            por grupo — se ve igual en todos los dispositivos.
//   - keywords + grupo: para el buscador del picker + el color de la pastilla.
//
// Los SVG sólidos se bajan con scripts/download-iconos-solidos.mjs. Si un emoji
// custom no tiene ícono local, IconoCategoria cae al emoji Unicode como fallback.

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

  // ── Ampliación: variantes ──────────────────────────────────────────────────
  { emoji: '🎂', slug: 'cake',            keywords: ['torta', 'cumpleanos', 'postre', 'festejo'], grupo: 'Comida' },
  { emoji: '🍪', slug: 'cookie',          keywords: ['galleta', 'galletitas', 'dulce', 'snack'], grupo: 'Comida' },
  { emoji: '🥗', slug: 'ensalada',        keywords: ['ensalada', 'saludable', 'dieta', 'verde'], grupo: 'Comida' },
  { emoji: '🍿', slug: 'popcorn',         keywords: ['pochoclo', 'pop', 'snack', 'cine'], grupo: 'Comida' },
  { emoji: '🥕', slug: 'verduras',        keywords: ['verdura', 'verduleria', 'dietetica', 'sano'], grupo: 'Comida' },

  { emoji: '🚚', slug: 'camion',          keywords: ['camion', 'mudanza', 'flete', 'envio'], grupo: 'Transporte' },
  { emoji: '🛴', slug: 'monopatin',       keywords: ['monopatin', 'scooter', 'electrico'], grupo: 'Transporte' },
  { emoji: '⛴️', slug: 'barco',           keywords: ['barco', 'ferry', 'buque', 'crucero'], grupo: 'Transporte' },
  { emoji: '🚦', slug: 'semaforo',        keywords: ['semaforo', 'transito', 'trafico', 'peaje'], grupo: 'Transporte' },

  { emoji: '🚿', slug: 'ducha',           keywords: ['ducha', 'bano', 'agua', 'aysa'], grupo: 'Hogar' },
  { emoji: '🧹', slug: 'escoba',          keywords: ['escoba', 'limpieza', 'limpiar', 'orden'], grupo: 'Hogar' },
  { emoji: '🔨', slug: 'martillo',        keywords: ['martillo', 'arreglos', 'reparacion', 'herramienta'], grupo: 'Hogar' },
  { emoji: '🪑', slug: 'sillon',          keywords: ['muebles', 'silla', 'sillon', 'deco'], grupo: 'Hogar' },

  { emoji: '💓', slug: 'latido',          keywords: ['cardiologo', 'presion', 'cardio', 'corazon'], grupo: 'Salud' },
  { emoji: '🩹', slug: 'curita',          keywords: ['curita', 'herida', 'botiquin', 'primeros auxilios'], grupo: 'Salud' },
  { emoji: '🦠', slug: 'virus',           keywords: ['virus', 'gripe', 'infeccion', 'covid'], grupo: 'Salud' },
  { emoji: '🚑', slug: 'ambulancia',      keywords: ['ambulancia', 'emergencia', 'urgencia'], grupo: 'Salud' },

  { emoji: '🖥️', slug: 'monitor',         keywords: ['monitor', 'pc', 'oficina', 'escritorio'], grupo: 'Trabajo' },
  { emoji: '📁', slug: 'carpeta',         keywords: ['carpeta', 'archivos', 'documentos'], grupo: 'Trabajo' },
  { emoji: '✉️', slug: 'sobre',           keywords: ['sobre', 'correo', 'carta', 'email'], grupo: 'Trabajo' },
  { emoji: '📊', slug: 'grafico-barras',  keywords: ['grafico', 'reporte', 'estadistica', 'informe'], grupo: 'Trabajo' },
  { emoji: '🖊️', slug: 'lapicera',        keywords: ['lapicera', 'firma', 'birome'], grupo: 'Trabajo' },

  { emoji: '🎧', slug: 'auriculares',     keywords: ['auriculares', 'musica', 'podcast', 'spotify'], grupo: 'Entretenimiento' },
  { emoji: '📸', slug: 'camara',          keywords: ['camara', 'fotos', 'foto'], grupo: 'Entretenimiento' },
  { emoji: '🎲', slug: 'dados',           keywords: ['dados', 'juego', 'azar', 'apuesta'], grupo: 'Entretenimiento' },
  { emoji: '📖', slug: 'libro-abierto',   keywords: ['libro', 'lectura', 'leer', 'novela'], grupo: 'Entretenimiento' },
  { emoji: '🕹️', slug: 'joystick',        keywords: ['arcade', 'juego', 'retro', 'consola'], grupo: 'Entretenimiento' },

  { emoji: '👗', slug: 'vestido',         keywords: ['vestido', 'ropa', 'mujer', 'indumentaria'], grupo: 'Compras' },
  { emoji: '👠', slug: 'tacos',           keywords: ['tacos', 'zapatos', 'calzado', 'mujer'], grupo: 'Compras' },
  { emoji: '⌚', slug: 'reloj',           keywords: ['reloj', 'relojeria', 'accesorio'], grupo: 'Compras' },
  { emoji: '🕶️', slug: 'lentes-sol',      keywords: ['lentes', 'sol', 'optica', 'anteojos'], grupo: 'Compras' },
  { emoji: '🧢', slug: 'gorra',           keywords: ['gorra', 'cap', 'accesorio'], grupo: 'Compras' },

  { emoji: '🐦', slug: 'pajaro',          keywords: ['pajaro', 'ave', 'mascota'], grupo: 'Mascotas' },
  { emoji: '🦴', slug: 'hueso',           keywords: ['hueso', 'perro', 'alimento mascota'], grupo: 'Mascotas' },
  { emoji: '🐠', slug: 'pecera',          keywords: ['pez', 'pecera', 'acuario', 'mascota'], grupo: 'Mascotas' },

  { emoji: '🫶', slug: 'carino',          keywords: ['carino', 'familia', 'cuidado', 'amor'], grupo: 'Familia' },
  { emoji: '🎈', slug: 'globo',           keywords: ['globo', 'cumple', 'fiesta', 'festejo'], grupo: 'Familia' },
  { emoji: '🚼', slug: 'cochecito',       keywords: ['cochecito', 'bebe', 'paseo', 'hijo'], grupo: 'Familia' },

  { emoji: '🧭', slug: 'brujula',         keywords: ['brujula', 'turismo', 'aventura', 'orientacion'], grupo: 'Viajes' },
  { emoji: '🏔️', slug: 'montana',         keywords: ['montana', 'nieve', 'ski', 'trekking'], grupo: 'Viajes' },
  { emoji: '📍', slug: 'ubicacion',       keywords: ['ubicacion', 'lugar', 'mapa', 'pin'], grupo: 'Viajes' },
  { emoji: '🛫', slug: 'despegue',        keywords: ['vuelo', 'avion', 'despegue', 'aeropuerto'], grupo: 'Viajes' },

  { emoji: '🪙', slug: 'monedas',         keywords: ['monedas', 'ahorro', 'cambio', 'efectivo'], grupo: 'Dinero' },
  { emoji: '🐷', slug: 'alcancia',        keywords: ['alcancia', 'ahorro', 'chanchito'], grupo: 'Dinero' },
  { emoji: '🧾', slug: 'recibo',          keywords: ['recibo', 'factura', 'comprobante', 'ticket'], grupo: 'Dinero' },
  { emoji: '👛', slug: 'billetera',       keywords: ['billetera', 'cartera', 'monedero'], grupo: 'Dinero' },
  { emoji: '📉', slug: 'perdida',         keywords: ['perdida', 'baja', 'caida', 'deuda'], grupo: 'Dinero' },

  { emoji: '❤️', slug: 'corazon',         keywords: ['favorito', 'amor', 'me gusta'], grupo: 'Otros' },
  { emoji: '🔔', slug: 'campana',         keywords: ['recordatorio', 'alerta', 'aviso', 'notificacion'], grupo: 'Otros' },
  { emoji: '⚙️', slug: 'engranaje',       keywords: ['config', 'servicio', 'ajuste', 'mantenimiento'], grupo: 'Otros' },
  { emoji: '🔒', slug: 'candado',         keywords: ['seguridad', 'privado', 'clave'], grupo: 'Otros' },
  { emoji: '📅', slug: 'calendario',      keywords: ['calendario', 'fecha', 'agenda', 'evento'], grupo: 'Otros' },
  { emoji: '🚩', slug: 'bandera',         keywords: ['meta', 'objetivo', 'importante'], grupo: 'Otros' },

  // ── Ampliación: grupos nuevos ──────────────────────────────────────────────
  { emoji: '🔌', slug: 'enchufe',         keywords: ['enchufe', 'electro', 'cargador', 'luz'], grupo: 'Tecnología' },
  { emoji: '🖨️', slug: 'impresora',       keywords: ['impresora', 'imprimir', 'oficina'], grupo: 'Tecnología' },
  { emoji: '⌨️', slug: 'teclado',         keywords: ['teclado', 'compu', 'gaming', 'tecnologia'], grupo: 'Tecnología' },
  { emoji: '🤖', slug: 'robot',           keywords: ['robot', 'ia', 'tecnologia', 'app'], grupo: 'Tecnología' },
  { emoji: '💾', slug: 'guardar',         keywords: ['guardar', 'software', 'disco', 'backup'], grupo: 'Tecnología' },

  { emoji: '🏀', slug: 'basquet',         keywords: ['basquet', 'basket', 'pelota', 'deporte'], grupo: 'Deportes' },
  { emoji: '🎾', slug: 'tenis',           keywords: ['tenis', 'padel', 'raqueta', 'deporte'], grupo: 'Deportes' },
  { emoji: '🏃', slug: 'correr',          keywords: ['correr', 'running', 'maraton', 'gym'], grupo: 'Deportes' },
  { emoji: '🏊', slug: 'natacion',        keywords: ['natacion', 'pileta', 'nadar', 'deporte'], grupo: 'Deportes' },
  { emoji: '🏆', slug: 'trofeo',          keywords: ['trofeo', 'logro', 'torneo', 'premio'], grupo: 'Deportes' },

  { emoji: '📄', slug: 'documento',       keywords: ['documento', 'formulario', 'tramite', 'papel'], grupo: 'Trámites' },
  { emoji: '⚖️', slug: 'balanza',         keywords: ['impuestos', 'afip', 'arca', 'legal', 'justicia'], grupo: 'Trámites' },
  { emoji: '📋', slug: 'planilla',        keywords: ['planilla', 'tramite', 'checklist', 'formulario'], grupo: 'Trámites' },
  { emoji: '🪪', slug: 'dni',             keywords: ['dni', 'documento', 'identidad'], grupo: 'Trámites' },
  { emoji: '✒️', slug: 'sello',           keywords: ['sello', 'firma', 'oficial', 'tramite'], grupo: 'Trámites' },

  { emoji: '▶️', slug: 'play',            keywords: ['streaming', 'netflix', 'ver', 'reproducir'], grupo: 'Suscripciones' },
  { emoji: '🔁', slug: 'repetir',         keywords: ['recurrente', 'suscripcion', 'mensual', 'renovacion'], grupo: 'Suscripciones' },
  { emoji: '👑', slug: 'corona',          keywords: ['premium', 'pro', 'vip', 'plan'], grupo: 'Suscripciones' },
  { emoji: '☁️', slug: 'nube',            keywords: ['nube', 'cloud', 'almacenamiento', 'backup'], grupo: 'Suscripciones' },
  { emoji: '📽️', slug: 'streaming',       keywords: ['streaming', 'series', 'disney', 'hbo', 'prime'], grupo: 'Suscripciones' },
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

// ─── Iconos sólidos sobre pastel ─────────────────────────────────────────────
// El render nuevo (IconoCategoria) muestra un glifo sólido monocromo
// (set Phosphor, en /public/iconos/{slug}.svg) sobre una pastilla de color
// pastel según el grupo de la categoría. Los assets se bajan con
// scripts/download-iconos-solidos.mjs.

// Color pastel de fondo por grupo (la pastilla del ícono).
export const GRUPO_COLOR: Record<string, string> = {
  Comida:          '#f8e3d2', // durazno
  Transporte:      '#d9e6f7', // celeste
  Hogar:           '#e7e0f7', // lavanda
  Salud:           '#f8dee4', // rosa
  'Educación':     '#e4eed3', // verde
  Trabajo:         '#dde3ef', // gris azulado
  Entretenimiento: '#f8ecd0', // manteca
  Compras:         '#efe0f6', // lila
  Mascotas:        '#ece7d6', // arena
  Familia:         '#d6eee1', // menta
  Viajes:          '#d4edf3', // cyan
  Dinero:          '#d9f0d5', // verde fresco
  Otros:           '#eae9ec', // gris
  'Tecnología':    '#dde7ef', // azul grisáceo
  Deportes:        '#e3edd5', // lima
  'Trámites':      '#e8e3da', // arena
  Suscripciones:   '#e6dff2', // periwinkle
}

// emoji → grupo (para que IconoCategoria resuelva el color desde el emoji guardado).
export const EMOJI_TO_GRUPO: Record<string, string> = Object.fromEntries(
  EMOJIS.map(e => [e.emoji, e.grupo]),
)

// Versión de los assets de íconos. Se agrega como ?v= a la URL para bustear
// el caché (navegador + service worker de la PWA + CDN) cuando cambia el trazo
// de los SVG sin cambiar el nombre del archivo. Subir este número al regenerar.
export const ICONOS_VERSION = '2'
