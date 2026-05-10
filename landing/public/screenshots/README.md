# Screenshots de la landing

Catálogo de capturas usadas en `sinunmango.com.ar`. Tomadas el 2026-05-07
con datos demo (sin información personal real). Todas tienen aplicado el
strip del chatbot flotante "Hablar con Manguito" vía
`scripts/strip_chatbot.py`.

## App (set actual)

| Archivo | Pantalla |
| --- | --- |
| `dashboard.jpg` | Dashboard principal con saldo, indicadores del mes y proyecciones |
| `dashboard-junio.jpg` | Dashboard del mes que viene (vista de proyección) |
| `ingresos-detalle.jpg` | Drilldown del indicador "Ingresos del mes" |
| `proyeccion-fin-mes.jpg` | Cómo se calcula la liquidez estimada |
| `conciliaciones.jpg` | Lista de tarjetas con stats del período |
| `analitica.jpg` | Evolución mensual + gastos por categoría |
| `movimientos.jpg` | Lista filtrable de movimientos del período |
| `tarjetas.jpg` | Tarjetas de crédito con thumbnail del plástico |
| `nuevo-movimiento.jpg` | Formulario con tipos Gasto/Ingreso/Transferencia |
| `nueva-cuenta.jpg` | Formulario para agregar banco/billetera/efectivo |
| `nuevo-gasto-fijo.jpg` | Formulario para crear un recurrente mensual |
| `nueva-inversion.jpg` | Formulario con los 8 tipos de inversión |

## Onboarding

| Archivo | Paso | Highlight |
| --- | --- | --- |
| `onb-1-cuenta.jpg` | 1 — primera cuenta | banco/billetera + color de marca |
| `onb-2-tarjeta.jpg` | 2 — tarjeta manual | con CTA "Importar desde resúmenes PDF" abajo |
| `onb-2-pdf-dropzone.jpg` | 2 — dropzone PDF | "La IA va a detectar banco, red, variante, fechas y consumos" |
| `onb-2-pdf-analizado.jpg` | 2 — resultado del análisis | tarjeta detectada con todos sus consumos |
| `onb-3-categorias.jpg` | 3 — categorías | chips con emojis pre-seleccionados |
| `onb-4-apariencia.jpg` | 4 — tema de color y modo | 5 colores + claro/oscuro |

## Capturas obsoletas (sin uso)

Quedaron archivadas pero el código no las referencia:
- `manguito-chat.jpg` — del set original con datos personales
- `dashboard-dark.jpg` — modo oscuro paleta rosada (set viejo)
- `gastos-fijos.jpg` — lista con suscripciones reales
- `cuentas.jpg` — lista con bancos reales del usuario
- `configuracion-email-import.jpg` — config con email personal

Si querés volver a mostrarlas en la landing, retomalas con datos demo y
descomentá las referencias en `src/components/Screenshots.astro`.

## Strip del chatbot

Para regenerar el strip del chatbot flotante en cualquier captura:

```bash
python scripts/strip_chatbot.py
```

El script restaura desde `public/.screenshots-originals/` y reaplica el
overlay (idempotente). Si agregás capturas nuevas, copialas a
`/public/screenshots/`, refrescá el backup, y ajustá las coords manuales
del script según el tipo (viewport o full-page scroll).
