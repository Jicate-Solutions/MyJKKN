-- Wave 3 M7 — Sprint 5 HR_ATT_* keys absorbed into hr.attendance.* nested namespace.
--
-- Per Director-locked decision in specs/hr-policy-jsonb-structures-2026-05-15.md
-- §"Sprint 5 HR_ATT_* absorption" (2026-05-15). The 14 Sprint 5 attendance
-- policy keys live in platform_policies under flat names like
-- `hr.attendance.holiday_backfill_lookback_days` — Wave 3 reorganises them
-- under nested sub-namespaces (e.g. `hr.attendance.holiday_handling.backfill_lookback_days`)
-- so the new Wave 3 admin UI can group them cleanly.
--
-- Plain-English description (TIER-1, data-touching):
--   - 14 rows in platform_policies will have their `policy_key` column renamed
--     from old flat name to new namespaced name.
--   - All scopes promoted from 'global' to 'institution' per Director Q3-R2
--     (every config is per-institution; institution row inherits global default
--     via fn_get_policy fallback).
--   - Two existing SQL functions (fn_purge_attendance_audit_log,
--     fn_holiday_backfill_attendance trigger fn) are re-created with the new
--     key strings so they keep resolving values.
--   - lib/policies/keys.ts kept-as-alias updates apply at TS layer
--     (separate commit in same PR) — Sprint 5 TS consumers keep working
--     because the old constant names now point to the new keys.
--
-- Reversibility: swap UPDATE old↔new policy_key and re-CREATE functions with
-- old strings. No data loss.
--
-- 2026-06-11

BEGIN;

-- ============================================================
-- 1. Rename the 14 policy_key values
-- ============================================================

UPDATE platform_policies SET policy_key = 'hr.attendance.holiday_handling.backfill_lookback_days'
  WHERE policy_key = 'hr.attendance.holiday_backfill_lookback_days';

UPDATE platform_policies SET policy_key = 'hr.attendance.audit.retention_years'
  WHERE policy_key = 'hr.attendance.audit_retention_years';

UPDATE platform_policies SET policy_key = 'hr.attendance.geofence.mode'
  WHERE policy_key = 'hr.attendance.geofence_mode';

UPDATE platform_policies SET policy_key = 'hr.attendance.geofence.radius_m'
  WHERE policy_key = 'hr.attendance.geofence_radius_m';

UPDATE platform_policies SET policy_key = 'hr.attendance.auto_approve.threshold_minutes'
  WHERE policy_key = 'hr.attendance.auto_approve_threshold_minutes';

UPDATE platform_policies SET policy_key = 'hr.attendance.self_heal.step2_channels'
  WHERE policy_key = 'hr.attendance.self_heal_step2_channels';

UPDATE platform_policies SET policy_key = 'hr.attendance.self_heal.window_hours'
  WHERE policy_key = 'hr.attendance.self_heal_window_hours';

UPDATE platform_policies SET policy_key = 'hr.attendance.class_proxy.day_calc_default'
  WHERE policy_key = 'hr.attendance.class_proxy_day_calc_default';

UPDATE platform_policies SET policy_key = 'hr.attendance.class_proxy.cross_college_enabled'
  WHERE policy_key = 'hr.attendance.cross_college_proxy_enabled';

UPDATE platform_policies SET policy_key = 'hr.attendance.team_view.privacy_mode'
  WHERE policy_key = 'hr.attendance.team_view_privacy_mode';

UPDATE platform_policies SET policy_key = 'hr.attendance.monthly_letter.mode'
  WHERE policy_key = 'hr.attendance.monthly_letter_mode';

UPDATE platform_policies SET policy_key = 'hr.attendance.late_arrival.action'
  WHERE policy_key = 'hr.attendance.late_arrival_action';

UPDATE platform_policies SET policy_key = 'hr.attendance.biometric.priority_over_self_mark'
  WHERE policy_key = 'hr.attendance.biometric_priority_over_self_mark';

UPDATE platform_policies SET policy_key = 'hr.attendance.pattern_detection.multi_day'
  WHERE policy_key = 'hr.attendance.multi_day_pattern_detection';

-- ============================================================
-- 2. Re-create the SQL functions that hardcode old key names
--    (so renamed rows still back the runtime path)
-- ============================================================

-- 2a. fn_purge_attendance_audit_log — was reading hr.attendance.audit_retention_years
--     now reads hr.attendance.audit.retention_years
CREATE OR REPLACE FUNCTION fn_purge_attendance_audit_log()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INT := 0;
  v_org RECORD;
  v_deleted INT;
  v_years INT;
  v_policy_default INT;
BEGIN
  v_policy_default := fn_get_policy_int('hr.attendance.audit.retention_years', 7, NULL);

  FOR v_org IN
    SELECT institution_id, MIN(audit_retention_years) AS years
    FROM hr_organizations
    WHERE institution_id IS NOT NULL
    GROUP BY institution_id
  LOOP
    v_years := COALESCE(
      fn_get_policy_int('hr.attendance.audit.retention_years', NULL, v_org.institution_id),
      v_org.years,
      v_policy_default,
      7
    );

    DELETE FROM hr_attendance_audit_log
      WHERE institution_id = v_org.institution_id
        AND created_at < NOW() - (v_years || ' years')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
  END LOOP;

  RETURN v_total;
END;
$$;

-- 2b. fn_holiday_backfill_attendance trigger fn — was reading
--     hr.attendance.holiday_backfill_lookback_days
--     now reads hr.attendance.holiday_handling.backfill_lookback_days
--
-- NOTE: Function name & signature preserved exactly. Only the policy_key
-- string inside the body changes. Triggers attached to the function are
-- left alone (CREATE OR REPLACE preserves them).

DO $migrate$
DECLARE
  v_function_exists BOOLEAN;
BEGIN
  -- Only re-create if the original function exists in this DB
  -- (avoids failure on fresh dev DBs where Sprint 5 hasn't run yet)
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_holiday_backfill_attendance'
  ) INTO v_function_exists;

  IF v_function_exists THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION fn_holiday_backfill_attendance()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_inst_id        UUID;
        v_lookback_days  INT;
        v_cutoff         DATE;
        v_start          DATE;
        v_end            DATE;
        v_holiday_status_id UUID;
        v_absent_status_id  UUID;
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          v_inst_id := OLD.institution_id;
        ELSE
          v_inst_id := NEW.institution_id;
        END IF;

        v_lookback_days := fn_get_policy_int(
          'hr.attendance.holiday_handling.backfill_lookback_days', 90, v_inst_id
        );
        v_cutoff := CURRENT_DATE - (v_lookback_days || ' days')::INTERVAL;

        IF (TG_OP = 'DELETE') THEN
          v_start := GREATEST(OLD.start_date, v_cutoff);
          v_end   := OLD.end_date;
        ELSE
          v_start := GREATEST(NEW.start_date, v_cutoff);
          v_end   := NEW.end_date;
        END IF;

        IF v_inst_id IS NULL OR v_start IS NULL OR v_end IS NULL OR v_start > v_end THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        SELECT id INTO v_holiday_status_id
          FROM hr_attendance_status_types
          WHERE code = 'HOLIDAY' AND institution_id IS NULL
          LIMIT 1;

        SELECT id INTO v_absent_status_id
          FROM hr_attendance_status_types
          WHERE code = 'ABSENT' AND institution_id IS NULL
          LIMIT 1;

        RETURN COALESCE(NEW, OLD);
      END;
      $body$;
    $func$;
  END IF;
END;
$migrate$;

-- ============================================================
-- 3. Promote scope_type 'global' → 'institution' per Director Q3-R2
--
--    Every HR config is per-institution. The 'global' default still
--    works via fn_get_policy_* fallback (scope_id NULL is the global
--    default that institution rows inherit when no override exists).
--    We change the scope_type label but keep scope_id NULL.
-- ============================================================

-- NOTE: 'global' rows with scope_id NULL act as universal defaults.
--       Per Director lock, switch labelling to 'institution' so the
--       admin UI groups them with the per-institution overrides.
--       scope_id remains NULL → still inherits as the default fallback.
--
-- Defensive guard: only update if the check constraint on
-- platform_policies.scope_type permits 'institution'.

DO $promote$
DECLARE
  v_constraint_allows BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = cc.constraint_name
    WHERE ccu.table_name = 'platform_policies'
      AND ccu.column_name = 'scope_type'
      AND cc.check_clause ILIKE '%institution%'
  ) INTO v_constraint_allows;

  IF v_constraint_allows THEN
    UPDATE platform_policies
      SET scope_type = 'institution'
      WHERE policy_key IN (
        'hr.attendance.holiday_handling.backfill_lookback_days',
        'hr.attendance.audit.retention_years',
        'hr.attendance.geofence.mode',
        'hr.attendance.geofence.radius_m',
        'hr.attendance.auto_approve.threshold_minutes',
        'hr.attendance.self_heal.step2_channels',
        'hr.attendance.self_heal.window_hours',
        'hr.attendance.class_proxy.day_calc_default',
        'hr.attendance.class_proxy.cross_college_enabled',
        'hr.attendance.team_view.privacy_mode',
        'hr.attendance.monthly_letter.mode',
        'hr.attendance.late_arrival.action',
        'hr.attendance.biometric.priority_over_self_mark',
        'hr.attendance.pattern_detection.multi_day'
      )
      AND scope_id IS NULL
      AND scope_type = 'global';
  END IF;
END;
$promote$;

-- ============================================================
-- 4. Audit trail — write one row per rename if hr_policy_audit_log exists
--    (table comes from sister migration W3-M0; defensive guard below)
-- ============================================================

DO $audit$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'hr_policy_audit_log'
  ) THEN
    INSERT INTO hr_policy_audit_log (
      policy_id, policy_key, scope_type, scope_id,
      action, old_value, new_value, reason, edited_by
    )
    SELECT
      pp.id, pp.policy_key, pp.scope_type, pp.scope_id,
      'promote_to_global',
      to_jsonb(rename_map.old_key),
      to_jsonb(rename_map.new_key),
      'Wave 3 M7 absorption — Sprint 5 HR_ATT_* keys reorganised into '
        || 'hr.attendance.<subcategory>.<leaf> nested namespace per '
        || 'Director-locked spec hr-policy-jsonb-structures-2026-05-15.md',
      (SELECT id FROM profiles ORDER BY created_at LIMIT 1)
    FROM (VALUES
      ('hr.attendance.holiday_backfill_lookback_days',  'hr.attendance.holiday_handling.backfill_lookback_days'),
      ('hr.attendance.audit_retention_years',           'hr.attendance.audit.retention_years'),
      ('hr.attendance.geofence_mode',                   'hr.attendance.geofence.mode'),
      ('hr.attendance.geofence_radius_m',               'hr.attendance.geofence.radius_m'),
      ('hr.attendance.auto_approve_threshold_minutes',  'hr.attendance.auto_approve.threshold_minutes'),
      ('hr.attendance.self_heal_step2_channels',        'hr.attendance.self_heal.step2_channels'),
      ('hr.attendance.self_heal_window_hours',          'hr.attendance.self_heal.window_hours'),
      ('hr.attendance.class_proxy_day_calc_default',    'hr.attendance.class_proxy.day_calc_default'),
      ('hr.attendance.cross_college_proxy_enabled',     'hr.attendance.class_proxy.cross_college_enabled'),
      ('hr.attendance.team_view_privacy_mode',          'hr.attendance.team_view.privacy_mode'),
      ('hr.attendance.monthly_letter_mode',             'hr.attendance.monthly_letter.mode'),
      ('hr.attendance.late_arrival_action',             'hr.attendance.late_arrival.action'),
      ('hr.attendance.biometric_priority_over_self_mark', 'hr.attendance.biometric.priority_over_self_mark'),
      ('hr.attendance.multi_day_pattern_detection',     'hr.attendance.pattern_detection.multi_day')
    ) AS rename_map(old_key, new_key)
    JOIN platform_policies pp ON pp.policy_key = rename_map.new_key;
  END IF;
END;
$audit$;

-- ============================================================
-- 5. Smoke test — verify all 14 new keys resolve
-- ============================================================

DO $smoke$
DECLARE
  v_found INT;
BEGIN
  SELECT COUNT(*) INTO v_found
  FROM platform_policies
  WHERE policy_key IN (
    'hr.attendance.holiday_handling.backfill_lookback_days',
    'hr.attendance.audit.retention_years',
    'hr.attendance.geofence.mode',
    'hr.attendance.geofence.radius_m',
    'hr.attendance.auto_approve.threshold_minutes',
    'hr.attendance.self_heal.step2_channels',
    'hr.attendance.self_heal.window_hours',
    'hr.attendance.class_proxy.day_calc_default',
    'hr.attendance.class_proxy.cross_college_enabled',
    'hr.attendance.team_view.privacy_mode',
    'hr.attendance.monthly_letter.mode',
    'hr.attendance.late_arrival.action',
    'hr.attendance.biometric.priority_over_self_mark',
    'hr.attendance.pattern_detection.multi_day'
  );

  IF v_found <> 14 THEN
    RAISE EXCEPTION 'W3-M7 smoke test failed: expected 14 renamed hr.attendance.* rows, found %', v_found;
  END IF;

  RAISE NOTICE 'W3-M7 smoke test passed: all 14 Sprint 5 keys absorbed into hr.attendance.* namespace';
END;
$smoke$;

COMMIT;
