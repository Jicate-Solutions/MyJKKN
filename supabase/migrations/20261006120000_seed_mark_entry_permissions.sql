-- ============================================================================
-- Seed-grant: CIA Mark Entry permissions (/academic/mark-entry)
-- 2026-10-06
--
-- The keys academic.mark-entry.{view,enter} were declared in
-- lib/constants/permissions.ts and wired into MENU_PERMISSIONS + the page, but
-- never granted to any role — so the sidebar link and the page were invisible
-- to everyone except super_admin.
--
-- Model: same page access as Question Papers. Whoever can open
-- /academic/question-papers can open /academic/mark-entry, and whoever can
-- author papers can key in marks. Keyed off the LIVE question-paper grants
-- rather than a role list, so roles added by hand in Role Management
-- (e.g. vice_principal) are carried over too.
--
--   academic.ia_question_paper.view   →  academic.mark-entry.view
--   academic.ia_question_paper.enter  →  academic.mark-entry.enter
--
-- '.enter' on leadership roles is harmless: guardMarkEntryScope
-- (lib/utils/mark-entry/mark-entry-access.ts) forces the 'all' tier
-- (principal / registrar / CoE office) view-only server-side.
--
-- Idempotent. Admins refine per-role afterward in Role Management.
-- ============================================================================

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.mark-entry.view": true}'::jsonb,
    updated_at = now()
WHERE permissions @> '{"academic.ia_question_paper.view": true}'::jsonb
  AND NOT permissions @> '{"academic.mark-entry.view": true}'::jsonb;

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.mark-entry.enter": true}'::jsonb,
    updated_at = now()
WHERE permissions @> '{"academic.ia_question_paper.enter": true}'::jsonb
  AND NOT permissions @> '{"academic.mark-entry.enter": true}'::jsonb;
