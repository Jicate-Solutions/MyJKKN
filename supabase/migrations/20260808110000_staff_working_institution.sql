-- Updated: 2026-07-30 - Separate "who pays you" from "where you work"
--
-- WHY
-- staff.institution_id is being asked to carry TWO different facts, and today it
-- means different things for different people:
--   • 13 senior officers — including the CEO and the Chief Business Officer —
--     sit under "JKKN College of Engineering and Technology" because Engineering
--     is the entity that PAYS them. None of them works there.
--   • 103 bus drivers, hostel ayaahs, cooks, scavengers and security sit under
--     "JKKN Main Office" because they work ACROSS the whole campus. That is a
--     work location, not a payer.
--   • Everyone else (teaching staff) is unambiguous — both facts coincide.
-- So "who works in the main office?" is currently unanswerable, and the CEO
-- appears as Engineering College staff on every screen.
--
-- Director decision 2026-07-30: keep the existing column as the BILLING
-- organisation (it is already correct for all 740 staff and is load-bearing for
-- permissions) and ADD a working organisation alongside it.
--
-- 🔴 WHY A NEW COLUMN AND NOT A REDEFINITION OF THE EXISTING ONE
-- staff.institution_id syncs to profiles.institution_id (trg_sync_staff_to_profiles)
-- and profiles.institution_id is what role_has_institution_access() reads. Nine of
-- the thirteen officers have ZERO rows in user_institution_access — that column is
-- the ONLY thing granting them access to their college's data. Repurposing it
-- would have silently stripped access from the Chief Business Officer, the
-- Administration Officer, the Hospital Manager and six others. Measured 2026-07-30.
--
-- This column is DISPLAY AND REPORTING ONLY. It is referenced by no RLS policy and
-- no permission function, it is not propagated to profiles, and dropping it would
-- leave every permission in the system behaving identically.
--
-- NULL MEANS "SAME AS THE PAYING INSTITUTION" (Director decision), so the vast
-- majority of records need no data entry at all and reports read correctly at once.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS working_institution_id uuid REFERENCES public.institutions(id);

COMMENT ON COLUMN public.staff.working_institution_id IS
  'Where this person actually works. NULL = same as institution_id. institution_id remains the BILLING organisation (who pays the salary) and is the only one of the two that affects permissions.';

CREATE INDEX IF NOT EXISTS idx_staff_working_institution
  ON public.staff (working_institution_id) WHERE working_institution_id IS NOT NULL;

-- Backfill 1 — shared campus services. Their existing value already means "works
-- everywhere", so recording it explicitly preserves that meaning even after HR
-- later corrects who actually pays them.
UPDATE public.staff s
   SET working_institution_id = s.institution_id, updated_at = now()
  FROM public.institutions i
 WHERE i.id = s.institution_id
   AND i.name = 'JKKN Main Office'
   AND COALESCE(s.is_active, false)
   AND s.working_institution_id IS NULL;

-- Backfill 2 — the clearly-central officers, by staff code so the list is
-- auditable. Deliberately EXCLUDES NOT016 (Hospital Manager) and NOT239 (Camp
-- Officer) at Dental, and NOT008 (Physical Director) at Engineering: those people
-- plausibly work where they are paid, and a wrong guess is worse than a blank.
UPDATE public.staff
   SET working_institution_id = (SELECT id FROM public.institutions WHERE name = 'JKKN Main Office'),
       updated_at = now()
 WHERE staff_id IN (
         'CEO001',   -- Rangarajan R — Chief Executive Officer
         'NOT104',   -- Gowrisankar M.N — Executive Administrative Officer
         'NOT256',   -- Mohanraj V — Chief Business Officer
         'NOT102',   -- Radha Krishnan T — Administration Officer
         'NOT103',   -- Dhuraimurugan G — Administrative Co-Ordinator
         'DTO277',   -- Ranjith K — Digital Transformation Officer
         'NOT260'    -- Selvamani N — Registrar
       )
   AND COALESCE(is_active, false);

-- Guard — this column must never become load-bearing for access by accident.
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public'
     AND (COALESCE(qual,'')||' '||COALESCE(with_check,'')) ILIKE '%working_institution_id%';
  IF v > 0 THEN
    RAISE EXCEPTION 'working_institution_id is referenced by % RLS policy/policies. It is a reporting field; permissions must continue to derive from institution_id.', v;
  END IF;
END
$guard$;
