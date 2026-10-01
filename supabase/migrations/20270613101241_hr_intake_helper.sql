-- Updated: 2026-10-01 - HR intake helper: the helper prepares, a person decides.
--
-- WHAT THIS IS. HR uploads a CVViZ candidate export plus the resume files. The
-- server reads each row, cleans it, spots duplicates, reads the resume, and
-- proposes ONE action per candidate with plain-English reasons. A person confirms
-- or corrects each card with one tap. A correction becomes a match rule credited
-- to the person who made it, and the next batch uses it. Nothing reaches
-- hr_job_applications until a person has decided; filing reuses the careers path
-- (Drive folder per job + an hr_job_applications row with source 'cvviz_import').
--
-- Shared shape: types/hr-intake.ts. Server: lib/services/hr/intake/intake-service.ts.
-- Routes: app/api/hr/recruitment/intake/**.
--
-- TIER: ADDITIVE + ONE WIDENED CHECK. 3 new tables, 1 private bucket (no client policy), 1 new
-- nullable column on hr_job_applications, the source CHECK widened by one value.
-- No function, no SECURITY DEFINER, no data rewritten.
--
-- FILE ONLY at PR time. Application to production is Director-gated.

-- ============================================================================
-- 1. hr_job_applications: a filed CVViZ candidate is its own source
-- ============================================================================
-- 20260922000646 declared the CHECK inline, so its name is Postgres's generated
-- one (hr_job_applications_source_check). It is found by what it checks rather
-- than assumed, dropped, and re-added under that conventional name with every
-- old value plus 'cvviz_import'. A re-run drops and re-adds the widened version.
--
-- Checked BEFORE anything is dropped: if production holds a source value
-- outside the known list, stop here and name it, rather than dropping the old
-- CHECK and failing on the new one.
DO $$
DECLARE
  v_unknown text;
BEGIN
  SELECT string_agg(DISTINCT source, ', ')
    INTO v_unknown
    FROM public.hr_job_applications
   WHERE source NOT IN ('internal', 'external_website', 'cvviz_import');
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'hr_job_applications holds source value(s) this migration does not know: %. Add them to the list in section 1 before applying.', v_unknown;
  END IF;
END $$;

DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.hr_job_applications'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%external_website%'
  LOOP
    EXECUTE format('ALTER TABLE public.hr_job_applications DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.hr_job_applications
  ADD CONSTRAINT hr_job_applications_source_check
  CHECK (source IN ('internal', 'external_website', 'cvviz_import'));

-- The candidate's CVViZ profile, kept so HR can open the original record.
ALTER TABLE public.hr_job_applications
  ADD COLUMN IF NOT EXISTS cvviz_profile_url text;

COMMENT ON COLUMN public.hr_job_applications.cvviz_profile_url IS
  'CVViZ "Candidate Profile Link" for rows filed by the HR intake helper (source = cvviz_import). NULL for every other source.';

-- ============================================================================
-- 2. Batches: one upload of one export
-- ============================================================================
-- institution_id is the uploader's home institution at upload time. It decides
-- who else may see the batch (same-scope HR); the uploader always sees their own.
CREATE TABLE IF NOT EXISTS public.hr_intake_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL DEFAULT 'cvviz_export' CHECK (source IN ('cvviz_export')),
  file_name        text NOT NULL CHECK (length(btrim(file_name)) > 0),
  institution_id   uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  created_by       uuid NOT NULL REFERENCES public.profiles(id),
  created_by_name  text,
  status           text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'ready', 'closed')),
  row_count        integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  -- Uploaded files that were not used, with the plain-English reason:
  -- [{ "file_name": "...", "reason": "..." }]
  skipped_files    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The cleaned export rows, held between upload and "prepare" (the resumes
  -- arrive in between, straight to storage). Emptied once the rows are written.
  parsed_rows      jsonb,
  -- Set while one request prepares the batch, so two cannot do it at once.
  prepare_claimed_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_intake_batches IS
  'HR intake helper: one CVViZ export upload. preparing (export parsed, resumes uploading) -> ready (rows proposed) -> closed (every row decided and every filing done; resume copies removed).';

CREATE INDEX IF NOT EXISTS idx_hr_intake_batches_created_at
  ON public.hr_intake_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_intake_batches_created_by
  ON public.hr_intake_batches (created_by);
CREATE INDEX IF NOT EXISTS idx_hr_intake_batches_institution
  ON public.hr_intake_batches (institution_id);

-- ============================================================================
-- 3. Rows: one candidate line of the export, its proposal and its decision
-- ============================================================================
-- candidate is a snapshot of the cleaned export row (IntakeCandidate). The
-- proposal, decision and filing result are columns so they can carry CHECKs and
-- be filtered (accept every undecided HIGH proposal; file every decided row).
CREATE TABLE IF NOT EXISTS public.hr_intake_rows (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                   uuid NOT NULL REFERENCES public.hr_intake_batches(id) ON DELETE CASCADE,
  row_index                  integer NOT NULL CHECK (row_index >= 1),
  candidate                  jsonb NOT NULL,
  cvviz_job_title_norm       text,

  resume_file_name           text,
  resume_matched_upload      boolean NOT NULL DEFAULT false,
  resume_storage_path        text,
  resume_extract             jsonb,

  duplicate_kind             text NOT NULL DEFAULT 'none'
                               CHECK (duplicate_kind IN ('none', 'same_file', 'existing_application', 'existing_candidate')),
  duplicate_ref_id           uuid,
  duplicate_note             text,

  proposal_action            text NOT NULL
                               CHECK (proposal_action IN ('file_under_job', 'merge_existing', 'needs_new_job', 'skip')),
  proposal_job_id            uuid REFERENCES public.hr_recruitment_jobs(id) ON DELETE SET NULL,
  proposal_job_title         text,
  proposal_institution_id    uuid,
  proposal_confidence        text NOT NULL CHECK (proposal_confidence IN ('high', 'medium', 'low')),
  proposal_reasons           text[] NOT NULL DEFAULT '{}',
  proposal_rule_id           uuid,
  proposal_rule_author_name  text,

  decision_action            text
                               CHECK (decision_action IN ('file_under_job', 'merge_existing', 'needs_new_job', 'skip')),
  decision_job_id            uuid REFERENCES public.hr_recruitment_jobs(id) ON DELETE SET NULL,
  decided_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_name            text,
  decided_at                 timestamptz,
  decision_corrected         boolean NOT NULL DEFAULT false,

  -- Filing. apply_claimed_at is set atomically before the Drive upload so two
  -- concurrent "apply" calls can never file the same row twice.
  apply_claimed_at           timestamptz,
  application_id             uuid REFERENCES public.hr_job_applications(id) ON DELETE SET NULL,
  applied_at                 timestamptz,
  apply_error                text,

  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_intake_rows_batch_row_unique UNIQUE (batch_id, row_index),
  CONSTRAINT hr_intake_rows_file_needs_job
    CHECK (decision_action IS DISTINCT FROM 'file_under_job' OR decision_job_id IS NOT NULL)
);

COMMENT ON TABLE public.hr_intake_rows IS
  'HR intake helper: one export row. proposal_* is what the helper suggests; decision_* is what a person chose; application_id is the hr_job_applications row it was filed as.';

CREATE INDEX IF NOT EXISTS idx_hr_intake_rows_batch
  ON public.hr_intake_rows (batch_id, row_index);
CREATE INDEX IF NOT EXISTS idx_hr_intake_rows_application
  ON public.hr_intake_rows (application_id) WHERE application_id IS NOT NULL;

-- ============================================================================
-- 4. Match rules: "a CVViZ job titled like this goes to this MyJKKN job"
-- ============================================================================
-- Born from a person's correction and credited to them. One rule per
-- normalised title per institution: two colleges may each route the same CVViZ
-- title to their own job, and neither can see or overwrite the other's rule.
-- institution_id is the job's institution; the INSERT/UPDATE policies refuse a
-- rule whose institution does not match its job (as the writer can see it).
CREATE TABLE IF NOT EXISTS public.hr_intake_match_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cvviz_job_title_norm  text NOT NULL CHECK (length(btrim(cvviz_job_title_norm)) > 0),
  job_id                uuid NOT NULL REFERENCES public.hr_recruitment_jobs(id) ON DELETE CASCADE,
  institution_id        uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  created_by            uuid NOT NULL REFERENCES public.profiles(id),
  created_by_name       text,
  times_used            integer NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  last_used_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_intake_match_rules IS
  'HR intake helper: learned routing from a normalised CVViZ job title to a MyJKKN job, credited to the person whose correction created it. One per (title, institution).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_intake_match_rules_title_institution
  ON public.hr_intake_match_rules (cvviz_job_title_norm, institution_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_hr_intake_match_rules_job
  ON public.hr_intake_match_rules (job_id);

-- ============================================================================
-- 5. updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS hr_intake_batches_updated_at ON public.hr_intake_batches;
CREATE TRIGGER hr_intake_batches_updated_at
  BEFORE UPDATE ON public.hr_intake_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_intake_rows_updated_at ON public.hr_intake_rows;
CREATE TRIGGER hr_intake_rows_updated_at
  BEFORE UPDATE ON public.hr_intake_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_intake_match_rules_updated_at ON public.hr_intake_match_rules;
CREATE TRIGGER hr_intake_match_rules_updated_at
  BEFORE UPDATE ON public.hr_intake_match_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. Access
-- ============================================================================
-- Names, emails and phone numbers of people applying for jobs: the anonymous
-- key never reaches any of these tables.
ALTER TABLE public.hr_intake_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_intake_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_intake_match_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hr_intake_batches FROM anon, PUBLIC;
REVOKE ALL ON public.hr_intake_rows FROM anon, PUBLIC;
REVOKE ALL ON public.hr_intake_match_rules FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_intake_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_intake_rows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_intake_match_rules TO authenticated;

-- The gate is hr.recruitment.create (the people who bring candidates in),
-- scoped like the recruitment screens: institution access through
-- role_has_institution_access(), super admins and admins first. No role name
-- is written anywhere; Role Management decides who holds the key.

-- 6a. Batches: the uploader, or anyone holding the key for the batch's college.
DROP POLICY IF EXISTS hr_intake_batches_select ON public.hr_intake_batches;
CREATE POLICY hr_intake_batches_select ON public.hr_intake_batches
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.create'))
        AND (created_by = (SELECT auth.uid())
             OR public.role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS hr_intake_batches_insert ON public.hr_intake_batches;
CREATE POLICY hr_intake_batches_insert ON public.hr_intake_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      (SELECT public.is_super_admin())
      OR (SELECT public.is_admin())
      OR ((SELECT public.user_has_permission('hr.recruitment.create'))
          AND (institution_id IS NULL OR public.role_has_institution_access(institution_id)))
    )
  );

DROP POLICY IF EXISTS hr_intake_batches_update ON public.hr_intake_batches;
CREATE POLICY hr_intake_batches_update ON public.hr_intake_batches
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.create'))
        AND (created_by = (SELECT auth.uid())
             OR public.role_has_institution_access(institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.create'))
        AND (created_by = (SELECT auth.uid())
             OR public.role_has_institution_access(institution_id)))
  );

-- Delete: only the uploader (the server removes a batch whose preparation broke).
DROP POLICY IF EXISTS hr_intake_batches_delete ON public.hr_intake_batches;
CREATE POLICY hr_intake_batches_delete ON public.hr_intake_batches
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.create'))
        AND created_by = (SELECT auth.uid()))
  );

-- 6b. Rows follow their batch: whoever can see the batch can see and decide
-- its rows. The EXISTS runs under the caller's own batch policy above.
DROP POLICY IF EXISTS hr_intake_rows_select ON public.hr_intake_rows;
CREATE POLICY hr_intake_rows_select ON public.hr_intake_rows
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_intake_batches b WHERE b.id = hr_intake_rows.batch_id));

DROP POLICY IF EXISTS hr_intake_rows_insert ON public.hr_intake_rows;
CREATE POLICY hr_intake_rows_insert ON public.hr_intake_rows
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.hr_intake_batches b WHERE b.id = hr_intake_rows.batch_id));

DROP POLICY IF EXISTS hr_intake_rows_update ON public.hr_intake_rows;
CREATE POLICY hr_intake_rows_update ON public.hr_intake_rows
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_intake_batches b WHERE b.id = hr_intake_rows.batch_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hr_intake_batches b WHERE b.id = hr_intake_rows.batch_id));

DROP POLICY IF EXISTS hr_intake_rows_delete ON public.hr_intake_rows;
CREATE POLICY hr_intake_rows_delete ON public.hr_intake_rows
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_intake_batches b WHERE b.id = hr_intake_rows.batch_id));

-- 6c. Rules: visible and editable within the college of the job they point at.
-- A write must name the institution its job really belongs to, as the writer
-- can see that job; a write is always credited to the writer.
DROP POLICY IF EXISTS hr_intake_match_rules_select ON public.hr_intake_match_rules;
CREATE POLICY hr_intake_match_rules_select ON public.hr_intake_match_rules
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.create'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_intake_match_rules_insert ON public.hr_intake_match_rules;
CREATE POLICY hr_intake_match_rules_insert ON public.hr_intake_match_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.hr_recruitment_jobs j
       WHERE j.id = hr_intake_match_rules.job_id
         AND j.institution_id IS NOT DISTINCT FROM hr_intake_match_rules.institution_id
    )
    AND (
      (SELECT public.is_super_admin())
      OR (SELECT public.is_admin())
      OR ((SELECT public.user_has_permission('hr.recruitment.create'))
          AND public.role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS hr_intake_match_rules_update ON public.hr_intake_match_rules;
CREATE POLICY hr_intake_match_rules_update ON public.hr_intake_match_rules
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.create'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.hr_recruitment_jobs j
       WHERE j.id = hr_intake_match_rules.job_id
         AND j.institution_id IS NOT DISTINCT FROM hr_intake_match_rules.institution_id
    )
    AND (
      (SELECT public.is_super_admin())
      OR (SELECT public.is_admin())
      OR ((SELECT public.user_has_permission('hr.recruitment.create'))
          AND public.role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS hr_intake_match_rules_delete ON public.hr_intake_match_rules;
CREATE POLICY hr_intake_match_rules_delete ON public.hr_intake_match_rules
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.recruitment.create'))
        AND public.role_has_institution_access(institution_id))
  );

-- ============================================================================
-- 7. Private bucket for the batch's resume copies
-- ============================================================================
-- PRIVATE, and no client storage policy on purpose (patterns:
-- 20260915120001_in_person_meeting_recordings.sql and the rcltp signed-upload
-- handshake). The browser uploads each resume straight to storage through a
-- short-lived signed upload URL whose PATH the server chose:
--   hr-intake/<batch id>/<file name>
-- (Vercel caps a request body near 4.5 MB, so resumes cannot ride in the
-- export's own request.) Only the server reads the bucket, with the service
-- role. The copies live only while the batch is open; closing it removes them.
-- At filing time the resume is copied to the job's Drive folder like any
-- careers application.
--
-- Images are allowed because some resumes are phone photos; .zip because HR
-- may upload one archive, which the server expands and then deletes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-intake', 'hr-intake', false,
  10485760,  -- 10 MB per file, the same limit the upload-url route enforces
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;
