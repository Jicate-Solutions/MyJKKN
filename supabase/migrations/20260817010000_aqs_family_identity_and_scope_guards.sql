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
-- role_has_institution_access() reads. A literal list is therefore a second copy
-- of a decision that already has an owner, free to drift away from it.
--
-- READING ONLY profiles.role IS THE SAME MISTAKE ONE LEVEL DOWN. A first draft of
-- this migration inlined `custom_roles cr WHERE cr.role_key = v_role` into two
-- bodies and called it parity with role_has_institution_access(). It is not:
-- that function checks user_roles FIRST — the many-to-many table Role Management
-- actually writes — and falls back to the denormalised profiles.role only
-- afterwards. Measured on production 2026-08-08, reading the fallback alone is
-- wrong in both directions again: 161 profiles are cluster-scoped via user_roles
-- against 138 via profiles.role, and 29 of them are visible ONLY through
-- user_roles — clamped to one college, or (had any carried a NULL institution)
-- dropped into the fail-closed branch and shown a permanent zero.
--
-- fn_aqs_caller_is_cluster_scoped below therefore ORs both paths, in the same
-- order and with the same joins as role_has_institution_access(), and is a
-- FUNCTION rather than an inlined join precisely because this file argues that a
-- second copy of a decision is free to drift — two inlined copies would have been
-- the third and fourth.
--
-- Schema facts this file depends on, verified live 2026-08-08: custom_roles has
-- NO institution_id column; role_key is unique on its own (88 roles, 88 distinct
-- keys); is_active EXISTS and is NOT NULL DEFAULT true (so the filter below
-- cannot raise 42703 or be silently demoted by a NULL); and institution_scope IS
-- nullable, which is why every read is wrapped in COALESCE and a NULL scope
-- resolves to "not cluster-scoped" rather than to true.
--
-- DO NOT TAKE ANY OF THE NUMBERS IN THIS HEADER ON TRUST. They are measurements
-- of a database that nine sessions write concurrently, they are not visible in
-- the diff, and a comment is not evidence. Every figure quoted above is
-- reproduced by these three read-only queries — run them and disagree with the
-- comment if the comment is out of date:
--
--   -- who is cluster-scoped, by each path (161 / 138 / 29 / 6 when written)
--   WITH viaprof AS (
--     SELECT p.id FROM profiles p
--     JOIN custom_roles cr ON cr.role_key = p.role AND cr.is_active
--     WHERE cr.institution_scope = 'all'),
--   viaroles AS (
--     SELECT DISTINCT ur.user_id AS id FROM user_roles ur
--     JOIN custom_roles cr ON cr.id = ur.role_id
--     WHERE cr.institution_scope = 'all' AND cr.is_active)
--   SELECT (SELECT count(*) FROM viaroles)                                   AS via_user_roles,
--          (SELECT count(*) FROM viaprof)                                    AS via_profiles_role,
--          (SELECT count(*) FROM viaroles r
--             WHERE NOT EXISTS (SELECT 1 FROM viaprof p WHERE p.id = r.id))  AS only_user_roles,
--          (SELECT count(*) FROM viaprof p
--             WHERE NOT EXISTS (SELECT 1 FROM viaroles r WHERE r.id = p.id)) AS only_legacy;
--
--   -- the role-name list vs the registry, per role actually in use
--   SELECT p.role, count(*) AS profiles,
--          (p.role IN ('super_admin','admin')) AS old_list_says_cluster,
--          COALESCE((SELECT bool_or(cr.institution_scope = 'all') FROM custom_roles cr
--                    WHERE cr.role_key = p.role AND cr.is_active), false) AS registry_says_cluster
--   FROM profiles p WHERE p.role IS NOT NULL GROUP BY p.role ORDER BY profiles DESC;
--
--   -- the disclosed widening (31 -> 138 when written)
--   WITH c AS (
--     SELECT COALESCE(p.is_super_admin,false) AS flag, p.institution_id,
--            COALESCE((SELECT bool_or(cr.institution_scope='all') FROM custom_roles cr
--                      WHERE cr.role_key = p.role AND cr.is_active), false) AS reg,
--            (p.role IN ('super_admin','admin')) AS oldlist
--     FROM profiles p)
--   SELECT count(*) FILTER (WHERE (flag OR oldlist)
--                              OR (NOT (flag OR oldlist) AND institution_id IS NULL)) AS before,
--          count(*) FILTER (WHERE flag OR reg)                                        AS after
--   FROM c;
--
-- KNOWN AND INHERITED, NOT INTRODUCED HERE: 6 profiles are cluster-scoped through
-- profiles.role ALONE with no matching user_roles row. Deleting a user_roles row
-- does not clear profiles.role, so some of those are plausibly demoted people
-- still being handed the cluster. That over-grant lives in
-- role_has_institution_access() itself — this file matches that function rather
-- than quietly diverging from it, and closing it means changing the platform
-- authority, which is its own reviewed decision.
--
-- ⚠️ THIS FILE WIDENS AS WELL AS NARROWS — RATIFY BEFORE APPLYING
-- ----------------------------------------------------------------
-- Treating the registry as the authority is correct, and it has a consequence
-- that is NOT a side effect to be waved through: cluster-wide billing goes from
-- 31 profiles to 138 (+114, -7). The gainers include staff_counselor (46) and
-- admission_counselor (31) — roles Role Management already marks
-- institution_scope='all', and which already pass role_has_institution_access()
-- for any institution, but which do NOT hold any billing capability, because
-- these functions are SECURITY DEFINER and consult scope with no permission half
-- at all. In practice that is a larger change in what people see than the holes
-- this file closes for billing, which needed either impersonation or a NULL
-- institution to reach.
--
-- It is pinned by a test (a staff_counselor fixture asserting it reads every
-- college, with a pre-fix control showing it previously saw one) so it fails
-- loudly rather than drifting, and so a decision to reject it has somewhere
-- explicit to land.
--
-- It is deliberately NOT gated on user_has_permission here: the missing
-- permission half is a property of all five siblings, and gating billing alone
-- would leave the family disagreeing about what scope means — which is the
-- failure mode this file exists to remove. Whether to add that half, to all
-- five, is the Director's decision. THIS FILE SHOULD NOT BE APPLIED UNTIL THAT
-- DECISION IS RECORDED.
--
-- SERVICE CALLERS
-- ---------------
-- auth.uid() is NULL for service_role and internal server contexts. Those already
-- hold full trust and pass p_user_id explicitly, so every guard below fires only
-- when auth.uid() IS NOT NULL. The application itself is on the guarded path:
-- lib/attention-bar/state-queries.ts calls these through
-- createServerSupabaseClient(), the cookie-backed session client.
--
-- REVIEW FINDINGS DELIBERATELY NOT ACTED ON (recorded so they are decisions, not
-- oversights):
--   * The NULL-auth.uid() trust rule could instead assert
--     current_setting('role') = 'service_role'. Not changed: this is the exact
--     shape already applied and proven in 20260816030000, and a family whose
--     members disagree about what "internal caller" means is how a hole reappears.
--   * An unresolvable caller returns a well-formed zero rather than raising. Also
--     inherited: the resolver is fail-soft and turns any error into a null chip,
--     so raising would produce the same silence with more moving parts. Making a
--     permission failure visible to the reader is a real gap and belongs to the
--     card's contract, across the whole family at once.
--   * `SELECT id INTO v_counselor_id … LIMIT 1` has no ORDER BY, so a caller with
--     two active counselor rows gets a plan-dependent pipeline. Pre-existing and
--     untouched here; fixing it changes which leads people see, which is a
--     product decision, not a security one.
--   * 🔴 `total_overdue_amount` IS RETURNING ZERO ON PRODUCTION RIGHT NOW, and
--     this file does NOT fix it. It sums `final_amount - COALESCE(balance_amount, 0)`
--     — the amount already SETTLED, not the amount owed. The repo's own billing
--     code defines outstanding the other way (`SUM(balance_amount) WHERE
--     balance_amount > 0`, supabase/setup/02_functions.sql), and on an unpaid bill
--     balance_amount equals final_amount, so the subtraction collapses to 0.
--     Measured 2026-08-08: 2,920 overdue bills, this formula returns ₹0.00, while
--     the amount actually owed is ₹26,01,97,825. The attention bar has therefore
--     been showing a ₹0 overdue figure to everyone, always. Reproduce with:
--
--       SELECT count(*) AS overdue_bills,
--              SUM(final_amount - COALESCE(balance_amount,0))::numeric(15,2) AS this_formula,
--              SUM(COALESCE(balance_amount, final_amount))::numeric(15,2)    AS amount_owed
--       FROM billing_student_bills
--       WHERE status IN ('unpaid','pending') AND due_date < CURRENT_DATE;
--
--     Reproduced VERBATIM from the live body (verified byte-identical) and
--     RETAINED here on purpose: this file exists to close an access hole, and
--     changing what a money figure means while doing so is precisely the rider a
--     security fix must not carry — the correction moves a number on a finance
--     screen and deserves its own review, not a footnote in this one. It is
--     called out this loudly because it is the more consequential defect of the
--     two, and because the clamp work above would otherwise bury it.
--   * The redundant second `v_institution_id := NULL` write for cluster-scoped
--     callers is kept because it is what the applied sibling runs; matching the
--     proven body beats tidying it.
--
-- MIGRATION IS A FILE ONLY — not applied. Director-gated.
-- ================================================================================

-- ────────────────────────────────────────────────────────────────────────────────
-- 0/3  fn_aqs_caller_is_cluster_scoped — the scope decision, read ONCE
--
-- Mirrors role_has_institution_access()'s role test: user_roles first, the legacy
-- profiles.role join second. It deliberately does NOT reproduce that function's
-- own-institution / CAS-sibling / user_institution_access branches — those answer
-- "may this caller see institution X", a different question from "is this caller
-- cluster-scoped", which is the only thing the clamps below need.
--
-- NOT granted to `authenticated`. Its callers are SECURITY DEFINER and execute as
-- the owner, so they need no grant, and withholding it keeps this from becoming a
-- new argument-takes-identity surface of exactly the kind this file exists to close.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_caller_is_cluster_scoped(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p_user_id
          AND cr.institution_scope = 'all'
          AND cr.is_active
    )
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.custom_roles cr ON cr.role_key = p.role
        WHERE p.id = p_user_id
          AND cr.institution_scope = 'all'
          AND cr.is_active
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_aqs_caller_is_cluster_scoped(UUID) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_caller_is_cluster_scoped(UUID) TO service_role;


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
    v_cluster_scoped := COALESCE(public.fn_aqs_caller_is_cluster_scoped(p_user_id), false);

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
    v_cluster_scoped := COALESCE(public.fn_aqs_caller_is_cluster_scoped(v_caller_id), false);

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
