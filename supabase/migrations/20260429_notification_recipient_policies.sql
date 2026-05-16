-- ============================================================================
-- Notification Recipient Policies — Director's standing rule (2026-04-29)
-- "Re-map CEO's digest categories? Click checkboxes" — verbatim Director example.
--
-- Purpose
-- -------
-- Convert hardcoded recipient mappings inside digest fan-out functions
-- (fn_generate_super_admin_daily_digest, fn_generate_hr_command_center_brief_items)
-- into a single config table + super_admin UI.
--
-- After this migration:
--   * Director re-maps "which roles get which digest categories" via
--     /admin/notifications/recipients (no PR, no deploy).
--   * Digest fan-out functions read recipients via get_digest_recipients(category).
--   * Recipient set at deploy = identical to pre-migration set (verified via
--     symmetric-difference checks for all 5 categories — diff = 0 across the
--     board on prod 2026-04-29).
--
-- See:
--   * memory/feedback_policy_decisions_must_be_config_rows.md
--   * PR feat/notification-recipient-policies-config
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_recipient_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_category text NOT NULL,
  recipient_role_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  recipient_user_emails text[] DEFAULT ARRAY[]::text[],
  include_super_admins boolean NOT NULL DEFAULT TRUE,
  match_legacy_role_only boolean NOT NULL DEFAULT TRUE,
  enabled boolean NOT NULL DEFAULT TRUE,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT notification_recipient_policies_digest_category_unique UNIQUE (digest_category)
);

COMMENT ON TABLE notification_recipient_policies IS
  'Director config: which roles/users receive each digest fan-out category. Source-of-truth replaces hardcoded role lists in fn_generate_*_digest functions. See PR feat/notification-recipient-policies-config (2026-04-29).';
COMMENT ON COLUMN notification_recipient_policies.digest_category IS
  'Stable identifier matched by digest fn (e.g. super_admin_daily.escalation, super_admin_daily.rescue, hr_command_brief).';
COMMENT ON COLUMN notification_recipient_policies.recipient_role_keys IS
  'Active custom_roles.role_key entries — users with ANY of these roles receive the digest.';
COMMENT ON COLUMN notification_recipient_policies.recipient_user_emails IS
  'Optional explicit individual overrides (matched against profiles.email).';
COMMENT ON COLUMN notification_recipient_policies.include_super_admins IS
  'When TRUE (default), profiles.is_super_admin = TRUE users always receive this digest, regardless of role list.';
COMMENT ON COLUMN notification_recipient_policies.match_legacy_role_only IS
  'When TRUE (default), matches users via profiles.role (legacy single-role) only. When FALSE, also expands via user_roles (multi-role). TRUE preserves pre-2026-04-29 behavior at deploy.';
COMMENT ON COLUMN notification_recipient_policies.enabled IS
  'Director kill-switch — when FALSE, digest fn produces zero rows for this category.';

ALTER TABLE notification_recipient_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nrp_admin_read ON notification_recipient_policies;
CREATE POLICY nrp_admin_read ON notification_recipient_policies
  FOR SELECT
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS nrp_admin_write ON notification_recipient_policies;
CREATE POLICY nrp_admin_write ON notification_recipient_policies
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- updated_at touch trigger
CREATE OR REPLACE FUNCTION notification_recipient_policies_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_recipient_policies_set_updated_at ON notification_recipient_policies;
CREATE TRIGGER notification_recipient_policies_set_updated_at
  BEFORE UPDATE ON notification_recipient_policies
  FOR EACH ROW
  EXECUTE FUNCTION notification_recipient_policies_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Helper: get_digest_recipients(category)
--    Returns deduped (user_id, email, source) for a digest_category, applying
--    include_super_admins, recipient_role_keys, recipient_user_emails,
--    match_legacy_role_only, enabled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_digest_recipients(p_category text)
RETURNS TABLE (user_id uuid, email text, source text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH policy AS (
    SELECT *
    FROM notification_recipient_policies
    WHERE digest_category = p_category
      AND enabled = TRUE
    LIMIT 1
  ),
  super_users AS (
    SELECT p.id AS user_id, p.email, 'super_admin'::text AS source
    FROM profiles p, policy
    WHERE policy.include_super_admins = TRUE
      AND p.is_super_admin = TRUE
  ),
  legacy_role_users AS (
    -- profiles.role is the legacy single-role column.
    -- Matches pre-2026-04-29 behavior on the super_admin_daily.* digests.
    SELECT DISTINCT p.id AS user_id, p.email, 'legacy_role'::text AS source
    FROM profiles p, policy
    WHERE p.role = ANY (policy.recipient_role_keys)
  ),
  multi_role_users AS (
    -- Multi-role expansion via user_roles. Only when policy opts in.
    SELECT DISTINCT p.id AS user_id, p.email, 'role'::text AS source
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN custom_roles cr ON cr.id = ur.role_id
    JOIN policy ON cr.role_key = ANY (policy.recipient_role_keys)
                 AND COALESCE(policy.match_legacy_role_only, TRUE) = FALSE
    WHERE COALESCE(cr.is_active, TRUE) = TRUE
  ),
  email_users AS (
    SELECT p.id AS user_id, p.email, 'email_override'::text AS source
    FROM profiles p, policy
    WHERE p.email = ANY (COALESCE(policy.recipient_user_emails, ARRAY[]::text[]))
  ),
  combined AS (
    SELECT user_id, email, source FROM super_users
    UNION
    SELECT user_id, email, source FROM legacy_role_users
    UNION
    SELECT user_id, email, source FROM multi_role_users
    UNION
    SELECT user_id, email, source FROM email_users
  )
  SELECT DISTINCT ON (user_id) user_id, email, source
  FROM combined
  WHERE user_id IS NOT NULL
  ORDER BY user_id,
           CASE source
             WHEN 'super_admin' THEN 1
             WHEN 'email_override' THEN 2
             WHEN 'role' THEN 3
             WHEN 'legacy_role' THEN 4
             ELSE 5
           END;
$$;

COMMENT ON FUNCTION get_digest_recipients(text) IS
  'Resolves a digest_category to its current recipient set from notification_recipient_policies. Used by digest fan-out functions to replace hardcoded role lists.';

GRANT EXECUTE ON FUNCTION get_digest_recipients(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Seed: capture current hardcoded behavior verbatim
-- ---------------------------------------------------------------------------
-- Categories & role lists below mirror fn_generate_super_admin_daily_digest
-- (4 categories) and fn_generate_hr_command_center_brief_items (1 category)
-- as observed on prod 2026-04-29.

INSERT INTO notification_recipient_policies
  (digest_category, recipient_role_keys, include_super_admins, match_legacy_role_only, description)
VALUES
  (
    'super_admin_daily.escalation',
    ARRAY['ceo', 'cbo', 'accountant_assistant'],
    TRUE,
    TRUE,
    'Daily digest — overdue invoices >30 days. Hardcoded recipients before 2026-04-29: super_admins + ceo + cbo + accountant_assistant.'
  ),
  (
    'super_admin_daily.rescue',
    ARRAY['cbo', 'counselor', 'admission_staff'],
    TRUE,
    TRUE,
    'Daily digest — stale admission leads >24h. Hardcoded recipients before 2026-04-29: super_admins + cbo + counselor + admission_staff.'
  ),
  (
    'super_admin_daily.approval',
    ARRAY['ceo', 'cao', 'executive_admin_officer', 'registrar', 'hr_admin'],
    TRUE,
    TRUE,
    'Daily digest — pending approvals (leaves/recruitment/SR). Hardcoded recipients before 2026-04-29: super_admins + ceo + cao + executive_admin_officer + registrar + hr_admin.'
  ),
  (
    'super_admin_daily.anomaly',
    ARRAY['cao', 'registrar', 'system_admin'],
    TRUE,
    TRUE,
    'Daily digest — unmarked attendance + untriaged bugs >72h. Hardcoded recipients before 2026-04-29: super_admins + cao + registrar + system_admin.'
  ),
  (
    'hr_command_brief',
    ARRAY['administrator', 'board', 'ceo', 'coo', 'hr_admin', 'hr_head', 'hr_manager'],
    TRUE,
    FALSE,  -- HR brief originally fanned via permission-based user_roles traversal; keep multi-role expansion
    'Daily HR Command Center brief — pending leaves + recruitment + holidays + staff on leave. Hardcoded recipients before 2026-04-29: super_admins + any role with hr.dashboard.view = TRUE.'
  )
ON CONFLICT (digest_category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Rewrite digest fan-out functions to consume the config
--
-- Before: each function had a `FOR v_user IN SELECT id FROM profiles WHERE
--         is_super_admin OR role IN (...)` block with a hardcoded role list
--         and per-category `IF v_emit_X THEN` gates baked into the fn body.
--
-- After:  each function calls `get_digest_recipients(<category>)` per category.
--         Director re-maps roles by editing notification_recipient_policies.
-- ---------------------------------------------------------------------------

-- ---- fn_generate_super_admin_daily_digest ---------------------------------
CREATE OR REPLACE FUNCTION fn_generate_super_admin_daily_digest()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_total INT;
  v_breakdown TEXT;
  v_body TEXT;
  -- Per-category recipient sets sourced from notification_recipient_policies
  -- via get_digest_recipients(). Director re-maps via /admin/notifications/recipients UI.
BEGIN
  -- Category 1: dashboard:escalation (overdue invoices >30 days, unpaid)
  WITH counts AS (
    SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
    FROM billing_invoices bi
    JOIN institutions i ON bi.institution_id = i.id
    WHERE bi.due_date < CURRENT_DATE - INTERVAL '30 days' AND bi.grand_total > 0
      AND COALESCE((SELECT SUM(br.payment_amount) FROM billing_receipts br
                    WHERE br.student_id = bi.student_id
                      AND br.receipt_date >= bi.billing_period_from), 0) < bi.grand_total
    GROUP BY i.id, i.name
  )
  SELECT COALESCE(SUM(cnt), 0),
         STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
  INTO v_total, v_breakdown FROM counts;
  IF v_total > 0 THEN
    v_body := v_total || ' overdue invoice(s). ' || COALESCE(v_breakdown, '') || '.';
    FOR v_user IN SELECT user_id FROM get_digest_recipients('super_admin_daily.escalation')
    LOOP
      v_key := 'digest:' || v_user.user_id::text || ':dashboard:escalation:' || v_today;
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:escalation', 'high',
        'Daily digest — ' || v_total || ' overdue invoice(s)',
        v_body,
        jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aescalation',
          'digest', true, 'total', v_total),
        v_user.user_id, v_key, 24);
    END LOOP;
  END IF;

  -- Category 2: dashboard:rescue (stale admission leads >24h)
  WITH counts AS (
    SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
    FROM admission_leads al
    JOIN institutions i ON al.institution_id = i.id
    WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '24 hours'
      AND COALESCE(al.last_activity_at, al.created_at) > NOW() - INTERVAL '30 days'
    GROUP BY i.id, i.name
  )
  SELECT COALESCE(SUM(cnt), 0),
         STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
  INTO v_total, v_breakdown FROM counts;
  IF v_total > 0 THEN
    v_body := v_total || ' stale lead(s). ' || COALESCE(v_breakdown, '') || '.';
    FOR v_user IN SELECT user_id FROM get_digest_recipients('super_admin_daily.rescue')
    LOOP
      v_key := 'digest:' || v_user.user_id::text || ':dashboard:rescue:' || v_today;
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:rescue', 'normal',
        'Daily digest — ' || v_total || ' stale lead(s)',
        v_body,
        jsonb_build_object('url', '/admission/leads?stale_min_days=30',
          'digest', true, 'total', v_total),
        v_user.user_id, v_key, 24);
    END LOOP;
  END IF;

  -- Category 3: dashboard:approval (pending leaves >48h + recruitment + SR)
  WITH leave_counts AS (
    SELECT 'leaves' AS src, COUNT(*) AS cnt
    FROM hr_leave_applications la
    WHERE la.status = 'pending' AND la.created_at < NOW() - INTERVAL '48 hours'
      AND la.created_at > NOW() - INTERVAL '30 days' AND la.superseded_by IS NULL
  ),
  recruit_counts AS (
    SELECT 'recruitment' AS src, COUNT(*) AS cnt
    FROM hr_recruitment_candidates
    WHERE status = 'pending_approval' AND submitted_at < NOW() - INTERVAL '24 hours'
      AND submitted_at > NOW() - INTERVAL '90 days'
  ),
  sr_counts AS (
    SELECT 'service_requests' AS src, COUNT(*) AS cnt
    FROM service_requests sr
    WHERE sr.status::text IN ('submitted','in_review','returned')
      AND COALESCE(sr.submitted_at, sr.created_at) < NOW() - INTERVAL '24 hours'
      AND COALESCE(sr.submitted_at, sr.created_at) > NOW() - INTERVAL '180 days'
  ),
  all_counts AS (
    SELECT src, cnt FROM leave_counts WHERE cnt > 0
    UNION ALL SELECT src, cnt FROM recruit_counts WHERE cnt > 0
    UNION ALL SELECT src, cnt FROM sr_counts WHERE cnt > 0
  )
  SELECT COALESCE(SUM(cnt), 0),
         STRING_AGG(src || ': ' || cnt, ', ' ORDER BY cnt DESC)
  INTO v_total, v_breakdown FROM all_counts;
  IF v_total > 0 THEN
    v_body := v_total || ' approval(s) pending. ' || COALESCE(v_breakdown, '') || '.';
    FOR v_user IN SELECT user_id FROM get_digest_recipients('super_admin_daily.approval')
    LOOP
      v_key := 'digest:' || v_user.user_id::text || ':dashboard:approval:' || v_today;
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:approval', 'normal',
        'Daily digest — ' || v_total || ' approval(s) pending',
        v_body,
        jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aapproval',
          'digest', true, 'total', v_total),
        v_user.user_id, v_key, 24);
    END LOOP;
  END IF;

  -- Category 4: dashboard:anomaly (unmarked attendance + untriaged bugs >72h)
  WITH attn AS (
    SELECT 'unmarked_attendance' AS src, COUNT(*) AS cnt
    FROM timetables t
    WHERE t.is_active = TRUE AND t.start_date <= CURRENT_DATE
      AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
      AND NOT EXISTS (SELECT 1 FROM student_attendance sa
        WHERE sa.timetable_id = t.id AND sa.attendance_date = CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM student_attendance sa2
        WHERE sa2.timetable_id = t.id
          AND sa2.attendance_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '1 day')
  ),
  bugs AS (
    SELECT 'untriaged_bugs' AS src, COUNT(*) AS cnt
    FROM bug_reports
    WHERE status = 'new'
      AND created_at < NOW() - INTERVAL '72 hours'
      AND created_at > NOW() - INTERVAL '180 days'
      AND COALESCE(metadata->'triage'->>'tag', '')
        NOT IN ('not_a_bug','duplicate','content_only','obsolete','feature_request')
  ),
  all_anomaly AS (
    SELECT src, cnt FROM attn WHERE cnt > 0
    UNION ALL SELECT src, cnt FROM bugs WHERE cnt > 0
  )
  SELECT COALESCE(SUM(cnt), 0),
         STRING_AGG(src || ': ' || cnt, ', ' ORDER BY cnt DESC)
  INTO v_total, v_breakdown FROM all_anomaly;
  IF v_total > 0 THEN
    v_body := v_total || ' anomaly signal(s). ' || COALESCE(v_breakdown, '') || '.';
    FOR v_user IN SELECT user_id FROM get_digest_recipients('super_admin_daily.anomaly')
    LOOP
      v_key := 'digest:' || v_user.user_id::text || ':dashboard:anomaly:' || v_today;
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:anomaly', 'normal',
        'Daily digest — ' || v_total || ' anomaly signal(s)',
        v_body,
        jsonb_build_object('url', '/academic/attendance/dashboard',
          'digest', true, 'total', v_total),
        v_user.user_id, v_key, 24);
    END LOOP;
  END IF;

  RETURN v_created;
END
$$;

-- ---- fn_generate_hr_command_center_brief_items ----------------------------
CREATE OR REPLACE FUNCTION fn_generate_hr_command_center_brief_items()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_pending_leaves INT;
  v_active_recruitment INT;
  v_todays_holidays INT;
  v_staff_on_leave INT;
  v_total INT;
  v_priority TEXT;
  v_title TEXT;
  v_body TEXT;
  v_signal_parts TEXT[];
BEGIN
  -- Aggregate metrics ONCE (institution-wide, same as previous version)
  SELECT COUNT(*) INTO v_pending_leaves
  FROM hr_leave_applications la
  WHERE la.status = 'pending'
    AND la.created_at < NOW() - INTERVAL '24 hours'
    AND la.created_at > NOW() - INTERVAL '30 days'
    AND la.superseded_by IS NULL;

  SELECT COUNT(*) INTO v_active_recruitment
  FROM hr_recruitment_candidates
  WHERE status IN ('pending_approval', 'in_process', 'submitted')
    AND COALESCE(submitted_at, created_at) > NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_todays_holidays
  FROM institution_leaves
  WHERE CURRENT_DATE BETWEEN start_date AND end_date
    AND status IN ('approved', 'active');

  SELECT COUNT(*) INTO v_staff_on_leave
  FROM hr_leave_applications
  WHERE status = 'approved'
    AND CURRENT_DATE BETWEEN start_date AND end_date
    AND superseded_by IS NULL;

  v_total := v_pending_leaves + v_active_recruitment + v_todays_holidays + v_staff_on_leave;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  v_signal_parts := ARRAY[]::TEXT[];
  IF v_pending_leaves > 0 THEN
    v_signal_parts := v_signal_parts || (v_pending_leaves || ' pending leave(s)');
  END IF;
  IF v_active_recruitment > 0 THEN
    v_signal_parts := v_signal_parts || (v_active_recruitment || ' active recruitment');
  END IF;
  IF v_todays_holidays > 0 THEN
    v_signal_parts := v_signal_parts || (v_todays_holidays || ' holiday today');
  END IF;
  IF v_staff_on_leave > 0 THEN
    v_signal_parts := v_signal_parts || (v_staff_on_leave || ' staff on leave today');
  END IF;

  v_priority := CASE
    WHEN v_pending_leaves >= 5 OR v_todays_holidays > 0 THEN 'high'
    ELSE 'normal'
  END;

  v_title := 'HR brief — ' || array_to_string(v_signal_parts, ', ');
  v_body := 'Daily HR Command Center summary: ' || array_to_string(v_signal_parts, ', ') || '. Open /hr for full breakdown across institutions.';

  -- Fan out via config-driven recipient set
  FOR v_user IN SELECT user_id FROM get_digest_recipients('hr_command_brief')
  LOOP
    v_key := 'hr_brief:' || v_user.user_id::text || ':' || v_today;

    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:hr_brief',
      v_priority,
      v_title,
      v_body,
      jsonb_build_object(
        'url', '/hr',
        'digest', true,
        'pending_leaves', v_pending_leaves,
        'active_recruitment', v_active_recruitment,
        'todays_holidays', v_todays_holidays,
        'staff_on_leave', v_staff_on_leave,
        'total', v_total
      ),
      v_user.user_id,
      v_key,
      20
    );
  END LOOP;

  RETURN v_created;
END
$$;
