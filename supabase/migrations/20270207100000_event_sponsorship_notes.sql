-- ─── Sponsorship notes — one free-text box per event (BUG-006143) ─────────────
-- 2026-09-25
--
-- Reported by the COO on a tournament's Sponsors tab: "Provide a space for any
-- description and message (details) that need to be shared here. Like number
-- of total sponsors and also the total money — not like drop down but a space
-- for typing messages."
--
-- The Sponsors board had only per-sponsor structured fields (tier, stage,
-- amount). This table holds ONE free-text note per event for the whole
-- sponsorship effort. (Per-sponsor notes use the existing event_sponsors.notes
-- column, which the shared board now edits — no schema change needed for that.)
--
-- A separate table, not a column on `events`, so the write gate can be the
-- SAME as event_sponsors' (20261220093000): in-charge, creator, or
-- events.logistics.manage with institution access. A column on `events` would
-- instead ride events' UPDATE policies, which do not know events.logistics.manage
-- — the COO holds that key and could then edit sponsors but not this note.
--
-- Read: anyone who can see the event row (the subquery on events runs under the
-- caller's own RLS), matching how the Sponsors tab itself is shown.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.event_sponsorship_notes (
  event_id   uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  notes      text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 10000),
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_sponsorship_notes IS
  'One free-text sponsorship note per event, shown on the shared Sponsors tab (BUG-006143). Write gate mirrors event_sponsors_event_team_write.';

ALTER TABLE public.event_sponsorship_notes ENABLE ROW LEVEL SECURITY;

-- Stamp who/when on every write; the client does not send these.
CREATE OR REPLACE FUNCTION public.fn_event_sponsorship_notes_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_sponsorship_notes_stamp ON public.event_sponsorship_notes;
CREATE TRIGGER trg_event_sponsorship_notes_stamp
  BEFORE INSERT OR UPDATE ON public.event_sponsorship_notes
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_sponsorship_notes_stamp();

DROP POLICY IF EXISTS event_sponsorship_notes_read ON public.event_sponsorship_notes;
CREATE POLICY event_sponsorship_notes_read ON public.event_sponsorship_notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));

DROP POLICY IF EXISTS event_sponsorship_notes_event_team_write ON public.event_sponsorship_notes;
CREATE POLICY event_sponsorship_notes_event_team_write ON public.event_sponsorship_notes
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR public.fn_is_event_incharge(event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = event_id AND e.created_by = (SELECT auth.uid())
       )
    OR (
      (SELECT public.user_has_permission('events.logistics.manage'))
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_id
          AND public.role_has_institution_access(e.institution_id)
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR public.fn_is_event_incharge(event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = event_id AND e.created_by = (SELECT auth.uid())
       )
    OR (
      (SELECT public.user_has_permission('events.logistics.manage'))
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_id
          AND public.role_has_institution_access(e.institution_id)
      )
    )
  );

-- Supabase's default privileges grant every new public table to anon; this
-- table is staff-only, so lock anon out explicitly (RLS is not a substitute).
REVOKE ALL ON TABLE public.event_sponsorship_notes FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_sponsorship_notes TO authenticated;

NOTIFY pgrst, 'reload schema';
