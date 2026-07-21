# Conector AFIP/ARCA para monotributo — Investigación y decisiones

> Documento de referencia. Cómo automatizar la lectura de datos de monotributo
> (categoría, facturación, recategorización) desde AFIP/ARCA, tanto para un
> usuario individual como para una plataforma multiusuario (ej. empresa con
> muchos empleados monotributistas). Incluye lo que se investigó, las opciones
> reales, y las decisiones que tomamos.

Fecha: 2026-07. AFIP se renombró **ARCA** (2024/2025); a nivel técnico los web
services y la mecánica siguen igual.

---

## 1. Qué datos se pueden obtener y de dónde

| Dato | Fuente | Privacidad |
|---|---|---|
| **Categoría de monotributo**, régimen, actividades, estado | Web service **Constancia de Inscripción** (`ws_sr_constancia_inscripcion`) / Padrón Alcance 10 | **Semi-público**: consultable por CUIT con UN certificado autorizado (no requiere acción del titular) |
| **Facturación emitida** (para el tope / recategorización) | (a) **WSFEv1** — `FECompUltimoAutorizado` + `FECompConsultar` (recorrer comprobantes por punto de venta y sumar); o (b) automation **"Mis Comprobantes"** | **Privado** del titular → requiere su certificado propio o su clave fiscal |

Clave: **la categoría es fácil y sin fricción; la facturación es privada** y necesita autorización del titular.

---

## 2. El mito del "login con AFIP" (OAuth)

**AFIP NO tiene OAuth ni "iniciar sesión con AFIP" para apps de terceros.** No
existe el flujo redirect → login → callback con token.

Además AFIP es explícito: la **clave fiscal es "personal, segura e
intransferible"**; *en ninguna circunstancia* hay que compartirla ni cargarla en
sistemas de terceros (RG 3713 → el titular es responsable de su uso).

Consecuencia: "que el usuario se loguee en NUESTRA plataforma y leemos sus datos
por dentro" = **tener/usar su clave fiscal** = scraping del portal. Se puede,
pero:
- Es lo que AFIP dice que NO se haga.
- Es **frágil**: si el usuario tiene 2FA (ARCA lo está empujando), el login
  automático se traba (necesita el código cada vez → muere el cron en background).
- No se puede "espiar" una sesión que el usuario abrió por su cuenta: solo
  funciona si la credencial la maneja tu backend.

**Decisión: descartar el camino de clave fiscal / scraping como base.**

---

## 3. Los dos modelos de autenticación reales

### Modelo A — Certificado propio por usuario (RECOMENDADO)
- Cada usuario genera **su propio certificado digital** en AFIP (una vez) y lo
  asocia a los servicios que quiera exponer (Constancia, WSFE).
- El **certificado reemplaza a la clave fiscal** en cada consulta. La clave
  fiscal se usa **una sola vez, en el sitio de AFIP**, para crear el cert —
  nunca la toca la plataforma.
- La plataforma guarda `cert + clave privada` (encriptados) y consulta los datos
  **de ese usuario** (su cert → sus datos).
- ✅ Limpio, legal, sin passwords, **sin delegación** (es tu cert para tus datos).
- ⚠️ Fricción: wizard guiado de ~5 min por persona, una vez.

### Modelo B — Un certificado de empresa + delegación
- La empresa tiene **un** certificado (computador fiscal). Cada titular **delega**
  el web service al CUIT de la empresa vía **"Administrador de Relaciones de Clave
  Fiscal"** (el titular delega, la empresa acepta).
- Es como funcionan los sistemas contables (SOS Contador, Colppy, Xubio…).
- ✅ Un solo cert para muchos.
- ⚠️ Cada titular hace un paso de delegación en AFIP.

**Insight clave:** la **delegación solo hace falta si querés UN cert para leer a
muchos**. Si cada usuario trae su propio cert (Modelo A), **no hay a quién
delegar**.

---

## 4. Arquitectura multiusuario (ej. empresa → empleados)

RRHH quiere ver, de cada empleado: categoría, facturación, % del tope,
recategorización. **AFIP entrega los datos por CUIT; que RRHH los vea es un rol
en TU plataforma, no un tema de AFIP.** Se parte en dos niveles:

**Nivel 1 — Categoría + recategorización de TODOS, sin fricción.**
Con **un certificado de la empresa** autorizado para *Constancia de Inscripción*,
consultás la constancia de **cualquier CUIT**. Cargás la lista de CUITs de
empleados → RRHH ve categoría, estado y alertas de recategorización de todos.
Cero onboarding.

**Nivel 2 — Facturación (avance del tope), solo de quien conecta.**
Es dato privado → necesita el **cert propio del empleado** (wizard). El que
conecta, RRHH ve su facturación del semestre; el que no, solo la categoría.

Panel de RRHH (tabla): `Empleado | Categoría | Facturado (semestre) | % del tope
| Próx. recat. | Estado (conectado / pedir conexión)`. Alertas automáticas cerca
del tope / recategorización.

Por dentro: roles (`empleado`, `rrhh/admin`); cron diario que por cada empleado
con cert consulta WSFE (suma facturación del semestre) y por cada CUIT consulta
Constancia (categoría); guarda snapshot; el dashboard lee el snapshot.

**No saltear (legal):** la facturación es dato **personal** del empleado (puede
facturarle a terceros, no solo a la empresa). Al conectar el cert debe **aceptar
explícitamente** que RRHH la vea.

---

## 5. Herramientas

- **Arca SDK** ([afipts.com](https://www.afipts.com/), `@arcasdk/core`) — librería
  TypeScript MIT, **corre serverless (Vercel)**, maneja WSAA/token, soporta
  facturación, padrón, constancia, y SOAP genérico. Ideal para Modelo A
  self-hosted, gratis.
- **Afip SDK** ([afipsdk.com](https://afipsdk.com/)) — plataforma hosted; maneja
  WSAA, delegar/aceptar servicios, generación de certificados, y **automations**
  ("Mis Comprobantes", "Monotributo"). Free: 100 automations/mes; pago desde
  ~US$50/mes por 1.000. Útil si se va por automations o para simplificar la
  creación de certificados.

Web services oficiales: `ws_sr_constancia_inscripcion` (categoría), `wsfev1`
(`FECompUltimoAutorizado` + `FECompConsultar` para leer emitidos). Auth vía
**WSAA** (certificado X.509 → token+sign, válido 12 h).

---

## 6. Caveats

- **Los certificados de ARCA vencen** (~2 años) → hay que manejar renovación.
- **"Mis Comprobantes"** muestra hasta el día anterior; **WSFE** es al instante.
- Guardar clave privada (o, peor, clave fiscal) = **superficie sensible** →
  encriptar siempre en reposo.
- El "botón mágico" no existe puro: AFIP obliga a un paso manual del titular en
  su sitio (crear/asociar el cert, o delegar). Lo más cercano a "un botón": que
  el usuario ponga la clave fiscal **una sola vez** y una automation genere el
  cert por él (gris pero transitorio).

---

## 7. Decisiones tomadas

1. **Base = Modelo A (certificado propio por usuario).** Nada de clave fiscal en
   la plataforma.
2. **Wizard guiado** para que el usuario genere su cert (generamos keypair + CSR;
   el usuario lo sube a AFIP, asocia el servicio, y pega el cert de vuelta).
3. **Guardar `cert + clave privada` encriptados.**
4. **Nivel 1 (categoría) sin fricción** con cert de empresa cuando sea
   multiusuario; **Nivel 2 (facturación)** con cert propio de quien conecta.
5. **Delegación (Modelo B)** solo si se decide un único cert de empresa para
   leer a muchos — evitable con Modelo A.

---

## 8. Fuentes

- Afip SDK — servicios y automations: https://afipsdk.com/
- Afip SDK — precios: https://afipsdk.com/pricing/
- Afip SDK — delegar web service: https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/delegar-web-service
- Arca SDK (afipts.com): https://www.afipts.com/
- Padrón / Constancia de Inscripción (docs): https://docs.afipsdk.com/siguientes-pasos/web-services/padron-de-constancia-de-inscripcion
- WSFEv1 / factura electrónica (ARCA): https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp
- Monotributo + web services (ARCA): https://www.afip.gob.ar/facturacion/monotributo/modalidades.asp
- Administrador de Relaciones (guía ARCA): https://serviciosweb.afip.gob.ar/genericos/guiadetramites/VerGuia.aspx?tr=19
- Clave fiscal — seguridad (no compartir): https://www.afip.gob.ar/clavefiscal/ayuda/Consejos-de-seguridad.asp
