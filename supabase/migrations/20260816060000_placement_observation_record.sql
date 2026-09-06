-- ============================================================================
-- Placement observation — the gemba verb, pointed outside the institution
-- File: 20260816060000_placement_observation_record.sql
-- Date: 2026-08-11
--
-- WHY THIS EXISTS
--   gemba_observations answers "does our own document describe what actually
--   happens here". It is bound to improvement_areas (our 14 departments) and
--   mba_dept_artifacts (our own playbooks), and its finding is a two-value
--   CHECK — matches / differs — because there is always a document to compare
--   against.
--
--   Students on clinical postings, school placements and pharmacy internships
--   are standing inside somebody ELSE'S organisation every week, watching real
--   work. There is no document of ours to compare against, so there is no
--   matches/differs to record — only what they saw. That is a different act,
--   and it needs a different record.
--
-- WHY NOT JUST ADD A FINDING VALUE TO gemba_observations
--   Deliberately not done. 20260731043000 states it plainly: `finding` is a
--   CHECK rather than a CRUDable master table because the list is load-bearing
--   for the official transition, and extending it "would be a governance hole
--   wearing the costume of flexibility". A third value would change what
--   "official" means for all 14 internal departments in order to describe
--   something that has no official transition at all. The two records stay
--   separate; only the improvement idea they can raise is shared.
--
-- THE TWO CLOCKS, ENFORCED IN THE SCHEMA
--   Observation may begin everywhere immediately — it is four questions on a
--   report students already write, and needs no agreement with anyone.
--   NAMING the organisation is a different clock: it waits for that specific
--   partner to sign. Rather than a policy note somebody must remember, a BEFORE
--   trigger refuses to attach a partner_id whose consent_state is not 'signed'.
--   An unsigned placement is recorded with partner_kind alone ("a district
--   hospital"), which is useful, publishable internally, and names nobody.
--
-- WHO MAY RECORD
--   The same cohort gate as gemba, read from teaching_enterprise_cohorts so
--   that adding nursing or pharmacy is a ROW, not an edit to this function.
--   That table already carries program_id, department_id and semester_orders,
--   which is the whole predicate.
--
-- WHAT IS NOT IN THIS MIGRATION
--   The screen. This is the record and its rules; the UI is a follow-up. Said
--   here because a schema with no way to write to it is how a table stays empty
--   and then gets blamed for being empty.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The partner, and its consent state.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_partners (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name           text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('hospital','school','pharmacy','clinic','laboratory','workshop','office','other')),
  -- The slow clock. Only 'signed' unlocks naming and idea-raising.
  consent_state  text NOT NULL DEFAULT 'not_approached'
                   CHECK (consent_state IN ('not_approached','in_conversation','signed')),
  consent_signed_at timestamptz,
  consent_notes  text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_placement_partner_name UNIQUE (institution_id, name),
  -- A signature without a date is not a signature anyone can audit later.
  CONSTRAINT ck_placement_partner_signed_has_date
    CHECK (consent_state <> 'signed' OR consent_signed_at IS NOT NULL)
);

COMMENT ON TABLE public.placement_partners IS
  'An external organisation students are placed into. consent_state is the slow clock: only ''signed'' permits an observation to name it or to raise an improvement idea from it. Observation itself never waits for this.';

COMMENT ON COLUMN public.placement_partners.consent_state IS
  'not_approached | in_conversation | signed. The first two are indistinguishable to the schema''s guards — both mean "may not be named". They are kept apart so the slow clock is visible to whoever is running it.';

-- ----------------------------------------------------------------------------
-- 2. The observation. One row per placement visit.
--    The four questions are the ones that make friction visible; each is
--    nullable because "I looked and there was nothing" is a real observation
--    and must be recordable without inventing something.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_observations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  -- NULL until that partner signs. Never a blocker on recording.
  partner_id     uuid REFERENCES public.placement_partners(id) ON DELETE SET NULL,
  -- Always present, always safe to publish: "a district hospital".
  partner_kind   text NOT NULL CHECK (partner_kind IN ('hospital','school','pharmacy','clinic','laboratory','workshop','office','other')),
  -- Which cohort the observer was acting as. Gives department and programme
  -- without this table needing its own copy of either.
  cohort_id      uuid REFERENCES public.teaching_enterprise_cohorts(id) ON DELETE SET NULL,
  observed_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- When they WENT, not when they typed it up. Same reason as gemba.
  observed_at    timestamptz NOT NULL DEFAULT now(),
  q_done_twice     text,
  q_waiting_on_one text,
  q_workaround     text,
  q_quiet_failure  text,
  -- Set when this observation is promoted. Mirrors gemba's raised_idea_id.
  raised_idea_id uuid REFERENCES public.improvement_ideas(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- At least one of the four answered, or the row says nothing at all.
  CONSTRAINT ck_placement_observation_has_content CHECK (
    COALESCE(btrim(q_done_twice), '')     <> ''
    OR COALESCE(btrim(q_waiting_on_one), '') <> ''
    OR COALESCE(btrim(q_workaround), '')     <> ''
    OR COALESCE(btrim(q_quiet_failure), '')  <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_placement_observations_observer
  ON public.placement_observations (observed_by, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_placement_observations_partner
  ON public.placement_observations (partner_id, observed_at DESC);

COMMENT ON TABLE public.placement_observations IS
  'What a student saw inside an external organisation. Deliberately NOT gemba_observations: that record compares one of our documents against reality and its matches/differs finding governs internal officialness. This one has no document to compare against. The only thing the two share is the improvement idea either can raise.';

COMMENT ON COLUMN public.placement_observations.partner_id IS
  'NULL until that partner has signed. Enforced by trg_placement_observation_partner_gate, not by convention: naming an organisation that has not agreed is how the placement is lost.';

-- ----------------------------------------------------------------------------
-- 3. The gate. A CHECK cannot read another table, so this is a trigger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_placement_observation_partner_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
BEGIN
  IF NEW.partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT consent_state INTO v_state
    FROM public.placement_partners
   WHERE id = NEW.partner_id;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'placement observation: no such partner %', NEW.partner_id
      USING ERRCODE = '23503';
  END IF;

  IF v_state <> 'signed' THEN
    RAISE EXCEPTION
      'placement observation: % has not signed, so it may not be named. Record the kind instead and leave partner_id null.', NEW.partner_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_placement_observation_partner_gate ON public.placement_observations;
CREATE TRIGGER trg_placement_observation_partner_gate
  BEFORE INSERT OR UPDATE OF partner_id ON public.placement_observations
  FOR EACH ROW EXECUTE FUNCTION public.fn_placement_observation_partner_gate();

COMMENT ON FUNCTION public.fn_placement_observation_partner_gate() IS
  'Refuses to attach a partner_id whose consent_state is not ''signed''. The two clocks made structural: observation runs immediately everywhere, naming waits per partner. A policy note would be forgotten by the second cohort.';

-- ----------------------------------------------------------------------------
-- 4. Anon lock + RLS.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.placement_partners     FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.placement_observations FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.placement_partners     TO authenticated;
GRANT  SELECT ON TABLE public.placement_observations TO authenticated;

ALTER TABLE public.placement_partners     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_observations ENABLE ROW LEVEL SECURITY;

-- Partners: staff-side only. A learner never needs the list — they record a
-- kind, and an officer attaches the partner once it is signed. Keeping the
-- name off the learner surface is the point of the whole consent gate.
DROP POLICY IF EXISTS placement_partners_read ON public.placement_partners;
CREATE POLICY placement_partners_read ON public.placement_partners
FOR SELECT TO authenticated USING (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR (COALESCE(public.user_has_permission('improvement.board.manage'), false)
      AND public.role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS placement_partners_manage ON public.placement_partners;
CREATE POLICY placement_partners_manage ON public.placement_partners
FOR ALL TO authenticated USING (
  COALESCE(public.is_super_admin(), false)
  OR (COALESCE(public.user_has_permission('improvement.board.manage'), false)
      AND public.role_has_institution_access(institution_id))
) WITH CHECK (
  COALESCE(public.is_super_admin(), false)
  OR (COALESCE(public.user_has_permission('improvement.board.manage'), false)
      AND public.role_has_institution_access(institution_id))
);

-- Observations: your own, always. Officers and board managers see their
-- institution's. Nobody else — a placement observation names a workplace and
-- sometimes a person in it.
DROP POLICY IF EXISTS placement_observations_read ON public.placement_observations;
CREATE POLICY placement_observations_read ON public.placement_observations
FOR SELECT TO authenticated USING (
  observed_by = auth.uid()
  OR COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR (COALESCE(public.user_has_permission('improvement.board.manage'), false)
      AND public.role_has_institution_access(institution_id))
);

-- Writing goes through the RPC below, which derives observed_by and applies the
-- cohort gate. No INSERT policy exists, so the RPC is the only door.
DROP POLICY IF EXISTS placement_observations_update_own ON public.placement_observations;
CREATE POLICY placement_observations_update_own ON public.placement_observations
FOR UPDATE TO authenticated USING (
  observed_by = auth.uid() AND raised_idea_id IS NULL
) WITH CHECK (
  observed_by = auth.uid() AND raised_idea_id IS NULL
);

COMMENT ON POLICY placement_observations_update_own ON public.placement_observations IS
  'You may correct your own observation until it has raised an idea. After that it is evidence behind somebody''s business case and editing it would rewrite the basis of a decision already taken.';

-- ----------------------------------------------------------------------------
-- 5. Recording. Cohort-gated, exactly like fn_gemba_observation_record.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_placement_observation_record(
  p_institution_id   uuid,
  p_partner_kind     text,
  p_observed_at      timestamptz DEFAULT now(),
  p_q_done_twice     text DEFAULT NULL,
  p_q_waiting_on_one text DEFAULT NULL,
  p_q_workaround     text DEFAULT NULL,
  p_q_quiet_failure  text DEFAULT NULL,
  p_cohort_id        uuid DEFAULT NULL,
  p_partner_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_is_cohort boolean;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_placement_observation_record: not signed in' USING ERRCODE = '42501';
  END IF;

  -- Same source of truth as the gemba gate: adding nursing or pharmacy is a row
  -- in teaching_enterprise_cohorts, never an edit to this function.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND COALESCE(cr.is_active, true)
      AND cr.role_key IN (SELECT c.learner_role_key
                            FROM public.teaching_enterprise_cohorts c
                           WHERE c.is_active)
  ) INTO v_is_cohort;

  IF NOT (
    v_is_cohort
    OR COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.user_has_permission('improvement.area_role.assign'), false)
  ) THEN
    RAISE EXCEPTION 'fn_placement_observation_record: only a learner on a teaching-enterprise cohort, or an officer, may record a placement observation'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.placement_observations
    (institution_id, partner_id, partner_kind, cohort_id, observed_by, observed_at,
     q_done_twice, q_waiting_on_one, q_workaround, q_quiet_failure)
  VALUES
    (p_institution_id, p_partner_id, p_partner_kind, p_cohort_id, v_uid,
     COALESCE(p_observed_at, now()),
     NULLIF(btrim(COALESCE(p_q_done_twice, '')), ''),
     NULLIF(btrim(COALESCE(p_q_waiting_on_one, '')), ''),
     NULLIF(btrim(COALESCE(p_q_workaround, '')), ''),
     NULLIF(btrim(COALESCE(p_q_quiet_failure, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_placement_observation_record(uuid, text, timestamptz, text, text, text, text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_placement_observation_record(uuid, text, timestamptz, text, text, text, text, uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Promotion. A placement observation becomes an improvement idea — the same
--    destination gemba's 'differs' reaches, so there is one queue and one
--    leaderboard rather than a parallel pipeline.
--
--    author_id is the OBSERVER. That is the finder-credit rule the impact
--    leaderboard already implements for internal ideas, and it is the whole
--    defence of asking students to observe as coursework: whoever saw it is
--    named before anyone knows whether it is worth anything.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_placement_observation_raise_idea(
  p_observation_id uuid,
  p_title          text,
  p_problem        text,
  p_proposed_fix   text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  o       record;
  v_state text;
  v_idea  uuid;
BEGIN
  SELECT * INTO o FROM public.placement_observations WHERE id = p_observation_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'fn_placement_observation_raise_idea: no such observation %', p_observation_id;
  END IF;

  IF o.observed_by <> v_uid
     AND NOT COALESCE(public.is_super_admin(), false)
     AND NOT COALESCE(public.user_has_permission('improvement.board.manage'), false) THEN
    RAISE EXCEPTION 'fn_placement_observation_raise_idea: only the observer may raise the idea from their own observation'
      USING ERRCODE = '42501';
  END IF;

  IF o.raised_idea_id IS NOT NULL THEN
    RETURN o.raised_idea_id;   -- idempotent: a second press returns the first idea
  END IF;

  -- The consent gate again, and this is where it bites hardest: an improvement
  -- idea is read by staff, ranked, and may become a published case study. It
  -- may not describe a named organisation that never agreed to any of that.
  IF o.partner_id IS NULL THEN
    RAISE EXCEPTION 'fn_placement_observation_raise_idea: this observation names no partner. An idea about an unnamed organisation cannot be acted on — wait until the partner signs.'
      USING ERRCODE = '42501';
  END IF;

  SELECT consent_state INTO v_state FROM public.placement_partners WHERE id = o.partner_id;
  IF v_state IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'fn_placement_observation_raise_idea: the partner has not signed'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.improvement_ideas
    (institution_id, author_id, title, problem, proposed_fix, evidence, status)
  VALUES
    (o.institution_id, o.observed_by, p_title, p_problem, p_proposed_fix,
     'Raised from a placement observation recorded on '
       || to_char(o.observed_at, 'DD Mon YYYY') || '.',
     'logged')
  RETURNING id INTO v_idea;

  UPDATE public.placement_observations
     SET raised_idea_id = v_idea, updated_at = now()
   WHERE id = o.id;

  INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
  VALUES (v_idea, v_uid, 'created', 'Raised from a placement observation.');

  RETURN v_idea;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_placement_observation_raise_idea(uuid, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_placement_observation_raise_idea(uuid, text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Apply-time asserts.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND c.relname='placement_observations' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'RLS is not enabled on placement_observations';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND c.relname='placement_partners' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'RLS is not enabled on placement_partners';
  END IF;

  IF has_table_privilege('anon','public.placement_observations','SELECT')
     OR has_table_privilege('anon','public.placement_partners','SELECT') THEN
    RAISE EXCEPTION 'anon can reach the placement tables — the anon lock failed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_placement_observation_partner_gate' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'the partner consent gate trigger is missing — naming would be unguarded';
  END IF;

  IF NOT has_function_privilege('authenticated','public.fn_placement_observation_record(uuid, text, timestamptz, text, text, text, text, uuid, uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot record a placement observation — the feature would be unusable';
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
