-- ============================================================================
-- 2026-09-12 — Gate-pass rebuild: learner applies, warden decides, gate scans
--
-- WHY NOW
-- -------
-- hostel_gate_passes holds ZERO rows, as do hostel_access_log,
-- hostel_leave_requests and pp_gate_passes. Nothing has ever run through this
-- subsystem, so there is no data to migrate and no behaviour to preserve.
-- This is the cheapest moment the storage will ever be reshaped.
--
-- WHAT THE FLOW BECOMES
-- ---------------------
--   1. A hostel learner applies: leave type (from hostel_leave_types, the same
--      list /campus-living/settings/policies-workflows configures), reason,
--      destination, out date+time, return date+time, mode of transport, person
--      accompanying, and an attachment when the chosen type demands one.
--   2. A warden opens the request, reads a dossier auto-fetched from the
--      learner record, calls the parent, and approves or rejects.
--   3. Gate security scans the learner's PERMANENT MyJKKN QR — the one already
--      rendered in the top navbar by components/identity/jkkn-qr-dialog.tsx —
--      and the out / in times record themselves.
--
-- THREE MEASURED BLOCKERS THIS FILE CLOSES OR DOCUMENTS
-- -----------------------------------------------------
-- (a) `student` does NOT hold campus_living.leave_types.view, and
--     hostel_leave_types' SELECT policy requires it. Without the grant below
--     the learner's type dropdown renders EMPTY WITH NO ERROR. Granted here.
--
-- (b) `gate_security` does NOT hold campus_living.gate_passes.create, and
--     role_has_block_access() returns false for anyone with no user_block_access
--     row — estate-wide that is 12 grants across 5 users. hostel_access_log's
--     INSERT policy requires BOTH. A browser-side audit-log write is therefore
--     guaranteed to be refused. NOT fixed by widening the grant: the gate
--     movement moves to a service-role server route
--     (app/api/campus-living/gate-passes/scan) where the caller's permission is
--     checked in reviewed TypeScript instead. Nothing about hostel_access_log's
--     policies changes here.
--
-- (c) learner-hostelite-service.ts selects `in_time, purpose` off this table.
--     Neither is a column (verified: ERROR 42703). That is a code fix, not a
--     schema one — the columns are NOT being invented to accommodate it.
--
-- NO BEGIN/COMMIT IN THIS FILE. scripts/apply-migration-file.mjs ships the body
-- through public.exec_sql(), which EXECUTEs inside a function; an explicit
-- transaction block there is a syntax error. It is still atomic — the whole
-- file runs in one PostgREST request transaction and exec_sql's own EXCEPTION
-- handler rolls it back before reporting {ok:false}.
--
-- NO ENUM CHANGES. gate_pass_status_enum already carries all seven labels
-- (requested, issued, active, returned, overdue, cancelled, rejected) — verified
-- live. 20260907020000 IS applied despite its "NOT APPLIED — FILE ONLY" header.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. The columns the new flow writes
-- ─────────────────────────────────────────────────────────────────────

-- The type, from settings. Replaces pass_type (see section 2): a hard-coded
-- 4-value enum could never express the 16 policy-bearing types each institution
-- already configures.
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS leave_type_id uuid REFERENCES public.hostel_leave_types(id);

-- Stamped from the learner's active allocation at request time.
--
-- STORED, NOT ENFORCED. It exists so the gate's audit-log write has the NOT
-- NULL value hostel_access_log.block_id demands, and so block-scoped queues
-- remain possible later. It is deliberately absent from every policy below: a
-- block grant is a SCOPE, and ANDing it with institution access is how the
-- allocations screen silently emptied itself for every warden who owned no
-- block.
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES public.hostel_blocks(id);

-- Planned departure. expected_return (already NOT NULL) stays the single
-- due-back timestamp — the scan's lateness maths, the Morning Page exception
-- engine, the dashboard card and the overdue query all read it, and giving them
-- a second column to disagree with would be the whole bug.
-- The form shows three inputs (out date+time, return date, return time); they
-- compose into these two timestamps.
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS planned_out_at timestamptz;

ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS transport_mode      text;
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS accompanying_person text;
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS attachment_url      text;

-- WHEN a decision was taken. approved_by / rejected_by record only WHO, which
-- is why the detail page's timeline has never been able to date an approval —
-- it refused to date it from updated_at, which the row's trigger moves on every
-- single write.
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- The warden's phone call to the parent, recorded. Advisory, not a gate: a
-- parent who cannot be reached must not make a decision impossible, so the
-- approve dialog SHOWS this and does not require it.
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS parent_confirmed_at     timestamptz;
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS parent_confirmed_by     uuid REFERENCES public.profiles(id);
-- Which number was actually dialled. A learner has three on file (student,
-- father, mother); "a parent was called" without saying which one is not a
-- record anybody can act on later.
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS parent_confirmed_number text;

-- ─────────────────────────────────────────────────────────────────────
-- 2. pass_type retires in place
-- ─────────────────────────────────────────────────────────────────────
-- leave_type_id becomes the classification every screen reads. pass_type and
-- gate_pass_type_enum are NOT dropped: the public API surface at
-- /api/api-management/campus-living/gate-passes accepts and returns the column,
-- and breaking a published contract to delete an unused column is a bad trade.
-- It simply stops being required, and nothing in the UI writes it.
ALTER TABLE public.hostel_gate_passes ALTER COLUMN pass_type DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. The issued-pass invariant, minus the QR
-- ─────────────────────────────────────────────────────────────────────
-- 20260907020000 moved "an issued pass has a number, a QR and an approver" off
-- three NOT NULLs and onto a CHECK. The QR limb is now wrong: the gate scans
-- the learner's PERMANENT MyJKKN identity QR, not a per-pass code, so
-- qr_code stops being generated at all. Requiring a value nothing writes would
-- make approval fail with 23514 on the very first request.
--
-- pass_number and approved_by keep their guarantee — an issued pass still has a
-- human reference and a named approver.
ALTER TABLE public.hostel_gate_passes
  DROP CONSTRAINT IF EXISTS hostel_gate_passes_issued_pass_is_complete;

ALTER TABLE public.hostel_gate_passes
  ADD CONSTRAINT hostel_gate_passes_issued_pass_is_complete
  CHECK (
    status NOT IN ('issued', 'active', 'returned', 'overdue')
    OR (pass_number IS NOT NULL AND approved_by IS NOT NULL)
  );

-- A rejection without a reason is a refusal the learner cannot act on. The UI
-- already disables the button on a blank textarea; this makes it true of every
-- route into the table, including the public API's PATCH.
ALTER TABLE public.hostel_gate_passes
  DROP CONSTRAINT IF EXISTS hostel_gate_passes_rejection_has_reason;

ALTER TABLE public.hostel_gate_passes
  ADD CONSTRAINT hostel_gate_passes_rejection_has_reason
  CHECK (
    status <> 'rejected'
    OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────────────
-- This table has carried exactly two indexes (the pkey and pass_number's
-- UNIQUE) since it was created. Every one below backs a query the rebuilt flow
-- runs, and the first backs the one the gate runs on EVERY SINGLE SCAN.
CREATE INDEX IF NOT EXISTS idx_hgp_learner_status
  ON public.hostel_gate_passes (learner_id, status);

-- The warden queue: institution + status, newest first.
CREATE INDEX IF NOT EXISTS idx_hgp_institution_status_created
  ON public.hostel_gate_passes (institution_id, status, created_at DESC);

-- Open passes, oldest due-back first — the overdue sweep and the Morning Page's
-- "who is out now" both read exactly this shape.
CREATE INDEX IF NOT EXISTS idx_hgp_open_by_due
  ON public.hostel_gate_passes (expected_return)
  WHERE actual_return IS NULL;

-- FK indexes. Postgres does not create these for you, and a hostel_leave_types
-- or hostel_blocks delete would seq-scan this table without them.
CREATE INDEX IF NOT EXISTS idx_hgp_leave_type ON public.hostel_gate_passes (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_hgp_block      ON public.hostel_gate_passes (block_id);
CREATE INDEX IF NOT EXISTS idx_hgp_approved_by ON public.hostel_gate_passes (approved_by);
CREATE INDEX IF NOT EXISTS idx_hgp_rejected_by ON public.hostel_gate_passes (rejected_by);

-- ─────────────────────────────────────────────────────────────────────
-- 5. RLS — unchanged, and that is the finding
-- ─────────────────────────────────────────────────────────────────────
-- The four live policies on hostel_gate_passes already express exactly the
-- approval model chosen for this rebuild (single-step, any .approve holder in
-- the institution), so NO POLICY IS CREATED, ALTERED OR DROPPED here:
--
--   SELECT  super/admin OR .view+institution OR .view_own AND learner_id=auth.uid()
--   INSERT  super/admin OR .approve+institution OR .create AND learner_id=auth.uid()
--   UPDATE  super/admin OR (.edit | .approve | .reject) + institution
--   DELETE  super/admin OR .delete+institution
--
-- The INSERT lane's `learner_id = auth.uid()` is why requestGatePass must
-- resolve the picker's learners_profiles.id into a profiles.id before inserting:
-- auth.uid() IS a profiles.id, and the two id spaces are disjoint.
--
-- Read live pg_policies before ever writing a policy on this table. The live
-- set has already diverged once from what a migration file claimed — 20260421000002
-- generated a role_has_block_access(block_id) clause for a table that had no
-- block_id at all.

-- ─────────────────────────────────────────────────────────────────────
-- 6. The grant that stops the type dropdown being empty
-- ─────────────────────────────────────────────────────────────────────
-- hostel_leave_types SELECT requires campus_living.leave_types.view. Measured
-- 2026-09-12: chief_warden, hostel_office and executive_admin_officer hold it;
-- student and warden do NOT. The learner cannot pick a type they cannot read,
-- and the failure is a silent empty <select>, not an error.
--
-- EXPOSURE, STATED: this grants a READ of a 16-row per-institution config list.
-- It does not open the settings screen — /campus-living/settings/policies-workflows
-- is separately gated, and the create/edit/delete policies still key on
-- .leave_types.create/.edit/.delete, which neither role holds.
--
-- `permissions || jsonb_build_object(...)` MERGES. A bare jsonb_build_object
-- REPLACES the whole object and would silently strip every grant these roles
-- have received since 2026-04-21.
DO $$
DECLARE
  v_role  text;
  v_roles text[] := ARRAY['student', 'warden'];
  v_hit   int;
BEGIN
  FOREACH v_role IN ARRAY v_roles LOOP
    UPDATE public.custom_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb)
                         || jsonb_build_object('campus_living.leave_types.view', true),
           updated_at  = now()
     WHERE role_key = v_role;

    GET DIAGNOSTICS v_hit = ROW_COUNT;
    -- A grant that did not land looks exactly like a grant that was never
    -- written: an empty dropdown. Fail loudly instead of skipping.
    IF v_hit = 0 THEN
      RAISE EXCEPTION 'custom_roles has no role_key %. Leave-type read grant aborted.', v_role;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Attachment storage
-- ─────────────────────────────────────────────────────────────────────
-- Types carrying requires_attachment (medical, clinical_rotation, internship,
-- industrial_visit, training, sports_cultural) need a file with the request.
-- Private bucket, mirroring hostel-vacate-documents — the existing campus-living
-- precedent that app/(routes)/campus-living/vacate-requests/_components/document-uploader.tsx
-- already uses, so the upload path is a known-good pattern rather than a new one.
INSERT INTO storage.buckets (id, name, public)
VALUES ('hostel-gate-pass-documents', 'hostel-gate-pass-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS hgpd_storage_select ON storage.objects;
CREATE POLICY hgpd_storage_select ON storage.objects
  FOR SELECT USING (bucket_id = 'hostel-gate-pass-documents');

DROP POLICY IF EXISTS hgpd_storage_insert ON storage.objects;
CREATE POLICY hgpd_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'hostel-gate-pass-documents');

-- Only the uploader may remove their own file. A learner must be able to
-- replace an attachment they picked by mistake; nobody else's is theirs to
-- delete.
DROP POLICY IF EXISTS hgpd_storage_delete ON storage.objects;
CREATE POLICY hgpd_storage_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'hostel-gate-pass-documents'
    AND (owner = auth.uid() OR is_super_admin() OR is_admin())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 8. Read it back. Do not trust a silent success.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
  v_roles   text;
BEGIN
  -- Columns.
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
    FROM unnest(ARRAY[
      'leave_type_id','block_id','planned_out_at','transport_mode','accompanying_person',
      'attachment_url','approved_at','rejected_at','parent_confirmed_at',
      'parent_confirmed_by','parent_confirmed_number'
    ]) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'hostel_gate_passes' AND column_name = c
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'hostel_gate_passes is still missing: %', v_missing;
  END IF;

  -- pass_type must be optional, or no request can be inserted without inventing
  -- a type the form no longer asks for.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hostel_gate_passes'
       AND column_name = 'pass_type' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'pass_type is still NOT NULL — every gate-pass request would fail on 23502';
  END IF;

  -- The issued-pass CHECK must exist AND must no longer mention qr_code, or
  -- approval fails on 23514 for a pass that correctly has no per-pass QR.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.hostel_gate_passes'::regclass
       AND conname  = 'hostel_gate_passes_issued_pass_is_complete'
  ) THEN
    RAISE EXCEPTION 'the issued-pass CHECK is absent — an issued pass could exist with no number and no approver';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.hostel_gate_passes'::regclass
       AND conname  = 'hostel_gate_passes_issued_pass_is_complete'
       AND pg_get_constraintdef(oid) LIKE '%qr_code%'
  ) THEN
    RAISE EXCEPTION 'the issued-pass CHECK still requires qr_code — approval will fail on 23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.hostel_gate_passes'::regclass
       AND conname  = 'hostel_gate_passes_rejection_has_reason'
  ) THEN
    RAISE EXCEPTION 'the rejection-reason CHECK is absent';
  END IF;

  -- Indexes.
  SELECT string_agg(i, ', ' ORDER BY i) INTO v_missing
    FROM unnest(ARRAY[
      'idx_hgp_learner_status','idx_hgp_institution_status_created','idx_hgp_open_by_due',
      'idx_hgp_leave_type','idx_hgp_block','idx_hgp_approved_by','idx_hgp_rejected_by'
    ]) AS i
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'hostel_gate_passes' AND indexname = i
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'indexes not created: %', v_missing;
  END IF;

  -- The grant. Tested by VALUE, not by key presence: `permissions ? 'key'` is
  -- true for a key explicitly set to false, which is the opposite of a grant.
  SELECT string_agg(role_key, ', ' ORDER BY role_key) INTO v_roles
    FROM public.custom_roles
   WHERE role_key IN ('student', 'warden')
     AND (permissions ->> 'campus_living.leave_types.view')::boolean IS DISTINCT FROM true;
  IF v_roles IS NOT NULL THEN
    RAISE EXCEPTION 'these roles still cannot read hostel_leave_types, so their type dropdown will be empty: %', v_roles;
  END IF;

  -- The bucket.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'hostel-gate-pass-documents') THEN
    RAISE EXCEPTION 'attachment bucket hostel-gate-pass-documents was not created';
  END IF;

  RAISE NOTICE 'Gate-pass rebuild storage is in place.';
END $$;

-- ============================================================================
-- THEN VERIFY BEHAVIOURALLY, NOT STRUCTURALLY
--
-- The block above proves the objects exist. It does not prove the flow runs.
-- Objects have verified perfectly on this estate while behaviour stayed broken.
-- Sign in as three REAL non-admin accounts — never a super admin, which
-- bypasses every predicate above and makes a dead screen look finished:
--
--   student       /campus-living/gate-passes/request must list 16 leave types
--                 (that is the direct test of the section 6 grant), submit one.
--   warden        the request appears on Pending; the detail page renders roll
--                 number / degree / department / programme / semester / section
--                 / academic year and three tap-to-call numbers; approve.
--   gate_security scan that learner's navbar MyJKKN QR twice — first records
--                 OUT, second records IN. Then read hostel_access_log back in
--                 SQL: the write is invisible from the UI, and it is the half
--                 that browser-side RLS cannot do (blocker (b) above).
-- ============================================================================
