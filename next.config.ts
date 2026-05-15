import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
