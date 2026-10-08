-- 20270611100000_learner_admission_documents_storage.sql
-- Added: 2026-09-30 — a place to keep a learner's admission papers, starting with
-- a postgraduate applicant's degree mark sheet and entrance scorecard.
--
-- WHY THIS EXISTS
-- ---------------
-- Director ruling 2026-09-30: postgraduate applicants record their previous degree
-- (20270611090000) "plus the mark sheet and scorecard". Nothing in the system could
-- hold a learner's document. learner_admission_documents existed as a checklist
-- (received yes/no, one row per learner per doc_type) with 0 rows and no screen.
-- This file adds the storage it points at; document_ref holds the file's path.
--
-- ACCESS — deliberately STRICTER than the older private buckets
-- ------------------------------------------------------------
-- hostel-vacate-documents (20260422) lets ANY signed-in user read ANY file in it
-- by path, trusting the table row to guard access. Mark sheets are personal
-- records, so here the file itself is guarded, with the SAME rule as the
-- learner_admission_documents table:
--   * a file lives at  <learner_id>/<doc_type>-<timestamp>.<ext>
--   * read  = can see that learner AND (admission_fees.read OR admission_documents.manage)
--             AND role_has_institution_access(the learner's college)
--   * write = can see that learner AND admission_documents.manage AND college access
-- user_has_permission() already lets super admins through. The learner-row lookup
-- runs under the caller's own RLS on learners_profiles, so a file is never more
-- visible than the learner it belongs to.
-- The learner's own self-fill link uploads through a server route that validates
-- the signed link token and writes with the service role (like its photo upload);
-- it cannot read anyone's files.

-- ─── Bucket ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'learner-admission-documents',
  'learner-admission-documents',
  false,
  5242880,  -- 5 MB, matching the other document buckets
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Access rule, once ──────────────────────────────────────────────────────
-- p_write = false: may this caller READ files for the learner in this path?
-- p_write = true : may this caller ADD / REPLACE / REMOVE them?
-- SECURITY INVOKER on purpose: the learners_profiles lookup must run under the
-- caller's RLS. A path whose first folder is not a uuid simply matches nothing.
CREATE OR REPLACE FUNCTION public.fn_can_access_learner_admission_file(p_name text, p_write boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.learners_profiles lp
     WHERE lp.id::text = (storage.foldername(p_name))[1]
       AND role_has_institution_access(lp.institution_id)
       AND (
         (SELECT user_has_permission('admission_documents.manage'))
         OR (NOT p_write AND (SELECT user_has_permission('admission_fees.read')))
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_access_learner_admission_file(text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_access_learner_admission_file(text, boolean) TO authenticated;

-- ─── Storage policies ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS lad_storage_select ON storage.objects;
CREATE POLICY lad_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'learner-admission-documents'
         AND public.fn_can_access_learner_admission_file(name, false));

DROP POLICY IF EXISTS lad_storage_insert ON storage.objects;
CREATE POLICY lad_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'learner-admission-documents'
              AND public.fn_can_access_learner_admission_file(name, true));

DROP POLICY IF EXISTS lad_storage_update ON storage.objects;
CREATE POLICY lad_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'learner-admission-documents'
         AND public.fn_can_access_learner_admission_file(name, true))
  WITH CHECK (bucket_id = 'learner-admission-documents'
              AND public.fn_can_access_learner_admission_file(name, true));

DROP POLICY IF EXISTS lad_storage_delete ON storage.objects;
CREATE POLICY lad_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'learner-admission-documents'
         AND public.fn_can_access_learner_admission_file(name, true));
