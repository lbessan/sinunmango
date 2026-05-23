# Plan de escalado · sinunmango

Documento vivo con las decisiones de infraestructura y costos para
distintos niveles de crecimiento. Actualizar cuando cambien precios,
límites de proveedores, o se tomen decisiones nuevas.

> Última actualización: 2026-05-23 · Lucho.

---

## 1. Stack actual

| Capa | Servicio | Plan actual |
|---|---|---|
| Frontend + Functions | Vercel | ⚠️ Hobby (free) |
| Database + Auth | Supabase | ⚠️ Free |
| LLM | Anthropic API | Pay-as-you-go |
| Emails transaccionales | Resend | Free (3000/día) |
| Billing | Mercado Pago | 5% por transacción |

## 2. Acciones inmediatas (no opcionales)

### Vercel Pro · $20/mes

**Por qué**: el TOS de Hobby plan **prohíbe uso comercial**. Como tenés
users pagando suscripciones (incluso uno solo), técnicamente violás
los términos. Vercel puede suspender la cuenta sin aviso. No es un
"capaz pasa" — pasa cuando algún tracker automático lo detecta.

Incluye:
- 1 TB bandwidth/mes (vs 100 GB en Hobby)
- 1000 GB-h serverless execution
- SLA 99.99%
- Logs de 7 días (vs 24 h)
- Comercial OK

### Supabase Pro · $25/mes

**Por qué**: el Free plan **pausa la DB después de 1 semana de
inactividad**. Para una app que cobra plata mensual eso es inaceptable
(un finde largo y el lunes te quedás sin DB). Más: backups diarios
y PITR de 7 días.

Incluye:
- DB 8 GB (vs 500 MB)
- Backups diarios automáticos
- PITR (Point-In-Time Recovery) de 7 días
- No se pausa
- 250 GB bandwidth
- Soporte por mail

**Costo fijo mensual: $45 USD ≈ $45.000 ARS**. Con 7 suscriptores Pro
mensuales ($6.999 c/u = $50k) ya cubrís infra. Hasta ese punto, sale
de tu bolsillo.

---

## 3. Análisis de capacidad

### "1000 personas usando al mismo tiempo" — ¿qué significa?

| Métrica | Significado | Regla de oro |
|---|---|---|
| **MAU** | Usuarios únicos en el mes | Número de marketing |
| **Concurrent active** | Usándola en este segundo | **1-5% del MAU** |
| **Peak RPS** | Requests por segundo en el pico | Importa para infra |

1.000 concurrent ≈ 20.000-100.000 MAU. Es mucho.

### Bottlenecks reales

| Componente | Aguanta 1000 concurrent? | Notas |
|---|---|---|
| Vercel functions | ✅ Sí | Auto-escala. Cold starts no se notan con tráfico constante |
| Supabase DB | ✅ Sí | Si las queries están indexadas por user_id (ya lo están) |
| Real-time websockets | ⚠️ Depende | En Free pool de 60 conn. En Pro: 200+. Si no usás muchas subscriptions, OK |
| **Anthropic rate limits** | 🔴 No | Tier 1: **50 req/min**. 50 users haciendo asistente al mismo minuto = 429 |
| Resend rate limits | ⚠️ Limit | 100 emails/segundo, 3000/día (Free) |

**Mitigación Anthropic**: pedir upgrade a Tier 2 (1000 req/min) cuando
te acerques. Es gratis, solo requiere histórico de uso.

---

## 4. Estimaciones de costo por escala

### 1.000 MAU (≈ 20 concurrent peak)

| Concepto | USD/mes |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Anthropic API | ~$80 (con Haiku donde se pueda) |
| Resend | $0 (Free alcanza) |
| **Total infra** | **~$125** |

A 5% conversión Pro: 50 × $6.999 = $349.950 ARS/mes ≈ $250 USD
**Margen: ~50%**. Saludable.

### 10.000 MAU (≈ 200 concurrent peak)

| Concepto | USD/mes |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 + add-ons ~$30 |
| Anthropic API | ~$800 |
| Resend | $20 (plan Basic) |
| **Total infra** | **~$895** |

A 5% conversión Pro: 500 × $6.999 = $3.5M ARS/mes ≈ $2.500 USD
**Margen: ~64%**.

### 100.000 MAU — momento de empresa

| Concepto | USD/mes |
|---|---|
| Vercel Pro / Enterprise | $200+ |
| Supabase Pro + scale | $200+ |
| Anthropic API | $8.000+ |
| Resend Pro | $80 |
| **Total infra** | **~$8.500** |

Acá hay que renegociar pricing con Anthropic, considerar caching
agresivo con Redis, y optimizar cada flow con LLM.

---

## 5. Costos de IA — análisis por endpoint

### Modelos en uso (mayo 2026)

| Endpoint | Modelo | max_tokens | Caching |
|---|---|---|---|
| `/api/asistente` | Sonnet 4.6 | 1024 | ✅ |
| `/api/asistente-mobile` | Sonnet 4.6 | 1024 | ✅ |
| `/api/parsear-tarjeta-pdf` | Sonnet 4.6 | 16000 | No |
| `/api/parsear-resumen` | Sonnet 4.6 | 16000 | No |
| `/api/leer-ticket` | Haiku 4.5 ← cambiado | 512 | No |
| `/api/email-inbound` | Haiku 4.5 | 1024 | No |
| `/api/analitica-insight` | Haiku 4.5 | 700-2500 | ✅ |

### Precios

| Modelo | Input ($/M tokens) | Output ($/M tokens) | Ratio vs Sonnet |
|---|---|---|---|
| Sonnet 4.6 | $3.00 | $15.00 | 1× |
| Haiku 4.5 | $0.80 | $4.00 | **3.75-3.75× más barato** |

### Plan de migración a Haiku

| Endpoint | Acción | Justificación |
|---|---|---|
| `leer-ticket` | ✅ **Ya migrado** | Extracción visual simple, Haiku la hace |
| `parsear-tarjeta-pdf` | 🟡 A/B test antes | PDFs con cuotas/impuestos pueden romper Haiku |
| `parsear-resumen` | 🟡 A/B test antes | Idem |
| `asistente` | 🔴 Test riguroso | Tool use con Haiku puede romper JSON action |
| `email-inbound` | (ya Haiku) | — |
| `analitica-insight` | (ya Haiku) | — |

### Cómo testear A/B

Para `parsear-tarjeta-pdf` y `parsear-resumen`:
1. Tomar 3-5 PDFs reales con distintos formatos
2. Cambiar env var `CLAUDE_MODEL_PARSEAR_PDF=claude-haiku-4-5-20251001`
3. Subir cada PDF y anotar:
   - Cantidad de transacciones detectadas
   - Precisión de montos (cuántas exactas / cuántas con error)
   - Precisión de fechas
   - Tiempo de respuesta
4. Si Haiku acierta ≥95% en montos y fechas, migrar default a Haiku.
5. Si <95%, mantener Sonnet pero **acortar el system prompt** (menos
   tokens input = menor costo, sin sacrificar calidad).

Para `asistente`:
1. Mismos 15 prompts representativos en ambos modelos
2. Comparar:
   - ¿La respuesta es razonable?
   - ¿El tool use (cuando aplica) está bien formado?
   - ¿La conversación se mantiene con coherencia?
3. Si Haiku tiene >10% de fallos en tool use → mantener Sonnet.

### Refactor env-driven

Cada endpoint lee su modelo de `lib/claude-models.ts`. Ese helper
expone constantes que primero miran env vars, después caen a defaults.

```ts
// lib/claude-models.ts
export const MODEL_ASISTENTE      = process.env.CLAUDE_MODEL_ASISTENTE      ?? 'claude-sonnet-4-6'
export const MODEL_PARSEAR_PDF    = process.env.CLAUDE_MODEL_PARSEAR_PDF    ?? 'claude-sonnet-4-6'
export const MODEL_LEER_TICKET    = process.env.CLAUDE_MODEL_LEER_TICKET    ?? 'claude-haiku-4-5-20251001'
export const MODEL_EMAIL_INBOUND  = process.env.CLAUDE_MODEL_EMAIL_INBOUND  ?? 'claude-haiku-4-5-20251001'
export const MODEL_ANALITICA      = process.env.CLAUDE_MODEL_ANALITICA      ?? 'claude-haiku-4-5-20251001'
```

Para experimentar con un modelo distinto en producción:
1. Vercel Dashboard → Settings → Environment Variables
2. Agregar `CLAUDE_MODEL_<ENDPOINT>` con el modelo a probar
3. Redeploy
4. Monitorear unas horas, comparar costos en Console
5. Si funciona bien, cambiar el default en el código.

### Estimaciones de ahorro

A 1.000 MAU con todos los endpoints migrables a Haiku:
- Costo Sonnet de todo lo migrable: ~$280/mes
- Costo Haiku de todo lo migrable: ~$78/mes
- **Ahorro: $201/mes (72%)**

A 10.000 MAU: ahorro ≈ $2.000/mes
A 100.000 MAU: ahorro ≈ $20.000/mes

---

## 6. Alertas de costo

### Configurar en Anthropic Console (ya)

1. Anthropic Console → **Settings → Billing**
2. **Spend limit** (hard cap mensual): definir el techo. Recomendado:
   - $50 inicial mientras tengas pocos users
   - $200 cuando tengas 100+ MAU
   - $500 cuando tengas 1000+ MAU
   - Después escala con tracción real
3. **Spend alerts**: configurar emails a 50%, 80% y 100% del límite.
4. **Usage alerts**: para tokens (opcional, menos útil que dollar
   tracking).

Listo. Si en algún día tu app dispara consumo (bug, abuso, viralidad),
Anthropic te avisa y/o te pausa antes de que aparezca un cargo
sorpresa de $5000.

### Tracking custom (futuro)

Cuando llegues a 500+ MAU vale la pena implementar tracking propio:
- Tabla `claude_api_usage` con timestamp, endpoint, model, tokens,
  estimated_cost
- Helper que loggea después de cada call exitoso
- Cron diario que suma y manda email si supera umbral
- Dashboard interno en `/configuracion/admin` con gráficos

Pendiente. No es urgente hasta tener tracción.

---

## 7. Checklist por hito

### Antes de promocionar la app (ya)
- [x] MP funcionando en producción
- [x] Cleanup de Google Play
- [ ] **Vercel Pro contratado**
- [ ] **Supabase Pro contratado**
- [ ] Spend limit + alerts en Anthropic Console
- [ ] Migration de scaling aplicada (la app está aplicada)

### Cuando llegues a 100 MAU
- [ ] Mover Supabase a región `sa-east-1` si todavía está en us-east-1
- [ ] Pedir upgrade Anthropic Tier 2
- [ ] A/B test de Haiku en parsear-tarjeta-pdf

### Cuando llegues a 500 MAU
- [ ] Tracking custom de Claude API usage
- [ ] Considerar Sentry Pro para monitoreo de errores
- [ ] Revisar índices de DB sobre tablas con más volumen

### Cuando llegues a 5.000 MAU
- [ ] Supabase Branching para deploys aislados
- [ ] Considerar caching con Vercel KV (Redis)
- [ ] Dashboard interno con gráficos de uso

### Cuando llegues a 50.000+ MAU
- [ ] Negociar pricing custom con Anthropic
- [ ] Considerar Vercel Enterprise
- [ ] Auditoría de performance con Vercel Speed Insights Pro

---

## 8. Asunciones y supuestos

- **Conversión Free → Pro**: 5% (conservador para AR; SaaS típico es
  2-10%, podemos ser optimistas/pesimistas según data real cuando
  haya).
- **Calls de Claude por user Pro/mes**: 100 asistente + 5 PDFs + 10
  tickets + 30 emails (estimación inicial).
- **Calls de Claude por user Free/mes**: 5 asistente + 1 PDF + 3
  tickets + 1 email (los límites del Free tier).
- **Cotización USD ARS**: $1.420 (al 2026-05-23). Ajustar números
  cuando cambie significativamente.

Reevaluar estos números cada vez que actualices el documento.
