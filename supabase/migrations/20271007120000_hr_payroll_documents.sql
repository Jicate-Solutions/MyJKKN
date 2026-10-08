-- ════════════════════════════════════════════════════════════════════════════
-- Salary Register — Teaching / Non-Teaching split + payroll documents (2026-10-07)
--
-- Two changes, one feature:
--
--   a) hr_salary_register_lines snapshots the staff CATEGORY (name + is_teaching)
--      so a register can be split into Teaching and Non-Teaching — the workbook
--      sheets, the on-screen tabs, and the per-category Bank Letter and
--      Chairperson Approval documents all read it.
--
--      Snapshotted, not joined at read time: every other identity field on a
--      line is frozen at generation (see the 20260830150000 header), and a
--      later category change must not move a person between two documents that
--      were already printed and signed.
--
--      The BACKFILL below is the one exception — existing lines are labelled
--      from each person's CURRENT category, because the category at generation
--      time was never recorded. From this migration on, generate() writes it.
--
--   b) hr_payroll_document_settings — the four constants the documents need that
--      exist nowhere else in the schema: the letter reference code (JKKNCOP),
--      and the COLLEGE's own bank, branch and account number ("To The Manager,
--      Indian Bank, Kumarapalayam … A/C No: 1775"). One row per paying
--      institution, filled once by the HR Head from the register page.
--
-- No new permission keys: reads gate on hr.payroll.register.view, writes on
-- .manage — the same pair as the register itself (HR Head + super admins).
-- ════════════════════════════════════════════════════════════════════════════

-- ── a) Category snapshot on register lines ──────────────────────────────────

ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS staff_category_name text,
  ADD COLUMN IF NOT EXISTS is_teaching boolean;

COMMENT ON COLUMN public.hr_salary_register_lines.staff_category_name IS
  'employment_categories.category_name at generation. Lines generated before 2026-10-07 were backfilled from the CURRENT category.';
COMMENT ON COLUMN public.hr_salary_register_lines.is_teaching IS
  'employment_categories.is_teaching at generation — splits the register into Teaching / Non-Teaching sheets and documents.';

-- The touch trigger would rewrite updated_at on every frozen line; the backfill
-- adds a label, it does not edit the register.
ALTER TABLE public.hr_salary_register_lines DISABLE TRIGGER trg_hr_salary_register_lines_touch;

UPDATE public.hr_salary_register_lines l
   SET staff_category_name = ec.category_name,
       is_teaching         = COALESCE(ec.is_teaching, false)
  FROM public.staff s
  LEFT JOIN public.employment_categories ec ON ec.id = s.category_id
 WHERE s.id = l.staff_id
   AND l.is_teaching IS NULL;

-- A line whose staff row no longer exists has no category to recover.
UPDATE public.hr_salary_register_lines
   SET is_teaching = false
 WHERE is_teaching IS NULL;

ALTER TABLE public.hr_salary_register_lines ENABLE TRIGGER trg_hr_salary_register_lines_touch;

-- NOT NULL with NO default: an insert path that forgets the column must fail,
-- not silently file everyone under Non-Teaching.
ALTER TABLE public.hr_salary_register_lines
  ALTER COLUMN is_teaching SET NOT NULL;

-- ── b) Per-college document settings ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_payroll_document_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id      uuid NOT NULL UNIQUE
                            REFERENCES public.hr_organizations(id) ON DELETE CASCADE,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id),

  -- "JKKNCOP" in "JKKNCOP/ AUGUST SALARY/ 2026"; the suffix makes JKKNCOPNT.
  reference_code          text NOT NULL,
  non_teaching_suffix     text NOT NULL DEFAULT 'NT',

  -- The COLLEGE's bank — the letter's addressee and the cheque's source account.
  bank_name               text NOT NULL,
  bank_branch             text NOT NULL,
  college_account_number  text NOT NULL,
  addressee_title         text NOT NULL DEFAULT 'The Manager',

  -- Chairperson approval wording.
  approval_salutation     text NOT NULL DEFAULT 'Respected Madam',
  submitter_title         text NOT NULL DEFAULT 'CAO',
  approver_title          text NOT NULL DEFAULT 'CHAIRPERSON',

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT hr_payroll_doc_settings_reference_code_chk
    CHECK (length(btrim(reference_code)) BETWEEN 1 AND 40),
  CONSTRAINT hr_payroll_doc_settings_nt_suffix_chk
    CHECK (length(non_teaching_suffix) <= 10),
  CONSTRAINT hr_payroll_doc_settings_bank_name_chk
    CHECK (length(btrim(bank_name)) BETWEEN 1 AND 120),
  CONSTRAINT hr_payroll_doc_settings_bank_branch_chk
    CHECK (length(btrim(bank_branch)) BETWEEN 1 AND 120),
  CONSTRAINT hr_payroll_doc_settings_account_chk
    CHECK (length(btrim(college_account_number)) BETWEEN 1 AND 40),
  CONSTRAINT hr_payroll_doc_settings_addressee_chk
    CHECK (length(btrim(addressee_title)) BETWEEN 1 AND 80),
  CONSTRAINT hr_payroll_doc_settings_salutation_chk
    CHECK (length(btrim(approval_salutation)) BETWEEN 1 AND 80),
  CONSTRAINT hr_payroll_doc_settings_submitter_chk
    CHECK (length(btrim(submitter_title)) BETWEEN 1 AND 60),
  CONSTRAINT hr_payroll_doc_settings_approver_chk
    CHECK (length(btrim(approver_title)) BETWEEN 1 AND 60)
);

COMMENT ON TABLE public.hr_payroll_document_settings IS
  'Per paying-institution constants for the Salary Register Bank Letter and Chairperson Approval documents (ref code, college bank/branch/account, signatory titles).';

-- hr_organization_id is covered by its UNIQUE index.
CREATE INDEX IF NOT EXISTS idx_hr_payroll_doc_settings_institution
  ON public.hr_payroll_document_settings (institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_doc_settings_created_by
  ON public.hr_payroll_document_settings (created_by);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_doc_settings_updated_by
  ON public.hr_payroll_document_settings (updated_by);

DROP TRIGGER IF EXISTS trg_hr_payroll_document_settings_touch ON public.hr_payroll_document_settings;
CREATE TRIGGER trg_hr_payroll_document_settings_touch
  BEFORE UPDATE ON public.hr_payroll_document_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

ALTER TABLE public.hr_payroll_document_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_payroll_document_settings_select ON public.hr_payroll_document_settings;
CREATE POLICY hr_payroll_document_settings_select
  ON public.hr_payroll_document_settings
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.view'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

-- The WITH CHECK also pins institution_id to the organisation's own
-- institution, so a manager of college A cannot file settings against
-- college B's organisation by writing A's institution_id beside it.
DROP POLICY IF EXISTS hr_payroll_document_settings_insert ON public.hr_payroll_document_settings;
CREATE POLICY hr_payroll_document_settings_insert
  ON public.hr_payroll_document_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_organizations o
       WHERE o.id = hr_payroll_document_settings.hr_organization_id
         AND o.institution_id = hr_payroll_document_settings.institution_id
    )
    AND (
      (SELECT public.is_super_admin())
      OR (
        (SELECT public.user_has_permission('hr.payroll.register.manage'))
        AND (SELECT public.role_has_institution_access(institution_id))
      )
    )
  );

DROP POLICY IF EXISTS hr_payroll_document_settings_update ON public.hr_payroll_document_settings;
CREATE POLICY hr_payroll_document_settings_update
  ON public.hr_payroll_document_settings
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_organizations o
       WHERE o.id = hr_payroll_document_settings.hr_organization_id
         AND o.institution_id = hr_payroll_document_settings.institution_id
    )
    AND (
      (SELECT public.is_super_admin())
      OR (
        (SELECT public.user_has_permission('hr.payroll.register.manage'))
        AND (SELECT public.role_has_institution_access(institution_id))
      )
    )
  );

-- No DELETE policy: settings are edited, never removed (RLS denies by default).

DROP POLICY IF EXISTS hr_payroll_document_settings_service_role ON public.hr_payroll_document_settings;
CREATE POLICY hr_payroll_document_settings_service_role
  ON public.hr_payroll_document_settings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- REVOKE FROM anon, not FROM public — see 20260830150000.
REVOKE ALL ON public.hr_payroll_document_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_document_settings TO authenticated;
