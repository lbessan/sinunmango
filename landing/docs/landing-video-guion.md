# Video demo para el Hero — guía de grabación

Reemplaza el placeholder con play button overlay en `Hero.astro`. La
intención: que un visitante en los **primeros 30 segundos** entienda
qué hace la app y por qué le sirve, sin tener que leer.

## Specs técnicos

| Item | Recomendación |
|---|---|
| **Duración** | 45-90 segundos. Más corto se siente apurado, más largo se pierde el visitante. Sweet spot: **60s**. |
| **Aspect ratio** | `1570:950` (~1.65:1) — matchea el aspect ratio del placeholder actual y evita layout shift cuando se cargue. Como referencia: 1570×950 px, o cualquier múltiplo. |
| **Resolución** | Grabá en 1080p mínimo (1920×1163 si respetás la ratio, o 1920×1080 con padding). Streamea idealmente en 720p para que cargue rápido. |
| **Formato** | `.mp4` (H.264) + `.webm` (VP9) como source secundario. AVIF/AV1 no vale la pena hoy para video corto. |
| **Tamaño** | Objetivo: < 5 MB para que cargue rápido en mobile 4G. Comprimir con [Handbrake](https://handbrake.fr/) preset "Web > Discord Tiny" o similar. |
| **Audio** | **Sin audio** o con narración muy minimalista. La mayoría lo ve con el sonido apagado en mobile. Si hacés versión con audio, agregá subtítulos quemados. |
| **Autoplay** | Si lo hacés sin audio, podés agregar `autoplay muted loop playsinline` al `<video>` para que arranque solo. Si tiene audio, no — molesta. |

## Guion sugerido (60s, sin audio)

Pensá el video como una secuencia de pantallas que cuenta la **propuesta de valor en tres tiempos**:

### Tiempo 1 — "Te llegan mails del banco" (0-15s)

- **Plano 1 (3s)**: Captura de Gmail (escritorio o móvil) con un mail de notificación del banco visible. Resaltar visualmente: flecha o highlight sobre el mail.
- **Plano 2 (4s)**: Click en "Reenviar" → escribir `tu-usuario@sinunmango.com.ar` → Enviar. Mostrar el flow del reenvío.
- **Plano 3 (5s)**: Transición a sinunmango → ya aparece el movimiento cargado solo en la lista, con un pequeño badge "✓ Importado". Texto encimado: **"Cargado solo."**

### Tiempo 2 — "Vista del dashboard" (15-35s)

- **Plano 4 (4s)**: Dashboard con saldo total ARS + USD, indicadores del mes (ingresos, gastos, ahorro). Lento zoom o pan.
- **Plano 5 (5s)**: Click en una card (ej. "Gastos del mes") → drilldown al detalle de movimientos. Mostrar que es interactivo.
- **Plano 6 (5s)**: Tab "Mes futuro" o sección de proyección → indicador "Liquidez estimada $X" con la fórmula desglosada (ingresos cargados − gastos fijos − cuotas pendientes).
- **Plano 7 (6s)**: Sección de conciliaciones de tarjeta. Mostrar los movimientos del período y cómo se concilian vs el resumen real.

### Tiempo 3 — "Hablale a Manguito" (35-55s)

- **Plano 8 (6s)**: Click en el bubble flotante del Manguito. Se abre el chat. Tipear: *"gasté $4.500 en el súper"*.
- **Plano 9 (4s)**: Manguito responde con el movimiento parseado (categoría detectada, cuenta, monto) y un botón "Confirmar". Tocar Confirmar.
- **Plano 10 (4s)**: Tipear segunda pregunta: *"¿cuánto gasté en delivery este mes?"*. Manguito responde con el dato + breakdown.
- **Plano 11 (4s)**: Vista final del dashboard con todo cargado. Texto final overlay: **"sinunmango — tus finanzas, sin un mango menos."**

### Cierre (55-60s)

- **Plano 12 (5s)**: Logo + URL `app.sinunmango.com.ar` + texto "Free para siempre · 7 días Pro gratis · Sin tarjeta al registrarte"

## Cómo grabar

### Opciones de grabación

1. **Loom / Screen Studio** (Mac) — Screen Studio es ideal por las animaciones automáticas (zoom suave a clicks, cursor highlight). Costo ~$15/mes pero vale.
2. **OBS Studio** — gratis, multiplataforma. Más manual.
3. **Camtasia** — pago pero con buen editor.

### Datos de demo

**No usar tus datos reales.** Crear un user demo en la app con:
- 3-4 cuentas (Banco Frances, Galicia, Mercado Pago, Brubank)
- 2-3 tarjetas (BBVA, Galicia, Mercado Pago)
- 20-30 movimientos del mes con detalles realistas pero no íntimos
- 1-2 inversiones (un plazo fijo, USD físico)
- 4-5 gastos fijos (Netflix, expensas, prepaga, gym)

### Edición

- Cortar al milisegundo: nada de "esperar a que cargue", "buscar el botón". Cada segundo cuenta.
- Cursor suave: las pantallas con cursor real son ruidosas. Si usás Screen Studio, le da bote y zoom automático.
- Sin transiciones de PowerPoint: cortes secos. Si querés transición, fade muy rápido (200ms).
- Texto overlay: máximo 3 frases en todo el video. Sans-serif grande. Aparición rápida (fade in 200ms).
- No grabar el chrome del browser real — el browser frame ya está en el componente del Hero. Grabá la app full-screen.

## Cómo integrar el video en el código

Una vez tengas el archivo final, ponelo en `landing/public/demo.mp4` (y opcionalmente `landing/public/demo.webm`). Después en `Hero.astro`:

1. Buscá el comentario que arranca con `═══════════════════════════════════════════════════════════════════ CUANDO TENGAS EL VIDEO DEMO grabado, reemplazá este placeholder por:`
2. Copiá el bloque del `<video>` que está debajo en el comentario.
3. Reemplazá el div `<div class="relative aspect-[1570/950] w-full overflow-hidden bg-[var(--color-sidebar)]"> ... </div>` (el placeholder) por el `<video>`.
4. `npm run build` y verificá que se vea bien.

Si usás Loom/YouTube (no recomendado para producción pero sirve para iterar):

```astro
<div class="aspect-[1570/950] w-full bg-black">
  <iframe
    src="https://www.loom.com/embed/VIDEO_ID"
    title="Demo de sinunmango"
    class="h-full w-full"
    allow="autoplay; encrypted-media; picture-in-picture"
    allowfullscreen
  ></iframe>
</div>
```

## Versión mínima viable

Si tener algo grabado YA es más importante que tenerlo perfecto, podés
hacer una versión 1.0 super simple:

- 30 segundos
- Pantalla del dashboard + un mensaje a Manguito + la respuesta
- Sin audio
- Quick & dirty con OBS

Y después, cuando tengas tiempo, hacés la versión definitiva. Es mejor
tener un video mediocre que un placeholder eterno.
