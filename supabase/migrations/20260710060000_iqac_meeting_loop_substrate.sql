-- ============================================================================
-- IQAC Meeting Loop — substrate (meetings + resolutions on accreditation committees)
-- File: 20260710060000_iqac_meeting_loop_substrate.sql | Date: 2026-07-10
-- Director decision 2026-07-10: make ALL IQAC functions loops. This is Move 1:
-- IQAC's own core function — meet, resolve, act, and CHECK at the next meeting
-- whether the resolutions actually happened — becomes a 4-gate loop:
--
--   Act:          the committee passes resolutions with an owner + due date.
--   Measure:      the NEXT meeting opens with the open-resolution review —
--                 each item marked done / carried / dropped against its deadline.
--   Decide:       carried items increment carried_count (2+ = escalation flag,
--                 per the Director's loop-governance choice: gaps escalate to
--                 the Director); minutes become the Action-Taken Report.
--   Feed-forward: open/overdue items auto-populate the next meeting's review
--                 panel; closure history is the committee's own track record.
--
-- Body-agnostic by construction: tables hang off accreditation_committees
-- (which carries body_code), so NAAC IQAC, NBA cells, etc. all get meetings.
-- Evidence emission (NAAC 7.3.e per held meeting) ships separately in the
-- rollup-fn extension migration — this file is pure substrate.
--
-- Related: specs/iqac-cqi-loop-equivalence-2026-07-09.md §3d (the adoption
-- resolutions these tables record), accreditation_committees (20260417000001).
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Meetings — one row per convened committee meeting.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_committee_meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id    uuid NOT NULL REFERENCES public.accreditation_committees(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id),
  meeting_no      integer NOT NULL,
  scheduled_for   date,
  held_at         timestamptz,
  status          text NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','held','minuted','cancelled')),
  minutes_summary text,
  created_by      uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (committee_id, meeting_no)
);
COMMENT ON TABLE public.accreditation_committee_meetings IS
  'Convened meetings of an accreditation committee (IQAC etc.). status: scheduled → held (happened, being minuted) → minuted (closed; resolutions reviewed+recorded; minutes_summary = the Action-Taken Report text). The 7.3.e evidence emitter reads minuted meetings.';

CREATE INDEX IF NOT EXISTS idx_acm_committee ON public.accreditation_committee_meetings (committee_id, meeting_no DESC);
CREATE INDEX IF NOT EXISTS idx_acm_institution ON public.accreditation_committee_meetings (institution_id, status);

-- ----------------------------------------------------------------------------
-- 1b. Tenant/lineage integrity (deep-review PR #1940, consensus MEDIUMs 1+2):
--     institution_id and committee/meeting references are ENGINE-enforced via
--     composite FKs, not trusted from the client. A meeting's institution_id
--     must equal its committee's; a resolution's meeting references must
--     belong to its own committee. Composite FKs beat triggers here: nothing
--     to bypass, and MATCH SIMPLE skips rows where the nullable column
--     (reviewed_in_meeting_id) is NULL.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accreditation_committees_id_institution_key') THEN
    ALTER TABLE public.accreditation_committees
      ADD CONSTRAINT accreditation_committees_id_institution_key UNIQUE (id, institution_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acm_committee_institution_fk') THEN
    ALTER TABLE public.accreditation_committee_meetings
      ADD CONSTRAINT acm_committee_institution_fk
      FOREIGN KEY (committee_id, institution_id)
      REFERENCES public.accreditation_committees (id, institution_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acm_id_committee_key') THEN
    ALTER TABLE public.accreditation_committee_meetings
      ADD CONSTRAINT acm_id_committee_key UNIQUE (id, committee_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Resolutions — passed in one meeting, reviewed (measured) in a later one.
--    A resolution IS the loop's unit of work: text + owner + deadline + outcome.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_committee_resolutions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id           uuid NOT NULL REFERENCES public.accreditation_committees(id) ON DELETE CASCADE,
  -- NOT deletable out from under its resolutions (governance record; deep-review
  -- #1940 L7) — committee-level hard deletes still work: resolutions vanish via
  -- their own committee_id CASCADE, so this NO ACTION is satisfied at statement end.
  meeting_id             uuid NOT NULL REFERENCES public.accreditation_committee_meetings(id),
  institution_id         uuid NOT NULL REFERENCES public.institutions(id),
  resolution_text        text NOT NULL,
  -- Owner: a platform user when one exists; owner_label as free-text fallback
  -- (real owners — e.g. newly named placement officers — may not have accounts
  -- yet; the loop must not stall on account provisioning).
  owner_user_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_label            text,
  due_date               date,
  status                 text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','done','carried','dropped')),
  -- Times this item was reviewed and carried forward un-done. 2+ flags it for
  -- Director escalation in the UI (loop-governance decision 2026-07-10).
  carried_count          integer NOT NULL DEFAULT 0,
  reviewed_in_meeting_id uuid REFERENCES public.accreditation_committee_meetings(id),
  outcome_note           text,
  closed_at              timestamptz,
  created_by             uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Deep-review #1940 hardening: the Act gate REQUIRES an accountable owner
  -- (user or label); a resolution cannot be "reviewed" by the meeting that
  -- passed it (Measure happens at the NEXT meeting); the strike counter can
  -- never go negative and silently defeat the >=2 Director-escalation flag.
  CONSTRAINT acr_owner_required CHECK (owner_user_id IS NOT NULL OR length(btrim(coalesce(owner_label, ''))) > 0),
  -- Named honestly (r2): guarantees a DISTINCT meeting, not a LATER one — CHECKs
  -- can't subquery meeting_no ordering, and the review queue only ever offers
  -- items passed in EARLIER meetings; the gate here stops same-meeting gaming.
  CONSTRAINT acr_review_in_distinct_meeting CHECK (reviewed_in_meeting_id IS NULL OR reviewed_in_meeting_id <> meeting_id),
  CONSTRAINT acr_carried_count_nonneg CHECK (carried_count >= 0)
);
COMMENT ON TABLE public.accreditation_committee_resolutions IS
  'Committee resolutions / action items. Passed in meeting_id with owner + due_date (Act). At each later meeting the open set is reviewed: done (closed_at + reviewed_in_meeting_id set), carried (carried_count++), or dropped (Measure/Decide). Open+overdue items feed the next meeting''s review panel (Feed-forward). carried_count >= 2 = escalate to Director.';

CREATE INDEX IF NOT EXISTS idx_acr_committee_open ON public.accreditation_committee_resolutions (committee_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_acr_meeting ON public.accreditation_committee_resolutions (meeting_id);
CREATE INDEX IF NOT EXISTS idx_acr_institution ON public.accreditation_committee_resolutions (institution_id, status);

-- 2b. Same engine-enforced lineage for resolutions (deep-review MEDIUMs 1+2):
--     institution pinned to the committee's; BOTH meeting references pinned to
--     the resolution's own committee. reviewed_in_meeting_id's composite FK is
--     MATCH SIMPLE, so NULL (not yet reviewed) is skipped; its delete action
--     stays NO ACTION deliberately — a meeting that closed resolutions is a
--     governance record and must not be deletable out from under them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acr_committee_institution_fk') THEN
    ALTER TABLE public.accreditation_committee_resolutions
      ADD CONSTRAINT acr_committee_institution_fk
      FOREIGN KEY (committee_id, institution_id)
      REFERENCES public.accreditation_committees (id, institution_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acr_meeting_committee_fk') THEN
    ALTER TABLE public.accreditation_committee_resolutions
      ADD CONSTRAINT acr_meeting_committee_fk
      FOREIGN KEY (meeting_id, committee_id)
      REFERENCES public.accreditation_committee_meetings (id, committee_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acr_reviewed_meeting_committee_fk') THEN
    ALTER TABLE public.accreditation_committee_resolutions
      ADD CONSTRAINT acr_reviewed_meeting_committee_fk
      FOREIGN KEY (reviewed_in_meeting_id, committee_id)
      REFERENCES public.accreditation_committee_meetings (id, committee_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. updated_at triggers (standard repo pattern).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.accreditation_committee_meetings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accreditation_committee_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.accreditation_committee_resolutions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accreditation_committee_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. RLS — standardized pattern. View rides the existing committees.view key;
--    writes need the new meetings.manage key (seeded in lib/constants/
--    permissions.ts in the same PR). Institution scoping on every branch.
-- ----------------------------------------------------------------------------
ALTER TABLE public.accreditation_committee_meetings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accreditation_committee_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acm_select" ON public.accreditation_committee_meetings;
CREATE POLICY "acm_select" ON public.accreditation_committee_meetings FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.committees.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "acm_write" ON public.accreditation_committee_meetings;
CREATE POLICY "acm_write" ON public.accreditation_committee_meetings FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.committees.meetings.manage')
      AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.committees.meetings.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "acr_select" ON public.accreditation_committee_resolutions;
CREATE POLICY "acr_select" ON public.accreditation_committee_resolutions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.committees.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "acr_write" ON public.accreditation_committee_resolutions;
CREATE POLICY "acr_write" ON public.accreditation_committee_resolutions FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.committees.meetings.manage')
      AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.committees.meetings.manage')
      AND role_has_institution_access(institution_id))
);

COMMIT;

-- ============================================================================
-- Verification (run manually after apply)
-- ============================================================================
-- SELECT count(*) FROM accreditation_committee_meetings;      -- 0 (fresh)
-- SELECT count(*) FROM accreditation_committee_resolutions;   -- 0 (fresh)
-- \d accreditation_committee_meetings                          -- RLS enabled
-- SELECT polname FROM pg_policies
--  WHERE tablename LIKE 'accreditation_committee_%';           -- 4 policies
-- ============================================================================
