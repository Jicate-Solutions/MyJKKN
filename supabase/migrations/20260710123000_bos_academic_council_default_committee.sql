-- Seed a default 'Academic Council' committee into every Academic Council
-- body (bos_compositions.is_academic_council = true), mirroring the default
-- 'Curriculum Development Cell' every BoS composition received in 20260706.
--
-- Why: bos_meetings.committee_id (20260710120000) is the convening-council
-- anchor for member scoping and council-specific TA/DA rates. AC bodies had
-- no committees at all, leaving their meetings/members unattributed. The
-- AC-prepare route (POST /api/bos/academic-council) seeds this committee for
-- new bodies going forward; this migration covers the existing ones.
INSERT INTO public.bos_committees
  (institutions_id, composition_id, name, short_code, sort_order, is_active)
SELECT comp.institutions_id, comp.id, 'Academic Council', 'AC', 0, true
FROM public.bos_compositions comp
WHERE comp.is_academic_council = true
  AND NOT EXISTS (
    SELECT 1 FROM public.bos_committees c
    WHERE c.composition_id = comp.id AND c.name = 'Academic Council'
  );

-- Attach AC members that predate the committee (committee_id IS NULL).
UPDATE public.bos_members m
SET committee_id = c.id
FROM public.bos_compositions comp
JOIN public.bos_committees c
  ON c.composition_id = comp.id AND c.name = 'Academic Council'
WHERE m.composition_id = comp.id
  AND comp.is_academic_council = true
  AND m.committee_id IS NULL;

-- Attribute existing AC meetings to the default committee.
UPDATE public.bos_meetings mt
SET committee_id = c.id
FROM public.bos_compositions comp
JOIN public.bos_committees c
  ON c.composition_id = comp.id AND c.name = 'Academic Council'
WHERE mt.composition_id = comp.id
  AND comp.is_academic_council = true
  AND mt.committee_id IS NULL;

COMMENT ON COLUMN public.bos_meetings.committee_id IS
  'Convening council/committee (bos_committees, composition-owned). Drives council-specific TA/DA rate selection and scopes the meeting''s member list. BoS meetings pick it in the scheduling form; AC meetings attach to the AC body''s default ''Academic Council'' committee. NULL only for unattributable legacy rows.';
