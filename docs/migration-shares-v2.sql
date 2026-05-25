-- ─────────────────────────────────────────────────────────────────────────────
-- Compartir workspace V2 — granular resource sharing.
--
-- REEMPLAZA el modelo V1 (account_shares, una cuenta por share) por:
--   - shares: una invitación = un grupo de recursos compartidos
--   - share_resources: N filas por share, una por cada recurso (cuenta,
--     gasto_fijo, inversion) que el owner decidió compartir
--
-- El paradigma cambia:
--   V1: "comparto esta cuenta, el invitee la ve junto con sus propias cosas"
--   V2: "invito al invitee a MI workspace; ve mi dashboard filtrado a lo
--        que le compartí. Si quiere ver SUS datos, cambia de workspace."
--
-- El invitee puede:
--   - Ver el dashboard del owner (filtrado a recursos compartidos)
--   - Si role=editor: cargar movimientos en cuentas/tarjetas compartidas
--   - Ver gastos fijos / inversiones compartidos
--
-- El invitee NO puede:
--   - Ver Manguito (gateado en UI, no en RLS)
--   - Ver recursos no compartidos del owner
--   - Editar metadata de la cuenta/tarjeta (renombrar, color, fechas)
--   - Eliminar la cuenta/tarjeta
--
-- Esta migration ASUME que account_shares (V1) existe y la reemplaza.
-- Si tenías shares productivos en V1, primero exportá los datos relevantes.
-- En la app que estamos desarrollando, el único share era de prueba.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 0. Drop V1 (account_shares + sus policies) ─────────────────────────────
DROP TABLE IF EXISTS public.account_shares CASCADE;

-- ─── 1. shares (V2) ─────────────────────────────────────────────────────────
-- Una fila por invitación. NO tiene cuenta_id — los recursos compartidos
-- viven en share_resources (1-N).
CREATE TABLE IF NOT EXISTS public.shares (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_user_id UUID                  REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_token    TEXT         NOT NULL UNIQUE,
  role            TEXT         NOT NULL CHECK (role IN ('viewer', 'editor')),
  invited_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ  NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

ALTER TABLE public.shares DROP CONSTRAINT IF EXISTS shares_owner_neq_invitee;
ALTER TABLE public.shares
  ADD CONSTRAINT shares_owner_neq_invitee
  CHECK (invitee_user_id IS NULL OR invitee_user_id != owner_user_id);

-- Una invitación activa por (owner, invitee). Si tu pareja ya tiene
-- acceso, no se crea un share duplicado — el owner edita los recursos
-- del share existente.
DROP INDEX IF EXISTS shares_active_unique;
CREATE UNIQUE INDEX shares_active_unique
  ON public.shares(owner_user_id, invitee_user_id)
  WHERE invitee_user_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS shares_owner_idx     ON public.shares(owner_user_id);
CREATE INDEX IF NOT EXISTS shares_invitee_idx   ON public.shares(invitee_user_id);
CREATE INDEX IF NOT EXISTS shares_token_idx     ON public.shares(invite_token);

COMMENT ON TABLE public.shares IS
  'Una fila por invitación. Los recursos compartidos viven en share_resources.';

-- ─── 2. share_resources ────────────────────────────────────────────────────
-- Una fila por (share, recurso). El resource_type indica de qué tabla
-- es el resource_id:
--   - 'cuenta'      → cuentas.id (incluye tarjetas — tipo_cuenta filter en UI)
--   - 'gasto_fijo'  → gastos_fijos.id
--   - 'inversion'   → inversiones.id
--
-- Movimientos NO son un resource_type — se acceden vía la cuenta_origen/
-- destino que ya está compartida.
CREATE TABLE IF NOT EXISTS public.share_resources (
  share_id        UUID  NOT NULL REFERENCES public.shares(id) ON DELETE CASCADE,
  resource_type   TEXT  NOT NULL CHECK (resource_type IN ('cuenta', 'gasto_fijo', 'inversion')),
  resource_id     TEXT  NOT NULL,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (share_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS share_resources_share_idx
  ON public.share_resources(share_id);
CREATE INDEX IF NOT EXISTS share_resources_lookup_idx
  ON public.share_resources(resource_type, resource_id);

COMMENT ON COLUMN public.share_resources.resource_type IS
  'cuenta (incluye tarjetas) | gasto_fijo | inversion. Movimientos se acceden via cuenta.';
COMMENT ON COLUMN public.share_resources.resource_id IS
  'ID del recurso en su tabla. TEXT porque cuentas.id es TEXT.';

-- ─── 3. RLS en shares ──────────────────────────────────────────────────────
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- Owner ve todos sus shares (incluyendo pending y revoked).
CREATE POLICY "shares_select_owner" ON public.shares
FOR SELECT USING (auth.uid() = owner_user_id);

-- Invitee ve solo shares aceptados (no pendientes — el lookup pre-accept
-- pasa por endpoint server-side con admin client).
CREATE POLICY "shares_select_invitee" ON public.shares
FOR SELECT USING (auth.uid() = invitee_user_id AND accepted_at IS NOT NULL);

-- Owner crea.
CREATE POLICY "shares_insert_owner" ON public.shares
FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

-- Owner actualiza (revoke, cambio de role).
CREATE POLICY "shares_update_owner" ON public.shares
FOR UPDATE USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

-- Owner borra (hard delete — pero típicamente se revoca con set revoked_at).
CREATE POLICY "shares_delete_owner" ON public.shares
FOR DELETE USING (auth.uid() = owner_user_id);

-- ─── 4. RLS en share_resources ─────────────────────────────────────────────
ALTER TABLE public.share_resources ENABLE ROW LEVEL SECURITY;

-- Tanto owner como invitee del share ven los resources del share.
CREATE POLICY "share_resources_select_member" ON public.share_resources
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.shares s
    WHERE s.id = share_resources.share_id
      AND (s.owner_user_id = auth.uid()
           OR (s.invitee_user_id = auth.uid() AND s.accepted_at IS NOT NULL))
  )
);

-- Solo el owner del share puede insertar/borrar (= modificar qué se comparte).
CREATE POLICY "share_resources_insert_owner" ON public.share_resources
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.shares s
    WHERE s.id = share_resources.share_id AND s.owner_user_id = auth.uid()
  )
);

CREATE POLICY "share_resources_delete_owner" ON public.share_resources
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.shares s
    WHERE s.id = share_resources.share_id AND s.owner_user_id = auth.uid()
  )
);

-- ─── 5. Helper function: ¿el invitee tiene acceso a un resource? ───────────
-- Función centraliza la lógica para que las RLS de cuentas/gastos_fijos/
-- inversiones la reutilicen. SECURITY DEFINER + search_path explícito.
CREATE OR REPLACE FUNCTION public.user_has_shared_access(
  p_resource_type TEXT,
  p_resource_id   TEXT,
  p_min_role      TEXT DEFAULT 'viewer'
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.share_resources sr
    JOIN public.shares s ON s.id = sr.share_id
    WHERE sr.resource_type   = p_resource_type
      AND sr.resource_id     = p_resource_id
      AND s.invitee_user_id  = auth.uid()
      AND s.accepted_at      IS NOT NULL
      AND s.revoked_at       IS NULL
      AND (
        p_min_role = 'viewer'
        OR s.role = 'editor'   -- viewer cubre cualquier role; editor requiere editor
      )
  );
$$;

COMMENT ON FUNCTION public.user_has_shared_access IS
  'True si auth.uid() tiene acceso al recurso vía un share activo. Usado por RLS.';

-- ─── 6. RLS cuentas: expand SELECT con shares ──────────────────────────────
-- INSERT/UPDATE/DELETE siguen owner-only.

DROP POLICY IF EXISTS "cuentas_select_own" ON public.cuentas;
DROP POLICY IF EXISTS "cuentas_select"     ON public.cuentas;
CREATE POLICY "cuentas_select" ON public.cuentas FOR SELECT
USING (
  auth.uid() = user_id
  OR public.user_has_shared_access('cuenta', id)
);

-- ─── 7. RLS movimientos: expand con shares (vía cuenta) ────────────────────
-- SELECT: own movs OR movs cuya cuenta_origen/destino esté compartida conmigo
-- INSERT: editor share permite crear movs en cuentas compartidas
-- UPDATE/DELETE: solo el creador original

DROP POLICY IF EXISTS "movimientos_select_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_select"     ON public.movimientos;
CREATE POLICY "movimientos_select" ON public.movimientos FOR SELECT
USING (
  auth.uid() = user_id
  OR (cuenta_origen  IS NOT NULL AND public.user_has_shared_access('cuenta', cuenta_origen))
  OR (cuenta_destino IS NOT NULL AND public.user_has_shared_access('cuenta', cuenta_destino))
);

DROP POLICY IF EXISTS "movimientos_insert_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_insert"     ON public.movimientos;
CREATE POLICY "movimientos_insert" ON public.movimientos FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    cuenta_origen IS NULL
    OR EXISTS (SELECT 1 FROM public.cuentas WHERE id = cuenta_origen AND user_id = auth.uid())
    OR public.user_has_shared_access('cuenta', cuenta_origen, 'editor')
  )
  AND (
    cuenta_destino IS NULL
    OR EXISTS (SELECT 1 FROM public.cuentas WHERE id = cuenta_destino AND user_id = auth.uid())
    OR public.user_has_shared_access('cuenta', cuenta_destino, 'editor')
  )
);

DROP POLICY IF EXISTS "movimientos_update_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_update"     ON public.movimientos;
CREATE POLICY "movimientos_update" ON public.movimientos FOR UPDATE
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "movimientos_delete_own" ON public.movimientos;
DROP POLICY IF EXISTS "movimientos_delete"     ON public.movimientos;
CREATE POLICY "movimientos_delete" ON public.movimientos FOR DELETE
USING (auth.uid() = user_id);

-- ─── 8. RLS gastos_fijos: expand SELECT con shares ─────────────────────────
DROP POLICY IF EXISTS "gastos_fijos_select_own" ON public.gastos_fijos;
DROP POLICY IF EXISTS "gastos_fijos_select"     ON public.gastos_fijos;
CREATE POLICY "gastos_fijos_select" ON public.gastos_fijos FOR SELECT
USING (
  auth.uid() = user_id
  OR public.user_has_shared_access('gasto_fijo', id)
);

-- ─── 9. RLS inversiones: expand SELECT con shares ──────────────────────────
DROP POLICY IF EXISTS "inversiones_select_own" ON public.inversiones;
DROP POLICY IF EXISTS "inversiones_select"     ON public.inversiones;
CREATE POLICY "inversiones_select" ON public.inversiones FOR SELECT
USING (
  auth.uid() = user_id
  OR public.user_has_shared_access('inversion', id)
);

-- ─── 10. RLS categorias / subcategorias: lectura cross-workspace ──────────
-- Cuando el invitee ve movs del owner, necesita poder leer las categorías
-- para interpretarlos (sin esto, "categoria_id: cat_xxx" sería ilegible).
-- Permitir SELECT si tengo CUALQUIER share activo con ese owner.

DROP POLICY IF EXISTS "categorias_select_own" ON public.categorias;
DROP POLICY IF EXISTS "categorias_select"     ON public.categorias;
CREATE POLICY "categorias_select" ON public.categorias FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.shares s
    WHERE s.owner_user_id   = categorias.user_id
      AND s.invitee_user_id = auth.uid()
      AND s.accepted_at     IS NOT NULL
      AND s.revoked_at      IS NULL
  )
);

DROP POLICY IF EXISTS "subcategorias_select_own" ON public.subcategorias;
DROP POLICY IF EXISTS "subcategorias_select"     ON public.subcategorias;
CREATE POLICY "subcategorias_select" ON public.subcategorias FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.shares s
    WHERE s.owner_user_id   = subcategorias.user_id
      AND s.invitee_user_id = auth.uid()
      AND s.accepted_at     IS NOT NULL
      AND s.revoked_at      IS NULL
  )
);

COMMIT;

-- ─── Notas para aplicar ─────────────────────────────────────────────────────
-- Esta migration ASUME que ya aplicaste migration-account-shares.sql (V1).
-- Esta V2 DROPea esa tabla y reemplaza el modelo. Si tenías un share de
-- prueba aplicado, se purga.
--
-- Después de aplicar, las APIs V1 (/api/account-shares) van a fallar
-- porque la tabla account_shares ya no existe. Los nuevos endpoints
-- /api/shares (Fase 3) reemplazan la funcionalidad.
