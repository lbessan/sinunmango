-- ─── Migración: separar 'Billetera/Banco' legacy en Banco / Billetera ────────
-- Correr en Supabase → SQL Editor.
-- Hacelo en este orden: 1) inspeccionar, 2) migrar filas, 3) endurecer constraint.

-- ── 1. Inspeccionar filas legacy ──────────────────────────────────────────────
-- Listá todas las cuentas que todavía tienen el tipo legacy. Usá el resultado
-- para decidir cuáles son bancos y cuáles billeteras antes del UPDATE.

SELECT id, nombre_cuenta, institucion, moneda, saldo_inicial, activa
FROM cuentas
WHERE tipo_cuenta = 'Billetera/Banco';


-- ── 2a. (Opción A — preferida) Migrar fila por fila ──────────────────────────
-- Después de mirar el resultado de arriba, escribí un UPDATE por cada cuenta
-- usando el id real. Reemplazá los placeholders con tus datos.
--
-- Ejemplos:
--
-- UPDATE cuentas SET tipo_cuenta = 'Banco CA' WHERE id = 'cta_xxxxxx';   -- Caja de Ahorro
-- UPDATE cuentas SET tipo_cuenta = 'Banco CC' WHERE id = 'cta_xxxxxx';   -- Cuenta Corriente
-- UPDATE cuentas SET tipo_cuenta = 'Billetera' WHERE id = 'cta_xxxxxx'; -- Mercado Pago, Uala, etc.


-- ── 2b. (Opción B — fallback bulk) Convertir TODO a 'Banco CA' ───────────────
-- Si tenés muchas filas y todas son bancos (o si preferís reclasificar después
-- desde la UI), descomentá la siguiente línea.
-- Después podés ir editando una por una desde Cuentas → Editar para cambiar
-- las que sean billeteras.
--
-- UPDATE cuentas SET tipo_cuenta = 'Banco CA' WHERE tipo_cuenta = 'Billetera/Banco';


-- ── 3. Verificar que no queden filas legacy ──────────────────────────────────
SELECT COUNT(*) AS legacy_rows
FROM cuentas
WHERE tipo_cuenta = 'Billetera/Banco';
-- → debe devolver 0 antes de seguir al paso 4.


-- ── 4. (Opcional, recomendado) Endurecer el CHECK constraint ─────────────────
-- Una vez migradas todas las filas, esto evita que vuelva a entrar el valor
-- legacy desde cualquier lado (script, importación, bug futuro).
--
-- Primero buscá el nombre exacto del constraint actual:
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'cuentas'::regclass AND contype = 'c';
--
-- Después dropealo y recreálo con la nueva lista de valores:
--
-- ALTER TABLE cuentas DROP CONSTRAINT IF EXISTS cuentas_tipo_cuenta_check;
-- ALTER TABLE cuentas ADD CONSTRAINT cuentas_tipo_cuenta_check
--   CHECK (tipo_cuenta IN ('Banco CA', 'Banco CC', 'Billetera', 'Efectivo', 'Tarjeta Credito'));
