-- Generate leave balances for many institutions in one pass.
--
-- Until hr_academic_years landed, a bulk run was not expressible: academic_years
-- rows are per-institution, so every organization needed its OWN year id and
-- several institutions had no row at all. One org at a time was the only
-- coherent shape. A single group-wide year id now covers everyone, so the
-- single-org form was the last thing forcing the operator to repeat themselves
-- once per institution -- with 7 institutions currently needing provisioning,
-- that is ~28 interactions to act on what the analytics tab already showed in
-- one glance.
--
-- This DELEGATES to generate_hr_leave_balances rather than reimplementing it.
-- The entitlement precedence (staff > department > organization), cadre
-- entitlement resolution, carry-forward capping, gender/cadre applicability and
-- the fallback reporting are load-bearing and tested; a second copy would drift
-- from the first the next time any of them changed.
--
-- Each organization runs inside its own BEGIN/EXCEPTION block, which Postgres
-- implements as a subtransaction. That is deliberate: without it, one
-- organization raising would roll back the twelve that had already succeeded,
-- and the operator would have no way to tell which. Instead the failure becomes
-- a row in `results` carrying its own message.

CREATE OR REPLACE FUNCTION public.generate_hr_leave_balances_bulk(
  p_hr_academic_year_id uuid,
  /** NULL = every organization the caller can access. */
  p_hr_org_ids          uuid[] DEFAULT NULL,
  p_dry_run             boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_year      record;
  v_results   jsonb   := '[]'::jsonb;
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_fallback  integer := 0;
  v_errors    integer := 0;
  r           record;
  v_one       jsonb;
BEGIN
  -- Checked here as well as inside the delegate: a caller who cannot provision
  -- balances should be refused before any organization is touched, not after
  -- the first one raises.
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT * INTO v_year FROM public.hr_academic_years WHERE id = p_hr_academic_year_id;
  IF v_year.id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_academic_year_id %', p_hr_academic_year_id;
  END IF;

  -- role_has_institution_access filters here as well, so an id the caller
  -- cannot reach is silently absent rather than aborting the batch. The
  -- delegate re-checks it per organization regardless.
  FOR r IN
    SELECT o.id AS org_id, i.name AS institution_name
    FROM public.hr_organizations o
    JOIN public.institutions i ON i.id = o.institution_id
    WHERE public.role_has_institution_access(o.institution_id)
      AND (p_hr_org_ids IS NULL OR o.id = ANY (p_hr_org_ids))
    ORDER BY i.name
  LOOP
    BEGIN
      v_one := public.generate_hr_leave_balances(r.org_id, p_hr_academic_year_id, p_dry_run);

      v_created  := v_created  + COALESCE((v_one->>'created')::int, 0);
      v_skipped  := v_skipped  + COALESCE((v_one->>'skipped')::int, 0);
      v_fallback := v_fallback + COALESCE((v_one->>'fallback_count')::int, 0);

      v_results := v_results || jsonb_build_object(
        'hr_organization_id', r.org_id,
        'institution_name',   r.institution_name,
        'created',            COALESCE((v_one->>'created')::int, 0),
        'skipped',            COALESCE((v_one->>'skipped')::int, 0),
        'fallback_count',     COALESCE((v_one->>'fallback_count')::int, 0),
        'fallback',           COALESCE(v_one->'fallback', '[]'::jsonb),
        'error',              NULL
      );
    EXCEPTION WHEN OTHERS THEN
      v_errors  := v_errors + 1;
      v_results := v_results || jsonb_build_object(
        'hr_organization_id', r.org_id,
        'institution_name',   r.institution_name,
        'created',            0,
        'skipped',            0,
        'fallback_count',     0,
        'fallback',           '[]'::jsonb,
        'error',              SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',             p_dry_run,
    'hr_academic_year_id', p_hr_academic_year_id,
    'year_name',           v_year.year_name,
    'organizations',       jsonb_array_length(v_results),
    'total_created',       v_created,
    'total_skipped',       v_skipped,
    'total_fallback',      v_fallback,
    'error_count',         v_errors,
    'results',             v_results
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.generate_hr_leave_balances_bulk(uuid, uuid[], boolean)
  TO authenticated, service_role;
