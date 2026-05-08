-- ============================================================================
-- INTERNSHIP MODULE — Reader Functions
-- Migration: 20260508_internship_reader_fn.sql
-- Depends on: 20260508_internship_module_substrate.sql
--             20260508_internship_module_seeds.sql
-- Spec: specs/myjkkn-internship-module-spec.md section 4, locked 2026-05-08
-- Functions:
--   1. fn_internship_evaluate_policy(p_key, p_context) → JSONB
--      Mirrors fn_auto_assign_counselor_v2 pattern (Spec #537)
--   2. fn_internship_cascade_preview(p_changes) → JSONB
--      Returns English-consequence preview for Director cascade-preview pane
-- RISK TIER: 1 — CREATE OR REPLACE FUNCTION only, no data writes
-- pgcrypto: not used here; extensions.gen_random_bytes if needed per
--   feedback_supabase_pgcrypto_extensions_schema.md
-- ============================================================================

-- ============================================================================
-- FUNCTION 1: fn_internship_evaluate_policy
-- Reads cross-cutting policy from platform_policies with college-level cascade:
--   1. Check internship_college_notification_overrides (college-specific override)
--   2. Fallback to platform_policies (global value)
--   3. Returns resolved value + cascade audit (which source was used)
--
-- Parameters:
--   p_key        TEXT  — policy_key (e.g. 'internship.logbook.submit_within_hours')
--   p_context    JSONB — context with optional college_id, institution_id
--                        e.g. '{"college_id": "uuid", "institution_id": "uuid"}'
--
-- Returns JSONB:
--   {
--     "resolved_value": <value>,
--     "source": "college_override" | "global_policy" | "not_found",
--     "policy_key": "...",
--     "college_id": "..." | null,
--     "institution_id": "..." | null,
--     "override_id": "..." | null,
--     "policy_id": "..." | null
--   }
--
-- ★ Source: spec section 4 — mirrors Spec #537 counselor rules-engine pattern
-- ★ pgcrypto: extensions schema qualified per feedback_supabase_pgcrypto_extensions_schema
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
  v_resolved_value   JSONB;
  v_source           TEXT;
  v_override_id      UUID;
  v_policy_id        UUID;
BEGIN
  -- Extract context
  v_college_id     := (p_context ->> 'college_id')::uuid;
  v_institution_id := (p_context ->> 'institution_id')::uuid;

  -- ── STEP 1: College-level override in internship_college_notification_overrides ──
  IF v_college_id IS NOT NULL THEN
    SELECT * INTO v_override_row
    FROM internship_college_notification_overrides
    WHERE policy_key     = p_key
      AND college_id     = v_college_id
      AND (institution_id = v_institution_id OR v_institution_id IS NULL)
      AND is_active      = true
    LIMIT 1;

    IF FOUND THEN
      v_resolved_value := v_override_row.override_value;
      v_source         := 'college_override';
      v_override_id    := v_override_row.id;
      RETURN jsonb_build_object(
        'resolved_value',  v_resolved_value,
        'source',          v_source,
        'policy_key',      p_key,
        'college_id',      v_college_id,
        'institution_id',  v_institution_id,
        'override_id',     v_override_id,
        'policy_id',       NULL
      );
    END IF;
  END IF;

  -- ── STEP 2: Institution-scoped platform_policies row ──
  IF v_institution_id IS NOT NULL THEN
    SELECT * INTO v_policy_row
    FROM platform_policies
    WHERE policy_key  = p_key
      AND scope_type  = 'institution'
      AND scope_id    = v_institution_id
      AND is_active   = true
    LIMIT 1;

    IF FOUND THEN
      v_resolved_value := v_policy_row.value;
      v_source         := 'institution_policy';
      v_policy_id      := v_policy_row.id;
      RETURN jsonb_build_object(
        'resolved_value',  v_resolved_value,
        'source',          v_source,
        'policy_key',      p_key,
        'college_id',      v_college_id,
        'institution_id',  v_institution_id,
        'override_id',     NULL,
        'policy_id',       v_policy_id
      );
    END IF;
  END IF;

  -- ── STEP 3: Global platform_policies fallback ──
  SELECT * INTO v_policy_row
  FROM platform_policies
  WHERE policy_key = p_key
    AND scope_type = 'global'
    AND is_active  = true
  LIMIT 1;

  IF FOUND THEN
    v_resolved_value := v_policy_row.value;
    v_source         := 'global_policy';
    v_policy_id      := v_policy_row.id;
    RETURN jsonb_build_object(
      'resolved_value',  v_resolved_value,
      'source',          v_source,
      'policy_key',      p_key,
      'college_id',      v_college_id,
      'institution_id',  v_institution_id,
      'override_id',     NULL,
      'policy_id',       v_policy_id
    );
  END IF;

  -- ── STEP 4: Not found — return structured null ──
  RETURN jsonb_build_object(
    'resolved_value',  NULL,
    'source',          'not_found',
    'policy_key',      p_key,
    'college_id',      v_college_id,
    'institution_id',  v_institution_id,
    'override_id',     NULL,
    'policy_id',       NULL
  );
END;
$$;

COMMENT ON FUNCTION fn_internship_evaluate_policy IS
  'Resolves internship policy value with 3-level cascade: college_override > institution_policy > global_policy. '
  'Returns JSONB with resolved_value + source audit (which layer matched). '
  'Mirrors Spec #537 counselor rules-engine pattern. '
  'Call from: lib/services/admin/internship-policy-service.ts.';

-- Grant execute to authenticated users (service layer calls this client-side)
GRANT EXECUTE ON FUNCTION fn_internship_evaluate_policy(TEXT, JSONB) TO authenticated;

-- ============================================================================
-- FUNCTION 2: fn_internship_cascade_preview
-- Takes a proposed batch of policy changes and returns English-language
-- consequence sentences for the cascade-preview pane.
--
-- Parameters:
--   p_changes JSONB — proposed changes array:
--     [
--       {"policy_key": "internship.logbook.submit_within_hours",
--        "new_value": 12, "old_value": 24},
--       ...
--     ]
--
-- Returns JSONB:
--   {
--     "summary": "2 policy changes will affect...",
--     "consequences": [
--       {
--         "policy_key": "internship.logbook.submit_within_hours",
--         "sentence": "Changing logbook deadline from 24h to 12h...",
--         "affected_assignments_count": 47,
--         "affected_colleges_count": 3,
--         "send_notification_recommended": true
--       }
--     ],
--     "total_affected_assignments": 47,
--     "total_affected_colleges": 3,
--     "changes_count": 2
--   }
--
-- ★ Source: spec section 5 (cascade-preview pane), spec section 11 Decision 6 (attendance)
--           spec section 11 Decision 19 (accumulating preview)
-- ============================================================================
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
  v_change           JSONB;
  v_policy_key       TEXT;
  v_new_value        JSONB;
  v_old_value        JSONB;
  v_consequences     JSONB := '[]'::jsonb;
  v_consequence      JSONB;
  v_sentence         TEXT;
  v_affected_count   INT := 0;
  v_college_count    INT := 0;
  v_send_notif       BOOLEAN := false;
  v_total_affected   INT := 0;
  v_total_colleges   INT := 0;
  v_changes_count    INT := 0;
BEGIN
  v_changes_count := jsonb_array_length(p_changes);

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_policy_key := v_change ->> 'policy_key';
    v_new_value  := v_change -> 'new_value';
    v_old_value  := v_change -> 'old_value';
    v_affected_count := 0;
    v_college_count  := 0;
    v_send_notif     := false;

    -- ── Logbook deadline change ──
    IF v_policy_key = 'internship.logbook.submit_within_hours' THEN
      SELECT COUNT(*) INTO v_affected_count
      FROM internship_assignments
      WHERE status IN ('active', 'completed')
        AND logbook_entries_count > 0;

      SELECT COUNT(DISTINCT c.college_id) INTO v_college_count
      FROM internship_assignments a
      JOIN internship_posting_cycles c ON c.id = a.cycle_id
      WHERE a.status = 'active';

      v_send_notif := true;
      v_sentence := format(
        'Changing logbook deadline from %s h to %s h will affect %s active assignments across %s colleges. '
        'Learners with drafts in progress may miss the tighter window. '
        'Recommend sending a logbook reminder notification.',
        COALESCE(v_old_value #>> '{}', '?'),
        COALESCE(v_new_value #>> '{}', '?'),
        v_affected_count,
        v_college_count
      );

    -- ── Attendance flag threshold change ──
    ELSIF v_policy_key = 'internship.attendance.flag_below_pct' THEN
      SELECT COUNT(*) INTO v_affected_count
      FROM internship_assignments
      WHERE status = 'active'
        AND attendance_percentage < (v_new_value #>> '{}')::numeric;

      SELECT COUNT(DISTINCT c.college_id) INTO v_college_count
      FROM internship_assignments a
      JOIN internship_posting_cycles c ON c.id = a.cycle_id
      WHERE a.status = 'active'
        AND a.attendance_percentage < (v_new_value #>> '{}')::numeric;

      v_send_notif := (v_affected_count > 0);
      v_sentence := format(
        'Lowering attendance flag threshold to %s%% will flag %s currently-active assignments '
        'across %s colleges as attendance-risk (previously unflagged). '
        'Affected learners'' coordinators will see new flag alerts.',
        COALESCE(v_new_value #>> '{}', '?'),
        v_affected_count,
        v_college_count
      );

    -- ── Fee compliance threshold change ──
    ELSIF v_policy_key = 'internship.policy.fee_compliance_threshold_pct' THEN
      SELECT COUNT(*) INTO v_affected_count
      FROM internship_assignments
      WHERE status = 'pending'
        AND fee_compliance_status = 'non_compliant';

      SELECT COUNT(DISTINCT c.college_id) INTO v_college_count
      FROM internship_assignments a
      JOIN internship_posting_cycles c ON c.id = a.cycle_id
      WHERE a.status = 'pending'
        AND a.fee_compliance_status = 'non_compliant';

      v_sentence := format(
        'Changing fee compliance threshold to %s%% affects %s pending assignments in %s colleges. '
        'Assignments currently marked non_compliant will be re-evaluated on next fee-check run.',
        COALESCE(v_new_value #>> '{}', '?'),
        v_affected_count,
        v_college_count
      );

    -- ── Incident escalation tier 1 hours ──
    ELSIF v_policy_key = 'internship.policy.incident_escalation_tier1_hours' THEN
      SELECT COUNT(*) INTO v_affected_count
      FROM internship_incidents
      WHERE severity = 'minor'
        AND status IN ('reported','under_review')
        AND created_at > now() - INTERVAL '7 days';

      v_sentence := format(
        'Changing minor incident escalation window to %s h. '
        '%s minor incidents in the past 7 days are in reported/under_review state — '
        'they will be re-evaluated against the new window on next escalation cron run.',
        COALESCE(v_new_value #>> '{}', '?'),
        v_affected_count
      );

    -- ── GPS strict block toggle ──
    ELSIF v_policy_key = 'internship.policy.gps_geofence_strict_block' THEN
      SELECT COUNT(*) INTO v_affected_count
      FROM internship_assignments WHERE status = 'active';

      SELECT COUNT(DISTINCT c.college_id) INTO v_college_count
      FROM internship_assignments a
      JOIN internship_posting_cycles c ON c.id = a.cycle_id
      WHERE a.status = 'active';

      v_send_notif := true;
      v_sentence := format(
        '%s GPS strict-block will affect %s active assignments across %s colleges. '
        'When enabled, learners outside the geofence radius cannot mark attendance. '
        'Changing this setting takes effect immediately for next attendance marking.',
        CASE WHEN (v_new_value #>> '{}')::boolean THEN 'Enabling' ELSE 'Disabling' END,
        v_affected_count,
        v_college_count
      );

    -- ── Generic fallback for any other policy key ──
    ELSE
      SELECT COUNT(*) INTO v_affected_count
      FROM internship_assignments WHERE status = 'active';

      v_sentence := format(
        'Changing policy "%s" from %s to %s. '
        'This policy affects %s active assignments. '
        'Change takes effect immediately on next policy read.',
        v_policy_key,
        COALESCE(v_old_value #>> '{}', 'unset'),
        COALESCE(v_new_value #>> '{}', 'unset'),
        v_affected_count
      );
    END IF;

    v_total_affected := v_total_affected + v_affected_count;
    v_total_colleges := GREATEST(v_total_colleges, v_college_count);

    v_consequence := jsonb_build_object(
      'policy_key',                  v_policy_key,
      'sentence',                    v_sentence,
      'affected_assignments_count',  v_affected_count,
      'affected_colleges_count',     v_college_count,
      'send_notification_recommended', v_send_notif
    );

    v_consequences := v_consequences || jsonb_build_array(v_consequence);
  END LOOP;

  RETURN jsonb_build_object(
    'summary',                    format('%s policy change(s) affect %s assignment(s) across %s college(s)',
                                    v_changes_count, v_total_affected, v_total_colleges),
    'consequences',               v_consequences,
    'total_affected_assignments', v_total_affected,
    'total_affected_colleges',    v_total_colleges,
    'changes_count',              v_changes_count
  );
END;
$$;

COMMENT ON FUNCTION fn_internship_cascade_preview IS
  'Returns plain-English cascade consequences for proposed internship policy changes. '
  'Used by cascade-preview pane in /admin/internship-policy/* Director UIs. '
  'Input: array of {policy_key, new_value, old_value}. '
  'Output: {summary, consequences[], total_affected_assignments, total_affected_colleges}. '
  'Add new ELSIF branches as new policy keys are added.';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION fn_internship_cascade_preview(JSONB) TO authenticated;

-- ============================================================================
-- FUNCTION 3: fn_internship_get_active_policy_keys
-- Helper: returns all seeded internship policy keys with their current values
-- Used by the Director policy editor UI to populate the settings table
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_internship_get_active_policy_keys(
  p_institution_id UUID DEFAULT NULL,
  p_college_id     UUID DEFAULT NULL
)
RETURNS TABLE (
  policy_key      TEXT,
  resolved_value  JSONB,
  source          TEXT,
  data_type       TEXT,
  description     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    pp.policy_key,
    pp.value              AS resolved_value,
    'global_policy'::text AS source,
    pp.data_type,
    pp.description
  FROM platform_policies pp
  WHERE pp.policy_key LIKE 'internship.%'
    AND pp.is_active = true
    AND pp.scope_type = 'global'
  ORDER BY pp.policy_key;
$$;

COMMENT ON FUNCTION fn_internship_get_active_policy_keys IS
  'Returns all active internship.* platform_policies rows. '
  'Used by Director policy editor to list + edit all internship settings in one page.';

GRANT EXECUTE ON FUNCTION fn_internship_get_active_policy_keys(UUID, UUID) TO authenticated;

-- ============================================================================
-- DONE
-- fn_internship_evaluate_policy   — 3-level cascade resolver (college > institution > global)
-- fn_internship_cascade_preview   — English-consequence pane for Director UI
-- fn_internship_get_active_policy_keys — policy editor helper
-- ============================================================================
