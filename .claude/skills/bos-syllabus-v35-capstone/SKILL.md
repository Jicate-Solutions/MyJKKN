---
name: bos-syllabus-v35-capstone
description: Author and import the v3.5 Fink's/Capstone assessment blocks for BoS course syllabi — the five JSONB columns on bos_course_syllabi (concept_applications, assessment_pattern, capstone_project, capstone_rubric, llc_conference) edited on the /bos/syllabus "Capstone & LLC" tab. Use when (1) converting a v3.5 HTML syllabus document into UPDATE queries that populate these columns, (2) authoring Concept Applications / Capstone Options / Assessment Pattern / Capstone Rubric / LLC content for a course, (3) generating bulk import SQL for a batch of v3.5 syllabi, or (4) debugging why these sections are empty in the form or exports. Triggers on "v3.5", "capstone project", "concept applications", "LLC", "Learners Led Conference", "capstone rubric", "assessment pattern", "Fink's activities", "update query for syllabus html".
---

# BoS Syllabus v3.5 — Fink's Formative + Capstone Import

Convert v3.5 syllabus HTML documents (or authored content) into the five JSONB
columns on `bos_course_syllabi`, and generate the UPDATE SQL that writes them.

## The five columns (added by `supabase/migrations/20260709_bos_syllabus_finks_capstone_v35.sql`)

| Column | Section in the v3.5 document | UI (Capstone & LLC tab) |
|---|---|---|
| `concept_applications` | "Concept Applications (Formative Learning Activities)" table | intro note + activity rows (Unit / Fink's Dim. / Task / Deliverable) |
| `assessment_pattern` | "Assessment Pattern" (Internal 30 \| External 70) | marks split + component rows with live total check |
| `capstone_project` | "Capstone Project — choose ONE of FIVE" | intro + option cards (Title / Primary AI-proof / Support / LLC demo) |
| `capstone_rubric` | "Capstone Rubric (10 marks · common to all 5 options)" | criteria rows with total-vs-10 check |
| `llc_conference` | "End-of-Course Learners Led Conference" | title / subtitle / description |

Exact JSON shapes, the canonical common blocks (assessment pattern, rubric,
LLC text — identical across all v3.5 courses), and TypeScript interface names:
read [references/json-shapes.md](references/json-shapes.md) BEFORE composing any JSON.

## Workflow: HTML document → UPDATE SQL

1. **Identify the course**: `course_code` from the header table (e.g. `26UADC01`).
   Rows are matched with `course_code = '<code>' AND is_latest = true AND is_archived = false`.
2. **Extract the five sections** from the HTML (`h3.section-head` /
   `.capstone-section` blocks). Only `concept_applications` and
   `capstone_project` are course-specific; `assessment_pattern`,
   `capstone_rubric`, and `llc_conference` are the standard v3.5 blocks —
   copy them from json-shapes.md instead of re-extracting, unless the
   document visibly deviates.
3. **Clean the text** (v3.5 HTML exports are frequently mojibake):
   - `â` → `—` (em dash), `Â·` → `·`, `&#x27;` → `'`, `&amp;` → `&`, `&ldquo;/&rdquo;` → drop
   - Capstone titles are double-wrapped (`""Title""`) — store the bare title, no quotes.
   - Split each capstone option paragraph into three fields:
     `primary` = text after `PRIMARY (AI-proof):`, `support` = text after
     `SUPPORT:`, `llc` = text after `LLC:` (strip the prefixes themselves).
   - `sno`/`option_no` are 1-based integers; omit `id` (UI generates keys).
4. **Compose the SQL** from [assets/update-template.sql](assets/update-template.sql):
   one shared UPDATE for the three common columns across all course codes in
   the batch, then one UPDATE per course for `concept_applications` +
   `capstone_project`. Always inside `begin; ... commit;` with the
   verification SELECTs from the template.
5. **Write the file** to `scripts/update-bos-syllabus-v35-<batch-slug>.sql`
   and validate every JSON literal parses (e.g. `node -e` with `JSON.parse`
   over each extracted `$j$...$j$` block, or eyeball via a linter).

## Guardrails

- **Dollar-quote every JSON literal** (`$j$ ... $j$::jsonb`). The prose is full
  of apostrophes ("Fink's", "shop's") — never single-quote it.
- **Migration first**: the 20260709 migration MUST be applied before running
  any update (same class of failure as the AC sender-override incident —
  writing to missing columns errors the whole statement).
- **Never overwrite non-null columns silently.** If a target row might already
  carry v3.5 content, add `AND concept_applications IS NULL` style guards or
  confirm with the user first.
- **`is_latest = true` only.** Historical versions are frozen snapshots;
  updating them corrupts the version trail.
- **Row-count check**: the template's verification SELECT must return one row
  per course code, each with all five columns non-null. Zero rows = wrong
  code or the syllabus lives under a different regulation; report, don't force.
- **Total checks**: internal components must sum to `internal_marks` (15+5+10=30),
  rubric criteria to `total_marks` (2+3+2+2+1=10). The form shows amber if not.
- **Do not touch `assessment_structure`** (the older v1.2 blob) — it coexists;
  v3.5 content lives only in the five new columns.

## Related code (for debugging)

- Form editors: `components/bos/syllabus-form.tsx` — "Capstone & LLC" tab,
  `ConceptApplicationsEditor` etc.; defaults `DEFAULT_ASSESSMENT_PATTERN`,
  `DEFAULT_CAPSTONE_RUBRIC`, `DEFAULT_LLC_CONFERENCE`.
- Types: `types/bos.ts` — `BosConceptApplicationsData`,
  `BosAssessmentPatternData`, `BosCapstoneProjectData`,
  `BosCapstoneRubricData`, `BosLlcConferenceData`.
- Write paths: POST spreads the body; PUT whitelist in
  `app/api/bos/syllabus/[id]/route.ts`; clone + revise routes copy the five
  fields explicitly. If a new consumer drops them, that's where to look.
