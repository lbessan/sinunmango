// ─── Iconos de categorías — curados de lucide-react ─────────────────────────
//
// Sistema local de iconos (sin URLs externas). Cada entrada tiene:
//   - name:  PascalCase del icono en lucide-react (el "nombre técnico")
//   - label: español, lo que el user ve
//   - tags:  array de palabras clave en español, para el buscador del picker
//   - grupo: agrupación visual en el picker
//
// El componente <IconoCategoria> renderiza el icono Lucide directo. Soporta
// fallback a emoji si el valor guardado no matchea ningún Lucide.
//
// Cómo agregar uno nuevo:
//   1. Buscá el icono en https://lucide.dev/icons/
//   2. Agregá una entrada con su nombre PascalCase exacto
//   3. Listo — el picker lo levanta automático.

export type IconoDef = {
  name:  string    // PascalCase Lucide
  label: string    // español
  tags:  string[]  // palabras clave búsqueda (lowercase, sin tildes)
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
  { name: 'ShoppingBasket', label: 'Canasta',      tags: ['canasta', 'cesta', 'compras', 'super'],                  grupo: 'Compras' },
  { name: 'Package',       label: 'Paquete',       tags: ['paquete', 'envio', 'caja', 'delivery'],                  grupo: 'Compras' },
  { name: 'PackageOpen',   label: 'Paquete abierto', tags: ['paquete', 'abierto', 'recibido', 'envio'],             grupo: 'Compras' },
  { name: 'Truck',         label: 'Delivery',      tags: ['delivery', 'envio', 'camion', 'reparto'],                grupo: 'Compras' },
  { name: 'Receipt',       label: 'Recibo',        tags: ['recibo', 'ticket', 'factura', 'comprobante'],            grupo: 'Compras' },
  { name: 'Tag',           label: 'Etiqueta',      tags: ['etiqueta', 'precio', 'oferta', 'descuento'],             grupo: 'Compras' },
  { name: 'Tags',          label: 'Etiquetas',     tags: ['etiquetas', 'tags', 'precios'],                          grupo: 'Compras' },
  { name: 'BadgePercent',  label: 'Descuento',     tags: ['descuento', 'oferta', 'rebaja', 'promo'],                grupo: 'Compras' },
  { name: 'Gift',          label: 'Regalo',        tags: ['regalo', 'presente', 'cumple', 'navidad'],               grupo: 'Compras' },
  { name: 'Store',         label: 'Tienda',        tags: ['tienda', 'comercio', 'negocio', 'local'],                grupo: 'Compras' },
  { name: 'HandCoins',     label: 'Pago',          tags: ['pago', 'efectivo', 'mano', 'dinero'],                    grupo: 'Compras' },

  // ── Comida ────────────────────────────────────────────────────────────────
  { name: 'UtensilsCrossed', label: 'Restaurante', tags: ['restaurante', 'comida', 'cubiertos', 'cena', 'almuerzo'], grupo: 'Comida' },
  { name: 'Utensils',      label: 'Cubiertos',     tags: ['cubiertos', 'comida', 'tenedor', 'cuchillo'],            grupo: 'Comida' },
  { name: 'Pizza',         label: 'Pizza',         tags: ['pizza', 'pizzeria', 'italiana', 'comida'],               grupo: 'Comida' },
  { name: 'Coffee',         label: 'Café',         tags: ['cafe', 'desayuno', 'merienda', 'bar'],                   grupo: 'Comida' },
  { name: 'Beer',           label: 'Cerveza',      tags: ['cerveza', 'bar', 'salida', 'birra', 'alcohol'],          grupo: 'Comida' },
  { name: 'Wine',           label: 'Vino',         tags: ['vino', 'bar', 'salida', 'restaurant', 'alcohol'],        grupo: 'Comida' },
  { name: 'IceCream',       label: 'Helado',       tags: ['helado', 'postre', 'heladeria'],                         grupo: 'Comida' },
  { name: 'IceCreamCone',   label: 'Helado cono',  tags: ['helado', 'cucurucho', 'cono', 'postre'],                 grupo: 'Comida' },
  { name: 'Cookie',         label: 'Galletita',    tags: ['galleta', 'cookie', 'panaderia', 'snack', 'dulce'],      grupo: 'Comida' },
  { name: 'Sandwich',       label: 'Sandwich',     tags: ['sandwich', 'snack', 'comida', 'rapida'],                 grupo: 'Comida' },
  { name: 'Soup',           label: 'Sopa',         tags: ['sopa', 'comida', 'caldo'],                               grupo: 'Comida' },
  { name: 'Salad',          label: 'Ensalada',     tags: ['ensalada', 'vegetariano', 'verde', 'sano'],              grupo: 'Comida' },
  { name: 'Cake',           label: 'Torta',        tags: ['torta', 'cumple', 'panaderia', 'postre', 'dulce'],       grupo: 'Comida' },
  { name: 'CakeSlice',      label: 'Porción torta', tags: ['porcion', 'torta', 'pastel'],                           grupo: 'Comida' },
  { name: 'Donut',          label: 'Dona',         tags: ['dona', 'donut', 'snack', 'dulce'],                       grupo: 'Comida' },
  { name: 'Popcorn',        label: 'Pochoclo',     tags: ['pochoclo', 'palomitas', 'cine', 'snack'],                grupo: 'Comida' },
  { name: 'Lollipop',       label: 'Caramelo',     tags: ['caramelo', 'golosina', 'chupetin', 'dulce'],             grupo: 'Comida' },
  { name: 'Apple',          label: 'Manzana',      tags: ['manzana', 'fruta', 'verduleria', 'sano'],                grupo: 'Comida' },
  { name: 'Banana',         label: 'Banana',       tags: ['banana', 'fruta', 'verduleria'],                         grupo: 'Comida' },
  { name: 'Cherry',         label: 'Cereza',       tags: ['cereza', 'fruta', 'verduleria'],                         grupo: 'Comida' },
  { name: 'Grape',          label: 'Uvas',         tags: ['uvas', 'fruta', 'verduleria'],                           grupo: 'Comida' },
  { name: 'Carrot',         label: 'Zanahoria',    tags: ['zanahoria', 'verdura', 'verduleria'],                    grupo: 'Comida' },
  { name: 'Egg',            label: 'Huevos',       tags: ['huevo', 'huevos', 'desayuno', 'almacen'],                grupo: 'Comida' },
  { name: 'EggFried',       label: 'Huevo frito',  tags: ['huevo', 'frito', 'desayuno', 'cocina'],                  grupo: 'Comida' },
  { name: 'Milk',           label: 'Lácteos',      tags: ['leche', 'lacteos', 'desayuno', 'almacen'],               grupo: 'Comida' },
  { name: 'Croissant',      label: 'Panadería',    tags: ['croissant', 'medialuna', 'panaderia', 'desayuno'],       grupo: 'Comida' },
  { name: 'Drumstick',      label: 'Pollo',        tags: ['pollo', 'carne', 'cena', 'almuerzo'],                    grupo: 'Comida' },
  { name: 'Wheat',          label: 'Cereales',     tags: ['cereal', 'trigo', 'almacen', 'pan'],                     grupo: 'Comida' },
  { name: 'ChefHat',        label: 'Cocina',       tags: ['cocina', 'chef', 'cocinar', 'gourmet'],                  grupo: 'Comida' },

  // ── Casa ──────────────────────────────────────────────────────────────────
  { name: 'Home',           label: 'Hogar',        tags: ['hogar', 'casa', 'vivienda', 'inmueble'],                 grupo: 'Casa' },
  { name: 'HousePlus',      label: 'Mudanza',      tags: ['mudanza', 'casa', 'cambio', 'nueva'],                    grupo: 'Casa' },
  { name: 'Bed',            label: 'Cama',         tags: ['cama', 'dormitorio', 'mueble', 'cuarto'],                grupo: 'Casa' },
  { name: 'BedDouble',      label: 'Cama doble',   tags: ['cama', 'doble', 'matrimonial', 'dormitorio'],            grupo: 'Casa' },
  { name: 'Sofa',           label: 'Sillón',       tags: ['sofa', 'sillon', 'mueble', 'living'],                    grupo: 'Casa' },
  { name: 'Armchair',       label: 'Sillón individual', tags: ['sillon', 'individual', 'mueble', 'living'],         grupo: 'Casa' },
  { name: 'Lamp',           label: 'Lámpara',      tags: ['lampara', 'luz', 'iluminacion', 'decoracion'],           grupo: 'Casa' },
  { name: 'Lightbulb',      label: 'Bombilla',     tags: ['bombilla', 'foco', 'luz', 'electricidad', 'idea'],       grupo: 'Casa' },
  { name: 'Bath',           label: 'Bañera',       tags: ['banera', 'bano', 'ducha', 'higiene'],                    grupo: 'Casa' },
  { name: 'ShowerHead',     label: 'Ducha',        tags: ['ducha', 'bano', 'agua', 'higiene'],                      grupo: 'Casa' },
  { name: 'Toilet',         label: 'Inodoro',      tags: ['inodoro', 'bano', 'wc'],                                 grupo: 'Casa' },
  { name: 'Refrigerator',   label: 'Heladera',     tags: ['heladera', 'electrodomestico', 'cocina'],                grupo: 'Casa' },
  { name: 'Microwave',      label: 'Microondas',   tags: ['microondas', 'cocina', 'electrodomestico'],              grupo: 'Casa' },
  { name: 'WashingMachine', label: 'Lavarropas',   tags: ['lavarropas', 'lavadora', 'ropa', 'electrodomestico'],    grupo: 'Casa' },
  { name: 'Hammer',         label: 'Herramienta',  tags: ['martillo', 'reparacion', 'herramienta', 'mantenimiento'],grupo: 'Casa' },
  { name: 'Key',            label: 'Llave',        tags: ['alquiler', 'llave', 'inquilino', 'vivienda'],            grupo: 'Casa' },
  { name: 'DoorClosed',     label: 'Puerta',       tags: ['puerta', 'expensas', 'entrada'],                         grupo: 'Casa' },
  { name: 'DoorOpen',       label: 'Salida',       tags: ['puerta', 'abierta', 'salida'],                           grupo: 'Casa' },
  { name: 'Curtains',       label: 'Cortinas',     tags: ['cortinas', 'decoracion', 'ventana'],                     grupo: 'Casa' },
  { name: 'Plug',           label: 'Enchufe',      tags: ['enchufe', 'electricidad', 'corriente'],                  grupo: 'Casa' },

  // ── Transporte ────────────────────────────────────────────────────────────
  { name: 'Car',            label: 'Auto',         tags: ['auto', 'vehiculo', 'carro', 'transporte'],               grupo: 'Transporte' },
  { name: 'CarFront',       label: 'Auto frente',  tags: ['auto', 'frente', 'vehiculo'],                            grupo: 'Transporte' },
  { name: 'Bus',            label: 'Colectivo',    tags: ['colectivo', 'bondi', 'bus', 'transporte', 'publico'],    grupo: 'Transporte' },
  { name: 'BusFront',       label: 'Colectivo frente', tags: ['colectivo', 'bus', 'frente'],                        grupo: 'Transporte' },
  { name: 'TrainFront',     label: 'Tren',         tags: ['tren', 'subte', 'ferrocarril', 'transporte'],            grupo: 'Transporte' },
  { name: 'TramFront',      label: 'Subte',        tags: ['subte', 'tranvia', 'metro'],                             grupo: 'Transporte' },
  { name: 'Bike',           label: 'Bici',         tags: ['bici', 'bicicleta', 'transporte', 'ciclismo'],           grupo: 'Transporte' },
  { name: 'Plane',          label: 'Avión',        tags: ['avion', 'vuelo', 'viaje', 'aerolinea'],                  grupo: 'Transporte' },
  { name: 'Ship',           label: 'Barco',        tags: ['barco', 'navegacion', 'mar', 'crucero'],                 grupo: 'Transporte' },
  { name: 'Sailboat',       label: 'Velero',       tags: ['velero', 'barco', 'navegacion', 'mar'],                  grupo: 'Transporte' },
  { name: 'Anchor',         label: 'Ancla',        tags: ['ancla', 'puerto', 'navegacion'],                         grupo: 'Transporte' },
  { name: 'Fuel',           label: 'Combustible',  tags: ['nafta', 'combustible', 'gasolina', 'estacion', 'ypf'],   grupo: 'Transporte' },
  { name: 'ParkingCircle',  label: 'Estacionar',   tags: ['estacionamiento', 'parking', 'auto'],                    grupo: 'Transporte' },
  { name: 'ParkingSquare',  label: 'Cochera',      tags: ['cochera', 'estacionamiento', 'parking'],                 grupo: 'Transporte' },
  { name: 'Footprints',     label: 'Caminar',      tags: ['caminata', 'pies', 'movilidad', 'running'],              grupo: 'Transporte' },

  // ── Salud ─────────────────────────────────────────────────────────────────
  { name: 'Heart',          label: 'Corazón',      tags: ['corazon', 'salud', 'cardio', 'amor'],                    grupo: 'Salud' },
  { name: 'HeartPulse',     label: 'Pulso',        tags: ['pulso', 'cardio', 'corazon', 'latido'],                  grupo: 'Salud' },
  { name: 'Pill',           label: 'Medicamento',  tags: ['pastilla', 'medicamento', 'remedio', 'farmacia'],        grupo: 'Salud' },
  { name: 'Stethoscope',    label: 'Médico',       tags: ['medico', 'doctor', 'consulta', 'estetoscopio'],          grupo: 'Salud' },
  { name: 'Cross',          label: 'Hospital',     tags: ['hospital', 'emergencia', 'clinica', 'cruz'],             grupo: 'Salud' },
  { name: 'Hospital',       label: 'Clínica',      tags: ['hospital', 'clinica', 'sanatorio'],                      grupo: 'Salud' },
  { name: 'Ambulance',      label: 'Ambulancia',   tags: ['ambulancia', 'emergencia', 'urgencia'],                  grupo: 'Salud' },
  { name: 'Syringe',        label: 'Vacuna',       tags: ['vacuna', 'inyeccion', 'jeringa', 'enfermeria'],          grupo: 'Salud' },
  { name: 'Activity',       label: 'Latido',       tags: ['latido', 'salud', 'cardio', 'pulso'],                    grupo: 'Salud' },
  { name: 'Brain',          label: 'Mental',       tags: ['cerebro', 'mental', 'psicologia', 'terapia'],            grupo: 'Salud' },
  { name: 'Smile',          label: 'Dentista',     tags: ['diente', 'dentista', 'odontologo', 'sonrisa'],           grupo: 'Salud' },
  { name: 'Eye',            label: 'Oculista',     tags: ['ojo', 'oculista', 'oftalmologo', 'vista'],               grupo: 'Salud' },
  { name: 'Thermometer',    label: 'Termómetro',   tags: ['termometro', 'fiebre', 'temperatura'],                   grupo: 'Salud' },
  { name: 'Bandage',        label: 'Vendaje',      tags: ['vendaje', 'curita', 'herida', 'primeros auxilios'],      grupo: 'Salud' },
  { name: 'Microscope',     label: 'Análisis',     tags: ['microscopio', 'laboratorio', 'analisis'],                grupo: 'Salud' },
  { name: 'TestTube',       label: 'Laboratorio',  tags: ['laboratorio', 'tubo', 'analisis'],                       grupo: 'Salud' },

  // ── Trabajo/Oficina ───────────────────────────────────────────────────────
  { name: 'Briefcase',      label: 'Trabajo',      tags: ['trabajo', 'oficina', 'maletin', 'freelance'],            grupo: 'Trabajo' },
  { name: 'BriefcaseBusiness', label: 'Negocio',   tags: ['negocio', 'trabajo', 'business', 'oficina'],             grupo: 'Trabajo' },
  { name: 'Building',       label: 'Edificio',     tags: ['edificio', 'oficina', 'inmueble'],                       grupo: 'Trabajo' },
  { name: 'Building2',      label: 'Empresa',      tags: ['empresa', 'edificio', 'corporativo', 'oficina'],         grupo: 'Trabajo' },
  { name: 'Factory',        label: 'Fábrica',      tags: ['fabrica', 'industria', 'empresa'],                       grupo: 'Trabajo' },
  { name: 'Laptop',         label: 'Notebook',     tags: ['notebook', 'computadora', 'laptop', 'trabajo'],          grupo: 'Trabajo' },
  { name: 'Monitor',        label: 'Pantalla',     tags: ['monitor', 'pantalla', 'computadora', 'oficina'],         grupo: 'Trabajo' },
  { name: 'Printer',        label: 'Impresora',    tags: ['impresora', 'oficina', 'imprimir'],                      grupo: 'Trabajo' },
  { name: 'Calculator',     label: 'Calculadora',  tags: ['calculadora', 'contabilidad', 'cuentas', 'matematica'],  grupo: 'Trabajo' },
  { name: 'ClipboardList',  label: 'Planilla',     tags: ['planilla', 'lista', 'tareas', 'checklist'],              grupo: 'Trabajo' },
  { name: 'HardHat',        label: 'Construcción', tags: ['construccion', 'obra', 'casco', 'albanil'],              grupo: 'Trabajo' },
  { name: 'Drill',          label: 'Taladro',      tags: ['taladro', 'construccion', 'herramienta'],                grupo: 'Trabajo' },
  { name: 'Folder',         label: 'Carpeta',      tags: ['carpeta', 'archivo', 'documento'],                       grupo: 'Trabajo' },

  // ── Dinero ────────────────────────────────────────────────────────────────
  { name: 'Banknote',       label: 'Billete',      tags: ['billete', 'dinero', 'efectivo', 'cash', 'pesos'],        grupo: 'Dinero' },
  { name: 'Coins',          label: 'Monedas',      tags: ['monedas', 'cambio', 'ahorro', 'dinero'],                 grupo: 'Dinero' },
  { name: 'DollarSign',     label: 'Dólar',        tags: ['dolar', 'dinero', 'cambio', 'cotizacion', 'usd'],        grupo: 'Dinero' },
  { name: 'CircleDollarSign', label: 'Moneda dólar', tags: ['dolar', 'moneda', 'usd', 'cambio'],                    grupo: 'Dinero' },
  { name: 'PiggyBank',      label: 'Alcancía',     tags: ['alcancia', 'ahorro', 'chancho', 'hucha'],                grupo: 'Dinero' },
  { name: 'TrendingUp',     label: 'Inversión',    tags: ['inversion', 'crecimiento', 'rentabilidad', 'subida'],    grupo: 'Dinero' },
  { name: 'TrendingDown',   label: 'Pérdida',      tags: ['perdida', 'caida', 'baja', 'mercado'],                   grupo: 'Dinero' },
  { name: 'CreditCard',     label: 'Tarjeta',      tags: ['tarjeta', 'credito', 'visa', 'mastercard', 'debito'],    grupo: 'Dinero' },
  { name: 'Wallet',         label: 'Billetera',    tags: ['billetera', 'wallet', 'dinero'],                         grupo: 'Dinero' },
  { name: 'Vault',          label: 'Caja fuerte',  tags: ['caja', 'fuerte', 'banco', 'ahorro', 'seguridad'],        grupo: 'Dinero' },
  { name: 'LineChart',      label: 'Gráfico',      tags: ['grafico', 'analisis', 'tendencia'],                      grupo: 'Dinero' },
  { name: 'BarChart3',      label: 'Barras',       tags: ['barras', 'grafico', 'estadistica'],                      grupo: 'Dinero' },
  { name: 'PieChart',       label: 'Torta',        tags: ['torta', 'grafico', 'porcentaje'],                        grupo: 'Dinero' },
  { name: 'ArrowLeftRight', label: 'Transferencia', tags: ['transferencia', 'transfer', 'cambio'],                  grupo: 'Dinero' },
  { name: 'ArrowDownLeft',  label: 'Recibido',     tags: ['recibido', 'ingreso', 'cobro'],                          grupo: 'Dinero' },
  { name: 'ArrowUpRight',   label: 'Enviado',      tags: ['enviado', 'gasto', 'pago'],                              grupo: 'Dinero' },

  // ── Educación ─────────────────────────────────────────────────────────────
  { name: 'GraduationCap',  label: 'Graduación',   tags: ['graduacion', 'universidad', 'titulo', 'estudios'],       grupo: 'Educación' },
  { name: 'BookOpen',       label: 'Libro',        tags: ['libro', 'lectura', 'estudio', 'leer'],                   grupo: 'Educación' },
  { name: 'Book',           label: 'Libro cerrado', tags: ['libro', 'biblioteca', 'lectura'],                       grupo: 'Educación' },
  { name: 'BookMarked',     label: 'Favorito',     tags: ['libro', 'marcado', 'favorito'],                          grupo: 'Educación' },
  { name: 'BookOpenCheck',  label: 'Completado',   tags: ['libro', 'check', 'completado', 'aprobado'],              grupo: 'Educación' },
  { name: 'Library',        label: 'Biblioteca',   tags: ['biblioteca', 'libros', 'estudio'],                       grupo: 'Educación' },
  { name: 'Notebook',       label: 'Cuaderno',     tags: ['cuaderno', 'apuntes', 'escuela'],                        grupo: 'Educación' },
  { name: 'School',         label: 'Escuela',      tags: ['escuela', 'colegio', 'primaria', 'secundaria'],          grupo: 'Educación' },
  { name: 'Pencil',         label: 'Lápiz',        tags: ['lapiz', 'escritura', 'utiles', 'dibujo'],                grupo: 'Educación' },
  { name: 'PenTool',        label: 'Pluma',        tags: ['pluma', 'escritura', 'arte', 'diseno'],                  grupo: 'Educación' },
  { name: 'Backpack',       label: 'Mochila',      tags: ['mochila', 'escuela', 'estudiante'],                      grupo: 'Educación' },
  { name: 'Languages',      label: 'Idiomas',      tags: ['idioma', 'lenguaje', 'ingles', 'curso'],                 grupo: 'Educación' },
  { name: 'Award',          label: 'Premio',       tags: ['premio', 'logro', 'medalla'],                            grupo: 'Educación' },
  { name: 'BadgeCheck',     label: 'Certificado',  tags: ['certificado', 'verificado', 'aprobado'],                 grupo: 'Educación' },

  // ── Entretenimiento ───────────────────────────────────────────────────────
  { name: 'Film',           label: 'Cine',         tags: ['cine', 'pelicula', 'film', 'cinema'],                    grupo: 'Entretenimiento' },
  { name: 'Music',          label: 'Música',       tags: ['musica', 'audio', 'spotify', 'cancion'],                 grupo: 'Entretenimiento' },
  { name: 'Music2',         label: 'Nota musical', tags: ['nota', 'musical', 'musica'],                             grupo: 'Entretenimiento' },
  { name: 'Disc3',          label: 'Disco',        tags: ['disco', 'vinilo', 'musica', 'cd'],                       grupo: 'Entretenimiento' },
  { name: 'Radio',          label: 'Radio',        tags: ['radio', 'podcast', 'fm', 'am'],                          grupo: 'Entretenimiento' },
  { name: 'Speaker',        label: 'Parlante',     tags: ['parlante', 'audio', 'sonido', 'altavoz'],                grupo: 'Entretenimiento' },
  { name: 'Gamepad2',       label: 'Videojuegos',  tags: ['juego', 'videojuego', 'gaming', 'consola'],              grupo: 'Entretenimiento' },
  { name: 'Joystick',       label: 'Joystick',     tags: ['joystick', 'arcade', 'gaming'],                          grupo: 'Entretenimiento' },
  { name: 'Dices',          label: 'Dados',        tags: ['dados', 'juego', 'azar', 'mesa'],                        grupo: 'Entretenimiento' },
  { name: 'Tv',             label: 'TV',           tags: ['tv', 'television', 'streaming', 'netflix'],              grupo: 'Entretenimiento' },
  { name: 'Drama',          label: 'Teatro',       tags: ['teatro', 'mascara', 'drama', 'espectaculo'],             grupo: 'Entretenimiento' },
  { name: 'Ticket',         label: 'Entradas',     tags: ['entrada', 'recital', 'evento', 'show', 'ticket'],        grupo: 'Entretenimiento' },
  { name: 'Mic',            label: 'Karaoke',      tags: ['karaoke', 'microfono', 'podcast', 'canto'],              grupo: 'Entretenimiento' },
  { name: 'Mic2',           label: 'Micrófono',    tags: ['microfono', 'show', 'recital'],                          grupo: 'Entretenimiento' },
  { name: 'Camera',         label: 'Foto',         tags: ['foto', 'camara', 'fotografia'],                          grupo: 'Entretenimiento' },
  { name: 'Headphones',     label: 'Auriculares',  tags: ['auriculares', 'musica', 'podcast', 'cascos'],            grupo: 'Entretenimiento' },

  // ── Deporte ───────────────────────────────────────────────────────────────
  { name: 'Dumbbell',       label: 'Gimnasio',     tags: ['gimnasio', 'pesas', 'gym', 'musculo'],                   grupo: 'Deporte' },
  { name: 'Trophy',         label: 'Trofeo',       tags: ['trofeo', 'premio', 'ganador'],                           grupo: 'Deporte' },
  { name: 'Medal',          label: 'Medalla',      tags: ['medalla', 'premio', 'campeon'],                          grupo: 'Deporte' },
  { name: 'Volleyball',     label: 'Pelota',       tags: ['pelota', 'voley', 'futbol', 'deporte'],                  grupo: 'Deporte' },
  { name: 'BicepsFlexed',   label: 'Músculo',      tags: ['musculo', 'fitness', 'fuerza', 'gym'],                   grupo: 'Deporte' },
  { name: 'Mountain',       label: 'Trekking',     tags: ['montana', 'trekking', 'escalada', 'aventura'],           grupo: 'Deporte' },
  { name: 'Goal',           label: 'Gol',          tags: ['gol', 'arco', 'futbol'],                                 grupo: 'Deporte' },
  { name: 'Target',         label: 'Objetivo',     tags: ['objetivo', 'meta', 'tiro', 'arquería'],                  grupo: 'Deporte' },

  // ── Mascotas ──────────────────────────────────────────────────────────────
  { name: 'Dog',            label: 'Perro',        tags: ['perro', 'mascota', 'can', 'cachorro'],                   grupo: 'Mascotas' },
  { name: 'Cat',            label: 'Gato',         tags: ['gato', 'mascota', 'felino'],                             grupo: 'Mascotas' },
  { name: 'Bird',           label: 'Pájaro',       tags: ['pajaro', 'ave', 'mascota'],                              grupo: 'Mascotas' },
  { name: 'Fish',           label: 'Pez',          tags: ['pez', 'pescado', 'acuario'],                             grupo: 'Mascotas' },
  { name: 'Rabbit',         label: 'Conejo',       tags: ['conejo', 'mascota', 'rabbit'],                           grupo: 'Mascotas' },
  { name: 'Squirrel',       label: 'Ardilla',      tags: ['ardilla', 'roedor'],                                     grupo: 'Mascotas' },
  { name: 'Turtle',         label: 'Tortuga',      tags: ['tortuga', 'mascota', 'lenta'],                           grupo: 'Mascotas' },
  { name: 'Snail',          label: 'Caracol',      tags: ['caracol', 'lento'],                                      grupo: 'Mascotas' },
  { name: 'Bug',            label: 'Bicho',        tags: ['bicho', 'insecto', 'plaga'],                             grupo: 'Mascotas' },
  { name: 'Bone',           label: 'Hueso',        tags: ['hueso', 'comida', 'mascota', 'alimento'],                grupo: 'Mascotas' },
  { name: 'PawPrint',       label: 'Veterinaria',  tags: ['huella', 'mascota', 'veterinaria', 'pata'],              grupo: 'Mascotas' },

  // ── Servicios ─────────────────────────────────────────────────────────────
  { name: 'Zap',            label: 'Electricidad', tags: ['electricidad', 'energia', 'luz', 'edenor', 'edesur'],    grupo: 'Servicios' },
  { name: 'Battery',        label: 'Batería',      tags: ['bateria', 'energia', 'pila'],                            grupo: 'Servicios' },
  { name: 'BatteryCharging', label: 'Cargar',      tags: ['cargar', 'bateria', 'energia'],                          grupo: 'Servicios' },
  { name: 'Wifi',           label: 'Internet',     tags: ['internet', 'wifi', 'conexion', 'fibra'],                 grupo: 'Servicios' },
  { name: 'Cable',          label: 'Cable',        tags: ['cable', 'conexion', 'tv'],                               grupo: 'Servicios' },
  { name: 'Smartphone',     label: 'Celular',      tags: ['celular', 'telefono', 'movil', 'phone'],                 grupo: 'Servicios' },
  { name: 'Phone',          label: 'Teléfono',     tags: ['telefono', 'fijo', 'llamada'],                           grupo: 'Servicios' },
  { name: 'Mail',           label: 'Correo',       tags: ['mail', 'correo', 'email', 'carta'],                      grupo: 'Servicios' },
  { name: 'Mailbox',        label: 'Buzón',        tags: ['buzon', 'correo', 'carta'],                              grupo: 'Servicios' },
  { name: 'MessageSquare',  label: 'Mensaje',      tags: ['mensaje', 'sms', 'chat', 'whatsapp'],                    grupo: 'Servicios' },
  { name: 'Wrench',         label: 'Plomero',      tags: ['plomero', 'reparacion', 'herramienta', 'arreglo'],       grupo: 'Servicios' },
  { name: 'Droplet',        label: 'Agua',         tags: ['agua', 'plomeria', 'gota', 'aysa'],                      grupo: 'Servicios' },
  { name: 'Flame',          label: 'Gas',          tags: ['gas', 'fuego', 'metrogas', 'cocina'],                    grupo: 'Servicios' },
  { name: 'Trash2',         label: 'Basura',       tags: ['basura', 'residuos', 'limpieza', 'tacho'],               grupo: 'Servicios' },
  { name: 'Recycle',        label: 'Reciclaje',    tags: ['reciclaje', 'verde', 'eco'],                             grupo: 'Servicios' },
  { name: 'Construction',   label: 'Obra',         tags: ['obra', 'construccion', 'reforma'],                       grupo: 'Servicios' },

  // ── Belleza/Personal ──────────────────────────────────────────────────────
  { name: 'Scissors',       label: 'Peluquería',   tags: ['peluqueria', 'corte', 'pelo', 'tijera'],                 grupo: 'Belleza' },
  { name: 'Sparkles',       label: 'Belleza',      tags: ['belleza', 'brillo', 'estetica', 'spa'],                  grupo: 'Belleza' },
  { name: 'Brush',          label: 'Maquillaje',   tags: ['brocha', 'maquillaje', 'pincel'],                        grupo: 'Belleza' },
  { name: 'Palette',        label: 'Paleta',       tags: ['paleta', 'colores', 'maquillaje', 'arte'],               grupo: 'Belleza' },
  { name: 'Crown',          label: 'Corona',       tags: ['corona', 'premium', 'realeza', 'lujo'],                  grupo: 'Belleza' },
  { name: 'Star',           label: 'Estrella',     tags: ['estrella', 'premium', 'favorito'],                       grupo: 'Belleza' },
  { name: 'Diamond',        label: 'Diamante',     tags: ['diamante', 'joya', 'lujo', 'piedra'],                    grupo: 'Belleza' },
  { name: 'Gem',            label: 'Gema',         tags: ['gema', 'joya', 'piedra preciosa'],                       grupo: 'Belleza' },
  { name: 'Shirt',          label: 'Indumentaria', tags: ['ropa', 'indumentaria', 'remera', 'camisa'],              grupo: 'Belleza' },
  { name: 'Glasses',        label: 'Anteojos',     tags: ['lentes', 'anteojos', 'oculista', 'gafas'],               grupo: 'Belleza' },
  { name: 'Watch',          label: 'Reloj',        tags: ['reloj', 'accesorio', 'tiempo'],                          grupo: 'Belleza' },
  { name: 'Footprints',     label: 'Pies',         tags: ['pies', 'pedicura', 'movilidad'],                         grupo: 'Belleza' },

  // ── Viajes ────────────────────────────────────────────────────────────────
  { name: 'Globe',          label: 'Mundo',        tags: ['mundo', 'viaje', 'internacional', 'globo'],              grupo: 'Viajes' },
  { name: 'Map',            label: 'Mapa',         tags: ['mapa', 'ubicacion', 'viaje', 'ruta'],                    grupo: 'Viajes' },
  { name: 'MapPin',         label: 'Ubicación',    tags: ['ubicacion', 'pin', 'lugar', 'mapa'],                     grupo: 'Viajes' },
  { name: 'Compass',        label: 'Brújula',      tags: ['brujula', 'navegacion', 'aventura'],                     grupo: 'Viajes' },
  { name: 'Tent',           label: 'Camping',      tags: ['camping', 'carpa', 'acampar', 'aventura'],               grupo: 'Viajes' },
  { name: 'Hotel',          label: 'Hotel',        tags: ['hotel', 'hospedaje', 'alojamiento', 'turismo'],          grupo: 'Viajes' },
  { name: 'Luggage',        label: 'Equipaje',     tags: ['equipaje', 'valija', 'maleta', 'viaje'],                 grupo: 'Viajes' },
  { name: 'Sun',            label: 'Sol',          tags: ['sol', 'dia', 'verano', 'playa'],                         grupo: 'Viajes' },
  { name: 'Moon',           label: 'Luna',         tags: ['luna', 'noche', 'descanso'],                             grupo: 'Viajes' },
  { name: 'Cloud',          label: 'Nube',         tags: ['nube', 'clima', 'nublado'],                              grupo: 'Viajes' },
  { name: 'CloudRain',      label: 'Lluvia',       tags: ['lluvia', 'clima', 'agua'],                               grupo: 'Viajes' },
  { name: 'Snowflake',      label: 'Nieve',        tags: ['nieve', 'frio', 'invierno', 'ski'],                      grupo: 'Viajes' },
  { name: 'Umbrella',       label: 'Paraguas',     tags: ['paraguas', 'lluvia', 'protector'],                       grupo: 'Viajes' },

  // ── Documentos/Bancos ─────────────────────────────────────────────────────
  { name: 'FileText',       label: 'Documento',    tags: ['documento', 'papel', 'archivo'],                         grupo: 'Documentos' },
  { name: 'FileCheck',      label: 'Aprobado',     tags: ['archivo', 'check', 'aprobado'],                          grupo: 'Documentos' },
  { name: 'FileSignature',  label: 'Firma',        tags: ['firma', 'documento', 'contrato'],                        grupo: 'Documentos' },
  { name: 'Landmark',       label: 'Banco',        tags: ['banco', 'gobierno', 'institucion', 'oficial'],           grupo: 'Documentos' },
  { name: 'Scale',          label: 'Impuestos',    tags: ['impuestos', 'justicia', 'afip', 'monotributo', 'abogado'],grupo: 'Documentos' },
  { name: 'ScrollText',     label: 'Contrato',     tags: ['contrato', 'escritura', 'legal', 'acuerdo'],             grupo: 'Documentos' },
  { name: 'Stamp',          label: 'Sello',        tags: ['sello', 'oficial', 'certificado'],                       grupo: 'Documentos' },
  { name: 'Newspaper',      label: 'Diario',       tags: ['diario', 'periodico', 'noticia', 'prensa'],              grupo: 'Documentos' },
  { name: 'ClipboardCheck', label: 'Checklist',    tags: ['checklist', 'planilla', 'tareas', 'completado'],         grupo: 'Documentos' },
  { name: 'Shield',         label: 'Seguro',       tags: ['seguro', 'proteccion', 'escudo'],                        grupo: 'Documentos' },
  { name: 'ShieldCheck',    label: 'Verificado',   tags: ['verificado', 'seguridad', 'aprobado'],                   grupo: 'Documentos' },

  // ── Familia/Personas ──────────────────────────────────────────────────────
  { name: 'Baby',           label: 'Bebé',         tags: ['bebe', 'hijo', 'recien', 'nacido'],                      grupo: 'Familia' },
  { name: 'Users',          label: 'Grupo',        tags: ['grupo', 'personas', 'equipo', 'familia'],                grupo: 'Familia' },
  { name: 'User',           label: 'Persona',      tags: ['persona', 'perfil', 'individuo'],                        grupo: 'Familia' },
  { name: 'UserPlus',       label: 'Nuevo',        tags: ['nuevo', 'agregar', 'persona'],                           grupo: 'Familia' },
  { name: 'HandHeart',      label: 'Caridad',      tags: ['caridad', 'donacion', 'ayuda', 'corazon'],               grupo: 'Familia' },
  { name: 'Calendar',       label: 'Evento',       tags: ['evento', 'fecha', 'agenda', 'cumple'],                   grupo: 'Familia' },
  { name: 'CalendarHeart',  label: 'Aniversario',  tags: ['aniversario', 'fecha', 'amor'],                          grupo: 'Familia' },
  { name: 'PartyPopper',    label: 'Fiesta',       tags: ['fiesta', 'celebracion', 'cumple', 'festejo'],            grupo: 'Familia' },
  { name: 'Church',         label: 'Iglesia',      tags: ['iglesia', 'religion', 'casamiento'],                     grupo: 'Familia' },
]

// Set de nombres válidos para validación rápida
export const ICONOS_NAMES_SET = new Set(ICONOS_CATEGORIAS.map(i => i.name))
