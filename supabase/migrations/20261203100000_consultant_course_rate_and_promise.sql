-- ============================================================================
-- Per-consultant, per-course referral rates and the promise they are tied to
-- ============================================================================
-- Director rules implemented here (decided 2026-09-12 unless noted):
--
--   RULE 13 — A rate is per COURSE and per CONSULTANT, tied to what that
--             consultant promised. `referral_rate_config` keys on
--             (institution, programme) and has NO consultant column, so it
--             cannot express this. We extend the EXISTING, EMPTY
--             `consultant_commission_structures` (it already carries
--             consultant_id, program_id, base_amount and the clawback fields)
--             rather than create a third rate table — three sources of truth
--             for one number is the failure already ruled against.
--   RULE 16 — A consultant's promise is BOTH a yearly number AND per-course
--             numbers ("both mix of 1 and 2").
--   RULE 17 — Miss the promise and the consultant is still paid for every
--             learner, just at the NORMAL amount. Missing a promise never
--             zeroes anybody.
--   RULE 20 — Each promise is judged ON ITS OWN. Keeping the yearly promise
--             does NOT rescue a course whose own promise was missed. Worked
--             example the Director was shown: 50 promised for the year + 10
--             promised for B.Sc Nursing; delivered 50 overall but only 6
--             Nursing → those 6 Nursing learners pay the NORMAL amount while
--             every other course pays the higher one.
--   RULE 14 — TDS is 0 in MyJKKN; tax is handled outside the system. Every
--             amount stored here is PRE-TAX. No TDS column is added.
--   RULE 5/19 — Clawback is automatic, full amount, 90-day window, stored as
--             config. `consultant_commission_structures` ALREADY defaults
--             clawback_period_days = 90 and clawback_percentage = 100, which
--             match the rule exactly. Neither default is changed by this
--             migration; they already encode rule 5.
--
-- NOT IN THIS MIGRATION, ON PURPOSE:
--   * `fn_generate_referral_commissions`, `fn_resolve_referral_rate` and
--     `referral_rate_config` are untouched. A separate lane wires the generator
--     to the resolver below; two lanes rewriting one function means the later
--     migration silently erases the earlier one.
--   * The top-up / delta payment path (rules 18 + 21) is the generator lane's
--     job. Its hook point is `fn_resolve_consultant_course_rate` — it returns
--     both the normal and the promised amount for a learner, so a delta run can
--     compute (promised − already paid) without re-deriving the decision.
--   * NO amount is written anywhere in this file. Every amount column ships
--     NULL. Rupee figures are the Director's alone.
--
-- MERGE ORDER — THIS PR MUST NOT MERGE BEFORE PR #3664:
--   The delivered count below uses the enrolment allow-list
--   ('active', 'admitted', 'graduated'). The LIVE payout generator
--   (fn_generate_referral_commissions, as shipped by
--   20261017020000_referral_enrolment_and_attendance_gates.sql) uses FOUR
--   statuses today — those three plus 'reserved'. The disagreement is
--   DELIBERATE and temporary: PR #3664 removes 'reserved' from the generator
--   under the Director's rule 15, and the three-status list here is what the
--   generator will hold once it lands. Merging this file FIRST would open a
--   window in which the promise counter and the payout counter count the same
--   learner differently — a 'reserved' learner would be paid, but would not
--   count toward the promise that decides the rate they are paid at. Land
--   #3664 first. Do not "fix" this list back to four.
--
-- HOW THE TWO PROMISE LEVELS ARE STORED (the core modelling decision):
--   * a row with `program_id IS NULL` (applies_to_all_programs = true) carries
--     the YEARLY promise for that consultant and that academic year, and the
--     fallback rates for every course that has no row of its own;
--   * a row with `program_id = <course>` carries THAT COURSE's promise and its
--     rates.
--   This maps rule 16's "both" onto the table's existing shape with no new
--   table and no new join.
--
-- Safety: `consultant_commission_structures` has 0 rows in production
-- (verified 2026-09-12) and is not read by the generator, so every change here
-- is additive against an empty table.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.consultant_commission_structures
  ADD COLUMN IF NOT EXISTS academic_year    integer,
  ADD COLUMN IF NOT EXISTS promised_count   integer,
  ADD COLUMN IF NOT EXISTS promised_amount  numeric;

-- academic_year is deliberately NULLABLE, not NOT NULL:
--   The table keys validity on effective_from / effective_to DATES, but the
--   referral engine and the promise itself are keyed on an academic YEAR
--   integer (the generator's p_year) — a promise belongs to a year, not to a
--   date range. A NULL academic_year therefore means "a legacy, date-scoped
--   structure that is not part of the promise model", and every promise index,
--   constraint and resolver branch below excludes those rows explicitly. Making
--   it NOT NULL would force a meaningless year onto any future date-scoped row
--   and would have needed a backfill value we are not entitled to invent.
COMMENT ON COLUMN public.consultant_commission_structures.academic_year IS
  'Rule 13/16: the intake year (2026 = the 2026-27 intake) this rate and promise govern. NULL = a legacy date-scoped structure, outside the promise model.';
COMMENT ON COLUMN public.consultant_commission_structures.promised_count IS
  'Rule 16: how many learners the consultant promised at this scope (yearly row when program_id IS NULL, course row otherwise). NULL = no promise made at this scope.';
COMMENT ON COLUMN public.consultant_commission_structures.promised_amount IS
  'Rule 16/17: the PRE-TAX per-learner amount payable when this scope''s promise is MET. NULL until the Director sets it. Rule 14 — no TDS is applied in MyJKKN.';
COMMENT ON COLUMN public.consultant_commission_structures.base_amount IS
  'Rule 17: the NORMAL PRE-TAX per-learner amount — what the consultant is paid when this scope''s promise is missed. Missing a promise never zeroes anybody.';
COMMENT ON COLUMN public.consultant_commission_structures.clawback_period_days IS
  'Rule 5/19: already defaults to 90 — the Director''s clawback window. Unchanged by the promise work.';
COMMENT ON COLUMN public.consultant_commission_structures.clawback_percentage IS
  'Rule 5/19: already defaults to 100 — clawback is the full amount. Unchanged by the promise work.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Shape constraints — never value constraints
-- ─────────────────────────────────────────────────────────────────────────────
-- These say what a number may LOOK like, never what it may BE. No rupee figure
-- and no headcount figure is prescribed anywhere.
ALTER TABLE public.consultant_commission_structures
  DROP CONSTRAINT IF EXISTS ccs_promised_count_positive;
ALTER TABLE public.consultant_commission_structures
  ADD CONSTRAINT ccs_promised_count_positive
  CHECK (promised_count IS NULL OR promised_count > 0);

ALTER TABLE public.consultant_commission_structures
  DROP CONSTRAINT IF EXISTS ccs_promised_amount_non_negative;
ALTER TABLE public.consultant_commission_structures
  ADD CONSTRAINT ccs_promised_amount_non_negative
  CHECK (promised_amount IS NULL OR promised_amount >= 0);

ALTER TABLE public.consultant_commission_structures
  DROP CONSTRAINT IF EXISTS ccs_base_amount_non_negative;
ALTER TABLE public.consultant_commission_structures
  ADD CONSTRAINT ccs_base_amount_non_negative
  CHECK (base_amount IS NULL OR base_amount >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes — including the two that stop one learner having two rates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ccs_consultant_year
  ON public.consultant_commission_structures (consultant_id, academic_year)
  WHERE academic_year IS NOT NULL;

-- WHY TWO partial unique indexes and not one UNIQUE constraint:
--   In a plain UNIQUE constraint, NULL is not equal to NULL, so
--   UNIQUE (consultant_id, academic_year, program_id) would happily admit TWO
--   yearly rows (both with program_id NULL) for the same consultant and year —
--   which is exactly the "two rates for one learner" failure. NULLS NOT
--   DISTINCT (PG15+) would fix it, but only by also folding the legacy
--   academic_year IS NULL rows into the same key space, which we do not want.
--   So the scopes are separated:
--     (a) COURSE rows  — program_id IS NOT NULL: one active row per
--         (institution, consultant, year, course).
--     (b) YEARLY rows  — program_id IS NULL: one active row per
--         (institution, consultant, year). program_id is not in the key at
--         all, so two yearly rows collide on
--         (institution_id, consultant_id, academic_year) and the second insert
--         is rejected. This is the case a normal unique constraint would have
--         let through.
--   Both are scoped `WHERE is_active` (a superseded row can be deactivated and
--   a replacement inserted) and `WHERE academic_year IS NOT NULL` (legacy
--   date-scoped rows are outside the promise model and outside this key).
--
-- WHY institution_id LEADS BOTH KEYS (it was absent in the first revision):
--   institution_id is NOT NULL on this table, and a consultant can refer
--   learners into more than one JKKN college — 28 of 187 education_consultants
--   do. Without institution_id in the key, a per-institution rate for the same
--   consultant and course COULD NOT BE EXPRESSED AT ALL: whichever college
--   saved first would own that consultant's number for every college, and the
--   second college's attempt would be rejected as a duplicate. Each college
--   negotiates its own promise, so each college needs its own row.
DROP INDEX IF EXISTS public.uq_ccs_course_scope;
CREATE UNIQUE INDEX uq_ccs_course_scope
  ON public.consultant_commission_structures (institution_id, consultant_id, academic_year, program_id)
  WHERE is_active AND academic_year IS NOT NULL AND program_id IS NOT NULL;

DROP INDEX IF EXISTS public.uq_ccs_yearly_scope;
CREATE UNIQUE INDEX uq_ccs_yearly_scope
  ON public.consultant_commission_structures (institution_id, consultant_id, academic_year)
  WHERE is_active AND academic_year IS NOT NULL AND program_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Resolver — one learner's (consultant, course, year) → the amount and WHY
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns enough for a screen to explain the decision to a human without
-- recomputing any of it: the amount, which scope decided it, the promise that
-- applied, what was actually delivered against that promise, whether it is met,
-- and both amounts it chose between.
--
-- Resolution order (rules 17 and 20, exactly):
--   1. COURSE row for (consultant, course, year, is_active) carrying a
--      promised_count → judge it ONLY on that course's delivered count.
--      Met → promised_amount. Missed → base_amount.
--      The yearly row is NOT consulted in this branch. That is the whole of
--      rule 20: keeping the yearly promise does not rescue a missed course.
--   2. No course row, or a course row with no promised_count → fall back to the
--      YEARLY row (program_id IS NULL). Met → promised_amount, missed →
--      base_amount.
--   3. Neither row → scope 'none' and a NULL amount. NULL means "no rate set
--      for this consultant", never 0. Paying 0 and having no rate are
--      completely different facts and the caller must be able to tell them
--      apart (July interview, rule 1: never a crash, never a silently-wrong
--      number).
--
-- DELIVERED COUNT: a learner counts when their lifecycle_status is in the
-- enrolment allow-list; an attendance hold does NOT suppress the count. The
-- consultant delivered the learner — whether the college marked a register is
-- not the consultant's performance, and rule 12's own reasoning is that an
-- unmarked register is the college's failure. Holding it against the
-- consultant would penalise them twice for someone else's omission.
-- An earlier revision of this (never-applied) file declared a 3-argument
-- signature with no institution. Dropping it explicitly stops a stale 3-arg
-- copy surviving in any scratch or rehearsal database that ran that draft —
-- CREATE OR REPLACE with a different argument list creates a SECOND function
-- rather than replacing the first, and two resolvers disagreeing about money is
-- precisely the failure this file exists to prevent.
DROP FUNCTION IF EXISTS public.fn_resolve_consultant_course_rate(integer, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_resolve_consultant_course_rate(
  p_year           integer,
  p_institution_id uuid,
  p_consultant_id  uuid,
  p_program_id     uuid
)
RETURNS TABLE (
  scope              text,      -- 'course' | 'yearly' | 'none'
  structure_id       uuid,      -- the row that decided it, NULL when 'none'
  resolved_amount    numeric,   -- PRE-TAX per learner. NULL = no rate set.
  normal_amount      numeric,   -- base_amount on the deciding row
  promised_amount    numeric,   -- promised_amount on the deciding row
  promised_count     integer,   -- the promise that applied, NULL = none made
  delivered_count    integer,   -- delivered at that same scope
  promise_met        boolean,   -- NULL when no promise was made at that scope
  decision_reason    text       -- one human-readable sentence
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.consultant_commission_structures%ROWTYPE;
  v_scope      text;
  v_delivered  integer;
  v_met        boolean;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so gate explicitly. This function returns
  -- rupee amounts and a named consultant's delivery record, so it is NOT for
  -- every signed-in learner. The gate is the same READ surface the sibling rate
  -- screens already use (referral_rate_config's read policy), so admission
  -- staff who can already see commissions keep working and nobody else does.
  -- auth.uid() IS NULL means postgres / service_role — cron and server routes
  -- are unaffected.
  IF auth.uid() IS NOT NULL
     AND NOT (is_super_admin()
              OR is_admin()
              OR user_has_permission('admission.consultants.commissions.view')) THEN
    RAISE EXCEPTION 'fn_resolve_consultant_course_rate: not authorised';
  END IF;

  -- 1. The course's own row, for THIS institution. institution_id is NOT NULL
  --    on the table, so a promise always belongs to exactly one college and
  --    must only ever be resolved against that college.
  SELECT * INTO v_row
    FROM public.consultant_commission_structures s
   WHERE s.institution_id = p_institution_id
     AND s.consultant_id  = p_consultant_id
     AND s.academic_year  = p_year
     AND s.program_id     = p_program_id
     AND s.is_active
     AND s.promised_count IS NOT NULL
   LIMIT 1;

  IF FOUND THEN
    v_scope := 'course';
  ELSE
    -- 2. The yearly row. Reached when the course has no row at all, or has one
    --    that carries no promise.
    SELECT * INTO v_row
      FROM public.consultant_commission_structures s
     WHERE s.institution_id = p_institution_id
       AND s.consultant_id  = p_consultant_id
       AND s.academic_year  = p_year
       AND s.program_id IS NULL
       AND s.is_active
     LIMIT 1;

    IF FOUND THEN
      v_scope := 'yearly';
    ELSE
      -- 3. Nothing set for this consultant. NULL amount, never 0.
      RETURN QUERY SELECT
        'none'::text, NULL::uuid, NULL::numeric, NULL::numeric, NULL::numeric,
        NULL::integer, NULL::integer, NULL::boolean,
        'No rate is set for this consultant for this year. This is not a zero amount — nothing has been decided yet.'::text;
      RETURN;
    END IF;
  END IF;

  -- Delivered at the SAME scope that is being judged, and always WITHIN the
  -- institution whose promise is being judged. Course scope counts only that
  -- course; yearly scope counts every course of that one college.
  --
  -- WHY lp.institution_id is in this count (it was absent in the first
  -- revision, and the omission was a money bug): a consultant can refer
  -- learners into more than one JKKN college — 28 of 187 education_consultants
  -- do. The row that decides the amount is per institution, so counting every
  -- college's learners against one college's promise inflates the delivered
  -- count and flips MISSED to KEPT. Measured worst case on production data
  -- (consultant f146c190-…, year 2026): 194 learners counted against a yearly
  -- promise whose own college contributed at most 85 — a promise of 100 would
  -- have been reported as kept, and every one of that consultant's learners
  -- paid the promised amount instead of the normal one.
  --
  -- WHY the JOIN to admission_years stays INNER — decided, not stumbled into
  -- (this is MyJKKN's documented !inner gotcha in SQL form): a learner whose
  -- admission_year_id IS NULL is dropped from this count, and one such
  -- consultant referral exists in production today. That is the intended
  -- behaviour. A promise is made FOR A YEAR; a learner carrying no year belongs
  -- to no year, and attributing them to p_year would invent a fact nobody
  -- recorded. The exclusion is also conservative in the direction that cannot
  -- over-pay: it can only LOWER the delivered count, so it can only fall back
  -- to the normal amount. The remedy is to record that learner's admission
  -- year — a data fix, not a code one.
  --
  -- Attendance holds are not applied here — see the note above the function.
  SELECT count(*)::integer INTO v_delivered
    FROM public.learners_profiles lp
    JOIN public.admission_years ay
      ON ay.id = lp.admission_year_id AND ay.year = p_year
   WHERE lp.institution_id   = p_institution_id
     AND lp.referral_type    = 'consultant'
     AND lp.referred_by_id   = p_consultant_id
     AND lp.lifecycle_status::text IN ('active', 'admitted', 'graduated')
     AND (v_scope <> 'course' OR lp.program_id = p_program_id);

  IF v_row.promised_count IS NULL THEN
    -- A yearly row with no promise: there is nothing to judge, so the normal
    -- amount stands. Rule 17 — never zero.
    RETURN QUERY SELECT
      v_scope, v_row.id, v_row.base_amount, v_row.base_amount, v_row.promised_amount,
      NULL::integer, v_delivered, NULL::boolean,
      format('No promise was recorded at the %s level, so the normal amount applies.', v_scope)::text;
    RETURN;
  END IF;

  v_met := v_delivered >= v_row.promised_count;

  RETURN QUERY SELECT
    v_scope,
    v_row.id,
    CASE WHEN v_met THEN v_row.promised_amount ELSE v_row.base_amount END,
    v_row.base_amount,
    v_row.promised_amount,
    v_row.promised_count,
    v_delivered,
    v_met,
    CASE
      WHEN v_scope = 'course' AND v_met THEN
        format('This course''s own promise of %s learners was met (%s delivered), so the promised amount applies.',
               v_row.promised_count, v_delivered)
      WHEN v_scope = 'course' THEN
        format('This course''s own promise of %s learners was missed (%s delivered), so the normal amount applies. Keeping the yearly promise does not rescue this course.',
               v_row.promised_count, v_delivered)
      WHEN v_met THEN
        format('No promise was recorded for this course, so the yearly promise decides. It was met (%s of %s), so the promised amount applies.',
               v_delivered, v_row.promised_count)
      ELSE
        format('No promise was recorded for this course, so the yearly promise decides. It was missed (%s of %s), so the normal amount applies.',
               v_delivered, v_row.promised_count)
    END::text;
END;
$$;

COMMENT ON FUNCTION public.fn_resolve_consultant_course_rate(integer, uuid, uuid, uuid) IS
  'Rules 13/16/17/20: resolves ONE learner''s pre-tax per-learner referral amount from the consultant''s own promise rows, always within ONE institution (p_institution_id) — a consultant may refer into several colleges and each college''s promise is its own. Course promise judged alone (rule 20); falls back to the yearly row; returns NULL (not 0) when no rate is set. Delivered counts ignore attendance holds on purpose, and exclude learners with no admission year — see the migration header.';

-- Mandatory anon lockdown, in the same file as the CREATE (CLAUDE.md).
REVOKE EXECUTE ON FUNCTION public.fn_resolve_consultant_course_rate(integer, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_consultant_course_rate(integer, uuid, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — money is gated to READ and admin-only to WRITE
-- ─────────────────────────────────────────────────────────────────────────────
-- The four policies this table already carries (commission_structures_select /
-- _insert / _update / _delete, read live from pg_policy, all PERMISSIVE) let
-- any user in the owning institution, and any holder of the `admission`
-- role_key, both READ and WRITE these rows. Now that the rows carry rupee
-- amounts and promises, that is too wide in BOTH directions.
--
-- PERMISSIVE policies are OR-ed together, so adding a narrower PERMISSIVE
-- policy would WIDEN access, not narrow it. Every narrowing below is therefore
-- a RESTRICTIVE policy: the request must ALSO satisfy it, whatever the existing
-- permissive policies allow.
--
-- READ — and a correction. An earlier revision of this file left SELECT
-- untouched and justified it with "the existing select policy already matches
-- the sibling screens". THAT WAS FALSE, and the difference is the whole risk:
--
--   commission_structures_select  =  institution_id = auth_institution_id()
--                                 OR profiles.role = 'super_admin'
--                                 OR user_roles → custom_roles.role_key = 'admission'
--
--     Its FIRST branch is bare institution membership with no permission check
--     of any kind, and 7,640 of 7,664 profiles carry an institution_id.
--
--   referral_rate_config_read     =  is_super_admin() OR is_admin()
--                                 OR user_has_permission('admission.consultants.commissions.view')
--
-- This screen reads the table through the browser anon key that ships in every
-- Next.js bundle, so without the policy below any signed-in member of the
-- owning institution could replay the screen's own query and read base_amount,
-- promised_amount, promised_count and the clawback configuration. The table
-- holds 0 rows in production today, so nothing has leaked — it would have armed
-- itself the moment the first amount was entered.
--
-- The expression below is referral_rate_config_read's, verbatim. It is also the
-- exact gate fn_resolve_consultant_course_rate applies to itself above and the
-- permission the Promises & Rates tab now guards on, so the screen, the RPC and
-- the table can no longer disagree about who may see money.
ALTER TABLE public.consultant_commission_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_structures_money_read_gated ON public.consultant_commission_structures;
CREATE POLICY commission_structures_money_read_gated
  ON public.consultant_commission_structures
  AS RESTRICTIVE
  FOR SELECT
  USING (is_super_admin()
         OR is_admin()
         OR user_has_permission('admission.consultants.commissions.view'));

-- WRITE — setting a rupee amount or a promise is admin-only, matching the write
-- policy already live on referral_rate_config (is_super_admin() OR is_admin()).
DROP POLICY IF EXISTS commission_structures_money_write_admin_only ON public.consultant_commission_structures;
CREATE POLICY commission_structures_money_write_admin_only
  ON public.consultant_commission_structures
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS commission_structures_money_update_admin_only ON public.consultant_commission_structures;
CREATE POLICY commission_structures_money_update_admin_only
  ON public.consultant_commission_structures
  AS RESTRICTIVE
  FOR UPDATE
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS commission_structures_money_delete_admin_only ON public.consultant_commission_structures;
CREATE POLICY commission_structures_money_delete_admin_only
  ON public.consultant_commission_structures
  AS RESTRICTIVE
  FOR DELETE
  USING (is_super_admin() OR is_admin());
