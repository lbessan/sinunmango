// Íconos de Icons8 Stickers — https://icons8.com/icons/stickers
// Cada entrada tiene 'nombre' principal y 'alt' como fallback si el principal falla
// URL: https://img.icons8.com/stickers/96/{nombre}.png

export const ICONOS_CATEGORIAS = [
  // ── Compras ──────────────────────────────────────────────────────────────
  { nombre: 'shopping-cart',       alt: 'cart',              label: 'Compras',              grupo: 'Compras' },
  { nombre: 'shopping-bag',        alt: 'bag',               label: 'Bolsa',                grupo: 'Compras' },
  { nombre: 'market',              alt: 'grocery-store',     label: 'Tienda',               grupo: 'Compras' },
  { nombre: 'price-tag-usd',       alt: 'tag',               label: 'Precio',               grupo: 'Compras' },
  { nombre: 'discount',            alt: 'sale',              label: 'Descuento',            grupo: 'Compras' },
  { nombre: 'box',                 alt: 'package',           label: 'Paquete',              grupo: 'Compras' },
  { nombre: 'barcode',             alt: 'scan',              label: 'Código de barras',     grupo: 'Compras' },

  // ── Hogar ─────────────────────────────────────────────────────────────────
  { nombre: 'home',                alt: 'house',             label: 'Hogar',                grupo: 'Hogar' },
  { nombre: 'sofa',                alt: 'couch',             label: 'Muebles',              grupo: 'Hogar' },
  { nombre: 'maintenance',         alt: 'wrench',            label: 'Mantenimiento',        grupo: 'Hogar' },
  { nombre: 'electricity',         alt: 'light-bulb',        label: 'Electricidad',         grupo: 'Hogar' },
  { nombre: 'gas',                 alt: 'gas-stove',         label: 'Gas',                  grupo: 'Hogar' },
  { nombre: 'water',               alt: 'drop',              label: 'Agua',                 grupo: 'Hogar' },
  { nombre: 'vacuum-cleaner',      alt: 'cleaning',          label: 'Limpieza',             grupo: 'Hogar' },
  { nombre: 'washing-machine',     alt: 'laundry',           label: 'Lavandería',           grupo: 'Hogar' },
  { nombre: 'air-conditioner',     alt: 'climate-control',   label: 'Aire acond.',          grupo: 'Hogar' },
  { nombre: 'tv',                  alt: 'television',        label: 'TV',                   grupo: 'Hogar' },
  { nombre: 'key',                 alt: 'door-key',          label: 'Alquiler',             grupo: 'Hogar' },
  { nombre: 'door',                alt: 'entrance',          label: 'Vivienda',             grupo: 'Hogar' },
  { nombre: 'garden',              alt: 'plant',             label: 'Jardín',               grupo: 'Hogar' },

  // ── Transporte ────────────────────────────────────────────────────────────
  { nombre: 'car',                 alt: 'vehicle',           label: 'Auto',                 grupo: 'Transporte' },
  { nombre: 'motorcycle',          alt: 'bike',              label: 'Moto',                 grupo: 'Transporte' },
  { nombre: 'bus',                 alt: 'public-transport',  label: 'Colectivo',            grupo: 'Transporte' },
  { nombre: 'taxi',                alt: 'cab',               label: 'Taxi / Uber',          grupo: 'Transporte' },
  { nombre: 'bicycle',             alt: 'cycling',           label: 'Bicicleta',            grupo: 'Transporte' },
  { nombre: 'gas-pump',            alt: 'fuel',              label: 'Combustible',          grupo: 'Transporte' },
  { nombre: 'parking',             alt: 'park',              label: 'Estacionamiento',      grupo: 'Transporte' },
  { nombre: 'car-service',         alt: 'repair',            label: 'Service auto',         grupo: 'Transporte' },
  { nombre: 'train',               alt: 'railway',           label: 'Tren',                 grupo: 'Transporte' },
  { nombre: 'wharf',               alt: 'boat',              label: 'Barco',                grupo: 'Transporte' },

  // ── Salud ─────────────────────────────────────────────────────────────────
  { nombre: 'like',                alt: 'health',            label: 'Salud general',        grupo: 'Salud' },
  { nombre: 'pill',                alt: 'medicine',          label: 'Medicamentos',         grupo: 'Salud' },
  { nombre: 'hospital',            alt: 'clinic',            label: 'Hospital',             grupo: 'Salud' },
  { nombre: 'stethoscope',         alt: 'doctor',            label: 'Médico',               grupo: 'Salud' },
  { nombre: 'tooth',               alt: 'dental',            label: 'Dentista',             grupo: 'Salud' },
  { nombre: 'syringe',             alt: 'injection',         label: 'Vacuna',               grupo: 'Salud' },
  { nombre: 'band-aid',            alt: 'ambulance',         label: 'Primeros auxilios',    grupo: 'Salud' },
  { nombre: 'thermometer',         alt: 'temperature',       label: 'Temperatura',          grupo: 'Salud' },
  { nombre: 'contact-lens',        alt: 'glasses',           label: 'Oftalmólogo',          grupo: 'Salud' },
  { nombre: 'ambulance',           alt: 'emergency',         label: 'Emergencia',           grupo: 'Salud' },

  // ── Deporte y fitness ─────────────────────────────────────────────────────
  { nombre: 'gum-',                alt: 'gym',               label: 'Gimnasio',             grupo: 'Deporte' },
  { nombre: 'exercise',            alt: 'jogging',           label: 'Running',              grupo: 'Deporte' },
  { nombre: 'lap-pool',            alt: 'pool',              label: 'Natación',             grupo: 'Deporte' },
  { nombre: 'football2',           alt: 'soccer',            label: 'Fútbol',               grupo: 'Deporte' },
  { nombre: 'basketball',          alt: 'ball',              label: 'Básquet',              grupo: 'Deporte' },
  { nombre: 'boxing',              alt: 'punch',             label: 'Boxeo',                grupo: 'Deporte' },
  { nombre: 'cycling',             alt: 'bicycle',           label: 'Ciclismo',             grupo: 'Deporte' },

  // ── Alimentación ──────────────────────────────────────────────────────────
  { nombre: 'restaurant',          alt: 'dining',            label: 'Restaurante',          grupo: 'Comida' },
  { nombre: 'coffee',              alt: 'espresso',          label: 'Café',                 grupo: 'Comida' },
  { nombre: 'pizza',               alt: 'delivery',          label: 'Delivery',             grupo: 'Comida' },
  { nombre: 'hamburger',           alt: 'burger',            label: 'Burger',               grupo: 'Comida' },
  { nombre: 'sushi',               alt: 'japanese',          label: 'Sushi',                grupo: 'Comida' },
  { nombre: 'ingredients',         alt: 'chef',              label: 'Supermercado',         grupo: 'Comida' },
  { nombre: 'beer',                alt: 'pub',               label: 'Salidas / Bar',        grupo: 'Comida' },
  { nombre: 'wine-bottle',         alt: 'wine',              label: 'Vinos',                grupo: 'Comida' },
  { nombre: 'ice-cream-cone',      alt: 'gelato',            label: 'Helado',               grupo: 'Comida' },
  { nombre: 'cake',                alt: 'dessert',           label: 'Pastelería',           grupo: 'Comida' },
  { nombre: 'bread',               alt: 'bakery',            label: 'Panadería',            grupo: 'Comida' },
  { nombre: 'take-away-food',      alt: 'bakery',            label: 'Pedidos',              grupo: 'Comida' },

  // ── Entretenimiento ───────────────────────────────────────────────────────
  { nombre: 'movie',               alt: 'streaming',         label: 'Streaming',            grupo: 'Entretenimiento' },
  { nombre: 'headphones',          alt: 'music',             label: 'Música',               grupo: 'Entretenimiento' },
  { nombre: 'controller',          alt: 'game-controller',   label: 'Videojuegos',          grupo: 'Entretenimiento' },
  { nombre: 'clapperboard',        alt: 'film',              label: 'Cine',                 grupo: 'Entretenimiento' },
  { nombre: 'book',                alt: 'reading',           label: 'Libros',               grupo: 'Entretenimiento' },
  { nombre: 'guitar',              alt: 'live-music',        label: 'Música en vivo',       grupo: 'Entretenimiento' },
  { nombre: 'theatre',             alt: 'performance',       label: 'Teatro',               grupo: 'Entretenimiento' },
  { nombre: 'ticket',              alt: 'coupon',            label: 'Entradas',             grupo: 'Entretenimiento' },
  { nombre: 'dice',                alt: 'board-game',        label: 'Juegos de mesa',       grupo: 'Entretenimiento' },
  { nombre: 'cards',               alt: 'poker',             label: 'Casino',               grupo: 'Entretenimiento' },
  { nombre: 'circus-tent',         alt: 'circus',            label: 'Espectáculos',         grupo: 'Entretenimiento' },

  // ── Tecnología ────────────────────────────────────────────────────────────
  { nombre: 'iphone',              alt: 'mobile-phone',      label: 'Celular',              grupo: 'Tecnología' },
  { nombre: 'laptop',              alt: 'notebook',          label: 'Computadora',          grupo: 'Tecnología' },
  { nombre: 'wifi',                alt: 'wireless',          label: 'Internet',             grupo: 'Tecnología' },
  { nombre: 'monitor',             alt: 'screen',            label: 'Electrónica',          grupo: 'Tecnología' },
  { nombre: 'camera',              alt: 'photo',             label: 'Fotografía',           grupo: 'Tecnología' },
  { nombre: 'print',               alt: 'printing',          label: 'Impresora',            grupo: 'Tecnología' },
  { nombre: 'headset',             alt: 'earphones',         label: 'Auriculares',          grupo: 'Tecnología' },
  { nombre: 'usb-logo',            alt: 'drive',             label: 'Accesorios tech',      grupo: 'Tecnología' },
  { nombre: 'speaker',             alt: 'audio',             label: 'Parlantes',            grupo: 'Tecnología' },
  { nombre: 'drone',               alt: 'quadcopter',        label: 'Drone',                grupo: 'Tecnología' },

  // ── Finanzas ──────────────────────────────────────────────────────────────
  { nombre: 'money-bag',           alt: 'cash',              label: 'Dinero',               grupo: 'Finanzas' },
  { nombre: 'visa',                alt: 'debit-card',        label: 'Tarjeta',              grupo: 'Finanzas' },
  { nombre: 'wallet',              alt: 'purse',             label: 'Billetera',            grupo: 'Finanzas' },
  { nombre: 'investment',          alt: 'stocks',            label: 'Inversiones',          grupo: 'Finanzas' },
  { nombre: 'banknote',            alt: 'money',             label: 'Efectivo',             grupo: 'Finanzas' },
  { nombre: 'receipt',             alt: 'invoice',           label: 'Factura',              grupo: 'Finanzas' },
  { nombre: 'money-box',           alt: 'piggy-bank',        label: 'Ahorro',               grupo: 'Finanzas' },
  { nombre: 'money-transfer',      alt: 'transfer',          label: 'Transferencia',        grupo: 'Finanzas' },
  { nombre: 'refund',              alt: 'return',            label: 'Devolución',           grupo: 'Finanzas' },
  { nombre: 'coins',               alt: 'coin',              label: 'Monedas',              grupo: 'Finanzas' },
  { nombre: 'loan',                alt: 'mortgage',          label: 'Préstamo',             grupo: 'Finanzas' },
  { nombre: 'bank',                alt: 'banking',           label: 'Banco',                grupo: 'Finanzas' },
  { nombre: 'bitcoin',             alt: 'crypto',            label: 'Cripto',               grupo: 'Finanzas' },

  // ── Trabajo e ingresos ────────────────────────────────────────────────────
  { nombre: 'briefcase',           alt: 'work',              label: 'Trabajo',              grupo: 'Trabajo' },
  { nombre: 'office-building',     alt: 'company',           label: 'Empresa',              grupo: 'Trabajo' },
  { nombre: 'handshake',           alt: 'agreement',         label: 'Negocio',              grupo: 'Trabajo' },
  { nombre: 'salary',              alt: 'payroll',           label: 'Sueldo',               grupo: 'Trabajo' },
  { nombre: 'overtime',            alt: 'extra-time',        label: 'Horas extra',          grupo: 'Trabajo' },
  { nombre: 'conference-call',     alt: 'meeting',           label: 'Reunión',              grupo: 'Trabajo' },
  { nombre: 'contract',            alt: 'agreement',         label: 'Contrato',             grupo: 'Trabajo' },

  // ── Educación ─────────────────────────────────────────────────────────────
  { nombre: 'graduation-cap',      alt: 'degree',            label: 'Educación',            grupo: 'Educación' },
  { nombre: 'school',              alt: 'classroom',         label: 'Colegio',              grupo: 'Educación' },
  { nombre: 'university',          alt: 'college',           label: 'Universidad',          grupo: 'Educación' },
  { nombre: 'e-learning',          alt: 'online-education',  label: 'Cursos online',        grupo: 'Educación' },
  { nombre: 'pencil',              alt: 'pen',               label: 'Útiles escolares',     grupo: 'Educación' },
  { nombre: 'tuition',             alt: 'tutor',             label: 'Clases particulares',  grupo: 'Educación' },
  { nombre: 'microscope',          alt: 'science',           label: 'Investigación',        grupo: 'Educación' },

  // ── Viajes ────────────────────────────────────────────────────────────────
  { nombre: 'airplane-mode-on',    alt: 'flight',            label: 'Vuelos',               grupo: 'Viajes' },
  { nombre: 'suitcase',            alt: 'luggage',           label: 'Equipaje',             grupo: 'Viajes' },
  { nombre: 'beach',               alt: 'vacation',          label: 'Playa / Vacaciones',   grupo: 'Viajes' },
  { nombre: 'hostel',              alt: 'accommodation',     label: 'Hotel',                grupo: 'Viajes' },
  { nombre: 'passport',            alt: 'travel-documents',  label: 'Pasaporte / Trámites', grupo: 'Viajes' },
  { nombre: 'compass',             alt: 'navigation',        label: 'Turismo',              grupo: 'Viajes' },
  { nombre: 'rucksack',            alt: 'hiking',            label: 'Mochila',              grupo: 'Viajes' },
  { nombre: 'camping-tent',        alt: 'tent',              label: 'Camping',              grupo: 'Viajes' },
  { nombre: 'map',                 alt: 'location',          label: 'Mapa',                 grupo: 'Viajes' },

  // ── Ropa y personal ───────────────────────────────────────────────────────
  { nombre: 't-shirt',             alt: 'clothing',          label: 'Ropa',                 grupo: 'Personal' },
  { nombre: 'sneakers',            alt: 'shoes',             label: 'Calzado',              grupo: 'Personal' },
  { nombre: 'scissors',            alt: 'hairdresser',       label: 'Peluquería',           grupo: 'Personal' },
  { nombre: 'lipstick',            alt: 'makeup',            label: 'Cuidado personal',     grupo: 'Personal' },
  { nombre: 'perfume',             alt: 'cologne',           label: 'Perfumes',             grupo: 'Personal' },
  { nombre: 'sun-glasses',         alt: 'eyeglasses',        label: 'Accesorios',           grupo: 'Personal' },
  { nombre: 'wristwatch',          alt: 'clock',             label: 'Reloj / Joyería',      grupo: 'Personal' },
  { nombre: 'handbag',             alt: 'purse',             label: 'Cartera / Bolso',      grupo: 'Personal' },
  { nombre: 'ironing',             alt: 'clothes',           label: 'Lavandería ropa',      grupo: 'Personal' },
  { nombre: 'trust',               alt: 'clothes',           label: 'Cuidado',              grupo: 'Personal' },

  // ── Mascotas y familia ────────────────────────────────────────────────────
  { nombre: 'dog-size-small',      alt: 'puppy',             label: 'Perro',                grupo: 'Familia' },
  { nombre: 'cat',                 alt: 'kitten',            label: 'Gato',                 grupo: 'Familia' },
  { nombre: 'dog-footprint',       alt: 'animal',            label: 'Veterinaria',          grupo: 'Familia' },
  { nombre: 'baby',                alt: 'infant',            label: 'Bebé / Pañales',       grupo: 'Familia' },
  { nombre: 'baby-bottle',         alt: 'feeding-bottle',    label: 'Maternidad',           grupo: 'Familia' },
  { nombre: 'teddy-bear',          alt: 'toy',               label: 'Juguetes',             grupo: 'Familia' },
  { nombre: 'stroller',            alt: 'pram',              label: 'Cochecito',            grupo: 'Familia' },
  { nombre: 'gift',                alt: 'present',           label: 'Regalos',              grupo: 'Familia' },
  { nombre: 'birthday-cake',       alt: 'celebration',       label: 'Cumpleaños',           grupo: 'Familia' },
  { nombre: 'party',               alt: 'confetti',          label: 'Fiesta',               grupo: 'Familia' },
  { nombre: 'wedding-rings',       alt: 'ring',              label: 'Casamiento',           grupo: 'Familia' },
  { nombre: 'dog-bowl',            alt: 'ring',              label: 'Comida de Perro',      grupo: 'Familia' },

  // ── Seguros e impuestos ───────────────────────────────────────────────────
  { nombre: 'insurance',           alt: 'shield',            label: 'Seguro',               grupo: 'Seguros' },
  { nombre: 'tax',                 alt: 'taxation',          label: 'Impuestos / AFIP',     grupo: 'Seguros' },
  { nombre: 'law',                 alt: 'legal',             label: 'Legal / Escribano',    grupo: 'Seguros' },
  { nombre: 'umbrella',            alt: 'protection',        label: 'Cobertura',            grupo: 'Seguros' },
  { nombre: 'checklist',           alt: 'list',              label: 'Trámites',             grupo: 'Seguros' },
  { nombre: 'bill',                alt: 'clothes',           label: 'Cargos Tarjetas',      grupo: 'Seguros' },

  // ── Suscripciones ─────────────────────────────────────────────────────────
  { nombre: 'membership-card',     alt: 'subscription',      label: 'Suscripción mensual',  grupo: 'Suscripciones' },
  { nombre: 'news',                alt: 'magazine',          label: 'Diario / Revista',     grupo: 'Suscripciones' },
  { nombre: 'cloud',               alt: 'cloud-storage',     label: 'Almacenamiento cloud', grupo: 'Suscripciones' },

  // ── Ingresos especiales ───────────────────────────────────────────────────
  { nombre: 'get-revenue',         alt: 'income',            label: 'Ingreso',              grupo: 'Ingresos' },
  { nombre: 'real-estate',         alt: 'rent',              label: 'Alquiler cobrado',     grupo: 'Ingresos' },
  { nombre: 'economic-improvement',alt: 'dividend',          label: 'Dividendos',           grupo: 'Ingresos' },
  { nombre: 'billing',             alt: 'rebate',            label: 'Cashback',             grupo: 'Ingresos' },
  { nombre: 'trophy',              alt: 'award',             label: 'Premio / Bono',        grupo: 'Ingresos' },

  // ── Otros ─────────────────────────────────────────────────────────────────
  { nombre: 'charity',             alt: 'donation',          label: 'Donaciones',           grupo: 'Otros' },
  { nombre: 'idea',                alt: 'lightbulb',         label: 'Proyectos',            grupo: 'Otros' },
  { nombre: 'calendar',            alt: 'event',             label: 'Evento',               grupo: 'Otros' },
  { nombre: 'star',                alt: 'favorite',          label: 'Favorito',             grupo: 'Otros' },
  { nombre: 'question-mark',       alt: 'unknown',           label: 'Otros',                grupo: 'Otros' },
]

export const GRUPOS = [...new Set(ICONOS_CATEGORIAS.map(i => i.grupo))]

export function urlIcono(nombre: string, size = 96): string {
  return `https://img.icons8.com/stickers/${size}/${nombre}.png`
}

export type IconoItem = typeof ICONOS_CATEGORIAS[0]
