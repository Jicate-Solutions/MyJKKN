-- ============================================================================
-- Add p_per_counselor_limit to bulk_round_robin_assign so admins can cap
-- each counselor at N leads in a single run. Useful when there are many
-- more unassigned leads than the team should absorb in one batch (e.g.,
-- 6,000 leads ÷ 5 counselors with limit=500 → each gets exactly 500,
-- 3,500 stay unassigned for the next round).
--
-- p_per_counselor_limit = NULL (default) preserves the existing behavior:
-- cycle indefinitely until all selected leads are assigned.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.bulk_round_robin_assign(
  uuid[], uuid[], boolean, boolean, text
);

CREATE OR REPLACE FUNCTION public.bulk_round_robin_assign(
  p_lead_ids             uuid[],
  p_counselor_ids        uuid[],
  p_dry_run              boolean DEFAULT false,
  p_override             boolean DEFAULT false,
  p_expected_plan_hash   text    DEFAULT NULL,
  p_per_counselor_limit  integer DEFAULT NULL
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

  -- Tracks per-counselor count assigned in THIS run, for the optional
  -- p_per_counselor_limit cap.
  CREATE TEMP TABLE _bulk_rr_run_counts (
    counselor_id    uuid PRIMARY KEY,
    count_assigned  int DEFAULT 0
  ) ON COMMIT DROP;

  FOR v_lead IN
    SELECT id FROM admission_leads
    WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL
    ORDER BY created_at
  LOOP
    -- Probe forward up to N positions to find a non-paused, under-cap,
    -- under-run-limit target.
    FOR i IN 0..v_n_pickers-1 LOOP
      v_target := p_counselor_ids[((v_idx + i) % v_n_pickers) + 1];

      -- Skip if at the per-run limit
      IF p_per_counselor_limit IS NOT NULL THEN
        SELECT count_assigned INTO v_assigned_so_far
        FROM _bulk_rr_run_counts WHERE counselor_id = v_target;
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

    -- Bump per-run count
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
    UPDATE admission_leads l
       SET counselor_id          = p.counselor_id,
           assigned_counselor_id = ac.user_id,
           assigned_at           = now(),
           assigned_by           = v_user_id
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

GRANT EXECUTE ON FUNCTION public.bulk_round_robin_assign(
  uuid[], uuid[], boolean, boolean, text, integer
) TO authenticated;

COMMENT ON FUNCTION public.bulk_round_robin_assign(
  uuid[], uuid[], boolean, boolean, text, integer
) IS
  'Cyclic split of unassigned leads across an ordered counselor list. p_per_counselor_limit (NULL = unlimited) caps each counselor at N leads in this run; useful for "give each counselor exactly 500 leads, leave the rest for next round". Sets BOTH counselor_id and assigned_counselor_id atomically.';

COMMIT;
