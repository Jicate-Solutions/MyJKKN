-- ============================================================================
-- Migration: 20260507_ai_pulse_director_digest_extension.sql
-- Wave: AI Pulse A.3 — Director Tuesday digest extension
-- PR: feat/ai-pulse-director-digest  (DRAFT — gated on PR #644 Wave A.1)
--
-- What this does:
--   Replaces fn_generate_super_admin_daily_digest() with an extended version
--   that adds a 5th digest category: dashboard:ai_pulse.
--
--   The 4 original categories are PRESERVED byte-for-byte:
--     1. dashboard:escalation  — overdue invoices >30 days
--     2. dashboard:rescue      — stale admission leads >24h
--     3. dashboard:approval    — pending leaves + recruitment + SRs
--     4. dashboard:anomaly     — unmarked attendance + untriaged bugs >72h
--
--   Added:
--     5. dashboard:ai_pulse    — AI Pulse weekly cycle summary for super_admin
--        • Last completed cycle: enrolled teams, engaged teams, engagement %
--        • Departments with red-flag escalation (domain-sync miss rate > threshold)
--        • Unreviewed anomaly flags count (last 7 days)
--        • Gold standard proxy count (event_submissions with proof_urls populated)
--
-- Graceful degradation:
--   If AI Pulse tables from PR #644 (ai_pulse_policies, ai_pulse_anomaly_flags)
--   do NOT yet exist, the section returns a single "No AI Pulse data yet" item
--   and does NOT error. Implemented via IF EXISTS checks before each query.
--
-- Permission gate:
--   AI Pulse digest item fires only for is_super_admin=TRUE users.
--   Oversight roles (ceo, cao, etc.) receive the original 4 categories as
--   before; they do NOT receive the AI Pulse section until role gating is
--   expanded post-Wave B.
--
-- Deviations from task brief:
--   • The brief suggested a jsonb_build_object() payload — but
--     fn_create_dashboard_work_item() is the canonical emission path in this
--     function. A single structured dashboard:ai_pulse item is emitted instead
--     of 4 separate items, to avoid flooding the work-item queue for an
--     early-stage feature.
--   • "config.kind='ai_pulse'" in brief vs "event_type='ai_pulse'" in spec §4.3:
--     both predicates are OR'd together so the query works regardless of which
--     PR #644 approach wins (kind in config JSONB vs event_type column).
--   • escalation_t2_percent default comes from ai_pulse_policies if table
--     exists, otherwise falls back to 100 (i.e., only flag depts where 100%
--     of teams missed — conservative default until policy table is live).
--
-- Pattern references:
--   • Original function: supabase/setup/02_functions.sql lines 10711–10892
--   • Original migration: (see git log — PR #394)
--   • HR digest pattern: supabase/migrations/20260428_hr_command_center_brief_digest.sql
-- ============================================================================

-- DROP the existing function before CREATE (identical signature — no overload)
DROP FUNCTION IF EXISTS fn_generate_super_admin_daily_digest();

CREATE OR REPLACE FUNCTION fn_generate_super_admin_daily_digest()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_digest$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_total INT;
  v_breakdown TEXT;
  v_body TEXT;
  v_emit_escalation BOOLEAN;
  v_emit_rescue BOOLEAN;
  v_emit_approval BOOLEAN;
  v_emit_anomaly BOOLEAN;

  -- AI Pulse section variables
  v_last_cycle_id       UUID;
  v_enrolled_teams      INT;
  v_engaged_teams       INT;
  v_engagement_pct      NUMERIC(5,1);
  v_anomaly_count       INT;
  v_gold_count          INT;
  v_red_flag_depts      TEXT;
  v_red_flag_count      INT;
  v_quiz_pass_threshold INT;
  v_escalation_t2_pct   NUMERIC(5,1);
  v_ai_pulse_active     BOOLEAN;
  v_ai_pulse_parts      TEXT[];
  v_dept_name           TEXT;
  v_dept_total          INT;
  v_dept_missed         INT;
  v_dept_miss_pct       NUMERIC(5,1);
BEGIN
  -- ── Fan-out roster (unchanged from PR #394) ──────────────────────────────
  FOR v_user IN
    SELECT id, role, is_super_admin
    FROM profiles
    WHERE is_super_admin = TRUE
       OR role IN (
         -- Updated 2026-04-30 (counselor taxonomy phase 3): 'counselor' renamed
         -- to 'admission_counselor'; 'expo_counselor' added with same access.
         'ceo','cao','cbo','executive_admin_officer','registrar',
         'hr_admin','system_admin','admission_counselor','expo_counselor',
         'admission_staff','accountant_assistant'
       )
  LOOP
    -- Per-role category gating. super_admin = full 4+1 categories; oversight roles = original 4 subset.
    v_emit_escalation := v_user.is_super_admin
                      OR v_user.role IN ('ceo','cbo','accountant_assistant');
    v_emit_rescue     := v_user.is_super_admin
                      OR v_user.role IN ('cbo','admission_counselor','expo_counselor','admission_staff');
    v_emit_approval   := v_user.is_super_admin
                      OR v_user.role IN ('ceo','cao','executive_admin_officer','registrar','hr_admin');
    v_emit_anomaly    := v_user.is_super_admin
                      OR v_user.role IN ('cao','registrar','system_admin');

    -- ── Category 1: dashboard:escalation (overdue invoices >30 days, unpaid) ──
    IF v_emit_escalation THEN
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
        v_key := 'digest:' || v_user.id::text || ':dashboard:escalation:' || v_today;
        v_body := v_total || ' overdue invoice(s). ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:escalation', 'high',
          'Daily digest — ' || v_total || ' overdue invoice(s)',
          v_body,
          jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aescalation',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24);
      END IF;
    END IF;

    -- ── Category 2: dashboard:rescue (stale admission leads untouched >24h) ──
    IF v_emit_rescue THEN
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
        v_key := 'digest:' || v_user.id::text || ':dashboard:rescue:' || v_today;
        v_body := v_total || ' stale lead(s). ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:rescue', 'normal',
          'Daily digest — ' || v_total || ' stale lead(s)',
          v_body,
          jsonb_build_object('url', '/admission/leads?stale_min_days=30',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24);
      END IF;
    END IF;

    -- ── Category 3: dashboard:approval (pending leaves >48h + recruitment + SR) ──
    IF v_emit_approval THEN
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
        v_key := 'digest:' || v_user.id::text || ':dashboard:approval:' || v_today;
        v_body := v_total || ' approval(s) pending. ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:approval', 'normal',
          'Daily digest — ' || v_total || ' approval(s) pending',
          v_body,
          jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aapproval',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24);
      END IF;
    END IF;

    -- ── Category 4: dashboard:anomaly (unmarked attendance + untriaged bugs >72h) ──
    IF v_emit_anomaly THEN
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
        v_key := 'digest:' || v_user.id::text || ':dashboard:anomaly:' || v_today;
        v_body := v_total || ' anomaly signal(s). ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:anomaly', 'normal',
          'Daily digest — ' || v_total || ' anomaly signal(s)',
          v_body,
          jsonb_build_object('url', '/academic/attendance/dashboard',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24);
      END IF;
    END IF;

    -- ── Category 5: dashboard:ai_pulse (super_admin only) ────────────────────
    -- Gated to super_admin only. Oversight roles do not receive AI Pulse items
    -- until role-gating is expanded post-Wave B.
    IF v_user.is_super_admin THEN

      -- ── Step 5.0: Check if AI Pulse tables exist (gated on PR #644 Wave A.1).
      -- If ai_pulse_policies does not yet exist, emit a single "not active yet"
      -- item and skip the rest. This prevents the function from erroring before
      -- Wave A.1 merges.
      v_ai_pulse_active := EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_pulse_policies'
      );

      IF NOT v_ai_pulse_active THEN
        -- Emit a single informational item so the Director knows the module is
        -- pending. Only emit once per day per user (idempotency_key).
        v_key := 'digest:' || v_user.id::text || ':dashboard:ai_pulse:pending:' || v_today;
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:ai_pulse', 'low',
          'AI Pulse — module not yet active',
          'AI Pulse Wave A.1 (PR #644) has not merged yet. No cycle data available.',
          jsonb_build_object(
            'url', '/ai-pulse',
            'digest', true,
            'active', false,
            'reason', 'No AI Pulse cycle data yet'
          ),
          v_user.id, v_key, 24);
        CONTINUE; -- skip to next user in loop
      END IF;

      -- ── Step 5.1: Find the most recently completed AI Pulse cycle.
      -- Spec §4.4: AI Pulse cycles are startup_events rows where either
      --   (a) event_type = 'ai_pulse'  (post Wave A.1 ENUM extension), OR
      --   (b) config->>'kind' = 'ai_pulse' (fallback for older rows seeded pre-ENUM).
      -- status='closed' maps to the closest existing terminal state; Wave A.1
      -- may introduce 'completed' — the OR covers both.
      SELECT se.id INTO v_last_cycle_id
      FROM startup_events se
      WHERE (
              se.event_type = 'ai_pulse'
           OR (se.config->>'kind') = 'ai_pulse'
           OR (se.config->'ai_pulse') IS NOT NULL
        )
        AND se.status IN ('closed', 'completed')
      ORDER BY se.end_date DESC NULLS LAST, se.created_at DESC
      LIMIT 1;

      IF v_last_cycle_id IS NULL THEN
        -- No completed cycle found — emit a low-priority "no data yet" item
        -- (distinct key from the "not active" case above).
        v_key := 'digest:' || v_user.id::text || ':dashboard:ai_pulse:no_cycle:' || v_today;
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:ai_pulse', 'low',
          'AI Pulse — no completed cycle yet',
          'AI Pulse module is active but no cycle has reached "completed" status yet.',
          jsonb_build_object(
            'url', '/ai-pulse/admin/cycles',
            'digest', true,
            'active', true,
            'reason', 'No completed AI Pulse cycle found'
          ),
          v_user.id, v_key, 24);
        CONTINUE;
      END IF;

      -- ── Step 5.2: Load policy values with safe fallbacks.
      -- quiz_pass_threshold_live: minimum quiz_score to count as "engaged"
      -- Default = 60 (pass mark) if policy row not seeded yet.
      SELECT COALESCE(
        (SELECT (value->>'value')::int
         FROM ai_pulse_policies
         WHERE policy_key = 'quiz_pass_threshold_live'
           AND is_active = TRUE
         LIMIT 1),
        60
      ) INTO v_quiz_pass_threshold;

      -- escalation_t2_percent: % of teams that must miss domain-sync for a
      -- department to appear in the red-flag list.
      -- Default = 100 (flag only if ALL teams in dept missed).
      SELECT COALESCE(
        (SELECT (value->>'value')::numeric
         FROM ai_pulse_policies
         WHERE policy_key = 'escalation_t2_percent'
           AND is_active = TRUE
         LIMIT 1),
        100
      ) INTO v_escalation_t2_pct;

      -- ── Step 5.3: Enrolled teams count (all event_registrations for cycle).
      SELECT COALESCE(COUNT(*), 0) INTO v_enrolled_teams
      FROM event_registrations er
      WHERE er.event_id = v_last_cycle_id
        AND er.status != 'disqualified';

      -- ── Step 5.4: Engaged teams count.
      -- A team is ENGAGED if:
      --   (a) Their live_session attendance row has
      --       engagement_signals->>'quiz_score' cast to int >= v_quiz_pass_threshold, OR
      --   (b) They have an async_makeup attendance row with
      --       engagement_signals->>'async_passed' = 'true'.
      -- We count distinct registration_ids to avoid double-counting.
      SELECT COALESCE(COUNT(DISTINCT eta.registration_id), 0) INTO v_engaged_teams
      FROM event_team_attendance eta
      WHERE eta.event_id = v_last_cycle_id
        AND (
          (
            eta.day_type = 'live_session'
            AND (eta.engagement_signals->>'quiz_score')::int >= v_quiz_pass_threshold
          )
          OR
          (
            eta.day_type = 'async_makeup'
            AND (eta.engagement_signals->>'async_passed')::boolean IS TRUE
          )
        );

      -- ── Step 5.5: Engagement rate %
      v_engagement_pct := CASE
        WHEN v_enrolled_teams = 0 THEN 0
        ELSE ROUND((v_engaged_teams::numeric / v_enrolled_teams::numeric) * 100, 1)
      END;

      -- ── Step 5.6: Anomaly flag count (unreviewed, last 7 days).
      -- ai_pulse_anomaly_flags guaranteed to exist because v_ai_pulse_active=TRUE
      -- (both tables are created in the same Wave A.1 migration PR #644).
      SELECT COALESCE(COUNT(*), 0) INTO v_anomaly_count
      FROM ai_pulse_anomaly_flags apaf
      WHERE (apaf.review_outcome IS NULL OR apaf.review_outcome = 'pending')
        AND apaf.created_at > NOW() - INTERVAL '7 days';

      -- ── Step 5.7: Gold Standard proxy count.
      -- Full Gold Standard scoring is a future surface (Wave B.5 / external judges).
      -- Proxy: event_submissions for last cycle where proof_urls is populated
      -- (non-null, non-empty array) as an indicator of artifact quality.
      SELECT COALESCE(COUNT(*), 0) INTO v_gold_count
      FROM event_submissions es
      WHERE es.event_id = v_last_cycle_id
        AND es.proof_urls IS NOT NULL
        AND jsonb_array_length(es.proof_urls) > 0;

      -- ── Step 5.8: Red-flag departments (domain-sync miss rate > threshold).
      -- Domain-sync = a team submitted an event_submission for this cycle.
      -- A team "missed" domain-sync if NO submission row exists for their registration.
      -- We group by the institution (proxy for department) because dept-level
      -- grouping requires the dept table join; institution is the available FK.
      -- Wave B can refine to true department granularity.
      v_red_flag_count := 0;
      v_red_flag_depts := NULL;

      SELECT
        COUNT(*) AS dept_count,
        STRING_AGG(
          REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '')
            || ': ' || missed_teams || '/' || total_teams || ' missed',
          '; '
          ORDER BY (missed_teams::numeric / NULLIF(total_teams,0)) DESC
        )
      INTO v_red_flag_count, v_red_flag_depts
      FROM (
        SELECT
          er.institution_id,
          COUNT(*) AS total_teams,
          COUNT(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM event_submissions es
            WHERE es.event_id = v_last_cycle_id
              AND es.registration_id = er.id
          )) AS missed_teams
        FROM event_registrations er
        WHERE er.event_id = v_last_cycle_id
          AND er.status != 'disqualified'
        GROUP BY er.institution_id
        HAVING COUNT(*) > 0
      ) dept_stats
      JOIN institutions i ON i.id = dept_stats.institution_id
      WHERE dept_stats.total_teams > 0
        AND (dept_stats.missed_teams::numeric / dept_stats.total_teams::numeric) * 100
            >= v_escalation_t2_pct;

      -- ── Step 5.9: Build human-readable body and emit work item.
      v_ai_pulse_parts := ARRAY[]::TEXT[];

      v_ai_pulse_parts := v_ai_pulse_parts || (
        'Engagement: ' || v_engaged_teams || '/' || v_enrolled_teams
        || ' teams (' || v_engagement_pct || '%)'
      );

      IF v_red_flag_count > 0 THEN
        v_ai_pulse_parts := v_ai_pulse_parts || (
          'Red-flag institutions (' || v_red_flag_count || '): ' || COALESCE(v_red_flag_depts, '')
        );
      END IF;

      IF v_anomaly_count > 0 THEN
        v_ai_pulse_parts := v_ai_pulse_parts || (
          v_anomaly_count || ' unreviewed anomaly flag(s) this week'
        );
      END IF;

      IF v_gold_count > 0 THEN
        v_ai_pulse_parts := v_ai_pulse_parts || (
          v_gold_count || ' Gold Standard candidate(s) this cycle'
        );
      END IF;

      v_body := ARRAY_TO_STRING(v_ai_pulse_parts, '. ') || '.';

      -- Determine priority: high if engagement < 70% or red-flag depts exist, else normal
      DECLARE
        v_pulse_priority TEXT := CASE
          WHEN v_engagement_pct < 70 OR v_red_flag_count > 0 THEN 'high'
          ELSE 'normal'
        END;
      BEGIN
        v_key := 'digest:' || v_user.id::text || ':dashboard:ai_pulse:' || v_today;
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:ai_pulse', v_pulse_priority,
          'AI Pulse digest — ' || v_engagement_pct || '% engaged (' || v_enrolled_teams || ' teams)',
          v_body,
          jsonb_build_object(
            'url', '/ai-pulse/admin/cycles',
            'digest', true,
            'active', true,
            'cycle_id', v_last_cycle_id,
            'enrolled_teams', v_enrolled_teams,
            'engaged_teams', v_engaged_teams,
            'engagement_pct', v_engagement_pct,
            'anomaly_flag_count', v_anomaly_count,
            'gold_standard_count', v_gold_count,
            'red_flag_institution_count', v_red_flag_count
          ),
          v_user.id, v_key, 24);
      END;

    END IF; -- END Category 5: dashboard:ai_pulse

  END LOOP;
  RETURN v_created;
END $fn_digest$;

REVOKE ALL ON FUNCTION fn_generate_super_admin_daily_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_super_admin_daily_digest() TO service_role;

-- ============================================================================
-- Verification query (run after applying to confirm function compiles):
--   SELECT proname, prosrc IS NOT NULL AS has_body
--   FROM pg_proc WHERE proname = 'fn_generate_super_admin_daily_digest';
-- ============================================================================
