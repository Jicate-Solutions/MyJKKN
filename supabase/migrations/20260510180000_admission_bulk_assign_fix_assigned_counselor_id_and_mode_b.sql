-- ============================================================================
-- Fix two bugs in the bulk-assign RPCs that shipped today:
--
--   Bug A: bulk_route_unassigned_leads called
--     fn_auto_assign_counselor_v3(p_lead_id, p_force_override)
--   but v3 is a trigger function with NO arguments. Mode B (Auto-route)
--   would fail at runtime with "function does not exist".
--
--   Bug B: Both RPCs (and BulkAssignService.assignAllToOne) updated only
--   admission_leads.counselor_id, leaving assigned_counselor_id NULL.
--   The Distribution analytics RPC and the RLS direct-assignment branch
--   both key on assigned_counselor_id (profiles.id), so bulk-assigned
--   leads were:
--     1. Invisible to the assigned counselor via direct-assignment RLS
--        (they only saw the lead via source-mapping path, which is fine
--        for the panel's intended use but a latent gap).
--     2. Unattributed in the Distribution KPIs and per-counselor
--        breakdown — manifested as "Counselors: 0" after assignment.
--
-- Fix:
--   1. New helper _pick_counselor_for_source(p_lead_id, p_override)
--      replicates v3's institution_and_source strategy as a callable
--      SQL function. Picks the least-weighted-loaded mapped counselor.
--   2. bulk_route_unassigned_leads calls the new helper.
--   3. Both RPCs' UPDATE now joins admission_counselors and sets
--      assigned_counselor_id = ac.user_id.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper: pick a mapped counselor for a lead's source.
-- Mirrors fn_auto_assign_counselor_v3's institution_and_source strategy
-- but as a callable function rather than a NEW-row trigger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pick_counselor_for_source(
  p_lead_id  uuid,
  p_override boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead         record;
  v_counselor_id uuid;
BEGIN
  SELECT id, source, institution_id INTO v_lead
  FROM admission_leads WHERE id = p_lead_id;

  IF v_lead.id IS NULL OR v_lead.institution_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_counselor_id
  FROM admission_counselors c
  JOIN admission_counselor_sources cs    ON cs.counselor_id = c.id
  JOIN admission_lead_sources_master slm ON slm.id = cs.source_id
                                          AND slm.enum_value = v_lead.source
                                          AND slm.is_active = TRUE
  WHERE c.institution_id = v_lead.institution_id
    AND c.is_active = TRUE
    AND (p_override OR cs.is_paused = FALSE)
    AND (cs.effective_from IS NULL OR cs.effective_from <= now())
    AND (cs.effective_to   IS NULL OR cs.effective_to   >  now())
    AND (
      p_override
      OR cs.max_leads_per_day IS NULL
      OR (
        SELECT COUNT(*) FROM admission_leads al2
         WHERE al2.counselor_id = c.id
           AND al2.source = v_lead.source
           AND al2.assigned_at >= date_trunc('day', now())
           AND al2.assigned_at <  date_trunc('day', now()) + interval '1 day'
      ) < cs.max_leads_per_day
    )
  ORDER BY
    -- Least-loaded-by-weight first; ties broken by random.
    COALESCE(c.current_leads, 0)::numeric / NULLIF(cs.priority_weight, 0) ASC NULLS LAST,
    RANDOM()
  LIMIT 1;

  RETURN v_counselor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public._pick_counselor_for_source(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public._pick_counselor_for_source(uuid, boolean) IS
  'Picks a single mapped counselor for the given lead''s source, mirroring fn_auto_assign_counselor_v3''s institution_and_source strategy. Returns NULL if no eligible counselor. Used by bulk_route_unassigned_leads.';

-- ----------------------------------------------------------------------------
-- Rewrite bulk_route_unassigned_leads:
--   - Use _pick_counselor_for_source instead of the broken v3 trigger call.
--   - Populate assigned_counselor_id from admission_counselors.user_id.
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

  CREATE TEMP TABLE _bulk_route_plan (
    lead_id      uuid,
    counselor_id uuid,
    status       text,
    reason       text
  ) ON COMMIT DROP;

  FOR v_lead IN
    SELECT id, source, institution_id
    FROM admission_leads
    WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL
    ORDER BY created_at
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
    UPDATE admission_leads l
       SET counselor_id          = p.counselor_id,
           assigned_counselor_id = ac.user_id,
           assigned_at           = now(),
           assigned_by           = v_user_id
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

COMMENT ON FUNCTION public.bulk_route_unassigned_leads(uuid[], boolean, boolean, text) IS
  'Bulk auto-route unassigned leads via _pick_counselor_for_source. Sets BOTH counselor_id and assigned_counselor_id (from admission_counselors.user_id) so the assigned user gets RLS direct-assignment visibility AND the analytics RPC can attribute the lead. Two-pass: pass 1 plans without writing, pass 2 applies if not dry-run.';

-- ----------------------------------------------------------------------------
-- Rewrite bulk_round_robin_assign with the same assigned_counselor_id fix.
-- (Mode C wasn't broken structurally — only the missing assigned_counselor_id
-- write. But we re-CREATE OR REPLACE the whole body for clarity.)
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

  CREATE TEMP TABLE _bulk_rr_plan (
    lead_id      uuid,
    counselor_id uuid,
    status       text,
    reason       text
  ) ON COMMIT DROP;

  FOR v_lead IN
    SELECT id FROM admission_leads
    WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL
    ORDER BY created_at
  LOOP
    FOR i IN 0..v_n_pickers-1 LOOP
      v_target := p_counselor_ids[((v_idx + i) % v_n_pickers) + 1];

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
        v_lead.id, NULL, 'no-candidate', 'All targets paused or at cap'
      );
    ELSE
      INSERT INTO _bulk_rr_plan VALUES (v_lead.id, v_target, 'assigned', NULL);
      v_plan := v_plan || v_lead.id::text || '->' || v_target::text || ';';
      v_idx := v_idx + 1;
    END IF;
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

COMMENT ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text) IS
  'Cyclic split of unassigned leads across an ordered counselor list. Sets BOTH counselor_id and assigned_counselor_id (from admission_counselors.user_id) so the assigned user gets RLS direct-assignment visibility AND the analytics RPC can attribute the lead.';

COMMIT;
