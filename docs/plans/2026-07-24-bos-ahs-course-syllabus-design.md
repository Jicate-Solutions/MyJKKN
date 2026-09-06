# BoS AHS (Allied Health Sciences) — Course & Syllabus Technical Specification

**Date:** 2026-07-24
**Author:** Investigation for AHS syllabus onboarding
**Status:** Design — awaiting implementation sign-off
**Source material:** `D:\JKKN\Document\JKKN Syllabus\JKKNAHS\Syllabus\*.pdf` (9 B.Sc AHS programs)
**Affiliation:** The Tamil Nadu Dr. M.G.R. Medical University, Chennai (NOT Anna University)

---

## 0. Confirmed direction (decisions locked before writing this spec)

| Decision | Choice |
|---|---|
| Where AHS papers live | **Extend the COE course-master** (`/api/v1/courses`) with nullable AHS fields; the `/bos/courses` proxy branches by institution model. |
| AHS course codes | **AHS papers get a temporary auto-assigned code now, replaced with the official code later.** Source PDFs have no codes, so a deterministic **temp-code generator** assigns a flagged placeholder at creation; when the real code is issued it **updates in place**. `course_code` stays populated throughout; *credits / L-T-P / category / CO-PO / Bloom's* are what's absent. |
| Where AHS syllabus content lives | **Extend `bos_course_syllabi`** with an `academic_model` discriminator + AHS-only JSONB columns. Reuse existing versioning / RLS / CAS / observer plumbing. |

Everything below is written to those three decisions.

---

## 1. Executive summary

The current BoS Course & Syllabus stack is hard-wired to the **Anna-University engineering / arts model**: semester-based, coded courses with credits + L-T-P, CIA+ESE marks, and CO-PO-PSO + Bloom's/Fink's syllabus mapping. The 9 AHS programs follow the **Dr. M.G.R. Medical University model**, which is structurally different on almost every axis:

- **Year-based**, not semester-based (Year 1 / 2 / 3 + a 12-month internship). **Zero** semester references across all 9 PDFs.
- Organised as **Papers** (`Paper I–IV`) or **Subjects** (`SUBJECT 1: ANATOMY`, with `Unit 1–4`) — variable per program.
- **No credits** (8 of 9 programs), **no L-T-P period split** (0 of 9), instead **lecture-hours** where given (e.g. `140 hours`).
- **No CO-PO-PSO mapping and no Bloom's/K-levels** in any program.
- Two **new domain entities** the current system has no place for:
  1. **Examination Scheme** — per-paper marks split across Theory (University) / Practical / Viva / Internal Assessment, plus a **question-paper pattern** (e.g. Essays 3×10, Short Notes 8×5, Short Answers 10×3 = 100), and an **"internal paper"** flag (English/Computer are internal — no university exam).
  2. **Internship / In-service postings** — duration-based rotations (e.g. `HDU/ICU 3 months`, `Sleep lab 1 month`).

Because BoS courses are a **live proxy over the external COE API** (there is *no local `bos_courses` table*), and the syllabus table is the only locally-owned, extensible surface, the plan is: extend COE minimally so AHS papers exist as courses, and carry all the AHS-specific richness on `bos_course_syllabi` behind an `academic_model` discriminator.

---

## 2. Current (as-is) architecture

### 2.1 Courses — a COE proxy, not a local table

**There is no `bos_courses` table anywhere in `supabase/migrations/`.** The BoS "course master" is a live proxy over the external COE system's `GET/POST /api/v1/courses`.

- Proxy routes: [route.ts](app/api/bos/courses-master/route.ts), [[id]/route.ts](app/api/bos/courses-master/[id]/route.ts), [import/route.ts](app/api/bos/courses-master/import/route.ts).
- The effective schema is the TS interface `BosCourseMaster` in [types/bos-courses.ts:49-89](types/bos-courses.ts#L49-L89) — it mirrors COE's `courses` / `course_mapping` tables.
- Validation & COE payload builder: [lib/services/bos/courses-schemas.ts](lib/services/bos/courses-schemas.ts) (`courseFormSchema` L63-94, `toCoeCreatePayload` L99-156, `importRowSchema` L159-161).
- The only *local* course-ish table is `bos_course_reviews` (meeting review outcomes) — [20260306_create_bos_tables.sql:448](supabase/migrations/20260306_create_bos_tables.sql#L448). `app/api/bos/courses/[id]/route.ts` operates on **reviews**, not the master — do not confuse them.

**Classification fields (all Anna-University shaped):**
- `course_category` (required): `Theory`, `Practical`, `Project`, `Non Academic`, `Theory + Practical`, `Theory + Project`, `Field Work`, `Community Service`, `Group Project`.
- `course_type` (live from COE `/api/v1/course-info`; fallback enum in schema).
- `course_part_master` (`Part I–V`), `course_level` (Roman `I`–`XX`).
- Workload: `credit`, `theory_hours`, `tutorial_hours`, `practical_hours`, `exam_duration`, `internal_max_mark`, `external_max_mark`, `total_max_mark`, `evaluation_type` (default `CIA + ESE`).

**Institution-type branching today** — `PART_LEVEL_EXEMPT_CODES = new Set(['CET'])` in [courses-schemas.ts:56](lib/services/bos/courses-schemas.ts#L56); engineering (`CET`) skips Part/Level. This is the existing pattern a new AHS branch will extend.

### 2.2 Syllabus — local `bos_course_syllabi`, Anna-University shaped

Created by [20260506_create_bos_course_syllabi_table.sql](supabase/migrations/20260506_create_bos_course_syllabi_table.sql), then extended by:
- `20260618150000_bos_add_counselling_code.sql` (CAS key + trigger),
- `20260618160000_bos_syllabi_add_course_id.sql` (`course_id` COE bridge),
- `20260625_bos_syllabus_assessment_structure.sql` (v1.2 `assessment_structure`),
- `20260709_bos_syllabus_finks_capstone_v35.sql` (the five v3.5 JSONB columns).

**Effective columns** (abridged): `id`, `institutions_id` (FK), `board_id`, `regulation_id`, `course_code`, `course_name`, `course_credits`, `version_number`, `is_latest`, `is_archived`, `revised_from_syllabus_id`, `counselling_code` (CAS), `course_id` (COE bridge), `stream`, and the JSONB payload columns:
`course_objectives`, `course_learning_outcomes`, `course_content`, `textbooks`, `web_resources`, `pedagogy`, `po_mappings`, `assessment_structure` (v1.2), and v3.5 `concept_applications` / `assessment_pattern` / `capstone_project` / `capstone_rubric` / `llc_conference`.

TS types for every JSONB shape: [types/bos.ts:390-700](types/bos.ts#L390-L700). Key shapes:
- `course_content` → units[] (`unit_id` I–V, chapters, subtopics, `hours`), or `is_practical`+`topics[]`, or `is_project`+`project_units[]`, plus `total_hours` ("30+30").
- `course_learning_outcomes` → `{ clos: [{ clo_number, description, k_values: ['K1'..] }] }`.
- `po_mappings` → `{ mappings: [{ co_id:'CO1', pos: {PO1:'H'|'M'|'L'}, psos? }] }`. **Encoding branches on institution type**: engineering numeric `1/2/3`, CAS letters `H/M/L` — [syllabus-form.tsx:3640-3653](components/bos/syllabus-form.tsx#L3640-L3653), keyed on `scope.isCAS`.

**API:** [route.ts](app/api/bos/syllabus/route.ts) (GET list / POST create), [[id]/route.ts](app/api/bos/syllabus/[id]/route.ts) (GET/PUT/DELETE — PUT uses an explicit allow-list of updatable JSONB columns), plus `clone`, `revise`, `extract`, `export-pdf`, `export-xlsx`. **No Zod** — manual validation.

**UI:** the 3,931-line [components/bos/syllabus-form.tsx](components/bos/syllabus-form.tsx). Tabs: Basic Info, Objectives, Course Outcomes, Content, Resources, Pedagogy, PO Mappings (+ Fink's-only Assessment and Capstone & LLC, currently hidden by `HIDE_FINKS_TABS = true`).

### 2.3 The two import/convert skills (as-is workflow)

- **`bos-curriculum-pdf-to-import`** — turns an AICTE/Anna curriculum PDF into the `/bos/courses` bulk-import `.xlsx`. Core logic is the **two-axis** mapping: PDF `CATEGORY` → template **Type**; L-T-P split → template **Category**. Assumes coded courses + L-T-P + credits. **None of these axes exist in AHS source docs.**
- **`bos-syllabus-convert`** — turns a course-syllabus doc into the 8-sheet `syllabus-template.xlsx` and/or `bos_course_syllabi` SQL. Assumes UNIT I–V, COURSE OBJECTIVES, COURSE OUTCOMES, CO-PO/PSO mapping, Bloom's K-levels. **AHS docs have none of the mapping/outcome structure**; they have flat topic lists (or Subject→Unit) + exam scheme + internship.

Both skills need an **AHS mode / branch** (Section 6).

---

## 3. The AHS source format (what's actually in the 9 PDFs)

Evidence extracted via `pdftotext -layout` over all 9 programs. Signal scan results:

| Program | Years | Semesters | Course codes | Credits | L-T-P | CO-PO | Bloom's | Structure | Exam scheme | Internship |
|---|---|---|---|---|---|---|---|---|---|---|
| Respiratory Therapy | 3 | 0 | none | 0 | 0 | 0 | 0 | Paper I–IV / flat topics | ✔ marks + Q-pattern | ✔ postings |
| Cardiac Technology | 3 | 0 | none | 0 | 0 | 0 | 0 | Paper I–IV | ✔ + internal papers | ✔ |
| Accident & Emergency Care | 3 | 0 | none | 0 | 0 | 0 | 0 | Paper (×18) | ✔ | ✔ |
| Critical Care Technology | 3 | 0 | none | 0 | 0 | 0 | 0 | Subject + Unit (×277) | ✔ | ✔ |
| Dialysis Technology | 3 | 0 | none | 0 | 0 | 0 | 0 | Paper/Subject | ✔ | ✔ |
| Medical Record Sciences | 3 | 0 | `BMRSc 1-1` | few | 0 | 0 | 0 | Subject + Unit + **lecture-hours** | ✔ + mark distribution | ✔ paid |
| Operation Theatre & Anaesthesia | 3 | 0 | none | 0 | 0 | 0 | 0 | Paper (×5) | ✔ | ✔ |
| Physician Assistant | 3 | 0 | none | 0 | 0 | 0 | 0 | Subject + Unit 1–4 (+units count) | ✔ | ✔ inservice |
| Radiology & Imaging | 3 | 0 | none | 0 | 0 | 0 | 0 | Paper I–IV | ✔ | ✔ |

**Universal AHS characteristics:**
1. **Year-based** — `First / Second / Third Year` + Internship. No semesters anywhere.
2. **Papers or Subjects**, program-dependent. Some flat topic lists; some Subject→Unit 1–4 trees. Codes usually absent in source (will be assigned — see §0).
3. **No credits / no L-T-P / no CO-PO-PSO / no Bloom's.** Lecture-hours appear in a few programs.
4. **Examination Scheme** per paper — a marks matrix:
   - Columns observed: `Theory (University) Max/Min`, `Practical Max/Min`, `Viva Max/Min`, `Internal Assessment (IA) Max/Min`. Typical row: `100/50 · 100/50 · 50/25 · 50/25`.
   - **Question-paper pattern**: `Essays 3×10=30`, `Short Notes 8×5=40`, `Short Answers 10×3=30`, Total 100. Varies by program.
   - **Internal papers**: English / Computer — "no university examination; marks sent to the university."
   - Some programs add per-paper **mark distribution** (e.g. MRS theory paper = Anatomy 30 + Physiology 30 + Pathology 10 + …).
5. **Internship / In-service training** — duration-based postings (e.g. Respiratory: `HDU/ICU 3m, PFT lab 2m, Bronchoscopy 2m, Rehab 2m, Sleep lab 1m, OPD`). Physician Assistant uses per-year "In-service training" rotations with skill checklists.

Extracted text is available at `…/scratchpad/ahs_txt/*.txt` for authoring.

---

## 4. Gap analysis — current vs AHS (the diff to close)

| Concern | Current (Anna model) | AHS (M.G.R. model) | Gap / change |
|---|---|---|---|
| Time unit | Semester | **Academic Year (1–3) + Internship** | New `academic_year` on course + syllabus; no semester. |
| Course identity | `course_code` + credits + L-T-P | `course_code` (assigned) only; **no credits/L-T-P** | Make credits/L-T-P/category **optional** in COE + schema. |
| Grouping | Course → Units I–V | **Paper / Subject**, sometimes → Unit 1–4, sometimes flat | New `paper_no` + `academic_year`; AHS content tree (§5.3). |
| Category/Type | required `course_category` + `course_type` | absent | Optional under AHS model; add `is_internal_paper`. |
| Outcomes | CO / CLO with Bloom's K-levels | **none** | Hide/skip CO-PO / Bloom's / Fink's for AHS. |
| PO-PSO mapping | numeric `1/2/3` (eng) or `H/M/L` (CAS) | **none** | Skip `po_mappings` under AHS. |
| Assessment | CIA + ESE (internal/external max marks) | **Theory(Univ)/Practical/Viva/IA + Q-pattern + internal-paper flag** | **New `exam_scheme` JSONB** (§5.4). |
| Internship | not modeled | **duration-based postings** | **New `internship_postings` JSONB** (§5.5). |
| Affiliation | Anna University | Dr. M.G.R. Medical University | `academic_model` discriminator drives labels/PDF header. |
| Institution detection | `institution_code` CET/CAS; `PART_LEVEL_EXEMPT_CODES` | needs AHS code(s) | Add AHS to an academic-model resolver (§5.1). |

---

## 5. Proposed changes (to-be)

### 5.1 Institution → academic model resolver (foundation)

Introduce a single source of truth for "which academic model does this institution use," generalising today's `PART_LEVEL_EXEMPT_CODES`.

```ts
// lib/services/bos/academic-model.ts (new)
export type AcademicModel = 'anna_univ' | 'mgr_ahs';

// Seed with the AHS institution code(s). Confirm exact institution_code(s)
// for the JKKN Allied Health Sciences college in `institutions`.
const MGR_AHS_CODES = new Set(['AHS']); // ← confirm real code(s)

export function resolveAcademicModel(institutionCode?: string | null): AcademicModel {
  return MGR_AHS_CODES.has((institutionCode ?? '').trim().toUpperCase())
    ? 'mgr_ahs' : 'anna_univ';
}
export function isAhsModel(code?: string | null) {
  return resolveAcademicModel(code) === 'mgr_ahs';
}
```

> **Open item O-1:** confirm the exact `institution_code` (and any CAS-style sibling) for the JKKN AHS college so `MGR_AHS_CODES` is correct. AHS is currently *not referenced anywhere* in the codebase (greenfield).

### 5.2 COE course-master extension (per locked decision)

**COE side (separate repo — coordinate):** on the COE `courses` table + `/api/v1/courses`:
- Make `credits`, `theory_hours`, `tutorial_hours`, `practical_hours`, `course_category` **nullable / optional**.
- Add `academic_year smallint NULL` (1–3), `paper_no varchar NULL` (`'Paper I'` / `'SUBJECT 2'`), `is_paper_based boolean DEFAULT false`, `is_internal_paper boolean DEFAULT false`, `lecture_hours int NULL`.
- Keep `course_code` required (AHS codes will be assigned).

**MyJKKN proxy side (this repo):**
- [courses-schemas.ts](lib/services/bos/courses-schemas.ts): branch `courseFormSchema` by academic model. Under `mgr_ahs`: `credits/theory_hours/tutorial_hours/practical_hours/course_category` become `.optional()`; add `academic_year`, `paper_no`, `is_internal_paper`, `lecture_hours`. `toCoeCreatePayload` forwards the new fields and stops defaulting `evaluation_type:'CIA + ESE'` for AHS.

**Temporary course-code feature (per §0 — "code will update"):**
Because the source PDFs carry no codes, AHS papers are created with a **deterministic temporary code** that a later step replaces with the official code.

```ts
// lib/services/bos/ahs-temp-code.ts (new)
// Deterministic, unique-per-institution placeholder, clearly flagged.
// Format: TMP-<PROG>-<YEAR><PAPER2>  e.g. Respiratory Therapy Yr1 Paper I → "TMP-RT-1-01"
export function makeAhsTempCode(programAbbr: string, year: number, paperSeq: number) {
  return `TMP-${programAbbr}-${year}-${String(paperSeq).padStart(2, '0')}`;
}
export const isTempAhsCode = (code?: string | null) =>
  /^TMP-/i.test((code ?? '').trim());
```

- The `TMP-` prefix (or a COE `is_temp_code boolean` column, preferred) makes every placeholder **listable** so a "replace codes" job/UI can find and rename them once official codes are issued.
- **Replacement is safe by design:** syllabi link to a course via the stable `course_id` COE bridge, *not* `course_code` ([types/bos.ts course_id anchor], migration `20260618160000`). Renaming `TMP-RT-1-01` → the official code only rewrites the mutable `course_code` **snapshot** on the course and on any linked syllabus; no relinking, no orphaned rows. This is exactly what the existing `course_id`-anchor design was built for.
- Replacement flow: `PUT /api/bos/courses-master/[id]` updates `course_code`; a small backfill/UI writes the new snapshot onto linked `bos_course_syllabi.course_code` rows (join on `course_id`). Keep the pre-flight duplicate-code check so an official code can't collide.
- [course-form.tsx](app/(routes)/bos/courses/_components/course-form.tsx): branch like `institutionSkipsPartLevel` — for AHS hide Credits/L-T-P/Category/Part/Level, show Academic Year + Paper No + Internal-Paper toggle + Lecture Hours.
- [courses-import-dialog.tsx](app/(routes)/bos/courses/_components/courses-import-dialog.tsx): AHS import template = `Course Code, Course Name, Academic Year, Paper No, Internal Paper?, Lecture Hours` (drop Category/Part/Type/Level/Credits/L-T-P columns).
- [courses-columns.tsx](app/(routes)/bos/courses/_components/courses-columns.tsx): AHS columns = Code, Name, Year, Paper, Internal?, Lecture Hrs (hide L+T+P / Credits / Marks).

### 5.3 `bos_course_syllabi` extension (per locked decision)

New migration `supabase/migrations/2026XXXX_bos_syllabus_ahs_model.sql`:

```sql
ALTER TABLE public.bos_course_syllabi
  ADD COLUMN IF NOT EXISTS academic_model      text NOT NULL DEFAULT 'anna_univ'
      CHECK (academic_model IN ('anna_univ','mgr_ahs')),
  ADD COLUMN IF NOT EXISTS academic_year       smallint,          -- 1|2|3 (AHS)
  ADD COLUMN IF NOT EXISTS exam_scheme          jsonb,            -- §5.4
  ADD COLUMN IF NOT EXISTS internship_postings  jsonb,            -- §5.5
  ADD COLUMN IF NOT EXISTS ahs_content          jsonb;            -- §5.3 tree

COMMENT ON COLUMN public.bos_course_syllabi.academic_model IS
  'Discriminator: anna_univ (semester/CO-PO/Bloom) vs mgr_ahs (year/paper/exam-scheme).';
```

Design notes:
- Existing CO-PO / Bloom's / Fink's columns simply stay `NULL` for AHS rows — no data migration, no backfill of existing rows (default `anna_univ` preserves them).
- **`ahs_content`** holds the year→paper→topic tree (a distinct shape from `course_content`'s Unit I–V, so no overloading):
  ```jsonc
  {
    "papers": [
      { "paper_no": "Paper I", "title": "Anatomy and Physiology",
        "sub_code": null, "lecture_hours": null,
        "mode": "flat" | "units",
        "topics": ["Anatomy of the Upper and Lower airways", "Pleura, Lungs", ...],
        "units":  [ { "unit_no": "Unit 1", "topics": [...] } ],
        "reference_books": ["Grey's Anatomy 36e ...", ...] }
    ]
  }
  ```
  (One syllabus row per **course/paper** keeps the existing course→syllabus 1:1 linkage; `academic_year` + `paper_no` locate it. Alternatively one row per **year** carrying all its papers — see Open item O-2.)

### 5.4 `exam_scheme` JSONB shape (new entity)

```jsonc
{
  "components": [            // per-paper marks matrix
    { "name": "Theory (University)", "max": 100, "min": 50 },
    { "name": "Practical",           "max": 100, "min": 50 },
    { "name": "Viva",                "max": 50,  "min": 25 },
    { "name": "Internal Assessment", "max": 50,  "min": 25 }
  ],
  "is_internal_paper": false,   // true = no university exam (English/Computer)
  "question_pattern": {         // theory question-paper blueprint
    "duration_hours": 3,
    "sections": [
      { "name": "Essays",        "count": 3,  "marks_each": 10, "total": 30 },
      { "name": "Short Notes",   "count": 8,  "marks_each": 5,  "total": 40 },
      { "name": "Short Answers", "count": 10, "marks_each": 3,  "total": 30 }
    ],
    "total_marks": 100
  },
  "mark_distribution": [        // optional per-subject split within one paper (e.g. MRS)
    { "subject": "Anatomy", "marks": 30 }, { "subject": "Physiology", "marks": 30 }
  ]
}
```

New TS type `BosAhsExamScheme` in [types/bos.ts](types/bos.ts). Store as authored — do not fabricate min marks where the source omits them.

### 5.5 `internship_postings` JSONB shape (new entity)

```jsonc
{
  "total_duration": "12 months",
  "postings": [
    { "area": "HDU / ICU and ward", "duration": "3 months" },
    { "area": "Pulmonary function lab", "duration": "2 months" },
    { "area": "Sleep lab", "duration": "1 month" }
  ],
  "notes": "Compulsory paid internship at end of third year"   // free text
}
```

New TS type `BosAhsInternship`. For Physician-Assistant-style per-year in-service skill checklists, allow an optional `skills: string[]` per posting.

### 5.6 API changes (`app/api/bos/syllabus/*`)

- **POST** [route.ts](app/api/bos/syllabus/route.ts): accept `academic_model`, `academic_year`, `exam_scheme`, `internship_postings`, `ahs_content`. Default `academic_model` from `resolveAcademicModel(institution_code)`; do **not** require CO-PO/objectives for AHS.
- **PUT** [[id]/route.ts](app/api/bos/syllabus/[id]/route.ts): add the four new columns to the updatable allow-list.
- Export routes (`export-pdf`, `export-xlsx`): branch on `academic_model` — AHS PDF uses M.G.R. header, renders papers→topics + exam-scheme table + internship table; skips CO-PO/Bloom legend entirely.

### 5.7 UI changes (`components/bos/syllabus-form.tsx`)

Branch the whole form on `academic_model`:
- **Anna model** → unchanged (existing 7/9 tabs).
- **AHS model** → tab set becomes: **Basic Info** (add Academic Year + Paper No), **Content** (year→paper→topics editor writing `ahs_content`, with flat-list vs Unit toggle), **Reference Books**, **Exam Scheme** (new editor for §5.4), **Internship** (new editor for §5.5). Hide Objectives / Course Outcomes / Pedagogy / PO Mappings / Assessment / Capstone.
- Reuse the existing Institution→Composition→Board/Regulation cascade and CAS scope hooks unchanged.

### 5.8 Nav / labels

- `academic_model` drives displayed labels ("Semester"→"Year", "Course"→"Paper") via the existing label-adapter pattern ([school-label-adapter.ts](lib/utils/school-label-adapter.ts)) — extend it with an AHS label set rather than hard-coding strings in the form.

---

## 6. Skill changes (import/convert workflows)

- **`bos-curriculum-pdf-to-import`** → add an **AHS branch**: detect year-based/paperless source (no L-T-P table); emit the AHS import sheet (§5.2) — `Course Code, Course Name, Academic Year, Paper No, Internal Paper?, Lecture Hours`; skip the AICTE-category and L-T-P→Category derivation entirely.
- **`bos-syllabus-convert`** → add an **AHS extraction spec**: parse year→paper→topics (flat or Subject→Unit), the exam-scheme marks matrix + question-paper pattern, internal-paper flags, and internship postings; emit `academic_model:'mgr_ahs'` rows populating `ahs_content` / `exam_scheme` / `internship_postings`; skip CO-PO/Bloom/Fink extraction. Keep STEP-0 output-format interview.

---

## 7. Migration & rollout plan

1. **COE**: add nullable AHS columns to `courses` + `/api/v1/courses` (coordinate release with the COE repo). *(Blocking for course creation; syllabus work can proceed independently.)*
2. **MyJKKN migration**: `bos_course_syllabi` ALTER (§5.3) — additive, `DEFAULT 'anna_univ'`, zero-risk to existing rows.
3. **Resolver + schemas**: `academic-model.ts`, branch `courseFormSchema` + syllabus POST/PUT allow-list, new TS types in `types/bos.ts` / `types/bos-courses.ts`.
4. **UI**: course-form + import-dialog + columns branch; syllabus-form AHS tab set + two new editors (Exam Scheme, Internship).
5. **Skills**: AHS branches in both skills.
6. **Data load**: convert the 9 PDFs → seed AHS courses (assigned codes) + syllabi. Verify exam-scheme totals reconcile (Essays+Short Notes+Short Answers = 100; component max/min per source).
7. **Exports/PDF**: AHS PDF/XLSX templates.

Suggested phasing: **Phase 1** = resolver + syllabus migration + types + syllabus-form AHS mode + convert-skill (lets syllabi be authored immediately). **Phase 2** = COE course extension + course-form/import + import-skill. **Phase 3** = AHS PDF/XLSX exports.

---

## 8. Open decisions / confirmations needed

- **O-1** — ~~Exact `institution_code`(s) for the JKKN AHS college.~~ **ANSWERED (2026-08-07):** institution `9c1554e8-12a2-4b76-a9d6-8242bb05eba1`, `institution_code = 'AHS'`, single shared `board_code = 'AHS'`, `regulation_code = 'R-2017'`. Still needed: the `board_id` + `regulation_id` UUIDs, and confirmation the institution UUID is the COE-side id (not MyJKKN). Seeds live at `scripts/bos-ahs-courses-seed.sql` + `scripts/bos-ahs-course-mapping-seed.sql`.
- **O-2** — Syllabus row granularity: **one row per paper** (keeps existing course→syllabus 1:1; recommended) vs **one row per year** (fewer rows, but breaks the per-course linkage the rest of BoS assumes).
- **O-3** — Are AHS courses in scope for BoS **meeting agenda / course-review** flows (`bos_course_reviews`) like engineering courses, or syllabus-only?
- **O-4** — Temp-code generator specifics: the program-abbreviation table (RT, CT, CCT, MRS, PA, RIT, OTAT, AECT, DT), and whether to flag placeholders via a `TMP-` prefix (no schema change) or a COE `is_temp_code` boolean (cleaner, needs a COE column). Also: the official-code scheme that eventually replaces them (`BMRSc 1-1` year-subject pattern universally, or per-program?).
- **O-5** — Do AHS boards/regulations already exist in COE for these 9 programs, or must they be created first (courses can't be created without a board_code + regulation_code)?
- **O-6** — Whether `mark_distribution` (per-subject split within a paper, seen in MRS/Cardiac) is required now or a later enhancement.
- **O-7** — COE `course_mapping` year ordering: does the COE **scheme UI** bucket the year-wise view by `semester_code` or by `courses.academic_year`? The mapping seed currently sets `semester_code = NULL` and orders by `course_order`; if the UI groups by `semester_code`, populate it with a year token (`YEAR-1/2/3`) instead.

---

## Appendix A — File reference index

**Courses (COE proxy):**
- [app/api/bos/courses-master/route.ts](app/api/bos/courses-master/route.ts), [[id]/route.ts](app/api/bos/courses-master/[id]/route.ts), [import/route.ts](app/api/bos/courses-master/import/route.ts)
- [lib/services/bos/courses-schemas.ts](lib/services/bos/courses-schemas.ts) · [types/bos-courses.ts](types/bos-courses.ts)
- [app/(routes)/bos/courses/_components/](app/(routes)/bos/courses/_components/) (course-form, courses-import-dialog, courses-columns, courses-data-table)

**Syllabus (local table):**
- [supabase/migrations/20260506_create_bos_course_syllabi_table.sql](supabase/migrations/20260506_create_bos_course_syllabi_table.sql) (+ counselling_code, course_id, assessment_structure, finks_capstone_v35 migrations)
- [types/bos.ts:390-700](types/bos.ts#L390-L700) · [components/bos/syllabus-form.tsx](components/bos/syllabus-form.tsx)
- [app/api/bos/syllabus/route.ts](app/api/bos/syllabus/route.ts), [[id]/route.ts](app/api/bos/syllabus/[id]/route.ts)

**Shared:**
- [lib/utils/bos/institution-scope.ts](lib/utils/bos/institution-scope.ts) (CAS resolver) · [lib/utils/school-label-adapter.ts](lib/utils/school-label-adapter.ts) · [hooks/use-institution-type.ts](hooks/use-institution-type.ts)

**Skills:** `.claude/skills/bos-curriculum-pdf-to-import/`, `.claude/skills/bos-syllabus-convert/`

**Source docs & extracted text:** `D:\JKKN\Document\JKKN Syllabus\JKKNAHS\Syllabus\*.pdf` · `…/scratchpad/ahs_txt/*.txt`
