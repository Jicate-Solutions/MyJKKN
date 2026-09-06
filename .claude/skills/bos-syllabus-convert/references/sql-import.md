# bos_course_syllabi — SQL Import Contracts

How to turn extracted syllabus JSON into `INSERT`/`UPDATE` SQL for
`public.bos_course_syllabi`. These are DB mechanics NOT covered by
`extraction-spec.md`. All verified against live data.

## Table of contents
- Column mapping (JSON → columns)
- JSONB shapes per column
- PO mapping notation (CET vs CAS)
- Scope columns & how to resolve them
- created_by gotcha (auth.users, not profiles)
- course_id resolution (COE bridge)
- Dollar-quoting & rerun safety
- INSERT template / UPDATE templates

## Column mapping (JSON → columns)

| Column | Source | Notes |
|---|---|---|
| institutions_id | user-supplied uuid | scope constant |
| board_id | user-supplied uuid | scope constant |
| regulation_id | user-supplied uuid | scope constant |
| composition_id | user-supplied uuid or NULL | scope |
| course_id | resolved (see below) | COE course uuid, varchar(64) |
| course_code | course_info.course_code | part of unique key |
| course_name | course_info.course_title | |
| course_credits | course_info.credits | **integer** — 1.5 → NULL |
| total_hours | course_info.total_hours | integer (periods); may be NULL |
| course_objectives | objectives | JSONB, see shapes |
| course_learning_outcomes | clos | JSONB |
| course_content | units / practicals | JSONB |
| textbooks | text_books + reference_books | JSONB |
| web_resources | web_resources | JSONB |
| pedagogy | pedagogy | JSONB |
| po_mappings | po_pso_mapping | JSONB, per-institution notation |
| created_by | auth.users.id uuid | FK — see gotcha |
| notes | free text | record source file + REVIEW flags |

## JSONB shapes

```
course_objectives : {"objectives":[{"number":1,"description":"..."}]}
course_learning_outcomes : {"clos":[{"clo_number":1,"description":"...","k_values":[]}]}
textbooks : {"primary":[{"title","author","publication_year":int|null}], "references":[...]}
web_resources : {"resources":[{"title","url"}]}
pedagogy : {"methods":["..."]}
po_mappings : {"mappings":[{"co_id":"CO1","pos":{...},"psos":{...}}]}   # omit psos when empty
```

**course_content — theory** (v3.4, flat-list = blank chapter, all topics as
sub-topics; `hours` per unit; top-level `total_hours`):
```json
{"units":[
  {"unit_id":"I","unit_title":"CLASSIFICATION OF SIGNALS AND SYSTEMS","hours":"6+6","remarks":"",
   "chapters":[{"chapter_number":1,"title":"","sections":"",
     "subtopics":[{"number":1,"title":"Standard signals- Step"},{"number":2,"title":"Ramp"}]}]}
 ],
 "total_hours":"30+30"}
```
- `hours` is the printed count from the unit heading ("6+6","9","9+3"), stripped
  from `unit_title`. `total_hours` is the raw form after `TOTAL:` ("30+30","45").
- Header→detail / named-sub-section units keep a non-blank chapter `title`.

**course_content — lab / practical paper** (`is_practical`, flat topic list —
NOT synthesized units):
```json
{"units":[],"is_practical":true,"topics":[{"number":1,"title":"..."}]}
```

## PO mapping notation — per INSTITUTION TYPE (verified live)

- **CET (engineering college)** → store NUMERIC strings: `"pos":{"PO1":"3","PO6":"2"}`.
  Legend: `1 - low, 2 - medium, 3 - high, '-' - no correlation`.
- **CAS (arts & science college)** → store LETTER strings: `"pos":{"PO1":"H"}`.
  Legend: `H–High; M–Medium; L–Low`.
- Convert the source value to the institution's notation (H→3/M→2/L→1 for CET;
  3→H/2→M/1→L for CAS). OMIT the key entirely for no-correlation — never write
  `0`, `-`, `""`. Never mix notations in one row.
- Drop the trailing average/consolidated row (labelled `CO`/`Avg`/`C`).

## Scope columns

institutions_id / board_id / regulation_id / composition_id are supplied by the
user (ask if not given). counselling_code is stamped automatically by the
`bos_set_counselling_code` BEFORE trigger — do not set it.

## created_by gotcha

`created_by` FKs **auth.users(id)**, NOT `public.profiles(id)` — a profiles-style
uuid fails with `23503`. If unsure, resolve by email:
`(SELECT id FROM auth.users WHERE lower(email)=lower('<importer-email>') LIMIT 1)`
and confirm the email exists first (empty result → NOT NULL violation).

## course_id resolution (COE bridge)

`course_id` holds the **COE** course uuid. The local mirror `public.courses`
carries `course_code`, `id` (local), and `coe_course_id` (the COE id). Resolve
via `coe_course_id`, scoped to the institution:
```sql
UPDATE public.bos_course_syllabi s
SET course_id = c.coe_course_id::text, last_modified_at = now()
FROM public.courses c
WHERE s.course_id IS NULL
  AND c.institution_id = s.institutions_id
  AND upper(btrim(c.course_code)) = upper(btrim(s.course_code))
  AND c.coe_course_id IS NOT NULL;
```
If the courses aren't synced into the mirror for that institution, course_id
stays NULL — run the app's `POST /api/bos/syllabus/backfill-course-id` (resolves
from the COE API) or the COE→MyJKKN course sync first. NULL course_id is
non-blocking: syllabi render/export fine without it.

## Dollar-quoting & rerun safety

- Dollar-quote every JSONB literal as `$j$…$j$::jsonb` to avoid apostrophe
  escaping (e.g. "Stoke's theorem").
- The unique key `(regulation_id, course_code, version_number)` makes a rerun of
  the same INSERT fail loudly instead of duplicating. Wrap the batch in
  `BEGIN; … COMMIT;`.

## INSERT template (one per course)

```sql
INSERT INTO public.bos_course_syllabi (
  institutions_id, board_id, regulation_id, composition_id, course_id,
  course_code, course_name, course_credits, total_hours,
  course_objectives, course_learning_outcomes, course_content,
  textbooks, web_resources, pedagogy, po_mappings,
  created_by, notes
) VALUES (
  '<inst>'::uuid, '<board>'::uuid, '<reg>'::uuid, <comp|NULL>,
  (SELECT c.coe_course_id::text FROM public.courses c
     WHERE c.institution_id='<inst>'::uuid AND c.course_code='<CODE>' LIMIT 1),
  '<CODE>', '<NAME>', <credits|NULL>, <hours|NULL>,
  $j$…$j$::jsonb, $j$…$j$::jsonb, $j$…$j$::jsonb,
  $j$…$j$::jsonb, $j$…$j$::jsonb, $j$…$j$::jsonb, $j$…$j$::jsonb,
  '<created_by>'::uuid, '…'
);
```

## In-place UPDATE templates

Patch `course_content` only (scope by the unique key):
```sql
UPDATE public.bos_course_syllabi
SET course_content = $j$…$j$::jsonb, last_modified_at = now()
WHERE regulation_id='<reg>'::uuid AND composition_id='<comp>'::uuid
  AND course_code='<CODE>' AND version_number=1;
```

Relabel po_mappings letters→numbers for a CET batch (idempotent; guarded so
already-numeric rows are skipped): use `jsonb_each_text` + `jsonb_object_agg`
with `CASE v WHEN 'H' THEN '3' WHEN 'M' THEN '2' WHEN 'L' THEN '1' ELSE v END`,
filtered by `WHERE po_mappings::text ~ '"[HML]"'`.

## xlsx importer constraint

If the target is the portal xlsx import instead of SQL: a Sub-topic row MUST be
preceded by its unit's Chapter row (a blank-Chapter row still anchors the
sub-topics that follow). `parseUnitsSheet` silently drops orphan sub-topics.
