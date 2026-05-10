# Design Brief — sinunmango

## Contexto

**sinunmango** es una app web de finanzas personales para Argentina. El nombre hace referencia coloquial a "sin un mango" (sin plata). Los usuarios la usan para:

- Ver el saldo de sus cuentas bancarias, billeteras virtuales (Mercado Pago, Uala) y efectivo
- Registrar y categorizar gastos e ingresos
- **Conciliar** el resumen mensual de tarjetas de crédito contra los movimientos cargados
- Analizar sus gastos por categoría y período
- Proyectar cuánto van a deber en cuotas futuras
- Cargar gastos fijos mensuales recurrentes

Está construida en **Next.js 15 + Tailwind CSS + Supabase**. El usuario final es una persona particular argentina, no una empresa.

---

## Sistema de diseño actual

### CSS Custom Properties
```css
/* Light mode */
--accent:     #1a6b5a   /* verde principal */
--accent2:    #1B3A6B   /* azul oscuro (gradiente) */
--sidebar-bg: #0d2137   /* sidebar oscura */
--bg-main:       #f1f5f9
--bg-card:       #ffffff
--bg-card-alt:   #f8fafc
--text-primary:  #1e293b
--text-secondary:#475569
--text-muted:    #94a3b8
--border:        #e2e8f0

/* Dark mode */
--bg-main:     #0d1b2a
--bg-card:     #132033
--text-primary:#e2eaf3
```

### Temas de color disponibles (el usuario elige en Configuración)
| Nombre   | --accent  | --accent2 | Sidebar    |
|----------|-----------|-----------|------------|
| Verde    | #1a6b5a   | #1B3A6B   | #0d2137    |
| Azul     | #2563eb   | #1e3a8a   | #0c1829    |
| Violeta  | #7c3aed   | #4c1d95   | #160d2b    |
| Naranja  | #c2410c   | #7c2d12   | #1a0d08    |
| Rosado   | #be185d   | #831843   | #1a0a14    |

### Gradiente principal (CTAs, botones de acción, header activo del sidebar)
```css
background: linear-gradient(90deg, var(--accent2), var(--accent))
```

### Tipografía
- Sistema: font stack del navegador (Tailwind default)
- Tamaños: xs (10-12px), sm (14px), base (16px), xl-2xl para headings

### Componentes clave
- **Cards**: `bg-white rounded-2xl border border-slate-100 shadow-sm p-6`
- **Sidebar**: oscura fija a la izquierda, 256px, sticky con scroll
- **Badges estado**: `bg-emerald-50 text-emerald-600` (ok), `bg-amber-50 text-amber-600` (pendiente), `bg-red-50 text-red-500` (error)
- **Inputs**: `border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white`
- **Botón primario**: gradiente accent2→accent, texto blanco, `rounded-lg py-2.5`
- **Botón secundario**: `border border-slate-200 text-slate-600 rounded-lg`

---

## Pantallas principales

### 1. Sidebar
- **Ancho**: 256px, fija, sticky
- **Fondo**: `var(--sidebar-bg)` (oscuro)
- **Secciones**: Principal / Mis cuentas / Configuración (con sub-items colapsables)
- **Nav items**: íconos + label, highlight con gradiente accent al estar activo
- **Footer**: toggle claro/oscuro, dólar BNA en tiempo real, botón cerrar sesión
- **Problema actual**: la separación entre secciones se hace solo con texto uppercase gris, podría ser más clara visualmente

### 2. Dashboard
- **Header full-bleed**: hero con gradiente oscuro que rompe el padding del main
- **Tarjetas de stat**: "Saldo total", "Gastos del mes", "Ingresos del mes" en grid 3 columnas
- **Estado de cuentas**: lista con thumbnails (bancos 40×40, tarjetas 96×61) + saldo
- **Tarjetas de crédito**: igual que cuentas pero con cierre/vencimiento en vez de tipo
- **Gastos fijos próximos**: lista de próximos vencimientos
- **Proyección cuotas**: resumen de cuotas futuras agrupadas por mes

### 3. Movimientos
- **Filtros**: búsqueda texto + chips de tipo (Todos / Gasto / Ingreso / Transferencia)
- **Tabla**: fecha / detalle + cuota / categoría (ícono + nombre) / período / monto
- **Monto**: negativo en rojo, positivo en verde
- **Acciones inline**: editar con lápiz

### 4. Conciliaciones
- **Banner full-bleed** con gradiente oscuro: muestra el mes, total ARS, total USD si hay, pendiente/conciliado
- **Navegación** entre meses: flechas ← → a los lados
- **Tarjetas de tarjeta**: thumbnail + nombre + cierre/vence + stats (N conciliados · N pendientes) + monto ARS / USD + badge "Al día" o "N pendientes"
- **Detalle de conciliación**: stats cards (3 ARS + 3 USD si hay), tabla de pendientes y conciliados, botón "Importar PDF"
- **Modal importar PDF**: zona de drop, lista de transacciones con check, selector de categoría inline, secciones: Consumos / Descuentos (verde) / Impuestos

### 5. Analítica
- Gráficos de gastos por categoría y evolución mensual

### 6. Tarjetas
- **Lista**: cada fila con thumbnail 128×81 del diseño físico de la tarjeta + nombre + cierre/vence + saldo acumulado
- **Detalle**: banner con la imagen de la tarjeta centrada sobre fondo del color de la tarjeta, movimientos recientes
- **Formulario**: selector de banco, red (Visa/Mastercard/etc.), variante (Classic/Gold/Platinum/Signature/Black), preview del diseño, datos de cierre/vencimiento, color picker

### 7. Cuentas (bancos, billeteras, efectivo)
- **Lista**: agrupada en Bancos / Billeteras virtuales / Efectivo, cada ítem con logo del banco + nombre + subtipo (Caja de Ahorro / Cuenta Corriente) + saldo
- **Formulario**: banco selector (autocomplete con logos), tipo, subtipo, color, imagen

### 8. Manguito (asistente IA)
- Chat simple centrado, IA que responde preguntas sobre las finanzas del usuario

---

## Lo que funciona bien

- La sidebar oscura contrasta bien con el contenido principal claro
- El gradiente en CTAs y acciones principales da identidad
- Las tarjetas redondeadas con sombras sutiles dan limpieza
- Los badges de estado (verde/ámbar/rojo) son claros
- El banner full-bleed de conciliaciones tiene buen impacto visual
- Los thumbnails de tarjetas de crédito se ven bien (imagen 800×504 con `object-contain`)

---

## Áreas a mejorar (lo que el usuario quiere revisar)

1. **Dashboard**: el hero es genérico (gradiente oscuro), podría tener más personalidad. Las stat cards son simples rectángulos blancos.

2. **Movimientos**: tabla básica, sin mucho jerarquía visual. Los filtros son chips planos.

3. **Conciliaciones — detalle**: las 6 tarjetas de stats (3 ARS + 3 USD) se ven como una fila de cajas. Podría fluir mejor. La distinción entre "pendientes" y "conciliados" en la tabla podría ser más impactante.

4. **Sidebar navigation**: la jerarquía entre secciones (Principal / Mis cuentas / Configuración) podría ser más clara. Los nav items activos tienen gradiente pero los inactivos son muy planos.

5. **Formularios**: los formularios de nueva cuenta / nueva tarjeta son funcionales pero largos y sin una estructura visual atractiva.

6. **Empty states**: cuando no hay datos, hay mensajes de texto simples sin ilustración.

7. **Micro-interacciones**: pocos estados de hover, loading, etc.

---

## Constraints técnicos

- **CSS Variables**: todo el theming usa CSS custom properties definidas en `:root`. Cualquier cambio de color debe mantener este sistema.
- **Tailwind CSS**: las clases de utilidad se aplican directamente en JSX. No hay componentes de UI externos (salvo `lucide-react` para íconos).
- **Modo oscuro**: existe un sistema de dark mode completo via clase `.dark` en `<html>`. Toda propuesta visual debe funcionar en ambos modos.
- **Mobile responsive**: la sidebar se convierte en drawer en mobile. Los layouts usan `flex` y `grid` responsivos.
- **No hay design system externo**: todo es custom. Se podría adoptar shadcn/ui si se propone.

---

## Assets disponibles

- `/logo.png` — logo de la app (mangifera/mango estilizado)
- `/banks/*.png` — íconos cuadrados de bancos argentinos (200×200, fondo transparente)
- `/banks/*-banner.png` — logos horizontales de bancos (600×200, fondo transparente)
- `/cards/{network}-{variant}.png` — imágenes de tarjetas físicas 800×504

---

## Inspiración y referencias

- **Fintual, Mercado Pago, Uala**: apps fintech latinoamericanas con buen balance entre data-dense y visualmente limpio
- **Linear, Notion**: sidebar con jerarquía clara, navegación fluida
- **Stripe Dashboard**: tablas densas pero bien organizadas, stats cards con buen contraste
- Estilo general buscado: **profesional pero cálido**, no frío/corporativo. El usuario es una persona, no una empresa.

---

## Pedido específico para Claude Design

Proponé mejoras visuales para las pantallas de **Dashboard** y **Conciliaciones (detalle)**, que son las que el usuario usa más frecuentemente. Para cada pantalla:

1. Mantené el sistema de CSS variables existente (los colores base no cambian, son configurables por el usuario)
2. Podés proponer nuevas estructuras de layout, jerarquía tipográfica, uso de espacio, estados visuales
3. Describí o mostrá cómo mejorar:
   - Las stat cards del dashboard (total de cuentas, gastos del mes, etc.)
   - La navegación entre meses en conciliaciones
   - La diferenciación visual entre movimientos pendientes y conciliados
   - La tabla de movimientos en general
4. Si proponés nuevos componentes (ej: un gráfico sparkline en las stat cards, avatares de categorías más grandes, un panel lateral de filtros), describí cómo encajarían con el stack actual (Next.js + Tailwind + CSS vars)

La paleta activa en este momento es la verde: `--accent: #1a6b5a`, `--accent2: #1B3A6B`, sidebar `#0d2137`.
