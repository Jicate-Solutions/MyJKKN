-- ============================================================================
-- INTERNSHIP MODULE — Reader Functions v2
-- Migration: 20260509_internship_module_reader_fn_v2.sql
-- Replaces: 20260508_internship_reader_fn.sql (deleted — superseded by simplified version)
-- Functions:
--   1. fn_internship_evaluate_policy(p_key, p_context) — 3-level cascade resolver
--   2. fn_internship_cascade_preview(p_changes) — English consequences for Director UI
--   3. fn_internship_get_active_policy_keys(p_institution_id, p_college_id) — editor helper
-- Pattern source: Spec #537 counselor rules-engine
-- Applied to prod: 2026-05-09 (mcp__supabase__apply_migration as 'internship_module_reader_fn_v2')
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_internship_evaluate_policy(
  p_key     TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_college_id       UUID;
  v_institution_id   UUID;
  v_override_row     internship_college_notification_overrides%ROWTYPE;
  v_policy_row       platform_policies%ROWTYPE;
BEGIN
  v_college_id     := (p_context ->> 'college_id')::uuid;
  v_institution_id := (p_context ->> 'institution_id')::uuid;

  IF v_college_id IS NOT NULL THEN
    SELECT * INTO v_override_row
    FROM internship_college_notification_overrides
    WHERE policy_key     = p_key
      AND college_id     = v_college_id
      AND (institution_id = v_institution_id OR v_institution_id IS NULL)
      AND is_active      = true
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'resolved_value', v_override_row.override_value, 'source', 'college_override',
        'policy_key', p_key, 'college_id', v_college_id, 'institution_id', v_institution_id,
        'override_id', v_override_row.id, 'policy_id', NULL
      );
    END IF;
  END IF;

  IF v_institution_id IS NOT NULL THEN
    SELECT * INTO v_policy_row
    FROM platform_policies
    WHERE policy_key = p_key AND scope_type = 'institution' AND scope_id = v_institution_id AND is_active = true
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'resolved_value', v_policy_row.value, 'source', 'institution_policy',
        'policy_key', p_key, 'college_id', v_college_id, 'institution_id', v_institution_id,
        'override_id', NULL, 'policy_id', v_policy_row.id
      );
    END IF;
  END IF;

  SELECT * INTO v_policy_row
  FROM platform_policies
  WHERE policy_key = p_key AND scope_type = 'global' AND is_active = true
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'resolved_value', v_policy_row.value, 'source', 'global_policy',
      'policy_key', p_key, 'college_id', v_college_id, 'institution_id', v_institution_id,
      'override_id', NULL, 'policy_id', v_policy_row.id
    );
  END IF;

  RETURN jsonb_build_object(
    'resolved_value', NULL, 'source', 'not_found',
    'policy_key', p_key, 'college_id', v_college_id, 'institution_id', v_institution_id,
    'override_id', NULL, 'policy_id', NULL
  );
END;
$$;

COMMENT ON FUNCTION fn_internship_evaluate_policy IS
  'Resolves internship policy with 3-level cascade: college_override > institution_policy > global_policy.';
GRANT EXECUTE ON FUNCTION fn_internship_evaluate_policy(TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION fn_internship_cascade_preview(
  p_changes JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_change JSONB; v_policy_key TEXT; v_new_value JSONB; v_old_value JSONB;
  v_consequences JSONB := '[]'::jsonb; v_consequence JSONB; v_sentence TEXT;
  v_affected_count INT := 0; v_college_count INT := 0; v_send_notif BOOLEAN := false;
  v_total_affected INT := 0; v_total_colleges INT := 0; v_changes_count INT := 0;
BEGIN
  v_changes_count := jsonb_array_length(p_changes);
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_policy_key := v_change ->> 'policy_key';
    v_new_value := v_change -> 'new_value';
    v_old_value := v_change -> 'old_value';
    v_affected_count := 0; v_college_count := 0; v_send_notif := false;

    IF v_policy_key = 'internship.policy.fee_compliance_threshold_pct' THEN
      SELECT COUNT(*) INTO v_affected_count FROM internship_assignments WHERE status='pending' AND fee_compliance_status='non_compliant';
      SELECT COUNT(DISTINCT c.college_id) INTO v_college_count FROM internship_assignments a JOIN internship_posting_cycles c ON c.id=a.cycle_id WHERE a.status='pending' AND a.fee_compliance_status='non_compliant';
      v_sentence := format('Changing fee compliance threshold to %s%% affects %s pending assignments in %s colleges.', COALESCE(v_new_value #>> '{}', '?'), v_affected_count, v_college_count);
    ELSIF v_policy_key = 'internship.policy.gps_geofence_strict_block' THEN
      SELECT COUNT(*) INTO v_affected_count FROM internship_assignments WHERE status='active';
      SELECT COUNT(DISTINCT c.college_id) INTO v_college_count FROM internship_assignments a JOIN internship_posting_cycles c ON c.id=a.cycle_id WHERE a.status='active';
      v_send_notif := true;
      v_sentence := format('%s GPS strict-block will affect %s active assignments across %s colleges. Change takes effect immediately.', CASE WHEN (v_new_value #>> '{}')::boolean THEN 'Enabling' ELSE 'Disabling' END, v_affected_count, v_college_count);
    ELSIF v_policy_key = 'internship.policy.incident_escalation_tier1_hours' THEN
      SELECT COUNT(*) INTO v_affected_count FROM internship_incidents WHERE severity='minor' AND status IN ('reported','under_review') AND created_at > now() - INTERVAL '7 days';
      v_sentence := format('Changing minor incident escalation window to %s h. %s minor incidents in past 7 days will be re-evaluated.', COALESCE(v_new_value #>> '{}', '?'), v_affected_count);
    ELSE
      SELECT COUNT(*) INTO v_affected_count FROM internship_assignments WHERE status='active';
      v_sentence := format('Changing policy "%s" from %s to %s. Affects %s active assignments. Change takes effect immediately on next policy read.', v_policy_key, COALESCE(v_old_value #>> '{}', 'unset'), COALESCE(v_new_value #>> '{}', 'unset'), v_affected_count);
    END IF;

    v_total_affected := v_total_affected + v_affected_count;
    v_total_colleges := GREATEST(v_total_colleges, v_college_count);
    v_consequence := jsonb_build_object('policy_key', v_policy_key, 'sentence', v_sentence,
      'affected_assignments_count', v_affected_count, 'affected_colleges_count', v_college_count,
      'send_notification_recommended', v_send_notif);
    v_consequences := v_consequences || jsonb_build_array(v_consequence);
  END LOOP;

  RETURN jsonb_build_object(
    'summary', format('%s policy change(s) affect %s assignment(s) across %s college(s)', v_changes_count, v_total_affected, v_total_colleges),
    'consequences', v_consequences, 'total_affected_assignments', v_total_affected,
    'total_affected_colleges', v_total_colleges, 'changes_count', v_changes_count
  );
END;
$$;

COMMENT ON FUNCTION fn_internship_cascade_preview IS 'Returns plain-English cascade consequences for proposed policy changes (Director cascade-preview pane).';
GRANT EXECUTE ON FUNCTION fn_internship_cascade_preview(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION fn_internship_get_active_policy_keys(
  p_institution_id UUID DEFAULT NULL,
  p_college_id     UUID DEFAULT NULL
)
RETURNS TABLE (policy_key TEXT, resolved_value JSONB, source TEXT, data_type TEXT, description TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pp.policy_key, pp.value, 'global_policy'::text, pp.data_type, pp.description
  FROM platform_policies pp
  WHERE pp.policy_key LIKE 'internship.%' AND pp.is_active = true AND pp.scope_type = 'global'
  ORDER BY pp.policy_key;
$$;

COMMENT ON FUNCTION fn_internship_get_active_policy_keys IS 'Lists all active internship.* policies for Director editor.';
GRANT EXECUTE ON FUNCTION fn_internship_get_active_policy_keys(UUID, UUID) TO authenticated;
