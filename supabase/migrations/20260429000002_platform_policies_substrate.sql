-- ============================================================================
-- Migration: 20260429000002_platform_policies_substrate
-- Phase 1.5a — Canonical runtime-config substrate
-- ============================================================================
-- Replaces 20+ module-specific config tables with ONE canonical table.
-- Retires 2 hardcoded values from PR #590 (holiday_backfill_lookback,
-- audit_retention_years fallback) by reading them via fn_get_policy_int.
-- Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: platform_policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global','institution','role','user')),
  scope_id UUID,
  value JSONB NOT NULL,
  description TEXT,
  data_type TEXT NOT NULL CHECK (data_type IN ('number','string','boolean','array','object','enum')),
  enum_options JSONB,
  validation_schema JSONB,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

-- Unique per (policy_key, scope_type, scope_id). NULL scope_id collapsed to sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_policies_key_scope
  ON platform_policies (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_platform_policies_active
  ON platform_policies (policy_key, is_active);

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE platform_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_policies_select ON platform_policies;
CREATE POLICY platform_policies_select ON platform_policies
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS platform_policies_insert ON platform_policies;
CREATE POLICY platform_policies_insert ON platform_policies
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS platform_policies_update ON platform_policies;
CREATE POLICY platform_policies_update ON platform_policies
  FOR UPDATE USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS platform_policies_delete ON platform_policies;
CREATE POLICY platform_policies_delete ON platform_policies
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 3. Resolver function: fn_get_policy
-- Resolution priority: user-override > institution-override > role-override > global default
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_policy(p_key TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT value FROM platform_policies
  WHERE policy_key = p_key AND is_active = true
    AND (
      (scope_type='institution' AND scope_id=p_scope_id)
      OR (scope_type='global' AND scope_id IS NULL)
      OR (scope_type='role' AND scope_id IN (
            SELECT cr.id FROM custom_roles cr WHERE EXISTS (
              SELECT 1 FROM user_roles ur JOIN profiles p ON p.id=ur.user_id
              WHERE ur.role_id=cr.id AND p.id=auth.uid()
            )
          ))
      OR (scope_type='user' AND scope_id=auth.uid())
    )
  ORDER BY
    CASE scope_type
      WHEN 'user' THEN 1
      WHEN 'institution' THEN 2
      WHEN 'role' THEN 3
      WHEN 'global' THEN 4
    END
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- 4. Type-safe getter sugar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_policy_int(p_key TEXT, p_default INT, p_scope_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::int, p_default);
$$;

CREATE OR REPLACE FUNCTION fn_get_policy_text(p_key TEXT, p_default TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))#>>'{}', p_default);
$$;

CREATE OR REPLACE FUNCTION fn_get_policy_bool(p_key TEXT, p_default BOOLEAN, p_scope_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::boolean, p_default);
$$;

-- ----------------------------------------------------------------------------
-- 5. Seed 14 HR Sprint 5 policies (Section 17a Round 1-4 decisions)
--    + 2 cross-cutting policies (super_admin digest, hr daily brief)
--    All as is_system=true GLOBAL rows. Idempotent via ON CONFLICT.
-- ----------------------------------------------------------------------------
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system) VALUES
('hr.attendance.holiday_backfill_lookback_days', 'global', NULL, '90'::jsonb,
  'Days to look back when retroactively flipping ABSENT->HOLIDAY on institution_leaves change',
  'number', NULL, true),
('hr.attendance.audit_retention_years', 'global', NULL, '7'::jsonb,
  'Years to retain hr_attendance_audit_log rows. Per-institution override allowed.',
  'number', NULL, true),
('hr.attendance.geofence_mode', 'global', NULL, '"audit_only"'::jsonb,
  'Geofencing enforcement: enforce | audit_only | off',
  'enum', '["enforce","audit_only","off"]'::jsonb, true),
('hr.attendance.geofence_radius_m', 'global', NULL, '200'::jsonb,
  'Default geofence radius in meters. Per-institution override allowed.',
  'number', NULL, true),
('hr.attendance.auto_approve_threshold_minutes', 'global', NULL, '0'::jsonb,
  'Minutes within work_schedule to auto-approve regularization. 0 = always-review (Q2.4 default).',
  'number', NULL, true),
('hr.attendance.self_heal_step2_channels', 'global', NULL, '["in_app"]'::jsonb,
  'Channels for self-heal step 2 (was WhatsApp in v4 spec; rejected per Q2.3). Array of: in_app, email, sms, push.',
  'array', NULL, true),
('hr.attendance.self_heal_window_hours', 'global', NULL, '24'::jsonb,
  'Hours to wait for self-heal step 2 reply before falling through to step 3.',
  'number', NULL, true),
('hr.attendance.class_proxy_day_calc_default', 'global', NULL, '"HALF_DAY"'::jsonb,
  'When class-proxy fires (faculty taught a class but no biometric), what day_calc to mark.',
  'enum', '["FULL_DAY","HALF_DAY"]'::jsonb, true),
('hr.attendance.cross_college_proxy_enabled', 'global', NULL, 'true'::jsonb,
  'Class-proxy crosses college boundaries — if you taught at any college, you''re PRESENT.',
  'boolean', NULL, true),
('hr.attendance.team_view_privacy_mode', 'global', NULL, '"full"'::jsonb,
  'HOD team view: full (status+times+reason) | status_only | redact_private',
  'enum', '["full","status_only","redact_private"]'::jsonb, true),
('hr.attendance.monthly_letter_mode', 'global', NULL, '"on_demand"'::jsonb,
  'Monthly summary letter: on_demand | auto_email | auto_store',
  'enum', '["on_demand","auto_email","auto_store"]'::jsonb, true),
('hr.attendance.late_arrival_action', 'global', NULL, '"track_only"'::jsonb,
  'When staff arrives past schedule + grace_period: track_only | mark_late | mark_half_day',
  'enum', '["track_only","mark_late","mark_half_day"]'::jsonb, true),
('hr.attendance.biometric_priority_over_self_mark', 'global', NULL, 'true'::jsonb,
  'When biometric record exists, reject self-mark (Q2.2).',
  'boolean', NULL, true),
('hr.attendance.multi_day_pattern_detection', 'global', NULL, 'false'::jsonb,
  'Detect 3+ consecutive ABSENT and group as single exception (Q4.2 = false in v1).',
  'boolean', NULL, true),
('super_admin.digest.fanout_role_keys', 'global', NULL,
  '["ceo","cao","cbo","executive_admin_officer","registrar","hr_admin","system_admin","counselor","admission_staff","accountant_assistant"]'::jsonb,
  'Roles included in fn_generate_super_admin_daily_digest fanout. Currently hardcoded; will read from policy after migration of the function.',
  'array', NULL, true),
('hr.dashboard.daily_brief.fanout_via_permission_key', 'global', NULL, '"hr.dashboard.view"'::jsonb,
  'Permission key used to determine who gets the HR daily brief (PR #580). Already permission-gated; this just documents the intent.',
  'string', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Retire hardcoded values from PR #590 trigger functions
-- ----------------------------------------------------------------------------

-- 6a. fn_recompute_attendance_on_holiday_change — read 90d window from policy
CREATE OR REPLACE FUNCTION fn_recompute_attendance_on_holiday_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_holiday_status_id UUID;
  v_absent_status_id UUID;
  v_inst_id UUID;
  v_start DATE;
  v_end DATE;
  v_event_id UUID := gen_random_uuid();
  v_lookback_days INT;
  v_cutoff DATE;
BEGIN
  -- Resolve target institution + date range from the trigger row
  IF (TG_OP = 'DELETE') THEN
    v_inst_id := OLD.institution_id;
  ELSE
    v_inst_id := NEW.institution_id;
  END IF;

  -- Read lookback window from platform_policies (institution override > global default 90)
  v_lookback_days := fn_get_policy_int(
    'hr.attendance.holiday_backfill_lookback_days', 90, v_inst_id
  );
  v_cutoff := CURRENT_DATE - (v_lookback_days || ' days')::INTERVAL;

  IF (TG_OP = 'DELETE') THEN
    v_start   := GREATEST(OLD.start_date, v_cutoff);
    v_end     := OLD.end_date;
  ELSE
    v_start   := GREATEST(NEW.start_date, v_cutoff);
    v_end     := NEW.end_date;
  END IF;

  IF v_inst_id IS NULL OR v_start IS NULL OR v_end IS NULL OR v_start > v_end THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Look up system status type ids (institution_id IS NULL = system rows)
  SELECT id INTO v_holiday_status_id
    FROM hr_attendance_status_types
    WHERE code = 'HOLIDAY' AND institution_id IS NULL
    LIMIT 1;

  SELECT id INTO v_absent_status_id
    FROM hr_attendance_status_types
    WHERE code = 'ABSENT' AND institution_id IS NULL
    LIMIT 1;

  IF v_holiday_status_id IS NULL OR v_absent_status_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Audit BEFORE state for affected rows, then flip ABSENT -> HOLIDAY
  INSERT INTO hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT
    r.id, r.employee_id, r.institution_id, NULL, 'recompute',
    jsonb_build_object('status_type_id', r.status_type_id, 'status_code', 'ABSENT'),
    jsonb_build_object('status_type_id', v_holiday_status_id, 'status_code', 'HOLIDAY', 'event_id', v_event_id),
    'Holiday added/changed in institution_leaves; ABSENT -> HOLIDAY (lookback ' || v_lookback_days || 'd)',
    NOW()
  FROM hr_attendance_records r
  WHERE r.institution_id = v_inst_id
    AND r.work_date BETWEEN v_start AND v_end
    AND r.status_type_id = v_absent_status_id;

  UPDATE hr_attendance_records r
    SET status_type_id = v_holiday_status_id,
        recomputed_from_event_id = v_event_id,
        updated_at = NOW()
  WHERE r.institution_id = v_inst_id
    AND r.work_date BETWEEN v_start AND v_end
    AND r.status_type_id = v_absent_status_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 6b. fn_purge_attendance_audit_log — fall back to platform_policies
--     when hr_organizations.audit_retention_years is NULL.
--     Per-org column still wins when set (preserves PR #590 behavior).
CREATE OR REPLACE FUNCTION fn_purge_attendance_audit_log()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total INT := 0;
  v_org RECORD;
  v_deleted INT;
  v_years INT;
  v_policy_default INT;
BEGIN
  v_policy_default := fn_get_policy_int('hr.attendance.audit_retention_years', 7, NULL);

  FOR v_org IN
    SELECT institution_id, MIN(audit_retention_years) AS years
    FROM hr_organizations
    WHERE institution_id IS NOT NULL
    GROUP BY institution_id
  LOOP
    -- Per-institution policy override > org column > global policy default > 7
    v_years := COALESCE(
      fn_get_policy_int('hr.attendance.audit_retention_years', NULL, v_org.institution_id),
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
