# Handoff: app sinunmango — Rediseño UI

## Overview
Rediseño completo de **sinunmango**, una app móvil para registrar ingresos, gastos y transferencias en múltiples monedas (ARS / USD). Incluye un dashboard con balance y cuentas, historial de movimientos con filtros, un asistente IA llamado **Manguito**, y una pantalla de configuración con personalización de tema (modo claro/oscuro × 5 colores de acento).

## About the Design Files
Los archivos en este bundle son **referencias de diseño creadas en HTML/React** — prototipos que muestran el look intendido y el comportamiento de la UI. **No son código de producción para copiar directamente.**

La tarea es **recrear estos diseños en el entorno existente de la app** (React Native / Expo / Flutter / SwiftUI / lo que sea que estés usando), siguiendo los patrones y librerías ya establecidos en el codebase. Los HTML usan React + estilos inline para iterar rápido en el navegador; el output final debe usar los componentes nativos y el sistema de estilos de la app real.

## Fidelity
**Alta fidelidad (hifi)** — los mocks tienen colores, tipografía, espaciados y animaciones finales. El developer debe recrear la UI pixel-perfect usando los componentes y librerías del codebase.

## Sistema de tema (CRÍTICO)
La app tiene un sistema de tema **bidimensional**:
- **Modo**: `claro` | `oscuro`
- **Color de acento**: `verde` | `azul` | `violeta` | `naranja` | `rosado`

El tema final se construye combinando ambos. La función `buildTheme(mode, accentKey)` en `sinunmango-app.jsx` tiene la fuente de verdad — copiá esa lógica.

### Paleta de acentos (hex)
| Color    | Base    | Light   | Dark    |
|----------|---------|---------|---------|
| verde    | #0F7173 | #E6F4F4 | #0A5355 |
| azul     | #2563EB | #EFF6FF | #1D4ED8 |
| violeta  | #7C3AED | #F5F3FF | #6D28D9 |
| naranja  | #E8601A | #FFF6EE | #C94D10 |
| rosado   | #BE185D | #FDF2F8 | #9D174D |

### Tokens generados por buildTheme
```
mode='claro':
  bg: #EEF2F8         surface: #FFFFFF      surfaceAlt: <accent.light>
  text: #1A2332       textSec: #6B7A8D      textMuted: #A0AFBE
  border: #E2E8F0     tabBar: #FFFFFF       tabBarBorder: rgba(0,0,0,0.07)
  income: #16A34A     expense: #DC2626

mode='oscuro':
  bg: #0D1B2A         surface: #162335      surfaceAlt: #1E2F42
  text: #E8EEF5       textSec: #8BA3BA      textMuted: #546A7E
  border: #243547     tabBar: #111E2D       tabBarBorder: rgba(255,255,255,0.06)
  income: #22C55E     expense: #F87171

# Compartidos:
  primary: <accent.hex>
  balanceBg: linear-gradient(145deg, <accent>, <accent.dark>)   // tarjeta de balance
  fabBg: <accent.hex>
  fabShadow: 0 6px 24px <accent.hex>55
```

## Pantallas

### 1. Dashboard (Inicio)
**Propósito**: Vista de resumen — balance total, cuentas, últimos movimientos.

**Layout** (top → bottom, padding horizontal 16px):
- **Header**: saludo "Buenos días 👋" + título "sinunmango" + botón notificaciones (36px) + avatar logo (36px)
- **Selector de mes**: chevrons + label "Abr 2026"
- **BalanceCard**:
  - radius 20, padding 20px, gradient `balanceBg`
  - Título: "BALANCE TOTAL · ARS" (uppercase, 11px, blanco 65%)
  - Monto principal: 30px, weight 800, blanco
  - USD secundario: 13px, blanco 60%
  - Toggle ojo (38px) para ocultar montos → muestra "• • • • • •"
  - Footer: dos cards INGRESOS (verde claro) / GASTOS (rojo claro), bg blanco 12%
- **AccountsRow**: scroll horizontal, cards 128px ancho mínimo, dot color + tipo + nombre + balance
- **Últimos movimientos**: lista de 5 transacciones en card surface

### 2. Historial (Movimientos)
**Propósito**: Lista filtrable de todos los movimientos.

**Filtros**:
- Pills de tipo: Todos / Gastos / Ingresos
- Botón calendario a la derecha que despliega menú: Todos · Este mes · Mes anterior · Esta semana
- Contador "N movimientos" debajo de los filtros (textMuted, 11px)
- Empty state: "No hay movimientos para este período"

**TxItem** (cada fila):
- icon circle 42px (surfaceAlt bg, emoji 19px)
- detail (13px, weight 600) + "cuenta · fecha" (11px, textSec)
- monto a la derecha (14px, weight 700, color income/expense según tipo) + currency tag (10px)
- separador: borderBottom 1px

### 3. Manguito (Asistente IA)
**Propósito**: Chat con IA para registrar y consultar.

**Layout**:
- Header con gradient `balanceBg`, foto de Manguito 76px (drop-shadow), título "MANGUITO" (uppercase, weight 900, letter-spacing 2)
- **Empty state**: 4 sugerencias clickeables como cards
- **Mensajes**: burbujas WhatsApp-style
  - usuario: bg `primary`, blanco, radius 18-18-4-18
  - asistente: bg surface, text color, radius 18-18-18-4, con avatar Manguito (28px) a la izquierda
- **Loading**: 3 dots animados (keyframes `bounce`)
- **Input footer**: avatar Manguito 32px + input 22px radius + botón send 38px (color primary cuando hay texto)

**Integración IA**: usa `window.claude.complete({ messages })` con prompt del sistema en español rioplatense.

### 4. Configuración
**Propósito**: Perfil + apariencia de la app.

**Solo dos secciones:**
1. **Perfil card** (gradient balanceBg): avatar (52px círculo blanco 20%) + "Mi cuenta" + email + chevron
2. **Apariencia card** (surface):
   - Header: icono palette + "Apariencia / Colores y modo de visualización"
   - **Color de acento** (5 botones circulares 44px): activos muestran check blanco + ring de 3px del color text + outer shadow del color
   - **Modo de visualización** (2 botones flex): Claro (sun) / Oscuro (moon), borde primary cuando activo, bg surfaceAlt
3. Footer: logo completo (opacity 0.35) + "v1.0.0"

## Tab bar inferior (CRÍTICO — 5 items)
```
[Inicio]  [Movim.]  [+ FAB ]  [Manguito]  [Config]
                    (centro)
```
- Altura aprox 70px (paddingTop 6, paddingBottom 22)
- bg `tabBar`, borderTop 1px `tabBarBorder`
- Item normal: icon 20px en wrapper 34×28 (radius 10) + label 10px. Cuando activo: bg surfaceAlt + color primary + label weight 600
- **FAB central**: círculo 64px, bg `primary`, sombra `fabShadow`, ícono plus 30px stroke 2.5, **transformY(-18px)** (sobresale por arriba del tab bar)
- **Manguito tab**: usa la imagen `manguito.png` (28×28 circular), opacity 0.4 inactiva → 1.0 activa, ring 2px primary cuando activa

## Bottom Sheet "Nuevo movimiento"
- Animación `slideUp` 0.3s cubic-bezier(0.32,0.72,0,1)
- Backdrop rgba(0,0,0,0.5) + blur(3px), tap-to-close
- Sheet: surface, radius 22px top, max-height 90%
- Handle 40×4px arriba (centrado)
- **Tabs Tipo**: segmented control bg surfaceAlt — Gasto / Ingreso / Transferencia
- **Campos**: Fecha + Detalle (grid 1fr 1fr) → Moneda + Monto (grid 90px 1fr) → Cuenta → Categoría → Cuotas (solo si gasto)
- Labels uppercase 10px weight 700 letter-spacing 0.6
- Inputs: bg `inputBg`, border `inputBorder`, radius 10, padding 10×12, fontSize 14
- Botón guardar: full width, radius 14, padding 15, bg primary, weight 800; pasa a verde + "Guardado ✓" 1.1s antes de cerrar

## Iconografía
Set custom de iconos SVG estilo **Lucide** (stroke-based, weight 1.8). Definidos en el objeto `ICON_PATHS` dentro de `sinunmango-app.jsx`:
`home, list, settings, plus, chevron_l, chevron_r, send, eye, eye_off, camera, check, bell, user, credit_card, chevron_right, tag, palette, sun, moon, filter, calendar, trash`

Recomendación: usar **lucide-react** o **lucide-react-native** que ya tiene todos estos iconos.

## Tipografía
- **Family**: Plus Jakarta Sans (Google Fonts) — pesos 400/500/600/700/800/900
- **Escala**:
  - h1 / título pantalla: 20px / 800
  - h2 / título card: 14-15px / 700
  - body: 13px / 500-600
  - secundario: 11-12px / 500
  - muted: 10-11px / 400

## Datos de ejemplo (mock)
`INITIAL_TRANSACTIONS` (12 movimientos), `ACCOUNTS` (5: Galicia, Visa Provincia, Mastercard, Wise USD, Efectivo), `CATEGORIES` (12 con emoji). Ver `sinunmango-app.jsx`.

## Helpers
- `fmtARS(n)` → `$45.800` (locale es-AR)
- `fmtUSD(n)` → `USD 180.00`
- `fmtMoney(n, currency)` → uno u otro
- `fmtDate(date)` → "Hoy" / "Ayer" / "25 abr"

## Animaciones
```css
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes bounce  { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
```

## Assets necesarios
- `manguito.png` — personaje del asistente IA (mismo que viene en este bundle)
- `logo.png` — logo cuadrado para header/avatar
- `logo_completo.png` — logo + wordmark para footer config

## Archivos en este bundle
- `sinunmango.html` — entry point que monta el iOS frame + tweaks panel
- `sinunmango-app.jsx` — **toda la app** (componentes, screens, themes, datos)
- `ios-frame.jsx` — solo para preview en navegador, ignorar en implementación nativa
- `tweaks-panel.jsx` — solo para preview, ignorar
- `manguito.png`, `logo.png`, `logo_completo.png` — assets del producto

## Notas finales para el dev
- En implementación móvil, **eliminá** el iOS frame y los tweaks — son solo para visualizar en el navegador.
- El selector de tema en pantalla de Config debe persistir en storage (AsyncStorage / SharedPreferences / etc.).
- El bottom sheet idealmente usa un componente nativo (`@gorhom/bottom-sheet` en RN, etc.).
- El menú de filtro de fechas debe cerrarse al tap-outside.
- Currency formatting respetá el locale del dispositivo cuando sea posible.
