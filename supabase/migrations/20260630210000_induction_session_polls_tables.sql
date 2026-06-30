-- 20260630210000_induction_session_polls_tables.sql
-- Per-session induction opinion polls. Lifecycle/gating mirror induction_session_pulse;
-- normalized poll->question->option->vote mirrors meeting_polls. Anonymized (learner_id
-- on votes only, never exposed by the totals RPC; k>=3 floor). All access via DEFINER RPCs
-- (host + learner) added in the following two migrations.
--
-- learner_id references learners_profiles(id) — the same identity get_my_learner_id() and
-- induction_enrollment.learner_id / event_session_feedback.learner_id use.

CREATE TABLE IF NOT EXISTS public.induction_session_poll (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL UNIQUE REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events(id)        ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id)  ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  issued_at       timestamptz,
  auto_close_at   timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_isp_event ON public.induction_session_poll(event_id);

COMMENT ON TABLE public.induction_session_poll IS
  'One opinion poll per induction event_session. Lifecycle (draft/open/closed + auto_close_at) mirrors induction_session_pulse. Host-built questions live in induction_session_poll_question; access via DEFINER RPCs only.';

CREATE TABLE IF NOT EXISTS public.induction_session_poll_question (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES public.induction_session_poll(id) ON DELETE CASCADE,
  prompt      text NOT NULL,
  kind        text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','multi')),
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ispq_poll ON public.induction_session_poll_question(poll_id, position);

CREATE TABLE IF NOT EXISTS public.induction_session_poll_option (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  label       text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ispo_question ON public.induction_session_poll_option(question_id, position);

CREATE TABLE IF NOT EXISTS public.induction_session_poll_vote (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES public.induction_session_poll(id)          ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  option_id   uuid NOT NULL REFERENCES public.induction_session_poll_option(id)   ON DELETE CASCADE,
  learner_id  uuid NOT NULL REFERENCES public.learners_profiles(id)               ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, option_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_ispv_question     ON public.induction_session_poll_vote(question_id);
CREATE INDEX IF NOT EXISTS idx_ispv_poll_learner ON public.induction_session_poll_vote(poll_id, learner_id);

COMMENT ON TABLE public.induction_session_poll_vote IS
  'One row per (learner, chosen option). learner_id is for one-ballot-per-question enforcement + change-while-open ONLY — never exposed by fn_induction_session_poll_totals (anonymized counts, k>=3 floor).';

-- touch updated_at (reuse the induction helper used by induction_session_pulse)
DROP TRIGGER IF EXISTS trg_isp_poll_touch ON public.induction_session_poll;
CREATE TRIGGER trg_isp_poll_touch BEFORE UPDATE ON public.induction_session_poll
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

-- RLS: super_admin-only direct access; everything else via the DEFINER RPCs.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'induction_session_poll','induction_session_poll_question',
    'induction_session_poll_option','induction_session_poll_vote'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_super_admin ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_super_admin ON public.%I FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin())',
      t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
