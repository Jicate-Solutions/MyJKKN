-- ============================================================================
-- 20271007161139_hr_duty_playbooks_and_lessons.sql
-- ----------------------------------------------------------------------------
-- HR staff harness, part 4 — playbooks, the lessons log and credited authorship.
-- Design page: artifacts/hr-staff-harness-design-2026-10-01.html ("Playbooks
-- and the lessons log"). Reasons become rules, and authors are named.
--
-- WHAT THIS FILE ADDS
--   (a) hr_duty_reason_codes (+ _audit, + trigger) — a config table (shared
--       mixin, docs/architecture/config-table-pattern.md). Per duty, a short
--       list of reasons with lowercase keywords and the playbook line each
--       reason suggests. Seeded for L1 L2 A3 S2 S3 G2, each with an 'other'.
--   (b) hr_duty_lessons — one row per rejection / reversal a PERSON decided,
--       sorted by keyword from the reason text people already type. The text
--       itself is never kept: only the keyword bucket, the duty, the college,
--       the time and a pointer to the source record.
--   (c) hr_playbook_lines — the playbook shown on each duty screen. Every line
--       names the person credited with it (authored_by).
--   (d) hr_playbook_line_proposals — suggested lines waiting for the HR head.
--   (e) functions: harvest, propose, suggest, decide, retire, read, credit list.
--   (f) two platform_policies rows: threshold (3) and window (30 days).
--   (g) ai_routine_schedules 'hr-playbook-lessons' — Monday 07:13 IST.
--
-- DUTY CODES: every duty_code column carries the same CHECK regex as the
-- proof-of-done migration (20271007161123). These codes are the same keys as
-- hr_duty_definitions.config_key in draft #4152 (20270613101207); a later
-- change may join on them. There is deliberately NO foreign key: #4152 is not
-- merged, and a playbook must not disappear if a duty definition is retired.
--
-- Default taken, overrule here: the 'HR head' who accepts or declines playbook
--   lines is anyone holding a new key, hr.harness.playbooks.manage. This
--   migration grants it to no role, so only super admins can decide until the
--   Director grants it.
-- Default taken, overrule here: a reason seen 3 times in 30 days drafts a
--   proposed line. Both numbers are platform_policies rows; if either is
--   unreadable, nothing is proposed.
-- Default taken, overrule here: reasons are gathered automatically from the
--   reason text people already type when rejecting (leave, comp-off,
--   attendance corrections, documents, photos, HR forms) and sorted by
--   keyword. No reject dialog is changed. Text that matches no keyword is
--   filed as 'other', which never drafts a line. Only the keyword bucket is
--   kept, never the words (a reason can hold medical details).
-- Default taken, overrule here: a rejection made by the system, not a person,
--   is not a lesson: a row with no decider recorded is skipped, and so is a
--   reason starting with one of the system's own texts (the automatic leave
--   rejection "No leave balance available", comp-off "Automatically
--   rejected" and "Month closed over outstanding claims", photo "Superseded
--   by a newer photograph" and "Refused automatically"). A comp-off claim
--   decided before its decider was recorded is skipped too.
-- Default taken, overrule here: any team member may suggest a line, credited
--   by name. Nobody may accept their own suggestion. A line drafted from
--   repeated reasons is credited to the person who accepted it, and shows how
--   many reasons it came from. If the decider changes the words before
--   accepting, the line names both: suggested by one person, edited by the
--   other.
-- Default taken, overrule here: playbooks and author names are visible to
--   team members only (a staff row), plus super admins, admins and holders of
--   the manage key. A learner or parent is refused. The contributors list is
--   sorted by name, never by count, so it credits people without ranking them.
-- Default taken, overrule here: no message is sent to anyone. New proposals
--   wait on the /hr/playbooks page.
-- Default taken, overrule here: playbook cards appear on six duty screens:
--   leave approvals, attendance corrections, document verification, photo
--   review, HR form inbox and recruitment approvals. The comp-off screen is
--   left out because other work is editing it.
-- Default taken, overrule here: keywords match at the START of a word, so
--   'document' also matches 'documents' but 'late' does not match 'related'.
--   The first code by match_order wins.
-- Default taken, overrule here: a line the HR head DECLINED is not proposed
--   again from the same reason for 90 days, the same quiet period as an
--   accepted line, so a declined idea does not come back every Monday.
-- Default taken, overrule here: a lesson whose record has no college (an HR
--   form sent without one) is visible to super admins and admins only.
-- Default taken, overrule here: a lesson's time is the decision's own time
--   stamp, never the row's last-edit time, so a later edit cannot log the same
--   rejection twice; a rejected record with no decision time is skipped.
-- Default taken, overrule here: retiring a line needs a short note, kept on
--   the line (retire_note), the same as declining a proposal.
--
-- ⚠️ TIMEZONE: minute_of_day is IST and fn_ai_routine_claim_due floors it to a
-- 15-minute slot. 433 = 07:13 IST, which fires in the 07:00 slot. That is
-- intended; do not "fix" it to 420.
-- ⚠️ AUTH: the dispatcher calls app/api/cron/hr-playbook-lessons with
-- `Authorization: Bearer <CRON_SECRET>` only.
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (a) hr_duty_reason_codes — config table, shared mixin
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_reason_codes (
  -- shared config mixin (config-table-pattern.md, verbatim)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,                  -- '<duty_code>.<code>', e.g. 'L1.late_application'
  display_name  text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.profiles(id),
  change_reason text,

  -- typed columns
  duty_code      text NOT NULL
                   CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  code           text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label          text NOT NULL CHECK (char_length(label) BETWEEN 3 AND 80),
  -- Lowercase keywords. Letters, digits, spaces, apostrophes and hyphens only,
  -- so the matcher can splice them into a regex without escaping.
  match_terms    text[] NOT NULL DEFAULT '{}',
  match_order    integer NOT NULL DEFAULT 100,  -- lower is tried first
  suggested_line text CHECK (suggested_line IS NULL OR char_length(suggested_line) BETWEEN 10 AND 240),

  CONSTRAINT hr_duty_reason_codes_key_shape CHECK (config_key = duty_code || '.' || code),
  CONSTRAINT hr_duty_reason_codes_terms_lowercase
    CHECK (array_to_string(match_terms, '|') = lower(array_to_string(match_terms, '|'))),
  CONSTRAINT hr_duty_reason_codes_terms_plain
    CHECK (array_to_string(match_terms, '|') ~ '^([a-z0-9][a-z0-9 ''-]*[a-z0-9](\|[a-z0-9][a-z0-9 ''-]*[a-z0-9])*)?$'),
  CONSTRAINT hr_duty_reason_codes_line_unless_other
    CHECK (code = 'other' OR suggested_line IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_reason_codes_active_unique
  ON public.hr_duty_reason_codes (duty_code, code) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_reason_codes_config_key_active_unique
  ON public.hr_duty_reason_codes (config_key) WHERE is_active = true;

COMMENT ON TABLE public.hr_duty_reason_codes IS
  'Per HR duty, the short list of reasons a rejection or reversal is sorted into (by keyword), and the playbook line each reason suggests. config_key = duty_code.code. Config table (shared mixin). 20271007161139.';

ALTER TABLE public.hr_duty_reason_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_duty_reason_codes_read ON public.hr_duty_reason_codes;
CREATE POLICY hr_duty_reason_codes_read ON public.hr_duty_reason_codes
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS hr_duty_reason_codes_write ON public.hr_duty_reason_codes;
CREATE POLICY hr_duty_reason_codes_write ON public.hr_duty_reason_codes
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
REVOKE ALL ON public.hr_duty_reason_codes FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.hr_duty_reason_codes TO authenticated;

CREATE TABLE IF NOT EXISTS public.hr_duty_reason_codes_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     uuid NOT NULL REFERENCES public.hr_duty_reason_codes(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    uuid REFERENCES public.profiles(id),
  old_value     jsonb,
  new_value     jsonb,
  change_reason text
);
ALTER TABLE public.hr_duty_reason_codes_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_duty_reason_codes_audit_read ON public.hr_duty_reason_codes_audit;
CREATE POLICY hr_duty_reason_codes_audit_read ON public.hr_duty_reason_codes_audit
  FOR SELECT USING (public.is_super_admin());
REVOKE ALL ON public.hr_duty_reason_codes_audit FROM anon, PUBLIC;
GRANT SELECT ON public.hr_duty_reason_codes_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_hr_duty_reason_codes_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  INSERT INTO public.hr_duty_reason_codes_audit (config_id, changed_by, old_value, new_value, change_reason)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.change_reason);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_reason_codes_audit() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS hr_duty_reason_codes_audit_trg ON public.hr_duty_reason_codes;
CREATE TRIGGER hr_duty_reason_codes_audit_trg
  BEFORE UPDATE ON public.hr_duty_reason_codes
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_reason_codes_audit();

-- Seed: the duties whose reasons are readable on main. Re-runs never clobber
-- an edited row (keyed on the active config_key).
INSERT INTO public.hr_duty_reason_codes
  (config_key, display_name, description, duty_code, code, label, match_terms, match_order, suggested_line)
SELECT v.duty_code || '.' || v.code, v.label, v.description, v.duty_code, v.code, v.label,
       v.match_terms, v.match_order, v.suggested_line
  FROM (VALUES
  -- L1 — leave requests (rejection_reason, revoke_reason)
  ('L1','document_missing','Supporting document missing','A leave type that needs a certificate was sent without one.',
   ARRAY['document','certificate','proof','medical','attachment','attach'], 10,
   'Open the attached document before deciding. If a leave type needs one and it is missing, ask for it first instead of rejecting.'),
  ('L1','late_application','Applied after the deadline','The request came in later than the leave type allows.',
   ARRAY['late','deadline','in advance','prior notice','advance notice','short notice'], 20,
   'Check the leave type''s notice period against the applied date before anything else; say which rule was missed when you reject.'),
  ('L1','no_cover','No cover for those days','Classes, duties or exams on those days had no one to cover them.',
   ARRAY['cover','workload','exam','examination','alternate','arrangement','shortage'], 30,
   'Confirm who covers the person''s work on those days before approving; if no one can, say which day and suggest another date.'),
  ('L1','no_balance','Not enough leave balance','The request is more than the balance left.',
   ARRAY['balance','exhausted','no leave','insufficient','exceed'], 40,
   'Look at the balance shown in the request before deciding; offer loss of pay or another leave type instead of a bare rejection.'),
  ('L1','overlap','Dates overlap another request','The same dates are already applied for or approved.',
   ARRAY['duplicate','overlap','already','twice','same date'], 50,
   'Check the person''s other requests for the same dates before deciding, so one of the two is withdrawn rather than both rejected.'),
  ('L1','other','Other reason','Did not match any keyword.', ARRAY[]::text[], 1000, NULL),

  -- L2 — comp-off claims (rejection_reason)
  ('L2','no_proof','No proof of the day worked','No punch or record shows the claimed day was worked.',
   ARRAY['biometric','punch','proof','attendance','no record','not worked'], 10,
   'Match the claimed day against the biometric punches before deciding; a claim with no punch needs a written note from the person who assigned the work.'),
  ('L2','not_off_day','The day was not a holiday or weekly off','The claimed date was an ordinary working day.',
   ARRAY['working day','not a holiday','regular day','weekday','not holiday'], 20,
   'Check the calendar first: comp-off is only for work done on a holiday or weekly off.'),
  ('L2','expired','Claimed after the one-month limit','The claim came in after the credit would have lapsed.',
   ARRAY['expired','validity','one month','deadline','late'], 30,
   'Check the worked date: a claim more than a month old has lapsed and cannot be credited.'),
  ('L2','not_assigned','Work was not assigned beforehand','Nobody asked for the work on that day.',
   ARRAY['not assigned','without approval','prior approval','permission','not instructed'], 40,
   'Ask who assigned the work on that day and note their name in the decision.'),
  ('L2','other','Other reason','Did not match any keyword.', ARRAY[]::text[], 1000, NULL),

  -- A3 — attendance corrections (rejection_reason)
  ('A3','no_proof','No proof of presence','Nothing shows the person was present at the time asked for.',
   ARRAY['proof','evidence','biometric','cctv','register','not seen'], 10,
   'Ask for one piece of proof of presence (register, gate entry or a colleague''s confirmation) before deciding.'),
  ('A3','late_request','Requested too late','The correction came in after the period closed.',
   ARRAY['late','deadline','period closed','locked','closed'], 20,
   'Decide corrections before the month is closed; after that the record is locked and the request can only be rejected.'),
  ('A3','wrong_details','Wrong status or time asked for','The status or the in/out time asked for does not match.',
   ARRAY['wrong','incorrect','mismatch','time','status'], 30,
   'Compare the asked-for time with the punches on that day and correct only what the proof supports.'),
  ('A3','repeated','Repeated requests for the same reason','The same correction keeps being asked for.',
   ARRAY['repeated','again','frequent','habitual','many times'], 40,
   'When the same correction is asked for again, talk to the person about the cause instead of rejecting each one.'),
  ('A3','other','Other reason','Did not match any keyword.', ARRAY[]::text[], 1000, NULL),

  -- S2 — document verification (verification_notes on rejected)
  ('S2','unreadable','Scan unclear or unreadable','The upload cannot be read.',
   ARRAY['blur','unclear','unreadable','not clear','illegible','dark'], 10,
   'Zoom in on the scan before verifying; if any line cannot be read, reject with "please rescan in good light".'),
  ('S2','wrong_document','Wrong document uploaded','The file is not the document asked for.',
   ARRAY['wrong','different','incorrect','not the','mismatch'], 20,
   'Check the document title against the slot it was uploaded to before reading the rest.'),
  ('S2','incomplete','Pages or signature missing','A page, side or signature is missing.',
   ARRAY['missing','incomplete','page','signature','sign','back side'], 30,
   'Count the pages and look for the signature and seal before verifying.'),
  ('S2','expired','Document has expired','The validity date has passed.',
   ARRAY['expired','expiry','outdated','renew'], 40,
   'Check the validity date on the document; an expired one is rejected with a request for the renewed copy.'),
  ('S2','other','Other reason','Did not match any keyword.', ARRAY[]::text[], 1000, NULL),

  -- S3 — team member photographs (review_note on rejected)
  ('S3','not_clear','Face not clear','The face is blurred, dark or in shadow.',
   ARRAY['blur','unclear','not clear','dark','light','shadow'], 10,
   'Look at the face at full size; reject only when the eyes and features cannot be made out.'),
  ('S3','background','Background not plain','The background is busy or coloured.',
   ARRAY['background','wall','plain'], 20,
   'A plain light background is required; say so in the note so the next photo is right first time.'),
  ('S3','dress','Not in formal dress','The dress is not formal.',
   ARRAY['dress','formal','attire','uniform','casual'], 30,
   'Check the dress against the photo guide before approving; name what to change in the note.'),
  ('S3','angle','Face not facing the camera','The face is turned or tilted.',
   ARRAY['angle','side','front','facing','straight','tilted'], 40,
   'The face should look straight at the camera; ask for a retake when it is turned.'),
  ('S3','other','Other reason','Did not match any keyword.', ARRAY[]::text[], 1000, NULL),

  -- G2 — HR forms (approval_history entries with action 'reject')
  ('G2','missing_attachment','Supporting file not attached','The form needs a file that was not attached.',
   ARRAY['attach','attachment','upload','document','proof'], 10,
   'Open every attached file before deciding; when one is missing, say exactly which file is needed.'),
  ('G2','missing_details','Required details missing','A required answer is blank or incomplete.',
   ARRAY['missing','incomplete','not filled','fill','details','blank'], 20,
   'Read every answer before deciding and name the blank ones in the reason.'),
  ('G2','wrong_form','Wrong form used','The request belongs on a different form.',
   ARRAY['wrong form','different form','not the right','incorrect form'], 30,
   'When the request belongs on another form, name that form in the reason.'),
  ('G2','not_eligible','Not eligible under the policy','The policy does not allow this request.',
   ARRAY['eligible','eligibility','policy','not allowed','rule'], 40,
   'Quote the policy rule that applies when you reject, so the person knows what would make them eligible.'),
  ('G2','other','Other reason','Did not match any keyword.', ARRAY[]::text[], 1000, NULL)
  ) AS v(duty_code, code, label, description, match_terms, match_order, suggested_line)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.hr_duty_reason_codes r
    WHERE r.config_key = v.duty_code || '.' || v.code AND r.is_active = true
 );


-- ----------------------------------------------------------------------------
-- (b) hr_duty_lessons — the lessons log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_lessons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code      text NOT NULL
                   CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  institution_id uuid,                 -- NULL when the record has no college
  item_table     text NOT NULL,
  item_id        uuid NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('reject','reversal','reopen','send_back')),
  reason_code    text NOT NULL,        -- the keyword bucket; the reason's words are never kept
  source         text NOT NULL CHECK (source IN ('harvest')),
  occurred_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_duty_lessons_once UNIQUE (duty_code, item_table, item_id, kind, occurred_at)
);
CREATE INDEX IF NOT EXISTS hr_duty_lessons_pattern_idx
  ON public.hr_duty_lessons (duty_code, reason_code, occurred_at DESC);

COMMENT ON TABLE public.hr_duty_lessons IS
  'One row per rejection or reversal a person decided on an HR duty, with the reason sorted into a keyword bucket (reason_code). The reason text itself is never stored, and no name is: only the bucket, the duty, the college, the time and a pointer to the source record (item_table, item_id), which is the only way back to the person. Gathered weekly (source=harvest). 20271007161139.';

ALTER TABLE public.hr_duty_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_duty_lessons_select ON public.hr_duty_lessons;
CREATE POLICY hr_duty_lessons_select ON public.hr_duty_lessons
  FOR SELECT USING (
    public.is_super_admin() OR public.is_admin()
    OR (public.user_has_permission('hr.harness.playbooks.manage')
        AND public.role_has_institution_access(institution_id))
  );
REVOKE ALL ON public.hr_duty_lessons FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.hr_duty_lessons TO authenticated;


-- ----------------------------------------------------------------------------
-- (d) hr_playbook_line_proposals — created before (c) for the FK
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_playbook_line_proposals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code      text NOT NULL
                   CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  proposed_text  text NOT NULL CHECK (char_length(proposed_text) BETWEEN 10 AND 240),
  source         text NOT NULL CHECK (source IN ('suggestion','lesson_pattern')),
  reason_code    text,
  -- {count, window_days, first_at, last_at} only: no item ids, no names.
  evidence       jsonb,
  suggested_by   uuid REFERENCES public.profiles(id),
  status         text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','declined')),
  decided_by     uuid REFERENCES public.profiles(id),
  decided_at     timestamptz,
  decision_note  text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  edited_text    text CHECK (edited_text IS NULL OR char_length(edited_text) BETWEEN 10 AND 240),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_playbook_proposals_evidence_shape CHECK (
    evidence IS NULL OR (
      jsonb_typeof(evidence) = 'object'
      AND evidence - ARRAY['count','window_days','first_at','last_at'] = '{}'::jsonb
    )
  ),
  CONSTRAINT hr_playbook_proposals_source_fields CHECK (
    (source = 'suggestion' AND suggested_by IS NOT NULL AND evidence IS NULL)
    OR (source = 'lesson_pattern' AND suggested_by IS NULL AND reason_code IS NOT NULL
        AND evidence ? 'count')
  ),
  CONSTRAINT hr_playbook_proposals_decided_fields CHECK (
    (status = 'proposed') = (decided_at IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_playbook_proposals_one_open_pattern
  ON public.hr_playbook_line_proposals (duty_code, reason_code)
  WHERE status = 'proposed' AND source = 'lesson_pattern';
CREATE INDEX IF NOT EXISTS hr_playbook_proposals_open_idx
  ON public.hr_playbook_line_proposals (status, duty_code);
CREATE INDEX IF NOT EXISTS hr_playbook_proposals_suggested_by_idx
  ON public.hr_playbook_line_proposals (suggested_by) WHERE suggested_by IS NOT NULL;

COMMENT ON TABLE public.hr_playbook_line_proposals IS
  'Playbook lines waiting for the HR head (hr.harness.playbooks.manage): suggestions by team members (credited by name) and lines drafted from a reason seen often (lesson_pattern). 20271007161139.';

ALTER TABLE public.hr_playbook_line_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_playbook_proposals_select ON public.hr_playbook_line_proposals;
CREATE POLICY hr_playbook_proposals_select ON public.hr_playbook_line_proposals
  FOR SELECT USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('hr.harness.playbooks.manage')
    OR suggested_by = auth.uid()
  );
REVOKE ALL ON public.hr_playbook_line_proposals FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.hr_playbook_line_proposals TO authenticated;


-- ----------------------------------------------------------------------------
-- (c) hr_playbook_lines — what every duty screen shows
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_playbook_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code          text NOT NULL
                       CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  line_text          text NOT NULL CHECK (char_length(line_text) BETWEEN 10 AND 240),
  position           integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  authored_by        uuid NOT NULL REFERENCES public.profiles(id),   -- the credited person
  source             text NOT NULL CHECK (source IN ('hr_head','suggestion','lesson_pattern')),
  source_proposal_id uuid REFERENCES public.hr_playbook_line_proposals(id),
  lesson_count       integer CHECK (lesson_count IS NULL OR lesson_count > 0),
  accepted_by        uuid NOT NULL REFERENCES public.profiles(id),
  accepted_at        timestamptz NOT NULL DEFAULT now(),
  -- Set when the decider changed the words before accepting; the card then
  -- names both people ("suggested by X · edited by Y").
  edited_by          uuid REFERENCES public.profiles(id),
  retired_by         uuid REFERENCES public.profiles(id),
  retired_at         timestamptz,
  retire_note        text CHECK (retire_note IS NULL OR char_length(retire_note) <= 500),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_playbook_lines_retired_fields CHECK ((status = 'retired') = (retired_at IS NOT NULL)),
  CONSTRAINT hr_playbook_lines_lesson_count CHECK (source <> 'lesson_pattern' OR lesson_count IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS hr_playbook_lines_duty_idx
  ON public.hr_playbook_lines (duty_code, position) WHERE status = 'active';

COMMENT ON TABLE public.hr_playbook_lines IS
  'The short playbook shown on each HR duty screen. authored_by is the person credited, edited_by the decider who changed the words (if any); names are read from profiles at read time, never copied. Readable by team members (a staff row), super admins, admins and holders of hr.harness.playbooks.manage (fn_hr_playbook_can_read). 20271007161139.';

-- Who may read playbooks and the names on them: a team member (a staff row,
-- the same check fn_hr_playbook_suggest uses), a super admin or admin, or a
-- holder of the manage key. A learner or parent is not. NULL from any check
-- counts as no.
-- ci:allow-secdef-authenticated fn_hr_playbook_can_read takes no argument and returns only whether the CALLER may read playbooks; the row-level policy on hr_playbook_lines and the three read functions call it as the signed-in user.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_can_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.profile_id = auth.uid())
    OR COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('hr.harness.playbooks.manage'), false)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_can_read() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_can_read() TO authenticated;

ALTER TABLE public.hr_playbook_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_playbook_lines_select ON public.hr_playbook_lines;
CREATE POLICY hr_playbook_lines_select ON public.hr_playbook_lines
  FOR SELECT USING (public.fn_hr_playbook_can_read());
REVOKE ALL ON public.hr_playbook_lines FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.hr_playbook_lines TO authenticated;


-- ----------------------------------------------------------------------------
-- (e) functions
-- ----------------------------------------------------------------------------

-- Reason text -> code. First active code (by match_order, then code) with a
-- keyword at the start of a word in the text; else 'other'.
-- Mirrored for unit tests by lib/services/hr/playbooks/lessons-harvest.ts.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_reason_match(p_duty text, p_text text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT rc.code
      FROM public.hr_duty_reason_codes rc
     WHERE rc.duty_code = p_duty
       AND rc.is_active = true
       AND rc.code <> 'other'
       AND EXISTS (
         SELECT 1 FROM unnest(rc.match_terms) t(term)
          WHERE lower(COALESCE(p_text, '')) ~ ('\m' || t.term)
       )
     ORDER BY rc.match_order, rc.code
     LIMIT 1
  ), 'other');
$$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_reason_match(text, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_reason_match(text, text) TO service_role;

-- A positive whole number from a global platform_policies row, else NULL.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_policy_int(p_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN jsonb_typeof(p.value) = 'number' AND (p.value #>> '{}') ~ '^[1-9][0-9]{0,4}$'
             THEN (p.value #>> '{}')::integer
         END
    FROM public.platform_policies p
   WHERE p.policy_key = p_key
     AND p.scope_type = 'global'
     AND p.scope_id IS NULL
     AND p.is_active = true
     -- a draft row is not a decision
     AND COALESCE(p.publication_state, 'published') = 'published'
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_policy_int(text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_policy_int(text) TO service_role;

-- A reason the system wrote, not a person. Each pattern matches the start of
-- an automatic rejection text written on one of the six sources (by a
-- function or a one-off correction); a rejection that matches one is not a
-- lesson. Patterns are lowercase regexes, matched on the trimmed, lowercased
-- text. A new automatic rejection text must be added here.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_reason_is_system(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM unnest(ARRAY[
        -- L1 leave
        '^no leave balance available',                                    -- fn_hr_leave_reject_unfunded (20261005100000)
        '^no .+ balance available for .+ day\(s\) available as of',       -- 20260930120000
        '^payroll-verified per paid leave summary',                       -- 20260916080000, 20260916084500
        '^jun-aug 2026 casual leave was corrected',                       -- 20260916091000
        '^june-august 2026 casual leave is recorded as one day per month', -- 20260922130000
        '^august 2026 allows one casual leave day',                       -- 20260907140000
        '^casual leave outside june-august 2026 is reset',                -- 20260907140000
        -- L2 comp-off
        '^automatically rejected',                 -- fn_hr_comp_off_reject_expired_claims (20260911180000)
        '^month closed over outstanding claims',   -- closing a month over pending claims (20260827200000)
        -- S3 photographs
        '^superseded by a newer photograph',       -- a newer photograph replaces a pending one (20261224164500)
        '^refused automatically'                   -- the BUG-006144 backlog refusal (20261224164500)
      ]) AS t(pattern)
     WHERE lower(btrim(COALESCE(p_text, ''))) ~ t.pattern
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_reason_is_system(text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_reason_is_system(text) TO service_role;

-- Gather reasons into the lessons log. Service role only (the weekly cron).
-- Only decisions a PERSON made are lessons: a row with no decider recorded
-- (final_approver_id / revoked_by, approved_by / revoked_by, approver_id,
-- verified_by, reviewed_by, the history entry's actor_id) is skipped, and so
-- is a reason the system wrote (fn_hr_duty_reason_is_system). The reason's
-- words are only sorted into a keyword bucket here; they are never stored.
-- The time of a lesson is the decision's own stamp (final_decided_at /
-- revoked_at, approved_at, verified_at, reviewed_at, the history entry's
-- 'at'), never updated_at: a later edit to the row would otherwise give the
-- same decision a new time and a second lesson. A row with no decision stamp
-- is skipped. Each source runs on its own: a source whose table or column is not what this
-- file expects is reported as {"error": ...} in the result (the cron then
-- answers non-200), and the other sources still run. A second run inserts
-- nothing (ON CONFLICT DO NOTHING on the natural key).
CREATE OR REPLACE FUNCTION public.fn_hr_duty_lessons_harvest(p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_n   integer;
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'p_since is required' USING ERRCODE = '22004';
  END IF;

  -- L1 — leave: a rejection, or a reversal of an approved request (revoked_at set).
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'L1', s.institution_id, 'hr_leave_applications', a.id, x.kind,
           public.fn_hr_duty_reason_match('L1', x.txt), 'harvest', x.at
      FROM public.hr_leave_applications a
      LEFT JOIN public.staff s ON s.id = a.employee_id
      CROSS JOIN LATERAL (SELECT
        CASE WHEN a.revoked_at IS NOT NULL THEN 'reversal' ELSE 'reject' END AS kind,
        CASE WHEN a.revoked_at IS NOT NULL THEN COALESCE(a.revoke_reason, a.rejection_reason)
             ELSE a.rejection_reason END AS txt,
        CASE WHEN a.revoked_at IS NOT NULL THEN a.revoked_by ELSE a.final_approver_id END AS decider,
        COALESCE(a.revoked_at, a.final_decided_at) AS at) x
     WHERE a.status = 'rejected'
       AND x.at IS NOT NULL AND x.at >= p_since
       AND x.decider IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(x.txt)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('L1', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('L1', jsonb_build_object('error', SQLERRM));
  END;

  -- L2 — comp-off claims. A claim decided before its decider was recorded
  -- (approved_by NULL) is skipped: nothing tells it apart from the nightly
  -- automatic rejection.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'L2', s.institution_id, 'hr_comp_off_credits', c.id, x.kind,
           public.fn_hr_duty_reason_match('L2', x.txt), 'harvest', x.at
      FROM public.hr_comp_off_credits c
      LEFT JOIN public.staff s ON s.id = c.employee_id
      CROSS JOIN LATERAL (SELECT
        CASE WHEN c.revoked_at IS NOT NULL THEN 'reversal' ELSE 'reject' END AS kind,
        CASE WHEN c.revoked_at IS NOT NULL THEN COALESCE(c.revoke_reason, c.rejection_reason)
             ELSE c.rejection_reason END AS txt,
        CASE WHEN c.revoked_at IS NOT NULL THEN c.revoked_by ELSE c.approved_by END AS decider,
        COALESCE(c.revoked_at, c.approved_at) AS at) x
     WHERE c.status = 'rejected'
       AND x.at IS NOT NULL AND x.at >= p_since
       AND x.decider IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(x.txt)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('L2', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('L2', jsonb_build_object('error', SQLERRM));
  END;

  -- A3 — attendance corrections.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'A3', s.institution_id, 'hr_attendance_regularizations', r.id, 'reject',
           public.fn_hr_duty_reason_match('A3', r.rejection_reason), 'harvest', r.approved_at
      FROM public.hr_attendance_regularizations r
      LEFT JOIN public.staff s ON s.id = r.employee_id
     WHERE r.status = 'rejected'
       AND r.approved_at >= p_since
       AND r.approver_id IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(r.rejection_reason)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('A3', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('A3', jsonb_build_object('error', SQLERRM));
  END;

  -- S2 — document verification.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'S2', d.institution_id, 'hr_employee_documents', d.id, 'reject',
           public.fn_hr_duty_reason_match('S2', d.verification_notes), 'harvest', d.verified_at
      FROM public.hr_employee_documents d
     WHERE d.verification_status = 'rejected'
       AND d.verified_at >= p_since
       AND d.verified_by IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(d.verification_notes)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('S2', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('S2', jsonb_build_object('error', SQLERRM));
  END;

  -- S3 — team member photographs.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'S3', p.institution_id, 'hr_staff_photo_submissions', p.id, 'reject',
           public.fn_hr_duty_reason_match('S3', p.review_note), 'harvest', p.reviewed_at
      FROM public.hr_staff_photo_submissions p
     WHERE p.status = 'rejected'
       AND p.reviewed_at >= p_since
       AND p.reviewed_by IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(p.review_note)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('S3', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('S3', jsonb_build_object('error', SQLERRM));
  END;

  -- G2 — HR forms: each 'reject' entry in approval_history made by a person
  -- (actor_id set; the service writes the actor of every entry).
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'G2', f.institution_id, 'hr_form_submissions', f.id, 'reject',
           public.fn_hr_duty_reason_match('G2', e->>'reason'), 'harvest', (e->>'at')::timestamptz
      FROM public.hr_form_submissions f
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(f.approval_history) = 'array' THEN f.approval_history ELSE '[]'::jsonb END
      ) e
     WHERE e->>'action' = 'reject'
       AND NULLIF(btrim(e->>'actor_id'), '') IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(e->>'reason')
       -- only entries whose time reads as a date; one malformed entry must not
       -- stop the whole source
       AND (e->>'at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
       AND (e->>'at')::timestamptz >= p_since
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('G2', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('G2', jsonb_build_object('error', SQLERRM));
  END;

  RETURN v_out;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_lessons_harvest(timestamptz) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_lessons_harvest(timestamptz) TO service_role;

-- Draft a playbook line for any reason seen often. Service role only.
-- Fails CLOSED: an unreadable threshold or window proposes nothing.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_propose_from_lessons()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold integer := public.fn_hr_playbook_policy_int('hr.harness.playbooks.pattern_threshold');
  v_window    integer := public.fn_hr_playbook_policy_int('hr.harness.playbooks.pattern_window_days');
  v_n         integer;
BEGIN
  IF v_threshold IS NULL OR v_window IS NULL THEN
    RAISE WARNING 'hr playbooks: threshold or window policy unreadable; nothing proposed';
    RETURN 0;
  END IF;

  WITH counts AS (
    SELECT l.duty_code, l.reason_code,
           count(*)::integer AS n,
           min(l.occurred_at) AS first_at,
           max(l.occurred_at) AS last_at
      FROM public.hr_duty_lessons l
     WHERE l.reason_code <> 'other'
       AND l.occurred_at >= now() - make_interval(days => v_window)
     GROUP BY l.duty_code, l.reason_code
  )
  INSERT INTO public.hr_playbook_line_proposals
    (duty_code, proposed_text, source, reason_code, evidence, status)
  SELECT c.duty_code, rc.suggested_line, 'lesson_pattern', c.reason_code,
         jsonb_build_object('count', c.n, 'window_days', v_window,
                            'first_at', c.first_at, 'last_at', c.last_at),
         'proposed'
    FROM counts c
    JOIN public.hr_duty_reason_codes rc
      ON rc.duty_code = c.duty_code AND rc.code = c.reason_code
     AND rc.is_active = true AND rc.suggested_line IS NOT NULL
   WHERE c.n >= v_threshold
     -- no proposal from this reason is already waiting
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_playbook_line_proposals p
        WHERE p.duty_code = c.duty_code AND p.reason_code = c.reason_code
          AND p.source = 'lesson_pattern' AND p.status = 'proposed')
     -- no line was accepted from this reason in the last 90 days
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_playbook_lines ln
         JOIN public.hr_playbook_line_proposals p2 ON p2.id = ln.source_proposal_id
        WHERE p2.duty_code = c.duty_code AND p2.reason_code = c.reason_code
          AND ln.accepted_at >= now() - interval '90 days')
     -- and none was declined in the last 90 days
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_playbook_line_proposals p3
        WHERE p3.duty_code = c.duty_code AND p3.reason_code = c.reason_code
          AND p3.source = 'lesson_pattern' AND p3.status = 'declined'
          AND p3.decided_at >= now() - interval '90 days');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_propose_from_lessons() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_propose_from_lessons() TO service_role;

-- Any team member may suggest a line. Credited by name; at most 5 waiting.
-- ci:allow-secdef-authenticated fn_hr_playbook_suggest is meant for every signed-in team member: the body refuses a caller with no auth.uid() or no team member (staff) row, caps waiting suggestions at 5 per person, and only ever inserts a 'proposed' row credited to the caller, which the HR head must decide.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_suggest(p_duty text, p_text text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_text text := btrim(COALESCE(p_text, ''));
  v_open integer;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to suggest a playbook line.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.profile_id = v_uid) THEN
    RAISE EXCEPTION 'Only a team member can suggest a playbook line.' USING ERRCODE = '42501';
  END IF;
  IF p_duty IS NULL OR p_duty !~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$' THEN
    RAISE EXCEPTION 'Unknown duty.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_text) NOT BETWEEN 10 AND 240 THEN
    RAISE EXCEPTION 'A playbook line is 10 to 240 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_open
    FROM public.hr_playbook_line_proposals
   WHERE suggested_by = v_uid AND status = 'proposed';
  IF v_open >= 5 THEN
    RAISE EXCEPTION 'You already have 5 suggestions waiting. Please wait for a decision on one first.'
      USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.hr_playbook_line_proposals (duty_code, proposed_text, source, suggested_by, status)
  VALUES (p_duty, v_text, 'suggestion', v_uid, 'proposed')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_suggest(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_suggest(text, text) TO authenticated;

-- The HR head accepts (optionally edited) or declines (with a note).
-- Returns the new line id on accept, the proposal id on decline.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_decide(
  p_id uuid, p_decision text, p_edited_text text, p_note text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok   boolean;
  v_uid  uuid := auth.uid();
  v_p    public.hr_playbook_line_proposals%ROWTYPE;
  v_text text;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_pos  integer;
  v_line uuid;
BEGIN
  -- 1. NULL from either check must refuse, so test IS NOT TRUE, never NOT (a OR b).
  v_ok := public.is_super_admin() OR public.user_has_permission('hr.harness.playbooks.manage');
  IF v_ok IS NOT TRUE OR v_uid IS NULL THEN
    RAISE EXCEPTION 'Only the HR head can decide playbook lines.' USING ERRCODE = '42501';
  END IF;

  -- 2. Must still be waiting.
  SELECT * INTO v_p FROM public.hr_playbook_line_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status <> 'proposed' THEN
    RAISE EXCEPTION 'This proposal was already %.', v_p.status USING ERRCODE = '55000';
  END IF;

  -- 3. Nobody decides their own suggestion.
  IF v_p.suggested_by = v_uid THEN
    RAISE EXCEPTION 'You cannot decide your own suggestion. Another person with this duty must decide it.'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'accept' THEN
    v_text := COALESCE(NULLIF(btrim(COALESCE(p_edited_text, '')), ''), v_p.proposed_text);
    IF char_length(v_text) NOT BETWEEN 10 AND 240 THEN
      RAISE EXCEPTION 'A playbook line is 10 to 240 characters.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(max(position), 0) + 1 INTO v_pos
      FROM public.hr_playbook_lines WHERE duty_code = v_p.duty_code AND status = 'active';

    -- 4. Credit: the suggester for a suggestion; the decider for a drafted line.
    --    If the decider changed the words, they are named too (edited_by), so a
    --    rewritten line is never shown as the suggester's alone.
    INSERT INTO public.hr_playbook_lines
      (duty_code, line_text, position, status, authored_by, source, source_proposal_id,
       lesson_count, accepted_by, accepted_at, edited_by)
    VALUES
      (v_p.duty_code, v_text, v_pos, 'active',
       CASE WHEN v_p.source = 'suggestion' THEN v_p.suggested_by ELSE v_uid END,
       v_p.source, v_p.id,
       CASE WHEN v_p.source = 'lesson_pattern' THEN (v_p.evidence->>'count')::integer END,
       v_uid, now(),
       CASE WHEN v_text <> v_p.proposed_text THEN v_uid END)
    RETURNING id INTO v_line;

    UPDATE public.hr_playbook_line_proposals
       SET status = 'accepted', decided_by = v_uid, decided_at = now(),
           decision_note = v_note,
           edited_text = CASE WHEN v_text <> v_p.proposed_text THEN v_text END
     WHERE id = v_p.id;
    RETURN v_line;

  ELSIF p_decision = 'decline' THEN
    -- 5. A decline says why.
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Please write a short note saying why this line is declined.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.hr_playbook_line_proposals
       SET status = 'declined', decided_by = v_uid, decided_at = now(), decision_note = left(v_note, 500)
     WHERE id = v_p.id;
    RETURN v_p.id;

  ELSE
    RAISE EXCEPTION 'Decision must be accept or decline.' USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_decide(uuid, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_decide(uuid, text, text, text) TO authenticated;

-- Retire a line that no longer applies. Manage key; a note is required.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_retire_line(p_id uuid, p_note text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok   boolean;
  v_uid  uuid := auth.uid();
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  v_ok := public.is_super_admin() OR public.user_has_permission('hr.harness.playbooks.manage');
  IF v_ok IS NOT TRUE OR v_uid IS NULL THEN
    RAISE EXCEPTION 'Only the HR head can retire playbook lines.' USING ERRCODE = '42501';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Please write a short note saying why this line is retired.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_playbook_lines
     SET status = 'retired', retired_by = v_uid, retired_at = now(),
         retire_note = left(v_note, 500), updated_at = now()
   WHERE id = p_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active line with that id.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_retire_line(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_retire_line(uuid, text) TO authenticated;

-- A duty's active playbook, with names read from profiles at read time.
-- ci:allow-secdef-authenticated fn_hr_playbook_for_duty: playbooks are for team members (fn_hr_playbook_can_read refuses anyone else, a learner or parent included); it returns only active playbook lines and the display names of the people credited with them, nothing about any rejection or any record.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_for_duty(p_duty text)
RETURNS TABLE (
  id uuid, duty_code text, line_text text, line_position integer, source text,
  authored_by uuid, author_name text, lesson_count integer,
  accepted_by uuid, accepted_by_name text, accepted_at timestamptz,
  edited_by uuid, edited_by_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF public.fn_hr_playbook_can_read() IS NOT TRUE THEN
    RAISE EXCEPTION 'Playbooks are open to team members only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT l.id, l.duty_code, l.line_text, l.position, l.source,
         l.authored_by, pa.full_name, l.lesson_count,
         l.accepted_by, pb.full_name, l.accepted_at,
         l.edited_by, pe.full_name
    FROM public.hr_playbook_lines l
    LEFT JOIN public.profiles pa ON pa.id = l.authored_by
    LEFT JOIN public.profiles pb ON pb.id = l.accepted_by
    LEFT JOIN public.profiles pe ON pe.id = l.edited_by
   WHERE l.duty_code = p_duty
     AND l.status = 'active'
   ORDER BY l.position, l.accepted_at, l.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_for_duty(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_for_duty(text) TO authenticated;

-- ci:allow-secdef-authenticated fn_hr_playbook_contributors: the credit list is for team members (fn_hr_playbook_can_read refuses anyone else); it returns author names and their count of active playbook lines only.
-- Credit list: every author with active lines, sorted by NAME (never by count,
-- so it credits people without ranking them).
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_contributors()
RETURNS TABLE (authored_by uuid, author_name text, line_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF public.fn_hr_playbook_can_read() IS NOT TRUE THEN
    RAISE EXCEPTION 'Playbooks are open to team members only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT l.authored_by, p.full_name, count(*)::integer
    FROM public.hr_playbook_lines l
    LEFT JOIN public.profiles p ON p.id = l.authored_by
   WHERE l.status = 'active'
   GROUP BY l.authored_by, p.full_name
   ORDER BY lower(p.full_name) NULLS LAST, l.authored_by;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_contributors() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_contributors() TO authenticated;

-- Waiting proposals with the suggester's name, for the /hr/playbooks page.
-- Same visibility as the table's RLS: the HR head sees all; anyone else sees
-- only their own suggestions. SECURITY DEFINER bypasses that RLS, so the
-- filter below is the ONLY gate; a caller who may not read playbooks at all
-- is refused first.
-- ci:allow-secdef-authenticated fn_hr_playbook_open_proposals: refuses anyone fn_hr_playbook_can_read refuses; the HR head (manage key, super admin, admin) sees every waiting proposal, anyone else only the suggestions they made themselves.
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_open_proposals()
RETURNS TABLE (
  id uuid, duty_code text, proposed_text text, source text, reason_code text,
  reason_label text, evidence jsonb, suggested_by uuid, suggested_by_name text,
  created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF public.fn_hr_playbook_can_read() IS NOT TRUE THEN
    RAISE EXCEPTION 'Playbooks are open to team members only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.duty_code, p.proposed_text, p.source, p.reason_code,
         rc.label, p.evidence, p.suggested_by, pr.full_name, p.created_at
    FROM public.hr_playbook_line_proposals p
    LEFT JOIN public.profiles pr ON pr.id = p.suggested_by
    LEFT JOIN public.hr_duty_reason_codes rc
      ON rc.duty_code = p.duty_code AND rc.code = p.reason_code AND rc.is_active = true
   WHERE p.status = 'proposed'
     AND (
       (public.is_super_admin() OR public.is_admin()
        OR public.user_has_permission('hr.harness.playbooks.manage')) IS TRUE
       OR p.suggested_by = auth.uid()
     )
   ORDER BY p.duty_code, p.created_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_open_proposals() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_open_proposals() TO authenticated;


-- ----------------------------------------------------------------------------
-- (f) policies — the threshold and the window
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active)
SELECT
  'hr.harness.playbooks.pattern_threshold', 'global', NULL, to_jsonb(3),
  'How many times the same rejection reason must be seen, within the window below, before the weekly run drafts a playbook line for the HR head to accept or decline. A whole number of 1 or more; anything else and nothing is drafted. Sends no message.',
  'number', 'operational', 'hr', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'hr.harness.playbooks.pattern_threshold'
     AND scope_type = 'global' AND scope_id IS NULL
);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active)
SELECT
  'hr.harness.playbooks.pattern_window_days', 'global', NULL, to_jsonb(30),
  'The number of days the weekly run looks back when counting repeated rejection reasons for a playbook line. A whole number of 1 or more; anything else and nothing is drafted.',
  'number', 'operational', 'hr', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'hr.harness.playbooks.pattern_window_days'
     AND scope_type = 'global' AND scope_id IS NULL
);


-- ----------------------------------------------------------------------------
-- (g) the weekly run — Monday 07:13 IST (minute_of_day 433, the 07:00 slot)
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES
  ('hr-playbook-lessons', true, true, ARRAY[1]::smallint[], 433)
ON CONFLICT (routine_id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- Guards: RAISE EXCEPTION, never NOTICE.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_codes  integer;
  v_other  integer;
  v_pol    integer;
  v_sched  integer;
  v_anon   text;
  v_writes integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE code = 'other')
    INTO v_codes, v_other
    FROM public.hr_duty_reason_codes WHERE is_active = true;
  IF v_codes < 30 OR v_other < 6 THEN
    RAISE EXCEPTION 'hr_duty_reason_codes seed incomplete (codes=%, other=%)', v_codes, v_other;
  END IF;

  SELECT count(*) INTO v_pol FROM public.platform_policies
   WHERE policy_key IN ('hr.harness.playbooks.pattern_threshold','hr.harness.playbooks.pattern_window_days')
     AND scope_type = 'global' AND scope_id IS NULL;
  SELECT count(*) INTO v_sched FROM public.ai_routine_schedules WHERE routine_id = 'hr-playbook-lessons';
  IF v_pol <> 2 OR v_sched <> 1 THEN
    RAISE EXCEPTION 'hr playbooks seed incomplete (policies=%, schedule=%)', v_pol, v_sched;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('fn_hr_duty_reason_codes_audit','fn_hr_duty_reason_match','fn_hr_playbook_policy_int',
                       'fn_hr_duty_reason_is_system','fn_hr_playbook_can_read',
                       'fn_hr_duty_lessons_harvest','fn_hr_playbook_propose_from_lessons','fn_hr_playbook_suggest',
                       'fn_hr_playbook_decide','fn_hr_playbook_retire_line','fn_hr_playbook_for_duty',
                       'fn_hr_playbook_contributors','fn_hr_playbook_open_proposals')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute: %', v_anon;
  END IF;

  SELECT count(*) INTO v_writes FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('hr_duty_lessons','hr_playbook_lines','hr_playbook_line_proposals')
     AND cmd <> 'SELECT';
  IF v_writes <> 0 THEN
    RAISE EXCEPTION 'playbook tables must have no write policies (found %)', v_writes;
  END IF;
END $$;
