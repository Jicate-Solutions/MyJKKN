-- ─────────────────────────────────────────────────────────────────────────────
-- TEMPLATE: v3.5 Fink's/Capstone import for bos_course_syllabi
-- Replace <...> placeholders. One shared UPDATE for the three canonical
-- blocks, then one per-course UPDATE for the two course-specific columns.
-- Requires: supabase/migrations/20260709_bos_syllabus_finks_capstone_v35.sql applied.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 0. Sanity: every target code resolves to exactly one latest row.
--    Run this SELECT first; abort if any code is missing or duplicated.
select course_code, count(*) as latest_rows
from public.bos_course_syllabi
where course_code in (<'CODE1', 'CODE2', ...>)
  and is_latest = true and is_archived = false
group by course_code;

-- 1. Canonical common blocks (identical across all v3.5 courses).
update public.bos_course_syllabi
set
  assessment_pattern = $j$<assessment_pattern JSON from references/json-shapes.md>$j$::jsonb,
  capstone_rubric    = $j$<capstone_rubric JSON from references/json-shapes.md>$j$::jsonb,
  llc_conference     = $j$<llc_conference JSON from references/json-shapes.md>$j$::jsonb,
  last_modified_at   = now()
where course_code in (<'CODE1', 'CODE2', ...>)
  and is_latest = true and is_archived = false;

-- 2. Per-course blocks (repeat this statement per course).
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "<...>",
    "activities": [
      { "sno": 1, "unit": "<...>", "finks_dimension": "<...>", "task": "<...>", "deliverable_notes": "<...>" }
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "<canonical intro from references/json-shapes.md>",
    "options": [
      { "option_no": 1, "title": "<...>", "primary": "<...>", "support": "<...>", "llc": "<...>" }
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '<CODE1>'
  and is_latest = true and is_archived = false;

-- 3. Verify: one row per code, all five columns populated.
select course_code,
       (concept_applications is not null) as ca,
       (assessment_pattern   is not null) as ap,
       (capstone_project     is not null) as cp,
       (capstone_rubric      is not null) as cr,
       (llc_conference       is not null) as llc,
       jsonb_array_length(concept_applications->'activities') as n_activities,
       jsonb_array_length(capstone_project->'options')        as n_options
from public.bos_course_syllabi
where course_code in (<'CODE1', 'CODE2', ...>)
  and is_latest = true and is_archived = false
order by course_code;

commit;
