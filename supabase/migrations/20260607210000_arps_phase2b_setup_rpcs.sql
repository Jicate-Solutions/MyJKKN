-- Migration: 2026-06-07 21:00 IST
-- Purpose:
--   Phase 2B of ARPS. Adds 4 RPCs that let the admin form at
--   /admission/group-dashboard/setup populate the Phase 2A substrate tables
--   (admission_cycle_revenue_target + admission_cycle_cost_baseline).
--
-- All 4 RPCs are SECURITY DEFINER with explicit REVOKE FROM anon per
-- CLAUDE.md anon-revoke standing rule.
--
-- The read RPCs combine target + cost data per (institution, cycle_year) so
-- the admin UI can render one unified table per cycle. The write RPCs are
-- split because semantic ownership differs (Director sets target, Bursar
-- sets cost — Phase 2E will gate per-role).

-- ═══════════════════════════════════════════════════════════════════════════
-- WRITE: fn_arps_upsert_revenue_target
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.fn_arps_upsert_revenue_target(uuid, int, int, numeric, text);

CREATE OR REPLACE FUNCTION public.fn_arps_upsert_revenue_target(
  p_institution_id uuid,
  p_cycle_year int,
  p_target_admits int DEFAULT NULL,
  p_target_yield_per_seat numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO public.admission_cycle_revenue_target
    (institution_id, cycle_year, target_admits, target_yield_per_seat,
     set_by, set_at, notes)
  VALUES
    (p_institution_id, p_cycle_year, p_target_admits, p_target_yield_per_seat,
     v_caller, now(), p_notes)
  ON CONFLICT (institution_id, cycle_year) DO UPDATE
    SET target_admits         = EXCLUDED.target_admits,
        target_yield_per_seat = EXCLUDED.target_yield_per_seat,
        set_by                = EXCLUDED.set_by,
        set_at                = EXCLUDED.set_at,
        notes                 = COALESCE(EXCLUDED.notes,
                                          admission_cycle_revenue_target.notes),
        updated_at            = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_arps_upsert_revenue_target(uuid, int, int, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_arps_upsert_revenue_target(uuid, int, int, numeric, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- WRITE: fn_arps_upsert_cost_baseline
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.fn_arps_upsert_cost_baseline(uuid, int, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.fn_arps_upsert_cost_baseline(
  p_institution_id uuid,
  p_cycle_year int,
  p_fixed_operating_cost numeric DEFAULT NULL,
  p_marketing_budget_allocated numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO public.admission_cycle_cost_baseline
    (institution_id, cycle_year, fixed_operating_cost,
     marketing_budget_allocated, set_by, set_at, notes)
  VALUES
    (p_institution_id, p_cycle_year, p_fixed_operating_cost,
     p_marketing_budget_allocated, v_caller, now(), p_notes)
  ON CONFLICT (institution_id, cycle_year) DO UPDATE
    SET fixed_operating_cost       = EXCLUDED.fixed_operating_cost,
        marketing_budget_allocated = EXCLUDED.marketing_budget_allocated,
        set_by                     = EXCLUDED.set_by,
        set_at                     = EXCLUDED.set_at,
        notes                      = COALESCE(EXCLUDED.notes,
                                               admission_cycle_cost_baseline.notes),
        updated_at                 = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_arps_upsert_cost_baseline(uuid, int, numeric, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_arps_upsert_cost_baseline(uuid, int, numeric, numeric, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- READ: fn_arps_list_cycle_setup
-- ═══════════════════════════════════════════════════════════════════════════
-- Returns the 8 family institutions × the 3 cycle years (2024, 2025, 2026)
-- with revenue_target + cost_baseline data left-joined. Rows where the
-- substrate is not yet populated still return (with NULL metric values) so
-- the UI can render empty input cells for the user to fill in.

DROP FUNCTION IF EXISTS public.fn_arps_list_cycle_setup(int[]);

CREATE OR REPLACE FUNCTION public.fn_arps_list_cycle_setup(
  p_cycle_years int[] DEFAULT ARRAY[2024, 2025, 2026]
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_cycle_year int,
  out_target_admits int,
  out_target_yield_per_seat numeric,
  out_derived_target_revenue numeric,
  out_fixed_operating_cost numeric,
  out_marketing_budget_allocated numeric,
  out_total_baseline_cost numeric,
  out_target_set_at timestamptz,
  out_cost_set_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  family_institutions AS (
    SELECT i.id, i.name::text AS name
    FROM institutions i
    WHERE i.name ILIKE 'JKKN%'
      AND i.name NOT ILIKE '%Main Office%'
      AND i.name NOT ILIKE '%Testing%'
      AND i.name NOT ILIKE '%Nattraja%'
      AND i.name NOT ILIKE '%Matric%'
      AND i.name NOT ILIKE '%Jicate%'
  ),
  year_grid AS (
    SELECT fi.id AS institution_id, fi.name AS institution_name, yr
    FROM family_institutions fi
    CROSS JOIN unnest(p_cycle_years) AS yr
  )
  SELECT
    yg.institution_id,
    yg.institution_name,
    yg.yr,
    rt.target_admits,
    rt.target_yield_per_seat,
    rt.derived_target_revenue,
    cb.fixed_operating_cost,
    cb.marketing_budget_allocated,
    cb.total_baseline_cost,
    rt.set_at AS target_set_at,
    cb.set_at AS cost_set_at
  FROM year_grid yg
  LEFT JOIN admission_cycle_revenue_target rt
    ON rt.institution_id = yg.institution_id AND rt.cycle_year = yg.yr
  LEFT JOIN admission_cycle_cost_baseline cb
    ON cb.institution_id = yg.institution_id AND cb.cycle_year = yg.yr
  ORDER BY yg.institution_name, yg.yr;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_arps_list_cycle_setup(int[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_arps_list_cycle_setup(int[]) TO authenticated;

COMMENT ON FUNCTION public.fn_arps_upsert_revenue_target(uuid, int, int, numeric, text) IS
  'ARPS Phase 2B: upsert per-(institution, cycle_year) revenue target. Director or principal-of-institution writes. Director-locked 2026-06-07.';

COMMENT ON FUNCTION public.fn_arps_upsert_cost_baseline(uuid, int, numeric, numeric, text) IS
  'ARPS Phase 2B: upsert per-(institution, cycle_year) cost baseline. Bursar/Finance writes. Director-locked 2026-06-07.';

COMMENT ON FUNCTION public.fn_arps_list_cycle_setup(int[]) IS
  'ARPS Phase 2B: returns 8 family institutions × cycle years grid with revenue + cost data left-joined. Empty cells render as NULL for the admin form to populate.';
