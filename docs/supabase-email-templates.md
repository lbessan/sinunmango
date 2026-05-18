# Plantillas de email — Supabase Auth (sinunmango)

Versionadas acá porque Supabase Dashboard no las guarda en git. Si cambiás
el HTML, **actualizá este archivo también** para que quede el histórico.

## Cómo aplicar

1. Supabase Dashboard → tu proyecto → **Authentication → Emails** → elegí la
   plantilla del menú lateral.
2. En el campo **Subject** pegá el subject de la sección correspondiente.
3. En el campo **Body** apretá **Source** y reemplazá todo el contenido por
   el HTML.
4. **Save changes**.
5. Probá: registrate / pedí reset / etc. con un email tuyo y verificá que
   llegue y se vea bien.

## Variables que provee Supabase (Go template syntax)

| Variable | Qué es |
|---|---|
| `{{ .ConfirmationURL }}` | URL absoluta que confirma la acción y loguea al user. Usar siempre como `href` del botón principal. |
| `{{ .Token }}` | Código OTP de 6 dígitos (no lo usamos; aplicaría si activamos OTP en lugar de link). |
| `{{ .TokenHash }}` | Hash del token (uso interno). |
| `{{ .SiteURL }}` | URL del sitio configurada en `Authentication → URL Configuration`. |
| `{{ .Email }}` | Email del destinatario. |
| `{{ .RedirectTo }}` | URL adonde Supabase redirige tras confirmar (la que mandamos como `emailRedirectTo` desde el cliente). |

## Notas de diseño

- **Tablas para layout** (no flexbox/grid): Outlook/Yahoo/iOS Mail viejos no
  los soportan bien. Las tablas son la forma confiable de hacer email HTML.
- **Inline styles** en lugar de `<style>`: Gmail Web ignora la mayoría del
  CSS en `<style>`. Todo crítico va inline.
- **Width fijo ~560px**: máximo en email clients modernos antes de que
  empiecen a comprimir. Mobile responsivo via `max-width:100%`.
- **Logo**: `/logo.png` (sin fondo, manguito asomando del bolsillo) sobre
  el gradiente azul del header. Se ve clean.
- **Fuente**: stack del sistema (San Francisco / Segoe UI / Roboto). No
  cargamos webfonts en email — la mayoría de clients los bloquean igual.
- **Botón**: tabla con bg lineal-gradient + `<a>` interno con padding. En
  clients que no entienden gradient cae al background-color fallback (azul
  oscuro `#1B3A6B`).

---

## 1) Confirm sign up

**Subject:**

```
Confirmá tu cuenta en sinunmango
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Confirmá tu cuenta en sinunmango</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">

        <!-- Header -->
        <tr><td style="background-color:#0d2137;background-image:linear-gradient(135deg,#0d2137 0%,#1a6b5a 100%);padding:36px 24px;text-align:center;">
          <img src="https://app.sinunmango.com.ar/logo.png" alt="sinunmango" width="64" height="64" style="display:block;margin:0 auto 14px;width:64px;height:64px;border:0;">
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.3px;line-height:1;">
            <span style="color:#ffffff;">sinun</span><span style="color:#f97316;">mango</span>
          </div>
        </td></tr>

        <!-- Contenido -->
        <tr><td style="padding:36px 32px 8px 32px;">
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;line-height:1.3;">¡Bienvenido a sinunmango!</h2>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475569;">
            Te diste de alta con este email. Para activar tu cuenta y empezar a usar la app,
            confirmá que esta dirección es tuya.
          </p>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#475569;">
            Tocá el botón de abajo:
          </p>

          <!-- Botón principal -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px;">
            <tr><td align="center" style="border-radius:12px;background-color:#1B3A6B;background-image:linear-gradient(90deg,#1B3A6B 0%,#1a6b5a 100%);">
              <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">
                Confirmar mi cuenta
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#94a3b8;">
            ¿No te funciona el botón? Copiá y pegá este link en tu navegador:
          </p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#1a6b5a;text-decoration:underline;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
          <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#94a3b8;">
            Si no creaste una cuenta en sinunmango, podés ignorar este email tranquilo.
            Tu cuenta no se activa hasta que confirmes este link.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
            <a href="https://app.sinunmango.com.ar" style="color:#475569;text-decoration:none;">app.sinunmango.com.ar</a>
            &nbsp;·&nbsp;
            <a href="https://app.sinunmango.com.ar/privacidad" style="color:#475569;text-decoration:none;">Política de privacidad</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 2) Reset password

**Subject:**

```
Recuperá tu contraseña de sinunmango
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Recuperá tu contraseña</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">

        <tr><td style="background-color:#0d2137;background-image:linear-gradient(135deg,#0d2137 0%,#1a6b5a 100%);padding:36px 24px;text-align:center;">
          <img src="https://app.sinunmango.com.ar/logo.png" alt="sinunmango" width="64" height="64" style="display:block;margin:0 auto 14px;width:64px;height:64px;border:0;">
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.3px;line-height:1;">
            <span style="color:#ffffff;">sinun</span><span style="color:#f97316;">mango</span>
          </div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px 32px;">
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;line-height:1.3;">Recuperá tu contraseña</h2>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475569;">
            Pediste resetear tu contraseña de sinunmango. Tocá el botón de abajo y vas a
            poder elegir una nueva. El link es válido por <strong>1 hora</strong>.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 28px;">
            <tr><td align="center" style="border-radius:12px;background-color:#1B3A6B;background-image:linear-gradient(90deg,#1B3A6B 0%,#1a6b5a 100%);">
              <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">
                Elegir nueva contraseña
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#94a3b8;">
            ¿No te funciona el botón? Copiá y pegá este link:
          </p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#1a6b5a;text-decoration:underline;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
          <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#94a3b8;">
            <strong style="color:#475569;">¿No pediste resetear tu contraseña?</strong>
            Ignorá este email. Tu contraseña sigue siendo la misma y nadie tiene acceso
            a tu cuenta a menos que abra este link.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
            <a href="https://app.sinunmango.com.ar" style="color:#475569;text-decoration:none;">app.sinunmango.com.ar</a>
            &nbsp;·&nbsp;
            <a href="https://app.sinunmango.com.ar/privacidad" style="color:#475569;text-decoration:none;">Política de privacidad</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 3) Magic Link

> **Nota:** hoy no estamos usando Magic Link, pero la plantilla viene
> activada por default en Supabase. Mejor tenerla bien por si la usamos
> en el futuro o si alguien dispara `signInWithOtp()` por error.

**Subject:**

```
Tu link de acceso a sinunmango
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tu link de acceso</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">

        <tr><td style="background-color:#0d2137;background-image:linear-gradient(135deg,#0d2137 0%,#1a6b5a 100%);padding:36px 24px;text-align:center;">
          <img src="https://app.sinunmango.com.ar/logo.png" alt="sinunmango" width="64" height="64" style="display:block;margin:0 auto 14px;width:64px;height:64px;border:0;">
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.3px;line-height:1;">
            <span style="color:#ffffff;">sinun</span><span style="color:#f97316;">mango</span>
          </div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px 32px;">
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;line-height:1.3;">Tu link de acceso</h2>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475569;">
            Pediste iniciar sesión en sinunmango sin contraseña. Tocá el botón y
            entrás directo a tu cuenta. El link expira en <strong>1 hora</strong>.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 28px;">
            <tr><td align="center" style="border-radius:12px;background-color:#1B3A6B;background-image:linear-gradient(90deg,#1B3A6B 0%,#1a6b5a 100%);">
              <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">
                Iniciar sesión
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#94a3b8;">
            ¿No te funciona el botón? Copiá y pegá este link:
          </p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#1a6b5a;text-decoration:underline;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
          <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#94a3b8;">
            <strong style="color:#475569;">¿No pediste iniciar sesión?</strong>
            Ignorá este email. Nadie puede entrar a tu cuenta sin tocar este link.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
            <a href="https://app.sinunmango.com.ar" style="color:#475569;text-decoration:none;">app.sinunmango.com.ar</a>
            &nbsp;·&nbsp;
            <a href="https://app.sinunmango.com.ar/privacidad" style="color:#475569;text-decoration:none;">Política de privacidad</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 4) Change Email Address

> Este email se envía a **la nueva dirección** cuando el user pide
> cambiar el email de su cuenta. Hoy no exponemos esa feature en la UI,
> pero conviene tenerlo branded por si lo usamos a futuro o si alguien
> hace el cambio por API.

**Subject:**

```
Confirmá el cambio de email en sinunmango
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Confirmá el cambio de email</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">

        <tr><td style="background-color:#0d2137;background-image:linear-gradient(135deg,#0d2137 0%,#1a6b5a 100%);padding:36px 24px;text-align:center;">
          <img src="https://app.sinunmango.com.ar/logo.png" alt="sinunmango" width="64" height="64" style="display:block;margin:0 auto 14px;width:64px;height:64px;border:0;">
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.3px;line-height:1;">
            <span style="color:#ffffff;">sinun</span><span style="color:#f97316;">mango</span>
          </div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px 32px;">
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;line-height:1.3;">Confirmá el nuevo email</h2>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475569;">
            Pediste cambiar el email de tu cuenta de sinunmango a esta dirección.
            Para que el cambio se efectivice, confirmá tocando el botón:
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 28px;">
            <tr><td align="center" style="border-radius:12px;background-color:#1B3A6B;background-image:linear-gradient(90deg,#1B3A6B 0%,#1a6b5a 100%);">
              <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">
                Confirmar nuevo email
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#94a3b8;">
            ¿No te funciona el botón? Copiá y pegá este link:
          </p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#1a6b5a;text-decoration:underline;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
          <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#94a3b8;">
            <strong style="color:#475569;">¿No pediste cambiar tu email?</strong>
            Ignorá este mensaje. El email de tu cuenta no cambia hasta que toques
            el botón de confirmación.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
            <a href="https://app.sinunmango.com.ar" style="color:#475569;text-decoration:none;">app.sinunmango.com.ar</a>
            &nbsp;·&nbsp;
            <a href="https://app.sinunmango.com.ar/privacidad" style="color:#475569;text-decoration:none;">Política de privacidad</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 5) Otras plantillas (no críticas)

Las siguientes están en el panel de Supabase pero hoy no aplican porque
no exponemos esas features:

- **Invite user** — solo se dispara si llamás `inviteUserByEmail()`
  desde el admin. No lo hacemos.
- **Reauthentication** — pide código para reconfirmar identidad antes
  de operaciones sensibles. No lo usamos.

Si en el futuro las activamos, copiar uno de los 4 templates de arriba
y ajustar los textos.

---

## Configurar SMTP custom con Resend

El proyecto ya usa Resend para el inbound de emails de banco y para los
crons de alertas (`alertas@sinunmango.com.ar`). El dominio
`sinunmango.com.ar` ya está verificado en Resend, así que podemos usarlo
también como SMTP saliente de Supabase Auth — sin configuración extra de
DNS.

### Por qué hace falta

Por default Supabase usa un SMTP shared con **límites estrictos** (~3-4
emails/hora por proyecto en free tier). Al abrir a público, si se
registran varios users en la misma hora, los últimos fallan con
"rate limit exceeded" y se pierden.

### 1. En Resend Dashboard

Verificá tu API key actual en
[resend.com/api-keys](https://resend.com/api-keys):

- Si es **Full access** o **Sending access** → sirve, usá esa.
- Si es **Receiving access only** → tenés que crear una nueva con
  Permission: **Sending access** y Domain: `sinunmango.com.ar`.

Anotá el valor (`re_...`); lo vas a usar como password en Supabase.

### 2. En Supabase Dashboard

`Authentication → Emails → SMTP Settings`

| Campo | Valor |
|---|---|
| **Enable Custom SMTP** | ✅ ON |
| **Sender email** | `cuenta@sinunmango.com.ar` |
| **Sender name** | `sinunmango` |
| **Host** | `smtp.resend.com` |
| **Port number** | `465` |
| **Username** | `resend` (literal — no es un email) |
| **Password** | Tu `RESEND_API_KEY` (`re_...`) |
| **Minimum interval between emails** | `60` (segundos) |

Después de **Save**, usá el botón **Send test email** con un email
tuyo para verificar antes de probar el flow real.

### ¿Por qué `cuenta@` y no `alertas@`?

Hoy `alertas@sinunmango.com.ar` se usa para los crons (resumen semanal,
alertas de vencimiento). Auth y alertas tienen propósito distinto:

- **Auth** → emails transaccionales 1:1 que el user espera de inmediato.
  Tienen que llegar al inbox principal.
- **Alertas** → emails periódicos en lote. Algunos clients de email los
  filtran a "promociones" / "notificaciones".

Separar los aliases evita que la reputación de un tipo arrastre al otro.
Si el deliverability de las alertas empeora (porque algún user las marca
como spam), no afecta los emails de confirmación de cuenta.

Otros aliases válidos si preferís otro tono:
- `noreply@sinunmango.com.ar` — más frío pero estándar
- `hola@sinunmango.com.ar` — más cálido, pero pueden responder esperando
  un humano del otro lado
- `auth@sinunmango.com.ar` — técnico pero claro

### 3. Subir el rate limit de Supabase

Al activar SMTP custom Supabase a veces NO sube los límites
automáticamente. En `Authentication → Rate Limits`:

| Setting | Free default | Recomendado con Resend |
|---|---|---|
| Token verifications / hour | 30 | 100 |
| Email signups / hour | 2 | 30 |
| Magic Links/OTP / hour | 30 | 100 |

Estos valores son por proyecto Supabase. Si tenés un pico al lanzar
campaña, podés subir más temporariamente.

### 4. Límites de Resend a tener en cuenta

| Plan | Emails/mes | Emails/día |
|---|---|---|
| Free | 3.000 | 100 |
| Pro (USD 20/mes) | 50.000 | sin límite diario |

3000/mes alcanza para ~100 signups + reset passwords + cambios de email
por mes — suficiente para arrancar. Cuando pasés esos volúmenes,
considerar Pro o agregar fallback.

### 5. Domain reputation tip

Como `sinunmango.com.ar` ya manda emails de alertas, Gmail/Outlook ya
tienen un historial del dominio. Si en algún momento el deliverability
empeora (emails caen a spam masivamente):

1. Verificá en Resend Dashboard → Domains → tu dominio que **SPF + DKIM
   + DMARC** estén todos en verde.
2. Postmaster Tools de Google ([postmaster.google.com](https://postmaster.google.com))
   te da métricas de reputación de tu dominio.
3. Si DMARC está fallando, podés tightening en
   `_dmarc.sinunmango.com.ar` con `p=quarantine` o `p=reject` para
   forzar mejor reputación.
