-- ─────────────────────────────────────────────────────────────────────────────
-- v3.5 inline-bold markers for the canonical paragraph blocks.
--
-- The source HTML documents bold key phrases (<strong>) inside the Capstone
-- intro, the Concept Applications intro, and the LLC description. The PDF/DOCX
-- exporters (2026-07-09) render **…** markers as bold. This stamps those
-- markers into every populated v3.5 row.
--
-- Idempotent: each UPDATE skips rows already carrying '**' in that field.
-- Reversible: replace(…, '**', '') restores plain text.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1. Capstone Project intro — four <strong> phrases.
update public.bos_course_syllabi
set capstone_project = jsonb_set(capstone_project, '{intro_note}', to_jsonb(
      replace(replace(replace(replace(replace(
        capstone_project->>'intro_note',
        'The assessment focuses on what AI cannot do.',
        '**The assessment focuses on what AI cannot do.**'),
        'the AI-proof primary deliverable',
        '**the AI-proof primary deliverable**'),
        'a short ~400-word reflection',
        '**a short ~400-word reflection**'),
        'a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)',
        '**a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)**'),
        'a 5-7 minute presentation at the end-of-course Learners Led Conference (LLC)',
        '**a 5-7 minute presentation at the end-of-course Learners Led Conference (LLC)**')
    )),
    last_modified_at = now()
where capstone_project ? 'intro_note'
  and capstone_project->>'intro_note' not like '%**%'
  and is_latest = true and is_archived = false;

-- 2. Concept Applications intro — the evidence sentence.
update public.bos_course_syllabi
set concept_applications = jsonb_set(concept_applications, '{intro_note}', to_jsonb(
      replace(
        concept_applications->>'intro_note',
        'The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.',
        '**The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.**')
    )),
    last_modified_at = now()
where concept_applications ? 'intro_note'
  and concept_applications->>'intro_note' not like '%**%'
  and is_latest = true and is_archived = false;

-- 3. LLC description — three <strong> phrases.
update public.bos_course_syllabi
set llc_conference = jsonb_set(llc_conference, '{description}', to_jsonb(
      replace(replace(replace(replace(
        llc_conference->>'description',
        'convenes a Learners Led Conference',
        'convenes a **Learners Led Conference**'),
        'every Learner presents their Capstone',
        '**every Learner presents their Capstone**'),
        'a 5–7 minute talk',
        '**a 5–7 minute talk**'),
        'a 5-7 minute talk',
        '**a 5-7 minute talk**')
    )),
    last_modified_at = now()
where llc_conference ? 'description'
  and llc_conference->>'description' not like '%**%'
  and is_latest = true and is_archived = false;

-- 4. Verify: every populated row should now carry markers in all three fields.
select
  count(*) filter (where capstone_project->>'intro_note' like '%**%')      as cp_marked,
  count(*) filter (where concept_applications->>'intro_note' like '%**%')  as ca_marked,
  count(*) filter (where llc_conference->>'description' like '%**%')       as llc_marked,
  count(*) filter (where capstone_project is not null)                     as cp_total
from public.bos_course_syllabi
where is_latest = true and is_archived = false and capstone_project is not null;

commit;
