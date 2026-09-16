-- =====================================================================
-- Adoption loop — Migration B: the usage record
-- Date: 2026-09-16
-- Spec: specs/2026-09-16-adoption-loop.md (ruling 3; build step 2)
--
-- One small record: a row per person × feature × day, written when the
-- feature's core action happens. Server routes call fn_feature_used at the
-- core action (lib/usage/record.ts); the sign-in path calls it with
-- 'app.login' for the app-wide daily line.
--
-- Days are Indian calendar days (Asia/Kolkata), not UTC — a 23:30 IST use
-- must count on the day the person experienced it.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.feature_usage (
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key    text NOT NULL REFERENCES public.feature_registry(feature_key) ON DELETE CASCADE,
  day            date NOT NULL,
  count          integer NOT NULL DEFAULT 1 CHECK (count > 0),
  institution_id uuid,
  role           text,
  first_at       timestamptz NOT NULL DEFAULT now(),
  last_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key, day)
);

COMMENT ON TABLE public.feature_usage IS
  'Adoption loop ruling 3: one row per person × feature × IST day when the core action happened; count = how many times that day. Written only by fn_feature_used.';

CREATE INDEX IF NOT EXISTS idx_feature_usage_feature_day
  ON public.feature_usage (feature_key, day DESC);
CREATE INDEX IF NOT EXISTS idx_feature_usage_institution_day
  ON public.feature_usage (institution_id, day DESC);

ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feature_usage FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.feature_usage TO authenticated;
GRANT ALL    ON TABLE public.feature_usage TO service_role;

-- Ruling 7: per-person rows are visible to the person and to super admins /
-- admins. Principals get their institution's names through fn_adoption_people,
-- which checks the institution — never through a table read.
DROP POLICY IF EXISTS "feature_usage_select_own_or_admin" ON public.feature_usage;
CREATE POLICY "feature_usage_select_own_or_admin" ON public.feature_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_super_admin() OR is_admin());

-- No INSERT/UPDATE/DELETE policy: writes go through the function below.

-- ---------------------------------------------------------------------
-- fn_feature_used(feature_key) — record "I did the core action today".
--   Silent no-op (returns false) when the key is not registered or the
--   feature is retired, so wiring a route can never break the route.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated any signed-in person may record THEIR OWN use of a registered feature: the body writes one row keyed on auth.uid() only, reads nothing about anyone else, and refuses unregistered keys.
CREATE OR REPLACE FUNCTION public.fn_feature_used(p_feature_key text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_inst uuid;
  v_role text;
  v_day  date;
BEGIN
  IF v_uid IS NULL OR p_feature_key IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.feature_registry
    WHERE feature_key = p_feature_key AND status <> 'retired'
  ) THEN
    RETURN false;
  END IF;

  SELECT institution_id, role INTO v_inst, v_role
  FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_day := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  INSERT INTO public.feature_usage (user_id, feature_key, day, count, institution_id, role, first_at, last_at)
  VALUES (v_uid, p_feature_key, v_day, 1, v_inst, v_role, now(), now())
  ON CONFLICT (user_id, feature_key, day) DO UPDATE
    SET count   = public.feature_usage.count + 1,
        last_at = now();

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_feature_used(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_feature_used(text) TO authenticated, service_role;
