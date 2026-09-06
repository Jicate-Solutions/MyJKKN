-- ============================================================================
-- Seed-grant: IA Question Paper permissions (MyJKKN consumer of COE /api/v1/ia)
-- 2026-07-17
--
-- The Question Papers module (sidebar: Academic → Assessment → Question Papers)
-- proxies to the COE IA API. These keys gate the MyJKKN page + actions.
--
-- Role keys (verified against custom_roles): faculty = "Facilitator",
-- coe_office = "COE Officer", coe = "Controller of Examiner", hod = "HOD".
--
-- Model (interview decision — "CoE full + faculty scoped to authoring"):
--   view / enter / export  → super_admin, faculty, hod, principal, coe, coe_office
--       (read, generate + author question text, export PDF)
--   approve                → super_admin, hod, principal, coe, coe_office
--       (submit → approve → lock; faculty author only, they do not control the
--        status machine)
--
-- Admins refine per-user afterward in Role Management (manual assignment); without
-- these seed grants the sidebar link would be invisible to everyone but super_admin.
-- ============================================================================

-- view + enter + export → authoring roles (incl. COE office + CoE)
UPDATE public.custom_roles
SET permissions = permissions
      || '{"academic.ia_question_paper.view": true}'::jsonb
      || '{"academic.ia_question_paper.enter": true}'::jsonb
      || '{"academic.ia_question_paper.export": true}'::jsonb,
    updated_at = now()
WHERE role_key IN ('super_admin', 'faculty', 'hod', 'principal', 'coe', 'coe_office');

-- approve (submit/approve/lock) → CoE / leadership only (not faculty)
UPDATE public.custom_roles
SET permissions = permissions || '{"academic.ia_question_paper.approve": true}'::jsonb,
    updated_at = now()
WHERE role_key IN ('super_admin', 'hod', 'principal', 'coe', 'coe_office');

-- Refresh PostgREST schema cache (harmless no-op if not applicable).
NOTIFY pgrst, 'reload schema';
