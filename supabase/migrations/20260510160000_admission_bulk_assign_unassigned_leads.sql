-- ============================================================================
-- Bulk-assign unassigned leads — two SECURITY DEFINER RPCs powering the
-- "Distribute Unassigned Leads" panel on /admission/settings/sources/[id].
--
--   bulk_route_unassigned_leads — delegates per-lead pick to the routing
--     engine (fn_auto_assign_counselor_v3). Honors weights/caps unless
--     p_override is true. Returns a per-lead status report.
--
--   bulk_round_robin_assign — splits the leads cyclically across an
--     ordered counselor list. Skips paused/at-cap targets by probing
--     forward up to N positions before declaring 'no-candidate'.
--
-- Both functions:
--   - Check permission at function entry; SECURITY DEFINER skips RLS
--     on admission_leads inside the body.
--   - Support p_dry_run=true to compute the plan without UPDATE-ing rows.
--   - Compute a SHA-256 plan hash; if the caller passes
--     p_expected_plan_hash and it differs, raise 40001 (serialization
--     failure) so the client can refresh its preview.
--
-- Spec: docs/superpowers/specs/2026-05-10-distribute-unassigned-leads-design.md
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- bulk_route_unassigned_leads — Mode B (Auto-route via routing engine)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_route_unassigned_leads(
  p_lead_ids           uuid[],
  p_dry_run            boolean DEFAULT false,
  p_override           boolean DEFAULT false,
  p_expected_plan_hash text    DEFAULT NULL
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

  FOR v_lead IN
    SELECT id, source, institution_id
    FROM admission_leads
    WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL
    ORDER BY created_at
  LOOP
    SELECT fn_auto_assign_counselor_v3(
      p_lead_id        => v_lead.id,
      p_force_override => p_override
    ) INTO v_pick;

    IF v_pick IS NULL THEN
      RETURN QUERY SELECT v_lead.id, NULL::uuid, 'no-candidate'::text,
                          'No eligible counselor at engine eval'::text, NULL::text;
      CONTINUE;
    END IF;

    v_plan := v_plan || v_lead.id::text || '->' || v_pick::text || ';';

    IF NOT p_dry_run THEN
      UPDATE admission_leads
        SET counselor_id = v_pick,
            assigned_at  = now(),
            assigned_by  = v_user_id
        WHERE id = v_lead.id;
    END IF;

    RETURN QUERY SELECT v_lead.id, v_pick, 'assigned'::text, NULL::text, NULL::text;
  END LOOP;

  v_hash := encode(digest(v_plan, 'sha256'), 'hex');
  IF p_expected_plan_hash IS NOT NULL AND p_expected_plan_hash <> v_hash THEN
    RAISE EXCEPTION 'plan drift: expected % got %', p_expected_plan_hash, v_hash
      USING ERRCODE = '40001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_route_unassigned_leads(uuid[], boolean, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_route_unassigned_leads(uuid[], boolean, boolean, text) IS
  'Bulk auto-route unassigned leads via the routing engine. Per-lead atomic with partial-success reporting. p_dry_run computes the plan without writing. p_override requires bulk_override permission.';

-- ----------------------------------------------------------------------------
-- bulk_round_robin_assign — Mode C (cyclic split across given counselors)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_round_robin_assign(
  p_lead_ids           uuid[],
  p_counselor_ids      uuid[],
  p_dry_run            boolean DEFAULT false,
  p_override           boolean DEFAULT false,
  p_expected_plan_hash text    DEFAULT NULL
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
  v_today_count int;
  v_plan      text := '';
  v_hash      text;
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

  FOR v_lead IN
    SELECT id FROM admission_leads
    WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL
    ORDER BY created_at
  LOOP
    -- Probe forward up to N positions to find a non-paused, under-cap target
    FOR i IN 0..v_n_pickers-1 LOOP
      v_target := p_counselor_ids[((v_idx + i) % v_n_pickers) + 1];

      SELECT acs.is_paused,
             COALESCE(ac.current_leads, 0) >= COALESCE(ac.max_leads, 9999),
             (
               SELECT COUNT(*) FROM admission_leads l
               WHERE l.counselor_id = v_target
                 AND l.assigned_at::date = CURRENT_DATE
             )
        INTO v_paused, v_at_cap, v_today_count
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
      RETURN QUERY SELECT v_lead.id, NULL::uuid, 'no-candidate'::text,
                          'All targets paused or at cap'::text, NULL::text;
      CONTINUE;
    END IF;

    v_idx := v_idx + 1;
    v_plan := v_plan || v_lead.id::text || '->' || v_target::text || ';';

    IF NOT p_dry_run THEN
      UPDATE admission_leads
        SET counselor_id = v_target,
            assigned_at  = now(),
            assigned_by  = v_user_id
        WHERE id = v_lead.id;
    END IF;

    RETURN QUERY SELECT v_lead.id, v_target, 'assigned'::text, NULL::text, NULL::text;
  END LOOP;

  v_hash := encode(digest(v_plan, 'sha256'), 'hex');
  IF p_expected_plan_hash IS NOT NULL AND p_expected_plan_hash <> v_hash THEN
    RAISE EXCEPTION 'plan drift: expected % got %', p_expected_plan_hash, v_hash
      USING ERRCODE = '40001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text) IS
  'Cyclic split of unassigned leads across an ordered counselor list. Skips paused/at-cap unless p_override. Per-lead atomic with partial-success reporting.';

COMMIT;
