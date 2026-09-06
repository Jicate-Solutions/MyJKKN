-- ============================================================================
-- Migration: 20260630000000_hostel_curfew_policies
-- Phase: Hostel Module — Curfew Policy substrate (PR 1)
-- ============================================================================
-- Spec lock 2026-05-25 (chairperson + Director).
--
-- WHAT IT DOES
-- ------------
-- Replaces the legacy `hostel_blocks.curfew_time_weekday` /
-- `curfew_time_weekend` per-block scalars (too coarse — no per-gender,
-- no per-day-of-week, no entry-vs-exit) with a typed policy table that
-- spans 4 orthogonal dimensions:
--
--   1. institution_id  (NULL = global default; non-NULL = institution scope)
--   2. gender          ('boys' | 'girls' | 'both')
--   3. day_of_week     (ISO 1-7 Mon..Sun; NULL = applies to all days)
--   4. direction       ('entry' | 'exit' | 'both')
--
-- Resolution semantics: STRICTEST across all matching active rows.
-- For 'entry' curfew (must be inside by X) → MIN(curfew_time) wins.
-- For 'exit'  curfew (can't leave before Y) → MAX(curfew_time) wins.
-- 'both' direction rows participate in BOTH entry and exit resolution.
--
-- Companion app code (PR 2):
--   - lib/services/hostel/curfew-policy-service.ts
--   - hooks/hostel/use-curfew-policies.ts
--   - app/(routes)/admin/hostel/curfew/page.tsx
--   - lib/permissions-audit/module-mappings.ts (register /admin/hostel)
--   - lib/constants/table-module-map.ts        (register hostel_curfew_*)
--
-- TIER-0 safe-additive. Idempotent re-run safe. Apply via Supabase
-- Management API, then probe (information_schema + fn_get_curfew()).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: hostel_curfew_policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hostel_curfew_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  gender          text NOT NULL CHECK (gender IN ('boys','girls','both')),
  day_of_week     smallint NULL CHECK (day_of_week BETWEEN 1 AND 7),
  direction       text NOT NULL CHECK (direction IN ('entry','exit','both')),
  curfew_time     time NOT NULL,
  description     text NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NULL REFERENCES public.profiles(id)
);

-- Partial unique index — prevent duplicate ACTIVE rules on the same 4-tuple.
-- Uses COALESCE to make NULL institution_id / day_of_week comparable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_curfew_policies_active_tuple
  ON public.hostel_curfew_policies (
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    gender,
    COALESCE(day_of_week, 0),
    direction
  )
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_hostel_curfew_policies_institution_active
  ON public.hostel_curfew_policies (institution_id, is_active);
CREATE INDEX IF NOT EXISTS idx_hostel_curfew_policies_lookup
  ON public.hostel_curfew_policies (gender, day_of_week, direction, is_active);

COMMENT ON TABLE public.hostel_curfew_policies IS
  'Per-institution × gender × day-of-week × direction curfew rules. Replaces legacy hostel_blocks.curfew_time_weekday/_weekend scalars. Resolution: strictest active rule wins (MIN time for entry, MAX time for exit). NULL institution_id = global default; NULL day_of_week = applies to all days.';

COMMENT ON COLUMN public.hostel_curfew_policies.institution_id IS
  'NULL = applies to all institutions; non-NULL = scoped to that institution.';
COMMENT ON COLUMN public.hostel_curfew_policies.day_of_week IS
  'ISO 1-7 Mon..Sun; NULL = applies to all days.';
COMMENT ON COLUMN public.hostel_curfew_policies.direction IS
  'entry = must be inside by curfew_time; exit = cannot leave before curfew_time; both = applies to both.';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.tg_hostel_curfew_policies_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hostel_curfew_policies_touch_updated_at
  ON public.hostel_curfew_policies;
CREATE TRIGGER trg_hostel_curfew_policies_touch_updated_at
  BEFORE UPDATE ON public.hostel_curfew_policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_hostel_curfew_policies_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. RLS — mirror platform_policies pattern
-- ----------------------------------------------------------------------------
--   SELECT: any authenticated user (curfew is operational info learners read).
--   INSERT / UPDATE / DELETE: super_admin OR admin only.
-- ----------------------------------------------------------------------------
ALTER TABLE public.hostel_curfew_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_curfew_policies_select ON public.hostel_curfew_policies;
CREATE POLICY hostel_curfew_policies_select ON public.hostel_curfew_policies
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS hostel_curfew_policies_insert ON public.hostel_curfew_policies;
CREATE POLICY hostel_curfew_policies_insert ON public.hostel_curfew_policies
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_curfew_policies_update ON public.hostel_curfew_policies;
CREATE POLICY hostel_curfew_policies_update ON public.hostel_curfew_policies
  FOR UPDATE USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_curfew_policies_delete ON public.hostel_curfew_policies;
CREATE POLICY hostel_curfew_policies_delete ON public.hostel_curfew_policies
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 3. Seed: 1 global default row
-- ----------------------------------------------------------------------------
-- Default: every resident must be inside by 22:00.  No exit-curfew at the
-- global level — institutions opt-in to that explicitly.
-- ----------------------------------------------------------------------------
INSERT INTO public.hostel_curfew_policies (
  institution_id, gender, day_of_week, direction, curfew_time, description, is_active
)
SELECT NULL, 'both', NULL, 'entry', '22:00:00'::time,
       'Default: all residents must be inside by 10:00 PM', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.hostel_curfew_policies
  WHERE institution_id IS NULL
    AND gender = 'both'
    AND day_of_week IS NULL
    AND direction = 'entry'
);

-- ----------------------------------------------------------------------------
-- 4. Resolver function: fn_get_curfew
-- ----------------------------------------------------------------------------
-- Given (institution_id, gender, day_of_week), returns the strictest
-- effective curfew for each direction (entry, exit).
--
-- For each direction the function:
--   1. Selects all ACTIVE rows where:
--        - institution_id IS NULL OR matches p_institution_id
--        - gender = 'both' OR matches p_gender
--        - day_of_week IS NULL OR matches p_day_of_week
--        - direction = the target direction OR direction = 'both'
--   2. Picks the strictest curfew_time:
--        - entry: MIN(curfew_time)
--        - exit:  MAX(curfew_time)
--   3. Returns one row per direction with source_row_id of the winning row.
--
-- Caller may pass p_gender = 'both' to ask for the policy that applies to
-- the entire hostel (used by the admin UI's "global default" preview).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_get_curfew(uuid, text, smallint);

CREATE OR REPLACE FUNCTION public.fn_get_curfew(
  p_institution_id uuid,
  p_gender         text,
  p_day_of_week    smallint
)
RETURNS TABLE(
  direction      text,
  curfew_time    time,
  source_row_id  uuid
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT
      p.id,
      CASE WHEN p.direction = 'both' THEN d.dir ELSE p.direction END AS eff_direction,
      p.curfew_time
    FROM public.hostel_curfew_policies p
    CROSS JOIN (VALUES ('entry'), ('exit')) AS d(dir)
    WHERE p.is_active = true
      AND (p.institution_id IS NULL OR p.institution_id = p_institution_id)
      AND (p.gender = 'both' OR p.gender = p_gender)
      AND (p.day_of_week IS NULL OR p.day_of_week = p_day_of_week)
      AND (p.direction = 'both' OR p.direction = d.dir)
  ),
  ranked AS (
    SELECT
      eff_direction AS direction,
      curfew_time,
      id AS source_row_id,
      ROW_NUMBER() OVER (
        PARTITION BY eff_direction
        ORDER BY
          CASE WHEN eff_direction = 'entry' THEN curfew_time END ASC NULLS LAST,
          CASE WHEN eff_direction = 'exit'  THEN curfew_time END DESC NULLS LAST,
          id
      ) AS rn
    FROM candidates
  )
  SELECT direction, curfew_time, source_row_id
  FROM ranked
  WHERE rn = 1;
$$;

COMMENT ON FUNCTION public.fn_get_curfew(uuid, text, smallint) IS
  'Resolves strictest active curfew across (institution, gender, day_of_week). Returns up to 2 rows (one per direction). MIN(curfew_time) wins for entry, MAX(curfew_time) for exit. NULL p_institution_id falls back to global rules only.';

GRANT EXECUTE ON FUNCTION public.fn_get_curfew(uuid, text, smallint) TO authenticated;
