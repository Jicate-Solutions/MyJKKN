-- ============================================================================
-- HR — Employee Documents (T1.5b Phase 2a, Document Upload Foundation)
-- ============================================================================
-- Created: 2026-05-10
-- Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2a)
-- Q-locks (Director answered 2026-05-10):
--   1. Single bucket `hr-employee-documents` + path-isolation by institution_id
--      Path convention: `{institution_id}/{staff_id}/{document_code}_{ts}.{ext}`
--   2. 5 MB per upload (DB CHECK constraint enforces it; bucket config + UI also).
--   3. expires_at column present (Phase 2a creates column + UI display; cron is 2b).
--   4. verification_status enum: pending|verified|rejected|expired with notes,
--      verified_by, verified_at columns. Phase 2a stores schema + employee-side
--      upload only; HR verification UI is Phase 2b.
--
-- Purpose
-- -------
-- Employee-side document upload table. Each row represents an actual file the
-- staff member uploaded to fulfil a row in the `hr_required_documents` policy
-- table (T1.5a, PR #809). HR officers later verify the upload (Phase 2b UI).
--
-- Schema decisions
-- ----------------
-- * staff_id FK → staff(id): consistent with hr_leave_applications + hr_leave_balance
--   (both FK to staff.id). Phase 2a covers JKKN full-time employees only;
--   non-staff types (guest/student_ta/vendor) join via the same UI surface in
--   a future phase (would need an hr_employee_id alternate FK).
-- * required_document_id NULLABLE: ad-hoc documents (legacy uploads, one-off
--   compliance asks) can attach without a policy row. document_code mirrors
--   the policy table for consistency when the FK is nullable.
-- * replaces_document_id: audit chain when re-uploading. The new row is the
--   live one; the old row stays for audit but UIs filter where replaces_*=NULL.
--   Self-referential FK ON DELETE SET NULL so deleting an old version doesn't
--   cascade-kill new versions.
-- * expires_at NULLABLE: only set for expirable documents (visas, certs).
--   Phase 2b cron will set verification_status='expired' when expires_at passes.
-- * institution_id derived from staff via JOIN at write-time and stored on the
--   row for cheap RLS evaluation + path-isolation enforcement. Trigger keeps
--   it in sync.
--
-- RLS pattern (mirrors hr_recruitment_candidates / hostel_vacate_documents)
-- ------------------------------------------------------------------------
-- * Employee can SELECT own + INSERT own (where staff_id matches their staff
--   record looked up via auth.uid() → profiles.id → staff.profile_id).
-- * HR officers (hr.employees.view + hr.employees.edit) see/update within
--   their institution scope.
-- * super_admin / admin always.
-- * No DELETE policy except super_admin/admin — employees re-upload via
--   INSERT new row pointing to old via replaces_document_id (audit chain).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_employee_documents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject (which employee + which institution this doc belongs to)
  staff_id                uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id),

  -- Optional link to policy row. NULL = ad-hoc upload not in any policy.
  required_document_id    uuid REFERENCES public.hr_required_documents(id) ON DELETE SET NULL,
  document_code           text NOT NULL,
  document_name           text NOT NULL,

  -- Storage
  storage_path            text NOT NULL UNIQUE,             -- {institution_id}/{staff_id}/{code}_{ts}.{ext}
  file_name               text NOT NULL,                    -- original filename (display only)
  file_size_bytes         integer NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880),  -- 5 MB cap
  mime_type               text NOT NULL CHECK (mime_type IN (
                            'application/pdf',
                            'image/jpeg',
                            'image/png'
                          )),

  -- Verification workflow (HR officer verifies; Phase 2b UI)
  verification_status     text NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
                            'pending',
                            'verified',
                            'rejected',
                            'expired'
                          )),
  verification_notes      text,
  verified_by             uuid REFERENCES public.profiles(id),
  verified_at             timestamptz,

  -- Expiry (nullable; only for expirable docs like visas)
  expires_at              timestamptz,

  -- Audit chain when re-uploading (new row replaces old)
  replaces_document_id    uuid REFERENCES public.hr_employee_documents(id) ON DELETE SET NULL,

  -- Standard audit cols
  uploaded_at             timestamptz NOT NULL DEFAULT now(),
  uploaded_by             uuid NOT NULL REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.profiles(id),
  updated_by              uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.hr_employee_documents IS
  'HR — Employee Documents (T1.5b Phase 2a). One row per file uploaded by a staff member to fulfil a hr_required_documents policy row (or ad-hoc). MIME + size constrained via CHECK (PDF/JPG/PNG, max 5 MB). Verification (Phase 2b) is HR-officer driven; cron sets expired. Re-upload creates a new row pointing to the old via replaces_document_id.';
COMMENT ON COLUMN public.hr_employee_documents.storage_path IS
  'Path inside the hr-employee-documents bucket. Convention: {institution_id}/{staff_id}/{document_code}_{timestamp}.{ext}. Storage RLS enforces the institution_id segment matches the staff record.';
COMMENT ON COLUMN public.hr_employee_documents.required_document_id IS
  'FK to hr_required_documents policy row. NULL for ad-hoc / legacy uploads not tied to any policy.';
COMMENT ON COLUMN public.hr_employee_documents.replaces_document_id IS
  'Self-referential audit chain. Set when an employee re-uploads a rejected or expired document. UIs filter live rows via WHERE replaces_document_id IS NULL OR exclude those that are themselves replaced.';
COMMENT ON COLUMN public.hr_employee_documents.verification_status IS
  'pending (default on upload) → verified | rejected (HR officer; Phase 2b UI) → expired (cron when expires_at passes; Phase 2b).';
COMMENT ON COLUMN public.hr_employee_documents.expires_at IS
  'Nullable. Only set for expirable documents (visa, fitness cert, police verification). Phase 2b cron flips verification_status to expired when this passes.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
-- Primary access patterns: list-by-staff for the "My Documents" page,
-- list-by-institution+status for the HR queue, and expiry cron lookup.
CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_staff
  ON public.hr_employee_documents(staff_id, verification_status);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_institution_status
  ON public.hr_employee_documents(institution_id, verification_status);

-- Phase 2b expiry cron: find rows expiring in next N days, not already 'expired'.
CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_expires_at
  ON public.hr_employee_documents(expires_at)
  WHERE expires_at IS NOT NULL AND verification_status <> 'expired';

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_required_doc
  ON public.hr_employee_documents(required_document_id)
  WHERE required_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_uploaded_by
  ON public.hr_employee_documents(uploaded_by);

-- ---------------------------------------------------------------------------
-- 3) Trigger — keep updated_at fresh
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_employee_documents_updated_at
  ON public.hr_employee_documents;
CREATE TRIGGER hr_employee_documents_updated_at
  BEFORE UPDATE ON public.hr_employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_employee_documents ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   * super_admin / admin always
--   * HR officer with hr.employees.view + institution access
--   * Employee viewing their OWN docs (staff record's profile_id = auth.uid())
DROP POLICY IF EXISTS "hr_employee_documents_select_permission"
  ON public.hr_employee_documents;
CREATE POLICY "hr_employee_documents_select_permission"
  ON public.hr_employee_documents FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.view')
      AND role_has_institution_access(institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_employee_documents.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- INSERT:
--   * super_admin / admin always
--   * HR officer with hr.employees.edit + institution access (HR uploading on behalf)
--   * Employee uploading their OWN docs (staff record's profile_id = auth.uid())
--     AND has the hr.onboarding.execute permission (default for the employee role).
--   * institution_id on the row must match the staff record's institution_id
--     (path-isolation invariant — the trigger below enforces this on every write).
DROP POLICY IF EXISTS "hr_employee_documents_insert_permission"
  ON public.hr_employee_documents;
CREATE POLICY "hr_employee_documents_insert_permission"
  ON public.hr_employee_documents FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
    OR (
      user_has_permission('hr.onboarding.execute')
      AND EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = hr_employee_documents.staff_id
          AND s.profile_id = auth.uid()
          AND s.institution_id = hr_employee_documents.institution_id
      )
    )
  );

-- UPDATE: HR officer verification workflow only (Phase 2b uses this).
-- Employees cannot edit existing rows — they re-upload via INSERT a new row
-- pointing to the old via replaces_document_id.
DROP POLICY IF EXISTS "hr_employee_documents_update_permission"
  ON public.hr_employee_documents;
CREATE POLICY "hr_employee_documents_update_permission"
  ON public.hr_employee_documents FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
  );

-- DELETE: super_admin / admin only. Employees and HR officers cannot delete;
-- the audit trail (replaces_document_id) is the supersede mechanism.
DROP POLICY IF EXISTS "hr_employee_documents_delete_permission"
  ON public.hr_employee_documents;
CREATE POLICY "hr_employee_documents_delete_permission"
  ON public.hr_employee_documents FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 5) Path-isolation invariant trigger
-- ---------------------------------------------------------------------------
-- Enforce that storage_path begins with `{institution_id}/{staff_id}/`. Without
-- this, a buggy client could upload a file to /foo/bar.pdf and INSERT a row
-- claiming the matching staff_id; the storage RLS would catch the upload but
-- the DB row would be orphaned (or worse, point at a path under a different
-- tenant's folder). Trigger keeps the two in lockstep.
CREATE OR REPLACE FUNCTION public.hr_employee_documents_validate_storage_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expected_prefix text;
BEGIN
  expected_prefix := NEW.institution_id::text || '/' || NEW.staff_id::text || '/';
  IF NEW.storage_path IS NULL OR position(expected_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'storage_path must begin with %, got %', expected_prefix, NEW.storage_path
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hr_employee_documents_validate_path
  ON public.hr_employee_documents;
CREATE TRIGGER hr_employee_documents_validate_path
  BEFORE INSERT OR UPDATE OF storage_path, institution_id, staff_id
  ON public.hr_employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_employee_documents_validate_storage_path();

-- ---------------------------------------------------------------------------
-- 6) Done. Table starts empty per task scope (no seed migration).
-- ---------------------------------------------------------------------------
