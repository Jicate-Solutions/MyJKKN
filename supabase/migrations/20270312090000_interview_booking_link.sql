-- Updated: 2026-09-24 - The interview booking link: one shared public link that
-- books a hiring conversation already knowing who the candidate is and which post.
--
-- THE GAP THIS CLOSES. 20261218090000_interview_meeting_link.sql joined an
-- interview to the booking it was held as, but only by hand: somebody opens the
-- meeting afterwards and picks the candidate and the post. 27 of 217 production
-- bookings (measured 2026-09-15) were hiring conversations whose only record of
-- that fact was free text the visitor typed. This link asks the post up front and
-- writes the candidate and the interview row at booking time.
--
-- The Director's 16 decisions (16 and 22 Sep 2026) are the spec. The numbers
-- cited below (#n) refer to them.
--
-- WHAT IS DELIBERATELY NOT HERE. Round number, no-show history, "already
-- rejected or hired" and "never applied for this post" are all DERIVED when a
-- page is read, from rows that already exist (hr_recruitment_interviews,
-- hr_recruitment_candidates.status, hr_job_applications). Storing any of them
-- would create a second copy that can disagree with the first.
--
-- The booking itself needs no schema: meeting_bookings.source is free text
-- (NOT NULL DEFAULT 'direct', no CHECK), and interview-link bookings are written
-- with source = 'interview-link' / 'interview-link-staff'. That value is what the
-- 2-hour change rule (#11) keys on, so the rule never touches ordinary meetings.
--
-- FILE ONLY at PR time. Application to production is Director-gated.

-- ============================================================================
-- 1. A candidate can now come from the booking link (#4)
-- ============================================================================
-- The CHECK was declared inline in CREATE TABLE (supabase/setup/01_tables.sql),
-- so its name is Postgres's generated one. It is looked up by what it checks
-- rather than assumed, then re-added under that same conventional name, which
-- also makes a re-run drop and re-add the widened version harmlessly.
--
-- The value list is the one in types/hr-recruitment.ts (CandidateSource), which
-- matches every literal the services write. If production holds a source value
-- outside it, ADD CONSTRAINT fails loudly on validation — it cannot silently
-- drop a value.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.hr_recruitment_candidates'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%public_careers_page%'
  LOOP
    EXECUTE format('ALTER TABLE public.hr_recruitment_candidates DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.hr_recruitment_candidates
  ADD CONSTRAINT hr_recruitment_candidates_source_check
  CHECK (source IN (
    'hr_submission',
    'principal_submission',
    'hod_submission',
    'internal_transfer',
    'learner_graduate',
    'public_careers_page',
    'email_ingest',
    'interview_booking'
  ));

-- ============================================================================
-- 2. The CV link stays mandatory for everyone except a booking-link candidate
-- ============================================================================
-- R3.4 made cvviz_url NOT NULL. A person booking an interview from a public form
-- has no CV link to give, and #2 fixed the form's questions, so asking for one is
-- not an option. The rule is narrowed rather than dropped: every other source
-- still cannot write a candidate without a CV. Existing rows all satisfy it.
ALTER TABLE public.hr_recruitment_candidates
  ALTER COLUMN cvviz_url DROP NOT NULL;

ALTER TABLE public.hr_recruitment_candidates
  DROP CONSTRAINT IF EXISTS hr_recruitment_candidates_cv_required;

ALTER TABLE public.hr_recruitment_candidates
  ADD CONSTRAINT hr_recruitment_candidates_cv_required
  CHECK (cvviz_url IS NOT NULL OR source = 'interview_booking');

COMMENT ON CONSTRAINT hr_recruitment_candidates_cv_required
  ON public.hr_recruitment_candidates IS
  'R3.4 (CV link mandatory), narrowed 2026-09-24: a candidate created by the interview booking link may arrive without one — the form cannot ask for it (#2). Every other source still must supply it.';

-- ============================================================================
-- 3. Looking a booker up by email (#5, #7)
-- ============================================================================
-- NOT unique, on purpose. Two people sharing one family email is normal at JKKN
-- (#7), so email cannot identify a person; it only finds the people who might be
-- this booker. The booking path asks which of them it is.
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_email_lower
  ON public.hr_recruitment_candidates (lower(email));

-- ============================================================================
-- 4. Call-back requests when there is no free time (#14)
-- ============================================================================
-- When the Director's calendar has no free slot for weeks, the link takes name,
-- post and phone so the office can ring, instead of turning the person away.
--
-- LIFECYCLE, and why it has more than one way to close. A request is 'open'
-- until the office marks it 'done'. The office can also reopen it. And when the
-- same person later books an interview for the same post through the link, the
-- booking path closes their open request itself — otherwise the office list
-- fills with people who already sorted themselves out.
--
-- post_title is a snapshot: a post that is later renamed or deleted must not
-- leave a request the office cannot read.
--
-- Written only by the booking route on a service-role client (the same shape as
-- the public careers route). There is no INSERT policy, so no signed-in user and
-- no anonymous caller can create one directly.
CREATE TABLE IF NOT EXISTS public.hr_interview_callback_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid REFERENCES public.hr_recruitment_jobs(id) ON DELETE SET NULL,
  post_title      text NOT NULL CHECK (length(btrim(post_title)) > 0),
  institution_id  uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  name            text NOT NULL CHECK (length(btrim(name)) > 0),
  phone           text NOT NULL CHECK (length(btrim(phone)) > 0),
  email           text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  outcome_note    text,
  handled_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at      timestamptz,
  closed_by_booking_id uuid REFERENCES public.meeting_bookings(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_interview_callback_requests IS
  'People who opened the interview booking link when no time was free (#14). The office rings them. open → done by the office (reopenable), or closed automatically when the same person books the same post (closed_by_booking_id).';
COMMENT ON COLUMN public.hr_interview_callback_requests.closed_by_booking_id IS
  'Set when the request was closed because the person went on to book an interview for this post through the link. NULL when the office closed it by hand.';

CREATE INDEX IF NOT EXISTS idx_hr_interview_callback_requests_open
  ON public.hr_interview_callback_requests (created_at DESC)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_hr_interview_callback_requests_job
  ON public.hr_interview_callback_requests (job_id);

DROP TRIGGER IF EXISTS hr_interview_callback_requests_updated_at
  ON public.hr_interview_callback_requests;
CREATE TRIGGER hr_interview_callback_requests_updated_at
  BEFORE UPDATE ON public.hr_interview_callback_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hr_interview_callback_requests ENABLE ROW LEVEL SECURITY;

-- The anonymous key never reaches this table. Names and phone numbers of people
-- applying for jobs are exactly what must not leak through a public link.
REVOKE ALL ON public.hr_interview_callback_requests FROM anon;

-- Read and update mirror hr_recruitment_jobs exactly (production read-back,
-- rls_initplan_wrap_sweep.sql:2860-2863): the same people who can see a post
-- can see who asked to be called about it.
DROP POLICY IF EXISTS hr_interview_callback_requests_select
  ON public.hr_interview_callback_requests;
CREATE POLICY hr_interview_callback_requests_select
  ON public.hr_interview_callback_requests
  FOR SELECT
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.view'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_interview_callback_requests_update
  ON public.hr_interview_callback_requests;
CREATE POLICY hr_interview_callback_requests_update
  ON public.hr_interview_callback_requests
  FOR UPDATE
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.edit'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.edit'))
        AND public.role_has_institution_access(institution_id))
  );

-- ============================================================================
-- 5. Settings (config-table pattern — never literals in code)
-- ============================================================================
-- Guarded on IDENTITY (policy_key + global scope), never on value, so a later
-- Director edit is never resurrected by re-running this seed. WHERE NOT EXISTS,
-- not ON CONFLICT: platform_policies' uniqueness is an expression index (42P10).
--
-- Both are read on the SERVER with a service-role client. fn_get_policy is not
-- callable by anon (REVOKEd 2026-07-31 after it leaked webhook tokens), so a
-- public page reading it through the visitor's session would silently get the
-- in-code default and ignore any edit made here.

-- 5a. Whose calendar interviews land in, and which of their meeting types (#12).
-- The link books onto this host's meeting type, so the event, the slots, the
-- buffers and the Meet link are the host's own — no second calendar mechanism.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active)
SELECT
  'hr.recruitment.interview_booking.host',
  'global',
  NULL,
  '{"handle": "omm", "type_slug": "interview"}'::jsonb,
  'The interview booking link books onto this person''s meeting type, so every interview lands in their calendar (#12). handle = their /meet address; type_slug = the short code of the meeting type used for interviews. The link shows "not open yet" until that meeting type exists and is live.',
  'object',
  'operational',
  'hr_recruitment',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'hr.recruitment.interview_booking.host'
     AND scope_type = 'global' AND scope_id IS NULL
);

-- 5b. How close to the interview a candidate may still move or cancel it (#11).
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_widget, ui_category, is_system, is_active)
SELECT
  'hr.recruitment.interview_booking.change_cutoff_min',
  'global',
  NULL,
  to_jsonb(120),
  'A candidate may move or cancel their own interview freely until this many minutes before it starts. After that the link tells them to contact the office (#11). Applies only to interviews booked through the interview link, never to ordinary meetings.',
  'number',
  'operational',
  'number',
  'hr_recruitment',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'hr.recruitment.interview_booking.change_cutoff_min'
     AND scope_type = 'global' AND scope_id IS NULL
);
