-- ============================================================================
-- MBA Teaching-Enterprise · PR-3 · CEO Rounds Log
-- Created: 2026-07-23  (spec: specs/mba-improvement-board-design-2026-07-23.md)
--
-- A daily "rounds" record for the teaching-enterprise: attendance (tracked +
-- participation-GRADED, not presence), theme, decision, tasks, and a rotating-
-- Associate-written summary that a facilitator approves. A round task can link
-- to an Improvement Board idea (Rounds-decision → Board-task).
--
-- DESIGN NOTE — deviation from the spec's "reuse meeting_agendas/
-- meeting_action_items": those tables are booking-coupled (booking_id NOT NULL →
-- meeting_bookings, the Calendly scheduler) and bos_meetings carries 34 real BOS
-- rows. A daily CEO Round is neither a scheduler booking nor a BOS meeting, so
-- reusing them would force a fake booking per round or pollute live data. This
-- ships self-contained ceo_rounds_* tables (the proven improvement_* pattern),
-- delivering the same spec INTENT without touching shared substrate.
--
-- Permission keys ceo_rounds.log + ceo_rounds.summary.write are already in the
-- catalog (registered by PR-1). Propose-only spirit: the rotating Associate's
-- ONLY write path to a round is the summary RPC (column-safe); approval is a
-- separate facilitator-gated RPC.
-- ============================================================================

-- 0) participation grade enum (graded, not just present) ---------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ceo_round_participation') THEN
    CREATE TYPE public.ceo_round_participation AS ENUM
      ('absent', 'present', 'contributed', 'led');
  END IF;
END $$;

-- 1) ceo_rounds — the daily round record -------------------------------------
CREATE TABLE IF NOT EXISTS public.ceo_rounds (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       uuid NOT NULL REFERENCES public.institutions(id),
  round_date           date NOT NULL,
  theme                text NOT NULL,
  decision             text,                              -- the day's key decision
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'closed')),
  facilitator_id       uuid,                              -- the hosting facilitator
  host_id              uuid,                              -- CEO-office host (optional)
  -- rotating-Associate summary + facilitator approval gate
  summary              text,
  summary_author_id    uuid,                              -- the assigned rotating Associate
  summary_status       text NOT NULL DEFAULT 'pending'
                         CHECK (summary_status IN ('pending', 'submitted', 'approved')),
  summary_submitted_at timestamptz,
  summary_approved_by  uuid,
  summary_approved_at  timestamptz,
  created_by           uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, round_date)                     -- one round per day per institution
);
CREATE INDEX IF NOT EXISTS idx_ceo_rounds_inst ON public.ceo_rounds(institution_id, round_date DESC);

-- 2) ceo_round_attendance — per-attendee, participation-graded ---------------
CREATE TABLE IF NOT EXISTS public.ceo_round_attendance (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id       uuid NOT NULL REFERENCES public.ceo_rounds(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL,                           -- profiles.id
  participation  public.ceo_round_participation NOT NULL DEFAULT 'present',
  note           text,
  graded_by      uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_ceo_round_attendance_round ON public.ceo_round_attendance(round_id);

-- 3) ceo_round_tasks — action items, optionally linked to a Board idea -------
CREATE TABLE IF NOT EXISTS public.ceo_round_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         uuid NOT NULL REFERENCES public.ceo_rounds(id) ON DELETE CASCADE,
  action_text      text NOT NULL,
  owner_profile_id uuid,
  owner_label      text,
  due_date         date,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'done')),
  linked_idea_id   uuid REFERENCES public.improvement_ideas(id) ON DELETE SET NULL,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ceo_round_tasks_round ON public.ceo_round_tasks(round_id);
CREATE INDEX IF NOT EXISTS idx_ceo_round_tasks_idea  ON public.ceo_round_tasks(linked_idea_id);

-- updated_at triggers (reuse the module-scoped touch fn if present, else create)
CREATE OR REPLACE FUNCTION public.ceo_rounds_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_ceo_rounds_touch ON public.ceo_rounds;
CREATE TRIGGER trg_ceo_rounds_touch BEFORE UPDATE ON public.ceo_rounds
  FOR EACH ROW EXECUTE FUNCTION public.ceo_rounds_touch_updated_at();
DROP TRIGGER IF EXISTS trg_ceo_round_attendance_touch ON public.ceo_round_attendance;
CREATE TRIGGER trg_ceo_round_attendance_touch BEFORE UPDATE ON public.ceo_round_attendance
  FOR EACH ROW EXECUTE FUNCTION public.ceo_rounds_touch_updated_at();
DROP TRIGGER IF EXISTS trg_ceo_round_tasks_touch ON public.ceo_round_tasks;
CREATE TRIGGER trg_ceo_round_tasks_touch BEFORE UPDATE ON public.ceo_round_tasks
  FOR EACH ROW EXECUTE FUNCTION public.ceo_rounds_touch_updated_at();

-- 4) RLS ---------------------------------------------------------------------
ALTER TABLE public.ceo_rounds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_round_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_round_tasks       ENABLE ROW LEVEL SECURITY;

-- rounds: viewable by anyone who logs rounds OR writes summaries (participants),
-- scoped to institution; managed (create/edit) only by ceo_rounds.log holders.
DROP POLICY IF EXISTS ceo_rounds_select ON public.ceo_rounds;
CREATE POLICY ceo_rounds_select ON public.ceo_rounds FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR ((user_has_permission('ceo_rounds.log') OR user_has_permission('ceo_rounds.summary.write'))
      AND role_has_institution_access(institution_id))
);
DROP POLICY IF EXISTS ceo_rounds_insert ON public.ceo_rounds;
CREATE POLICY ceo_rounds_insert ON public.ceo_rounds FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('ceo_rounds.log') AND role_has_institution_access(institution_id))
);
-- UPDATE = facilitators only (theme/decision/attendee assignment/status). The
-- rotating Associate NEVER updates the row directly — the summary RPC is their
-- only write path (column-safe), so this policy stays ceo_rounds.log-only.
DROP POLICY IF EXISTS ceo_rounds_update ON public.ceo_rounds;
CREATE POLICY ceo_rounds_update ON public.ceo_rounds FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('ceo_rounds.log') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('ceo_rounds.log') AND role_has_institution_access(institution_id))
);

-- attendance: readable to round viewers; graded by facilitators (ceo_rounds.log).
DROP POLICY IF EXISTS ceo_round_attendance_select ON public.ceo_round_attendance;
CREATE POLICY ceo_round_attendance_select ON public.ceo_round_attendance FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM public.ceo_rounds r WHERE r.id = round_id)
);
DROP POLICY IF EXISTS ceo_round_attendance_write ON public.ceo_round_attendance;
CREATE POLICY ceo_round_attendance_write ON public.ceo_round_attendance FOR ALL USING (
  is_super_admin() OR is_admin() OR user_has_permission('ceo_rounds.log')
) WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('ceo_rounds.log')
);

-- tasks: readable to round viewers; written by facilitators (ceo_rounds.log).
DROP POLICY IF EXISTS ceo_round_tasks_select ON public.ceo_round_tasks;
CREATE POLICY ceo_round_tasks_select ON public.ceo_round_tasks FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM public.ceo_rounds r WHERE r.id = round_id)
);
DROP POLICY IF EXISTS ceo_round_tasks_write ON public.ceo_round_tasks;
CREATE POLICY ceo_round_tasks_write ON public.ceo_round_tasks FOR ALL USING (
  is_super_admin() OR is_admin() OR user_has_permission('ceo_rounds.log')
) WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('ceo_rounds.log')
);

-- 5) Summary write (SECDEF) — the rotating Associate's ONLY write path -------
-- The assigned Associate (summary_author_id = auth.uid() + ceo_rounds.summary.write)
-- OR a facilitator (ceo_rounds.log) writes the summary and marks it 'submitted'.
-- Blocked once 'approved' (a facilitator must re-open by writing again as manager).
-- Column-safe: only summary + summary_status + summary_submitted_at change.
CREATE OR REPLACE FUNCTION public.fn_ceo_round_write_summary(
  p_round_id uuid,
  p_summary  text
) RETURNS public.ceo_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.ceo_rounds;
  v_is_manager boolean := (is_super_admin() OR is_admin() OR user_has_permission('ceo_rounds.log'));
BEGIN
  SELECT * INTO v_round FROM public.ceo_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round not found'; END IF;

  IF NOT v_is_manager THEN
    IF NOT (v_round.summary_author_id = auth.uid()
            AND user_has_permission('ceo_rounds.summary.write')) THEN
      RAISE EXCEPTION 'not permitted: only the assigned associate or a facilitator may write the summary';
    END IF;
  END IF;
  IF v_round.summary_status = 'approved' AND NOT v_is_manager THEN
    RAISE EXCEPTION 'summary already approved — ask a facilitator to re-open it';
  END IF;

  UPDATE public.ceo_rounds SET
    summary              = p_summary,
    summary_status       = 'submitted',
    summary_submitted_at = now()
  WHERE id = p_round_id RETURNING * INTO v_round;
  RETURN v_round;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_ceo_round_write_summary(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ceo_round_write_summary(uuid, text) TO authenticated;

-- 6) Summary approve (SECDEF) — facilitator gate -----------------------------
CREATE OR REPLACE FUNCTION public.fn_ceo_round_approve_summary(
  p_round_id uuid,
  p_note     text DEFAULT NULL
) RETURNS public.ceo_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.ceo_rounds;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('ceo_rounds.log')) THEN
    RAISE EXCEPTION 'not permitted: only a facilitator may approve a rounds summary';
  END IF;
  SELECT * INTO v_round FROM public.ceo_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round not found'; END IF;
  IF v_round.summary IS NULL OR length(trim(v_round.summary)) = 0 THEN
    RAISE EXCEPTION 'nothing to approve: the summary is empty';
  END IF;

  UPDATE public.ceo_rounds SET
    summary_status      = 'approved',
    summary_approved_by = auth.uid(),
    summary_approved_at = now()
  WHERE id = p_round_id RETURNING * INTO v_round;
  RETURN v_round;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_ceo_round_approve_summary(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ceo_round_approve_summary(uuid, text) TO authenticated;

-- ============================================================================
-- End PR-3 migration.
-- ============================================================================
