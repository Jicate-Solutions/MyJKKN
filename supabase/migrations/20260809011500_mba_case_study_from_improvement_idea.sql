-- 2026-08-02 - A verified improvement can become a graded case study.
--
-- WHY THIS EXISTS
-- The MBA programme posts 29 associates as independent observers across 14
-- operational departments. A gemba visit that finds the written process does not
-- match reality raises an improvement idea. Today that is where the trail ends:
-- nothing is produced that a learner can show anyone, and public.improvement_ideas
-- holds ZERO rows.
--
-- DIRECTOR DECISIONS IMPLEMENTED (2026-08-02)
--   D1  writing a case study is a GRADED part of the MBA programme, not optional
--         -> grade / graded_by / graded_at / grade_notes + fn_case_study_grade
--   D2  cases live INSIDE MyJKKN only for now, not public
--         -> no anon grant; RLS 'published' means published to signed-in readers
--   D3  AI drafts first and the learner rewrites it
--         -> fn_case_study_start assembles a real prompt from the recorded facts and
--            enqueues it THROUGH fn_ai_enqueue; the learner then owns fn_case_study_save
--         -> and the job type is allow_rule 'permission:improvement.ideas.view', NOT the
--            sibling's 'seat_owner', which resolves to a one-member allowlist and would
--            have refused all 44 associates. A deliberate widening - see section 8.
--
-- WHOSE CASE IT IS
-- A case study is graded coursework attributed to ONE learner, so only the author of
-- the improvement idea may start the case about it. Anything wider produces a case
-- bylined to somebody other than the person whose improvement it was - and, under the
-- narrowing SELECT policy below, invisible to that person. See section 4.
--
-- THE RULE THAT MAKES THIS SAFE
-- A case may only be written about an improvement that was ACTUALLY MADE and whose
-- value was ACTUALLY VERIFIED: status = 'verified' AND value_holds IS TRUE. That
-- converts publication into the reward for CLOSING the loop rather than for finding a
-- fault, and it means no case ever describes an unresolved failure of a real
-- department. This eligibility test is the point of the whole feature, not a detail.
--
-- WHY public.ss_case_studies AND NOT A NEW TABLE (production-code-sweep finding)
-- Two case-study tables already exist. public.case_studies is the Startup Studio's,
-- actively read by lib/services/startup-studio/case-study-service.ts.
-- public.ss_case_studies is the Solutions Studio's, created 2026-02-27 in
-- 20260227185501_create_startup_studio_tables.sql, and is EMPTY (0 rows) with no
-- application code reading or writing it - the only repo references are generated
-- rows in types/supabase.ts. Its three foreign keys (problem_id, attempt_id,
-- outcome_id) point at the ss_problem_* chain, which never received data either. A
-- third case-study table would be a parallel mechanism, so this extends the empty one
-- and leaves those three columns NULL. Its status enum (ss_case_study_status) already
-- carries exactly the five states this workflow needs, so no enum value is added.
--
-- SECURITY: this migration also closes a live exposure it did not create. The table's
-- ACL today is anon=arwdDxt - a full Supabase default grant - and its only SELECT
-- policy is "TO authenticated USING (true)". Both are fixed below.

-- ---------------------------------------------------------------------------
-- 1. The link back to the improvement, the byline, and the grade.
--    All additive and all nullable: existing rows (there are none) stay valid, and
--    the Solutions Studio columns are untouched.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ss_case_studies
  ADD COLUMN IF NOT EXISTS improvement_idea_id uuid REFERENCES public.improvement_ideas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS author_id           uuid REFERENCES public.profiles(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grade               numeric,
  ADD COLUMN IF NOT EXISTS graded_by           uuid REFERENCES public.profiles(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS graded_at           timestamptz,
  ADD COLUMN IF NOT EXISTS grade_notes         text;

COMMENT ON COLUMN public.ss_case_studies.improvement_idea_id IS
  'The verified improvement this case is about. NULL on Solutions Studio rows, which come from the ss_problem_* chain instead.';
COMMENT ON COLUMN public.ss_case_studies.author_id IS
  'The learner byline. Set from auth.uid() by fn_case_study_start and never accepted from a caller.';
COMMENT ON COLUMN public.ss_case_studies.grade IS
  'D1: the case study is a graded part of the MBA programme. NULL until a board.manage holder grades it.';

-- One improvement yields at most one case, so two associates cannot both claim the
-- same closed loop. Partial, so the Solutions Studio rows (improvement_idea_id NULL)
-- are unaffected and can still be many.
CREATE UNIQUE INDEX IF NOT EXISTS ss_case_studies_improvement_idea_uniq
  ON public.ss_case_studies (improvement_idea_id)
  WHERE improvement_idea_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ss_case_studies_author_idx
  ON public.ss_case_studies (author_id) WHERE author_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Lock the table.
--
--    Two separate defects are being closed here, and the second is easy to miss:
--
--    (a) anon holds arwdDxt from Supabase's default privileges. REVOKE closes it.
--
--    (b) `authenticated` ALSO holds arwdDxt from the same default. A bare
--        "GRANT SELECT TO authenticated" on top of that is a NO-OP - the role keeps
--        INSERT/UPDATE/DELETE, and the grant only LOOKS like it restricted something.
--        Omitting a GRANT is not the same as revoking one. So authenticated is
--        revoked first and then granted SELECT, which makes the grant mean what it
--        says. Verified safe: 0 rows, and no application code reads or writes this
--        table today.
--
--    service_role is deliberately left with full access - it is how the AI drain and
--    admin routes reach the row - and its existing policy below is not touched.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.ss_case_studies FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.ss_case_studies TO authenticated;

ALTER TABLE public.ss_case_studies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Who may READ a case.
--    The policy being replaced is "TO authenticated USING (true)", which let every
--    one of 7,055 profiles read every learner's unfinished draft. A draft is a
--    learner's work in progress and is nobody else's business until they submit it.
--
--    Note the officers' permission is used rather than improvement.ideas.view: cao,
--    executive_admin_officer and mba_faculty do NOT hold ideas.view (verified live -
--    ideas.view is true only on ceo, mba_associate, cse_resident, cse_facilitator),
--    and gating them out is a defect this codebase has already shipped twice.
--
--    No INSERT/UPDATE/DELETE policy exists on purpose: every write goes through the
--    SECURITY DEFINER functions below, mirroring gemba_observations.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ss_case_studies_select ON public.ss_case_studies;
CREATE POLICY ss_case_studies_select ON public.ss_case_studies
FOR SELECT USING (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR author_id = auth.uid()
  OR status = 'published'
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
);

COMMENT ON POLICY ss_case_studies_select ON public.ss_case_studies IS
  'D2: cases are internal to MyJKKN. A draft is readable by its author and the graders only; everyone signed in reads it once it is published.';

-- ---------------------------------------------------------------------------
-- 4. Starting a case. This is where eligibility is enforced.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_case_study_start(p_idea_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_idea       public.improvement_ideas%ROWTYPE;
  v_existing   uuid;
  v_id         uuid;
  v_area       text;
  v_prompt     text;
  v_enq        jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_start: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_idea FROM public.improvement_ideas WHERE id = p_idea_id;
  IF v_idea.id IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_start: no such improvement idea %', p_idea_id;
  END IF;

  -- AUTHORISATION: the idea's own author, and nobody else.
  --
  -- Authorisation is checked BEFORE eligibility, so an unrelated caller cannot use the
  -- error message to learn whether somebody else's idea was verified.
  --
  -- An earlier draft of this function also admitted anyone actively posted to the
  -- department the idea is about. That was wrong in a way that only showed up once the
  -- narrowing SELECT policy above exists. The row this function INSERTs carries
  -- author_id = the WRITER, not the idea's author, so a posted associate writing up
  -- somebody else's improvement produced a case the idea's own author could not see:
  -- not their case, not published, and they hold no grader permission. Their idea then
  -- read as un-written-up while another learner held the only case for it - and the
  -- UNIQUE index below means they could never write their own. The screen's "ideas
  -- ready to write up" lane counts exactly that way (it reads ss_case_studies for its
  -- own ideas), so it under-counted for the same reason.
  --
  -- Restricting to the author is the fix rather than widening the read, because a case
  -- study is GRADED COURSEWORK ATTRIBUTED TO ONE LEARNER. The Director's ruling of
  -- 2026-08-02 is that the byline is the learner's, and the screen already agrees: it
  -- only ever offers ideas from CaseStudyService.myWritingLane(currentUserId), which
  -- filters improvement_ideas on author_id = the viewer. The posted-associate lane was
  -- therefore not reachable from any screen either - it existed only in this function.
  --
  -- No super-admin bypass on purpose, matching fn_case_study_save and
  -- fn_case_study_submit, which are already author-only with no bypass: a super admin
  -- starting a case would be bylined as its author on another learner's work AND would
  -- consume the one slot the UNIQUE index allows. The break-glass path is service_role,
  -- which the ss_case_studies_service_all policy still grants in full.
  IF v_idea.author_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'fn_case_study_start: you may only write up an improvement you raised yourself - this one was raised by somebody else'
      USING ERRCODE = '42501';
  END IF;

  -- THE ELIGIBILITY RULE. A case may only be written about an improvement that was
  -- actually made and whose value was actually confirmed. Note IS TRUE rather than a
  -- bare boolean test: value_holds is nullable, and "not yet checked" must refuse
  -- exactly as firmly as "checked and it did not hold".
  --
  -- The refusal names WHICH half failed. The two halves are independent -
  -- improvement_idea_status carries 'applied' as a state of its own, so an idea can
  -- sit at status='applied' with value_holds already true. A message that only
  -- distinguished value_holds NULL from non-NULL told that learner their "verified
  -- value did not hold", which is false: the value did hold, the STATUS disqualified
  -- it. Being told the wrong rule sends them to fix the wrong thing.
  IF NOT (v_idea.status = 'verified' AND v_idea.value_holds IS TRUE) THEN
    RAISE EXCEPTION
      'fn_case_study_start: a case study can only be written about an improvement that was made and whose value was verified. %. Close the loop first.',
      CASE
        WHEN v_idea.status = 'verified' AND v_idea.value_holds IS NULL
          THEN 'This idea is "verified", but its value has not been checked yet'
        WHEN v_idea.status = 'verified'
          THEN 'This idea is "verified", but its verified value did not hold'
        WHEN v_idea.value_holds IS TRUE
          THEN format('Its value was checked and it did hold, but the idea itself is "%s", not "verified"', v_idea.status)
        WHEN v_idea.value_holds IS NULL
          THEN format('This idea is "%s", not "verified", and its value has not been checked', v_idea.status)
        ELSE
          format('This idea is "%s", not "verified", and its verified value did not hold', v_idea.status)
      END;
  END IF;

  -- Clear message ahead of the unique index, which is still the real guarantee.
  SELECT c.id INTO v_existing
    FROM public.ss_case_studies c WHERE c.improvement_idea_id = p_idea_id;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'fn_case_study_start: a case study already exists for this improvement (%)', v_existing;
  END IF;

  -- title is NOT NULL on the table, so it is seeded from the idea. The learner
  -- replaces it - D3 says the AI drafts and the learner rewrites.
  --
  -- generated_by is deliberately LEFT AT ITS TABLE DEFAULT ('manual') here and is
  -- promoted to the AI marker further down only if the enqueue is actually accepted.
  -- The screen shows an "an AI wrote this first draft" banner off that exact marker,
  -- so writing it up front would print that banner over a blank page no AI is coming
  -- to fill. 'manual' is the truthful value for a case the learner writes by hand.
  INSERT INTO public.ss_case_studies
    (improvement_idea_id, author_id, title, status, theme)
  VALUES
    (p_idea_id, v_uid, v_idea.title, 'draft', 'improvement')
  RETURNING id INTO v_id;

  -- D3: the AI writes the first draft. It can only do that if it is actually TOLD
  -- something - the job type's prompt_template is the bare glue '{{prompt}}', so
  -- whatever sits under payload.prompt IS the entire instruction the model receives;
  -- there is no other text to fall back on. That is not a convention this file is
  -- inventing: EVERY job type already on the '{{prompt}}' template carries a
  -- payload.prompt on EVERY one of its rows, with no exceptions and none blank
  -- (read live 2026-08-04, before this migration inserts its own row). Stated as
  -- the invariant rather than as a count on purpose - the count moves every time
  -- somebody adds a job type, the invariant is the thing worth relying on. This
  -- row's input_schema declares 'prompt' required, which is the majority form but
  -- not universal: a few of the existing ones declare an empty input_schema and
  -- still populate the key on every row. Assemble it from what is already recorded
  -- about this improvement: that is the whole point of drafting from a verified
  -- idea rather than from a blank page.
  SELECT a.label INTO v_area
    FROM public.improvement_areas a WHERE a.id = v_idea.area_id;

  v_prompt :=
    'You are helping an MBA associate at JKKN, an Indian higher-education group, START '
    || 'the write-up of an improvement they actually made in a real department. You produce '
    || 'a PROPOSED FIRST DRAFT that the learner will then rewrite in their own words before '
    || 'handing it in for a grade. It is a starting point so nobody faces a blank page - it '
    || 'is never the finished submission.' || E'\n\n'
    || 'WHAT ACTUALLY HAPPENED (the only facts you may use):' || E'\n'
    || 'Department / area: ' || COALESCE(v_area, 'not recorded') || E'\n'
    || 'Working title: ' || v_idea.title || E'\n'
    || 'What the associate found: ' || v_idea.problem || E'\n'
    || 'What was changed: ' || v_idea.proposed_fix || E'\n'
    || 'Expected impact at the time: ' || COALESCE(NULLIF(btrim(v_idea.expected_impact), ''), 'not recorded') || E'\n'
    || 'Evidence recorded at the time: ' || COALESCE(NULLIF(btrim(v_idea.evidence), ''), 'not recorded') || E'\n'
    || 'Outcome: the improvement was applied and its value was checked afterwards and CONFIRMED to hold'
    || CASE WHEN v_idea.verified_value_inr IS NULL
            THEN ', though no rupee figure was recorded.'
            ELSE ', worth a verified INR ' || trim(to_char(v_idea.verified_value_inr, 'FM999999999990.00')) || '.' END
    || E'\n\n'
    || 'HARD RULES' || E'\n'
    || '1. Use ONLY the facts above. Never invent or estimate a number, a date, a name or a quotation.' || E'\n'
    || '2. Where a fact is not recorded, say so plainly in one short clause. Do not pad around it.' || E'\n'
    -- House terminology, spelled out because the model has to be told the actual
    -- words. (scripts/ci/check-terminology-delta.py scans .tsx/.jsx/.ts/.md/.mdx
    -- only - EXfP at line 36 - so naming them in a .sql prompt is not a gate hit.)
    || '3. Plain India-context English. Write "learner", never "student"; write "team members", '
    || 'never "staff". No emojis, no markdown headings.' || E'\n'
    || '4. Write about the improvement and the process, never about a named individual being at fault.' || E'\n\n'
    || 'RETURN ONLY one JSON object and nothing around it:' || E'\n'
    || '{"title": "<= 90 characters", "summary": "2-3 sentences", '
    || '"full_content": "350-600 words in four parts: what was found on the gemba visit, what was '
    || 'changed, what happened afterwards, and what the learner would do differently next time", '
    || '"key_takeaways": ["3-5 short items"], "learning_objectives": ["2-4 short items"]}';

  -- Enqueued THROUGH fn_ai_enqueue, not by INSERTing into ai_jobs. There are no
  -- triggers on public.ai_jobs, so a raw INSERT would silently bypass every knob on
  -- the job-type row: enabled (the kill switch in the config UI), allow_rule,
  -- max_inflight and daily_cap_per_user would all be inert on this path.
  --
  -- fn_ai_enqueue answers a refusal by RETURNING {ok:false, error} rather than raising,
  -- which is why the case survives one. It is not literally incapable of raising, and
  -- claiming so would be the kind of absolute that stops being checked: it does not trap
  -- unique_violation from ai_jobs_inflight_dedupe_idx (UNIQUE on
  -- (job_type, payload->>'_dedupe') for pending/claimed/running rows), and it runs under
  -- SET statement_timeout='10s' across a pg_advisory_xact_lock, so a contended lock could
  -- in principle time out. Neither is reachable ON THIS PATH: the dedupe key is
  -- 'mba-case-study:' || the id of the row inserted moments ago, so it is unique by
  -- construction, and the UNIQUE partial index on improvement_idea_id forbids a second
  -- case for the same idea in the first place. The advisory lock is keyed on
  -- (uid, job_type) and this is a single interactive call per learner. If either ever did
  -- raise, the whole statement rolls back - the case would not be half-created.
  --
  -- A refusal must NOT cost the learner their case. The case is already inserted above;
  -- being refused an AI draft simply means they write it themselves, and the learner sees
  -- the truth because generated_by stays 'manual'.
  v_enq := public.fn_ai_enqueue(
    'mba.draft_case_study',
    jsonb_build_object(
      'prompt',  v_prompt,
      '_ctx',    jsonb_build_object(
                   'case_study_id',       v_id,
                   'improvement_idea_id', p_idea_id,
                   'area_id',             v_idea.area_id,
                   'model',               'sonnet'),
      '_dedupe', 'mba-case-study:' || v_id::text)
  );

  IF COALESCE(v_enq->>'ok', 'false') = 'true' THEN
    UPDATE public.ss_case_studies
       SET generated_by = 'mba.draft_case_study', updated_at = now()
     WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_case_study_start(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_case_study_start(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The learner writing it. Only the author, only while it is a draft.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_case_study_save(
  p_case_id             uuid,
  p_title               text,
  p_summary             text,
  p_full_content        text,
  p_key_takeaways       text[],
  p_learning_objectives text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_author uuid;
  v_status public.ss_case_study_status;
  v_title  text := NULLIF(btrim(COALESCE(p_title, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_save: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT c.author_id, c.status INTO v_author, v_status
    FROM public.ss_case_studies c WHERE c.id = p_case_id;
  IF v_author IS NULL AND v_status IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_save: no such case study %', p_case_id;
  END IF;

  IF v_author IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'fn_case_study_save: only the author may edit this case study'
      USING ERRCODE = '42501';
  END IF;

  -- Once submitted it is out of the learner's hands: a grader must be reading a
  -- fixed text, not one that can change underneath them.
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'fn_case_study_save: this case study is "%" and can no longer be edited', v_status;
  END IF;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_save: a case study needs a title';
  END IF;

  UPDATE public.ss_case_studies
     SET title               = v_title,
         summary             = p_summary,
         full_content        = p_full_content,
         key_takeaways       = p_key_takeaways,
         learning_objectives = p_learning_objectives,
         updated_at          = now()
   WHERE id = p_case_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_case_study_save(uuid, text, text, text, text[], text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_case_study_save(uuid, text, text, text, text[], text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Handing it in.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_case_study_submit(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_author uuid;
  v_status public.ss_case_study_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_submit: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT c.author_id, c.status INTO v_author, v_status
    FROM public.ss_case_studies c WHERE c.id = p_case_id;
  IF v_author IS NULL AND v_status IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_submit: no such case study %', p_case_id;
  END IF;

  IF v_author IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'fn_case_study_submit: only the author may hand in this case study'
      USING ERRCODE = '42501';
  END IF;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'fn_case_study_submit: this case study is already "%"', v_status;
  END IF;

  UPDATE public.ss_case_studies
     SET status = 'under_review', updated_at = now()
   WHERE id = p_case_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_case_study_submit(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_case_study_submit(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Grading it (D1).
--    improvement.board.manage is true on exactly four roles - ceo, cao,
--    executive_admin_officer, mba_faculty - read live 2026-08-02.
--
--    Three separate things have to be true before a grade may be recorded, and
--    holding the permission is only the first of them.
--
--    (a) THE CASE MUST HAVE BEEN HANDED IN. Only 'under_review' may be graded.
--        Without this a case still sitting in 'draft' - never submitted, still
--        being edited - could be graded and pushed straight to 'published',
--        skipping the learner's hand-in entirely.
--
--    (b) THE AUTHOR MAY NEVER GRADE THEIR OWN CASE, whatever permissions they
--        hold. Checked against the row itself and NOT short-circuited by
--        is_super_admin.
--
--        HONEST ABOUT THE POPULATION: today nobody can hit this. Read live
--        2026-08-04, 10 people hold improvement.board.manage across those four
--        roles (6 of them via mba_faculty) and NOT ONE of them appears in
--        mba_associate_postings in any state, active or inactive - 57 posting
--        rows, 29 distinct associates, zero overlap. The 14 super admins are
--        likewise absent from that table. So the guard currently refuses nobody,
--        and an earlier draft of this comment claimed a real overlapping
--        population that the data does not support.
--
--        It is kept anyway, and the reason is not "defence in depth" hand-waving.
--        The two sets are disjoint by convention, not by construction: nothing in
--        the schema stops a role holding board.manage from being posted as an
--        associate tomorrow, it is one INSERT into mba_associate_postings, and
--        the MBA programme's own shape - practitioners who both teach and improve
--        their department - makes that a plausible posting rather than a
--        far-fetched one. The check costs one comparison against a column already
--        selected on the line above, and the failure it prevents (a grade
--        self-awarded on a graded MBA deliverable) is one nobody would catch
--        from the outside. Cheap now, load-bearing the day the overlap appears.
--
--    (c) A GRADE IS FINAL - RE-GRADING IS FORBIDDEN rather than history-erasing.
--        (a) delivers this by construction: grading moves the case to 'approved'
--        or 'published', neither of which is 'under_review', so a second grade
--        can never overwrite the first. Nothing is silently demoted from
--        'published' back to 'approved' any more. Reopening is deliberately NOT
--        provided here - if the programme later needs a correction path it must
--        be an explicit, audited reopen, not a silent second UPDATE. This also
--        matches the screen, whose review lane queries status='under_review'
--        only, so no reachable action is lost.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_case_study_grade(
  p_case_id uuid,
  p_grade   numeric,
  p_notes   text,
  p_publish boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_status public.ss_case_study_status;
  v_author uuid;
  v_pub    boolean := COALESCE(p_publish, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_grade: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
  ) THEN
    RAISE EXCEPTION 'fn_case_study_grade: only the improvement board faculty and officers may grade a case study'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.status, c.author_id INTO v_status, v_author
    FROM public.ss_case_studies c WHERE c.id = p_case_id;
  IF v_status IS NULL AND v_author IS NULL THEN
    RAISE EXCEPTION 'fn_case_study_grade: no such case study %', p_case_id;
  END IF;

  -- (b) Nobody grades their own work. Deliberately NOT wrapped in the super-admin
  -- bypass above: a super admin who wrote the case is still its author.
  IF v_author IS NOT NULL AND v_author = v_uid THEN
    RAISE EXCEPTION 'fn_case_study_grade: you wrote this case study, so you cannot grade it - it needs another member of the improvement board'
      USING ERRCODE = '42501';
  END IF;

  -- (a) + (c) It must have been handed in, and a grade is recorded exactly once.
  IF v_status IS DISTINCT FROM 'under_review' THEN
    RAISE EXCEPTION
      'fn_case_study_grade: only a case study that has been handed in can be graded. This one is "%" - %',
      v_status,
      CASE WHEN v_status = 'draft'
             THEN 'the learner has not submitted it yet'
           WHEN v_status IN ('approved', 'published')
             THEN 'it has already been graded, and a grade is not overwritten'
           ELSE 'it is not open for grading' END
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.ss_case_studies
     SET grade        = p_grade,
         graded_by    = v_uid,
         graded_at    = now(),
         grade_notes  = p_notes,
         reviewed_by  = v_uid,
         status       = CASE WHEN v_pub THEN 'published'::public.ss_case_study_status
                             ELSE 'approved'::public.ss_case_study_status END,
         approved_by  = v_uid,
         published_at = CASE WHEN v_pub THEN now() ELSE published_at END,
         updated_at   = now()
   WHERE id = p_case_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_case_study_grade(uuid, numeric, text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_case_study_grade(uuid, numeric, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. The AI job type (D3). Shape taken from the sibling row
--    'mba.draft_dept_artifact' rather than guessed - same lane, provider, model,
--    tool_set, allow_rule, output_target, prompt_template and input_schema.
--
--    ONE FIELD IS DELIBERATELY DIFFERENT: schedulable is false here, where the
--    sibling has true. schedulable=true advertises a job type as something a cron
--    may fire on its own. This one is on-demand per learner - it exists only to
--    draft into a case row that a specific person just created, and every fact in
--    its prompt comes from that one improvement idea. A scheduled fire would have
--    no case to write into and no idea to read from, so it would either do nothing
--    or write somewhere it was not asked to. Copying the flag across was a
--    copy-paste, not a decision.
--
--    THE OTHER FIELD THAT IS DELIBERATELY DIFFERENT: allow_rule.
--
--    The sibling carries 'seat_owner'. Copied across, that made D3 ("AI drafts first")
--    false for every learner on day one. fn_ai_enqueue resolves 'seat_owner' by testing
--    whether the caller is listed in public.ai_model_config.config_json ->
--    'max_lane_user_ids' for feature_key = 'ai_query.natural_language'. Read live on
--    2026-08-02, that allowlist has EXACTLY ONE member, against 44 holders of the
--    mba_associate role. So every learner would have been refused, silently, on a
--    Director decision that says the AI drafts first.
--
--    'permission:improvement.ideas.view' instead. fn_ai_enqueue already supports the
--    'permission:%' form - it calls user_has_permission on the suffix - and 9 production
--    job types already use it (admission.agentic_query, admission.ai_response,
--    admission.ai_service, ai_query.chat, bug.cluster_fix, bug.fixability,
--    cdc.career_guidance, session_feedback.suggest_improvement, work_pulse.analyze).
--    This is the established mechanism, not a new one.
--
--    THIS IS A DELIBERATE ACCESS WIDENING, and it is scoped to THIS ONE job type. The
--    seat allowlist itself is untouched: it is a live cost control on a different
--    feature and widening it would have loosened all 48 seat_owner job types at once.
--    improvement.ideas.view is held by exactly four roles read live 2026-08-02 - ceo,
--    mba_associate, cse_resident, cse_facilitator - so the population that can enqueue is
--    the 44 associates plus the ceo and cse holders, and each of them can enqueue at most
--    ONE draft per verified idea (the UNIQUE partial index on improvement_idea_id, plus
--    max_inflight = 3). Volume today is bounded by zero: improvement_ideas holds 0 rows,
--    and eligibility additionally requires status = 'verified' AND value_holds IS TRUE.
--    Reverting is a one-word change back to 'seat_owner' if the Director's cost view
--    differs, or a config-UI edit on the row once it exists.
--
--    ON CONFLICT DO NOTHING is kept rather than DO UPDATE: allow_rule is a config row the
--    Director edits from the config UI, and a re-run must not stamp that edit back.
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, provider, model_id, external_allowed)
VALUES
  ('mba.draft_case_study',
   'MBA · Case Study Draft',
   'Config carrier — drafts the first version of a learner''s case study about a verified improvement. The learner then rewrites it (D3).',
   '{{prompt}}',
   'none',
   'job.result',
   false,
   'max',
   'permission:improvement.ideas.view',  -- NOT 'seat_owner': see the block above
   3,
   false,  -- schedulable: on-demand per learner, never fired by a cron
   true,
   '[{"key": "prompt", "type": "textarea", "label": "Assembled prompt", "required": true}]'::jsonb,
   'anthropic',
   'sonnet',
   false)
ON CONFLICT (job_type) DO NOTHING;
