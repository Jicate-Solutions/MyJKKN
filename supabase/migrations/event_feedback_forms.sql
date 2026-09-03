-- ============================================================================
-- ci:allow-secdef-authenticated  fn_my_event_registration and
-- fn_event_feedback_form_open are callable by every authenticated user ON
-- PURPOSE, and neither can be used to reach another person's data.
--
--   fn_my_event_registration(event_id) is SELF-SCOPED IN ITS OWN WHERE CLAUSE:
--   every branch is pinned to (SELECT auth.uid()) -- directly via profile_id,
--   or via the caller's own profiles.learner_id. There is no argument that
--   names another user, so the most a caller can learn is whether THEY are
--   registered for an event id they already had. It is SECURITY DEFINER only
--   so it can read events_registrations past that table's own SELECT policy,
--   which is what lets a participant see the form at all.
--
--   fn_event_feedback_form_open(form_id) returns a BOOLEAN about a form's own
--   window -- is_enabled, starts_at, ends_at. It touches no user row and no
--   answer; it reports whether a survey is open. It is the freshness half of
--   the event_feedback_responses write policies, where the identity half is
--   fn_my_event_registration.
--
-- This marker is file-scoped, so note what it does NOT excuse:
-- fn_can_manage_event_feedback still carries its own super-admin / admin /
-- fn_is_event_incharge / events.view OR-chain, and save_event_feedback_form is
-- SECURITY INVOKER and authorised by the event_feedback_*_manage policies.
-- The guard's own rule still applies to anything added here later: a predicate
-- that IDENTIFIES a caller is not a predicate that AUTHORISES one.
-- ============================================================================
-- ============================================================================
-- Event Feedback Forms — coordinator-editable feedback questions per event
-- ============================================================================
-- Every event (general, tournament, marathon, induction) may carry one or more
-- FEEDBACK forms whose questions the event coordinator writes and rewrites at
-- will. Structurally this is the registration form builder again
-- (form -> sections -> questions, answers in jsonb keyed by a stable key), and
-- it deliberately copies that pattern rather than sharing its tables.
--
-- WHY NOT reuse event_registration_form* with a `purpose` discriminator:
--   listForms(), the /p/event/[id]/register public route, the fee columns
--   (fee_enabled/fee_amount) and the responses viewer all read those tables
--   UNFILTERED. A feedback row added there surfaces as a registration form on
--   the event console and inherits a payment model that makes no sense for a
--   survey. Independent tables also match the precedent already recorded in
--   event-registration-form-service.ts ("independent tables, not shared with
--   Admission — design decision #6").
--
-- WHO MAY ANSWER: registered participants only. A response therefore keys on
-- events_registrations.id, NOT on a profile: events_registrations holds
-- participant_type='external' rows (marathon runners, outside guests) that have
-- no auth.users account at all, so the registration row is the only identity
-- that exists for every respondent across all four event types. It doubles as
-- the dedup key — UNIQUE (form_id, registration_id) is one response per
-- participant per form, enforced by the database rather than by the UI.
--
-- WHO MAY EDIT: super admin / admin / fn_is_event_incharge(event_id) — the
-- existing "event coordinator" primitive that reads events.config->'incharges'
-- — or events.view holders with institution access. Same OR-chain the
-- event_registration_form*_manage policies already use, reused verbatim so the
-- two builders can never drift apart on who is allowed to touch them.
-- ============================================================================

-- ── event_feedback_forms ────────────────────────────────────────────────────
-- An event holds MANY feedback forms on purpose (a 3-day conference wants one
-- per day; a recurring event wants one per run). Each is addressed by
-- (event_id, slug) so an old link keeps resolving to the run it belonged to.
-- There is deliberately NO unique on event_id alone.
CREATE TABLE IF NOT EXISTS public.event_feedback_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Event Feedback',
  slug text NOT NULL,
  description text,
  -- The coordinator's manual open/closed switch. A new form starts CLOSED so
  -- creating one never begins collecting by surprise.
  is_enabled boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  -- Hides respondent identity in the coordinator's responses viewer. The
  -- registration_id is STILL stored — it has to be, or one-response-per-person
  -- cannot be enforced — so this is a presentation promise, not cryptographic
  -- anonymity. The UI says exactly that where the switch is shown, because a
  -- coordinator who believes otherwise would promise their attendees more than
  -- the system delivers.
  is_anonymous boolean NOT NULL DEFAULT false,
  -- Active window. Openness is DERIVED at read time
  -- (is_enabled AND now() within [starts_at, ends_at]) rather than by a job
  -- flipping is_enabled: a stored flag leaves an expired form collecting
  -- whenever the job fails, never reopens when the end date is extended, and
  -- makes "closed by hand" indistinguishable from "closed by time".
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug),
  CONSTRAINT event_feedback_forms_slug_format_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT event_feedback_forms_window_check
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
);

-- ── event_feedback_sections ─────────────────────────────────────────────────
-- event_id is denormalized onto sections and questions (not just the form) so
-- every RLS policy stays a single-join EXISTS instead of a 3-way join through
-- form_id/section_id. Same reason event_registration_form_sections does it.
CREATE TABLE IF NOT EXISTS public.event_feedback_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.event_feedback_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── event_feedback_questions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_feedback_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.event_feedback_sections(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.event_feedback_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Stable answer key. Assigned from the label when a question is first saved
  -- and then NEVER changed, because event_feedback_responses.answers is keyed
  -- by it — rewording a question must not orphan the answers already given to
  -- it. Unique per FORM, not per event (an event holds many forms).
  question_key text NOT NULL,
  question_label text NOT NULL,
  -- 'rating' is the type the registration builder has no equivalent of: a 1..N
  -- star/scale answer stored as a plain integer, which is what makes a mean
  -- score computable without parsing prose. 'section_note' asks nothing and
  -- renders as read-only guidance between questions.
  question_type text NOT NULL CHECK (question_type IN (
    'rating','text','textarea','select','multi_select','radio','checkbox',
    'number','date','section_note'
  )),
  is_required boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  placeholder text,
  help_text text,
  min_length int,
  max_length int,
  min_value numeric,
  max_value numeric,
  pattern text,
  -- [{label, value}] for select / multi_select / radio.
  options jsonb,
  -- {field, op, value} — show this question only when another question on the
  -- same form answers a certain way. Same shape as the registration builder's.
  condition jsonb,
  -- Top of the scale for a 'rating' question (5 stars, 10-point NPS-ish, …).
  -- NULL for every other type. Constrained rather than free so the responses
  -- viewer can always normalise a score to a percentage.
  rating_scale int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, question_key),
  CONSTRAINT event_feedback_questions_rating_scale_check
    CHECK (rating_scale IS NULL OR rating_scale BETWEEN 2 AND 10),
  -- A question that asks nothing can never be satisfied, so a required one
  -- would make the form permanently unsubmittable.
  CONSTRAINT event_feedback_questions_note_not_required_check
    CHECK (question_type <> 'section_note' OR is_required = false)
);

-- ── event_feedback_responses ────────────────────────────────────────────────
-- One row per (form, registration). answers is keyed by question_key, exactly
-- as events_registrations.custom_fields is keyed by field_key — which is what
-- lets save_event_feedback_form() delete and reinsert question ROWS on every
-- edit without touching a single stored answer.
CREATE TABLE IF NOT EXISTS public.event_feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.event_feedback_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.events_registrations(id) ON DELETE CASCADE,
  -- The auth identity that submitted, when there was one. NULL for an external
  -- participant answering through their registration link — they have no
  -- profiles row. Never the dedup key; registration_id is.
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_feedback_responses_form_registration_uniq
    UNIQUE (form_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_event_feedback_forms_event
  ON public.event_feedback_forms(event_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_sections_form
  ON public.event_feedback_sections(form_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_questions_form
  ON public.event_feedback_questions(form_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_questions_section
  ON public.event_feedback_questions(section_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_responses_form
  ON public.event_feedback_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_responses_event
  ON public.event_feedback_responses(event_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_responses_registration
  ON public.event_feedback_responses(registration_id);


-- ============================================================================
-- Helper functions
-- ============================================================================

-- Resolve the caller's OWN registration on an event, or NULL when they hold
-- none. Two identity paths because events_registrations records internal
-- participants either way: profile_id is set when the person registered while
-- signed in, learner_id when a roster import or bulk upload created the row
-- against their learner record instead (auth.uid() -> profiles.learner_id).
-- Cancelled and disqualified registrations are excluded — someone who withdrew
-- is not a participant and should not be answering the participant survey.
-- SECURITY DEFINER so it can read events_registrations regardless of the
-- caller's own SELECT policy on that table; it returns only the caller's row.
CREATE OR REPLACE FUNCTION public.fn_my_event_registration(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id
  FROM public.events_registrations r
  WHERE r.event_id = p_event_id
    AND r.status NOT IN ('cancelled', 'disqualified')
    AND (
      r.profile_id = (SELECT auth.uid())
      OR (
        r.learner_id IS NOT NULL
        AND r.learner_id = (
          SELECT p.learner_id FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
        )
      )
    )
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_my_event_registration(uuid) IS
  'The signed-in user''s own non-cancelled registration id on an event, or NULL. Identity resolves through events_registrations.profile_id or .learner_id (auth.uid() -> profiles.learner_id). Used to gate event feedback to registered participants.';

-- May the caller EDIT this event's feedback forms? One place, so the four
-- policies below cannot drift. Mirrors the event_registration_form*_manage
-- OR-chain: super admin, admin, the event coordinator (in-charge), or an
-- events.view holder with access to the owning institution.
CREATE OR REPLACE FUNCTION public.fn_can_manage_event_feedback(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin()
    OR public.fn_is_event_incharge(p_event_id)
    OR (
      public.user_has_permission('events.view')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event_id
          AND (e.scope = 'all_jkkn' OR public.role_has_institution_access(e.institution_id))
      )
    );
$$;

COMMENT ON FUNCTION public.fn_can_manage_event_feedback(uuid) IS
  'Authority to create/edit/delete an event''s feedback forms and questions, and to read its responses. Super admin, admin, event in-charge (events.config->incharges), or events.view + institution access.';

-- Is this form accepting answers RIGHT NOW? Enabled AND inside its window.
--
-- The same rule as feedbackFormState() in types/event-feedback.ts, restated
-- here because the client's copy is a courtesy and this one is the gate: the
-- respond page hides a closed form, but nothing stops a direct PostgREST call,
-- and "the form closed on Friday" is worthless if answers can still be written
-- on Sunday. Derived from the row rather than stored, so extending ends_at
-- reopens the form with no further action.
CREATE OR REPLACE FUNCTION public.fn_event_feedback_form_open(p_form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_feedback_forms f
    WHERE f.id = p_form_id
      AND f.is_enabled
      AND (f.starts_at IS NULL OR now() >= f.starts_at)
      AND (f.ends_at   IS NULL OR now() <= f.ends_at)
  );
$$;

COMMENT ON FUNCTION public.fn_event_feedback_form_open(uuid) IS
  'True while an event feedback form is accepting answers: is_enabled AND now() inside [starts_at, ends_at]. The server-side twin of feedbackFormState() — this one is the gate, the client copy is a courtesy.';


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.event_feedback_forms     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_feedback_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_feedback_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_feedback_responses ENABLE ROW LEVEL SECURITY;

-- Table privileges, restated explicitly.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated, service_role, so these four tables arrive with ANON already
-- holding INSERT and DELETE. Every policy below is `TO authenticated`, so RLS
-- denies anon today regardless — a role with no matching policy is refused.
-- But that safety is one permissive policy away from evaporating, and a
-- feedback table is exactly where a `USING (true)` gets added by someone
-- wiring up a public link later. Revoke the grant rather than rely on the
-- absence of a policy.
--
-- `authenticated` is revoked alongside anon deliberately: it also arrives
-- holding DELETE from those default privileges, so revoking only anon would
-- leave that in place and make the GRANT below a no-op restating privileges
-- already held.
REVOKE ALL ON public.event_feedback_forms     FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.event_feedback_sections  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.event_feedback_questions FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.event_feedback_responses FROM anon, authenticated, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_forms     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_sections  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_questions TO authenticated;
-- Responses: no UPDATE/DELETE restriction at the GRANT level because both are
-- needed — a respondent corrects their own row, a manager moderates one — and
-- the policies above are what separate those two cases.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_responses TO authenticated;

-- Read: a manager, or a registered participant of the event (who needs the
-- questions in order to answer them). Note this is NOT the registration
-- builder's `visibility IN ('public','all_jkkn')` clause — a feedback form is
-- never anonymous-readable, because only registrants may answer it.
DROP POLICY IF EXISTS "event_feedback_forms_select" ON public.event_feedback_forms;
CREATE POLICY "event_feedback_forms_select" ON public.event_feedback_forms
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
  );

DROP POLICY IF EXISTS "event_feedback_forms_manage" ON public.event_feedback_forms;
CREATE POLICY "event_feedback_forms_manage" ON public.event_feedback_forms
  FOR ALL TO authenticated
  USING (public.fn_can_manage_event_feedback(event_id))
  WITH CHECK (public.fn_can_manage_event_feedback(event_id));

DROP POLICY IF EXISTS "event_feedback_sections_select" ON public.event_feedback_sections;
CREATE POLICY "event_feedback_sections_select" ON public.event_feedback_sections
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
  );

DROP POLICY IF EXISTS "event_feedback_sections_manage" ON public.event_feedback_sections;
CREATE POLICY "event_feedback_sections_manage" ON public.event_feedback_sections
  FOR ALL TO authenticated
  USING (public.fn_can_manage_event_feedback(event_id))
  WITH CHECK (public.fn_can_manage_event_feedback(event_id));

DROP POLICY IF EXISTS "event_feedback_questions_select" ON public.event_feedback_questions;
CREATE POLICY "event_feedback_questions_select" ON public.event_feedback_questions
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
  );

DROP POLICY IF EXISTS "event_feedback_questions_manage" ON public.event_feedback_questions;
CREATE POLICY "event_feedback_questions_manage" ON public.event_feedback_questions
  FOR ALL TO authenticated
  USING (public.fn_can_manage_event_feedback(event_id))
  WITH CHECK (public.fn_can_manage_event_feedback(event_id));

-- Responses. A participant may read and write ONLY their own row, and only for
-- the registration that is actually theirs — checking registration_id against
-- fn_my_event_registration() rather than trusting the id the client sent is
-- what stops one registrant from answering as another. Managers read every
-- response but never write one: feedback is not editable by the people it is
-- about.
DROP POLICY IF EXISTS "event_feedback_responses_select" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_select" ON public.event_feedback_responses
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR registration_id = public.fn_my_event_registration(event_id)
  );

-- The window is enforced HERE, not only in the UI: a closed form must refuse
-- answers even when the write arrives straight at PostgREST.
DROP POLICY IF EXISTS "event_feedback_responses_insert" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_insert" ON public.event_feedback_responses
  FOR INSERT TO authenticated WITH CHECK (
    registration_id = public.fn_my_event_registration(event_id)
    AND public.fn_event_feedback_form_open(form_id)
  );

-- Update is the respondent's own correction, and only while the form is still
-- open — reopening the edit door after a survey closes would let someone revise
-- an answer the coordinator has already reported on. Deliberately no manager
-- branch either way: feedback is not editable by the people it is about.
DROP POLICY IF EXISTS "event_feedback_responses_update" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_update" ON public.event_feedback_responses
  FOR UPDATE TO authenticated
  USING (
    registration_id = public.fn_my_event_registration(event_id)
    AND public.fn_event_feedback_form_open(form_id)
  )
  WITH CHECK (
    registration_id = public.fn_my_event_registration(event_id)
    AND public.fn_event_feedback_form_open(form_id)
  );

-- Only a manager may delete a response (moderating abuse). A respondent
-- withdrawing their feedback would silently distort the counts.
DROP POLICY IF EXISTS "event_feedback_responses_delete" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_delete" ON public.event_feedback_responses
  FOR DELETE TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
  );


-- ============================================================================
-- save_event_feedback_form — atomic bulk save of sections + questions
-- ============================================================================
-- SECURITY INVOKER on purpose, exactly as save_event_registration_form is: the
-- _manage policies above already encode the coordinator rule, so running as the
-- caller reuses that gate verbatim with no service-role and no re-encoded auth.
-- A non-manager who calls this fails the RLS WITH CHECK inside the function,
-- which raises and rolls the whole transaction back.
--
-- Strategy: delete-all-then-reinsert. Safe because event_feedback_responses
-- .answers keys answers by question_key, never by a question row id, so
-- churning ids on every save orphans nothing.
CREATE OR REPLACE FUNCTION public.save_event_feedback_form(
  p_form_id uuid,
  p_is_enabled boolean,
  p_sections jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event_id   uuid;
  v_section    jsonb;
  v_section_id uuid;
  v_question   jsonb;
BEGIN
  SELECT event_id INTO v_event_id
    FROM public.event_feedback_forms WHERE id = p_form_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Feedback form % not found', p_form_id;
  END IF;

  UPDATE public.event_feedback_forms
     SET is_enabled = COALESCE(p_is_enabled, is_enabled),
         updated_at = now()
   WHERE id = p_form_id;

  -- Questions cascade from their section, so deleting sections clears both.
  DELETE FROM public.event_feedback_sections WHERE form_id = p_form_id;

  FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb))
  LOOP
    INSERT INTO public.event_feedback_sections (form_id, event_id, title, display_order)
    VALUES (
      p_form_id,
      v_event_id,
      COALESCE(NULLIF(v_section->>'title', ''), 'Section'),
      COALESCE((v_section->>'display_order')::int, 0)
    )
    RETURNING id INTO v_section_id;

    FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'questions', '[]'::jsonb))
    LOOP
      INSERT INTO public.event_feedback_questions (
        section_id, form_id, event_id,
        question_key, question_label, question_type,
        is_required, display_order,
        placeholder, help_text,
        min_length, max_length, min_value, max_value, pattern,
        options, condition, rating_scale
      )
      VALUES (
        v_section_id, p_form_id, v_event_id,
        v_question->>'question_key',
        v_question->>'question_label',
        v_question->>'question_type',
        COALESCE((v_question->>'is_required')::boolean, false),
        COALESCE((v_question->>'display_order')::int, 0),
        NULLIF(v_question->>'placeholder', ''),
        NULLIF(v_question->>'help_text', ''),
        (v_question->>'min_length')::int,
        (v_question->>'max_length')::int,
        (v_question->>'min_value')::numeric,
        (v_question->>'max_value')::numeric,
        NULLIF(v_question->>'pattern', ''),
        CASE WHEN v_question->'options'   = 'null'::jsonb THEN NULL ELSE v_question->'options'   END,
        CASE WHEN v_question->'condition' = 'null'::jsonb THEN NULL ELSE v_question->'condition' END,
        (v_question->>'rating_scale')::int
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.save_event_feedback_form(uuid, boolean, jsonb) IS
  'Atomically replace an event feedback form''s sections and questions with the desired state. SECURITY INVOKER — authorization is the event_feedback_*_manage RLS policies.';

-- EXECUTE is granted explicitly rather than left to PUBLIC. (The registration
-- builder learned this the hard way: a DROP FUNCTION during its multi-form
-- migration discarded the ACL and handed EXECUTE back to PUBLIC.)
REVOKE ALL ON FUNCTION public.save_event_feedback_form(uuid, boolean, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_event_feedback_form(uuid, boolean, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_my_event_registration(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_event_registration(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_can_manage_event_feedback(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_event_feedback_form_open(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_event_feedback_form_open(uuid) TO authenticated;
