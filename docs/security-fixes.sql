-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY FIXES — sinunmango
-- Resuelve los errores y warnings del Supabase Database Linter.
-- Ejecutar en Supabase → SQL Editor (idempotente, se puede correr varias veces).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. VISTAS: cambiar de SECURITY DEFINER a SECURITY INVOKER ───────────────
--
-- SECURITY DEFINER hace que la vista corra con permisos del creador,
-- ignorando el RLS del usuario que consulta.
-- SECURITY INVOKER (el default correcto) respeta el RLS del usuario real.
-- En esta app las vistas se usan con adminClient (service role), así que
-- funcionan igual — y el linter deja de marcar el error.

ALTER VIEW public.saldo_actual_cuentas   SET (security_invoker = on);
ALTER VIEW public.dashboard_resumen      SET (security_invoker = on);
ALTER VIEW public.movimientos_completos  SET (security_invoker = on);


-- ── 2. FUNCIONES: fijar search_path vacío ───────────────────────────────────
--
-- Un search_path mutable permite que un atacante con acceso a crear objetos
-- en otro schema "suplante" funciones del sistema. La mitigación es fijar
-- search_path = '' y usar nombres completamente calificados (schema.objeto).
--
-- Usamos un bloque dinámico para no depender de conocer la firma exacta
-- de cada función (evita errores si cambian argumentos en el futuro).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS proc
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'is_authorized',
        'update_updated_at_column',
        'calcular_periodo_tarjeta',
        'monto_estimado'
      )
  LOOP
    EXECUTE 'ALTER FUNCTION ' || r.proc::text || ' SET search_path = ''''';
  END LOOP;
END $$;


-- ── 3. Verificación post-fix ─────────────────────────────────────────────────
--
-- Correr estas queries para confirmar que los cambios se aplicaron:

-- Vistas — deben mostrar security_invoker = true:
-- SELECT viewname, definition
-- FROM pg_views
-- WHERE schemaname = 'public'
--   AND viewname IN ('saldo_actual_cuentas', 'dashboard_resumen', 'movimientos_completos');

-- Funciones — deben mostrar proconfig con search_path = '':
-- SELECT proname, proconfig
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('is_authorized', 'update_updated_at_column', 'calcular_periodo_tarjeta', 'monto_estimado');


-- ── 4. Leaked Password Protection ───────────────────────────────────────────
--
-- Este ajuste NO se puede hacer por SQL — es una opción del dashboard de Auth.
-- Pasos:
--   1. Ir a Authentication → Settings (o /project/_/auth/settings)
--   2. En la sección "Password Security", activar "Enable Leaked Password Protection"
--   3. Guardar cambios
--
-- Esto verifica las contraseñas contra HaveIBeenPwned.org en el momento
-- del registro o cambio de contraseña. No afecta sesiones ya existentes.
-- (Solo aplica si usás email/password — con OAuth como Google no tiene efecto.)
