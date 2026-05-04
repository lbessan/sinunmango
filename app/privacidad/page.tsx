export const metadata = {
  title: 'Política de Privacidad — sinunmango',
  description: 'Política de privacidad de la aplicación sinunmango',
}

export default function PrivacidadPage() {
  const fecha = '4 de mayo de 2026'

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-12">
          <p className="text-sm font-bold tracking-widest text-orange-500 uppercase mb-3">sinunmango</p>
          <h1 className="text-4xl font-black text-slate-900 mb-3">Política de Privacidad</h1>
          <p className="text-slate-400 text-sm">Última actualización: {fecha}</p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">1. Introducción</h2>
            <p>
              sinunmango ("la aplicación", "nosotros") es una aplicación de finanzas personales disponible en Android
              y web. Esta política describe qué información recopilamos, cómo la usamos y cómo la protegemos.
            </p>
            <p className="mt-3">
              Al usar sinunmango aceptás esta política. Si tenés preguntas, podés contactarnos en{' '}
              <a href="mailto:luchobessan@gmail.com" className="text-orange-500 hover:underline">luchobessan@gmail.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">2. Información que recopilamos</h2>

            <h3 className="font-semibold text-slate-800 mb-2">2.1 Información de cuenta</h3>
            <p>
              Al autenticarte con Google, recibimos tu nombre, dirección de email y foto de perfil pública.
              No almacenamos tu contraseña de Google — la autenticación es gestionada íntegramente por Google OAuth.
            </p>

            <h3 className="font-semibold text-slate-800 mt-4 mb-2">2.2 Datos financieros personales</h3>
            <p>Los datos que vos cargás voluntariamente en la app:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-slate-600">
              <li>Cuentas bancarias, billeteras y efectivo (nombre, saldo)</li>
              <li>Movimientos de dinero (gastos, ingresos, transferencias)</li>
              <li>Tarjetas de crédito y sus fechas de cierre/vencimiento</li>
              <li>Gastos fijos recurrentes</li>
              <li>Inversiones (plazo fijo, FCI, dólar, etc.)</li>
              <li>Categorías y subcategorías personalizadas</li>
            </ul>

            <h3 className="font-semibold text-slate-800 mt-4 mb-2">2.3 Imágenes de cámara</h3>
            <p>
              La app solicita permiso de cámara únicamente para escanear tickets y comprobantes físicos.
              Las imágenes se procesan para extraer datos del gasto y no se almacenan de forma permanente.
              El análisis se realiza mediante la API de Claude (Anthropic).
            </p>

            <h3 className="font-semibold text-slate-800 mt-4 mb-2">2.4 Preferencias de la app</h3>
            <p>
              Guardamos tus preferencias de apariencia (tema de color, modo oscuro/claro)
              y preferencias de notificaciones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">3. Cómo usamos tu información</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li>Mostrarte tu dashboard financiero, resúmenes y proyecciones</li>
              <li>Enviarte alertas opcionales por email (vencimientos, resúmenes semanales/mensuales)</li>
              <li>Permitirte consultar tu situación financiera mediante el asistente Manguito (IA)</li>
              <li>Personalizar la experiencia visual de la app</li>
            </ul>
            <p className="mt-3">
              <strong>No vendemos, compartimos ni cedemos tus datos a terceros</strong> con fines comerciales o publicitarios.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">4. Servicios de terceros</h2>
            <p>sinunmango utiliza los siguientes servicios externos:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2 text-slate-600">
              <li>
                <strong>Supabase</strong> — base de datos y autenticación. Tus datos se almacenan
                en servidores de Supabase con cifrado en tránsito y en reposo.
                <a href="https://supabase.com/privacy" className="text-orange-500 hover:underline ml-1">Política de privacidad</a>
              </li>
              <li>
                <strong>Google OAuth</strong> — inicio de sesión.
                <a href="https://policies.google.com/privacy" className="text-orange-500 hover:underline ml-1">Política de privacidad</a>
              </li>
              <li>
                <strong>Anthropic (Claude API)</strong> — procesamiento de imágenes de tickets y asistente financiero.
                Los datos enviados se usan únicamente para generar la respuesta y no se almacenan por Anthropic para entrenamiento.
                <a href="https://www.anthropic.com/privacy" className="text-orange-500 hover:underline ml-1">Política de privacidad</a>
              </li>
              <li>
                <strong>Resend</strong> — envío de emails de alerta.
                <a href="https://resend.com/legal/privacy-policy" className="text-orange-500 hover:underline ml-1">Política de privacidad</a>
              </li>
              <li>
                <strong>Vercel</strong> — hosting de la aplicación web.
                <a href="https://vercel.com/legal/privacy-policy" className="text-orange-500 hover:underline ml-1">Política de privacidad</a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">5. Seguridad</h2>
            <p>
              Todos los datos se transmiten mediante HTTPS (TLS). La base de datos tiene habilitado
              Row Level Security (RLS), lo que garantiza que cada usuario solo puede acceder a sus propios datos.
              No almacenamos contraseñas — la autenticación es delegada a Google.
            </p>
          </section>

          <section id="eliminacion">
            <h2 className="text-xl font-bold text-slate-900 mb-3">6. Tus derechos y eliminación de cuenta</h2>
            <p>Podés en cualquier momento:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-slate-600">
              <li>Acceder a todos tus datos desde la aplicación</li>
              <li>Solicitar la eliminación completa de tu cuenta y datos</li>
              <li>Desactivar las notificaciones por email desde Configuración</li>
            </ul>

            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
              <h3 className="font-bold text-slate-800 mb-2">Cómo solicitar la eliminación de tu cuenta</h3>
              <p className="text-slate-600 text-sm mb-3">
                Para eliminar tu cuenta y todos los datos asociados, enviá un email a{' '}
                <a href="mailto:luchobessan@gmail.com" className="text-orange-500 hover:underline">luchobessan@gmail.com</a>{' '}
                con el asunto <strong>"Eliminar cuenta sinunmango"</strong> desde la dirección de email
                con la que te registraste.
              </p>
              <p className="text-slate-600 text-sm mb-3">
                Procesamos las solicitudes dentro de los <strong>7 días hábiles</strong>. Al eliminar tu cuenta se borran:
              </p>
              <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                <li>Tu perfil y datos de acceso</li>
                <li>Todos tus movimientos, cuentas y tarjetas</li>
                <li>Tus categorías, gastos fijos e inversiones</li>
                <li>Tus preferencias y configuración</li>
              </ul>
              <p className="text-slate-500 text-xs mt-3">
                Nota: la vinculación con tu cuenta de Google se gestiona desde{' '}
                <a href="https://myaccount.google.com/permissions" className="text-orange-500 hover:underline" target="_blank">
                  myaccount.google.com/permissions
                </a>.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">7. Menores de edad</h2>
            <p>
              sinunmango no está dirigida a menores de 13 años. No recopilamos intencionalmente
              información de menores. Si creés que un menor ha creado una cuenta, contactanos
              para eliminarla.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">8. Cambios a esta política</h2>
            <p>
              Podemos actualizar esta política ocasionalmente. Notificaremos cambios importantes
              mediante la aplicación o por email. La fecha de "última actualización" al inicio
              de esta página siempre refleja la versión vigente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">9. Contacto</h2>
            <p>
              Para cualquier consulta sobre esta política de privacidad:
            </p>
            <p className="mt-2">
              <strong>sinunmango</strong><br />
              <a href="mailto:luchobessan@gmail.com" className="text-orange-500 hover:underline">luchobessan@gmail.com</a>
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-slate-100">
          <p className="text-xs text-slate-400 text-center">
            © 2026 sinunmango · <a href="https://app.sinunmango.com.ar" className="hover:underline">app.sinunmango.com.ar</a>
          </p>
        </div>

      </div>
    </div>
  )
}
