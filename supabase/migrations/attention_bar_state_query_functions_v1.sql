-- ================================================================================
-- ATTENTION BAR: Phase 4a — State-Query SECURITY DEFINER Functions
-- Created: 2026-04-28
-- Spec: specs/attention-bar-5-layer-system.md §3 Layer 2
-- PR: phase-4a/attention-bar-state-query-functions
-- Purpose: 5 named state-query functions registered in quick_action_state_queries.
--   Layer 2 rules reference these by query_key; the resolver calls them and
--   passes their JSON output into rule when_clause evaluation.
--   All are SECURITY DEFINER + SET search_path to prevent SQL-injection-via-search-path.
--
-- Auth note: Because these are SECURITY DEFINER they execute as the function owner
--   (postgres role). We do NOT call auth.uid() or is_super_admin() from inside most
--   functions — the function owner is not the calling user. Scope is determined from
--   p_user_id parameter by querying profiles.is_super_admin + profiles.institution_id.
--   Exception: fn_aqs_admission_leads_unassigned_count uses auth.uid() because it
--   has no p_user_id parameter; auth.uid() is preserved in connection context even
--   inside SECURITY DEFINER.
--
-- Schema discoveries during development (prod-first verification):
--   - staff_plan_courses has NO section_id; has staff_id directly
--   - staff_plans has NO staff_id; is a semester-level plan (department-scoped)
--   - student_attendance has NO marked_by column; compliance is section-level
--   - timetables.selected_days is a JSONB array of day names ('MONDAY', etc.)
--   - Attendance model: timetables.section_id -> student_attendance.section_id on attendance_date
-- ================================================================================

-- ────────────────────────────────────────────────────────────────────────────────
-- FUNCTION 1: fn_aqs_counselor_pending_leads
-- query_key: 'counselor.pending_leads'
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_counselor_pending_leads(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_count          INT;
    v_oldest_id      UUID;
    v_oldest_days    INT;
    v_oldest_name    TEXT;
    v_counselor_id   UUID;
BEGIN
    -- Resolve user_id → admission_counselors.id
    SELECT id INTO v_counselor_id
    FROM public.admission_counselors
    WHERE user_id = p_user_id
      AND is_active = true
    LIMIT 1;

    IF v_counselor_id IS NULL THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT
        COUNT(*)::INT                                                            AS cnt,
        (ARRAY_AGG(al.id ORDER BY al.created_at ASC))[1]                        AS oldest_id,
        CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(al.created_at))) / 86400.0)::INT   AS oldest_days,
        (ARRAY_AGG(COALESCE(al.full_name, al.first_name) ORDER BY al.created_at ASC))[1] AS oldest_name
    INTO v_count, v_oldest_id, v_oldest_days, v_oldest_name
    FROM public.admission_leads al
    WHERE al.assigned_counselor_id = v_counselor_id
      AND al.funnel_stage::text IN (
            'new', 'contacted', 'qualified', 'follow_up', 'follow_up_scheduled',
            'engaged', 'not_reachable', 'application_started'
          )
      AND al.is_active = true
      AND al.is_lost  = false;

    IF COALESCE(v_count, 0) = 0 THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    RETURN jsonb_build_object(
        'count',                  v_count,
        'oldest_lead_id',         v_oldest_id,
        'oldest_lead_days',       v_oldest_days,
        'oldest_lead_full_name',  COALESCE(v_oldest_name, '')
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_counselor_pending_leads(UUID) IS
    'AQS Layer-2 state query. Returns count of active pending leads assigned to a counselor '
    'and the identity + age of the oldest one. Used by rules like "if pending_count > 10 → Resume oldest lead". '
    'Resolves user → admission_counselors via user_id FK.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_counselor_pending_leads(UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- FUNCTION 2: fn_aqs_attendance_unmarked_periods_today
-- query_key: 'attendance.unmarked_periods_today'
--
-- Schema note: student_attendance has NO marked_by column; timetables store
-- selected_days as JSONB array. Compliance is section-level.
-- "Unmarked" = timetable is active + scheduled today (selected_days contains today's
-- weekday name in uppercase) + no student_attendance row for (section_id, today).
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_unmarked_periods_today(
    p_user_id        UUID,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_institution_id  UUID;
    v_department_id   UUID;
    v_role            TEXT;
    v_count           INT := 0;
    v_sample_ids      UUID[];
    v_today_dow       TEXT;
BEGIN
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF p_institution_id IS NOT NULL THEN
        v_institution_id := p_institution_id;
    END IF;

    IF v_is_super_admin AND p_institution_id IS NULL THEN
        v_institution_id := NULL;
    END IF;

    SELECT s.department_id
    INTO v_department_id
    FROM public.staff s
    WHERE (s.profile_id = p_user_id
       OR s.institution_email = (SELECT email FROM public.profiles WHERE id = p_user_id))
      AND s.is_active = true
    ORDER BY CASE WHEN s.profile_id = p_user_id THEN 0 ELSE 1 END
    LIMIT 1;

    -- Trim whitespace from TO_CHAR padding
    v_today_dow := TRIM(UPPER(TO_CHAR(CURRENT_DATE, 'DAY')));

    -- NOTE: Missing index on student_attendance(section_id, attendance_date, institution_id).
    -- Flagged for a dedicated index PR.

    SELECT
        COUNT(DISTINCT t.section_id)::INT,
        ARRAY(
            SELECT DISTINCT t2.section_id
            FROM public.timetables t2
            WHERE t2.is_active = true
              AND t2.section_id IS NOT NULL
              AND (v_institution_id IS NULL OR t2.institution_id = v_institution_id)
              AND (v_department_id IS NULL OR t2.department_id = v_department_id)
              AND t2.selected_days ? v_today_dow
              AND NOT EXISTS (
                  SELECT 1 FROM public.student_attendance sa2
                  WHERE sa2.section_id      = t2.section_id
                    AND sa2.attendance_date = CURRENT_DATE
                    AND (v_institution_id IS NULL OR sa2.institution_id = v_institution_id)
              )
            LIMIT 10
        )
    INTO v_count, v_sample_ids
    FROM public.timetables t
    WHERE t.is_active = true
      AND t.section_id IS NOT NULL
      AND (v_institution_id IS NULL OR t.institution_id = v_institution_id)
      AND (v_department_id IS NULL OR t.department_id = v_department_id)
      AND t.selected_days ? v_today_dow
      AND NOT EXISTS (
          SELECT 1 FROM public.student_attendance sa
          WHERE sa.section_id      = t.section_id
            AND sa.attendance_date = CURRENT_DATE
            AND (v_institution_id IS NULL OR sa.institution_id = v_institution_id)
      );

    RETURN jsonb_build_object(
        'count',             COALESCE(v_count, 0),
        'sample_period_ids', COALESCE(to_jsonb(v_sample_ids), '[]'::jsonb)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) IS
    'AQS Layer-2 state query. Returns count of sections with active timetables scheduled '
    'for today (via selected_days JSONB) but no student_attendance row yet for today. '
    'Faculty scope: department. HOD scope: department. super_admin: institution or all. '
    'sample_period_ids contains up to 10 section UUIDs without attendance. '
    'NOTE: student_attendance.marked_by does not exist — compliance is section-level.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- FUNCTION 3: fn_aqs_billing_overdue_invoices
-- query_key: 'billing.overdue_invoices'
--
-- Uses billing_student_bills (not billing_invoices) because billing_invoices
-- has no status column. billing_student_bills.status IN ('unpaid','pending')
-- with due_date < CURRENT_DATE is the canonical overdue definition.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_billing_overdue_invoices(
    p_user_id        UUID,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_user_role       TEXT;
    v_institution_id  UUID;
    v_count           INT;
    v_total_amount    NUMERIC(15,2);
    v_oldest_days     INT;
BEGIN
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_user_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF v_is_super_admin OR v_user_role IN ('super_admin', 'admin') THEN
        v_institution_id := p_institution_id;
    ELSIF p_institution_id IS NOT NULL THEN
        NULL; -- keep v_institution_id from profiles (security clamp)
    END IF;

    -- NOTE: Missing composite index on billing_student_bills(due_date, status, institution_id).
    -- Flagged for dedicated billing index PR.

    SELECT
        COUNT(*)::INT,
        COALESCE(SUM(bsb.final_amount - COALESCE(bsb.balance_amount, 0)), 0)::NUMERIC(15,2),
        CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(bsb.due_date::TIMESTAMPTZ))) / 86400.0)::INT
    INTO v_count, v_total_amount, v_oldest_days
    FROM public.billing_student_bills bsb
    WHERE bsb.status IN ('unpaid', 'pending')
      AND bsb.due_date < CURRENT_DATE
      AND (v_institution_id IS NULL OR bsb.institution_id = v_institution_id);

    RETURN jsonb_build_object(
        'count',                COALESCE(v_count, 0),
        'total_overdue_amount', COALESCE(v_total_amount, 0),
        'oldest_invoice_days',  COALESCE(v_oldest_days, 0)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_billing_overdue_invoices(UUID, UUID) IS
    'AQS Layer-2 state query. Counts billing_student_bills rows that are unpaid/pending '
    'and past their due_date. Returns aggregate count, total rupee exposure, and age of '
    'the oldest overdue bill. Institution-scoped: admins can query any institution, '
    'non-admins are clamped to their own institution.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_billing_overdue_invoices(UUID, UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- FUNCTION 4: fn_aqs_admission_leads_unassigned_count
-- query_key: 'admission.leads.unassigned_count'
-- Rate limit: 60/min (lower — director-level dashboard query)
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_admission_leads_unassigned_count(
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_user_role       TEXT;
    v_institution_id  UUID;
    v_caller_inst_id  UUID;
    v_count           INT;
    v_oldest_days     INT;
BEGIN
    -- auth.uid() is preserved in connection context even inside SECURITY DEFINER
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_user_role, v_caller_inst_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_is_super_admin OR v_user_role IN ('super_admin', 'admin', 'admission') THEN
        v_institution_id := p_institution_id;
    ELSE
        v_institution_id := v_caller_inst_id;
    END IF;

    SELECT
        COUNT(*)::INT,
        CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(al.created_at))) / 86400.0)::INT
    INTO v_count, v_oldest_days
    FROM public.admission_leads al
    WHERE al.assigned_counselor_id IS NULL
      AND al.funnel_stage::text NOT IN (
            'lost', 'converted', 'enrolled', 'confirmed',
            'declined', 'withdrew', 'expired', 'dormant'
          )
      AND al.is_active = true
      AND al.is_lost   = false
      AND (v_institution_id IS NULL OR al.institution_id = v_institution_id);

    RETURN jsonb_build_object(
        'count',                  COALESCE(v_count, 0),
        'oldest_unassigned_days', COALESCE(v_oldest_days, 0)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_admission_leads_unassigned_count(UUID) IS
    'AQS Layer-2 state query. Counts admission_leads with no counselor assignment '
    'that are still in active funnel stages. ~89% of JKKN leads are currently unassigned '
    '(14,253 as of 2026-04-28). Uses auth.uid() for caller scope. '
    'Rate limited to 60/min (lower frequency; suitable for director-level dashboards).';

GRANT EXECUTE ON FUNCTION public.fn_aqs_admission_leads_unassigned_count(UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- FUNCTION 5: fn_aqs_attendance_faculty_compliance_today
-- query_key: 'attendance.faculty_compliance_today'
--
-- Schema note: student_attendance has NO marked_by column.
-- Compliance is section-level: "compliant" = section has at least one
-- student_attendance row for today. non_compliant_user_ids contains
-- SECTION UUIDs (not user UUIDs) — resolver can look up faculty from sections.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_faculty_compliance_today(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_department_id      UUID;
    v_institution_id     UUID;
    v_total_sections     INT := 0;
    v_marked_sections    INT := 0;
    v_unmarked_sections  INT := 0;
    v_unmarked_ids       UUID[];
    v_today_dow          TEXT;
BEGIN
    -- Resolve HOD's department + institution
    SELECT s.department_id, s.institution_id
    INTO v_department_id, v_institution_id
    FROM public.staff s
    WHERE (s.profile_id = p_user_id
       OR s.institution_email = (SELECT email FROM public.profiles WHERE id = p_user_id))
      AND s.is_active = true
    ORDER BY CASE WHEN s.profile_id = p_user_id THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_institution_id IS NULL THEN
        SELECT institution_id INTO v_institution_id
        FROM public.profiles
        WHERE id = p_user_id;
    END IF;

    v_today_dow := TRIM(UPPER(TO_CHAR(CURRENT_DATE, 'DAY')));

    -- NOTE: Missing composite index on student_attendance(section_id, attendance_date, institution_id).
    -- Add in a dedicated index PR.

    WITH dept_sections AS (
        SELECT DISTINCT t.section_id
        FROM public.timetables t
        WHERE t.is_active = true
          AND t.section_id IS NOT NULL
          AND t.institution_id = v_institution_id
          AND (v_department_id IS NULL OR t.department_id = v_department_id)
          AND t.selected_days ? v_today_dow
    ),
    marked AS (
        SELECT DISTINCT sa.section_id
        FROM public.student_attendance sa
        WHERE sa.attendance_date = CURRENT_DATE
          AND sa.institution_id  = v_institution_id
          AND sa.section_id IN (SELECT section_id FROM dept_sections)
    )
    SELECT
        COUNT(d.section_id)::INT,
        COUNT(m.section_id)::INT,
        (COUNT(d.section_id) - COUNT(m.section_id))::INT,
        ARRAY(
            SELECT d2.section_id
            FROM dept_sections d2
            LEFT JOIN marked m2 ON m2.section_id = d2.section_id
            WHERE m2.section_id IS NULL
            ORDER BY d2.section_id
            LIMIT 10
        )
    INTO v_total_sections, v_marked_sections, v_unmarked_sections, v_unmarked_ids
    FROM dept_sections d
    LEFT JOIN marked m ON m.section_id = d.section_id;

    -- Return shape matches spec field names even though values are section-level
    -- (total_faculty = total sections scheduled today, non_compliant_user_ids = section UUIDs)
    RETURN jsonb_build_object(
        'total_faculty',           COALESCE(v_total_sections, 0),
        'compliant_count',         COALESCE(v_marked_sections, 0),
        'non_compliant_count',     COALESCE(v_unmarked_sections, 0),
        'non_compliant_user_ids',  COALESCE(to_jsonb(v_unmarked_ids), '[]'::jsonb)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_attendance_faculty_compliance_today(UUID) IS
    'AQS Layer-2 state query. For HOD: how many sections in their department have had attendance '
    'marked today (timetables scheduled today via selected_days) vs. how many have not. '
    'NOTE: student_attendance has no marked_by column — compliance is section-level. '
    'non_compliant_user_ids contains non-compliant SECTION UUIDs (not user UUIDs, capped at 10). '
    'Resolves HOD department via staff.profile_id FK or institution_email fallback.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_attendance_faculty_compliance_today(UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- REGISTRY SEEDS: quick_action_state_queries
-- Idempotent via ON CONFLICT (query_key) DO NOTHING
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.quick_action_state_queries
    (query_key, description, sql_function_name, return_shape, rate_limit_per_minute)
VALUES
    (
        'counselor.pending_leads',
        'Count of active pending leads assigned to a counselor, plus the oldest lead identity and age in days. Resolves user_id → admission_counselors via user_id FK. Used by Layer 2 rules that trigger lead-resume actions when a counselor has too many stale assignments.',
        'fn_aqs_counselor_pending_leads',
        '{"count":0,"oldest_lead_id":null,"oldest_lead_days":null,"oldest_lead_full_name":null}'::jsonb,
        30
    ),
    (
        'attendance.unmarked_periods_today',
        'Count of sections with active timetables scheduled today (via selected_days JSONB) but no student_attendance row yet. Faculty/HOD scope by department. super_admin scope by institution or all. sample_period_ids capped at 10 section UUIDs.',
        'fn_aqs_attendance_unmarked_periods_today',
        '{"count":0,"sample_period_ids":[]}'::jsonb,
        30
    ),
    (
        'billing.overdue_invoices',
        'Count of billing_student_bills that are unpaid/pending and past their due_date, total rupee exposure, and age of the oldest overdue bill. Uses billing_student_bills (not billing_invoices which has no status column). Institution-scoped per role.',
        'fn_aqs_billing_overdue_invoices',
        '{"count":0,"total_overdue_amount":0,"oldest_invoice_days":0}'::jsonb,
        30
    ),
    (
        'admission.leads.unassigned_count',
        'Count of admission_leads with no counselor assignment in active funnel stages, plus age of oldest unassigned lead. 14,253 leads unassigned as of 2026-04-28 (~89% of total). Uses auth.uid() for scope. Rate limited to 60/min (director-level dashboard query).',
        'fn_aqs_admission_leads_unassigned_count',
        '{"count":0,"oldest_unassigned_days":0}'::jsonb,
        60
    ),
    (
        'attendance.faculty_compliance_today',
        'For HOD role: how many sections in their department have attendance marked today vs. how many timetables scheduled today have none. non_compliant_user_ids contains section UUIDs (capped at 10) — not user UUIDs (student_attendance has no marked_by). HOD department resolved via staff.profile_id FK or institution_email.',
        'fn_aqs_attendance_faculty_compliance_today',
        '{"total_faculty":0,"compliant_count":0,"non_compliant_count":0,"non_compliant_user_ids":[]}'::jsonb,
        30
    )
ON CONFLICT (query_key) DO NOTHING;
