-- =====================================================================
-- Migration: instasolver_substrate_v2
-- Created:   2026-12-13
-- Spec:      specs/instasolver-2026-09-14.md (locked decisions I1–I10)
-- Supersedes: supabase/migrations/20261103000000_instasolver_substrate.sql
--
-- WHY THIS FILE EXISTS — the premise of 20261103000000 was reversed.
--
-- That file was never applied to production. Verified 2026-09-14: every
-- object it creates 404s from PostgREST, and types/supabase.ts (generated
-- from the live database) carries neither grievance_tickets.issue_type nor
-- any requirement_requests table. Nothing in it ran, so nothing in it has to
-- be undone — the file is simply replaced.
--
-- It proposed two things the Director reversed by phone interview on
-- 2026-09-14 (specs/instasolver-2026-09-14.md):
--
--   1. BROKEN THINGS INTO grievance_tickets, tagged with a new `issue_type`
--      column. The harm: NOTHING reads issue_type. The dashboard route
--      (app/api/b2a/grievance/dashboard/route.ts), the grievance service
--      (lib/services/grievance/grievance-service.ts) and the HOD metrics SQL
--      (20260722200000_hod_metrics_add_overdue_ages.sql) all COUNT(*) the
--      whole table. Every broken ceiling fan would therefore have been
--      counted as a learner grievance in the NAAC and UGC exports —
--      automatically, because 20260422_grievance_evidence_emission_trigger.sql
--      writes quality_evidence_mappings rows on ticket closure. Four test
--      tickets had already produced 8 such rows.
--      Decision I4: broken things go to Campus Walk (project_tasks under
--      CAMPUS-OPS) instead. grievance_tickets stays complaints-only, so the
--      accreditation numbers stay honest.
--
--   2. A requirement_requests ISLAND — its own categories, votes, voting
--      config, history and approval thresholds, with no link to the
--      Procurement module that already handles purchasing.
--      Decision I3/I5: purchases go to Procurement. The only piece worth
--      keeping is the approval TIERS, which move here as
--      procurement_approval_thresholds so the Procurement approval chain can
--      read them.
--
-- WHAT THIS FILE KEEPS from 20261103000000 (verbatim where possible):
--   - grievance_categories.allow_anonymous            (I7: anonymous filing)
--     NOTE: it DEFAULTS TO TRUE, so on apply every grievance category that
--     already exists becomes anonymous-capable. That is deliberate and it is
--     the Director's decision I7 — asked whether anonymous filing should be
--     allowed everywhere or only on sensitive categories, he chose the
--     broadest option. There is NO per-category opt-in step to perform after
--     this migration; switching a category OFF is the exception, not the
--     enrolment. Stated here because a `boolean NOT NULL DEFAULT true` on an
--     existing table reads like a harmless additive column and is not one.
--   - grievance_tickets.migrated_from_subdomain
--     + legacy_external_id                            (I9: old-site import)
--   - fn_track_issue_by_token()                       (I7: private tracking code)
--   - the corrected grievance_tickets RLS policies    (the ICC fix)
--   - the delegating-wrapper replacement for the old
--     notification generator name (never DROP FUNCTION — see section 6)
--
-- WHAT THIS FILE DROPS ENTIRELY (never applied, so nothing is lost):
--   issue_type · requirement_id · requirement_status · requirement_categories
--   · requirement_requests · requirement_history · requirement_votes
--   · requirement_voting_config · requirement_approval_thresholds
--   · issue_sla_config · issue_escalation_rules · the three requirement
--   platform_policies seeds · the issue_type filter on the notification
--   generator (that function is left exactly as production has it).
--
-- WHAT THIS FILE ADDS:
--   - public.procurement_approval_thresholds — the tier table from I5,
--     same shape as the abandoned requirement_approval_thresholds, seeded
--     HOD ≤ ₹10,000 · principal ₹10,000.01–50,000 · super_admin above.
--     Bounds are paise-exact so the bands are contiguous — see section 3b.
--   - two platform_policies rows: the I8 complaint-about-your-own-superior
--     route target, and the I6 voting threshold.
--
-- SAFETY POSTURE — this file is additive by construction:
--   - no DROP TABLE, no DROP COLUMN, no TRUNCATE, no DELETE anywhere
--   - every DDL guarded by IF NOT EXISTS / DO $$ blocks; safe to re-run
--   - pgcrypto lives in the extensions schema on this project, so
--     SECURITY DEFINER functions carry `extensions` in search_path
--
-- THIS FILE OPENS NO TRANSACTION OF ITS OWN. THAT IS DELIBERATE — DO NOT ADD
-- `BEGIN;` / `COMMIT;` BACK.
--
-- It is still applied atomically: every applier wraps it. scripts/ship-wave/
-- apply-migrations.sh runs each file twice — once as `BEGIN; <file>; ROLLBACK;`
-- for a dry run, then as `BEGIN; <file>; COMMIT;` to apply — and
-- `supabase db push` wraps each file the same way.
--
-- An earlier revision of this file carried its own BEGIN/COMMIT, and that
-- silently destroys the dry run. Proven in psql 16.14 on these exact bytes:
-- the inner `BEGIN;` warns "there is already a transaction in progress" and is
-- ignored, the inner `COMMIT;` commits the APPLIER's transaction, and the
-- applier's trailing `ROLLBACK;` then warns "there is no transaction in
-- progress" and rolls back nothing. The rehearsal reports clean having already
-- applied every statement in the file, permanently, with no way to take it
-- back. Not a style preference — a self-nullifying safety net.
-- =====================================================================

-- Inside the applier's transaction, so LOCAL is the right scope and it is
-- released at COMMIT/ROLLBACK. Section 2 takes ACCESS EXCLUSIVE on
-- grievance_tickets to add two columns; without a timeout that ALTER queues
-- behind any long-running reader and every subsequent query on the table
-- queues behind the ALTER, which is how a two-column migration stalls the
-- grievance module. Fail in 5 seconds and retry instead.
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- 1. ALTER grievance_categories — add allow_anonymous
--    (I7: per-category anonymous filing override)
--    KEPT VERBATIM from 20261103000000 section 3.
-- ---------------------------------------------------------------------
ALTER TABLE public.grievance_categories
  ADD COLUMN IF NOT EXISTS allow_anonymous boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.grievance_categories.allow_anonymous IS
  'Per-category override: when true, anonymous filing UI is shown for this category. When false, filer must be authenticated. Default true (backward-compatible — UGC §5(b) anonymous default).';

-- ---------------------------------------------------------------------
-- 2. ALTER grievance_tickets — the two old-site import markers ONLY
--
-- issue_type and requirement_id are deliberately NOT added. See the header:
-- nothing reads issue_type, so a discriminator on this table cannot keep
-- non-complaints out of the NAAC and UGC counts — it would only make them
-- look separated while they were counted together.
-- ---------------------------------------------------------------------
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS migrated_from_subdomain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_external_id      text;

CREATE INDEX IF NOT EXISTS idx_grievance_tickets_legacy_external
  ON public.grievance_tickets (legacy_external_id)
  WHERE legacy_external_id IS NOT NULL;

COMMENT ON COLUMN public.grievance_tickets.migrated_from_subdomain IS
  'Set TRUE for complaint tickets imported from instasolver.jkkn.ac.in (I9 cutover). Used by cutover dashboards. Only complaints are imported into this table — broken-thing reports from the old site go to Campus Walk project_tasks.';
COMMENT ON COLUMN public.grievance_tickets.legacy_external_id IS
  'Original ID from instasolver.jkkn.ac.in. Used by 301-redirect ?legacy_id=<x> lookups during the cutover window (I9).';

-- ---------------------------------------------------------------------
-- 3. CREATE procurement_approval_thresholds
--
-- I5: a purchase raised by any user clears a tiered approval before it
-- becomes a Procurement Purchase Request. These are those tiers. Same
-- shape as the abandoned requirement_approval_thresholds — LIKE
-- approval_authority_config plus the two amount-band columns — so the
-- tier semantics survive the module move unchanged.
--
-- This table configures the chain; it does not hold requests. The request
-- itself lands in procurement_purchase_requests, which Procurement owns.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_approval_thresholds
  (LIKE public.approval_authority_config INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING COMMENTS);

ALTER TABLE public.procurement_approval_thresholds
  ADD COLUMN IF NOT EXISTS min_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_amount numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'procurement_approval_thresholds_institution_id_fkey') THEN
    ALTER TABLE public.procurement_approval_thresholds
      ADD CONSTRAINT procurement_approval_thresholds_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'procurement_approval_thresholds.institution_id not present after LIKE — skipping FK';
END $$;

COMMENT ON TABLE public.procurement_approval_thresholds IS
  'Budget approval tiers for InstaSolver purchase requests (I5), by approval_authority + amount band. Shape cloned from approval_authority_config plus min/max_amount. Defaults: HOD ≤ ₹10,000, principal ₹10,000.01–50,000, super_admin above ₹50,000. Bounds are paise-exact because the columns are numeric(12,2) and the chain builder matches budget BETWEEN min_amount AND max_amount — integer boundaries would leave every amount in 10000.01-10000.99 and 50000.01-50000.99 matching no tier at all. institution_id NULL = platform-wide; per-institution rows override. Read by lib/services/issues/approval-chain-service.ts. Procurement''s own super-admin approval on procurement_purchase_requests sits AFTER this chain, not instead of it.';

COMMENT ON COLUMN public.procurement_approval_thresholds.min_amount IS
  'Inclusive lower bound for this tier, in rupees. 0 = no lower limit.';
COMMENT ON COLUMN public.procurement_approval_thresholds.max_amount IS
  'Inclusive upper bound for this tier, in rupees. NULL = no upper limit (highest tier).';

ALTER TABLE public.procurement_approval_thresholds ENABLE ROW LEVEL SECURITY;

-- READ — the chain builder runs as the filer, so any signed-in user must be
-- able to read the bands that apply to them. That is the platform-wide rows
-- (institution_id IS NULL), which are shared by design, plus their own
-- college's overrides. It is NOT every college's overrides: a per-institution
-- row says what one college's principal may approve and up to what amount, and
-- a plain `auth.role() = 'authenticated'` would have published all 8 colleges'
-- spending authority to every signed-in user at every other college. Scoped
-- with the same role_has_institution_access() the grievance policies below use.
--
-- auth.role() is wrapped in a scalar sub-select for the same INITPLAN reason
-- spelled out at section 4: it is a per-row CONSTANT, so unwrapped it is
-- re-evaluated once per row. role_has_institution_access(institution_id) is
-- deliberately NOT wrapped — it takes a per-row column and is not a constant.
DROP POLICY IF EXISTS "procurement_approval_thresholds_select" ON public.procurement_approval_thresholds;
CREATE POLICY "procurement_approval_thresholds_select" ON public.procurement_approval_thresholds FOR SELECT
USING (
  (SELECT auth.role()) = 'authenticated'
  AND (
    institution_id IS NULL
    OR role_has_institution_access(institution_id)
  )
);

DROP POLICY IF EXISTS "procurement_approval_thresholds_manage" ON public.procurement_approval_thresholds;
CREATE POLICY "procurement_approval_thresholds_manage" ON public.procurement_approval_thresholds FOR ALL
USING ((SELECT is_super_admin()))
WITH CHECK ((SELECT is_super_admin()));

-- ANON LOCK — required by scripts/ci/check-table-anon-revoke.mjs, and required
-- on the merits. Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
-- ALL ON TABLES TO anon, authenticated, service_role`, so this table is born
-- with SELECT/INSERT/UPDATE/DELETE granted to the anon key embedded in every
-- page of https://www.jkkn.ai unless the grant is taken back here. The RLS above
-- is not a substitute: the grant is the door, the policy is the lock on the rows
-- behind it. These rows say who may approve spending and up to what amount.
--
-- `authenticated` keeps all four verbs deliberately. The RLS policies, not the
-- grants, are what separate reader from writer on this table: every signed-in
-- user's chain builder SELECTs these bands, and the manage policy already
-- restricts INSERT/UPDATE/DELETE to is_super_admin(). Granting SELECT alone
-- would lock the super_admin out of the table its own policy is written for.
REVOKE ALL ON TABLE public.procurement_approval_thresholds FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.procurement_approval_thresholds TO authenticated;
GRANT  ALL ON TABLE public.procurement_approval_thresholds TO service_role;

-- ---------------------------------------------------------------------
-- 3b. SEED the three platform-wide tiers (I5)
--
-- NOT `ON CONFLICT (approval_authority, institution_id) DO NOTHING`, which
-- is what 20261103000000 used and what SQL_FILE_INDEX.md already flags as a
-- defect in that file: institution_id is NULL in all three rows, PostgreSQL
-- treats NULLs as DISTINCT in a unique constraint, so the conflict never
-- fires and a second run silently duplicates all three tiers. Duplicated
-- tiers would duplicate approval steps in every chain built from them.
-- WHERE NOT EXISTS is NULL-correct and therefore actually idempotent.
--
-- BANDS ARE CONTIGUOUS TO THE PAISE. The Director's numbers are unchanged —
-- HOD up to ₹10,000, principal up to ₹50,000, super_admin above — but the
-- columns are numeric(12,2) and the chain builder matches with
-- `budget >= min_amount AND budget <= max_amount`, so the obvious integer
-- boundaries 10000 / 10001 and 50000 / 50001 leave a one-rupee hole a hundred
-- paise wide at each step. ₹10,000.50 and ₹50,000.01 fell into neither band,
-- matched no tier, and produced an EMPTY approval chain — which read as
-- "approved by nobody" all the way through. The lower bound of each upper band
-- is therefore one paisa above the ceiling below it, not one rupee. Every
-- non-negative amount ROUNDED TO 2 DP lands in exactly one of these three
-- bands. Two caveats, both deliberate. (a) 2 dp is the resolution that matters
-- because these columns ARE numeric(12,2); the service rounds the requested
-- amount to 2 dp before matching, so a sub-paise input like 50000.005 cannot
-- fall between two contiguous bands. (b) "exactly one" holds for THESE bands
-- because they do not overlap. A per-institution override that widens one band
-- into its neighbour's range makes both match, and the chain then STACKS both
-- approvers in ascending order — which is the safe direction, since widening a
-- band can only add an approver, never remove one. The two boundary
-- amounts are covered by a unit test
-- (__tests__/services/issues/approval-chain-service.test.ts).
-- ---------------------------------------------------------------------
INSERT INTO public.procurement_approval_thresholds
  (approval_authority, institution_id, escalate_after_days, fallback_role, is_active, min_amount, max_amount)
SELECT v.approval_authority, v.institution_id, v.escalate_after_days, v.fallback_role, v.is_active, v.min_amount, v.max_amount
FROM (VALUES
  ('hod',         NULL::uuid, 7,  'principal',   true, 0::numeric,        10000::numeric),
  ('principal',   NULL::uuid, 10, 'super_admin', true, 10000.01::numeric, 50000::numeric),
  ('super_admin', NULL::uuid, 14, 'super_admin', true, 50000.01::numeric, NULL::numeric)
) AS v(approval_authority, institution_id, escalate_after_days, fallback_role, is_active, min_amount, max_amount)
WHERE NOT EXISTS (
  SELECT 1 FROM public.procurement_approval_thresholds t
  WHERE t.approval_authority = v.approval_authority
    AND t.institution_id IS NOT DISTINCT FROM v.institution_id
);

-- ---------------------------------------------------------------------
-- 4. RLS — recreate grievance_tickets policies WITH the ICC fix
--
-- READ THIS AGAINST PRODUCTION, NOT AGAINST 20261103000000.
--
-- An earlier draft of this comment described these policies as "correcting two
-- defects". That was written against the never-applied v1 file and it was
-- WRONG about production. The live policy, read back from the database on
-- 2026-07-31 and recorded verbatim at rls_initplan_wrap_sweep.sql:2058, is:
--
--   grievance_tickets_select USING (
--     is_super_admin() OR is_admin()
--     OR raised_by_id  = auth.uid()
--     OR assigned_to   = auth.uid()
--     OR filed_by      = auth.uid()
--     OR (user_has_permission('grievance.tickets.view')
--         AND role_has_institution_access(institution_id)))
--
-- Every branch is at TOP LEVEL and there is NO is_icc_only branch at all.
-- Three consequences, stated plainly because each one is the opposite of what
-- the earlier comment claimed:
--
--   1. THE raised_by_id "HOIST" IS A NO-OP. raised_by_id is already top level
--      live. No complainant has ever lost sight of her own case in production;
--      that was only true of the v1 file, which never ran. Keeping the clause
--      at top level here preserves live behaviour exactly.
--
--   2. THE ICC BRANCH IS A NEW ACCESS PATH, NOT A LEAK CLOSURE. Production has
--      no is_icc_only branch, so no icc_member reads anything today by virtue
--      of that role. Adding `is_icc_only = true AND role_has_institution_access
--      AND EXISTS(icc_member)` GRANTS read to that college's committee. It
--      closes nothing, because there was nothing open.
--
--   3. assigned_to, filed_by AND user_has_permission('grievance.tickets.view')
--      ARE DEMOTED. They move from top level into the `is_icc_only = false`
--      branch. On an ICC-only row the assignee, the proxy filer, and every
--      holder of grievance.tickets.view therefore LOSE read unless they are
--      also an institution-scoped icc_member. That is a REMOVAL of access from
--      three sets of people, not a tightening of a leak.
--
-- The behaviour is intended and is kept: an ICC complaint should be readable by
-- that college's committee and the complainant, and by nobody else — which is
-- the confidentiality rule stated as an access rule. It is safe to ship now
-- because production holds ZERO rows with is_icc_only = true, so the demotion
-- removes access from nobody today; it constrains who gains it tomorrow. Each
-- demotion is listed as its own risk line in the pull request.
--
-- ICC role check uses the existing role registry shape
-- (custom_roles.role_key='icc_member' joined via user_roles), matching the
-- proven pattern from supabase/migrations/20260429_counselor_routing_config.sql.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "grievance_tickets_select" ON public.grievance_tickets;
-- INITPLAN DISCIPLINE — every per-row-CONSTANT call below is wrapped in a
-- scalar sub-select, so PostgreSQL evaluates it once per query instead of once
-- per row. This is not decoration: the platform-wide sweep of 2026-07-31
-- (supabase/migrations/rls_initplan_wrap_sweep.sql, applied to production, bare
-- auth.uid() policies 1,273 -> 1) already wrapped the LIVE grievance_tickets
-- policies, and that file records the live text at line 2058. Recreating these
-- policies with bare calls would silently undo that sweep for this table.
-- role_has_institution_access(institution_id) is deliberately NOT wrapped — it
-- takes a per-row column, so it is not a per-row constant. The sweep left it
-- unwrapped for the same reason.
CREATE POLICY "grievance_tickets_select" ON public.grievance_tickets FOR SELECT
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  -- (2) The complainant always sees her own case. UNCHANGED FROM PRODUCTION —
  -- this clause is already top level live, so this line is a no-op restatement,
  -- kept deliberately so the rewrite cannot lose it.
  -- Anonymous rows are unaffected: raised_by_id IS NULL there, and
  -- NULL = (SELECT auth.uid()) evaluates to NULL, never TRUE. Their access path is
  -- fn_track_issue_by_token() below.
  OR raised_by_id = (SELECT auth.uid())
  -- (1) ICC-only tickets: that college's committee, and no other. NEW ACCESS
  -- PATH — production has no is_icc_only branch, so this GRANTS read to
  -- institution-scoped icc_members on confidential rows. It is scoped with
  -- role_has_institution_access from the outset so the grant never crosses a
  -- college boundary; it is not repairing an existing cross-college leak,
  -- because the branch it would have leaked through does not exist live.
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  -- Non-ICC-only tickets: the three branches production carries at TOP LEVEL,
  -- DEMOTED into this `is_icc_only = false` arm. This is the access removal
  -- named as consequence 3 above, and it is deliberate:
  --   * assigned_to — a handler who is not on that college's committee should
  --     not read a confidential complaint merely because it was assigned to
  --     them. For an ICC-only row the assignee must ALSO be an icc_member of
  --     that institution.
  --   * filed_by — this column is writable on an existing row, so leaving it
  --     at top level would let a complainant editing her own open ICC ticket
  --     hand a third party read access to it.
  --   * user_has_permission('grievance.tickets.view') — the whole point of an
  --     ICC-only flag is that the ordinary view permission stops being enough.
  -- Nobody loses access on the day this applies: production holds zero
  -- is_icc_only = true rows.
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())         -- assignee sees their queue
      OR filed_by = (SELECT auth.uid())         -- proxy filer sees what they filed
      OR (
        (SELECT user_has_permission('grievance.tickets.view'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
);

-- INSERT, UPDATE, DELETE policies — recreate with the same ICC clause
-- structure where relevant.
DROP POLICY IF EXISTS "grievance_tickets_insert" ON public.grievance_tickets;
CREATE POLICY "grievance_tickets_insert" ON public.grievance_tickets FOR INSERT
WITH CHECK (
  -- Wrapped, matching the LIVE policy text at rls_initplan_wrap_sweep.sql:2058
  -- (`( SELECT auth.role() AS role) = 'authenticated'`). An earlier draft of
  -- this file recreated it BARE, which would have silently undone the
  -- 2026-07-31 initplan sweep for this table's insert path.
  (SELECT auth.role()) = 'authenticated'
  -- Filers can mark a ticket is_icc_only at filing time (sensitive
  -- categories like SH/harassment auto-flag this via service layer).
  -- ICC restriction enforced on SELECT/UPDATE/DELETE, not INSERT —
  -- otherwise filers could not file ICC tickets at all.
);

DROP POLICY IF EXISTS "grievance_tickets_update" ON public.grievance_tickets;
CREATE POLICY "grievance_tickets_update" ON public.grievance_tickets FOR UPDATE
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  -- (2) The complainant can still act on her own case while it is open.
  -- UNCHANGED FROM PRODUCTION, which carries exactly
  -- `(raised_by_id = auth.uid() AND status = 'open')` at top level. What she
  -- may actually change on that row is NOT enforced by RLS and never was —
  -- see section 5, which adds a BEFORE UPDATE trigger for it.
  OR (raised_by_id = (SELECT auth.uid()) AND status IN ('open'))
  -- (1) ICC-only tickets: that college's committee only (super_admin handled
  -- by the first branch as break-glass). NEW ACCESS PATH, exactly as in the
  -- SELECT policy — production has no is_icc_only branch, so this grants
  -- update to institution-scoped icc_members rather than repairing a leak.
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  -- Non-ICC-only: the branches production carries at TOP LEVEL, DEMOTED here.
  -- On an ICC-only row the assignee and every holder of
  -- grievance.tickets.edit therefore LOSE update unless they are also an
  -- institution-scoped icc_member. Same intent and same justification as the
  -- SELECT demotion above, and same reason it is safe to ship today: zero
  -- is_icc_only = true rows exist in production. Listed as its own risk line
  -- in the pull request.
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())
      OR (
        (SELECT user_has_permission('grievance.tickets.edit'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
)
WITH CHECK (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  OR raised_by_id = (SELECT auth.uid())
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())
      OR (
        (SELECT user_has_permission('grievance.tickets.edit'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "grievance_tickets_delete" ON public.grievance_tickets;
CREATE POLICY "grievance_tickets_delete" ON public.grievance_tickets FOR DELETE
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  -- Tickets should be withdrawn (status=withdrawn), not deleted.
  -- Delete is reserved for super-admin/admin cleanup of test/spam data.
  -- No is_icc_only branch and no identity branch exist here, so the ICC
  -- changes made to the SELECT and UPDATE policies above have no equivalent
  -- in this one. Left byte-for-byte unchanged, deliberately.
);

-- ---------------------------------------------------------------------
-- 4b. WHAT THE RAISER MAY ACTUALLY CHANGE — fn_grievance_raiser_update_guard
--
-- RLS says WHO may update a row. It does not say WHICH COLUMNS, and on this
-- table that gap is load-bearing. The live UPDATE policy (and the recreated one
-- above, unchanged in this respect) lets the raiser update her own row while
-- status = 'open', with a WITH CHECK of bare `raised_by_id = auth.uid()`. No
-- column guard anywhere. So today, in production, a complainant can:
--
--   * set is_icc_only = true on her own open ticket. With the ICC branch added
--     above, that instantly strips read AND update from the assignee, the proxy
--     filer and every holder of grievance.tickets.view, leaving only
--     institution-scoped icc_members and super_admin. A complainant can lock
--     the handling staff out of her own case.
--
--   * set status = 'resolved' herself. That fires the closure trigger in
--     20260422_grievance_evidence_emission_trigger.sql, which writes
--     quality_evidence_mappings rows — NAAC 7.7.1 and the UGC grievance
--     return. A self-closed complaint becomes accreditation evidence with no
--     staff member ever having looked at it. This whole migration exists
--     because those counts have to be honest; leaving this open would
--     contradict its own reason for existing.
--
--   * reassign it (assigned_to), re-file it under someone else (filed_by),
--     move it to another college (institution_id) or another category
--     (category_id).
--
-- Both are PRE-EXISTING live, not introduced here. They are fixed here because
-- this PR recreates the policy whose gap they live in.
--
-- Two objects, on purpose. The decision is a PURE FUNCTION over (old, new,
-- actor_is_privileged) so it can be unit-tested in the verification block
-- below: `SET ROLE` and `set_config('request.jwt.claims', …)` are not
-- available in a migration, so a trigger that reads auth.uid() cannot be
-- exercised here, but a pure function taking the actor's privilege as an
-- argument can be. The trigger is the thin wrapper that resolves the actor and
-- calls it.
--
-- Not SECURITY DEFINER: it needs no privilege of its own, it only compares two
-- row versions. Nothing is revoked — a trigger function is not callable as an
-- RPC by virtue of being a trigger, and the helper is harmless to call.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_grievance_raiser_change_allowed(
  p_old                  public.grievance_tickets,
  p_new                  public.grievance_tickets,
  p_actor_is_privileged  boolean
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $raiser_guard$
DECLARE
  v_allowed_status text[] := ARRAY['open', 'withdrawn'];
BEGIN
  -- Privileged actors (super_admin / admin / icc_member) are not constrained
  -- here at all; RLS already decided they may write this row.
  IF p_actor_is_privileged THEN
    RETURN NULL;
  END IF;

  -- Columns the raiser may never touch on her own ticket.
  IF coalesce(p_new.is_icc_only, false) IS DISTINCT FROM coalesce(p_old.is_icc_only, false) THEN
    RETURN 'is_icc_only';
  END IF;
  IF p_new.assigned_to IS DISTINCT FROM p_old.assigned_to THEN
    RETURN 'assigned_to';
  END IF;
  IF p_new.filed_by IS DISTINCT FROM p_old.filed_by THEN
    RETURN 'filed_by';
  END IF;
  IF p_new.institution_id IS DISTINCT FROM p_old.institution_id THEN
    RETURN 'institution_id';
  END IF;
  IF p_new.category_id IS DISTINCT FROM p_old.category_id THEN
    RETURN 'category_id';
  END IF;
  IF p_new.raised_by_id IS DISTINCT FROM p_old.raised_by_id THEN
    RETURN 'raised_by_id';
  END IF;

  -- Status: she may leave it alone or withdraw. She may not resolve or close
  -- her own complaint, because that is what emits accreditation evidence.
  IF p_new.status IS DISTINCT FROM p_old.status
     AND NOT (p_new.status = ANY (v_allowed_status)) THEN
    RETURN 'status';
  END IF;

  -- Anything else (description, subject, attachments, the timestamps the app
  -- maintains) is hers to edit.
  RETURN NULL;
END;
$raiser_guard$;

COMMENT ON FUNCTION public.fn_grievance_raiser_change_allowed(public.grievance_tickets, public.grievance_tickets, boolean) IS
  'Returns NULL when the proposed change is allowed, or the NAME of the first forbidden column when it is not. Pure and IMMUTABLE so it is unit-testable without a session identity — the trigger fn_grievance_raiser_update_guard resolves the actor and calls this. A non-privileged raiser may edit her own open ticket''s free text and withdraw it; she may not change is_icc_only, assigned_to, filed_by, institution_id, category_id or raised_by_id, and may not set status to anything but open or withdrawn (resolving it would emit NAAC/UGC evidence for a complaint no staff member ever handled).';

CREATE OR REPLACE FUNCTION public.fn_grievance_raiser_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $raiser_trigger$
DECLARE
  v_actor       uuid := auth.uid();
  v_privileged  boolean;
  v_blocked     text;
BEGIN
  -- Only the raiser acting on her own row is constrained. Staff writes are
  -- governed by RLS and by the app.
  IF v_actor IS NULL OR OLD.raised_by_id IS NULL OR OLD.raised_by_id <> v_actor THEN
    RETURN NEW;
  END IF;

  v_privileged := coalesce(public.is_super_admin(), false)
               OR coalesce(public.is_admin(), false)
               OR EXISTS (
                    SELECT 1
                    FROM public.user_roles ur
                    JOIN public.custom_roles cr ON ur.role_id = cr.id
                    WHERE ur.user_id = v_actor
                      AND cr.role_key = 'icc_member'
                  );

  v_blocked := public.fn_grievance_raiser_change_allowed(OLD, NEW, v_privileged);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'grievance_tickets.% cannot be changed by the person who raised the ticket (ticket %). Allowed edits: the complaint text, and status -> withdrawn. Changing is_icc_only would lock the handling staff out of the case; changing status to resolved or closed would emit NAAC/UGC accreditation evidence for a complaint nobody handled.',
      v_blocked, OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$raiser_trigger$;

COMMENT ON FUNCTION public.fn_grievance_raiser_update_guard() IS
  'BEFORE UPDATE on grievance_tickets. Constrains ONLY the person who raised the ticket, and only when she is not super_admin / admin / icc_member. Delegates the decision to fn_grievance_raiser_change_allowed() so the rule is unit-testable. Closes a pre-existing gap: RLS says who may update a row, never which columns, and the raiser branch of grievance_tickets_update carries a bare raised_by_id check.';

DROP TRIGGER IF EXISTS trg_grievance_raiser_update_guard ON public.grievance_tickets;
CREATE TRIGGER trg_grievance_raiser_update_guard
  BEFORE UPDATE ON public.grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_grievance_raiser_update_guard();

-- ---------------------------------------------------------------------
-- 5. ANONYMOUS FILER'S TRACKING CODE (I7)
--    KEPT VERBATIM from 20261103000000 section 14b.
--
-- (3) An anonymous complaint has no account attached: raised_by_id IS NULL,
-- so hoisting `raised_by_id = auth.uid()` in the SELECT policy above does
-- NOT give an anonymous filer her own case back. Her only handle is the
-- anonymous_token issued at filing time. Today that token is WRITTEN by
-- lib/services/grievance/grievance-service.ts and READ by nothing at all —
-- she receives a code that does not work anywhere.
--
-- A table-level RLS policy cannot serve this: the token arrives in a URL
-- path, not in a JWT, and widening grievance_tickets to the `anon` role at
-- all would be the wrong shape. A narrow SECURITY DEFINER function is the
-- access path instead — it bypasses RLS by design and returns only the
-- columns below, so the surface is fixed at definition time rather than
-- left to whatever the calling route happens to select.
--
-- (4) Status and progress ONLY. Returned: the ticket's own number and the
-- subject she wrote, where it has got to, and `resolution` — the message
-- written FOR her. Deliberately NOT returned: metadata and attachments
-- (internal committee working notes live there), assigned_to (naming the
-- handler of a harassment case to an unauthenticated caller is itself a
-- disclosure), institution/department/category ids, and every raised_by_*
-- column. resolution_letter_pdf_url is also withheld: serving that file
-- needs a signed URL the route must mint, and this migration does not set
-- storage policy.
--
-- Rate limiting is NOT enforced here. The /track/<token> route must apply a
-- per-IP ceiling; a bare token lookup is otherwise enumerable. That ceiling
-- is seeded as a platform policy by the PR that ships the route, not by this
-- one — this file seeds only the two policies decisions I6 and I8 name.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_track_issue_by_token(p_token text)
RETURNS TABLE (
  ticket_number text,
  subject       text,
  status        text,
  created_at    timestamptz,
  assigned_at   timestamptz,
  resolved_at   timestamptz,
  withdrawn_at  timestamptz,
  resolution    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn_track$
  SELECT
    gt.ticket_number::text,
    gt.subject::text,
    gt.status::text,
    gt.created_at,
    gt.assigned_at,
    gt.resolved_at,
    gt.withdrawn_at,
    gt.resolution::text
  FROM public.grievance_tickets gt
  WHERE gt.is_anonymous = true
    AND gt.anonymous_token IS NOT NULL
    AND gt.anonymous_token = p_token
    -- TOKEN SHAPES THE GUARD ACCEPTS, as of 2026-09-14:
    --   * the only minter in the tree today is
    --     lib/services/grievance/grievance-service.ts:120, which mints
    --     'anon_' || crypto.randomUUID() — 41 characters, 122 bits of entropy.
    --   * a longer 32-character, 64-symbol token (192 bits) is planned for the
    --     InstaSolver complaint lane. NOT PRESENT IN THIS TREE — no
    --     lib/instasolver/complaint.ts exists on this branch or on jicate/main,
    --     so nothing mints one yet. The `LIKE 'anon\_%'` + length >= 20 guard
    --     below is written to accept both, so the minter can land without
    --     touching this function.
    -- Until that minter ships, every live token is the 122-bit one. The shape
    -- guard stops a blank or truncated value being probed at all; it is not the
    -- entropy defence, the UUID is.
    AND p_token LIKE 'anon\_%'
    AND length(coalesce(p_token, '')) >= 20
  LIMIT 1;
$fn_track$;

COMMENT ON FUNCTION public.fn_track_issue_by_token(text) IS
  'Status lookup for an anonymously filed InstaSolver complaint, keyed on anonymous_token (I7). Returns at most one row and only filer-facing fields (number, subject, status, the four progress timestamps, and the resolution message written for her) — never committee notes, attachments, handler identity or any raised_by_* column. SECURITY DEFINER because the filer is unauthenticated and has no RLS identity. NOT granted to anon: the /track/<token> route must call this with a service-role client. Rate limiting is the caller''s job, not this function''s. Callers on unauthenticated-public routes must enforce issues.anonymous_track.rate_limit_per_hour; callers behind the platform login gate may rely on that gate plus token entropy. Entropy today is 122 bits (every live token is grievance-service''s ''anon_'' || crypto.randomUUID()); the guard also accepts the planned 32-character 64-symbol 192-bit token, which nothing in the tree mints yet. The shape guard rejects a blank or truncated value before any lookup.';

-- GRANT POSTURE — deliberately service_role, NOT anon.
--
-- Criterion (b) of scripts/ci/check-secdef-anon-revoke.mjs would accept an
-- explicit `GRANT ... TO anon` here as an intentional-public RPC, but that
-- guard's own header sets the bar: treat a lookup as intentional-public only
-- if you can NAME the unauthenticated caller. There is no /track/<token>
-- route under app/ yet — this migration ships substrate and the route is a
-- follow-up — so naming one would be a fiction, and the fn_get_policy*
-- incident recorded in that header is what happens when the box is ticked
-- anyway.
--
-- Granting anon now would also put a live public RPC on production with no
-- consumer and with no rate limit enforced anywhere. service_role keeps the
-- lookup server-side — which is how the existing unauthenticated
-- policy-reading routes in this codebase already work.
--
-- If the tracking page is later meant to query straight from the browser,
-- widening this to anon is a one-line change; it belongs in the same PR as
-- the route that enforces the limit, not ahead of it.
REVOKE ALL ON FUNCTION public.fn_track_issue_by_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_track_issue_by_token(text) TO service_role;

-- ---------------------------------------------------------------------
-- 6. SEED platform_policies — the two rows decisions I6 and I8 name
--
-- Schema: (policy_key, scope_type, scope_id, value jsonb, description,
--          data_type). data_type is NOT NULL with NO default and its CHECK
-- admits only number | string | boolean | array | object | enum
-- (20260429000002_platform_policies_substrate.sql:21).
--
-- CONFLICT TARGET: uniqueness on this table is the EXPRESSION index
--   uq_platform_policies_key_scope
--     (policy_key, scope_type, COALESCE(scope_id, '000…0'::uuid))
-- A bare (policy_key, scope_type, scope_id) target cannot be inferred
-- against an expression index and raises 42P10 — which aborts this whole
-- transaction. The COALESCE form below is what
-- 20261102030000_campus_walk_reporters_policy.sql and 66 other migration
-- files already use.
--
-- DO NOTHING, not DO UPDATE: re-running this file must never clobber a
-- value an admin has since changed in the UI.
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, description, data_type)
VALUES
  ('instasolver.complaint.superior_route_to',
   'global', NULL,
   to_jsonb('583f39e2-8334-4028-ba72-e4aadfdf7483'::text),
   'Profile id that receives an InstaSolver complaint whose subject is the filer''s own reporting superior (I8). Seeded to Isvarya Lakshmi, Joint MD. Held as configuration, not a hardcoded address, so redirecting this route is an admin edit rather than a deploy. If the row is absent the routing code must fall back to super_admin — it must never route the complaint to the person complained about.',
   'string'),

  ('instasolver.purchase.vote_threshold_amount',
   'global', NULL,
   to_jsonb(50000.01),
   'Rupee amount at or above which an InstaSolver purchase request goes to a vote before its approval chain runs (I6). Seeded at ₹50,000.01 — one paisa above the principal tier''s ₹50,000 ceiling, so it means exactly the spec''s "> ₹50,000" and lines up with where the super_admin band starts — the Director''s stated default of "only for big-ticket items" until he sets a different amount. Below this amount the tiered approval in procurement_approval_thresholds runs on its own.',
   'number')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. NOTIFICATION GENERATOR RENAME — unresolved_grievance → unresolved_issue
--
-- KEPT from 20261103000000 section 18, MINUS the issue_type filter. The
-- function body below is production's fn_generate_unresolved_grievance_items
-- made config-driven; it selects the same rows production selects today, and
-- no issue_type column is referenced anywhere, because none is created.
--
-- The old signature is deliberately NOT dropped.
-- fn_generate_unresolved_grievance_items() is live in production and has a
-- caller: fn_generate_all_dashboard_work_items() invokes it as
--   BEGIN r8 := fn_generate_unresolved_grievance_items();
--   EXCEPTION WHEN OTHERS THEN e8 := SQLERRM; END;
-- (20260428_hr_command_center_brief_digest.sql:164, and both definitions of
-- the orchestrator in supabase/setup/02_functions.sql, lines 10145 and 10220).
-- That handler swallows the error into a jsonb field nobody reads, so
-- dropping the function would stop grievance work items appearing on
-- dashboards permanently while surfacing nothing to a human — the dashboards
-- would simply go quiet. The old name is kept below as a thin delegating
-- wrapper instead, added after the new function exists.
-- ---------------------------------------------------------------------

-- Rename the config row in place. No issue_type_filter key is added — there
-- is no such column to filter on.
UPDATE public.notification_generator_config
SET generator_name = 'unresolved_issue',
    updated_at = now()
WHERE generator_name = 'unresolved_grievance';

CREATE OR REPLACE FUNCTION public.fn_generate_unresolved_issue_items()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn_issue$
DECLARE
  v_created INT := 0; v_griev RECORD; v_key TEXT; v_target UUID;
  v_priority TEXT; v_hours_past_sla INT;
  v_cfg JSONB;
  v_category TEXT;
  v_statuses TEXT[];
  v_max_age_days INT;
  v_batch_limit INT;
  v_urgent_when_emergency BOOLEAN;
  v_urgent_when_escalation_gte INT;
  v_high_when_escalation_eq INT;
  v_high_when_hours_past_sla_gt INT;
  v_ttl_urgent_hours INT;
  v_ttl_normal_hours INT;
  v_fallback_to_director BOOLEAN;
BEGIN
  v_cfg := fn_get_generator_config('unresolved_issue', '{
    "category": "dashboard:approval",
    "statuses": ["open","assigned","in_progress","escalated"],
    "max_age_days": 90,
    "batch_limit": 50,
    "trigger_conditions": ["sla_deadline_breached","escalation_level_gt_0","is_emergency"],
    "filters": {"withdrawn_at_is_null": true, "resolved_at_is_null": true},
    "priority_overrides": {
      "urgent_when_is_emergency": true,
      "urgent_when_escalation_gte": 2,
      "high_when_escalation_eq": 1,
      "high_when_hours_past_sla_gt": 24
    },
    "ttl_hours": {"urgent_or_escalation_gte_2": 4, "normal": 24},
    "fallback_to_director": true
  }'::jsonb);

  v_category             := COALESCE(v_cfg->>'category', 'dashboard:approval');
  v_statuses             := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'statuses')),
                              ARRAY['open','assigned','in_progress','escalated']
                            );
  v_max_age_days         := COALESCE((v_cfg->>'max_age_days')::INT, 90);
  v_batch_limit          := COALESCE((v_cfg->>'batch_limit')::INT, 50);
  v_urgent_when_emergency      := COALESCE((v_cfg->'priority_overrides'->>'urgent_when_is_emergency')::BOOLEAN, true);
  v_urgent_when_escalation_gte := COALESCE((v_cfg->'priority_overrides'->>'urgent_when_escalation_gte')::INT, 2);
  v_high_when_escalation_eq    := COALESCE((v_cfg->'priority_overrides'->>'high_when_escalation_eq')::INT, 1);
  v_high_when_hours_past_sla_gt := COALESCE((v_cfg->'priority_overrides'->>'high_when_hours_past_sla_gt')::INT, 24);
  v_ttl_urgent_hours     := COALESCE((v_cfg->'ttl_hours'->>'urgent_or_escalation_gte_2')::INT, 4);
  v_ttl_normal_hours     := COALESCE((v_cfg->'ttl_hours'->>'normal')::INT, 24);
  v_fallback_to_director := COALESCE((v_cfg->>'fallback_to_director')::BOOLEAN, true);

  FOR v_griev IN
    SELECT id, ticket_number, subject, description, institution_id,
           priority, status, sla_deadline, sla_status, escalation_level,
           is_emergency, assigned_to,
           CASE WHEN sla_deadline IS NOT NULL
                THEN EXTRACT(EPOCH FROM (NOW() - sla_deadline))/3600
                ELSE 0 END AS hours_past_sla
    FROM public.grievance_tickets
    WHERE status = ANY(v_statuses)
      AND created_at > NOW() - make_interval(days => v_max_age_days)
      AND (sla_deadline < NOW() OR escalation_level > 0 OR is_emergency = TRUE)
      AND withdrawn_at IS NULL
      AND resolved_at IS NULL
    ORDER BY escalation_level DESC NULLS LAST, sla_deadline ASC NULLS LAST
    LIMIT v_batch_limit
  LOOP
    IF v_fallback_to_director THEN
      v_target := COALESCE(v_griev.assigned_to, fn_resolve_dashboard_target(v_griev.institution_id));
    ELSE
      v_target := v_griev.assigned_to;
    END IF;
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_hours_past_sla := v_griev.hours_past_sla::INT;
    v_priority := CASE
      WHEN v_urgent_when_emergency AND v_griev.is_emergency THEN 'urgent'
      WHEN v_griev.escalation_level >= v_urgent_when_escalation_gte THEN 'urgent'
      WHEN v_griev.escalation_level = v_high_when_escalation_eq THEN 'high'
      WHEN v_hours_past_sla > v_high_when_hours_past_sla_gt THEN 'high'
      ELSE 'normal'
    END;
    -- Dedupe key and URL are production's, unchanged. Changing either would
    -- double-post every open ticket for one day across the deploy window
    -- (new key = new work item) and point the link at a route that does not
    -- exist. Both are the caller's concern to change, together, later.
    v_key := 'grievance_ticket:' || v_griev.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      v_category, v_priority,
      'Grievance ' || v_griev.ticket_number || ' — ' || LEFT(v_griev.subject, 80),
      LEFT(v_griev.description, 140) ||
        CASE WHEN v_griev.escalation_level > 0 THEN ' | escalated L' || v_griev.escalation_level::text ELSE '' END ||
        CASE WHEN v_griev.sla_deadline < NOW() THEN ' | SLA breached ' || v_hours_past_sla::text || 'h' ELSE '' END ||
        CASE WHEN v_griev.assigned_to IS NULL THEN ' | UNASSIGNED, routed to Director' ELSE '' END,
      jsonb_build_object(
        'grievance_id',     v_griev.id,
        'ticket_number',    v_griev.ticket_number,
        'escalation_level', v_griev.escalation_level,
        'sla_breached',     (v_griev.sla_deadline < NOW()),
        'is_emergency',     v_griev.is_emergency,
        'unassigned_fallback', v_griev.assigned_to IS NULL,
        'url', '/grievances/' || v_griev.id::text
      ),
      v_target, v_key,
      CASE
        WHEN v_griev.is_emergency OR v_griev.escalation_level >= v_urgent_when_escalation_gte
          THEN v_ttl_urgent_hours
        ELSE v_ttl_normal_hours
      END
    );
  END LOOP;
  RETURN v_created;
END $fn_issue$;

REVOKE ALL ON FUNCTION public.fn_generate_unresolved_issue_items() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_generate_unresolved_issue_items() IS
  'Renamed from fn_generate_unresolved_grievance_items (InstaSolver substrate v2). Generates dashboard work items for unresolved complaint tickets. Reads policy from notification_generator_config(name=unresolved_issue); selects exactly the rows the pre-rename function selected — there is no issue_type discriminator on grievance_tickets and this function does not filter on one. Wired into fn_generate_all_dashboard_work_items via the compatibility wrapper below.';

-- ---------------------------------------------------------------------
-- 7b. COMPATIBILITY WRAPPER for the old function name.
--
-- fn_generate_all_dashboard_work_items() still calls the old name inside an
-- EXCEPTION WHEN OTHERS handler, so a missing function there is silent. This
-- keeps the name resolvable and delegates to the renamed implementation, so
-- the orchestrator's r8 slot keeps producing grievance work items with no
-- change to the caller.
--
-- CREATE OR REPLACE (not CREATE) so this is a no-op-shaped rewrite of the
-- function that already exists in production. RETURNS INT matches the live
-- signature exactly (supabase/setup/02_functions.sql:10072-10073) — a return
-- type change would be rejected rather than applied.
--
-- The grant posture of the original is re-asserted below rather than assumed:
-- 20260817030000 measured this family on production and recorded
-- fn_generate_unresolved_grievance_items as postgres | service_role with no
-- `authenticated` grant, and supabase/setup/02_functions.sql:10128 declares
-- the same. Replacing a function does not reset its ACL, but stating it here
-- means a later re-run of the 155-name loop in
-- 20260605191101_revoke_platform_rpcs_anon_access.sql cannot quietly widen it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_unresolved_grievance_items()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn_griev_compat$
  SELECT public.fn_generate_unresolved_issue_items();
$fn_griev_compat$;

REVOKE ALL ON FUNCTION public.fn_generate_unresolved_grievance_items() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_generate_unresolved_grievance_items() IS
  'DEPRECATED compatibility wrapper (InstaSolver substrate v2). Delegates to fn_generate_unresolved_issue_items(). Kept because fn_generate_all_dashboard_work_items() calls this name inside an EXCEPTION WHEN OTHERS handler, so dropping it would stop grievance work items reaching dashboards silently. Retire together with the orchestrator rewire.';

-- ---------------------------------------------------------------------
-- 8. VERIFICATION BLOCK
--
-- RAISE EXCEPTION, not NOTICE: this file is one transaction, so a failed
-- check rolls the whole thing back rather than leaving half a substrate.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_policy_rows INT;
  v_tier_rows   INT;
BEGIN
  -- The two policy rows decisions I6 and I8 name must both be present.
  SELECT COUNT(*) INTO v_policy_rows
  FROM public.platform_policies
  WHERE policy_key IN (
    'instasolver.complaint.superior_route_to',
    'instasolver.purchase.vote_threshold_amount'
  );
  IF v_policy_rows < 2 THEN
    RAISE EXCEPTION 'instasolver_substrate_v2 verification failed: expected 2 platform_policies rows (I6, I8), found %', v_policy_rows;
  END IF;

  -- Exactly three platform-wide approval tiers, not six. A duplicate set
  -- would duplicate every approval step built from them.
  SELECT COUNT(*) INTO v_tier_rows
  FROM public.procurement_approval_thresholds
  WHERE institution_id IS NULL;
  IF v_tier_rows <> 3 THEN
    RAISE EXCEPTION 'instasolver_substrate_v2 verification failed: expected exactly 3 platform-wide procurement_approval_thresholds tiers, found % (a duplicate seed would duplicate approval steps)', v_tier_rows;
  END IF;

  -- The compatibility wrapper must exist, or dashboards go quiet in silence.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_generate_unresolved_grievance_items'
  ) THEN
    RAISE EXCEPTION 'instasolver_substrate_v2 verification failed: compatibility wrapper fn_generate_unresolved_grievance_items() is absent — fn_generate_all_dashboard_work_items() would silently stop emitting grievance work items';
  END IF;

  -- The anonymous filer's only access path.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_track_issue_by_token'
  ) THEN
    RAISE EXCEPTION 'instasolver_substrate_v2 verification failed: fn_track_issue_by_token() is absent — anonymous tracking codes would be issued with no reader';
  END IF;

  -- Nothing in this file may create the reversed-premise objects.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'grievance_tickets'
      AND column_name IN ('issue_type', 'requirement_id')
  ) THEN
    RAISE EXCEPTION 'instasolver_substrate_v2 verification failed: grievance_tickets carries issue_type or requirement_id. Decision I4 keeps non-complaints out of this table entirely — with no reader for the discriminator, every broken-thing row would be counted as a grievance in the NAAC and UGC exports';
  END IF;

  RAISE NOTICE 'instasolver_substrate_v2: verification passed';
END $$;

-- ---------------------------------------------------------------------
-- 8b. UNIT TEST for the raiser guard's decision function.
--
-- Runs at apply time, inside the applier's transaction, and RAISES if the rule
-- is wrong — so a broken guard cannot reach production quietly. The rule is
-- tested through the pure function rather than the trigger because a migration
-- has no session identity to impersonate: SET ROLE and
-- set_config('request.jwt.claims', …) are not available here, which is exactly
-- why the decision was factored out of the trigger in the first place.
--
-- Two synthetic rows, never inserted. Composite-typed local variables, so this
-- touches no table and leaves nothing behind.
-- ---------------------------------------------------------------------
DO $guard_test$
DECLARE
  v_old public.grievance_tickets;
  v_new public.grievance_tickets;
  v_got text;
  v_fail text[] := ARRAY[]::text[];
  v_fn   text   := 'fn_grievance_raiser_change_allowed';
BEGIN
  v_old.id             := '00000000-0000-0000-0000-0000000000aa'::uuid;
  v_old.raised_by_id   := '00000000-0000-0000-0000-0000000000bb'::uuid;
  v_old.status         := 'open';
  v_old.is_icc_only    := false;
  v_old.description    := 'the tap on the second floor leaks';

  -- 1. Editing her own complaint text is allowed.
  v_new := v_old;
  v_new.description := 'the tap on the second floor leaks badly now';
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS NOT NULL THEN
    v_fail := v_fail || format('editing description should be allowed, got %L', v_got);
  END IF;

  -- 2. Withdrawing her own complaint is allowed.
  v_new := v_old;
  v_new.status := 'withdrawn';
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS NOT NULL THEN
    v_fail := v_fail || format('status -> withdrawn should be allowed, got %L', v_got);
  END IF;

  -- 3. Resolving her own complaint is BLOCKED — this is the one that would
  --    emit NAAC/UGC evidence for a complaint nobody handled.
  v_new := v_old;
  v_new.status := 'resolved';
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS DISTINCT FROM 'status' THEN
    v_fail := v_fail || format('status -> resolved must be blocked on status, got %L', v_got);
  END IF;

  -- 4. Closing it is blocked for the same reason.
  v_new := v_old;
  v_new.status := 'closed';
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS DISTINCT FROM 'status' THEN
    v_fail := v_fail || format('status -> closed must be blocked on status, got %L', v_got);
  END IF;

  -- 5. Flipping is_icc_only is BLOCKED — this is the one that locks the
  --    handling staff out of her case.
  v_new := v_old;
  v_new.is_icc_only := true;
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS DISTINCT FROM 'is_icc_only' THEN
    v_fail := v_fail || format('is_icc_only flip must be blocked, got %L', v_got);
  END IF;

  -- 6. Reassignment, re-filing, moving college or category: all blocked.
  v_new := v_old; v_new.assigned_to := '00000000-0000-0000-0000-0000000000cc'::uuid;
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS DISTINCT FROM 'assigned_to' THEN
    v_fail := v_fail || format('assigned_to change must be blocked, got %L', v_got);
  END IF;

  v_new := v_old; v_new.filed_by := '00000000-0000-0000-0000-0000000000cc'::uuid;
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS DISTINCT FROM 'filed_by' THEN
    v_fail := v_fail || format('filed_by change must be blocked, got %L', v_got);
  END IF;

  v_new := v_old; v_new.institution_id := '00000000-0000-0000-0000-0000000000dd'::uuid;
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS DISTINCT FROM 'institution_id' THEN
    v_fail := v_fail || format('institution_id change must be blocked, got %L', v_got);
  END IF;

  v_new := v_old; v_new.category_id := '00000000-0000-0000-0000-0000000000ee'::uuid;
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, false);
  IF v_got IS DISTINCT FROM 'category_id' THEN
    v_fail := v_fail || format('category_id change must be blocked, got %L', v_got);
  END IF;

  -- 7. A PRIVILEGED actor is not constrained by this function at all — the
  --    committee must be able to resolve and to flag confidentiality.
  v_new := v_old;
  v_new.status := 'resolved';
  v_new.is_icc_only := true;
  v_got := public.fn_grievance_raiser_change_allowed(v_old, v_new, true);
  IF v_got IS NOT NULL THEN
    v_fail := v_fail || format('privileged actor must be unconstrained, got %L', v_got);
  END IF;

  IF array_length(v_fail, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'instasolver_substrate_v2 verification failed: % rule(s) wrong in %: %',
      array_length(v_fail, 1), v_fn, array_to_string(v_fail, ' | ');
  END IF;

  RAISE NOTICE 'instasolver_substrate_v2: raiser-guard unit test passed (10 cases)';
END $guard_test$;

-- No COMMIT here, deliberately. See the SAFETY POSTURE note in the header.
