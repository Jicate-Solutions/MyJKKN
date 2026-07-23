-- =====================================================================
-- 2026-05-11  Add #variable_conflict use_column to bulk routing functions
--
-- Both bulk_route_unassigned_leads and bulk_round_robin_assign declare
-- `RETURNS TABLE(..., counselor_id uuid, ...)` — that creates an OUT
-- parameter named `counselor_id` which plpgsql treats as a variable in
-- scope throughout the function body. Any unqualified `counselor_id`
-- reference (INSERT column list, ON CONFLICT target, UPDATE SET LHS)
-- collides with this variable → SQLSTATE 42702.
--
-- Migration 20260513170000_* qualified the inner SELECTs but INSERT
-- column lists, ON CONFLICT clauses, and UPDATE SET LHS can't be
-- table-prefixed in standard SQL. The plpgsql `#variable_conflict
-- use_column` directive tells the parser: when an unqualified
-- identifier could be either a PL variable or a column, prefer the
-- column. Documented fix for this class of bug.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.bulk_route_unassigned_leads(
  p_lead_ids            uuid[],
  p_dry_run             boolean DEFAULT false,
  p_override            boolean DEFAULT false,
  p_expected_plan_hash  text    DEFAULT NULL
)
RETURNS TABLE (
  lead_id      uuid,
  counselor_id uuid,
  status       text,
  reason       text,
  plan_hash    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_lead    record;
  v_pick    uuid;
  v_plan    text := '';
  v_hash    text;
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.sources.manage')
    OR user_has_permission('admission.counselors.team.manage')
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_override AND NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.counselors.team.bulk_override')
  ) THEN
    RAISE EXCEPTION 'override requires bulk_override permission'
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE _bulk_route_plan (
    lead_id      uuid,
    counselor_id uuid,
    status       text,
    reason       text
  ) ON COMMIT DROP;

  FOR v_lead IN
    SELECT al.id, al.source, al.institution_id
    FROM admission_leads al
    WHERE al.id = ANY(p_lead_ids) AND al.counselor_id IS NULL
    ORDER BY al.created_at
  LOOP
    SELECT _pick_counselor_for_source(v_lead.id, p_override) INTO v_pick;

    IF v_pick IS NULL THEN
      INSERT INTO _bulk_route_plan VALUES (
        v_lead.id, NULL, 'no-candidate', 'No eligible counselor mapped to this source'
      );
    ELSE
      INSERT INTO _bulk_route_plan VALUES (v_lead.id, v_pick, 'assigned', NULL);
      v_plan := v_plan || v_lead.id::text || '->' || v_pick::text || ';';
    END IF;
  END LOOP;

  v_hash := encode(digest(v_plan, 'sha256'), 'hex');
  IF p_expected_plan_hash IS NOT NULL AND p_expected_plan_hash <> v_hash THEN
    RAISE EXCEPTION 'plan drift: expected % got %', p_expected_plan_hash, v_hash
      USING ERRCODE = '40001';
  END IF;

  IF NOT p_dry_run THEN
    PERFORM v_user_id;
    UPDATE admission_leads l
       SET counselor_id          = p.counselor_id,
           assigned_counselor_id = ac.user_id,
           assigned_at           = now(),
           updated_at            = now()
      FROM _bulk_route_plan p
      LEFT JOIN admission_counselors ac ON ac.id = p.counselor_id
     WHERE l.id = p.lead_id AND p.status = 'assigned';
  END IF;

  RETURN QUERY
    SELECT p.lead_id, p.counselor_id, p.status, p.reason, v_hash
    FROM _bulk_route_plan p
    ORDER BY p.lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_route_unassigned_leads(uuid[], boolean, boolean, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_round_robin_assign(
  p_lead_ids            uuid[],
  p_counselor_ids       uuid[],
  p_dry_run             boolean DEFAULT false,
  p_override            boolean DEFAULT false,
  p_expected_plan_hash  text    DEFAULT NULL,
  p_per_counselor_limit integer DEFAULT NULL
)
RETURNS TABLE (
  lead_id      uuid,
  counselor_id uuid,
  status       text,
  reason       text,
  plan_hash    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id   uuid := auth.uid();
  v_idx       int := 0;
  v_n_pickers int := array_length(p_counselor_ids, 1);
  v_lead      record;
  v_target    uuid;
  v_paused    boolean;
  v_at_cap    boolean;
  v_plan      text := '';
  v_hash      text;
  v_assigned_so_far int;
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.sources.manage')
    OR user_has_permission('admission.counselors.team.manage')
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_override AND NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.counselors.team.bulk_override')
  ) THEN
    RAISE EXCEPTION 'override requires bulk_override permission'
      USING ERRCODE = '42501';
  END IF;

  IF v_n_pickers IS NULL OR v_n_pickers = 0 THEN
    RAISE EXCEPTION 'counselor list cannot be empty';
  END IF;

  IF p_per_counselor_limit IS NOT NULL AND p_per_counselor_limit < 1 THEN
    RAISE EXCEPTION 'per_counselor_limit must be at least 1 when provided';
  END IF;

  CREATE TEMP TABLE _bulk_rr_plan (
    lead_id      uuid,
    counselor_id uuid,
    status       text,
    reason       text
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _bulk_rr_run_counts (
    counselor_id    uuid PRIMARY KEY,
    count_assigned  int DEFAULT 0
  ) ON COMMIT DROP;

  FOR v_lead IN
    SELECT al.id
    FROM admission_leads al
    WHERE al.id = ANY(p_lead_ids) AND al.counselor_id IS NULL
    ORDER BY al.created_at
  LOOP
    FOR i IN 0..v_n_pickers-1 LOOP
      v_target := p_counselor_ids[((v_idx + i) % v_n_pickers) + 1];

      IF p_per_counselor_limit IS NOT NULL THEN
        SELECT rc.count_assigned INTO v_assigned_so_far
        FROM _bulk_rr_run_counts rc
        WHERE rc.counselor_id = v_target;
        v_assigned_so_far := COALESCE(v_assigned_so_far, 0);
        IF v_assigned_so_far >= p_per_counselor_limit THEN
          v_target := NULL;
          CONTINUE;
        END IF;
      END IF;

      SELECT acs.is_paused,
             COALESCE(ac.current_leads, 0) >= COALESCE(ac.max_leads, 9999)
        INTO v_paused, v_at_cap
      FROM admission_counselor_sources acs
      LEFT JOIN admission_counselors ac ON ac.id = v_target
      WHERE acs.counselor_id = v_target
      LIMIT 1;

      IF p_override OR (NOT v_paused AND NOT v_at_cap) THEN
        EXIT;
      END IF;
      v_target := NULL;
    END LOOP;

    IF v_target IS NULL THEN
      INSERT INTO _bulk_rr_plan VALUES (
        v_lead.id, NULL, 'no-candidate',
        CASE
          WHEN p_per_counselor_limit IS NOT NULL THEN 'All targets at run limit, paused, or at cap'
          ELSE 'All targets paused or at cap'
        END
      );
      CONTINUE;
    END IF;

    INSERT INTO _bulk_rr_plan VALUES (v_lead.id, v_target, 'assigned', NULL);
    v_plan := v_plan || v_lead.id::text || '->' || v_target::text || ';';
    v_idx := v_idx + 1;

    INSERT INTO _bulk_rr_run_counts (counselor_id, count_assigned)
    VALUES (v_target, 1)
    ON CONFLICT (counselor_id)
    DO UPDATE SET count_assigned = _bulk_rr_run_counts.count_assigned + 1;
  END LOOP;

  v_hash := encode(digest(v_plan, 'sha256'), 'hex');
  IF p_expected_plan_hash IS NOT NULL AND p_expected_plan_hash <> v_hash THEN
    RAISE EXCEPTION 'plan drift' USING ERRCODE = '40001';
  END IF;

  IF NOT p_dry_run THEN
    PERFORM v_user_id;
    UPDATE admission_leads l
       SET counselor_id          = p.counselor_id,
           assigned_counselor_id = ac.user_id,
           assigned_at           = now(),
           updated_at            = now()
      FROM _bulk_rr_plan p
      LEFT JOIN admission_counselors ac ON ac.id = p.counselor_id
     WHERE l.id = p.lead_id AND p.status = 'assigned';
  END IF;

  RETURN QUERY
    SELECT p.lead_id, p.counselor_id, p.status, p.reason, v_hash
    FROM _bulk_rr_plan p
    ORDER BY p.lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_route_unassigned_leads(uuid[], boolean, boolean, text) IS
  'Auto-route mode. 2026-05-11: added #variable_conflict use_column to suppress collisions between RETURNS TABLE OUT param names and unqualified column references in INSERT/ON CONFLICT/UPDATE statements.';

COMMENT ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text, integer) IS
  'Round-robin mode. 2026-05-11: added #variable_conflict use_column to suppress collisions between RETURNS TABLE OUT param names and unqualified column references.';
