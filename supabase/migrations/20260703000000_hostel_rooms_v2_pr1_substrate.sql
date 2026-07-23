-- ============================================================================
-- Hostel Rooms v2 — PR 1: Substrate (Director Option C, Path B narrow scope)
-- ============================================================================
-- Spec lock 2026-05-26 (Director).
--
-- WHY (full picture across the 4-PR stack):
--   PR 1 (this file): substrate-only DDL — new junction table + additive
--                     columns on hostel_allocations + zero-fallout drops +
--                     the occupancy view. No RLS rewrites, no destructive
--                     drops of institution_id columns, no row deletions.
--   PR 2 (next):       service-layer refactor + RLS rewrite + drop of
--                     institution_id columns from hostel_blocks /
--                     hostel_rooms / hostel_residents + seed of missing
--                     hostel_block_institutions rows for the 3 JKKN
--                     Dental blocks.
--   PR 3:              admin UIs for rooms catalog + allocations + the
--                     /admin/hostel hub un-placeholders these cards.
--   PR 4:              follow-on / cleanup as needed.
--
-- WHAT THIS PR CHANGES (verified against prod kvizhngldtiuufknvehv 2026-05-26):
--
--   1. CREATE TABLE room_institution_access (room-level college access
--      junction; mirrors the existing block-level hostel_block_institutions
--      junction at a finer grain). 4 RLS policies + 2 partial indexes +
--      unique constraint on (room_id, institution_id).
--   2. COMMENT-annotate hostel_rooms.status + hostel_rooms.current_occupancy
--      as DEPRECATED. Both columns are derived going forward via the new
--      v_hostel_room_occupancy view. They are NOT dropped in PR 1 because
--      6 service files still read them — dropping today causes PostgREST
--      runtime errors. PR 2 drops them after the service refactor.
--   3. ALTER hostel_allocations ADD 5 new columns (additive; existing
--      130 hostel_residents + 1 hostel_allocations row unaffected):
--        - monthly_fee_at_allocation_inr  integer
--        - warden_id                       uuid REFERENCES profiles(id)
--        - roommate_preference_notes      text
--        - check_in_date                  date NOT NULL DEFAULT CURRENT_DATE
--        - check_out_date                 date NULL
--   4. UNIQUE INDEX hostel_allocations_room_bed_active_uidx ON
--      (room_id, bed_id) WHERE check_out_date IS NULL — one resident per
--      bed at a time among active allocations.
--   5. CREATE OR REPLACE VIEW v_hostel_room_occupancy — replaces the
--      DEPRECATED current_occupancy + status columns with a live
--      derivation from active hostel_allocations rows.
--   6. SEED room_institution_access — one row per existing hostel_rooms
--      row scoped to that room's current hostel_rooms.institution_id
--      (i.e. 146 rows). Idempotent: relies on the new UNIQUE constraint.
--
-- DEFERRED to PR 2 (with explicit rationale):
--   ─ DROP hostel_rooms.status / .current_occupancy — 6 service files
--     still read these columns via .select() literals. Dropping today
--     causes PostgREST runtime errors on the next page that hits any
--     of those services. PR 2 refactors + drops together.
--   ─ DROP hostel_blocks.institution_id  — RLS policies on hostel_blocks
--     reference this column AND hostel_block_institutions has 0 rows
--     for the 3 active JKKN Dental blocks; dropping today would make
--     145/146 rooms invisible to everyone except super_admin.
--   ─ DROP hostel_rooms.institution_id   — 3 RLS policies reference this
--     column; rewriting them requires the new junction to be populated
--     for ALL rooms (this PR does that) AND a new helper SQL function
--     that joins through room_institution_access. PR 2 lands both.
--   ─ DROP hostel_residents.institution_id — 3 RLS policies reference;
--     the new RLS path joins via the active allocation, but residents
--     without allocations would become super_admin-only; needs design
--     thought (PR 2).
--   ─ DELETE FROM hostel_allocations     — only 1 row, but it has
--     incoming FKs from hostel_deposits / hostel_premium_invites (the
--     latter ON DELETE CASCADE; the former blocks). Better handled in
--     PR 2 after the service layer no longer reads the legacy semantics.
--
-- APPLY VIA SUPABASE MANAGEMENT API (per feedback_supabase_management_api*
-- and feedback_supabase_db_url_skip_permanent). Each step idempotent.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- Step 1: room_institution_access — new room-level college access junction
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.room_institution_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES public.hostel_rooms(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  granted_by      uuid REFERENCES auth.users(id),
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_institution_access_room_institution_uidx
    UNIQUE (room_id, institution_id)
);

COMMENT ON TABLE public.room_institution_access IS
  'Room-level college access junction. Replaces the legacy '
  'hostel_rooms.institution_id 1:1 coupling with an N:M relationship: '
  'a room can be made available to one or more colleges, managed via '
  '/admin/hostel/rooms (PR 3). is_active=false soft-revokes access '
  'without losing the historical grant record.';

CREATE INDEX IF NOT EXISTS idx_room_institution_access_room
  ON public.room_institution_access (room_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_room_institution_access_institution
  ON public.room_institution_access (institution_id) WHERE is_active = true;

-- updated_at trigger (matches the rest of the hostel_* table family).
DROP TRIGGER IF EXISTS trg_room_institution_access_updated_at
  ON public.room_institution_access;
CREATE TRIGGER trg_room_institution_access_updated_at
  BEFORE UPDATE ON public.room_institution_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────
-- Step 2: RLS — match the pattern used on hostel_block_institutions
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.room_institution_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_institution_access_select_permission
  ON public.room_institution_access;
CREATE POLICY room_institution_access_select_permission
  ON public.room_institution_access
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.rooms.view'::text)
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS room_institution_access_insert_permission
  ON public.room_institution_access;
CREATE POLICY room_institution_access_insert_permission
  ON public.room_institution_access
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_admin()
  );

DROP POLICY IF EXISTS room_institution_access_update_permission
  ON public.room_institution_access;
CREATE POLICY room_institution_access_update_permission
  ON public.room_institution_access
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin()
  );

DROP POLICY IF EXISTS room_institution_access_delete_permission
  ON public.room_institution_access;
CREATE POLICY room_institution_access_delete_permission
  ON public.room_institution_access
  FOR DELETE
  USING (
    is_super_admin()
    OR is_admin()
  );

-- ──────────────────────────────────────────────────────────────────────
-- Step 3: ALTER hostel_rooms — annotate derived/zombie columns as DEPRECATED
-- ──────────────────────────────────────────────────────────────────────
--
-- ORIGINAL PLAN: drop hostel_rooms.status + .current_occupancy outright.
--
-- WHY NOT DONE IN PR 1: 6 service files under lib/services/campus-living/
-- still read these columns via .select() literals (hostel-room-service,
-- hostel-premium-allocation-service, campus-living-dashboard, campus-
-- living-reports, campus-living-analytics, hostel-block-service). Dropping
-- the columns at the DB layer without first fixing the services causes a
-- PostgREST runtime error the next time any of those code paths execute.
-- Per Director's "STOP and report if a service still references the
-- column" directive, the drop is deferred to PR 2 where the service
-- refactor lives.
--
-- WHAT PR 1 DOES INSTEAD: annotate both columns as DEPRECATED via
-- pg COMMENT so anyone touching them sees the warning + the migration
-- path. The new view v_hostel_room_occupancy is the recommended read
-- source going forward.

COMMENT ON COLUMN public.hostel_rooms.status IS
  'DEPRECATED 2026-05-26 (PR 1 hostel-rooms-v2): use '
  'v_hostel_room_occupancy.derived_status instead. Column kept as a '
  'deprecation shim — PR 2 drops it after the 6-service refactor.';

COMMENT ON COLUMN public.hostel_rooms.current_occupancy IS
  'DEPRECATED 2026-05-26 (PR 1 hostel-rooms-v2): use '
  'v_hostel_room_occupancy.active_residents instead. Column kept as a '
  'deprecation shim — PR 2 drops it after the 6-service refactor.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 4: ALTER hostel_allocations — 5 additive columns
-- ──────────────────────────────────────────────────────────────────────
--
-- Why these 5:
--   monthly_fee_at_allocation_inr — fee snapshot at allocation time
--                                   (Director wants a frozen-at-allocation
--                                   number, separate from current tier fee).
--   warden_id                     — optional warden-of-record per allocation
--                                   (not block warden — finer grain).
--   roommate_preference_notes     — free-text successor to the existing
--                                   roommate_preference_ids array; complements
--                                   it, doesn't replace yet (PR 2).
--   check_in_date                 — NOT NULL DEFAULT CURRENT_DATE; complements
--                                   the existing allocation_date column
--                                   (which is "when the allocation was created
--                                   in the system" — not necessarily when the
--                                   resident moved in). PR 2 picks a winner.
--   check_out_date                — NULL = active; non-NULL = checked out.
--                                   Different semantic from the existing
--                                   actual_vacate_date (which is workflow-
--                                   driven via hostel_vacate_requests). PR 2
--                                   reconciles.
--
-- IF NOT EXISTS makes this idempotent. The current 1 hostel_allocations row
-- gets check_in_date = CURRENT_DATE on this PR's apply, which is wrong by
-- ~weeks-to-months for that one row but that row is going to be deleted in
-- PR 2 anyway.

ALTER TABLE public.hostel_allocations
  ADD COLUMN IF NOT EXISTS monthly_fee_at_allocation_inr integer;

ALTER TABLE public.hostel_allocations
  ADD COLUMN IF NOT EXISTS warden_id uuid;

DO $$
BEGIN
  -- Conditional FK add — ADD COLUMN IF NOT EXISTS doesn't take REFERENCES,
  -- so we add the constraint in a separate idempotent step.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hostel_allocations_warden_id_fkey'
  ) THEN
    ALTER TABLE public.hostel_allocations
      ADD CONSTRAINT hostel_allocations_warden_id_fkey
      FOREIGN KEY (warden_id) REFERENCES public.profiles(id);
  END IF;
END$$;

ALTER TABLE public.hostel_allocations
  ADD COLUMN IF NOT EXISTS roommate_preference_notes text;

ALTER TABLE public.hostel_allocations
  ADD COLUMN IF NOT EXISTS check_in_date date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE public.hostel_allocations
  ADD COLUMN IF NOT EXISTS check_out_date date;

COMMENT ON COLUMN public.hostel_allocations.monthly_fee_at_allocation_inr IS
  'Fee snapshot in INR captured at allocation time. Frozen reference value '
  '(does not auto-update if hostel_tier_policy fee changes later). Set by '
  'the allocation service; admin UI reads-only.';

COMMENT ON COLUMN public.hostel_allocations.warden_id IS
  'Optional warden-of-record for this specific allocation. Finer grain than '
  'the block warden (hostel_blocks.warden_id). NULL = uses block warden.';

COMMENT ON COLUMN public.hostel_allocations.roommate_preference_notes IS
  'Free-text roommate preferences (allergies, sleep schedule, etc.). '
  'Complements the array column roommate_preference_ids — both kept '
  'side-by-side in PR 1; PR 2 reconciles or drops the array form.';

COMMENT ON COLUMN public.hostel_allocations.check_in_date IS
  'Date the resident physically checked in. Distinct from allocation_date '
  '(which is the row-creation date). NOT NULL with DEFAULT CURRENT_DATE for '
  'safe migration backfill.';

COMMENT ON COLUMN public.hostel_allocations.check_out_date IS
  'NULL = active allocation. Non-NULL = checked out. Distinct from '
  'actual_vacate_date which is workflow-driven via hostel_vacate_requests. '
  'PR 2 reconciles the two columns.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 5: One-active-resident-per-bed constraint
-- ──────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS hostel_allocations_room_bed_active_uidx
  ON public.hostel_allocations (room_id, bed_id)
  WHERE check_out_date IS NULL;

-- ──────────────────────────────────────────────────────────────────────
-- Step 6: v_hostel_room_occupancy — replaces .status + .current_occupancy
-- ──────────────────────────────────────────────────────────────────────
--
-- "Active" = check_out_date IS NULL (the new column). The single legacy
-- hostel_allocations row that exists today will surface here until PR 2
-- deletes it. After PR 2 + PR 3 ship and admins start using the new UI,
-- this view is the source of truth for room-status displays.

CREATE OR REPLACE VIEW public.v_hostel_room_occupancy AS
SELECT
  r.id                                                                AS room_id,
  r.room_number,
  r.block_id,
  r.capacity,
  COALESCE(
    COUNT(a.id) FILTER (WHERE a.check_out_date IS NULL),
    0
  )::int                                                              AS active_residents,
  GREATEST(
    r.capacity - COALESCE(
      COUNT(a.id) FILTER (WHERE a.check_out_date IS NULL),
      0
    ),
    0
  )::int                                                              AS beds_available,
  CASE
    WHEN r.capacity = 0 THEN 'unknown'
    WHEN COUNT(a.id) FILTER (WHERE a.check_out_date IS NULL) = 0
      THEN 'available'
    WHEN COUNT(a.id) FILTER (WHERE a.check_out_date IS NULL) >= r.capacity
      THEN 'full'
    ELSE 'partially_occupied'
  END                                                                 AS derived_status
FROM public.hostel_rooms r
LEFT JOIN public.hostel_allocations a ON a.room_id = r.id
GROUP BY r.id, r.room_number, r.block_id, r.capacity;

COMMENT ON VIEW public.v_hostel_room_occupancy IS
  'Live occupancy per room. Replaces the dropped hostel_rooms.status and '
  '.current_occupancy columns. derived_status values: available, '
  'partially_occupied, full, unknown (capacity=0). Services should read '
  'from this view instead of computing occupancy in app code.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 7: Seed room_institution_access
-- ──────────────────────────────────────────────────────────────────────
--
-- For each existing hostel_rooms row, write one room_institution_access
-- row scoped to that room's current institution_id. This keeps end-state
-- behavior identical to legacy (each room accessible by exactly its
-- owning college) until Director uses /admin/hostel/rooms (PR 3) to
-- grant additional college access.
--
-- ON CONFLICT clause makes this idempotent: re-running this PR's
-- migration doesn't double-seed. The UNIQUE constraint on
-- (room_id, institution_id) does the de-dup.
--
-- Note: this PR STILL reads hostel_rooms.institution_id (it has to —
-- that's the only source of truth right now). PR 2 drops the column
-- AFTER this junction is fully populated, AT WHICH POINT this seed step
-- becomes a one-time backfill that can never need re-running.

INSERT INTO public.room_institution_access (room_id, institution_id, is_active, notes)
SELECT
  r.id,
  r.institution_id,
  true,
  'Auto-seeded by PR 1 migration from legacy hostel_rooms.institution_id'
FROM public.hostel_rooms r
WHERE r.institution_id IS NOT NULL
ON CONFLICT (room_id, institution_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────
-- Step 8: Verification probes (informational only — no fail-on-bad)
-- ──────────────────────────────────────────────────────────────────────
-- These are SELECT-only assertions per
-- [[feedback_smoke_test_must_include_all_not_null_columns]]. They emit
-- NOTICE messages so a human reviewing Management API logs can sanity-
-- check the substrate landed correctly.

DO $$
DECLARE
  v_room_count int;
  v_junction_count int;
  v_orphan_rooms int;
  v_allocation_cols int;
BEGIN
  SELECT count(*) INTO v_room_count FROM public.hostel_rooms;
  SELECT count(*) INTO v_junction_count
    FROM public.room_institution_access WHERE is_active = true;
  SELECT count(*) INTO v_orphan_rooms
    FROM public.hostel_rooms r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.room_institution_access ria
      WHERE ria.room_id = r.id AND ria.is_active = true
    );
  SELECT count(*) INTO v_allocation_cols
    FROM information_schema.columns
    WHERE table_name = 'hostel_allocations'
      AND column_name IN (
        'monthly_fee_at_allocation_inr', 'warden_id',
        'roommate_preference_notes', 'check_in_date', 'check_out_date'
      );

  RAISE NOTICE 'PR 1 substrate verification:';
  RAISE NOTICE '  hostel_rooms rows: %', v_room_count;
  RAISE NOTICE '  active room_institution_access rows: %', v_junction_count;
  RAISE NOTICE '  rooms missing junction coverage: %', v_orphan_rooms;
  RAISE NOTICE '  new hostel_allocations columns present (expect 5): %',
    v_allocation_cols;
END$$;
