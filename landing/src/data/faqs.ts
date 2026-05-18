// ─── FAQs centralizados ──────────────────────────────────────────────────────
//
// Source of truth: este archivo. Lo consumen:
//   - FAQ.astro → renderea las preguntas en la sección FAQ de la home
//   - index.astro → genera el JSON-LD FAQPage para rich snippets de Google
//
// Si tocás un texto acá, los dos lugares quedan en sync.

export type FAQ = { q: string; a: string };

export const FAQS: FAQ[] = [
  {
    q: "¿Es gratis?",
    a: "Sí, hay un plan Free para siempre con todo lo importante: cargar movimientos, cuentas, tarjetas, gastos fijos, inversiones, dashboard y proyecciones. Lo único limitado en Free son los flows con IA (Manguito, importación por mail, PDF de tarjeta, foto de ticket) que tienen un cupo mensual. Si querés esos ilimitados, hay Pro a $3.499/mes con 7 días gratis de prueba — mirá la sección de Planes más abajo.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Tu información vive en Supabase con Row Level Security: a nivel base de datos cada usuario solo puede leer y escribir lo suyo. El login es con Google o email + contraseña (nunca guardamos contraseñas en texto plano) y podés activar 2FA con app autenticadora. La app nunca tiene tus credenciales del home banking ni acceso por API a tu cuenta: vos elegís qué reenviás. Los PDFs y emails se procesan al momento, los movimientos quedan guardados, el archivo original no se conserva.",
  },
  {
    q: "¿Cómo se cargan los movimientos sin tener que tipear todo?",
    a: "Hay tres caminos y los podés combinar: (1) cuando creás la cuenta te damos una dirección @sinunmango.com.ar y reenviás ahí las notificaciones de tu banco; los movimientos se registran solos. (2) Subís el PDF de tu resumen de tarjeta y la IA detecta banco, red, variante y todos los consumos. (3) Le mandás un mensaje a Manguito (“gasté $4.500 en el súper”) y lo carga por vos. Y si querés, también podés cargar a mano o escanear un ticket con la cámara.",
  },
  {
    q: "¿Qué bancos soporta la importación por mail?",
    a: "Cualquier banco que te mande emails de notificación de movimientos. La app no se conecta al banco — vos reenviás los mails que ya recibís hoy a la dirección que te damos, y un parser con IA los procesa. Probado con: Galicia, Banco Frances (BBVA), Mercado Pago, Modo, Brubank, ICBC, Ualá y Provincia. Si tu banco no anda bien, contame y lo agregamos.",
  },
  {
    q: "¿En qué dispositivos puedo usarla?",
    a: "Hay app nativa de Android publicada en Google Play. Para iPhone no tenemos app nativa pero la web funciona perfecto en Safari y se puede agregar a la pantalla de inicio (Compartir → Agregar a pantalla de inicio): queda como una app más, con su ícono, sin barra de browser. Y desde la compu también la abrís en cualquier navegador.",
  },
  {
    q: "¿Cómo te contacto si encuentro un bug?",
    a: "Escribime a luchobessan@gmail.com. Es una app personal así que la respuesta llega rápido.",
  },
];

/** JSON-LD FAQPage para rich snippets. Inyectar en <head>. */
export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  };
}
