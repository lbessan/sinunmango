import 'server-only'

// ─── Reporte mensual PDF — PUPPETEER LAYER ────────────────────────────────────
//
// Convierte HTML string en PDF binary via Chrome headless.
// En producción usa @sparticuz/chromium (build optimizado para serverless
// con tamaño ~50MB). En dev local usa puppeteer completo si está disponible.
//
// Bundle size:
//   - puppeteer-core: ~3MB
//   - @sparticuz/chromium: ~50MB
//   = ~53MB total. Vercel Hobby tope 50MB → NO entra. Vercel Pro 250MB → entra.
//
// Cold start típico: 3-5s en levantar Chromium en serverless. Caché de
// la lambda mantiene el browser warm si hay llamadas seguidas, pero asumimos
// peor caso siempre.
//
// Memoria: ~512MB-1GB durante el render. Vercel Pro default es 1024MB.

import type { Browser, LaunchOptions, PaperFormat } from 'puppeteer-core'

// Carga lazy para evitar import-time cost. chromium pesa, no la queremos
// inicializada en cada lambda cold start si la route no se llama.
async function getBrowser(): Promise<Browser> {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

  if (isProd) {
    const { default: chromium } = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')

    const launchOpts: LaunchOptions = {
      args:            chromium.args,
      executablePath:  await chromium.executablePath(),
      headless:        true,
    }
    return puppeteer.launch(launchOpts) as Promise<Browser>
  } else {
    // En dev local: si el dev tiene `puppeteer` completo instalado, lo usa.
    // Si no, va a fallar con un mensaje claro — instalar puppeteer en dev
    // es opt-in.
    try {
      // dinámico para no romper compile si no está
      const puppeteerFull = await import('puppeteer' as never) as { launch: (opts: LaunchOptions) => Promise<Browser> }
      return puppeteerFull.launch({ headless: true })
    } catch {
      throw new Error(
        '[reporte-mes/pdf] En dev local necesitás instalar `puppeteer` completo: ' +
        '`npm i -D puppeteer`. En producción usamos @sparticuz/chromium.',
      )
    }
  }
}

export type PdfOptions = {
  format?:       PaperFormat
  marginMm?:     { top?: number; right?: number; bottom?: number; left?: number }
  printBackground?: boolean
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Uint8Array> {
  let browser: Browser | undefined
  try {
    browser = await getBrowser()
    const page = await browser.newPage()

    // setContent espera el HTML completo y lo renderiza. Esperamos al
    // load event — nuestro HTML es self-contained (sin imágenes/fonts
    // remotos por diseño), así que load alcanza. Si en el futuro sumamos
    // <img> externos cambiar a 'networkidle' (la versión 25 ya no expone
    // 'networkidle0' como literal en el tipo, pero el comportamiento de
    // 'load' aplica para nuestro caso).
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 })

    const margin = opts.marginMm ?? { top: 14, right: 14, bottom: 14, left: 14 }
    const pdfBuffer = await page.pdf({
      format:           opts.format ?? 'A4',
      printBackground:  opts.printBackground ?? true,  // queremos los gradients del header
      margin: {
        top:    `${margin.top    ?? 14}mm`,
        right:  `${margin.right  ?? 14}mm`,
        bottom: `${margin.bottom ?? 14}mm`,
        left:   `${margin.left   ?? 14}mm`,
      },
      preferCSSPageSize: false,
    })

    // page.pdf() devuelve Uint8Array en versiones nuevas; en runtime Node
    // sigue siendo compatible con Buffer.
    return new Uint8Array(pdfBuffer)
  } finally {
    if (browser) {
      // No esperamos al close — si falla por algún reason no queremos
      // que el handler también explote.
      browser.close().catch(err => {
        console.warn('[reporte-mes/pdf] browser.close failed:', err)
      })
    }
  }
}
