-- ================================================================================
-- ATTENTION BAR — the rest of the fn_aqs_* family takes its identity from an argument
-- Created: 2026-08-08
-- Base file: supabase/migrations/attention_bar_state_query_functions_v1.sql (PR #556)
--
-- WHAT THIS CLOSES, AND WHY IT IS A FAMILY PROBLEM
-- ------------------------------------------------
-- 20260816030000 hardened two members of this family
-- (fn_aqs_attendance_unmarked_periods_today, fn_aqs_attendance_faculty_compliance_today)
-- against three holes that all follow from ONE shape:
--
--     a SECURITY DEFINER function, GRANTed to `authenticated`, that takes BOTH
--     its identity (p_user_id) AND its scope (p_institution_id) as ARGUMENTS.
--
--   1. BORROWED IDENTITY — p_user_id was never compared to auth.uid(), so any
--      signed-in caller could name a super administrator through PostgREST and
--      the function would faithfully evaluate THAT person's privileges.
--   2. UNCLAMPED SCOPE   — p_institution_id replaced the caller's own institution
--      with no authorization gate, returning another college's figures.
--   3. FAIL-OPEN ON NULL — the scope predicate reads a NULL institution as
--      CLUSTER-WIDE rather than as "none", so an unresolvable caller fell through
--      into every college's data.
--
-- The three remaining siblings were never audited. This migration classifies all
-- three against those holes and fixes only what is genuinely exposed. Each body
-- below was read from PRODUCTION via pg_get_functiondef on 2026-08-08 and is
-- reproduced verbatim apart from the guards — the repo's v1 file predates several
-- live changes and is not a safe base to retype from.
--
--   fn_aqs_billing_overdue_invoices          EXPOSED on all three  -> fixed here
--   fn_aqs_counselor_pending_leads           EXPOSED on #1 only    -> fixed here
--   fn_aqs_admission_leads_unassigned_count  SAFE on #1, exposed #2/#3 -> fixed here
--
-- fn_aqs_counselor_pending_leads is NOT given a scope clamp: it takes no
-- p_institution_id and already returns count 0 when the caller owns no counselor
-- record, so holes 2 and 3 do not exist there. Adding a clamp it does not need
-- would be a wider diff for no security gain.
--
-- The two attendance functions are deliberately NOT re-created here. They are
-- already correct on production and re-shipping them from a second file is how a
-- hardened body gets silently reverted.
--
-- WHY SCOPE IS READ FROM custom_roles AND NEVER FROM A ROLE-NAME LIST
-- -------------------------------------------------------------------
-- The shipped bodies decided cluster scope with literals —
-- `v_user_role IN ('super_admin','admin')` in billing, plus 'admission' in the
-- admission counter. Measured on production 2026-08-08, that list is wrong in
-- BOTH directions:
--
--   * custom_roles holds NO row named 'admin' at all. Yet ONE live profile still
--     carries the legacy value role='admin', WITH an institution_id and WITHOUT
--     the is_super_admin flag. Naming 'admin' in the list handed that
--     single-tenant user the entire cluster's overdue billing figures.
--   * The 2 real 'administrator' users ARE cluster-scoped (institution_scope='all')
--     but are NOT flagged is_super_admin and hold NO institution_id. Clamping on
--     the flag alone would have emptied their screen instead.
--
-- custom_roles.institution_scope is what Role Management writes and what
-- role_has_institution_access() reads (via user_roles, and via a legacy
-- profiles.role -> custom_roles.role_key fallback — the same join used below).
-- A literal list is therefore a second copy of a decision that already has an
-- owner, free to drift away from it. Verified live the same day: custom_roles has
-- NO institution_id column, and role_key is unique on its own (88 roles, 88
-- distinct keys), so this lookup needs no further qualification.
--
-- SERVICE CALLERS
-- ---------------
-- auth.uid() is NULL for service_role and internal server contexts. Those already
-- hold full trust and pass p_user_id explicitly, so every guard below fires only
-- when auth.uid() IS NOT NULL. The application itself is on the guarded path:
-- lib/attention-bar/state-queries.ts calls these through
-- createServerSupabaseClient(), the cookie-backed session client.
--
-- MIGRATION IS A FILE ONLY — not applied. Director-gated.
-- ================================================================================

-- ────────────────────────────────────────────────────────────────────────────────
-- 1/3  fn_aqs_billing_overdue_invoices — EXPOSED ON ALL THREE HOLES
--
-- Before this change, an authenticated caller could name any super administrator
-- and receive the cluster-wide overdue count, the total overdue amount and the
-- age of the oldest unpaid bill. Separately, ANY caller whose p_user_id matched no
-- profile row left every local flag NULL, fell past both branches with
-- v_institution_id still NULL, and hit the fail-open predicate — so even a random
-- UUID returned the whole cluster's billing position.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_billing_overdue_invoices(
    p_user_id UUID,
    p_institution_id UUID DEFAULT NULL::UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_user_role       TEXT;
    v_institution_id  UUID;
    v_cluster_scoped  BOOLEAN := false;
    v_count           INT;
    v_total_amount    NUMERIC(15,2);
    v_oldest_days     INT;
BEGIN
    -- IDENTITY GUARD — must come before anything reads p_user_id.
    IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object(
            'count',                0,
            'total_overdue_amount', 0,
            'oldest_invoice_days',  0
        );
    END IF;

    -- Resolve caller scope from profiles
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_user_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    -- Ask the role registry, never a name list. See the header for the two live
    -- profiles that make the literal form wrong in both directions.
    SELECT COALESCE(bool_or(cr.institution_scope = 'all'), false)
    INTO v_cluster_scoped
    FROM public.custom_roles cr
    WHERE cr.role_key = v_user_role
      AND cr.is_active;

    -- SECURITY CLAMP. Only a genuinely cluster-scoped caller may redirect scope;
    -- everyone else keeps the institution from their own profile, whatever they pass.
    IF COALESCE(v_is_super_admin, false) OR v_cluster_scoped THEN
        v_institution_id := p_institution_id;
    ELSIF p_institution_id IS NOT NULL THEN
        NULL; -- keep v_institution_id from profiles (security clamp)
    END IF;

    -- A cluster-scoped caller naming no institution sees all of them.
    IF (COALESCE(v_is_super_admin, false) OR v_cluster_scoped)
       AND p_institution_id IS NULL THEN
        v_institution_id := NULL;
    END IF;

    -- FAIL CLOSED. The predicate below reads
    -- `(v_institution_id IS NULL OR bsb.institution_id = v_institution_id)`, so a
    -- NULL institution means CLUSTER-WIDE, not "none". A caller who is NOT
    -- cluster-scoped and whose institution cannot be resolved — an unknown
    -- p_user_id, or a profile with a NULL institution_id — would otherwise fall
    -- through into every college's billing. Return empty instead.
    IF NOT COALESCE(v_is_super_admin, false)
       AND NOT v_cluster_scoped
       AND v_institution_id IS NULL THEN
        RETURN jsonb_build_object(
            'count',                0,
            'total_overdue_amount', 0,
            'oldest_invoice_days',  0
        );
    END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_aqs_billing_overdue_invoices(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_billing_overdue_invoices(UUID, UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- 2/3  fn_aqs_counselor_pending_leads — EXPOSED ON HOLE #1 ONLY
--
-- This one returns more than a count: the oldest pending lead's UUID, its age in
-- days, and the applicant's FULL NAME. Naming another counselor's profile UUID
-- therefore handed over a named individual, not just a figure.
--
-- Holes 2 and 3 do not apply. There is no p_institution_id to clamp, and the
-- lookup already fails closed — no active admission_counselors row for p_user_id
-- returns count 0 and never reaches the query. Nothing else in this body changes.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_counselor_pending_leads(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_count          INT;
    v_oldest_id      UUID;
    v_oldest_days    INT;
    v_oldest_name    TEXT;
    v_counselor_id   UUID;
BEGIN
    -- IDENTITY GUARD — see 1/3. Fires only for a signed-in caller naming someone
    -- else, so service_role and internal callers are unaffected.
    IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    -- Resolve user_id -> admission_counselors.id
    -- admission_leads.assigned_counselor_id references admission_counselors(id)
    -- admission_counselors.user_id references profiles(id)
    SELECT id INTO v_counselor_id
    FROM public.admission_counselors
    WHERE user_id = p_user_id
      AND is_active = true
    LIMIT 1;

    -- Caller owns no counselor record; return zero count
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_aqs_counselor_pending_leads(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_counselor_pending_leads(UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- 3/3  fn_aqs_admission_leads_unassigned_count — SAFE ON #1, EXPOSED ON #2 AND #3
--
-- Hole #1 does not exist here and no guard is added for it: this function has no
-- p_user_id parameter and derives the caller from auth.uid() directly, so its
-- identity cannot be borrowed. That is the shape the other four should have had.
--
-- What it did get wrong is the same role-name list ('super_admin','admin',
-- 'admission'), plus the fail-open: a caller who is not on that list and whose
-- profile carries no institution had v_institution_id set to NULL and read every
-- college's unassigned leads. ('admission' is itself institution_scope='all' in
-- the registry, so reading the registry loses nothing that list was granting.)
--
-- The auth.uid() IS NULL branch is preserved deliberately. Unlike its siblings
-- this function has no p_user_id to fall back on, so a service_role caller has no
-- identity at all; failing closed on that would break internal callers that
-- legitimately read the cluster-wide figure.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_admission_leads_unassigned_count(
    p_institution_id UUID DEFAULT NULL::UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_user_role       TEXT;
    v_institution_id  UUID;
    v_caller_inst_id  UUID;
    v_cluster_scoped  BOOLEAN := false;
    v_caller_id       UUID;
    v_count           INT;
    v_oldest_days     INT;
BEGIN
    -- Read the caller ONCE. auth.uid() is STABLE, but pinning it to a local also
    -- makes the "is there a caller at all?" test below read as the single
    -- decision it is.
    v_caller_id := auth.uid();

    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_user_role, v_caller_inst_id
    FROM public.profiles p
    WHERE p.id = v_caller_id;

    -- Ask the role registry, never a name list. See the header.
    SELECT COALESCE(bool_or(cr.institution_scope = 'all'), false)
    INTO v_cluster_scoped
    FROM public.custom_roles cr
    WHERE cr.role_key = v_user_role
      AND cr.is_active;

    IF v_caller_id IS NULL THEN
        -- service_role / internal context: full trust, honour the filter as before.
        v_institution_id := p_institution_id;
    ELSIF COALESCE(v_is_super_admin, false) OR v_cluster_scoped THEN
        -- Cluster-scoped: honour the requested institution; NULL = all.
        v_institution_id := p_institution_id;
    ELSE
        -- Everyone else is clamped to their own institution regardless of request.
        v_institution_id := v_caller_inst_id;
    END IF;

    -- FAIL CLOSED for a real signed-in caller we cannot scope. Same reasoning as
    -- 1/3: the predicate reads NULL as cluster-wide, so an unresolvable profile
    -- would otherwise see every college's unassigned leads.
    IF v_caller_id IS NOT NULL
       AND NOT COALESCE(v_is_super_admin, false)
       AND NOT v_cluster_scoped
       AND v_institution_id IS NULL THEN
        RETURN jsonb_build_object('count', 0, 'oldest_unassigned_days', 0);
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_aqs_admission_leads_unassigned_count(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_admission_leads_unassigned_count(UUID) TO authenticated, service_role;
