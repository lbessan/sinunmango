// ─── Iconos de categorías — curados de lucide-react ─────────────────────────
//
// Sistema local de iconos (sin URLs externas). Cada entrada tiene:
//   - name:  PascalCase del icono en lucide-react (el "nombre técnico")
//   - label: español, lo que el user ve
//   - tags:  array de palabras clave en español, para el buscador del picker
//   - grupo: agrupación visual en el picker
//
// El componente <IconoCategoria> renderiza el icono Lucide directo. Soporta
// fallback a emoji si el valor guardado no matchea ningún Lucide (por compat
// con categorías viejas que tengan un emoji como ícono).
//
// Cómo agregar uno nuevo:
//   1. Buscá el icono en https://lucide.dev/icons/
//   2. Agregá una entrada al array con su nombre PascalCase
//   3. Listo — el picker lo levanta automático.

export type IconoDef = {
  name:  string    // PascalCase Lucide
  label: string    // español
  tags:  string[]  // palabras clave búsqueda (lowercase)
  grupo: string    // bucket visual del picker
}

export const GRUPOS = [
  'Compras', 'Comida', 'Casa', 'Transporte', 'Salud', 'Trabajo',
  'Dinero', 'Educación', 'Entretenimiento', 'Deporte', 'Mascotas',
  'Servicios', 'Belleza', 'Viajes', 'Documentos', 'Familia',
] as const

export const ICONOS_CATEGORIAS: IconoDef[] = [
  // ── Compras ───────────────────────────────────────────────────────────────
  { name: 'ShoppingCart',  label: 'Carrito',       tags: ['carrito', 'super', 'mercado', 'compras', 'almacen'],     grupo: 'Compras' },
  { name: 'ShoppingBag',   label: 'Bolsa',         tags: ['bolsa', 'compras', 'shopping', 'ropa'],                  grupo: 'Compras' },
  { name: 'Package',       label: 'Paquete',       tags: ['paquete', 'envio', 'caja', 'delivery'],                  grupo: 'Compras' },
  { name: 'Receipt',       label: 'Recibo',        tags: ['recibo', 'ticket', 'factura', 'comprobante'],            grupo: 'Compras' },
  { name: 'Tag',           label: 'Etiqueta',      tags: ['etiqueta', 'precio', 'oferta', 'descuento'],             grupo: 'Compras' },
  { name: 'Gift',          label: 'Regalo',        tags: ['regalo', 'presente', 'cumple', 'navidad'],               grupo: 'Compras' },
  { name: 'Store',         label: 'Tienda',        tags: ['tienda', 'comercio', 'negocio', 'local'],                grupo: 'Compras' },

  // ── Comida ────────────────────────────────────────────────────────────────
  { name: 'UtensilsCrossed', label: 'Restaurante', tags: ['restaurante', 'comida', 'cubiertos', 'cena', 'almuerzo'], grupo: 'Comida' },
  { name: 'Pizza',         label: 'Pizza',         tags: ['pizza', 'pizzeria', 'italiana', 'comida'],               grupo: 'Comida' },
  { name: 'Coffee',         label: 'Café',         tags: ['cafe', 'desayuno', 'merienda', 'bar'],                   grupo: 'Comida' },
  { name: 'Beer',           label: 'Cerveza',      tags: ['cerveza', 'bar', 'salida', 'birra', 'alcohol'],          grupo: 'Comida' },
  { name: 'Wine',           label: 'Vino',         tags: ['vino', 'bar', 'salida', 'restaurant', 'alcohol'],        grupo: 'Comida' },
  { name: 'IceCream',       label: 'Helado',       tags: ['helado', 'postre', 'heladeria'],                         grupo: 'Comida' },
  { name: 'Cookie',         label: 'Galletita',    tags: ['galleta', 'cookie', 'panaderia', 'snack', 'dulce'],      grupo: 'Comida' },
  { name: 'Sandwich',       label: 'Sandwich',     tags: ['sandwich', 'snack', 'comida', 'rapida'],                 grupo: 'Comida' },
  { name: 'Soup',           label: 'Sopa',         tags: ['sopa', 'comida', 'caldo'],                               grupo: 'Comida' },
  { name: 'Cake',           label: 'Torta',        tags: ['torta', 'cumple', 'panaderia', 'postre', 'dulce'],       grupo: 'Comida' },
  { name: 'Apple',          label: 'Frutas',       tags: ['fruta', 'manzana', 'verduleria', 'sano'],                grupo: 'Comida' },
  { name: 'ChefHat',        label: 'Cocina',       tags: ['cocina', 'chef', 'cocinar', 'gourmet'],                  grupo: 'Comida' },

  // ── Casa ──────────────────────────────────────────────────────────────────
  { name: 'Home',           label: 'Hogar',        tags: ['hogar', 'casa', 'vivienda', 'inmueble'],                 grupo: 'Casa' },
  { name: 'Bed',            label: 'Dormitorio',   tags: ['cama', 'dormitorio', 'mueble', 'cuarto'],                grupo: 'Casa' },
  { name: 'Sofa',           label: 'Mueble',       tags: ['sofa', 'mueble', 'living', 'comodidad'],                 grupo: 'Casa' },
  { name: 'Lamp',           label: 'Lámpara',      tags: ['lampara', 'luz', 'iluminacion', 'decoracion'],           grupo: 'Casa' },
  { name: 'Bath',           label: 'Baño',         tags: ['bano', 'ducha', 'higiene'],                              grupo: 'Casa' },
  { name: 'Refrigerator',   label: 'Heladera',     tags: ['heladera', 'electrodomestico', 'cocina'],                grupo: 'Casa' },
  { name: 'Hammer',         label: 'Herramientas', tags: ['martillo', 'reparacion', 'herramienta', 'mantenimiento'],grupo: 'Casa' },
  { name: 'Key',            label: 'Alquiler',     tags: ['alquiler', 'llave', 'inquilino', 'vivienda'],            grupo: 'Casa' },

  // ── Transporte ────────────────────────────────────────────────────────────
  { name: 'Car',            label: 'Auto',         tags: ['auto', 'vehiculo', 'carro', 'transporte'],               grupo: 'Transporte' },
  { name: 'Bus',            label: 'Colectivo',    tags: ['colectivo', 'bondi', 'bus', 'transporte', 'publico'],    grupo: 'Transporte' },
  { name: 'TrainFront',     label: 'Tren',         tags: ['tren', 'subte', 'ferrocarril', 'transporte'],            grupo: 'Transporte' },
  { name: 'Bike',           label: 'Bici',         tags: ['bici', 'bicicleta', 'transporte', 'ciclismo'],           grupo: 'Transporte' },
  { name: 'Plane',          label: 'Avión',        tags: ['avion', 'vuelo', 'viaje', 'aerolinea'],                  grupo: 'Transporte' },
  { name: 'Fuel',           label: 'Combustible',  tags: ['nafta', 'combustible', 'gasolina', 'estacion', 'ypf'],   grupo: 'Transporte' },
  { name: 'ParkingCircle',  label: 'Estacionar',   tags: ['estacionamiento', 'parking', 'auto'],                    grupo: 'Transporte' },
  { name: 'Footprints',     label: 'Caminar',      tags: ['caminata', 'pies', 'movilidad', 'running'],              grupo: 'Transporte' },

  // ── Salud ─────────────────────────────────────────────────────────────────
  { name: 'Heart',          label: 'Corazón',      tags: ['corazon', 'salud', 'cardio', 'amor'],                    grupo: 'Salud' },
  { name: 'Pill',           label: 'Medicamento',  tags: ['pastilla', 'medicamento', 'remedio', 'farmacia'],        grupo: 'Salud' },
  { name: 'Stethoscope',    label: 'Médico',       tags: ['medico', 'doctor', 'consulta', 'estetoscopio'],          grupo: 'Salud' },
  { name: 'Cross',          label: 'Hospital',     tags: ['hospital', 'emergencia', 'clinica', 'cruz'],             grupo: 'Salud' },
  { name: 'Syringe',        label: 'Vacuna',       tags: ['vacuna', 'inyeccion', 'jeringa', 'enfermeria'],          grupo: 'Salud' },
  { name: 'Activity',       label: 'Latido',       tags: ['latido', 'salud', 'cardio', 'pulso'],                    grupo: 'Salud' },
  { name: 'Brain',          label: 'Mental',       tags: ['cerebro', 'mental', 'psicologia', 'terapia'],            grupo: 'Salud' },
  { name: 'Smile',          label: 'Dentista',     tags: ['diente', 'dentista', 'odontologo', 'sonrisa'],           grupo: 'Salud' },
  { name: 'Eye',            label: 'Oculista',     tags: ['ojo', 'oculista', 'oftalmologo', 'vista'],               grupo: 'Salud' },

  // ── Trabajo/Oficina ───────────────────────────────────────────────────────
  { name: 'Briefcase',      label: 'Trabajo',      tags: ['trabajo', 'oficina', 'maletin', 'freelance'],            grupo: 'Trabajo' },
  { name: 'Building2',      label: 'Empresa',      tags: ['empresa', 'edificio', 'corporativo', 'oficina'],         grupo: 'Trabajo' },
  { name: 'Laptop',         label: 'Notebook',     tags: ['notebook', 'computadora', 'laptop', 'trabajo'],          grupo: 'Trabajo' },
  { name: 'Monitor',        label: 'Pantalla',     tags: ['monitor', 'pantalla', 'computadora', 'oficina'],         grupo: 'Trabajo' },
  { name: 'Printer',        label: 'Impresora',    tags: ['impresora', 'oficina', 'imprimir'],                      grupo: 'Trabajo' },
  { name: 'Calculator',     label: 'Calculadora',  tags: ['calculadora', 'contabilidad', 'cuentas', 'matematica'],  grupo: 'Trabajo' },

  // ── Dinero ────────────────────────────────────────────────────────────────
  { name: 'Banknote',       label: 'Billete',      tags: ['billete', 'dinero', 'efectivo', 'cash', 'pesos'],        grupo: 'Dinero' },
  { name: 'Coins',          label: 'Monedas',      tags: ['monedas', 'cambio', 'ahorro', 'dinero'],                 grupo: 'Dinero' },
  { name: 'DollarSign',     label: 'Dólar',        tags: ['dolar', 'dinero', 'cambio', 'cotizacion', 'usd'],        grupo: 'Dinero' },
  { name: 'PiggyBank',      label: 'Alcancía',     tags: ['alcancia', 'ahorro', 'chancho', 'hucha'],                grupo: 'Dinero' },
  { name: 'TrendingUp',     label: 'Inversión',    tags: ['inversion', 'crecimiento', 'rentabilidad', 'subida'],    grupo: 'Dinero' },
  { name: 'TrendingDown',   label: 'Pérdida',      tags: ['perdida', 'caida', 'baja', 'mercado'],                   grupo: 'Dinero' },
  { name: 'CreditCard',     label: 'Tarjeta',      tags: ['tarjeta', 'credito', 'visa', 'mastercard', 'debito'],    grupo: 'Dinero' },
  { name: 'Wallet',         label: 'Billetera',    tags: ['billetera', 'wallet', 'dinero'],                         grupo: 'Dinero' },

  // ── Educación ─────────────────────────────────────────────────────────────
  { name: 'GraduationCap',  label: 'Graduación',   tags: ['graduacion', 'universidad', 'titulo', 'estudios'],       grupo: 'Educación' },
  { name: 'BookOpen',       label: 'Libro',        tags: ['libro', 'lectura', 'estudio', 'leer'],                   grupo: 'Educación' },
  { name: 'School',         label: 'Escuela',      tags: ['escuela', 'colegio', 'primaria', 'secundaria'],          grupo: 'Educación' },
  { name: 'Pencil',         label: 'Lápiz',        tags: ['lapiz', 'escritura', 'utiles', 'dibujo'],                grupo: 'Educación' },
  { name: 'Backpack',       label: 'Mochila',      tags: ['mochila', 'escuela', 'estudiante'],                      grupo: 'Educación' },
  { name: 'Languages',      label: 'Idiomas',      tags: ['idioma', 'lenguaje', 'ingles', 'curso'],                 grupo: 'Educación' },

  // ── Entretenimiento ───────────────────────────────────────────────────────
  { name: 'Film',           label: 'Cine',         tags: ['cine', 'pelicula', 'film', 'cinema'],                    grupo: 'Entretenimiento' },
  { name: 'Music',          label: 'Música',       tags: ['musica', 'audio', 'spotify', 'cancion'],                 grupo: 'Entretenimiento' },
  { name: 'Gamepad2',       label: 'Videojuegos',  tags: ['juego', 'videojuego', 'gaming', 'consola'],              grupo: 'Entretenimiento' },
  { name: 'Tv',             label: 'Streaming',    tags: ['tv', 'television', 'streaming', 'netflix'],              grupo: 'Entretenimiento' },
  { name: 'Ticket',         label: 'Entradas',     tags: ['entrada', 'recital', 'evento', 'show', 'ticket'],        grupo: 'Entretenimiento' },
  { name: 'Mic',            label: 'Karaoke',      tags: ['karaoke', 'microfono', 'podcast', 'canto'],              grupo: 'Entretenimiento' },
  { name: 'Camera',         label: 'Foto',         tags: ['foto', 'camara', 'fotografia'],                          grupo: 'Entretenimiento' },
  { name: 'Headphones',     label: 'Auriculares',  tags: ['auriculares', 'musica', 'podcast', 'cascos'],            grupo: 'Entretenimiento' },

  // ── Deporte ───────────────────────────────────────────────────────────────
  { name: 'Dumbbell',       label: 'Gimnasio',     tags: ['gimnasio', 'pesas', 'gym', 'musculo'],                   grupo: 'Deporte' },
  { name: 'Trophy',         label: 'Trofeo',       tags: ['trofeo', 'premio', 'ganador'],                           grupo: 'Deporte' },
  { name: 'Volleyball',     label: 'Pelota',       tags: ['pelota', 'voley', 'futbol', 'deporte'],                  grupo: 'Deporte' },
  { name: 'BicepsFlexed',   label: 'Músculo',      tags: ['musculo', 'fitness', 'fuerza', 'gym'],                   grupo: 'Deporte' },
  { name: 'Mountain',       label: 'Trekking',     tags: ['montana', 'trekking', 'escalada', 'aventura'],           grupo: 'Deporte' },

  // ── Mascotas ──────────────────────────────────────────────────────────────
  { name: 'Dog',            label: 'Perro',        tags: ['perro', 'mascota', 'can', 'cachorro'],                   grupo: 'Mascotas' },
  { name: 'Cat',            label: 'Gato',         tags: ['gato', 'mascota', 'felino'],                             grupo: 'Mascotas' },
  { name: 'Bird',           label: 'Pájaro',       tags: ['pajaro', 'ave', 'mascota'],                              grupo: 'Mascotas' },
  { name: 'Fish',           label: 'Pez',          tags: ['pez', 'pescado', 'acuario'],                             grupo: 'Mascotas' },
  { name: 'Bone',           label: 'Alimento',     tags: ['hueso', 'comida', 'mascota', 'alimento'],                grupo: 'Mascotas' },
  { name: 'PawPrint',       label: 'Veterinaria',  tags: ['huella', 'mascota', 'veterinaria', 'pata'],              grupo: 'Mascotas' },

  // ── Servicios ─────────────────────────────────────────────────────────────
  { name: 'Zap',            label: 'Electricidad', tags: ['electricidad', 'energia', 'luz', 'edenor', 'edesur'],    grupo: 'Servicios' },
  { name: 'Wifi',           label: 'Internet',     tags: ['internet', 'wifi', 'conexion', 'fibra'],                 grupo: 'Servicios' },
  { name: 'Smartphone',     label: 'Celular',      tags: ['celular', 'telefono', 'movil', 'phone'],                 grupo: 'Servicios' },
  { name: 'Phone',          label: 'Teléfono',     tags: ['telefono', 'fijo', 'llamada'],                           grupo: 'Servicios' },
  { name: 'Mail',           label: 'Correo',       tags: ['mail', 'correo', 'email', 'carta'],                      grupo: 'Servicios' },
  { name: 'Wrench',         label: 'Plomero',      tags: ['plomero', 'reparacion', 'herramienta', 'arreglo'],       grupo: 'Servicios' },
  { name: 'Droplet',        label: 'Agua',         tags: ['agua', 'plomeria', 'gota', 'aysa'],                      grupo: 'Servicios' },
  { name: 'Flame',          label: 'Gas',          tags: ['gas', 'fuego', 'metrogas', 'cocina'],                    grupo: 'Servicios' },
  { name: 'Trash2',         label: 'Basura',       tags: ['basura', 'residuos', 'limpieza', 'tacho'],               grupo: 'Servicios' },

  // ── Belleza/Personal ──────────────────────────────────────────────────────
  { name: 'Scissors',       label: 'Peluquería',   tags: ['peluqueria', 'corte', 'pelo', 'tijera'],                 grupo: 'Belleza' },
  { name: 'Sparkles',       label: 'Belleza',      tags: ['belleza', 'brillo', 'estetica', 'spa'],                  grupo: 'Belleza' },
  { name: 'Shirt',          label: 'Indumentaria', tags: ['ropa', 'indumentaria', 'remera', 'camisa'],              grupo: 'Belleza' },
  { name: 'Glasses',        label: 'Anteojos',     tags: ['lentes', 'anteojos', 'oculista', 'gafas'],               grupo: 'Belleza' },
  { name: 'Watch',          label: 'Reloj',        tags: ['reloj', 'accesorio', 'tiempo'],                          grupo: 'Belleza' },

  // ── Viajes ────────────────────────────────────────────────────────────────
  { name: 'Globe',          label: 'Mundo',        tags: ['mundo', 'viaje', 'internacional', 'globo'],              grupo: 'Viajes' },
  { name: 'Map',            label: 'Mapa',         tags: ['mapa', 'ubicacion', 'viaje', 'ruta'],                    grupo: 'Viajes' },
  { name: 'Compass',        label: 'Brújula',      tags: ['brujula', 'navegacion', 'aventura'],                     grupo: 'Viajes' },
  { name: 'Tent',           label: 'Camping',      tags: ['camping', 'carpa', 'acampar', 'aventura'],               grupo: 'Viajes' },
  { name: 'Palmtree',       label: 'Playa',        tags: ['playa', 'vacaciones', 'tropical', 'verano'],             grupo: 'Viajes' },
  { name: 'Hotel',          label: 'Hotel',        tags: ['hotel', 'hospedaje', 'alojamiento', 'turismo'],          grupo: 'Viajes' },

  // ── Documentos/Bancos ─────────────────────────────────────────────────────
  { name: 'FileText',       label: 'Documento',    tags: ['documento', 'papel', 'archivo'],                         grupo: 'Documentos' },
  { name: 'Landmark',       label: 'Banco',        tags: ['banco', 'gobierno', 'institucion', 'oficial'],           grupo: 'Documentos' },
  { name: 'Scale',          label: 'Impuestos',    tags: ['impuestos', 'justicia', 'afip', 'monotributo', 'abogado'],grupo: 'Documentos' },
  { name: 'ScrollText',     label: 'Contrato',     tags: ['contrato', 'escritura', 'legal', 'acuerdo'],             grupo: 'Documentos' },
  { name: 'Stamp',          label: 'Sello',        tags: ['sello', 'oficial', 'certificado'],                       grupo: 'Documentos' },
  { name: 'Newspaper',      label: 'Diario',       tags: ['diario', 'periodico', 'noticia', 'prensa'],              grupo: 'Documentos' },

  // ── Familia/Personas ──────────────────────────────────────────────────────
  { name: 'Baby',           label: 'Bebé',         tags: ['bebe', 'hijo', 'recien', 'nacido'],                      grupo: 'Familia' },
  { name: 'Users',          label: 'Grupo',        tags: ['grupo', 'personas', 'equipo', 'familia'],                grupo: 'Familia' },
  { name: 'User',           label: 'Persona',      tags: ['persona', 'perfil', 'individuo'],                        grupo: 'Familia' },
  { name: 'Calendar',       label: 'Evento',       tags: ['evento', 'fecha', 'agenda', 'cumple'],                   grupo: 'Familia' },
  { name: 'PartyPopper',    label: 'Fiesta',       tags: ['fiesta', 'celebracion', 'cumple', 'festejo'],            grupo: 'Familia' },
]

// Set de nombres válidos para validación rápida
export const ICONOS_NAMES_SET = new Set(ICONOS_CATEGORIAS.map(i => i.name))
