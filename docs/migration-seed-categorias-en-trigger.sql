-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: mover seed de categorías default al trigger `handle_new_user`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ANTES: el seed vivía en `app/auth/callback/route.ts`. Race condition con el
-- propio trigger handle_new_user → si el callback se llamaba múltiples veces
-- antes del trigger, el seed corría N veces y duplicaba categorías.
--
-- AHORA: el seed vive DENTRO del trigger, que es atómico — corre una sola
-- vez por user en la misma transacción que crea auth.users. Imposible que
-- duplique aunque el callback se llame múltiples veces.
--
-- Lista de 21 categorías (16 Gasto + 5 Ingreso) ajustada a hábitos comunes
-- en Argentina. Iconos son emojis Unicode para no depender de URLs externas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- ── 1) Crear user_profiles (idempotente) ────────────────────────────────
  INSERT INTO public.user_profiles (user_id, email, authorized, plan)
  VALUES (NEW.id, NEW.email, true, 'free')
  ON CONFLICT (user_id) DO NOTHING;

  -- ── 2) Categorías default (solo si todavía no tiene ninguna) ───────────
  -- El guard protege contra cualquier re-ejecución hipotética del trigger.
  IF NOT EXISTS (SELECT 1 FROM public.categorias WHERE user_id = NEW.id LIMIT 1) THEN
    INSERT INTO public.categorias (id, user_id, nombre_categoria, tipo_default, icono)
    VALUES
      -- ── Gastos ────────────────────────────────────────────────────────
      (gen_random_uuid(), NEW.id, 'Supermercado',           'Gasto', '🛒'),
      (gen_random_uuid(), NEW.id, 'Restaurantes',           'Gasto', '🍽️'),
      (gen_random_uuid(), NEW.id, 'Transporte',             'Gasto', '🚗'),
      (gen_random_uuid(), NEW.id, 'Salud',                  'Gasto', '🏥'),
      (gen_random_uuid(), NEW.id, 'Farmacia',               'Gasto', '💊'),
      (gen_random_uuid(), NEW.id, 'Ropa',                   'Gasto', '👕'),
      (gen_random_uuid(), NEW.id, 'Entretenimiento',        'Gasto', '🎬'),
      (gen_random_uuid(), NEW.id, 'Suscripciones',          'Gasto', '📺'),
      (gen_random_uuid(), NEW.id, 'Servicios',              'Gasto', '💡'),
      (gen_random_uuid(), NEW.id, 'Telecomunicaciones',     'Gasto', '📱'),
      (gen_random_uuid(), NEW.id, 'Viajes',                 'Gasto', '✈️'),
      (gen_random_uuid(), NEW.id, 'Hogar',                  'Gasto', '🏠'),
      (gen_random_uuid(), NEW.id, 'Impuestos',              'Gasto', '📑'),
      (gen_random_uuid(), NEW.id, 'Gym / Deporte',          'Gasto', '🏋️'),
      (gen_random_uuid(), NEW.id, 'Mascotas',               'Gasto', '🐶'),
      (gen_random_uuid(), NEW.id, 'Regalos',                'Gasto', '🎁'),
      -- ── Ingresos ──────────────────────────────────────────────────────
      (gen_random_uuid(), NEW.id, 'Sueldo',                 'Ingreso', '💰'),
      (gen_random_uuid(), NEW.id, 'Freelance',              'Ingreso', '💼'),
      (gen_random_uuid(), NEW.id, 'Alquiler cobrado',       'Ingreso', '🏘️'),
      (gen_random_uuid(), NEW.id, 'Inversiones',            'Ingreso', '📈'),
      (gen_random_uuid(), NEW.id, 'Transferencia recibida', 'Ingreso', '↗️');
  END IF;

  RETURN NEW;
END;
$function$;
