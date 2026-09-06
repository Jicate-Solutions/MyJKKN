# CNR (Nursing) Course & Syllabus — Technical Specification

**Scope:** Extend the BoS **Courses** and **Syllabus** modules to support **JKKN College of Nursing (CNR)** — B.Sc / M.Sc / Post-B.Sc Nursing under the **Indian Nursing Council (INC)** regulation and **TNMGRMU** (Tamil Nadu Dr. M.G.R. Medical University) examination.
**Deliverable type:** Investigation + technical specification (no code changed).
**Date:** 2026-07-24
**Source documents:** `D:\JKKN\Document\JKKN Syllabus\JKKNCNR\Syllabus\BSc nursing curriculam.pdf`, `…\BSc nursing syllabus_1.pdf` (INC Gazette, Regulations 2020, notified 2021-07-05).

---

## 1. Executive summary

CNR is a **third academic model** the BoS tooling has never carried. Two models exist today:

- **Engineering** — CET / Anna University / AICTE: L‑T‑P hours, HSMC/BSC/ESC… categories, Bloom's K‑values, CO→PO/PSO mapping (numeric 1/2/3), CIA+ESE marks. Optional Fink's/Capstone overlay.
- **Arts & Science (CAS)** — TN arts college: Part I–V + Roman-numeral Level tiers, CO→PO/PSO mapping (letters H/M/L).

The **INC/TNMGRMU nursing model is structurally different on every axis**:

| Axis | Engineering / CAS (current) | Nursing (INC/TNMGRMU) |
|---|---|---|
| Workload | **L‑T‑P** weekly hours, each capped at 40 | **Theory + Lab/Skill‑Lab + Clinical**; three credit+contact-hour columns; clinical measured in **weeks** and runs to *hundreds* of hours |
| Course categories | AICTE (HSMC/BSC/ESC/PCC/…) + TN‑arts Part/Level | **Foundational / Core / Elective** courses, **Mandatory Modules**, **SSCC** (self-study/co-curricular) |
| Outcomes | Course Objectives + CLOs with **Bloom's K1–K6** | **COMPETENCIES** + free-text **DESCRIPTION**, mapped to **10 INC core competencies** — no Bloom's |
| Unit structure | `units[].chapters[]` (topics only); pedagogy & assessment are *global* sections | Per-unit table: **Learning Outcomes · Content · Teaching/Learning Activities · Assessment Methods**; a *separate* **Clinical** outline (Clinical Unit · Duration weeks · Learning Outcomes · Procedural Competencies/Clinical Skills · Clinical Requirements · Assessment Methods) |
| Outcome mapping | CO → PO/PSO (mandatory tab) | CO → **10 core competencies** (no PO/PSO at all) |
| Marks | CIA + ESE (25/75) | **Internal (College) + External (University)** split for *both* theory and practical; some courses College-exam-only |

The good news: the existing code is built on an **additive, `stream`-branched, JSONB-heavy** pattern. Nursing can be added the same way the v1.2 Assessment and v3.5 Fink's blocks were — **new nullable columns + a `stream === 'Nursing'` branch** — with **zero change to existing engineering/CAS rows**.

---

## 2. Current implementation — DB structure & workflow

### 2.1 Courses ("master")

**Key fact:** `/bos/courses` is **not a local table**. It is a thin proxy over the **COE `courses` REST API**.

- UI: `app/(routes)/bos/courses/` → `_components/course-form.tsx`, `courses-import-dialog.tsx`.
- API: `app/api/bos/courses-master/` (`route.ts`, `[id]/route.ts`, `import/route.ts`) → `CoeRestClient` → COE `GET/POST/PUT/DELETE /api/v1/courses`. (Note: `app/api/bos/courses/[id]/route.ts` is misleadingly named — it edits `bos_course_reviews`, not courses.)
- Model: `types/bos-courses.ts` (`BosCourseMaster`), validation `lib/services/bos/courses-schemas.ts`.
- Scope: institution column is plural **`institutions_id`**; CAS fan-out via `counselling_code`; writes gated by **board membership** (`resolveBosBoardScope` + `guardCourseInstitutionWrite`), not by the role grant.
- Cross-links: `courses.coe_course_id` (local timetable bridge, `supabase/migrations/20260613_coe_course_sync_bridge.sql`) and `bos_course_syllabi.course_id` (stable COE id, `20260618160000_bos_syllabi_add_course_id.sql`) are independent.

**Hardcoded engineering/arts assumptions** (`lib/services/bos/courses-schemas.ts`):
- `theory_hours` / `tutorial_hours` / `practical_hours` — each `min(0).max(40)` (lines 81–86). **Nursing clinical hours exceed 40 → hard validation failure.**
- `COURSE_CATEGORY_VALUES` (6–10) — Theory/Practical/Project/Field Work/… — no **Clinical/Practicum**.
- `COURSE_TYPE_VALUES` (20–37) — TN‑arts + AICTE strings — no **Foundational/Core/Elective nursing heads**.
- `PART_LEVEL_EXEMPT_CODES = new Set(['CET'])` (56) — only engineering is exempt from Part/Level; **CNR would wrongly get Part I–V + Roman levels.**
- Marks default `evaluation_type:'CIA + ESE'`, 25/75 (`toCoeCreatePayload`).

### 2.2 Syllabus

- Table: `public.bos_course_syllabi` (`supabase/migrations/20260506_create_bos_course_syllabi_table.sql`). Versioning = *new course per revision*; unique `(regulation_id, course_code, version_number)`; RLS by `institutions_id`, with API layer using **service-role reads + `counselling_code`/`board_id` filters as authorization**.
- Model: `types/bos.ts:642-715` (`BosCourseSyllabus`, DTOs, filters). Aggregate JSONB shapes at `types/bos.ts:390-636`.
- Editor: single **3,930-line** `components/bos/syllabus-form.tsx`. Tabs at `syllabus-form.tsx:986-1001`.

**Current JSONB columns and the tab that edits each:**

| Tab | Component | Column |
|---|---|---|
| Basic Info | inline | scalars: `institutions_id, board_id, regulation_id, composition_id, course_id, course_code, course_name, course_credits, total_hours, contact_hours, stream, notes` |
| Objectives | `ObjectivesEditor` | `course_objectives` |
| Course Outcomes | `CloEditor` (+K‑Values) | `course_learning_outcomes` |
| Content | `ContentEditor` (theory/practical/project modes, mutually exclusive) | `course_content` |
| Resources | `TextbooksEditor` + `ResourcesEditor` | `textbooks`, `web_resources` |
| Pedagogy | `PedagogyEditor` | `pedagogy` |
| PO Mappings | `PoMappingsEditor` | `po_mappings` |
| Assessment *(Fink's)* | `AssessmentEditor` | `assessment_structure` |
| Capstone & LLC *(Fink's)* | 5 editors | `concept_applications, assessment_pattern, capstone_project, capstone_rubric, llc_conference` |

- API: `app/api/bos/syllabus/` — `route.ts` (list/create), `[id]` (get/put/delete, PUT gated by `guardSyllabusEdit` = creator/chairman/super-admin), `clone`, `revise`, `export-pdf`, `export-xlsx`, `extract`, `template`, `compare`, `duplicate-regulation`, `backfill-course-id`, `history`, `health`, `metrics`.
- **`extract`** is a *deterministic* parser (not AI): `lib/utils/bos/syllabus-parser.ts` (`parseSyllabusText`, `parseSyllabusSheetsWithWarnings`); `.pdf`→pdf-parse, `.docx`→mammoth, `.xlsx`→SheetJS. Never persists — returns `{data, summary, warnings}` for non-destructive merge.
- **`template`** builds the 10-sheet `syllabus-template.xlsx` from `lib/utils/bos/syllabus-xlsx.ts` (`Objectives, COs, Units, Practical Topics, Textbooks, References, WebResources, Pedagogy, PO_Mapping, Reference Codes`).

**Hardcoded engineering/arts assumptions:**
- `stream` is **free-text**, no enum. Only ONE branch on it: PDF variant in `app/(routes)/bos/syllabus/_components/row-actions.tsx:180-206` (`/engineering/i` → engineering PDF header; everything else → `default`). No Nursing branch anywhere.
- `ALIGNMENT_LEVELS` L/M/H (`syllabus-form.tsx:3644`); display 1/2/3 (engineering) vs L/M/H (CAS via `scope.isCAS`). **PO Mappings tab is mandatory-shaped — no "not applicable" path.**
- `DEFAULT_K_VALUES` K1–K6 Bloom's; COs require k_values.
- `course_content` modes are **mutually exclusive** (`is_practical` XOR `is_project` XOR units). Nursing needs theory **and** clinical simultaneously.
- `BosUnit` (`types/bos.ts:424-431`) has only `unit_id, unit_title, chapters, remarks, hours` (`hours` = "theory+tutorial" e.g. "6+6"). **No per-unit learning_outcomes / teaching_activities / assessment_methods; no clinical hours or weeks.**
- Fink's/Capstone tabs gated `taxonomy_type === 'finks'` and currently hard-hidden `HIDE_FINKS_TABS = true` (`syllabus-form.tsx:298`).

---

## 3. Source model — what a nursing syllabus actually contains

From the INC Gazette curriculum + syllabus PDFs:

**Curriculum / course master (INC B.Sc Nursing, 8 semesters, competency-based):**
- Credit structure columns per course: **Theory credits, Theory contact hours, Lab/Skill‑Lab credits, Lab/Skill‑Lab contact hours, Clinical credits, Clinical contact hours, Total credits, Total hours**. Example: `N‑NF (I) 125 Nursing Foundation I — 6 (120) T + 2 (80) Lab + 2 (160) Clinical = 10 credits / 360 h`.
- Course codes: `ENGL 101`, `ANAT 105`, `N‑NF (I) 125`, `N‑AHN (I) 215`, `SSCC 130` — letters + space + digits, some with `(I)`/`(II)` roman suffixes. **Does not match the `^[A-Z0-9]+$` course-code regex.**
- Categories: **Foundational / Core / Elective**; plus **Mandatory Modules** (BCLS, First Aid, ENBC, IMNCI, Health Assessment, Fundamentals of Prescribing…), **Elective Modules** (1 credit = 20 h), **SSCC** (Self‑study/Co‑curricular).
- Marks: per-semester **Internal (College Exam) + External (University Exam)** for theory *and* practical; some (Communicative English, Informatics, electives) are **College-exam-only**. Pass = C grade (50%) for nursing courses, P (40%) for English/electives. UGC 10-point grading, SGPA/CGPA.

**Per-course syllabus page shape:**
```
<COURSE NAME>
PLACEMENT: <semester>
THEORY: <n> Credits (<h> hours)          ← may be multiple lines:
PRACTICAL/LAB: <n> Credit (<h> hours)      THEORY / PRACTICAL-LAB / CLINICAL
DESCRIPTION: <free-text paragraph>        ← no current equivalent
COMPETENCIES: On completion … 1. … 2. …  ← the CLO equivalent (no K-values)

COURSE OUTLINE (Theory) — table:
  Unit | Time (Hrs, marked T/P) | Learning Outcomes | Content | Teaching/Learning Activities | Assessment Methods

CLINICAL outline (clinical courses) — table:
  Clinical Unit | Duration (Weeks) | Learning Outcomes | Procedural Competencies/Clinical Skills | Clinical Requirements | Assessment Methods

REFERENCES / recommended books
```

Two hard structural facts the current model cannot represent:
1. **Per-unit** Learning Outcomes + Teaching Activities + Assessment Methods (today these are global sections).
2. A **parallel Clinical outline** coexisting with the Theory outline (today content modes are mutually exclusive).

---

## 4. Gap analysis (nursing need → current capability → verdict)

| # | Nursing need | Current | Verdict |
|---|---|---|---|
| G1 | Theory + Lab + Clinical credits/hours; clinical in weeks & >40 h | L‑T‑P, `max(40)` | **Blocking** — cap fails, no clinical field |
| G2 | Categories Foundational/Core/Elective, Mandatory Module, SSCC | AICTE/arts enums | **Blocking** — enum rejects |
| G3 | Course codes with spaces/`(I)` | `^[A-Z0-9]+$` | **Blocking** — regex fails |
| G4 | Part/Level not used | exempt only for `CET` | **Blocking** — CNR gets Part I–V |
| G5 | DESCRIPTION paragraph | none | Missing field |
| G6 | COMPETENCIES without Bloom's K-values | CLOs require K1–K6 | Partial — reuse CLO shape, make K optional |
| G7 | Per-unit LO / activities / assessment | units = topics only | **Blocking** — no per-unit fields |
| G8 | Parallel Clinical outline (weeks, procedural competencies, clinical requirements) | mutually-exclusive modes | **Blocking** — no clinical structure |
| G9 | CO → 10 core competencies (no PO/PSO) | PO tab mandatory | **Blocking** — cannot skip PO, no competency map |
| G10 | Internal(College)+External(University) marks, theory & practical | CIA+ESE / Fink's | Partial — reuse `assessment_pattern` internal/external split |
| G11 | Nursing/TNMGRMU PDF variant | engineering vs default only | Missing variant |
| G12 | `stream` must reliably select nursing behaviour | free-text, 1 regex branch | Needs enum + `isNursing` branch |

---

## 5. Technical specification

Design principle (matches the codebase's own convention): **additive columns + `stream`-branched UI. No existing row or engineering/CAS path changes.**

### 5.1 Course master (COE `courses`)

The course master is COE-owned and reached over REST, so there are two viable paths. **Recommended: MyJKKN-minimal (Path A)** — keep the fine-grained T/P/Clinical split in the *syllabus* (§5.2) where the pedagogy already lives, and touch only MyJKKN validation on the course master. Escalate to Path B only if COE's exam engine needs clinical credits as first-class columns for mark/CGPA computation.

**Path A — MyJKKN-only (no COE schema change)** — edit `lib/services/bos/courses-schemas.ts`:
1. **Relax hour caps** behind an institution/stream flag: for nursing, raise `theory_hours/practical_hours` cap from 40 (e.g. to 999) or make the cap a function of institution type. Keep 40 for engineering/CAS.
2. **Add nursing categories** to `COURSE_CATEGORY_VALUES`: `'Clinical'`, `'Theory + Clinical'`, `'Theory + Lab'`, `'Practicum'` (or an institution-scoped category list).
3. **Add nursing types** to `COURSE_TYPE_VALUES` fallback: `'Foundational Course'`, `'Core Course'`, `'Elective Course'`, `'Mandatory Module'`, `'Self-study/Co-curricular'`. (COE remains the live source; this only feeds the offline template + form + Zod accept.)
4. **Relax the course-code regex** to allow space/parentheses for nursing (`^[A-Z0-9 ()]+$`) or gate the strict regex by institution type.
5. **Exempt CNR from Part/Level**: add the nursing counselling/institution code to `PART_LEVEL_EXEMPT_CODES` (or drive the exemption off `stream`/institution type rather than a hardcoded `Set(['CET'])`).
6. Import dialog (`courses-import-dialog.tsx`) + template: add a nursing column preset (Theory/Lab/Clinical credits & hours) — see §6 skills.

**Path B — COE schema change (only if exams need it)** — add to COE `courses`: `skill_lab_credit`, `skill_lab_hours`, `clinical_credit`, `clinical_hours`, `clinical_weeks`; expose in `/api/v1/courses`; extend `BosCourseMaster` + form. **Cross-repo, cross-DB — larger blast radius; defer unless COE mark computation requires it.**

### 5.2 Syllabus (`bos_course_syllabi`) — new migration (additive, nullable)

New migration `supabase/migrations/2026XXXX_bos_syllabus_nursing_inc.sql`, mirroring the 20260625 / 20260709 additive pattern:

```sql
alter table public.bos_course_syllabi
  add column if not exists course_description  text,     -- the DESCRIPTION paragraph
  add column if not exists nursing_workload    jsonb,    -- T/P/Clinical credits+hours+weeks
  add column if not exists clinical_outline    jsonb,    -- parallel clinical table
  add column if not exists competency_mappings jsonb;    -- CO → 10 INC core competencies
```

**Shapes (add to `types/bos.ts`):**

`nursing_workload`:
```jsonc
{
  "theory":    { "credits": 2, "hours": 40 },
  "practical": { "credits": 1, "hours": 40 },   // Lab / Skill-Lab
  "clinical":  { "credits": 2, "hours": 160, "weeks": 4 }
}
```

`clinical_outline` (parallel to `course_content`, coexists with it):
```jsonc
{
  "units": [
    { "clinical_unit": "1", "duration_weeks": 2,
      "learning_outcomes": ["Assess, plan, implement & evaluate basic care needs…"],
      "procedural_competencies": ["IM/IV/SC injections", "Instillations — eye/ear/nose", "GCS assessment"],
      "clinical_requirements": ["Nursing rounds on patient with altered sensorium"],
      "assessment_methods": ["Clinical skills checklist", "OSCE"] }
  ]
}
```

`competency_mappings` (replaces `po_mappings` for nursing):
```jsonc
{
  "core_competencies": [ { "id": 1, "label": "Patient centered care" }, … ],  // the INC 10
  "mappings": [ { "co_id": "C1", "competencies": [1,2,8] } ]
}
```

**Extend existing JSONB (no migration — JSONB is schemaless):** add optional fields to `BosUnit` (`types/bos.ts:424`) so the theory `course_content` units carry the nursing table columns:
```ts
export interface BosUnit {
  // …existing…
  learning_outcomes?: string[];    // nursing per-unit LO
  teaching_activities?: string[];  // nursing per-unit Teaching/Learning Activities
  assessment_methods?: string[];   // nursing per-unit Assessment Methods
  hour_type?: 'theory' | 'practical'; // "3 (T)" marker
}
```
These are **optional and ignored by engineering/CAS** exporters, so existing rows/PDFs are unaffected.

**Reuse (no new column):**
- **COMPETENCIES** → `course_learning_outcomes.clos` with `k_values` optional; label the tab "Competencies" when `isNursing`.
- **Marks** → `assessment_pattern` (`internal_marks`/`external_marks` + `components`) already models an internal/external split — reuse for College/University marks; skip the Fink's `capstone_*` columns.

### 5.3 `stream` → enum + `isNursing` branch

1. Make `stream` a **dropdown** in Basic Info (`Engineering | Arts & Science | Nursing | Pharmacy | Dental | …`) so branching is reliable (today it's free text with one regex).
2. Add a single `isNursing = /nursing/i.test(stream)` (mirroring the existing `scope.isCAS` / `isFinksBoard` gates) that:
   - **Basic Info** — shows `nursing_workload` (T/P/Clinical) inputs + `course_description`.
   - **Content** — allows theory `course_content` **and** `clinical_outline` together (relax the mutually-exclusive invariant for nursing); renders the per-unit LO/activities/assessment columns.
   - **Course Outcomes** — relabel "Competencies", make K-values optional.
   - **Hides the PO Mappings tab**; **shows a Competency Mapping tab** editing `competency_mappings`.
   - Adds a **Clinical Outline** tab editing `clinical_outline`.
3. **PDF/export** — add a `nursing` variant alongside `engineering`/`default` in `row-actions.tsx:180-206` and `lib/utils/bos/course-syllabus-pdf.ts:674` (TNMGRMU header, competency section, clinical table). Add nursing sheets to `lib/utils/bos/syllabus-xlsx.ts` (`Clinical`, `Competencies`, `Competency_Mapping`; drop `PO_Mapping`).

### 5.4 Data / config prerequisites (not code)

- Register the **INC 2021 / TNMGRMU** regulation in `regulations` for the CNR institution(s).
- Set the CNR institution's `course_master_source` (`coe` if courses are COE-mastered, else `myjkkn`).
- Confirm CNR `counselling_code` (CAS-style Aided/SF pairing is unlikely for nursing — verify it's a single institution so scope fan-out is a no-op).
- Grant the nursing board members `academic.bos-courses.*` / `academic.bos-syllabus.*` via the usual `custom_roles`/`bos_members` path.

---

## 6. Skills changes

**`.claude/skills/bos-curriculum-pdf-to-import`** (course master import sheet):
- Add a **nursing source format** to `scripts/extract_curriculum.py` / `references/mapping.md`: category map `Foundational→Foundational Course`, `Core→Core Course`, `Elective→Elective Course`, plus `Mandatory Module`, `SSCC`; three-way **Theory / Lab / Clinical** credit+hour extraction (not L‑T‑P); tolerate course codes with spaces/`(I)`.
- Note the >40 h caps and the internal/external (College/University) marks split.

**`.claude/skills/bos-syllabus-convert`** (syllabus → xlsx/SQL):
- Add an **INC/TNMGRMU extraction spec** to `references/extraction-spec.md`: `DESCRIPTION` paragraph → `course_description`; `COMPETENCIES` → `course_learning_outcomes` (no K-values); per-unit **Learning Outcomes / Content / Teaching Activities / Assessment Methods** → extended `BosUnit`; the **Clinical outline** table → `clinical_outline`; **no PO mapping** (competency mapping instead); multi-line PLACEMENT/THEORY/PRACTICAL/CLINICAL header → `nursing_workload`.
- Add the **nursing SQL column mapping** (the four new columns) to `references/sql-import.md`, and a Nursing PDF variant note.

---

## 7. Current vs proposed — difference summary

| Area | Current | Proposed (nursing) | Change type |
|---|---|---|---|
| Course hour caps | `max(40)` L‑T‑P | relaxed / stream-gated + T/Lab/Clinical | edit `courses-schemas.ts` (Path A) |
| Course categories/types | AICTE/arts enums | + Foundational/Core/Elective/Mandatory/SSCC | additive enum |
| Course code regex | `^[A-Z0-9]+$` | allow space/`()` for nursing | edit regex/gate |
| Part/Level exempt | `Set(['CET'])` | + CNR (or stream-driven) | edit set |
| `bos_course_syllabi` cols | 13 JSONB + scalars | **+ `course_description`, `nursing_workload`, `clinical_outline`, `competency_mappings`** | new migration, nullable |
| `BosUnit` | topics only | + optional `learning_outcomes/teaching_activities/assessment_methods/hour_type` | JSONB extend, no migration |
| Competencies | CLOs + mandatory K1–K6 | reuse CLOs, K optional | UI branch |
| Outcome mapping | PO/PSO tab (mandatory) | Competency-mapping tab; PO tab hidden | UI branch |
| Content modes | theory XOR practical XOR project | theory **+** clinical for nursing | relax invariant (nursing only) |
| Marks | CIA+ESE / Fink's | reuse `assessment_pattern` internal/external | reuse |
| `stream` | free text, 1 regex branch | enum dropdown + `isNursing` gate | schema-light |
| PDF/XLSX | engineering / default | + nursing (TNMGRMU) variant | additive |

**Untouched (regression surface = zero for existing users):** all existing engineering/CAS rows, the COE proxy contract (Path A), `po_mappings`, Fink's/Capstone columns, versioning/clone/revise, scoping/RLS, the timetable `coe_course_id` bridge.

---

## 8. Phasing & risks

**Suggested phases**
1. **Config + enums** (low risk): register regulation, relax course caps/categories/regex/Part-Level, `stream` enum. Unblocks course-master entry.
2. **Syllabus migration + types** (additive): 4 new nullable columns + `BosUnit` extension + type shapes.
3. **Editor branch** (`isNursing`): Basic Info workload, per-unit outline, Clinical tab, Competency-mapping tab, hide PO tab.
4. **Export**: nursing PDF + XLSX variants.
5. **Skills**: extraction specs for both skills; then bulk-convert the INC PDFs.

**Risks / decisions to confirm**
- **COE clinical credits (Path A vs B):** does COE's exam/CGPA engine need clinical credits as first-class columns? If yes → Path B (COE migration). Confirm with COE team. *(Open decision.)*
- **Hour-cap relaxation** must be stream/institution-gated, not global, or engineering data-entry loses a guardrail.
- **Content mutual-exclusivity** relaxation must be nursing-only — engineering exporters assume exactly one mode is populated.
- **`stream` free-text → enum** is a small migration risk: existing rows have arbitrary text; backfill/normalise before enforcing the enum, and keep the PDF `/engineering/i` regex working during transition.
- **`counselling_code` assumption:** verify CNR is not CAS-paired so scope fan-out stays a no-op.
- **M.Sc / Post-B.Sc Nursing** (TNMGRMU) syllabi (`…\msc syllabus tnmgrmu.pdf`, `post B.Sc nursing syllabus tnmgrmu.pdf`) may differ from the INC B.Sc shape — validate the spec against them before finalising the extraction rules.

---

### Appendix — key source references
- Course master validation: `lib/services/bos/courses-schemas.ts:4-94`
- Course proxy API: `app/api/bos/courses-master/route.ts`, `import/route.ts`
- Syllabus table: `supabase/migrations/20260506_create_bos_course_syllabi_table.sql`; additive precedents `20260625_bos_syllabus_assessment_structure.sql`, `20260709_bos_syllabus_finks_capstone_v35.sql`
- Syllabus types: `types/bos.ts:390-715` (`BosUnit` 424, `BosCourseContentData` 458, `BosPOMappingsData` 522)
- Editor: `components/bos/syllabus-form.tsx` (tabs 986-1001, stream 1324-1331, HIDE_FINKS_TABS 298)
- Stream branch: `app/(routes)/bos/syllabus/_components/row-actions.tsx:180-206`; PDF `lib/utils/bos/course-syllabus-pdf.ts:674`
- Parser/template: `lib/utils/bos/syllabus-parser.ts`, `lib/utils/bos/syllabus-xlsx.ts`
- Skills: `.claude/skills/bos-curriculum-pdf-to-import/`, `.claude/skills/bos-syllabus-convert/`
