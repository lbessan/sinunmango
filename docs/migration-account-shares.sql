-- ─────────────────────────────────────────────────────────────────────────────
-- Account shares — compartir cuentas con otros users.
--
-- Modelo MVP:
--   - Un user (owner) puede compartir una cuenta con otro user (invitee).
--   - La invitación se genera con un token único; el invitee acepta mediante
--     un link compartible.
--   - Roles: 'viewer' (solo ver) o 'editor' (puede crear movimientos en
--     la cuenta compartida).
--   - Expira a los 7 días si no se acepta.
--   - Owner puede revocar en cualquier momento.
--
-- Schema evolucionable:
--   - Si en el futuro queremos "grupos familiares" (1 grupo, N miembros, N
--     cuentas), agregamos tabla groups + group_members, y este modelo de
--     shares por-cuenta convive o se migra.
--   - Si queremos compartir tarjetas/gastos_fijos/inversiones, agregamos
--     tablas paralelas con la misma estructura.
--
-- Privacidad:
--   - Los movimientos pertenecen al user que los creó (user_id).
--   - Las cuentas siguen siendo "owned" por su user_id original; el invitee
--     tiene ACCESO pero no es dueño (no puede borrar, no puede compartir
--     a su vez).
--   - El invitee SOLO ve la cuenta compartida y sus movimientos. NO ve
--     otras cuentas del owner, ni gastos fijos, ni inversiones.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Tabla principal ─────────────────────────────────────────────────────
-- NOTA: cuentas.id es TEXT (los IDs tienen formato `cta_xxx`, no UUID).
-- auth.users.id sí es UUID — eso lo provee Supabase y no podemos cambiarlo.
CREATE TABLE IF NOT EXISTS public.account_shares (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       TEXT         NOT NULL REFERENCES public.cuentas(id)   ON DELETE CASCADE,
  owner_user_id   UUID         NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  invitee_user_id UUID                  REFERENCES auth.users(id)       ON DELETE SET NULL,
  invite_token    TEXT         NOT NULL UNIQUE,
  role            TEXT         NOT NULL CHECK (role IN ('viewer', 'editor')),
  invited_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ  NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

-- Owner no puede invitarse a sí mismo.
ALTER TABLE public.account_shares DROP CONSTRAINT IF EXISTS account_shares_owner_neq_invitee;
ALTER TABLE public.account_shares
  ADD CONSTRAINT account_shares_owner_neq_invitee
  CHECK (invitee_user_id IS NULL OR invitee_user_id != owner_user_id);

-- Una invitación activa por (cuenta, invitee) — no se duplican shares.
DROP INDEX IF EXISTS account_shares_active_unique;
CREATE UNIQUE INDEX account_shares_active_unique
  ON public.account_shares(cuenta_id, invitee_user_id)
  WHERE invitee_user_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS account_shares_owner_idx       ON public.account_shares(owner_user_id);
CREATE INDEX IF NOT EXISTS account_shares_invitee_idx     ON public.account_shares(invitee_user_id);
CREATE INDEX IF NOT EXISTS account_shares_cuenta_idx      ON public.account_shares(cuenta_id);
CREATE INDEX IF NOT EXISTS account_shares_token_idx       ON public.account_shares(invite_token);

COMMENT ON TABLE public.account_shares IS
  'Compartir cuentas con otros usuarios. Owner mantiene control; invitee tiene acceso (viewer o editor).';
COMMENT ON COLUMN public.account_shares.role IS
  'viewer = solo lectura; editor = puede crear movimientos en la cuenta compartida.';
COMMENT ON COLUMN public.account_shares.invite_token IS
  'Token único compartido por link. Si se filtra, quien lo tenga puede aceptar.';

-- ─── 2. RLS en account_shares ──────────────────────────────────────────────
ALTER TABLE public.account_shares ENABLE ROW LEVEL SECURITY;

-- Owner ve TODOS sus shares (incluyendo pendientes y revocados).
DROP POLICY IF EXISTS "account_shares_select_owner" ON public.account_shares;
CREATE POLICY "account_shares_select_owner" ON public.account_shares
FOR SELECT USING (auth.uid() = owner_user_id);

-- Invitee ve solo sus shares ACEPTADOS (no pendientes — el lookup pre-accept
-- pasa por el endpoint server-side con admin client porque no hay invitee_user_id aún).
DROP POLICY IF EXISTS "account_shares_select_invitee" ON public.account_shares;
CREATE POLICY "account_shares_select_invitee" ON public.account_shares
FOR SELECT USING (auth.uid() = invitee_user_id AND accepted_at IS NOT NULL);

-- Owner crea shares. Validamos también que sea dueño de la cuenta.
DROP POLICY IF EXISTS "account_shares_insert_owner" ON public.account_shares;
CREATE POLICY "account_shares_insert_owner" ON public.account_shares
FOR INSERT WITH CHECK (
  auth.uid() = owner_user_id
  AND EXISTS (
    SELECT 1 FROM public.cuentas
    WHERE id = cuenta_id AND user_id = auth.uid()
  )
);

-- Owner actualiza (típicamente solo para revoke).
-- No permitimos UPDATE al invitee — la operación de "accept" pasa por
-- endpoint server-side con admin client (más auditable + sin riesgo de
-- que el invitee cambie su role).
DROP POLICY IF EXISTS "account_shares_update_owner" ON public.account_shares;
CREATE POLICY "account_shares_update_owner" ON public.account_shares
FOR UPDATE USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "account_shares_delete_owner" ON public.account_shares;
CREATE POLICY "account_shares_delete_owner" ON public.account_shares
FOR DELETE USING (auth.uid() = owner_user_id);

-- ─── 3. RLS cuentas: expandir SELECT para invitees ──────────────────────────
-- Un invitee acepta el share → puede LEER la cuenta compartida.
-- INSERT/UPDATE/DELETE de cuentas siguen owner-only (el invitee no puede
-- renombrar la cuenta, ni cambiar fechas de cierre, ni eliminarla).

DROP POLICY IF EXISTS "cuentas_select_own" ON public.cuentas;
DROP POLICY IF EXISTS "cuentas_select"     ON public.cuentas;
CREATE POLICY "cuentas_select" ON public.cuentas FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.account_shares s
    WHERE s.cuenta_id = cuentas.id
      AND s.invitee_user_id = auth.uid()
      AND s.accepted_at IS NOT NULL
      AND s.revoked_at  IS NULL
  )
);

-- ─── 4. RLS movimientos: expandir SELECT + INSERT con shares ─────────────────
-- SELECT: vemos un movimiento si lo creamos NOSOTROS o si toca una cuenta
-- a la que tenemos acceso (origen o destino).
-- INSERT: el editor con share activo puede CREAR movimientos en una cuenta
-- compartida (su user_id queda como autor del movimiento).
-- UPDATE/DELETE: solo el creador original (ese movimiento es "suyo").

DROP POLICY IF EXISTS "movimientos_select_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_select"     ON public.movimientos;
CREATE POLICY "movimientos_select" ON public.movimientos FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    cuenta_origen IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.account_shares s
      WHERE s.cuenta_id = movimientos.cuenta_origen
        AND s.invitee_user_id = auth.uid()
        AND s.accepted_at IS NOT NULL
        AND s.revoked_at  IS NULL
    )
  )
  OR (
    cuenta_destino IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.account_shares s
      WHERE s.cuenta_id = movimientos.cuenta_destino
        AND s.invitee_user_id = auth.uid()
        AND s.accepted_at IS NOT NULL
        AND s.revoked_at  IS NULL
    )
  )
);

DROP POLICY IF EXISTS "movimientos_insert_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_insert"     ON public.movimientos;
CREATE POLICY "movimientos_insert" ON public.movimientos FOR INSERT
WITH CHECK (
  -- El creador del movimiento debe ser quien hace la request.
  auth.uid() = user_id
  -- Y debe tener acceso (owner o editor share) a las cuentas involucradas.
  AND (
    cuenta_origen IS NULL
    OR EXISTS (SELECT 1 FROM public.cuentas WHERE id = cuenta_origen AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.account_shares s
      WHERE s.cuenta_id = cuenta_origen
        AND s.invitee_user_id = auth.uid()
        AND s.accepted_at IS NOT NULL
        AND s.revoked_at  IS NULL
        AND s.role = 'editor'
    )
  )
  AND (
    cuenta_destino IS NULL
    OR EXISTS (SELECT 1 FROM public.cuentas WHERE id = cuenta_destino AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.account_shares s
      WHERE s.cuenta_id = cuenta_destino
        AND s.invitee_user_id = auth.uid()
        AND s.accepted_at IS NOT NULL
        AND s.revoked_at  IS NULL
        AND s.role = 'editor'
    )
  )
);

-- UPDATE/DELETE: solo el autor original. Si el invitee creó el mov, lo
-- puede editar/borrar él. Si el owner creó el mov, solo él lo puede tocar.
-- Esto evita guerras de "tu editaste mi gasto" en parejas.
DROP POLICY IF EXISTS "movimientos_update_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_update"     ON public.movimientos;
CREATE POLICY "movimientos_update" ON public.movimientos FOR UPDATE
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "movimientos_delete_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_delete"     ON public.movimientos;
CREATE POLICY "movimientos_delete" ON public.movimientos FOR DELETE
USING (auth.uid() = user_id);

COMMIT;

-- ─── Notas para aplicar ──────────────────────────────────────────────────────
-- 1. Antes de aplicar: backup del schema (especialmente RLS policies viejas).
-- 2. Esta migration NO toca data existente. Solo agrega tabla y reemplaza
--    RLS policies (mantiene el comportamiento previo + agrega shares).
-- 3. Para rollback: DROP TABLE account_shares CASCADE + recrear las policies
--    originales (cuentas_select_own, movimientos_select_own, etc.).
