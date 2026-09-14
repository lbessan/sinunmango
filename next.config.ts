import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Puppeteer + el Chromium serverless de @sparticuz NO deben bundlearse: el
  // paquete resuelve su binario por una ruta relativa a su propio directorio
  // (node_modules/@sparticuz/chromium/bin). Si el bundler lo relocaliza, esa
  // carpeta "no existe" en runtime y la generacion de PDF explota:
  //   "The input directory .../@sparticuz/chromium/bin does not exist ...
  //    you must externalize @sparticuz/chromium so it is not relocated"
  // Next 16 buildea con Turbopack por default y NO respeta la lista interna de
  // auto-externalizacion como lo hacia webpack, asi que hay que declararlo.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  // Los binarios de Chromium (bin/*.br) los carga @sparticuz por una ruta
  // calculada en runtime (dirname/../../bin), NO por require, asi que el
  // file-tracing de Next no los detecta y no los sube al deploy -> en Vercel
  // el bin/ "no existe". Los forzamos a incluirse en las 2 rutas que generan
  // PDF. (glob resuelto desde la raiz del proyecto)
  outputFileTracingIncludes: {
    '/api/monotributo/afip/factura-pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/reportes/mes-pdf':             ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  images: {
    // Permitir cargar imágenes desde Supabase Storage (cuenta.imagen_url,
    // cuenta.imagen_banner_url, etc. que el user sube via /api/upload-imagen).
    // Las imágenes en /public (logo.png, manguito.png, /banks/*, /cards/*)
    // funcionan por defecto sin esta config.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Subida de source maps en build. Solo corre si SENTRY_AUTH_TOKEN está seteado
  // (env var de Vercel, no del cliente). Sin token, el wrap es no-op para subida
  // pero deja activos los hooks runtime.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: !process.env.CI,

  // No subir source maps a Sentry si falta el auth token (típico en dev).
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Túnel para que ad-blockers no rompan el envío de eventos (Sentry los
  // recibe via una ruta del propio app en vez del dominio sentry.io).
  tunnelRoute: "/monitoring",

  // No mandar telemetría del propio plugin de Sentry a sentry.io.
  telemetry: false,

  // Incluir más chunks del cliente en la subida de source maps (mejor stack
  // trace en errores de páginas servidas via lazy import).
  widenClientFileUpload: true,
});
