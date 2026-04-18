/**
 * Finanzas LB — Importación automática desde Gmail
 * ─────────────────────────────────────────────────
 * Instrucciones:
 *   1. Ir a https://script.google.com → Nuevo proyecto
 *   2. Pegar este código completo
 *   3. Editar las dos variables de configuración de abajo
 *   4. Ejecutar manualmente una vez para autorizar permisos (Gmail + URL Fetch)
 *   5. Ir a Activadores (reloj) → Agregar activador:
 *        Función: checkTransactionEmails
 *        Tipo: Por tiempo → Cada 10 minutos (o el intervalo que prefieras)
 *   6. Guardar y listo — los mails se importan solos desde ahora
 */

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const WEBHOOK_URL    = 'https://TU-APP.vercel.app/api/email-inbound'  // ← tu URL
const WEBHOOK_SECRET = 'TU_SECRET_AQUI'                               // ← valor de EMAIL_INBOUND_SECRET en .env
// ─────────────────────────────────────────────────────────────────────────────

// Remitentes conocidos de mails de tarjetas
const SENDERS = [
  'alertas@infomistarjetas.com',   // BBVA, Banco Provincia y otros via infomistarjetas
  'info@mercadopago.com',          // Mercado Pago
  // Agregar acá otros remitentes si recibís mails de más bancos
]

function checkTransactionEmails() {
  // Buscar todos los senders en un query de Gmail
  const query = SENDERS.map(s => `from:${s}`).join(' OR ')
  const fullQuery = `(${query}) is:unread`

  const threads = GmailApp.search(fullQuery, 0, 50)

  let processed = 0
  let skipped   = 0
  let errors    = 0

  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      if (!msg.isUnread()) return

      const from    = msg.getFrom()
      const subject = msg.getSubject()
      const texto   = msg.getPlainBody()

      try {
        const response = UrlFetchApp.fetch(WEBHOOK_URL, {
          method:             'post',
          contentType:        'application/json',
          muteHttpExceptions: true,   // no lanzar excepción en 4xx/5xx
          headers: {
            'Authorization': `Bearer ${WEBHOOK_SECRET}`,
          },
          payload: JSON.stringify({ texto, from, subject }),
        })

        const code   = response.getResponseCode()
        const result = JSON.parse(response.getContentText())

        if (code === 200 && result.ok) {
          Logger.log(`✓ Importado: ${result.detalle} $${result.monto} → ${result.cuenta}`)
          processed++
        } else if (result.skipped) {
          Logger.log(`- Omitido: ${result.reason} (${subject})`)
          skipped++
        } else {
          Logger.log(`⚠ Error ${code}: ${result.error} (${subject})`)
          errors++
        }
      } catch (e) {
        Logger.log(`✗ Excepción al procesar "${subject}": ${e}`)
        errors++
      }

      // Marcar como leído para no procesar dos veces
      msg.markRead()
    })
  })

  Logger.log(`─── Resumen: ${processed} importados, ${skipped} omitidos, ${errors} errores`)
}
