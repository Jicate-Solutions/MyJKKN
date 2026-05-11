-- ============================================================================
-- 20260508120002 — Grant student-form permissions to admission-flavor roles
-- ============================================================================
-- Mirrors the per-key + per-role rationale from the design doc:
--   * student_form.generate → super_admin, admission, admission_staff,
--                              admission_counselor (anyone who can manage
--                              leads should be able to generate the QR)
--   * student_form.revoke   → super_admin, admission, admission_staff
--                              (counselors don't get revoke — admin-only)
--   * student_section.override → super_admin, admission only
--                              (audit-flagged write to student-owned cols)
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.leads.student_form.generate": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('super_admin', 'admission', 'admission_staff', 'admission_counselor')
   AND COALESCE(permissions->>'admission.leads.student_form.generate', 'false') <> 'true';

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.leads.student_form.revoke": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('super_admin', 'admission', 'admission_staff')
   AND COALESCE(permissions->>'admission.leads.student_form.revoke', 'false') <> 'true';

UPDATE public.custom_roles
   SET permissions = permissions || '{"learners.profile.student_section.override": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('super_admin', 'admission')
   AND COALESCE(permissions->>'learners.profile.student_section.override', 'false') <> 'true';
