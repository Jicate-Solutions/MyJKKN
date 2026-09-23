-- =============================================================================
-- CDC Drives — selection decision per participant.
-- =============================================================================
-- One row per (drive, learner): Selected / Waitlisted / Rejected / Hold.
-- Kept separate from evaluation marks (spec rule 14) so the HR-evaluation slice
-- can land later without reshaping this. Every change is also written to
-- cdc_drive_activity_log with its previous value.
--
-- Once any learner is 'selected', document upload (bulk + single) matches
-- against the selected learners only.
--
-- Additive + idempotent. Ships as a FILE — apply out of band.
-- Writes: service role behind the cdc.drives.edit gate.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cdc_drive_selections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id     uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  learner_id   uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  decision     text NOT NULL CHECK (decision IN ('selected', 'waitlisted', 'rejected', 'hold')),
  remarks      text,
  decided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_drive_selections_one_per_learner UNIQUE (drive_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_selections_drive ON public.cdc_drive_selections (drive_id, decision);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_selections_learner ON public.cdc_drive_selections (learner_id);

ALTER TABLE public.cdc_drive_selections ENABLE ROW LEVEL SECURITY;

-- Anon lock: Supabase default privileges grant ALL on new tables to anon.
-- Reads go through RLS as authenticated; writes are service-role only.
REVOKE ALL ON TABLE public.cdc_drive_selections FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.cdc_drive_selections TO authenticated;

-- CDC team members read everything. A learner reads their OWN decision only after the
-- drive has announced results (never while decisions are still being entered).
DROP POLICY IF EXISTS "cdc_drive_selections_read" ON public.cdc_drive_selections;
CREATE POLICY "cdc_drive_selections_read" ON public.cdc_drive_selections
  FOR SELECT USING (
    public.is_cdc_staff()
    OR (
      learner_id IN (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.cdc_drives d
        WHERE d.id = drive_id AND d.status IN ('results_announced', 'closed')
      )
    )
  );

-- Grants ----------------------------------------------------------------------
-- Updated: 2026-09-19 - explicit anon lock (Supabase's default privileges grant
-- anon ALL on every new public table; RLS alone is not the lock). Reads go
-- through the RLS policy above; every write goes through the service role.
REVOKE ALL ON TABLE public.cdc_drive_selections FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.cdc_drive_selections TO authenticated;
