# sinunmango — Contexto del proyecto

## Qué es
sinunmango es una app de finanzas personales para el mercado argentino. Tiene web app y app móvil Android.

- **Web app**: Next.js 15, Supabase, Tailwind CSS. Deploy en Vercel.
- **App mobile**: Expo / React Native. En proceso de publicación en Google Play.
- **URL web**: https://app.sinunmango.com.ar
- **Repositorio**: `D:\Projects\finanzas-lb` (monorepo: web + `sinunmango-mobile/`)

---

## Stack técnico

### Web (finanzas-lb/)
- Next.js 15 App Router, TypeScript, Tailwind CSS
- Supabase (auth con Google OAuth + RLS)
- Vercel (deploy + crons)
- Resend (emails de alertas)
- Claude API (asistente financiero "Manguito")

### Mobile (sinunmango-mobile/)
- Expo SDK 54, expo-router, React Native 0.81
- Supabase JS client
- EAS Build para distribución

---

## Identidad visual
- **Nombre**: sinunmango (todo minúscula)
- **Logo**: manguito.png (personaje simpático, cara de mango con ojos)
- **Colores CSS variables**:
  - `--sidebar-bg`: azul oscuro (#07192b por defecto)
  - `--accent`: verde oscuro (#1a6b5a por defecto)
  - `--accent2`: azul medio (#1B3A6B por defecto)
  - Temas alternativos: Naranja, Rosado, Violeta, Azul
- **Tipografía**: sistema (sans-serif)
- **Sidebar**: fondo oscuro, highlight activo full-width con gradiente accent2→accent
- El asistente de IA se llama **Manguito**, usa el logo como avatar

---

## Funcionalidades principales (web)
1. **Dashboard** — saldo, ingresos/gastos del mes, proyección fin de mes, proyecciones futuras
2. **Movimientos** — lista filtrable/ordenable, nuevo movimiento, edición
3. **Cuentas** — banco CA/CC, billeteras, efectivo ARS/USD
4. **Tarjetas** — crédito, con cierre y vencimiento
5. **Gastos fijos** — recurrentes con alerta por email
6. **Inversiones** — PF, FCI, dólar físico, crypto, CEDEARs, acciones, bonos
7. **Analítica** — gráficos por categoría y tiempo
8. **Conciliaciones** — matching de movimientos
9. **Manguito** (asistente IA) — chat flotante bottom-right, conectado a Claude API
10. **Configuración** — temas de color, bancos, categorías, notificaciones

---

## Base de datos (Supabase)
Tablas principales:
- `cuentas` — cuentas bancarias, billeteras, efectivo, tarjetas
- `movimientos` — gastos, ingresos, transferencias (con cuotas)
- `movimientos_completos` — vista con joins
- `categorias` / `subcategorias`
- `gastos_fijos` — recurrentes mensuales
- `inversiones` — con JSONB para datos específicos por tipo
- `dashboard_resumen` — vista materializada
- `saldo_actual_cuentas` — vista
- `parametros` — dolar BNA, etc.
- `user_preferences` — notificaciones, tema

---

## Usuarios
- Auth con Google OAuth via Supabase
- RLS habilitado en todas las tablas
- Un solo usuario activo (luchobessan@gmail.com) — app personal

---

## Qué falta / backlog
- Parsear PDF de resumen de tarjeta
- Selector de variante en onboarding
- Emoji grid picker en onboarding
- Flujo de importación PDF en onboarding
- **Webpage de marketing** (nuevo — esto es lo que se quiere construir ahora)

---

## Webpage de marketing (nuevo proyecto)
Se quiere construir una landing page para sinunmango. No hay decisiones tomadas aún sobre:
- Stack (puede ser Next.js, HTML estático, otro)
- Hosting
- Contenido exacto
- Si va en el mismo repo o separado

El dominio raíz `sinunmango.com.ar` está disponible para esto (la app vive en `app.sinunmango.com.ar`).
