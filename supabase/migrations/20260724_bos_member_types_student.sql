-- ============================================================================
-- Migration: 20260724_bos_member_types_student.sql
-- Description: Allow 'student' as a bos_member_types.base_type value, and seed
--              CET's two missing member types (Student Members, Department
--              Autonomous Coordinator).
--
-- Context: CET (JKKN College of Engineering and Technology) needs Student
-- Members added to the composition "Member Type" list. Per the 2026-07-24
-- decision students are picked from the BoS Experts list (they have no staff
-- record), so 'student' behaves as an EXTERNAL expert type:
--   • Add Member's Source = External Expert filter includes it
--     (EXTERNAL_EXPERT_BASE_TYPES in add-member-dialog.tsx)
--   • TA/DA prefills the external SOP shape
--     (EXTERNAL_BASE_TYPES in rate-settings-dialog.tsx)
--   • the Experts page gains a matching 'student' category (BosExpertCategory)
--
-- "Department Autonomous Coordinator" is an internal faculty role → base_type
-- 'internal_member' (Source = Staff, no external TA/DA).
--
-- bos_members.member_type needs no change — its CHECK was dropped in
-- 20260710150000 (member_type stores the catalog name verbatim).
--
-- Mirrors 20260723's constraint block — drop & re-add the CHECK with the full
-- current set plus 'student'. Idempotent: seed uses ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

-- ── 1. Widen the base_type CHECK to include 'student' ────────────────────────
ALTER TABLE public.bos_member_types
  DROP CONSTRAINT IF EXISTS bos_member_types_base_type_check;

ALTER TABLE public.bos_member_types
  ADD CONSTRAINT bos_member_types_base_type_check
  CHECK (base_type IN (
    'principal', 'chairman', 'hod', 'facilitator', 'university_nominee',
    'subject_expert', 'academic_expert', 'internal_member', 'industry_expert',
    'alumni', 'startup', 'member_secretary', 'student'
  ));

-- ── 2. Seed CET's two missing member types ───────────────────────────────────
-- Appended after CET's existing 7 rows (sort_order 0–6). Names are matched
-- case-insensitively by the unique index, so re-running is a no-op.
INSERT INTO public.bos_member_types (institutions_id, name, base_type, sort_order)
SELECT i.id, v.name, v.base_type, v.sort_order
FROM public.institutions i
CROSS JOIN (VALUES
  ('Student Members',                   'student',         7),
  ('Department Autonomous Coordinator', 'internal_member', 8)
) AS v(name, base_type, sort_order)
WHERE i.counselling_code = 'CET'
ON CONFLICT (institutions_id, lower(name)) DO NOTHING;

COMMIT;
