-- 2026-07-17 - Bug duplicate machinery (PR 1 of bug-triage epic)
-- APPLIED TO PROD 2026-07-17 via Management API (validated first in BEGIN..ROLLBACK).
-- Adds: bug_reports.duplicate_of self-FK, partial index, status CHECK widened
-- with 'duplicate', view exposes duplicate_of / duplicate_of_display_id / duplicate_count.
BEGIN;
ALTER TABLE public.bug_reports
  ADD COLUMN duplicate_of uuid NULL REFERENCES public.bug_reports(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.bug_reports.duplicate_of IS
  'Canonical bug this report duplicates (self-FK). Set together with status=duplicate. Resolving the canonical cascades resolution to all duplicates.';
CREATE INDEX idx_bug_reports_duplicate_of
  ON public.bug_reports (duplicate_of) WHERE duplicate_of IS NOT NULL;
ALTER TABLE public.bug_reports DROP CONSTRAINT bug_reports_status_check;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_status_check
  CHECK (status = ANY (ARRAY['new'::text, 'seen'::text, 'in_progress'::text, 'resolved'::text, 'wont_fix'::text, 'duplicate'::text]));
CREATE OR REPLACE VIEW public.bug_reports_with_details AS
 SELECT br.id, br.created_at, br.reporter_user_id, br.page_url, br.description,
    br.category, br.screenshot_url, br.attachment_urls, br.console_logs, br.status,
    br.resolved_at, br.metadata, br.display_id, br.institution_id, br.department_id,
    p.full_name AS reporter_name, p.email AS reporter_email, p.role AS reporter_role,
    i.name AS institution_name, d.department_name, d.department_code,
    br.module_name, br.sub_module_name,
    br.duplicate_of,
    canon.display_id AS duplicate_of_display_id,
    (SELECT count(*)::int FROM public.bug_reports dup WHERE dup.duplicate_of = br.id) AS duplicate_count
   FROM public.bug_reports br
     LEFT JOIN public.profiles p ON br.reporter_user_id = p.id
     LEFT JOIN public.institutions i ON br.institution_id = i.id
     LEFT JOIN public.departments d ON br.department_id = d.id
     LEFT JOIN public.bug_reports canon ON br.duplicate_of = canon.id;
COMMIT;
