-- 2026-06-22 — BUG-004198: mentor session mapping (peer + industry).
-- The platform recorded that mentors are paired with mentees, but not the actual
-- mentoring SESSIONS. This adds: (1) a fixed industry-mentor → learner pairing path
-- (which did not exist — pairings were learner↔learner only), and (2) a UNIFIED
-- session log over BOTH peer and industry pairings, with per-pairing rollups.
--
-- Decisions LOCKED (Director 2026-06-22):
--  - BOTH peer (cdc_mentor_pairings) AND industry-mentor sessions.
--  - Each industry mentor gets a FIXED assigned student list (a new pairing table),
--    NOT ad-hoc attendee picking.
--  - Unified session-log table; rollups as VIEWs (no denormalized counter).
--  - Block logging new sessions on a CONCLUDED pairing (viewing past sessions still allowed).
--
-- Session shape is adapted from ss_mentor_sessions (Startup Studio) — the proven
-- precedent — per CLAUDE.md rule 26 (don't invent a new shape).

-- ---------------------------------------------------------------------------
-- 1. Industry mentor ↔ learner pairings (the FIXED assigned student list)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_industry_mentor_pairings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_mentor_id uuid NOT NULL REFERENCES public.industry_mentors(id) ON DELETE CASCADE,
  mentee_learner_id  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id     uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'active',  -- active | concluded | paused
  assigned_at        timestamptz NOT NULL DEFAULT now(),
  concluded_at       timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT cdc_industry_mentor_pairings_unique UNIQUE (industry_mentor_id, mentee_learner_id)
);

CREATE INDEX IF NOT EXISTS idx_cdc_ind_pairings_mentor ON public.cdc_industry_mentor_pairings (industry_mentor_id);
CREATE INDEX IF NOT EXISTS idx_cdc_ind_pairings_mentee ON public.cdc_industry_mentor_pairings (mentee_learner_id);

ALTER TABLE public.cdc_industry_mentor_pairings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdc_ind_pairings_select" ON public.cdc_industry_mentor_pairings;
CREATE POLICY "cdc_ind_pairings_select" ON public.cdc_industry_mentor_pairings
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.industry_mentors.view') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "cdc_ind_pairings_write" ON public.cdc_industry_mentor_pairings;
CREATE POLICY "cdc_ind_pairings_write" ON public.cdc_industry_mentor_pairings
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.industry_mentors.edit') AND role_has_institution_access(institution_id))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.industry_mentors.edit') AND role_has_institution_access(institution_id))
  );

DROP TRIGGER IF EXISTS trg_cdc_ind_pairings_touch ON public.cdc_industry_mentor_pairings;
CREATE TRIGGER trg_cdc_ind_pairings_touch
  BEFORE UPDATE ON public.cdc_industry_mentor_pairings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Unified session log (peer + industry) — checked polymorphic reference.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_mentor_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_kind        text NOT NULL,   -- 'peer' | 'industry'
  peer_pairing_id     uuid REFERENCES public.cdc_mentor_pairings(id) ON DELETE CASCADE,
  industry_pairing_id uuid REFERENCES public.cdc_industry_mentor_pairings(id) ON DELETE CASCADE,
  session_date        timestamptz NOT NULL,
  duration_minutes    integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  mode                text,            -- 'in_person' | 'virtual' | 'hybrid'
  topics_discussed    text[] DEFAULT '{}',
  outcome_notes       text,
  action_items        text,
  next_session_date   timestamptz,
  mentor_rating       integer CHECK (mentor_rating IS NULL OR mentor_rating BETWEEN 1 AND 5),
  mentee_rating       integer CHECK (mentee_rating IS NULL OR mentee_rating BETWEEN 1 AND 5),
  logged_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Exactly the pairing matching pairing_kind is set (referential integrity to
  -- whichever pairing table applies).
  CONSTRAINT cdc_mentor_sessions_kind_ref CHECK (
    (pairing_kind = 'peer'     AND peer_pairing_id IS NOT NULL AND industry_pairing_id IS NULL)
    OR (pairing_kind = 'industry' AND industry_pairing_id IS NOT NULL AND peer_pairing_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cdc_mentor_sessions_peer     ON public.cdc_mentor_sessions (peer_pairing_id);
CREATE INDEX IF NOT EXISTS idx_cdc_mentor_sessions_industry ON public.cdc_mentor_sessions (industry_pairing_id);
CREATE INDEX IF NOT EXISTS idx_cdc_mentor_sessions_date     ON public.cdc_mentor_sessions (session_date DESC);

ALTER TABLE public.cdc_mentor_sessions ENABLE ROW LEVEL SECURITY;

-- Read/write gate spans both mentoring kinds (institution scope is enforced at the
-- API layer through the pairing's learners — the table has no institution_id).
DROP POLICY IF EXISTS "cdc_mentor_sessions_select" ON public.cdc_mentor_sessions;
CREATE POLICY "cdc_mentor_sessions_select" ON public.cdc_mentor_sessions
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('cdc.mentors.view')
    OR user_has_permission('cdc.industry_mentors.view')
  );

DROP POLICY IF EXISTS "cdc_mentor_sessions_write" ON public.cdc_mentor_sessions;
CREATE POLICY "cdc_mentor_sessions_write" ON public.cdc_mentor_sessions
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('cdc.mentors.edit')
    OR user_has_permission('cdc.industry_mentors.edit')
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('cdc.mentors.edit')
    OR user_has_permission('cdc.industry_mentors.edit')
  );

DROP TRIGGER IF EXISTS trg_cdc_mentor_sessions_touch ON public.cdc_mentor_sessions;
CREATE TRIGGER trg_cdc_mentor_sessions_touch
  BEFORE UPDATE ON public.cdc_mentor_sessions
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Per-pairing rollup VIEWs (D3: VIEW, not a denormalized counter).
--    security_invoker so direct client reads respect the underlying RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cdc_mentor_pairing_rollup
WITH (security_invoker = true) AS
SELECT p.id AS pairing_id,
       count(s.id)                                                        AS session_count,
       coalesce(sum(s.duration_minutes), 0)                              AS total_minutes,
       max(s.session_date)                                              AS last_session_at,
       min(s.next_session_date) FILTER (WHERE s.next_session_date > now()) AS next_session_at
FROM public.cdc_mentor_pairings p
LEFT JOIN public.cdc_mentor_sessions s ON s.peer_pairing_id = p.id
GROUP BY p.id;

CREATE OR REPLACE VIEW public.v_cdc_industry_pairing_rollup
WITH (security_invoker = true) AS
SELECT ip.id AS pairing_id,
       count(s.id)                                                        AS session_count,
       coalesce(sum(s.duration_minutes), 0)                              AS total_minutes,
       max(s.session_date)                                              AS last_session_at,
       min(s.next_session_date) FILTER (WHERE s.next_session_date > now()) AS next_session_at
FROM public.cdc_industry_mentor_pairings ip
LEFT JOIN public.cdc_mentor_sessions s ON s.industry_pairing_id = ip.id
GROUP BY ip.id;
