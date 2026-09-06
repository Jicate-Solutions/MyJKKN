-- 2026-07-31 — Gemba: the record of someone going to look.
-- Spec: specs/gemba-observation-record-2026-07-30.md (8 Director decisions, locked).
--
-- WHY THIS EXISTS
-- The Improvement Board holds 42 playbook documents describing how 14 departments
-- work. All 42 were AI-drafted in one day, approved by one person the next, and not
-- one of the 14 organograms named a real human being. The screens already say both
-- "Approved" and "Proposed - not yet official", and the documents' own text says
-- "complete every placeholder before treating it as official" -- but nothing could
-- move an artifact from proposed to official, because becoming official requires
-- somebody to go and look and there was nowhere to record that they did.
--
-- This adds that missing verb. It is not a new module: it is the transition between
-- two states the product already displays.
--
-- WHY NOT public.audit_attestations (production-code-sweep finding)
-- That table already implements the same CONCEPT -- a named person vouches
-- (attested_by / attested_at), others co-sign (cosigners jsonb), with an evidence
-- count and notes. It is deliberately NOT reused here, and the column names below
-- mirror it on purpose so a future generalisation is mechanical:
--   * it is bound to audit_cycle_id + parameter_code, both NOT NULL -- an
--     accreditation cycle, not an arbitrary artifact;
--   * a DB CHECK enforces CAO + CEO cosign for NAAC/NBA-mapped parameters, which is
--     the OPPOSITE authority model to D2 (the observers here are learners) and D6
--     (the department reads first, leadership sees patterns only).
-- Forcing a department playbook through it would mean a synthetic cycle id and
-- fighting that CHECK. Recorded here so the next reader knows this was a decision.
--
-- DECISIONS IMPLEMENTED (Director interview 2026-07-30)
--   D1  official only via a recorded visit by a named person   -> gemba_observations
--   D2  observers are associates / residents, not the officers -> cohort gate in _record
--   D3  the 42 existing approved docs are NOT official          -> additive columns, no backfill
--   D4  official expires; interval configurable per department  -> policy + per-area override
--   D5  a mismatch raises an improvement idea                   -> raised_idea_id
--   D6  department sees everything; leadership sees patterns    -> RLS + notes-free view
--   D7  self-recorded visits allowed but marked                 -> is_self_recorded, DERIVED
--   D8  the department may reply; both records kept             -> gemba_observation_replies
--
-- Q1 (value-list check): `finding` is a CHECK, not a CRUDable master table. Justified:
-- this list is load-bearing for the official transition. An institution admin adding a
-- value would silently redefine what "official" means, which is a Director decision,
-- not an admin setting. Extensibility here would be a governance hole wearing the
-- costume of flexibility.

-- ---------------------------------------------------------------------------
-- 1. The observation. One row per visit. Append-only by design: D8 is a reply,
--    never an edit, so neither side can quietly rewrite the other.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gemba_observations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id          uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  -- The specific document vouched for. NULL = a general visit to the department that
  -- makes nothing official on its own.
  artifact_id      uuid REFERENCES public.mba_dept_artifacts(id) ON DELETE SET NULL,
  institution_id   uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- Mirrors audit_attestations.attested_by / attested_at.
  observed_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- When they WENT, not when they typed it up. Supplied by the caller for that reason.
  observed_at      timestamptz NOT NULL DEFAULT now(),
  finding          text NOT NULL CHECK (finding IN ('matches', 'differs')),
  -- D7. DERIVED in the RPC from the observer's own posting / role holding, never
  -- accepted from the caller -- a self-visit that can mark itself independent is worse
  -- than no marking at all.
  is_self_recorded boolean NOT NULL DEFAULT false,
  -- D6: department-visible. The leadership view below deliberately omits this column.
  notes            text,
  -- D5: set when finding = 'differs'.
  raised_idea_id   uuid REFERENCES public.improvement_ideas(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- A visit that found a mismatch must say what it saw, or the finding is unusable
  -- by the department it is about.
  CONSTRAINT gemba_observations_differs_needs_notes
    CHECK (finding <> 'differs' OR btrim(COALESCE(notes, '')) <> '')
);

CREATE INDEX IF NOT EXISTS gemba_observations_area_observed_idx
  ON public.gemba_observations (area_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS gemba_observations_artifact_idx
  ON public.gemba_observations (artifact_id) WHERE artifact_id IS NOT NULL;

COMMENT ON TABLE public.gemba_observations IS
  'One row per visit to a department. The evidence that moves a playbook artifact from "Proposed - not yet official" to official. Append-only: corrections are replies (gemba_observation_replies), never edits.';

-- ---------------------------------------------------------------------------
-- 2. D8 - the department answers back, and BOTH records stand.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gemba_observation_replies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.gemba_observations(id) ON DELETE CASCADE,
  author_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body           text NOT NULL CHECK (btrim(body) <> ''),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gemba_observation_replies_obs_idx
  ON public.gemba_observation_replies (observation_id, created_at);

COMMENT ON TABLE public.gemba_observation_replies IS
  'The department''s answer to an observation. The observation is never edited or deleted, so a reader always sees both accounts.';

-- ---------------------------------------------------------------------------
-- 3. D1 + D3 + D4 - officialdom on the artifact.
--    Additive columns rather than a new `status` value: `approved` keeps meaning what
--    it means today, and the 42 existing rows simply never gain official_at. That is
--    D3 with no UPDATE statement -- nothing is official until somebody looks.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mba_dept_artifacts
  ADD COLUMN IF NOT EXISTS official_at    timestamptz,
  ADD COLUMN IF NOT EXISTS official_until timestamptz,
  ADD COLUMN IF NOT EXISTS official_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.mba_dept_artifacts.official_at IS
  'When a recorded gemba visit found this document matched reality. NULL = proposed, not yet official - which is what the UI has always said.';
COMMENT ON COLUMN public.mba_dept_artifacts.official_until IS
  'When officialdom lapses and the department needs another visit (D4). Interval is per-department.';

-- D4 - the institution-wide default. platform_policies.scope_type is CHECK-constrained
-- to global/institution/role/user, so there is no department scope to hang this on;
-- the per-department override therefore lives on the board itself, below.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state)
VALUES
  ('improvement.gemba_interval_days', 'global', NULL, '365'::jsonb,
   'How long a department playbook stays official after a recorded visit, unless the board sets its own interval. 14 departments at one year is about one walk a month across the institution.',
   'number', true, true, 'operational', 'published')
ON CONFLICT DO NOTHING;

ALTER TABLE public.improvement_areas
  ADD COLUMN IF NOT EXISTS gemba_interval_days integer
    CHECK (gemba_interval_days IS NULL OR gemba_interval_days BETWEEN 7 AND 3650);

COMMENT ON COLUMN public.improvement_areas.gemba_interval_days IS
  'Per-department override for how long official lasts (D4). NULL = use improvement.gemba_interval_days.';

-- ---------------------------------------------------------------------------
-- 4. Lock anon off both new tables (Supabase default-grants them otherwise).
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.gemba_observations        FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.gemba_observation_replies FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.gemba_observations        TO authenticated;
GRANT  SELECT ON TABLE public.gemba_observation_replies TO authenticated;

ALTER TABLE public.gemba_observations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gemba_observation_replies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Who may READ an observation (D6).
--    "The department" is not a role in MyJKKN, so it is defined by attachment: you
--    hold a current role on this board, or you are posted to it. Note the officers'
--    permission is used for the officer lane rather than improvement.ideas.view --
--    the CAO and Executive Administrative Officers do not hold ideas.view at all.
--    No INSERT/UPDATE/DELETE policy exists: writes go through the RPCs below only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS gemba_observations_read ON public.gemba_observations;
CREATE POLICY gemba_observations_read ON public.gemba_observations
FOR SELECT USING (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR observed_by = auth.uid()
  OR COALESCE(public.user_has_permission('improvement.area_role.assign'), false)
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
  OR EXISTS (
    SELECT 1 FROM public.hr_additional_roles h
     WHERE h.improvement_area_id = gemba_observations.area_id
       AND h.is_current
       AND h.staff_id IN (SELECT s.id FROM public.staff s WHERE s.profile_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.mba_associate_postings p
     WHERE p.area_id = gemba_observations.area_id
       AND p.associate_user_id = auth.uid()
       AND p.is_active
  )
);

DROP POLICY IF EXISTS gemba_observation_replies_read ON public.gemba_observation_replies;
CREATE POLICY gemba_observation_replies_read ON public.gemba_observation_replies
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.gemba_observations o WHERE o.id = observation_id)
);

-- ---------------------------------------------------------------------------
-- 6. D6 - what leadership sees. Counts and dates only; `notes` is absent from this
--    view by construction, not hidden by a UI that must remember to hide it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_gemba_area_summary
WITH (security_invoker = true) AS
SELECT
  a.id                                                          AS area_id,
  a.label                                                       AS department,
  count(o.id)                                                   AS visits,
  count(o.id) FILTER (WHERE o.finding = 'matches')              AS matched,
  count(o.id) FILTER (WHERE o.finding = 'differs')              AS differed,
  count(o.id) FILTER (WHERE o.is_self_recorded)                 AS self_recorded,
  max(o.observed_at)                                            AS last_visited_at
FROM public.improvement_areas a
LEFT JOIN public.gemba_observations o ON o.area_id = a.id
GROUP BY a.id, a.label;

REVOKE ALL ON public.v_gemba_area_summary FROM anon, PUBLIC;
GRANT  SELECT ON public.v_gemba_area_summary TO authenticated;

COMMENT ON VIEW public.v_gemba_area_summary IS
  'D6: leadership sees patterns, not comments. notes is deliberately not selected here - the split is enforced by the view''s shape, not by a UI remembering to omit a column.';

-- ---------------------------------------------------------------------------
-- 7. Recording a visit (D1, D2, D5, D7).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gemba_observation_record(
  p_area_id     uuid,
  p_artifact_id uuid    DEFAULT NULL,
  p_finding     text    DEFAULT 'matches',
  p_notes       text    DEFAULT NULL,
  p_observed_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_finding  text := lower(btrim(COALESCE(p_finding, '')));
  v_notes    text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_when     timestamptz := COALESCE(p_observed_at, now());
  v_is_cohort boolean;
  v_is_self  boolean;
  v_inst     uuid;   -- the board's institution (all 14 are NULL today)
  v_idea_inst uuid;  -- institution to file an improvement idea under
  v_label    text;
  v_days     integer;
  v_idea     uuid;
  v_id       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_finding NOT IN ('matches', 'differs') THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: finding must be matches or differs';
  END IF;
  IF v_finding = 'differs' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: say what differed - a finding nobody can act on is not a finding';
  END IF;
  IF v_when > now() THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: a visit cannot be recorded in the future';
  END IF;

  SELECT a.label, a.institution_id, a.gemba_interval_days
    INTO v_label, v_inst, v_days
  FROM public.improvement_areas a WHERE a.id = p_area_id;

  -- improvement_ideas.institution_id is NOT NULL and every board's is NULL, so fall
  -- back to the observer's own institution.
  SELECT COALESCE(v_inst, pr.institution_id) INTO v_idea_inst
  FROM public.profiles pr WHERE pr.id = v_uid;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: no such improvement_area %', p_area_id;
  END IF;

  -- D2: the observers are the teaching-enterprise cohorts. Read from
  -- teaching_enterprise_cohorts so adding a cohort never edits this function, and so
  -- no role name is hardcoded. Officers may also record.
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
    RAISE EXCEPTION 'fn_gemba_observation_record: only a posted associate or resident, or an officer, may record a visit'
      USING ERRCODE = '42501';
  END IF;

  -- D7: derived, never taken from the caller. You are self-recording if you hold a
  -- current role on this board or are posted to it.
  SELECT
    EXISTS (SELECT 1 FROM public.hr_additional_roles h
             WHERE h.improvement_area_id = p_area_id AND h.is_current
               AND h.staff_id IN (SELECT s.id FROM public.staff s WHERE s.profile_id = v_uid))
    OR EXISTS (SELECT 1 FROM public.mba_associate_postings p
                WHERE p.area_id = p_area_id AND p.associate_user_id = v_uid AND p.is_active)
  INTO v_is_self;

  -- D5: a mismatch becomes an improvement idea.
  --
  -- improvement_ideas.institution_id is NOT NULL, but all 14 boards carry
  -- institution_id = NULL (they are institution-wide), so the institution has to come
  -- from the observer. Resolved explicitly rather than wrapped in a catch-all handler:
  -- an EXCEPTION WHEN OTHERS here would have swallowed every failure and left D5
  -- quietly never working, which is the exact silent-failure shape this codebase
  -- keeps getting bitten by.
  --
  -- If neither the board nor the observer yields an institution, no idea is raised and
  -- raised_idea_id stays NULL on the observation -- visible in the data, not swallowed.
  IF v_finding = 'differs' AND v_idea_inst IS NOT NULL THEN
    INSERT INTO public.improvement_ideas
      (institution_id, area_id, author_id, title, problem, proposed_fix, evidence, status)
    VALUES (
      v_idea_inst, p_area_id, v_uid,
      'Playbook does not match what happens in ' || v_label,
      v_notes,
      'Either correct the playbook to describe what the department actually does, or change the practice to match the playbook. A recorded visit found the two disagree.',
      'Raised automatically from a recorded gemba visit on ' || to_char(v_when, 'DD Mon YYYY') || '.',
      'logged'
    )
    RETURNING id INTO v_idea;
  END IF;

  INSERT INTO public.gemba_observations
    (area_id, artifact_id, institution_id, observed_by, observed_at,
     finding, is_self_recorded, notes, raised_idea_id)
  VALUES
    (p_area_id, p_artifact_id, v_inst, v_uid, v_when,
     v_finding, v_is_self, v_notes, v_idea)
  RETURNING id INTO v_id;

  -- D1 + D4: a matching visit against a named artifact makes it official, until it lapses.
  IF v_finding = 'matches' AND p_artifact_id IS NOT NULL THEN
    v_days := COALESCE(
      v_days,
      (SELECT (pp.value #>> '{}')::integer FROM public.platform_policies pp
        WHERE pp.policy_key = 'improvement.gemba_interval_days'
          AND pp.scope_type = 'global' AND COALESCE(pp.is_active, true)
        LIMIT 1),
      365
    );
    UPDATE public.mba_dept_artifacts
       SET official_at    = v_when,
           official_until = v_when + make_interval(days => v_days),
           official_by    = v_uid
     WHERE id = p_artifact_id AND area_id = p_area_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_gemba_observation_record(uuid, uuid, text, text, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_gemba_observation_record(uuid, uuid, text, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. D8 - replying. Anyone who may READ the observation may answer it; the
--    observation itself is never touched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gemba_observation_reply(
  p_observation_id uuid,
  p_body           text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_body text := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_area uuid;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_reply: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_reply: a reply needs something in it';
  END IF;

  SELECT o.area_id INTO v_area FROM public.gemba_observations o WHERE o.id = p_observation_id;
  IF v_area IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_reply: no such observation %', p_observation_id;
  END IF;

  -- Same test as the read policy: attachment to the department, or an officer/admin.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('improvement.area_role.assign'), false)
    OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
    OR EXISTS (SELECT 1 FROM public.hr_additional_roles h
                WHERE h.improvement_area_id = v_area AND h.is_current
                  AND h.staff_id IN (SELECT s.id FROM public.staff s WHERE s.profile_id = v_uid))
    OR EXISTS (SELECT 1 FROM public.mba_associate_postings p
                WHERE p.area_id = v_area AND p.associate_user_id = v_uid AND p.is_active)
  ) THEN
    RAISE EXCEPTION 'fn_gemba_observation_reply: you are not attached to this department'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.gemba_observation_replies (observation_id, author_id, body)
  VALUES (p_observation_id, v_uid, v_body)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_gemba_observation_reply(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_gemba_observation_reply(uuid, text) TO authenticated;
