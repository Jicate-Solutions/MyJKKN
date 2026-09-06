# BoS DCH (Dental — BDS) Course & Syllabus Technical Specification

**Date:** 2026-07-24
**Author:** Investigation for DCH / BDS syllabus onboarding
**Status:** Design — awaiting implementation sign-off
**Source material:** `D:\JKKN\Document\JKKN Syllabus\JKKNDCH\Syllabus\syllabus bds2017-18-21032018.pdf` (281 pp.)
**Institution:** JKKN Dental College & Hospital (**DCH**)
**Affiliation:** The Tamil Nadu Dr. M.G.R. Medical University, Chennai + **Dental Council of India (DCI)** regulations (NOT Anna University)

---

## 0. Confirmed direction (decisions to lock before implementation)

This spec is a **sibling of the AHS and CNR specs** ([`2026-07-24-bos-ahs-course-syllabus-design.md`](2026-07-24-bos-ahs-course-syllabus-design.md), [`2026-07-24_bos_cnr-nursing-course-syllabus-tech-spec.md`](2026-07-24_bos_cnr-nursing-course-syllabus-tech-spec.md)). All three onboard **Dr. M.G.R. Medical University** programs that break the Anna-University semester/CO-PO model. The single most important recommendation here is architectural: **do not add a third disjoint column set** — consolidate AHS + CNR + BDS onto one `academic_model` discriminator with shared `academic_year` + `exam_scheme` columns, and give BDS only its one content column.

| Decision | Proposed choice |
|---|---|
| Where BDS subjects live | **Extend the COE course-master** (`/api/v1/courses`) with nullable medical-model fields; the `/bos/courses` proxy branches by institution model. Same as AHS §5.2. |
| BDS course codes | **Official codes exist — use them (supersedes the earlier temp-code plan).** The syllabus PDF has no codes, but the university/DCI master supplies a **`42xx` code family**, split **per delivery**: each subject has a separate **Theory** code and **Practical/Clinical** code (`-P` suffix), and combined subjects split by discipline (`4202A/B` Physiology\|Biochemistry, `4206A/B` Pathology\|Microbiology, `4208A/B` Dental Materials Conservative\|Prosthodontics). **~46 course codes**, not 19 subjects. **Consequence:** the code regex MUST be relaxed to allow the `-P`/separator format (see §5.2) — the current `^[A-Z0-9]+$` rejects every practical code. The clean import sheet lives at `docs/plans/bds-courses-import.xlsx` (46 rows, 23 Theory / 23 Practical). |
| Where BDS syllabus content lives | **Extend `bos_course_syllabi`** with the shared `academic_model` discriminator + one BDS-only JSONB column (`bds_content`) + the shared `exam_scheme` column. Reuse existing versioning / RLS / CAS / observer plumbing unchanged. |
| Discriminator strategy | **One consolidated `academic_model` enum** across all three medical models — see §5.0. |

---

## 1. Executive summary

The current BoS Course & Syllabus stack is hard-wired to the **Anna-University engineering / arts model**: semester-based, coded courses with credits + L-T-P, CIA+ESE marks, and CO-PO-PSO + Bloom's/Fink's syllabus mapping. The BDS program follows the **DCI / Dr. M.G.R. Medical University model**, structurally different on almost every axis:

- **Year-based**, not semester-based: **I / II / III / IV Year** + a 1-year rotating **internship**. Zero semester references.
- Organised as **Subjects** — **19 subjects** across the four years (some combining two disciplines, e.g. *"General Human Physiology and Biochemistry"*). One subject = one course.
- **No credits, no L-T-P period split, no CO-PO-PSO mapping, no Bloom's/K-levels** anywhere. Workload is expressed as **Lecture Hours / Practical Hours / Total Hours** (e.g. `100 / 175 / 275`).
- A distinctive **DCI competency-based content structure** that matches *no* existing model (§3):
  `GOAL → OBJECTIVES (Knowledge / Skills / Attitude / Integration / Infection-control / Computer) → COMPETENCIES → TEACHING HOURS → TEACHING METHODOLOGY → THEORY SYLLABUS as a three-tier "MUST KNOW / DESIRABLE TO KNOW / NICE TO KNOW" topic grid → PRACTICALS → EXAMINATION scheme → INTERNAL ASSESSMENT → RECORD/LOG BOOK → grouped TEXT & REFERENCE BOOKS`.
- An **examination scheme** per subject: a `Theory (Exam + IA + Viva) / Practical (Exam + IA) = 200` marks matrix plus a **theory question-paper pattern** (`Essay 1×10 + Short Notes 3×5 + Short Answers 5×2`) and a **practical-exam breakdown** (spotters/exercises with per-item marks & time). Some subjects are marked **"No Theory Examination"** (practical-only).

Because BoS courses are a **live proxy over the external COE API** (there is *no local `bos_courses` table*), and `bos_course_syllabi` is the only locally-owned extensible surface, the plan mirrors AHS: extend COE minimally so BDS subjects exist as courses, and carry all BDS richness on `bos_course_syllabi` behind the shared `academic_model` discriminator.

---

## 2. Current (as-is) architecture

Identical to the AHS/CNR findings — restated briefly; see the AHS spec §2 for full file/line detail.

### 2.1 Courses — a COE proxy, not a local table
- **No `bos_courses` table exists.** `/bos/courses` is a live proxy over COE `GET/POST /api/v1/courses`.
- Proxy routes: [route.ts](app/api/bos/courses-master/route.ts), [[id]/route.ts](app/api/bos/courses-master/[id]/route.ts), [import/route.ts](app/api/bos/courses-master/import/route.ts).
- Effective schema: `BosCourseMaster` in [types/bos-courses.ts:49-89](types/bos-courses.ts#L49-L89) (mirrors COE `courses`/`course_mapping`). All Anna-shaped: `course_category`, `course_type`, `course_part_master` (`Part I–V`), `course_level` (Roman `I–XX`), `credit`, `theory_hours`/`tutorial_hours`/`practical_hours` (L-T-P), `internal_max_mark`/`external_max_mark`/`total_max_mark`, `evaluation_type` (`CIA + ESE`).
- Validation/payload: [lib/services/bos/courses-schemas.ts](lib/services/bos/courses-schemas.ts) (`courseFormSchema`, `toCoeCreatePayload`, `importRowSchema`). **Institution branching today:** `PART_LEVEL_EXEMPT_CODES = new Set(['CET'])` at [courses-schemas.ts:56](lib/services/bos/courses-schemas.ts#L56) — the pattern a DCH branch extends.
- Course-code regex `^[A-Z0-9]+$` and `course_category`/`course_type` are **required** — both incompatible with codeless, categoryless BDS subjects.

### 2.2 Syllabus — local `bos_course_syllabi`, Anna-University shaped
- Created by [20260506_create_bos_course_syllabi_table.sql](supabase/migrations/20260506_create_bos_course_syllabi_table.sql); extended by counselling_code, `course_id` (COE bridge, `20260618160000`), `assessment_structure` (`20260625`), and the five v3.5 Fink's/Capstone JSONB columns (`20260709`).
- **JSONB payload columns:** `course_objectives`, `course_learning_outcomes`, `course_content`, `textbooks`, `web_resources`, `pedagogy`, `po_mappings`, `assessment_structure`, `concept_applications`, `assessment_pattern`, `capstone_project`, `capstone_rubric`, `llc_conference`. Free-text `stream VARCHAR(50)` ("Engineering/Pharmacy/Nursing/Dental/Arts") — metadata only, **not branched on**.
- **There is NO `academic_model` column today** — confirmed across all migrations and TS. It is proposed by both the AHS and CNR specs but **neither has shipped**. DCH is being designed into the same greenfield window, so the three specs must agree on one column set.
- `course_content` shape: `units[]` (Unit I–V) **or** `is_practical + topics[]` **or** `is_project + project_units[]` — mutually exclusive ([types/bos.ts:458-481](types/bos.ts#L458-L481)). None of these fit the BDS three-tier competency grid.
- TS types: [types/bos.ts:390-700](types/bos.ts#L390-L700). No Zod for the syllabus record — manual validation in the routes.
- UI: the 3,931-line [components/bos/syllabus-form.tsx](components/bos/syllabus-form.tsx). Tabs: Basic Info, Objectives, Course Outcomes, Content, Resources, Pedagogy, PO Mappings (+ Fink's-only Assessment/Capstone, hidden by `HIDE_FINKS_TABS = true`). The only runtime model axis is Fink's-vs-Bloom's taxonomy + CAS/CET (applied at PDF time in `row-actions.tsx`).
- PDF is **client-side jsPDF** with a model branch at [course-syllabus-pdf.ts:674](lib/utils/bos/course-syllabus-pdf.ts#L674) (`variant === 'engineering'` → CET renderer, else A&S). XLSX via [syllabus-xlsx.ts](lib/utils/bos/syllabus-xlsx.ts).

### 2.3 The two import/convert skills (as-is)
- **`bos-curriculum-pdf-to-import`** — AICTE/Anna curriculum → `/bos/courses` bulk-import `.xlsx`. Two-axis mapping (PDF CATEGORY → Type; L-T-P → Category). **None of these axes exist in BDS.**
- **`bos-syllabus-convert`** — syllabus doc → 8-sheet template / `bos_course_syllabi` SQL. Assumes UNIT I–V + COURSE OBJECTIVES + COURSE OUTCOMES + CO-PO/PSO + Bloom's. **BDS has none of that structure** — it has Goal/Objectives/Competencies + a Must/Desirable/Nice topic grid + exam scheme + practical breakdown.

Both skills need a **BDS mode / branch** (§6).

---

## 3. The BDS source format (what's actually in the PDF)

Extracted via `pdfplumber` over all 281 pages. Confirmed structure of every subject:

| Section | Content | Frequency (pages hit) |
|---|---|---|
| **GOAL** | One paragraph — the graduate capability aim. | 27 |
| **OBJECTIVES** | Multi-facet: **(a) Knowledge & Understanding**, **(b) Skills**, **(c) Attitude**, **(d) Integration**, **(e) Infection/cross-infection control**, **(f) Computer proficiency**. Each a bulleted list. | 36 |
| **COMPETENCIES** | Grouped lists: *General skills, Practice Management, Communication & Community Resources, Patient Care – Diagnosis, Patient Care – Treatment Planning, subject-specific competencies*. | 35 |
| **TEACHING HOURS** | `Lecture Hours / Practical Hours / Total` (e.g. `100 / 175 / 275`). | 21 |
| **TEACHING METHODOLOGY** | Bulleted list (lectures, seminars, dissection, AV aids, …). | (with hours) |
| **THEORY SYLLABUS** | **Three-column grid**: `TOPIC │ MUST KNOW │ DESIRABLE TO KNOW │ NICE TO KNOW`. Each row is a topic; cells hold graded sub-points. **This is the BDS signature — no Units, no COs.** | 20 |
| **PRACTICALS** | Numbered practical exercises, some with per-item **Hours**. | 91 |
| **THEORY EXAMINATION** | Question-paper pattern: `Essay n×m`, `Short Notes n×m`, `Short Answers n×m`, Total. Some subjects: **"No Theory Examination"**. | 73 (EXAMINATION) |
| **PRACTICAL EXAMINATION** | Breakdown — **Spotters** (e.g. `45×2=90`) or **Exercises** (`Cavity Preparation 30 / 45 min`, …), + **Viva Voce**. | 91 |
| **Exam scheme matrix** | `Examination │ Internal Assessment │ Viva │ Total` rows for **Theory** and **Practicals** (e.g. `Theory 70/10/20=100`, `Practicals 90/10/-=100`, `Total 200`; or `35/5/10=50` + `45/5/-=50` = `100`). | 32 (IA) |
| **FORMATIVE / INTERNAL ASSESSMENT** | ≥3 continuing assessments/year, best-of-two, submitted quarterly. Theory + Practical IA marks. | 32 |
| **RECORD NOTE / LOG BOOK** | DCI-mandated logbook, faculty/HOD assessed. | — |
| **TEXT BOOKS / REFERENCE BOOKS** | **Grouped by sub-discipline** (Gross Anatomy / Neuroanatomy / Histology / Embryology …), each an ordered list with edition/author. | 24 / 15 |

**The 19 subjects (year → subject; no codes in source):**

- **I Year (3):** General Anatomy incl. Embryology & Histology · General Human Physiology **and** Biochemistry · Dental Anatomy, Embryology & Oral Histology
- **II Year (5):** General Pathology **and** Microbiology · General & Dental Pharmacology & Therapeutics · Dental Materials · Pre-Clinical Conservative Dentistry · Pre-Clinical Prosthodontics & Crown & Bridge
- **III Year (3):** General Medicine · General Surgery · Oral Pathology & Oral Microbiology
- **IV Year (8):** Oral Medicine & Radiology · Paediatric & Preventive Dentistry · Orthodontics & Dentofacial Orthopaedics · Periodontology · Prosthodontics & Crown & Bridge · Conservative Dentistry & Endodontics · Oral & Maxillofacial Surgery · Public Health Dentistry
- **+ 1-year rotating clinical internship** (post IV year) — modeled like AHS `internship_postings` if in scope (see O-3).

> Note: several "subjects" bundle two disciplines with separate page ranges (Physiology|Biochemistry, Pathology|Microbiology). The `bds_content` shape (§5.4) supports an optional `disciplines[]` split so one course can hold both sub-syllabi, matching how the university examines them jointly.

---

## 4. Gap analysis — current vs BDS (the diff to close)

| Concern | Current (Anna model) | BDS (DCI / M.G.R. model) | Gap / change |
|---|---|---|---|
| Time unit | Semester | **Academic Year I–IV + Internship** | Shared `academic_year` on course + syllabus; no semester. |
| Course identity | `course_code` + credits + L-T-P | **Subject name only** — no code, no credits, no L-T-P | Temp codes (§5.3); credits/L-T-P/category **optional** in COE + schema; relax code regex. |
| Grouping | Course → Units I–V | **Subject → Theory-syllabus topic grid** (Must/Desirable/Nice) | New `bds_content` tree (§5.4); no Units. |
| Workload | credit + L-T-P hours | **Lecture / Practical / Total hours** | `teaching_hours` inside `bds_content`. |
| Category/Type | required `course_category` + `course_type` | absent | Optional under medical model. |
| Outcomes | CO / CLO with Bloom's K-levels | **GOAL + multi-facet OBJECTIVES + COMPETENCIES** (no COs, no K-levels) | New `objectives`/`competencies` blocks in `bds_content`; hide CO-PO/Bloom/Fink's. |
| PO-PSO mapping | numeric `1/2/3` or `H/M/L` | **none** | Skip `po_mappings` under BDS. |
| Assessment | CIA + ESE (internal/external max) | **Theory(Exam/IA/Viva) + Practical(Exam/IA) matrix + Q-pattern + practical breakdown + "No Theory Exam" flag** | **Shared `exam_scheme` JSONB** (§5.5) — extend AHS's shape with `practical_exam`. |
| Internship | not modeled | **1-yr rotating clinical internship** | Reuse shared `internship_postings` JSONB (from AHS) if in scope. |
| Books | flat `textbooks` list | **grouped by sub-discipline** | Extend `textbooks` shape with optional `groups[]` (§5.6) — no migration. |
| Affiliation | Anna University | Dr. M.G.R. Medical Univ + DCI | `academic_model` drives labels/PDF header (TNMGRMU + DCI). |
| Institution detection | `institution_code` CET/CAS | needs DCH code | Add DCH to the academic-model resolver (§5.1). |

---

## 5. Proposed changes (to-be)

### 5.0 Consolidation recommendation (read first)

AHS, CNR, and BDS are landing in the same window and all extend `bos_course_syllabi`. Adding three independent column sets (`ahs_content`+`exam_scheme`+`internship_postings`, then `nursing_workload`+`clinical_outline`+`competency_mappings`, then a BDS set) would leave the table with ~10 sparsely-populated model columns and three ad-hoc `academic_model` CHECK edits. **Recommend a single consolidated migration** that all three specs share:

```sql
alter table public.bos_course_syllabi
  add column if not exists academic_model text not null default 'anna_univ'
      check (academic_model in ('anna_univ','mgr_ahs','inc_nursing','mgr_bds')),
  add column if not exists academic_year        smallint,   -- shared: AHS 1-3, BDS 1-4
  add column if not exists course_description   text,       -- shared (CNR + BDS goal/desc)
  add column if not exists exam_scheme          jsonb,      -- shared: AHS + BDS marks matrix
  add column if not exists internship_postings  jsonb,      -- shared: AHS + BDS rotations
  -- model-specific content trees (one each, mutually exclusive by academic_model):
  add column if not exists ahs_content          jsonb,      -- AHS paper→topic tree
  add column if not exists clinical_outline     jsonb,      -- CNR clinical table
  add column if not exists nursing_workload     jsonb,      -- CNR T/P/Clinical
  add column if not exists competency_mappings  jsonb,      -- CNR INC competencies
  add column if not exists bds_content          jsonb;      -- BDS (this spec, §5.4)
```

If AHS/CNR ship first, **DCH's migration is reduced to just `bds_content`** plus adding `'mgr_bds'` to the existing CHECK. The rest of this section is written assuming that consolidation; a DCH-only fallback is noted where relevant.

### 5.1 Institution → academic model resolver (foundation)

Generalise today's `PART_LEVEL_EXEMPT_CODES` into one resolver shared by all three medical specs:

```ts
// lib/services/bos/academic-model.ts (new — shared with AHS/CNR)
export type AcademicModel = 'anna_univ' | 'mgr_ahs' | 'inc_nursing' | 'mgr_bds';

const MGR_AHS_CODES  = new Set(['AHS']);          // ← confirm (AHS spec O-1)
const INC_NUR_CODES  = new Set(['CNR']);          // ← confirm (CNR spec)
const MGR_BDS_CODES  = new Set(['DCH']);          // ← confirm real DCH institution_code (O-1)

export function resolveAcademicModel(institutionCode?: string | null): AcademicModel {
  const c = (institutionCode ?? '').trim().toUpperCase();
  if (MGR_BDS_CODES.has(c)) return 'mgr_bds';
  if (MGR_AHS_CODES.has(c)) return 'mgr_ahs';
  if (INC_NUR_CODES.has(c)) return 'inc_nursing';
  return 'anna_univ';
}
export const isBdsModel = (code?: string | null) => resolveAcademicModel(code) === 'mgr_bds';
export const isMedicalModel = (code?: string | null) => resolveAcademicModel(code) !== 'anna_univ';
```

> **Open item O-1:** confirm the exact `institution_code` (COE side) / `counselling_code` (MyJKKN) for **JKKN Dental College & Hospital**. DCH is greenfield — currently not referenced anywhere in the codebase.

### 5.2 COE course-master extension (per locked decision)

Same shape as AHS §5.2 — the medical fields are shared. **COE side** (separate repo — coordinate): make `credit`, `theory_hours`, `tutorial_hours`, `practical_hours`, `course_category` nullable; add `academic_year smallint`, `lecture_hours int`, `practical_hours_total int`, `is_paper_based boolean` (false for BDS — subjects not papers), `is_internal_paper boolean`. Keep `course_code` required (temp codes fill it).

**MyJKKN proxy side (this repo):**
- [courses-schemas.ts](lib/services/bos/courses-schemas.ts): branch `courseFormSchema` by academic model. Under any medical model: `credit/theory_hours/tutorial_hours/practical_hours/course_category` become `.optional()`; add `academic_year`, `lecture_hours`. Relax the code regex (or gate it) to permit temp codes. `toCoeCreatePayload` stops defaulting `evaluation_type:'CIA + ESE'` for medical models. Add DCH to the Part/Level-exempt path.
- [course-form.tsx](app/(routes)/bos/courses/_components/course-form.tsx): for BDS hide Credits/L-T-P/Category/Part/Level/Marks; show **Academic Year (I–IV)** + **Lecture / Practical / Total Hours**.
- [courses-import-dialog.tsx](app/(routes)/bos/courses/_components/courses-import-dialog.tsx) + [courses-columns.tsx](app/(routes)/bos/courses/_components/courses-columns.tsx): BDS preset columns = `Course Code, Subject Name, Academic Year, Lecture Hrs, Practical Hrs, Total Hrs`.

**Official codes (temp-code plan RETIRED).** The university master supplies real `42xx` codes, so no temp-code generator is needed for BDS. The single required code change is **regex relaxation**:
- The BoS import/create code check is `^[A-Z0-9]+$` ([courses-schemas.ts](lib/services/bos/courses-schemas.ts)) and the skill's `convert_curriculum.py` uses `code.isalnum()` — **both reject the `-P` / `/` separators** in `4206B-P`, `4223-P`, etc. Under the medical model, allow `[A-Z0-9/-]` (or gate the strict regex by `academic_model`).
- **Granularity:** the course master holds ~46 rows (Theory + Practical/Clinical per subject), not 19. One `bos_course_syllabi` row still maps per **course code**, so a subject's Theory and Practical codes each get their own syllabus row (or the Practical/Clinical code carries only the practical/exam blocks). Confirm in Open item O-7.
- **Known source defects already corrected** in the import sheet (flag for the registrar): dropped `4211P` (duplicate of `4211-P`); `4223/P`→`4223-P`; `4207B`→`4207-P`; dropped `1101 Library` (non-course); **`4202-P` "Dental Materials Practicals" left as-is but likely should be `4204-P`** — it sits in the Physiology/Biochemistry `4202` family.

### 5.3 `bos_course_syllabi` extension

Per §5.0 — the only BDS-specific new column is **`bds_content`** (plus adding `'mgr_bds'` to the `academic_model` CHECK, and reusing the shared `academic_year` / `exam_scheme` / `internship_postings` / `course_description`). Existing CO-PO / Bloom's / Fink's columns stay `NULL` for BDS rows — no backfill, `DEFAULT 'anna_univ'` preserves every existing row.

### 5.4 `bds_content` JSONB shape (new entity — the BDS signature)

```jsonc
{
  "goal": "The students should gain the knowledge and insight into the functional anatomy…",
  "objectives": {
    "knowledge":   ["Know the normal disposition of structures while examining a patient", "…"],
    "skills":      ["Locate various structures of the body and mark living-anatomy topography", "…"],
    "attitude":    ["Willingness to apply current knowledge in the best interest of the patient", "…"],
    "integration": ["Anatomy taught integrally with basic sciences and clinical subjects", "…"],
    "infection_control": ["Asepsis — disinfection and sterilization of instruments…"],   // optional
    "computer_proficiency": ["Basic knowledge of Computers, MS Office…"]                  // optional
  },
  "competencies": [
    { "group": "General skills",       "items": ["Apply knowledge & skills in day-to-day practice", "…"] },
    { "group": "Practice Management",  "items": ["Evaluate practice location, population dynamics…", "…"] },
    { "group": "Patient Care – Diagnosis", "items": ["Obtaining patient's history methodically", "…"] }
  ],
  "teaching_hours": { "lecture": 100, "practical": 175, "total": 275 },
  "teaching_methodology": ["Combination of lectures", "Small-group seminars, tutorials", "Dissection…"],
  "theory_syllabus": [                          // the three-tier competency grid
    { "topic": "Anatomical terminology",
      "must_know":      ["Understanding of the subdivisions of anatomy", "Anatomical position", "Anatomical planes"],
      "desirable_to_know": [],
      "nice_to_know":   [] },
    { "topic": "Introduction to bones",
      "must_know":      ["Composition of bone and bone marrow", "Regional classification of skeleton"],
      "desirable_to_know": ["Laws of ossification incl. direction of nutrient foramen", "Exceptions to the laws of ossification"],
      "nice_to_know":   [] }
  ],
  "practicals": [                               // numbered practical exercises (some with hours)
    { "no": 1, "title": "Qualitative analysis of carbohydrates — reducing & non-reducing sugar", "hours": 8 }
  ],
  "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD…",  // optional
  "disciplines": null   // optional: when a subject bundles two disciplines (Physiology|Biochemistry),
                        // an array of { name, goal, theory_syllabus[], practicals[], exam_scheme } sub-blocks.
}
```

New TS type `BosBdsContent` in [types/bos.ts](types/bos.ts). Preserve source values exactly; leave a tier `[]` when the source column is empty (do not fabricate Desirable/Nice entries).

### 5.5 `exam_scheme` JSONB shape (shared with AHS, extended for BDS)

Reuse the AHS `exam_scheme` shape and add a `practical_exam` block for BDS spotter/exercise breakdowns and a `no_theory_exam` flag:

```jsonc
{
  "components": [                       // the marks matrix (per THEORY and PRACTICAL row)
    { "stream": "Theory",    "examination": 70, "internal_assessment": 10, "viva": 20, "total": 100 },
    { "stream": "Practical", "examination": 90, "internal_assessment": 10, "viva": null, "total": 100 }
  ],
  "grand_total": 200,
  "no_theory_exam": false,              // true for subjects marked "No Theory Examination"
  "question_pattern": {                 // theory paper blueprint
    "duration_hours": 3,
    "sections": [
      { "name": "Essay",         "count": 1, "marks_each": 10, "total": 10 },
      { "name": "Short Notes",   "count": 3, "marks_each": 5,  "total": 15 },
      { "name": "Short Answers", "count": 5, "marks_each": 2,  "total": 10 }
    ],
    "total_marks": 35
  },
  "practical_exam": {                   // BDS-specific: spotters OR exercises
    "type": "spotters" | "exercises",
    "items": [
      { "name": "Gross anatomy (head & neck, neuroanatomy)", "count": 20, "marks_each": 2, "total": 40 },
      { "name": "Cavity Preparation", "marks": 30, "time": "45 Minutes" }
    ],
    "viva": { "max": 20, "notes": "Osteology 10 + Embryology 10" },
    "total": 90
  },
  "internal_assessment": {              // formative
    "frequency": "≥3 per year, best of two",
    "theory": 10, "practical": 10, "total": 20,
    "submission": "to university once every 3 months"
  }
}
```

New TS type `BosMedicalExamScheme` (shared) in [types/bos.ts](types/bos.ts).

### 5.6 Books — extend `textbooks` (no migration; JSONB is schemaless)

BDS groups books by sub-discipline. Add an optional `groups[]` to the existing `BosBooksData` shape so no new column is needed:

```jsonc
{
  "groups": [
    { "group": "Gross Anatomy",  "books": ["Cunningham's Manual of Practical Anatomy Vols 1–3, 15e (GJ Romanes)", "…"] },
    { "group": "Neuroanatomy",   "books": ["Clinical Neuroanatomy 7e 2009 (Richard S. Snell)", "…"] }
  ],
  "reference_groups": [ { "group": "Histology", "books": ["…"] } ]
}
```

Existing engineering/CAS rows use the flat `books[]` field and are unaffected (grouped fields are optional and ignored by their exporters).

### 5.7 API changes (`app/api/bos/syllabus/*`)
- **POST** [route.ts](app/api/bos/syllabus/route.ts): accept `academic_model`, `academic_year`, `bds_content`, `exam_scheme`, `internship_postings`, `course_description`. Default `academic_model` from `resolveAcademicModel(institution_code)`; do **not** require CO-PO / objectives (in the old sense) for BDS.
- **PUT** [[id]/route.ts](app/api/bos/syllabus/[id]/route.ts): add the new columns to the updatable allow-list.
- Export routes (`export-pdf`, `export-xlsx`): branch on `academic_model` — BDS PDF uses the **TNMGRMU + DCI** header, renders Goal/Objectives/Competencies + the Must/Desirable/Nice grid + Practicals + the exam-scheme matrix + grouped books; skips CO-PO/Bloom legend entirely.

### 5.8 UI changes (`components/bos/syllabus-form.tsx`)
Branch the form on `academic_model` (add a `isBds` gate alongside the existing `isFinksBoard` / `scope.isCAS`):
- **Anna model** → unchanged.
- **BDS model** → tab set becomes: **Basic Info** (add Academic Year I–IV), **Goal & Objectives** (goal + the 4–6 objective facets), **Competencies** (grouped lists), **Theory Syllabus** (the Must/Desirable/Nice three-column grid editor writing `bds_content.theory_syllabus`), **Practicals**, **Exam Scheme** (matrix + question pattern + practical breakdown editor for §5.5), **Books** (grouped textbooks/references). Hide Objectives(old)/Course Outcomes/Content(Units)/Pedagogy/PO Mappings/Assessment/Capstone.
- Reuse the Institution→Composition→Board/Regulation cascade and CAS scope hooks unchanged.

### 5.9 Nav / labels
`academic_model` drives displayed labels ("Semester"→"Year", "Course"→"Subject", "Unit"→"Topic") via the existing label-adapter pattern ([school-label-adapter.ts](lib/utils/school-label-adapter.ts)) — extend it with a BDS/medical label set rather than hard-coding strings.

---

## 6. Skill changes (import/convert workflows)

- **`bos-curriculum-pdf-to-import`** → add a **BDS branch** (share with the AHS medical branch): detect year-based/codeless source (no L-T-P table, no CATEGORY column); emit the medical import sheet — `Course Code, Subject Name, Academic Year, Lecture Hrs, Practical Hrs, Total Hrs`; skip AICTE-category + L-T-P→Category derivation.
- **`bos-syllabus-convert`** → add a **DCI/BDS extraction spec** to `references/extraction-spec.md`: parse `GOAL`, the multi-facet `OBJECTIVES`, grouped `COMPETENCIES`, `TEACHING HOURS`, `TEACHING METHODOLOGY`, the **THEORY SYLLABUS Must/Desirable/Nice three-column grid** → `bds_content.theory_syllabus`, `PRACTICALS` (with hours), the `THEORY EXAMINATION` question pattern + `PRACTICAL EXAMINATION` breakdown + marks matrix → `exam_scheme`, and grouped `TEXT/REFERENCE BOOKS` → `textbooks.groups`. Emit `academic_model:'mgr_bds'` rows; **skip CO-PO/Bloom/Fink extraction**. Add the BDS SQL column mapping (`bds_content`, `exam_scheme`, `academic_year`) to `references/sql-import.md`. Keep the STEP-0 output-format interview. Handle the two-discipline subjects (Physiology|Biochemistry) via `bds_content.disciplines[]`.

---

## 7. Current vs proposed — difference summary

| Area | Current | Proposed (BDS) | Change type |
|---|---|---|---|
| Time unit | Semester | Academic Year I–IV + Internship | shared `academic_year`; UI/label branch |
| Course code | required `^[A-Z0-9]+$` | temp code, later official | relax/gate regex + temp-code gen |
| Credits / L-T-P | required | absent → optional | branch `courses-schemas.ts` (COE nullable) |
| Category / Type / Part / Level | required enums | absent | optional under medical model; DCH added to exempt path |
| Content model | Units I–V / practical / project | **Goal+Objectives+Competencies + Must/Desirable/Nice grid** | **new `bds_content` JSONB** |
| Outcomes / K-levels | CO/CLO + Bloom's | none (Competencies instead) | hide CO/Bloom/Fink tabs |
| PO-PSO mapping | numeric/`H/M/L` | none | hide PO Mappings tab |
| Assessment | CIA+ESE / Fink's | **Theory/Practical/Viva/IA matrix + Q-pattern + practical breakdown** | **shared `exam_scheme` JSONB (+`practical_exam`)** |
| Internship | not modeled | 1-yr rotating clinical | reuse shared `internship_postings` (if in scope) |
| Books | flat list | grouped by sub-discipline | extend `textbooks.groups` (no migration) |
| `academic_model` col | **absent** | `+ 'mgr_bds'` (consolidated enum) | new/extended column (§5.0) |
| PDF / XLSX | engineering / A&S | + BDS (TNMGRMU+DCI) variant | additive |

**Untouched (regression surface = zero for existing users):** all existing engineering/CAS rows (`DEFAULT 'anna_univ'`), the COE proxy contract, `po_mappings`, Fink's/Capstone columns, versioning/clone/revise, scoping/RLS, observer tier, the timetable `coe_course_id` bridge.

---

## 8. Migration & rollout plan

1. **Consolidated migration** (§5.0) — coordinate with the AHS/CNR specs so all three share one `bos_course_syllabi` ALTER. Additive, `DEFAULT 'anna_univ'`, zero-risk. *If AHS/CNR ship first, DCH adds only `bds_content` + the `'mgr_bds'` CHECK value.*
2. **Resolver + schemas**: `academic-model.ts` (add DCH), branch `courseFormSchema`, syllabus POST/PUT allow-list, new TS types (`BosBdsContent`, `BosMedicalExamScheme`) in `types/bos.ts` / `types/bos-courses.ts`.
3. **COE**: add nullable medical columns to `courses` + `/api/v1/courses` (shared with AHS — coordinate COE release). *Blocking for course creation; syllabus authoring can proceed independently.*
4. **UI**: course-form + import-dialog + columns BDS branch; syllabus-form BDS tab set (Goal & Objectives, Competencies, Theory-Syllabus grid, Practicals, Exam Scheme, Books).
5. **Skills**: BDS branches in both skills.
6. **Data load**: convert the BDS PDF → seed 19 BDS subjects (temp codes) + 19 syllabi. Verify exam-scheme totals reconcile (matrix rows sum to `grand_total`; question-pattern sections sum to `total_marks`).
7. **Exports/PDF**: BDS PDF/XLSX templates.

**Suggested phasing:** **Phase 1** = consolidated syllabus migration + resolver + types + syllabus-form BDS mode + convert-skill (lets BDS syllabi be authored immediately). **Phase 2** = COE course extension + course-form/import + import-skill. **Phase 3** = BDS PDF/XLSX exports.

---

## 9. Open decisions / confirmations needed

- **O-1** — Exact `institution_code` (COE) / `counselling_code` (MyJKKN) for **JKKN Dental College & Hospital**, and whether there's a CAS-style Aided/SF sibling (dental colleges usually single — verify so scope fan-out is a no-op).
- **O-2** — Discriminator naming: adopt the **consolidated `academic_model` enum** (§5.0, recommended) vs a DCH-only column. This requires aligning with the AHS + CNR spec owners before any of the three migrations ship. **This is the key cross-spec decision.**
- **O-3** — Is the **1-year clinical internship** in scope for the syllabus module now (reuse `internship_postings`), or deferred?
- **O-4** — Are BDS subjects in scope for BoS **meeting agenda / course-review** flows (`bos_course_reviews`) like engineering courses, or syllabus-only?
- **O-5** — Do the **DCI/BDS regulation and a DCH board** already exist in COE (courses can't be created without a `board_code` + `regulation_code`), or must they be created first? Which regulation label — `BDS 2017-18` / DCI BDS Course Regulations?
- **O-6** — Official course-code scheme that eventually replaces the temp codes (per-subject university code, or DCI numbering?).
- **O-7** — Two-discipline subjects (Physiology|Biochemistry, Pathology|Microbiology): **one course with `bds_content.disciplines[]`** (recommended, matches joint examination) vs two separate courses.

---

## Appendix A — File reference index

**Courses (COE proxy):** [courses-master/route.ts](app/api/bos/courses-master/route.ts) · [[id]/route.ts](app/api/bos/courses-master/[id]/route.ts) · [import/route.ts](app/api/bos/courses-master/import/route.ts) · [lib/services/bos/courses-schemas.ts](lib/services/bos/courses-schemas.ts) · [types/bos-courses.ts](types/bos-courses.ts) · [app/(routes)/bos/courses/_components/](app/(routes)/bos/courses/_components/)

**Syllabus (local table):** [20260506_create_bos_course_syllabi_table.sql](supabase/migrations/20260506_create_bos_course_syllabi_table.sql) (+ counselling_code, course_id, assessment_structure, finks_capstone_v35 migrations) · [types/bos.ts:390-700](types/bos.ts#L390-L700) · [components/bos/syllabus-form.tsx](components/bos/syllabus-form.tsx) · [app/api/bos/syllabus/route.ts](app/api/bos/syllabus/route.ts) · [[id]/route.ts](app/api/bos/syllabus/[id]/route.ts) · [lib/utils/bos/course-syllabus-pdf.ts](lib/utils/bos/course-syllabus-pdf.ts) · [lib/utils/bos/syllabus-xlsx.ts](lib/utils/bos/syllabus-xlsx.ts)

**Shared:** [lib/utils/bos/institution-scope.ts](lib/utils/bos/institution-scope.ts) · [lib/utils/school-label-adapter.ts](lib/utils/school-label-adapter.ts)

**Sibling specs:** [2026-07-24-bos-ahs-course-syllabus-design.md](2026-07-24-bos-ahs-course-syllabus-design.md) · [2026-07-24_bos_cnr-nursing-course-syllabus-tech-spec.md](2026-07-24_bos_cnr-nursing-course-syllabus-tech-spec.md)

**Skills:** `.claude/skills/bos-curriculum-pdf-to-import/` · `.claude/skills/bos-syllabus-convert/`

**Source doc:** `D:\JKKN\Document\JKKN Syllabus\JKKNDCH\Syllabus\syllabus bds2017-18-21032018.pdf` (281 pp., 19 subjects, 4 years + internship)
