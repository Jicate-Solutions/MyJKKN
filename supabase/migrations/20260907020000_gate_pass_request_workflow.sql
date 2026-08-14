-- ============================================================================
-- 2026-09-07 — A gate pass can be REQUESTED, then approved or rejected
--
-- ⚠️ NOT APPLIED — FILE ONLY. This migration has not been run against
--    production. Apply it deliberately, with the verification at the foot.
--
-- WHAT IS BROKEN TODAY
-- --------------------
-- /campus-living/gate-passes opens on a "Pending" tab. That tab is the DEFAULT
-- landing view for every warden (page.tsx: useState(learnerId ? 'all' : 'pending')).
-- It has a count card, a tab badge, an Approve button and a Reject button with
-- a reason dialog. It can never show a single row, and neither button can ever
-- do anything, because the request half of the workflow writes to a vocabulary
-- this table does not have:
--
--   • GatePassService.requestGatePass writes status = 'requested'.
--     public.gate_pass_status_enum is EXACTLY
--       issued | active | returned | overdue | cancelled
--     (20260222000015 line 134). There is no 'requested' and no 'rejected',
--     so every submit dies on 22P02 before it reaches a constraint.
--
--   • The same insert omits pass_number, qr_code and approved_by — all three
--     NOT NULL with no default (20260222000015 lines 564/572/574). Even with
--     the enum fixed, the insert would then die on 23502. A pass that has only
--     been ASKED for has no number, no QR and no approver; the NOT NULLs
--     encode an assumption that a pass springs into existence already issued.
--
--   • requestGatePass writes `reason`; rejectGatePass writes `rejected_by` +
--     `rejection_reason`; cancelGatePass writes `cancelled_by` +
--     `cancellation_reason`. None of those five are columns → PGRST204.
--
--   • getPendingRequests filters .eq('status','requested'), so the Pending tab
--     returns [] forever — an empty queue and a broken queue look identical.
--
-- WHY COMPLETE IT RATHER THAN DELETE IT
-- -------------------------------------
-- The workflow was designed and half-built; only the storage was never made.
-- Four independent pieces of the estate already assume it exists:
--   1. lib/constants/permissions.ts:1966-1968 registers
--      `campus_living.gate_passes.create`  labelled "Request Gate Pass",
--      `campus_living.gate_passes.approve` labelled "Approve Gate Pass",
--      `campus_living.gate_passes.reject`  labelled "Reject Gate Pass".
--   2. 20260531093000 added an INSERT policy lane built for exactly this:
--      (user_has_permission('campus_living.gate_passes.create')
--       AND learner_id = auth.uid()) — a resident inserting their OWN row,
--      which only makes sense for a request awaiting somebody's approval.
--   3. 20260531090100 added the matching read lane, `.view_own`.
--   4. my-hostel/_components/requests-tab.tsx renders a "Request Gate Pass"
--      button to the resident.
-- The 2026-08-06 permission audit quoted in 20260903041500 counts 12 holders
-- of `.reject`. Twelve people hold a key to a decision the database cannot
-- record. Retiring the workflow would mean deleting three permission keys, two
-- RLS lanes, a resident CTA and the default tab of the staff page.
--
-- THE POSTGRES CONSTRAINT, AND HOW THIS FILE HANDLES IT
-- -----------------------------------------------------
-- ALTER TYPE ... ADD VALUE has two well-known traps:
--   (a) before PostgreSQL 12 it could not run inside a transaction block at
--       all; and
--   (b) on every version to date, the NEW value cannot be USED in the same
--       transaction that added it ("unsafe use of new value of enum type").
-- Supabase runs PostgreSQL 15+, so (a) does not apply here. (b) does, and it
-- is handled by construction rather than by hoping: **no statement in this
-- file ever casts 'requested' or 'rejected' to gate_pass_status_enum.**
--   • The CHECK constraint below is written on the four statuses that ALREADY
--     exist ('issued','active','returned','overdue') and expresses the new
--     rule as their negation, so it never names a new label.
--   • The verification block compares pg_enum.enumlabel as TEXT.
-- Consequence, stated so nobody has to discover it: this file is safe to
-- rehearse inside BEGIN ... ROLLBACK, exactly like its siblings. Had the CHECK
-- been written as `status IN ('requested','rejected', ...)` the rehearsal
-- would have aborted with 55000 and the migration would only work when run
-- unwrapped — a difference that shows up on production and not in review.
--
-- WHY THE NOT NULLs BECOME A CHECK INSTEAD OF JUST GOING AWAY
-- -----------------------------------------------------------
-- pass_number, qr_code and approved_by must stay guaranteed for a pass that
-- has actually been issued — the guard's scan screen looks a pass up BY
-- qr_code and BY pass_number. Dropping the NOT NULLs outright would let an
-- issued pass exist with no QR and nothing would complain until a guard tried
-- to scan it at midnight. So the invariant is not deleted, it is moved to
-- where it is actually true: not "always", but "once the pass is issued".
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- -----------------------------------
-- `reached_home_at`, `reached_home_confirmed_by`, `left_home_at` and
-- `left_home_confirmed_by` are written by GatePassService.confirmReachedHome /
-- confirmLeftHome and are ALSO not columns. They are the parent-confirmation
-- feature, not the request workflow, and both functions are dead code today
-- (useConfirmReachedHome / useConfirmLeftHome have zero callers anywhere in
-- app/, components/ or hooks/). They are reported, not silently swept in.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. The two statuses the workflow needs
--    Ordered inside the enum so ORDER BY status reads as the lifecycle:
--    requested → issued → active → returned → overdue → cancelled → rejected.
-- ─────────────────────────────────────────────────────────────────────
ALTER TYPE public.gate_pass_status_enum ADD VALUE IF NOT EXISTS 'requested' BEFORE 'issued';
ALTER TYPE public.gate_pass_status_enum ADD VALUE IF NOT EXISTS 'rejected'  AFTER  'cancelled';

-- ─────────────────────────────────────────────────────────────────────
-- 2. The columns the request / reject / cancel statements already write
-- ─────────────────────────────────────────────────────────────────────
-- Why the learner is asking to leave. Shown in the Pending tab's "Reason"
-- column, which currently renders '--' for every row it can never load.
ALTER TABLE public.hostel_gate_passes ADD COLUMN IF NOT EXISTS reason TEXT;

-- Set when a warden rejects. rejection_reason is mandatory in the UI (the
-- Reject button is disabled until the dialog's textarea is non-blank), so a
-- rejected request always carries an explanation the learner can read.
ALTER TABLE public.hostel_gate_passes ADD COLUMN IF NOT EXISTS rejected_by       UUID;
ALTER TABLE public.hostel_gate_passes ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- Set when a pass or request is withdrawn. 'cancelled' is already a live enum
-- value; only the two columns naming who and why were missing.
ALTER TABLE public.hostel_gate_passes ADD COLUMN IF NOT EXISTS cancelled_by        UUID;
ALTER TABLE public.hostel_gate_passes ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- No FK on rejected_by / cancelled_by: they mirror approved_by,
-- gate_security_out and gate_security_in, which are all bare UUIDs on this
-- table (20260222000015). Adding a constraint to three of six actor columns
-- and not the rest would be a worse inconsistency than the one it fixes.

-- ─────────────────────────────────────────────────────────────────────
-- 3. A request is not an issued pass
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.hostel_gate_passes ALTER COLUMN pass_number  DROP NOT NULL;
ALTER TABLE public.hostel_gate_passes ALTER COLUMN qr_code      DROP NOT NULL;
ALTER TABLE public.hostel_gate_passes ALTER COLUMN approved_by  DROP NOT NULL;

-- pass_number keeps its UNIQUE index. PostgreSQL treats NULLs as distinct, so
-- any number of pending requests can coexist while every issued pass still has
-- a unique number.

-- The invariant the three NOT NULLs used to carry, re-stated where it is true.
-- Written as a negation of the four PRE-EXISTING statuses so it never casts a
-- label added by this same file (see the header).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.hostel_gate_passes'::regclass
       AND conname  = 'hostel_gate_passes_issued_pass_is_complete'
  ) THEN
    ALTER TABLE public.hostel_gate_passes
      ADD CONSTRAINT hostel_gate_passes_issued_pass_is_complete
      CHECK (
        status NOT IN ('issued', 'active', 'returned', 'overdue')
        OR (pass_number IS NOT NULL AND qr_code IS NOT NULL AND approved_by IS NOT NULL)
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. The people who may approve and reject must be able to WRITE
-- ─────────────────────────────────────────────────────────────────────
-- The live UPDATE policy (captured in rls_initplan_wrap_sweep.sql line 2324)
-- admits exactly one permission: `campus_living.gate_passes.edit`. The
-- 2026-08-06 audit measured ZERO holders of it, while 12 people hold
-- `.reject`. So even with the enum and the columns in place, every Approve and
-- Reject click would update 0 rows and report success — the CAC failure mode
-- (a decision gated on a key almost nobody holds) reproduced on the gate.
--
-- WIDENING, STATED ON PURPOSE: RLS cannot scope an UPDATE to particular
-- columns, so admitting `.approve` / `.reject` here lets those holders update
-- any column of a gate-pass row in their own institution — not only the status.
-- That is coherent with the job (a warden who may approve a pass also records
-- returns) and is strictly narrower than the is_admin() lane already present.
-- It is written down rather than discovered later.
--
-- The `( SELECT fn() )` wrapping is deliberate and must be preserved: it is
-- what rls_initplan_wrap_sweep.sql exists to enforce, so the permission
-- functions are evaluated once per query rather than once per row.
DROP POLICY IF EXISTS hostel_gate_passes_update_permission ON public.hostel_gate_passes;
CREATE POLICY hostel_gate_passes_update_permission ON public.hostel_gate_passes
FOR UPDATE
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  OR ((SELECT user_has_permission('campus_living.gate_passes.edit')) AND role_has_institution_access(institution_id))
  OR ((SELECT user_has_permission('campus_living.gate_passes.approve')) AND role_has_institution_access(institution_id))
  OR ((SELECT user_has_permission('campus_living.gate_passes.reject')) AND role_has_institution_access(institution_id))
)
WITH CHECK (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  OR ((SELECT user_has_permission('campus_living.gate_passes.edit')) AND role_has_institution_access(institution_id))
  OR ((SELECT user_has_permission('campus_living.gate_passes.approve')) AND role_has_institution_access(institution_id))
  OR ((SELECT user_has_permission('campus_living.gate_passes.reject')) AND role_has_institution_access(institution_id))
);

-- No SECURITY DEFINER function is created, replaced or altered by this file,
-- so there is no EXECUTE grant to re-assert. The permission functions it
-- names (is_super_admin, is_admin, user_has_permission,
-- role_has_institution_access) already exist and are untouched.

-- ─────────────────────────────────────────────────────────────────────
-- 5. Read it back. Do not trust a silent success.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
  v_labels  text[];
  v_pol     text;
BEGIN
  -- Enum labels, compared as TEXT so nothing casts a value added above.
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO v_labels
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'gate_pass_status_enum';

  IF NOT ('requested' = ANY(v_labels)) THEN
    RAISE EXCEPTION 'gate_pass_status_enum is still missing ''requested'' — the Pending tab would stay empty. Labels: %', v_labels;
  END IF;
  IF NOT ('rejected' = ANY(v_labels)) THEN
    RAISE EXCEPTION 'gate_pass_status_enum is still missing ''rejected'' — the Reject button would stay dead. Labels: %', v_labels;
  END IF;

  -- Columns.
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
    FROM unnest(ARRAY['reason','rejected_by','rejection_reason','cancelled_by','cancellation_reason']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'hostel_gate_passes' AND column_name = c
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'hostel_gate_passes is still missing: %', v_missing;
  END IF;

  -- Nullability.
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_missing
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'hostel_gate_passes'
     AND column_name IN ('pass_number','qr_code','approved_by')
     AND is_nullable = 'NO';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'still NOT NULL, so a request can never be inserted: %', v_missing;
  END IF;

  -- The invariant that replaced them.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.hostel_gate_passes'::regclass
       AND conname  = 'hostel_gate_passes_issued_pass_is_complete'
  ) THEN
    RAISE EXCEPTION 'the issued-pass CHECK is absent — an issued pass could exist with no QR code';
  END IF;

  -- The write lane. Read through pg_policies (the public catalog view, which
  -- already renders the expression as text) rather than pg_catalog.pg_policy,
  -- so the check cannot fail on catalog privileges at apply time.
  SELECT qual INTO v_pol
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'hostel_gate_passes'
     AND policyname = 'hostel_gate_passes_update_permission';

  IF v_pol IS NULL THEN
    RAISE EXCEPTION 'hostel_gate_passes_update_permission is gone — nobody can approve anything';
  END IF;
  IF position('campus_living.gate_passes.approve' IN v_pol) = 0
     OR position('campus_living.gate_passes.reject' IN v_pol) = 0
     OR position('campus_living.gate_passes.edit'   IN v_pol) = 0 THEN
    RAISE EXCEPTION 'the UPDATE policy lost a lane. It must admit edit AND approve AND reject. Now: %', v_pol;
  END IF;

  RAISE NOTICE 'Gate-pass request workflow storage is in place.';
END $$;

-- ============================================================================
-- THEN VERIFY BEHAVIOURALLY, NOT STRUCTURALLY
--
-- The block above proves the objects exist. It does not prove the workflow
-- runs. Objects have verified perfectly on this estate while behaviour stayed
-- broken. Sign in as a real resident (NOT a super admin — that identity
-- bypasses every predicate above and makes a dead screen look finished),
-- submit a gate-pass request, then sign in as a warden holding
-- `campus_living.gate_passes.approve`, confirm the request is listed on the
-- Pending tab, approve it, and check the pass now carries a pass_number and a
-- qr_code. Then scan that QR at /campus-living/gate-passes/scan.
--
-- Two coverage facts to expect: `campus_living.gate_passes.edit` had ZERO
-- holders as of 2026-08-06, and 20260903041500 (which grants it to
-- gate_security / warden / chief_warden) is itself still FILE ONLY. If the
-- warden you test with holds neither `.edit` nor `.approve`, the Approve
-- button will do nothing and that is a grant gap, not a defect in this file.
-- ============================================================================
