-- Updated: 2026-09-13 - Monthly slate: the proposed month, and what the EAO did to it
--
-- WHY
-- Piece 3 of the Monthly Slate spec (artifacts/monthly-slate-spec-2026-08-25.html)
-- shipped as pure logic in lib/services/meetings/monthly-slate-engine.ts: it takes
-- the configured series, the scheduling rules and everyone's availability and
-- returns a proposed month. It deliberately has nowhere to put that month. This
-- migration is that place — and nothing more.
--
-- SCOPE
-- Storage only. No RPC, no trigger that books anything, no write path that can
-- create a meeting. Approving a slate creates bookings through the EXISTING
-- host scheduling service in application code, which already owns double-booking
-- protection and the Google write. Nothing here duplicates that.
--
-- DIRECTOR'S DECISIONS ENCODED HERE (13 Sep 2026)
--   * Approve means the month becomes REAL immediately: every meeting is created
--     and every attendee invited in one press. So `status` on the slate is a
--     two-state door — 'draft' or 'approved' — not a workflow with stages.
--   * While it is still a draft the EAO can do three things to any one row:
--     change its time, drop it from the month, or send it back to be proposed
--     again. Those are the 'rescheduled' / 'dropped' / 'rejected' item states.
--   * A rejected slot must not come back on the next regeneration — hence
--     meeting_slate_rejected_slots, which the generator reads and subtracts.
--
-- CARRIED FORWARD FROM THE SPEC
--   * "A proposed month is disposable — regenerating never touches anything
--     already booked." Enforced by generating only into a slate whose status is
--     'draft', and by keeping booked items addressable via booking_id.
--   * "A silently missing meeting is the worst failure this system can have."
--     Unplaceable meetings are ROWS here, not absences — which is why an item is
--     allowed to have no time at all, and why the CHECK below ties those two
--     facts together so one cannot drift from the other.
--
-- APPLIED TO PRODUCTION 2026-09-13, with the Director's explicit yes in session.
-- Ledger row written: supabase_migrations.schema_migrations version 20261210100000.
-- Verified live after applying: 3 tables with RLS on, anon holds NO grants, 11
-- policies, 2 triggers, 12 CHECK constraints — and the constraints were
-- negative-controlled ON PRODUCTION inside BEGIN..ROLLBACK (an unplaceable row
-- carrying a time, a placed row with no time, an approved slate with no approver,
-- ends_at before starts_at, a bad month: all rejected; two good writes accepted;
-- all three tables left at 0 rows).

-- ---------------------------------------------------------------------------
-- 1. The proposed month
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_slates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The month being proposed, 'YYYY-MM'. Stored as text rather than a date
  -- because a slate is about a month, and a date column would invite the
  -- question "the first of the month, or the last?" on every read.
  month             text NOT NULL,
  -- Whose calendar the month is proposed against (the Director, today).
  host_profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'draft',
  generated_at      timestamptz NOT NULL DEFAULT now(),
  generated_by      uuid REFERENCES public.profiles(id),
  approved_at       timestamptz,
  approved_by       uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ms_month_shape CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT ms_status_known CHECK (status IN ('draft', 'approved')),
  -- An approved slate must say when and by whom. A slate that claims to be
  -- approved by nobody is the row you cannot explain six months later.
  CONSTRAINT ms_approved_is_stamped CHECK (
    status <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
  ),
  -- One slate per host per month. Regenerating replaces the DRAFT's items; it
  -- does not pile up a second slate for the same month.
  CONSTRAINT ms_unique_month_per_host UNIQUE (host_profile_id, month)
);

CREATE INDEX IF NOT EXISTS idx_ms_host_month
  ON public.meeting_slates (host_profile_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_ms_draft
  ON public.meeting_slates (host_profile_id)
  WHERE status = 'draft';

-- ---------------------------------------------------------------------------
-- 2. One proposed meeting — or one that could not be proposed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_slate_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_id            uuid NOT NULL REFERENCES public.meeting_slates(id) ON DELETE CASCADE,
  -- SET NULL, never CASCADE: deleting a series must not erase the record of
  -- meetings that were already booked from it.
  series_id           uuid REFERENCES public.meeting_recurring_series(id) ON DELETE SET NULL,
  -- Snapshot of the name AS PROPOSED. A series renamed in March must not rewrite
  -- what February's approved slate says it booked.
  series_name         text NOT NULL,
  institution_id      uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- 1-based: the 2nd of 4 weekly occurrences for that college this month.
  occurrence          smallint NOT NULL DEFAULT 1,
  starts_at           timestamptz,
  ends_at             timestamptz,
  duration_min        smallint NOT NULL DEFAULT 60,
  mode                text NOT NULL DEFAULT 'in_person',
  -- Why this is online when the series would normally be in person. The approval
  -- screen surfaces these at the top for confirmation.
  online_because      text,
  status              text NOT NULL DEFAULT 'proposed',
  unplaceable_reason  text,
  unplaceable_detail  text,
  -- Set when the slate is approved and the booking actually exists.
  booking_id          uuid REFERENCES public.meeting_bookings(id) ON DELETE SET NULL,
  decided_by          uuid REFERENCES public.profiles(id),
  decided_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msi_series_name_not_blank CHECK (length(btrim(series_name)) > 0),
  CONSTRAINT msi_occurrence_positive CHECK (occurrence >= 0),
  CONSTRAINT msi_duration_range CHECK (duration_min BETWEEN 5 AND 1440),
  CONSTRAINT msi_mode_known CHECK (mode IN ('in_person', 'online')),
  CONSTRAINT msi_status_known CHECK (
    status IN ('proposed', 'rescheduled', 'dropped', 'rejected', 'booked', 'unplaceable')
  ),
  -- The invariant that keeps "nothing is silently missing" true: an item has a
  -- time exactly when it is not unplaceable. Written as one equality so the two
  -- facts cannot drift apart — a row cannot claim to be unplaceable while
  -- carrying a time, nor be placeable with no time at all.
  CONSTRAINT msi_unplaceable_has_no_time CHECK (
    (status = 'unplaceable') = (starts_at IS NULL)
  ),
  CONSTRAINT msi_ends_after_starts CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  ),
  -- An unplaceable row must say why, in words the EAO can act on.
  CONSTRAINT msi_unplaceable_is_explained CHECK (
    status <> 'unplaceable'
    OR (unplaceable_reason IS NOT NULL AND length(btrim(COALESCE(unplaceable_detail, ''))) > 0)
  ),
  -- Only a booked item may carry a booking.
  CONSTRAINT msi_booking_only_when_booked CHECK (
    booking_id IS NULL OR status = 'booked'
  ),
  CONSTRAINT msi_unique_slot_per_slate UNIQUE (slate_id, series_id, institution_id, occurrence)
);

CREATE INDEX IF NOT EXISTS idx_msi_slate ON public.meeting_slate_items (slate_id);
CREATE INDEX IF NOT EXISTS idx_msi_starts ON public.meeting_slate_items (starts_at);
CREATE INDEX IF NOT EXISTS idx_msi_needs_attention
  ON public.meeting_slate_items (slate_id)
  WHERE status IN ('unplaceable', 'rejected') OR mode = 'online';

-- ---------------------------------------------------------------------------
-- 3. Slots the EAO turned down — so regenerating does not offer them again
-- ---------------------------------------------------------------------------
-- Without this, "send it back to be proposed again" would hand back the same
-- time the EAO just rejected, because the engine is deterministic and would
-- rank the same slot first a second time.
CREATE TABLE IF NOT EXISTS public.meeting_slate_rejected_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_id        uuid NOT NULL REFERENCES public.meeting_slates(id) ON DELETE CASCADE,
  series_id       uuid REFERENCES public.meeting_recurring_series(id) ON DELETE CASCADE,
  institution_id  uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  rejected_start  timestamptz NOT NULL,
  reason          text,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msrs_unique_rejection UNIQUE (slate_id, series_id, institution_id, rejected_start)
);

CREATE INDEX IF NOT EXISTS idx_msrs_slate ON public.meeting_slate_rejected_slots (slate_id);

-- ---------------------------------------------------------------------------
-- updated_at — reuses the platform's existing set_updated_at() rather than
-- adding another copy. No new function, so no new EXECUTE grant to revoke.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ms_updated_at ON public.meeting_slates;
CREATE TRIGGER trg_ms_updated_at BEFORE UPDATE ON public.meeting_slates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_msi_updated_at ON public.meeting_slate_items;
CREATE TRIGGER trg_msi_updated_at BEFORE UPDATE ON public.meeting_slate_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants
--
-- Supabase's default privileges hand anon SELECT on every new relation,
-- separate from PUBLIC. Revoking anon alone is insufficient and revoking PUBLIC
-- alone is insufficient, so both are named. REVOKE ALL then re-GRANT, never a
-- bare per-privilege revoke.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.meeting_slates                FROM anon, PUBLIC;
REVOKE ALL ON public.meeting_slate_items           FROM anon, PUBLIC;
REVOKE ALL ON public.meeting_slate_rejected_slots  FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_slates               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_slate_items          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_slate_rejected_slots TO authenticated;

GRANT ALL ON public.meeting_slates                TO service_role;
GRANT ALL ON public.meeting_slate_items           TO service_role;
GRANT ALL ON public.meeting_slate_rejected_slots  TO service_role;

ALTER TABLE public.meeting_slates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_slate_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_slate_rejected_slots  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies
--
-- Deliberately the SAME predicate as meeting_recurring_series, and the same
-- permission keys — the spec's decision is that the approver is the EAO, who is
-- already an active delegate of the Director in meeting_host_delegates. No new
-- permission model is invented here, and no new permission key: an invented key
-- would also be ungrantable until someone added it to the catalogue.
--
-- COALESCE(..., false) throughout: a SECDEF guard returning NULL would make the
-- whole USING expression NULL and fall through to a deny that reads like a bug.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ms_select ON public.meeting_slates;
CREATE POLICY ms_select ON public.meeting_slates FOR SELECT
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_slates.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.view'), false)
  );

DROP POLICY IF EXISTS ms_insert ON public.meeting_slates;
CREATE POLICY ms_insert ON public.meeting_slates FOR INSERT
  WITH CHECK (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_slates.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

DROP POLICY IF EXISTS ms_update ON public.meeting_slates;
CREATE POLICY ms_update ON public.meeting_slates FOR UPDATE
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_slates.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  )
  WITH CHECK (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_slates.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

DROP POLICY IF EXISTS ms_delete ON public.meeting_slates;
CREATE POLICY ms_delete ON public.meeting_slates FOR DELETE
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_slates.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

-- Items and rejected slots inherit their parent slate's access exactly. Written
-- as EXISTS against meeting_slates rather than a copy of the predicate, so the
-- rule lives in ONE place and a change to who may see a slate cannot leave the
-- items behind still visible.

DROP POLICY IF EXISTS msi_select ON public.meeting_slate_items;
CREATE POLICY msi_select ON public.meeting_slate_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_items.slate_id));

DROP POLICY IF EXISTS msi_insert ON public.meeting_slate_items;
CREATE POLICY msi_insert ON public.meeting_slate_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_items.slate_id));

DROP POLICY IF EXISTS msi_update ON public.meeting_slate_items;
CREATE POLICY msi_update ON public.meeting_slate_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_items.slate_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_items.slate_id));

DROP POLICY IF EXISTS msi_delete ON public.meeting_slate_items;
CREATE POLICY msi_delete ON public.meeting_slate_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_items.slate_id));

DROP POLICY IF EXISTS msrs_select ON public.meeting_slate_rejected_slots;
CREATE POLICY msrs_select ON public.meeting_slate_rejected_slots FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_rejected_slots.slate_id));

DROP POLICY IF EXISTS msrs_insert ON public.meeting_slate_rejected_slots;
CREATE POLICY msrs_insert ON public.meeting_slate_rejected_slots FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_rejected_slots.slate_id));

DROP POLICY IF EXISTS msrs_delete ON public.meeting_slate_rejected_slots;
CREATE POLICY msrs_delete ON public.meeting_slate_rejected_slots FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meeting_slates s WHERE s.id = meeting_slate_rejected_slots.slate_id));

COMMENT ON TABLE public.meeting_slates IS
  'A proposed month of recurring meetings. Draft until approved; approving creates the bookings in application code, not here.';
COMMENT ON TABLE public.meeting_slate_items IS
  'One proposed meeting, or one that could not be placed. Unplaceable rows exist deliberately — a missing meeting must never be a missing row.';
COMMENT ON TABLE public.meeting_slate_rejected_slots IS
  'Slots the EAO turned down, subtracted by the generator so a regenerated month does not offer the same time again.';
