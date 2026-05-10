-- ============================================================================
-- HR — Employee Documents storage bucket (T1.5b Phase 2a)
-- ============================================================================
-- Created: 2026-05-10
-- Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2a)
--
-- WHY a dedicated bucket
-- ----------------------
-- Per Q-lock #1 (Director, 2026-05-10): single bucket `hr-employee-documents`
-- with path-isolation by institution_id is the chosen pattern. This makes
-- cross-tenant leakage impossible at the storage layer because a request to
-- /storage/v1/object/hr-employee-documents/<institution_id>/... must satisfy
-- a SELECT/INSERT RLS check that JOINs back to public.staff to verify the
-- requesting user has access to that institution_id segment of the path.
--
-- The accompanying table (hr_employee_documents) has a path-validation trigger
-- (BEFORE INSERT) that enforces storage_path begins with `{institution_id}/{staff_id}/`,
-- so the table row can never disagree with the storage layer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-employee-documents',
  'hr-employee-documents',
  false,                               -- private bucket; access only via signed URLs or RLS-checked reads
  5242880,                             -- 5 MB cap (Q-lock #2)
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2) Storage RLS policies
-- ---------------------------------------------------------------------------
-- Path layout reminder: `{institution_id}/{staff_id}/{document_code}_{ts}.{ext}`
--
-- storage.objects.name is the object key; storage.foldername(name) returns it
-- as a text[] of segments. We extract the first two segments and JOIN back to
-- public.staff to verify either:
--   (a) the requesting user owns that staff record (profile_id = auth.uid())
--       — used for employee uploads / reads / re-uploads, OR
--   (b) the requesting user is super_admin/admin, OR
--   (c) the requesting user has hr.employees.{view|edit} permission AND has
--       institution access to the staff record's institution.

-- SELECT (download) — same authorization as table SELECT.
DROP POLICY IF EXISTS hr_emp_docs_storage_select ON storage.objects;
CREATE POLICY hr_emp_docs_storage_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'hr-employee-documents'
    AND (
      is_super_admin() OR is_admin()
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id::text = (storage.foldername(name))[2]
          AND s.institution_id::text = (storage.foldername(name))[1]
          AND (
            -- Employee viewing own files
            s.profile_id = auth.uid()
            -- HR officer with view perm + institution access
            OR (
              user_has_permission('hr.employees.view')
              AND role_has_institution_access(s.institution_id)
            )
          )
      )
    )
  );

-- INSERT (upload) — uploader must either be the staff member themselves
-- (with hr.onboarding.execute) or an HR officer (hr.employees.edit) within
-- the staff record's institution.
DROP POLICY IF EXISTS hr_emp_docs_storage_insert ON storage.objects;
CREATE POLICY hr_emp_docs_storage_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hr-employee-documents'
    AND (
      is_super_admin() OR is_admin()
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id::text = (storage.foldername(name))[2]
          AND s.institution_id::text = (storage.foldername(name))[1]
          AND (
            -- Employee uploading own file (onboarding flow)
            (
              s.profile_id = auth.uid()
              AND user_has_permission('hr.onboarding.execute')
            )
            -- HR officer uploading on behalf
            OR (
              user_has_permission('hr.employees.edit')
              AND role_has_institution_access(s.institution_id)
            )
          )
      )
    )
  );

-- UPDATE (overwrite) — disallowed for employees and HR officers; storage row
-- semantics are immutable. Re-uploads go to a NEW path (timestamp suffix in
-- the filename ensures uniqueness). Only super_admin/admin can overwrite.
DROP POLICY IF EXISTS hr_emp_docs_storage_update ON storage.objects;
CREATE POLICY hr_emp_docs_storage_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hr-employee-documents'
    AND (is_super_admin() OR is_admin())
  )
  WITH CHECK (
    bucket_id = 'hr-employee-documents'
    AND (is_super_admin() OR is_admin())
  );

-- DELETE — super_admin/admin only (matches table-level DELETE policy).
-- Employees re-upload via new INSERT; the old object lingers for audit until
-- super_admin reconciles. Cleanup tooling is Phase 2b.
DROP POLICY IF EXISTS hr_emp_docs_storage_delete ON storage.objects;
CREATE POLICY hr_emp_docs_storage_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hr-employee-documents'
    AND (is_super_admin() OR is_admin())
  );
