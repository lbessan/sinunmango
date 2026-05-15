import { describe, it, expect } from 'vitest'
import { isGmailVerificationEmail, extractGmailConfirmUrl } from '@/lib/gmail-verification'

describe('isGmailVerificationEmail', () => {
  it('matchea por from forwarding-noreply@google.com', () => {
    expect(isGmailVerificationEmail('Cualquier asunto', 'forwarding-noreply@google.com')).toBe(true)
  })

  it('matchea subject "forwarding confirmation"', () => {
    expect(isGmailVerificationEmail('Gmail Forwarding Confirmation', 'noreply@google.com')).toBe(true)
  })

  it('matchea subject "confirmación de reenvío" (con tilde)', () => {
    expect(isGmailVerificationEmail('Confirmación de reenvío', 'a@b.com')).toBe(true)
  })

  it('matchea subject "confirmacion de reenvio" (sin tilde)', () => {
    expect(isGmailVerificationEmail('Confirmacion de reenvio', 'a@b.com')).toBe(true)
  })

  it('matchea variantes "reenviar X gmail"', () => {
    expect(isGmailVerificationEmail('Reenviar tus mails desde Gmail', 'a@b.com')).toBe(true)
  })

  it('matchea variantes "confirmaci... gmail"', () => {
    // El check es subject.includes('confirmaci') (no "confirma"), para evitar
    // match con "confirma tu cuenta" no relacionadas a Gmail forwarding.
    expect(isGmailVerificationEmail('Confirmación de tu Gmail', 'a@b.com')).toBe(true)
    expect(isGmailVerificationEmail('Confirma tu Gmail', 'a@b.com')).toBe(false)
  })

  it('no matchea emails normales', () => {
    expect(isGmailVerificationEmail('Tu resumen mensual', 'banco@ejemplo.com')).toBe(false)
    expect(isGmailVerificationEmail('Movimiento de tarjeta', 'tarjetas@galicia.com.ar')).toBe(false)
  })

  it('case insensitive', () => {
    expect(isGmailVerificationEmail('GMAIL FORWARDING', 'A@B.COM')).toBe(true)
  })
})

describe('extractGmailConfirmUrl', () => {
  it('extrae URL con dominio mail.google.com', () => {
    const text = 'Para confirmar: https://mail.google.com/mail/vf-abc123-xyz'
    expect(extractGmailConfirmUrl(text)).toBe('https://mail.google.com/mail/vf-abc123-xyz')
  })

  it('extrae URL con dominio mail-settings.google.com', () => {
    const text = 'Confirma en https://mail-settings.google.com/mail/vf-XYZ789'
    expect(extractGmailConfirmUrl(text)).toBe('https://mail-settings.google.com/mail/vf-XYZ789')
  })

  it('limpia puntuación trailing', () => {
    expect(extractGmailConfirmUrl('Click https://mail.google.com/mail/vf-abc.'))
      .toBe('https://mail.google.com/mail/vf-abc')
    expect(extractGmailConfirmUrl('URL: https://mail.google.com/mail/vf-abc).'))
      .toBe('https://mail.google.com/mail/vf-abc')
  })

  it('devuelve null si no hay URL de Gmail', () => {
    expect(extractGmailConfirmUrl('Sin URL relevante')).toBeNull()
    expect(extractGmailConfirmUrl('https://otro-dominio.com/vf-abc')).toBeNull()
  })

  it('devuelve null si la URL no es de Google', () => {
    expect(extractGmailConfirmUrl('https://gmail.com/mail/vf-abc')).toBeNull()
  })

  it('extrae la primera URL si hay múltiples', () => {
    const text = 'A: https://mail.google.com/mail/vf-aaa B: https://mail.google.com/mail/vf-bbb'
    expect(extractGmailConfirmUrl(text)).toBe('https://mail.google.com/mail/vf-aaa')
  })

  it('matchea con caracteres URL-safe en el path', () => {
    expect(extractGmailConfirmUrl('https://mail.google.com/mail/vf-aB1-2_3'))
      .toBe('https://mail.google.com/mail/vf-aB1-2_3')
  })
})
