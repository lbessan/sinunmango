// Helpers para detectar emails de confirmación de reenvío de Gmail.
//
// Cuando un user activa el reenvío automático de un email a su address de
// `<token>@sinunmango.com.ar`, Gmail manda primero un email de verificación
// con una URL única (vf-XXXXX) que el user tiene que abrir.
//
// Estos helpers se usan en `app/api/email-inbound/route.ts` para detectar
// y guardar esa URL automáticamente.

/** ¿El email viene de Gmail pidiendo verificación de reenvío? */
export function isGmailVerificationEmail(subject: string, from: string): boolean {
  const s = subject.toLowerCase()
  const f = from.toLowerCase()
  return (
    f.includes('forwarding-noreply@google.com') ||
    f.includes('mail-settings.google.com') ||
    s.includes('forwarding confirmation') ||
    s.includes('confirmación de reenvío') ||
    s.includes('confirmacion de reenvio') ||
    s.includes('gmail forwarding') ||
    (s.includes('reenviar') && s.includes('gmail')) ||
    (s.includes('confirmaci') && s.includes('gmail'))
  )
}

/** Extrae la URL de confirmación de reenvío de Gmail del cuerpo del email. */
export function extractGmailConfirmUrl(text: string): string | null {
  // Gmail usa mail.google.com o mail-settings.google.com según el idioma/región
  const m = text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/vf-[^\s<>"]+/)
  if (!m) return null
  // Limpiar posible puntuación trailing
  return m[0].replace(/[.,;)>\]'"]+$/, '')
}
