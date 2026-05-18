# Screenshots de la landing

Catálogo de capturas usadas en `sinunmango.com.ar`. Tomadas el 2026-05-07
con datos demo (sin información personal real). Todas tienen aplicado el
strip del chatbot flotante "Hablar con Manguito" vía
`scripts/strip_chatbot.py`.

## App — capturas en uso

Estas se referencian desde `src/components/Screenshots.astro` y otros
componentes. **No borrar sin actualizar el código primero.**

| Archivo | Pantalla | Usado en |
| --- | --- | --- |
| `dashboard.jpg` | Dashboard principal con saldo, indicadores y proyecciones | Hero (preload) + Screenshots |
| `ingresos-detalle.jpg` | Drilldown del indicador "Ingresos del mes" | Screenshots |
| `conciliaciones.jpg` | Lista de tarjetas con stats del período | Screenshots |
| `analitica.jpg` | Evolución mensual + gastos por categoría | Screenshots |
| `movimientos.jpg` | Lista filtrable de movimientos | Screenshots (mini) |
| `tarjetas.jpg` | Tarjetas de crédito con thumbnail del plástico | Screenshots (mini) |
| `nueva-inversion.jpg` | Formulario con los 8 tipos de inversión | Screenshots (mini) |

## Theme picker — cargadas dinámicamente

El selector de temas en `Screenshots.astro` cambia la imagen vía JS con
template literal `/screenshots/dashboard-tema-${theme}.png`. **El grep
no las detecta como referenciadas** pero son críticas para el demo del
theme switcher. NO BORRAR.

| Archivo | Tema |
| --- | --- |
| `dashboard-tema-verde.png` | Verde (default, gratis) |
| `dashboard-tema-azul.png` | Azul (Pro) |
| `dashboard-tema-violeta.png` | Violeta (Pro) |
| `dashboard-tema-naranja.png` | Naranja (Pro) |
| `dashboard-tema-rosado.png` | Rosado (Pro) |

## Onboarding — slider

Usadas en `Onboarding.astro`. **Son PNG con canal alpha (transparencia)**
porque flotan sobre el fondo azul oscuro con halo de glow detrás. La
versión JPG (que existía duplicada) se eliminó porque no tenía
transparencia y nunca se usaba.

| Archivo | Paso | Highlight |
| --- | --- | --- |
| `onb-1-cuenta.png` | 1 — primera cuenta | banco/billetera + color de marca |
| `onb-2-tarjeta.png` | 2 — tarjeta manual | con CTA "Importar desde resúmenes PDF" abajo |
| `onb-2-pdf-dropzone.png` | 2 — dropzone PDF | "La IA va a detectar banco, red, variante, fechas y consumos" |
| `onb-2-pdf-analizado.png` | 2 — resultado del análisis | tarjeta detectada con todos sus consumos |
| `onb-3-categorias.png` | 3 — categorías | chips con emojis pre-seleccionados |
| `onb-4-apariencia.png` | 4 — tema de color y modo | 5 colores + claro/oscuro |

## Capturas archivadas (no referenciadas hoy)

Estas existen en el directorio pero el código no las referencia. Sirven
para futuros componentes si queremos resaltar esos features:

| Archivo | Propósito potencial |
| --- | --- |
| `manguito-chat.jpg` | Mini-card del feature "Decile a Manguito" en Screenshots |
| `configuracion-email-import.jpg` | Anclar visualmente el feature de email forwarding |
| `dashboard-dark.jpg` | Showcase del modo oscuro (feature Pro) |
| `dashboard-junio.jpg` | Vista de proyección de mes futuro |
| `proyeccion-fin-mes.jpg` | Cómo se calcula la liquidez estimada |
| `cuentas.jpg`, `gastos-fijos.jpg` | Listas con datos demo |
| `nueva-cuenta.jpg`, `nuevo-gasto-fijo.jpg`, `nuevo-movimiento.jpg` | Formularios |

Si después de un tiempo no se usan, podemos borrarlas. Si querés
limpiar todas las archivadas:

```bash
cd landing/public/screenshots
rm manguito-chat.jpg configuracion-email-import.jpg dashboard-dark.jpg \
   dashboard-junio.jpg proyeccion-fin-mes.jpg cuentas.jpg gastos-fijos.jpg \
   nueva-cuenta.jpg nuevo-gasto-fijo.jpg nuevo-movimiento.jpg
```

## Strip del chatbot

Para regenerar el strip del chatbot flotante en cualquier captura:

```bash
python scripts/strip_chatbot.py
```

El script restaura desde `public/.screenshots-originals/` y reaplica el
overlay (idempotente). Si agregás capturas nuevas, copialas a
`/public/screenshots/`, refrescá el backup, y ajustá las coords manuales
del script según el tipo (viewport o full-page scroll).
