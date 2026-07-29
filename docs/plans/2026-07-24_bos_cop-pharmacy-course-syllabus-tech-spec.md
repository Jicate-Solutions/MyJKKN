# BoS COP (College of Pharmacy) — Course & Syllabus Technical Specification

> Investigation + design only. **No code changed.** Companion to the CNR (nursing) and
> AHS (allied-health) specs in this folder — COP is the **fifth academic model** the BoS
> tooling must carry (after engineering CET, arts-science CAS, nursing CNR, allied-health AHS).
>
> Source PDFs: `D:\JKKN\Document\JKKN Syllabus\JKKNCOP\Syllabus\`
> — `Syllabus_B_Pharm-08092017.pdf` (B.Pharm, PCI CBCS) · `syllabus pharm.d_011014.pdf` (Pharm.D, Dr. MGR Medical University).
> Institution code `COP` is already defined in the codebase's `JKKNCollege` union
> ([lib/services/telephony/exotel-agent-map.ts:15](lib/services/telephony/exotel-agent-map.ts#L15)).

---

## Implementation status (2026-07-25)

**BUILT** on branch `main` (decisions: B.Pharm & Pharm.D are **separate BoS boards** → resolver
keys on board; build scope = **all phases**, Pharm.D COE fields stubbed + flagged):

| Layer | File(s) | Status |
|---|---|---|
| Resolver + predicates | `lib/services/bos/academic-model.ts` (new) | ✅ board-keyed `resolveAcademicModel`, `isPharmacyModel`, `modelHasOutcomes`, `makePharmdTempCode` |
| Types | `types/bos.ts` | ✅ `AcademicModel`, `BosExamScheme`, `BosInternshipPostings`, `BosAhsContent`; 7 new fields on `BosCourseSyllabus` |
| Migration | `supabase/migrations/20260725_bos_syllabus_pharmacy_model.sql` (new) | ✅ additive; **NOT YET APPLIED** (apply via service-role executor — MCP can't reach project) |
| Courses schema | `lib/services/bos/courses-schemas.ts` | ✅ `makeCourseFormSchema(model)`, `COP` in Part/Level-exempt, alnum temp codes, `toCoeCreatePayload` model branch |
| Courses create | `app/api/bos/courses-master/route.ts`, `hooks/bos/use-bos-courses.ts`, `.../courses/_components/course-form.tsx`, `.../courses/new/page.tsx` | ✅ model-aware validate + form (Pharm.D optional credits/hours + Academic Year) |
| Syllabus API | `app/api/bos/syllabus/[id]/route.ts` (PUT allow-list); POST already spreads body | ✅ |
| Syllabus form | `components/bos/syllabus-form.tsx`, `components/bos/syllabus-pharmacy-tabs.tsx` (new) | ✅ pharmacy tab set (Scope/Exam/Internship), hides CLO/Pedagogy/PO, persists `academic_model` |
| PDF export | `app/api/bos/syllabus/[id]/export-pdf/route.ts`, `lib/utils/bos/pharmacy-syllabus-html.ts` (new) | ✅ pharmacy layout, skips CO-PO/Bloom |
| Skills | `.claude/skills/bos-curriculum-pdf-to-import/SKILL.md`, `.claude/skills/bos-syllabus-convert/SKILL.md` | ✅ PCI + Pharm.D branches |

**DEFERRED (documented follow-ups, not blocking authoring):**
- **COE-repo hand-off (Pharm.D):** COE `courses` table + `/api/v1/courses` need nullable
  `credits/theory_hours/practical_hours/course_category` + new `academic_year` + `is_temp_code`
  columns. Until then, MyJKKN forwards these fields (harmless/ignored) but Pharm.D course
  *creation* in COE may reject null credits. **B.Pharm needs none of this** and works fully now.
- **Bulk courses import** (`courses-import-dialog.tsx` / `import/route.ts`): still Anna-strict.
  B.Pharm bulk import works (has credits); Pharm.D bulk import needs the year-based schema wired
  in — use the manual New Course form or the skills meanwhile. (`makeImportRowSchema(model)` exists.)
- **Courses list columns** (`courses-columns.tsx`): no pharmacy-specific columns yet (cosmetic).
- **XLSX export** (`syllabus-xlsx.ts`): still emits the Anna 8-sheet template (empty CLO/PO
  sheets for pharmacy). PDF is the pharmacy-correct export; XLSX pharmacy sheets are a follow-up.
- **Migration application** + seeding the real COP board_ids into `PHARMD_BOARD_IDS` /
  `BPHARM_BOARD_IDS` (name-matching works until then).

---

## 0. Confirmed direction (locked before writing this spec)

1. **COP carries TWO distinct academic models, not one.**
   - **B.Pharm** = **PCI CBCS**, semester-based, coded, credited → a **new** model `pci_pharm`.
   - **Pharm.D** = **Dr. MGR Medical University**, year-based, no codes, no credits → **reuses the
     AHS `mgr_ahs` model** almost verbatim (same university, same year→paper→topic + exam-scheme
     + internship shape). Do **not** invent a parallel `mgr_pharmd` machinery.
2. **Neither pharmacy model has CO / PO / PSO / Bloom's / Fink's.** Those columns stay `NULL`.
   This is the same wall nursing and allied-health hit.
3. **COP depends on the AHS foundation.** The `academic_model` discriminator, the
   `academic-model.ts` resolver, `exam_scheme` / `internship_postings` JSONB, and the temp-code
   feature are all introduced by the AHS spec (§5.1–5.5 there). **Neither the CNR nor the AHS spec
   has been implemented yet** (verified: no `academic_model`/`exam_scheme`/`internship_postings`
   column, type, or form branch exists today). So COP should ship **on top of / together with**
   the AHS work, extending the same enum — not fork it.
4. **Additive & nullable only.** Every new column defaults so existing engineering/CAS/…
   rows are untouched (`academic_model DEFAULT 'anna_univ'`).

---

## 1. Executive summary

BoS "Courses" is **not a table** — it is a thin proxy over the COE `courses` REST API
(`/api/v1/courses`); only **syllabi** are local (`bos_course_syllabi`). The whole module is
shaped for **Anna-University engineering** (semester, L-T-P, credits, CO-PO-PSO, Bloom's/Fink's).
Onboarding COP requires:

- **Courses (COE proxy):** relax the course-code regex + Part/Level requirement for pharmacy,
  make credits/hours optional for Pharm.D, and (reusing the AHS temp-code feature) assign
  placeholder codes to the code-less Pharm.D subjects.
- **Syllabus (local):** extend the AHS `academic_model` enum with `pci_pharm`; add a `scope`
  field and a PCI exam-scheme; reuse `exam_scheme` / `internship_postings` for Pharm.D.
- **Form/exports:** branch on `academic_model` to hide CO-PO/CLO/Pedagogy/Capstone tabs for
  pharmacy and show Scope + Exam-Scheme (+ Internship for Pharm.D).
- **Skills:** add a PCI branch and a Pharm.D (= AHS) branch to both import/convert skills.

The B.Pharm content shape (Scope → Objectives → Unit I–V with hours → Books) maps cleanly onto
the **existing** `course_objectives` / `course_content.units[]` / `textbooks` columns — so B.Pharm
reuses most of the Anna machinery and only *subtracts* (CO-PO) and *adds* (scope + exam scheme).

---

## 2. Current implementation — DB structure & workflow (as-is, verified 2026-07-24)

### 2.1 Courses — a COE proxy, not a local table

- Routes: [app/api/bos/courses-master/route.ts](app/api/bos/courses-master/route.ts) (GET list / POST create),
  [`[id]/route.ts`](app/api/bos/courses-master/[id]/route.ts) (GET/PUT/DELETE),
  [import/route.ts](app/api/bos/courses-master/import/route.ts) (bulk). Every mutation proxies COE
  `/api/v1/courses` via `COE_API_URL`. `toCoeCreatePayload()` hardcodes `evaluation_type:'CIA + ESE'`,
  `result_type:'Mark'`, etc.
- Validation: [lib/services/bos/courses-schemas.ts](lib/services/bos/courses-schemas.ts) (165 lines):
  - **Course-code regex** `^[A-Z0-9]+$/i`, min 3 / max 50 (line 64). **Letters & digits only — no `.`, `-`, space.**
  - `credit` 0–10; `theory_hours`/`tutorial_hours`/`practical_hours` int **0–40**; `exam_duration` 0–8 (lines 79–86).
  - `COURSE_CATEGORY_VALUES` (arts/sci nature set): Theory, Practical, Project, Non Academic, Theory + Practical, … (lines 6–10).
  - `COURSE_PART_VALUES` Part I–V; `COURSE_LEVEL_VALUES` Roman I–XX.
  - **Only institution branch:** `PART_LEVEL_EXEMPT_CODES = new Set(['CET'])` (line 56) via
    `institutionSkipsPartLevel()`. No pharmacy/nursing/AHS branch anywhere.
- UI: [app/(routes)/bos/courses/_components/](app/(routes)/bos/courses/_components/) — `course-form.tsx`,
  `courses-import-dialog.tsx`, `courses-columns.tsx`, etc.

### 2.2 Syllabus — local `bos_course_syllabi`, Anna-University shaped

Base table [supabase/migrations/20260506_create_bos_course_syllabi_table.sql](supabase/migrations/20260506_create_bos_course_syllabi_table.sql).
**Current columns (exhaustive, incl. every later ALTER):**

| Column | Type | Origin |
|---|---|---|
| id, institutions_id, board_id, regulation_id | UUID | base |
| course_code VARCHAR(50), course_name VARCHAR(255), course_credits INT | | base |
| version_number, is_latest, is_archived, revised_from_syllabus_id | | base (versioning) |
| **course_objectives, course_learning_outcomes, course_content, textbooks, web_resources, pedagogy, po_mappings** | JSONB | base |
| **stream** | VARCHAR(50) | base (free-text; comment already names "Pharmacy","Nursing","Dental") |
| created_by (→auth.users), created_at, last_modified_by/at, notes | | base |
| **course_id** VARCHAR(64) | | `20260618160000` (COE bridge anchor) |
| **assessment_structure** | JSONB | `20260625` |
| **concept_applications, assessment_pattern, capstone_project, capstone_rubric, llc_conference** | JSONB | `20260709` (v3.5 Fink's) |

> **Verified:** `academic_model`, `exam_scheme`, `internship_postings`, `ahs_content`,
> `course_description`, `nursing_workload`, `clinical_outline`, `competency_mappings` **do not
> exist** in any migration/type/form. The CNR & AHS specs remain **docs-only**. `stream` is the
> only "vertical" column and it is plain free-text driving **no** branching.

- Row type `BosCourseSyllabus` [types/bos.ts:642-690](types/bos.ts#L642-L690); unit shape
  `BosUnit` [types/bos.ts:424-431](types/bos.ts#L424-L431) (`unit_id`,`unit_title`,`chapters[]`,`hours`);
  `BosCourseContentData` holds **exactly one** of `units[]` / (`is_practical`+`topics[]`) / `project_units`.
- Form [components/bos/syllabus-form.tsx](components/bos/syllabus-form.tsx) (**3,930 lines**):
  tabs Basic / Objectives / CLO / Content / Resources / Pedagogy / PO-Mappings, **+ Assessment +
  Capstone only when `isFinksBoard`** (taxonomy-driven, line 299). PO notation letters-vs-numbers
  decided by **`scope.isCAS`** (lines 3797–3804), *not* by any syllabus field. **No institution-type /
  academic-model switch exists.**
- Syllabus API (14 routes under [app/api/bos/syllabus/](app/api/bos/syllabus/)) incl. `export-pdf`,
  `export-xlsx`, `extract`, `revise`, `clone`.

### 2.3 The two import/convert skills (as-is)

- `.claude/skills/bos-curriculum-pdf-to-import` — Anna/AICTE curriculum table → courses import `.xlsx`
  (AICTE category → Type; L-T-P → Category). No pharmacy path.
- `.claude/skills/bos-syllabus-convert` — course syllabus → 8-sheet Excel and/or `bos_course_syllabi`
  SQL (CO-PO/Bloom/Fink oriented; CET numeric vs CAS letter PO notation). No pharmacy path.

---

## 3. Source model — what the pharmacy syllabi actually contain

### 3.1 B.Pharm (PCI, CBCS) — Anna-shaped **minus** CO-PO

- **Regulator** Pharmacy Council of India; CBCS; examined by the affiliating university (TN → Dr. MGR Medical Univ).
- **8 semesters** (4 yr); 6 sem for D.Pharm lateral entry. Min **208 credits** (209/211/212 with remedial + co-curricular).
- **Codes** encode type: `BP101T`=Theory, `BP107P`=Practical, `BP706PS`=Practice School (NUE), `BP803ET`=Elective Theory, `BP813PW`=Project Work, `BP106RBT`/`RMT`=Remedial Bio/Math. **All match `^[A-Z0-9]+$` ✓.**
- **Credit rule:** L & T ×1, P ×0.5 (3L+1T=4cr; 4P=2cr).
- Course-of-study table cols: `Course code | Name | No. of hours | Tutorial | Credit points`.
- **Course body (Theory):** `Scope` (paragraph) → `Objectives` (numbered list) → `Course Content: Unit I–V`
  (each with hours, e.g. "10 hours"; total e.g. "45 Hours") → `Recommended Books` → `Reference Books`.
- **Course body (Practical):** intro paragraph + **flat numbered experiment list** (no units) + Books.
- **No PO/PSO, no CO-PO mapping, no Bloom's.** ("Objectives" here are course objectives, not outcomes.)
- **Exam scheme (Table X):** `Internal Assessment` = Continuous-mode marks + Sessional-exam marks (+duration);
  `End Semester` = marks + duration. Theory total 100 / 50 / 75; practical 50; NUE courses excluded from univ exam.
  Pass = 50% aggregate incl. IA, with per-component minima.
- **PCI question-paper pattern:** 75-mark = MCQ/Objective 20 + Long (2 of 3) + Short (7 of 9);
  50- and 35-mark variants; practical = Synopsis 5 + Experiments 25 + Viva 5 = 35.

### 3.2 Pharm.D (Dr. MGR Medical University) — **== the AHS model**

- **University** The Tamil Nadu Dr. M.G.R. Medical University, Chennai (**same as AHS**); PCI-approved.
- **6 years** = 5 study years (Part I–V) + **1 year Internship/Residency**. Post-Baccalaureate = 3 yr (enters 4th yr).
- **Year-based**, no semesters. Subjects numbered `year.subject` (`1.1`, `2.5`, `5.4`). **No codes, no credits.**
- Year table cols: `Sl.No | Name of Subject | Hours Theory | Hours Practical | Hours Tutorial`.
- 5th yr: Clerkship (ward rounds) + 6-month Project Work. 6th yr Internship = 6 mo General Medicine + 2 mo ×3 specialties.
- **Subject body:** `INTRODUCTION/OBJECTIVES` (numbered a–f, "Upon completion…") → `COURSE MATERIALS`
  (Text books / Reference books) → `LECTURE WISE PROGRAM: TOPICS` (flat numbered list, sub-points a,b,c; inline hours).
- **No PO/PSO, no Bloom's, no credits.**
- **Exam scheme (Sl.37):** Theory **70 (univ) + 30 (IA) = 100**; Practical similar (IA 20 theory / 30 practical);
  **written + practical + oral (viva)**; theory 3 hr, practical 4 hr. Pass 50% per subject (theory & practical sep. incl IA);
  60%+ = distinction.

---

## 4. Gap analysis (pharmacy need → current capability → verdict)

| # | Pharmacy need | Current capability | Verdict |
|---|---|---|---|
| G1 | Pharm.D subjects have **no code** (`1.1`) | code required, `^[A-Z0-9]+$` rejects `.`/`-` | **Gap** — assign temp codes (AHS feature) **and** relax/choose an alnum-safe scheme (see §5.2 blocker) |
| G2 | Pharm.D has **no credits** | `credit` 0–10 (required in form) | **Gap** — make optional under year models |
| G3 | Pharm.D is **year-based, no Part/Level** | Part/Level required unless CET | **Gap** — add `COP` to Part/Level-exempt (or model-branch) |
| G4 | Both: **no CO / PO / PSO / Bloom** | CLO + PO-Mappings tabs, Fink's/Bloom taxonomy | **Gap** — hide via `academic_model`; leave cols NULL |
| G5 | B.Pharm **Scope** paragraph | no scope field | **Gap** — add `scope` (or reuse `notes`) |
| G6 | B.Pharm Unit I–V + hours; Practical flat list | `course_content.units[]` + `is_practical`+`topics[]` | **Fits** — reuse as-is |
| G7 | B.Pharm Recommended + Reference Books | `textbooks` + `web_resources` JSONB | **Fits** — reuse (map Reference→`web_resources` or extend `textbooks`) |
| G8 | Pharm.D year→subject→lecture-topics tree | none (Anna Unit shape) | **Gap** — reuse AHS `ahs_content` tree (flat mode) |
| G9 | PCI/MGR **exam scheme** (IA+End-Sem / Theory70+IA30 + viva) | `assessment_structure`/`assessment_pattern` (Fink's-shaped) | **Gap** — reuse AHS `exam_scheme` JSONB |
| G10 | Pharm.D **internship postings** (6th yr) | none | **Gap** — reuse AHS `internship_postings` JSONB |
| G11 | B.Pharm **Practice School** (NUE, 1 course) | Category set lacks it | **Minor** — map to `Non Academic` or add value |
| G12 | Institution discriminator | `stream` free-text only; no `academic_model` | **Gap** — introduce `academic_model` (AHS foundation) + `COP` in resolver |

---

## 5. Technical specification (to-be)

### 5.1 Academic-model resolver — extend the AHS foundation

Extend the resolver the AHS spec introduces ([lib/services/bos/academic-model.ts] — new, shared):

```ts
export type AcademicModel =
  | 'anna_univ'   // engineering CET / arts-science CAS (semester, CO-PO, Bloom/Fink)
  | 'mgr_ahs'     // Allied Health Sciences (Dr. MGR) — year/paper/exam-scheme/internship
  | 'mgr_pharmd'  // Pharm.D — ALIAS of mgr_ahs shape (see note); Dr. MGR
  | 'pci_pharm';  // B.Pharm — PCI CBCS: semester + credits + codes + units, no CO-PO

const PCI_PHARM_CODES = new Set(['COP']);   // B.Pharm programs under COP
// Pharm.D also lives under COP → model must be chosen per *program/board*, not just
// institution_code (COP hosts BOTH B.Pharm and Pharm.D). See Open item O-1.

export function resolveAcademicModel(institutionCode?: string|null, opts?: {
  programKind?: 'b_pharm' | 'pharm_d';
}): AcademicModel { /* COP + pharm_d → mgr_pharmd; COP + b_pharm → pci_pharm; else AHS/anna */ }
export const isPharmacyModel = (m: AcademicModel) => m === 'pci_pharm' || m === 'mgr_pharmd';
```

> **Design note — Pharm.D reuse.** `mgr_pharmd` is a *label alias* over the `mgr_ahs` behavior:
> it uses the identical `ahs_content` tree, `exam_scheme`, and `internship_postings`. Keeping a
> distinct enum value (vs literally `mgr_ahs`) only buys a correct university header on the PDF and
> clean reporting. If that isn't needed, collapse Pharm.D into `mgr_ahs` and save an enum value.
> **Recommendation: keep `mgr_pharmd`** (cheap, and the PDF/report distinction is real).

> **Discriminator caveat (important):** unlike AHS (its own institution), **COP hosts two models**
> under one `institution_code`. So the model **cannot** be resolved from `institution_code` alone —
> it must key on the **program / board / regulation** (B.Pharm vs Pharm.D). This is the one real
> departure from the AHS pattern. Resolve at **course/syllabus creation** from the selected board
> or a program flag, and **persist** `academic_model` on the row (don't re-derive at read time).

### 5.2 Course master (COE proxy) changes

**COE side (separate repo — coordinate; shared with AHS §5.2):**
- Make `credits`, `theory_hours`, `tutorial_hours`, `practical_hours`, `course_category` **nullable**.
- Add `academic_year smallint NULL`, `is_paper_based boolean DEFAULT false`, `is_temp_code boolean DEFAULT false`
  (the AHS additions cover Pharm.D too).

**MyJKKN proxy side (this repo) — [courses-schemas.ts](lib/services/bos/courses-schemas.ts):**
- Branch `courseFormSchema` by academic model:
  - `pci_pharm` (**B.Pharm**): keep credits/hours/code required (all present in source). Add `COP`
    to a Part/Level-exempt path (B.Pharm has no Part I–V tiers). Category derives from code suffix
    (`T`→Theory, `P`→Practical, `PS`→Practice School/Non-Academic, `PW`→Project, `ET`→elective-Theory).
  - `mgr_pharmd` (**Pharm.D**): `credits`/`theory_hours`/`practical_hours`/`category` → `.optional()`;
    add `academic_year` (1–5); Part/Level exempt.
- **⚠ Code-regex blocker (new finding, not in the AHS spec):** the current regex `^[A-Z0-9]+$` (no
  `.`/`-`) rejects **both** the source's `1.1` subject numbers **and** the AHS-proposed temp code
  `TMP-PHARMD-1-01` (hyphens). **Decision D-1:** either
  **(a)** relax the regex to `^[A-Z0-9][A-Z0-9._-]{2,}$` (allow `.`/`-`/`_`), **or**
  **(b)** keep the regex and generate **alnum-only** temp codes, e.g. `PDY1S01`
  (`PD`+`Y`+year+`S`+seq). **Recommendation: (b)** — no regex change, less blast radius; the
  `TMP-`/`is_temp_code` flag still marks placeholders for later replacement. (If official Pharm.D
  codes will contain dots, choose (a).)
- `PART_LEVEL_EXEMPT_CODES`: add `'COP'` (or better, drive Part/Level skip off `academic_model`
  rather than the code set, once the resolver exists).
- `toCoeCreatePayload`: for pharmacy stop defaulting `evaluation_type:'CIA + ESE'`; forward
  `academic_year` / `is_temp_code`.

**Temp-code feature (Pharm.D only; B.Pharm already has real codes):** reuse the AHS temp-code
generator + `is_temp_code` flag + "replace codes later" flow. Safe because syllabi anchor on the
stable `course_id` COE bridge, not `course_code` (migration `20260618160000`) — renaming only
rewrites the mutable snapshot. B.Pharm needs **none** of this.

**UI (courses `_components`):** branch `course-form.tsx` / `courses-import-dialog.tsx` /
`courses-columns.tsx` by model — `pci_pharm` shows Code+Credits+Hours+Tutorial (hide Part/Level/AICTE);
`mgr_pharmd` shows Academic Year + Subject Name + Hours (hide Credits/Code/Category/Part/Level).

### 5.3 Syllabus (`bos_course_syllabi`) — new migration (additive, nullable)

New migration `supabase/migrations/2026XXXX_bos_syllabus_pharmacy_model.sql`. If shipped after the
AHS migration, only the pharmacy-specific pieces are new; if COP ships first, it introduces the
shared `academic_model` / `exam_scheme` / `internship_postings` / `ahs_content` columns too.

```sql
ALTER TABLE public.bos_course_syllabi
  -- shared discriminator (introduced here if AHS hasn't shipped):
  ADD COLUMN IF NOT EXISTS academic_model text NOT NULL DEFAULT 'anna_univ'
      CHECK (academic_model IN ('anna_univ','mgr_ahs','mgr_pharmd','pci_pharm')),
  ADD COLUMN IF NOT EXISTS academic_year       smallint,   -- Pharm.D 1..5 (B.Pharm uses semester)
  ADD COLUMN IF NOT EXISTS semester            smallint,   -- B.Pharm 1..8 (nullable for others)
  -- shared exam / internship (reused from AHS):
  ADD COLUMN IF NOT EXISTS exam_scheme         jsonb,      -- §5.4
  ADD COLUMN IF NOT EXISTS internship_postings jsonb,      -- §5.5 (Pharm.D)
  ADD COLUMN IF NOT EXISTS ahs_content         jsonb,      -- Pharm.D year→subject→topics tree (AHS shape)
  -- B.Pharm-specific:
  ADD COLUMN IF NOT EXISTS scope               text;       -- B.Pharm "Scope" paragraph

COMMENT ON COLUMN public.bos_course_syllabi.academic_model IS
  'Discriminator: anna_univ | mgr_ahs | mgr_pharmd (=AHS shape) | pci_pharm (B.Pharm CBCS, no CO-PO).';
```

**Content mapping — what goes where (no overloading):**

| Source field | B.Pharm (`pci_pharm`) | Pharm.D (`mgr_pharmd`) |
|---|---|---|
| Scope / Introduction para | **`scope`** (new text) | `scope` or `ahs_content.intro` |
| Objectives (numbered) | `course_objectives` (existing JSONB) | `course_objectives` |
| Body | `course_content.units[]` (Unit I–V+hours) / practicals `is_practical`+`topics[]` | **`ahs_content`** flat lecture-topic tree (AHS `mode:"flat"`) |
| Recommended Books | `textbooks` | `textbooks` |
| Reference Books | `web_resources` (or extend `textbooks` with a `kind`) | `web_resources` |
| Exam scheme | **`exam_scheme`** (§5.4 PCI variant) | **`exam_scheme`** (§5.4 MGR variant) |
| Internship | — (Practice School = a normal course) | **`internship_postings`** (§5.5) |
| CO / PO / PSO / Bloom | **NULL** (`course_learning_outcomes`,`po_mappings`) | **NULL** |
| Credits | `course_credits` (from source) | NULL |

> **B.Pharm reuses the Anna `course_content` machinery unchanged** (Unit I–V with `hours`, practical
> mode) — its only new columns are `scope`, `exam_scheme`, `semester`. That is the key economy: the
> heavy content editor already does exactly what B.Pharm needs; we only *subtract* CO-PO tabs and
> *add* two fields.

### 5.4 `exam_scheme` JSONB shape (reused from AHS §5.4, two pharmacy variants)

```jsonc
// B.Pharm (pci_pharm) — Internal Assessment (Continuous + Sessional) + End Semester
{
  "components": [
    { "name": "Internal Assessment", "max": 25, "min": null,
      "sub": [ { "name": "Continuous mode", "max": 10 }, { "name": "Sessional Exams", "max": 15 } ] },
    { "name": "End Semester (Theory)", "max": 75, "min": null, "duration_hours": 3 }
  ],
  "total_marks": 100, "pass_pct": 50,
  "question_pattern": {           // PCI blueprint, per total-marks variant
    "variant": "75", "duration_hours": 3,
    "sections": [
      { "name": "MCQ/Objective", "marks": 20 },
      { "name": "Long Answers (2 of 3)", "marks": 20 },
      { "name": "Short Answers (7 of 9)", "marks": 35 }
    ]
  }
}
// Pharm.D (mgr_pharmd) — Theory 70 + IA 30; Practical; Oral
{
  "components": [
    { "name": "Theory (University)", "max": 70, "min": null, "duration_hours": 3 },
    { "name": "Internal Assessment", "max": 30 },
    { "name": "Practical", "max": 70, "duration_hours": 4 },
    { "name": "Oral / Viva", "max": null }
  ],
  "total_marks": 100, "pass_pct": 50, "distinction_pct": 60
}
```

New TS type `BosExamScheme` in [types/bos.ts](types/bos.ts) (shared with AHS). Store as authored;
never fabricate missing minima.

### 5.5 `internship_postings` JSONB (Pharm.D 6th year — reused from AHS §5.5)

```jsonc
{
  "total_duration": "12 months",
  "postings": [
    { "area": "General Medicine", "duration": "6 months" },
    { "area": "Specialty department", "duration": "2 months", "repeat": 3 }
  ],
  "notes": "Internship/Residency; independent clinical pharmacy services to allotted wards."
}
```

### 5.6 API changes (`app/api/bos/syllabus/*`)

- **POST** [route.ts](app/api/bos/syllabus/route.ts) + **PUT** [`[id]/route.ts`](app/api/bos/syllabus/[id]/route.ts):
  accept + allow-list `academic_model`, `academic_year`, `semester`, `scope`, `exam_scheme`,
  `internship_postings`, `ahs_content`. Default `academic_model` via `resolveAcademicModel(...)`;
  do **not** require CO-PO/CLO for pharmacy models.
- **Exports** (`export-pdf`, `export-xlsx`): branch on `academic_model` —
  - `pci_pharm` → PCI header, Scope + Objectives + Unit I–V (hours) + Books + IA/End-Sem exam table + QP pattern; **no CO-PO/Bloom legend**.
  - `mgr_pharmd` → Dr. MGR header, Intro/Objectives + lecture-topic list + Books + Theory/IA/Practical/Oral table + internship table.

### 5.7 UI changes (`components/bos/syllabus-form.tsx`)

Add an `academic_model` branch alongside the existing `isFinksBoard` / `scope.isCAS` axes:
- `pci_pharm` (B.Pharm) tabs: **Basic** (add Semester) · **Scope** (new textarea) · **Objectives** ·
  **Content** (existing Unit/practical editor, unchanged) · **Resources** (Recommended + Reference) ·
  **Exam Scheme** (new §5.4 editor). Hide **CLO, Pedagogy, PO-Mappings, Assessment, Capstone**.
- `mgr_pharmd` (Pharm.D) tabs: **Basic** (Academic Year) · **Objectives/Intro** · **Content**
  (AHS flat lecture-topic editor → `ahs_content`) · **Resources** · **Exam Scheme** · **Internship**
  (new §5.5 editor). Hide CLO/Pedagogy/PO-Mappings/Assessment/Capstone.
- Reuse the Institution→Composition→Board/Regulation cascade unchanged. `scope.isCAS` PO-notation
  logic is simply never reached (PO tab hidden).

### 5.8 Nav / labels

Drive "Semester"/"Year"/"Course"/"Subject" labels off `academic_model` through the existing
label-adapter ([lib/utils/school-label-adapter.ts](lib/utils/school-label-adapter.ts)) rather than
hard-coding strings — add a pharmacy label set.

---

## 6. Skill changes (import/convert workflows)

- **`bos-curriculum-pdf-to-import`** — add:
  - a **PCI branch** (B.Pharm): parse the `Course code | Name | Hours | Tutorial | Credit` tables;
    derive Category from the code suffix (`T/P/PS/ET/PW/RBT/RMT`) instead of AICTE category;
    apply the credit rule L+T×1 / P×0.5; reconcile against 208.
  - a **Pharm.D (= AHS) branch**: year-based, code-less source → emit the AHS import sheet
    (`Academic Year, Subject Name, Hours…`), assign temp codes, skip L-T-P→Category.
- **`bos-syllabus-convert`** — add:
  - **PCI extraction**: Scope → Objectives → Unit I–V (+hours) → Recommended/Reference Books;
    practicals as `is_practical`+`topics[]`; the PCI exam scheme + QP pattern; emit
    `academic_model:'pci_pharm'`. **Skip CO-PO/PSO/Bloom/Fink.**
  - **Pharm.D extraction** (reuse AHS spec): Intro/Objectives → lecture-topic flat list → Course
    Materials; Theory70/IA30/Practical/Oral scheme; internship postings; emit
    `academic_model:'mgr_pharmd'` → `ahs_content`/`exam_scheme`/`internship_postings`.
  - Keep the mandatory STEP-0 output-format interview.

---

## 7. Current vs proposed — difference summary

| Layer | Current (as-is) | Proposed (to-be) for COP |
|---|---|---|
| Discriminator | `stream` free-text only, no branching | `academic_model` enum (+`pci_pharm`), persisted, drives form/exports |
| Courses schema | code `^[A-Z0-9]+$`, credits/hours required, CET-only Part/Level exempt | pharmacy branch: B.Pharm keeps code/credits (Part/Level exempt); Pharm.D optional credits/hours + temp codes + **regex decision D-1** |
| Syllabus columns | Anna set (CO-PO/Bloom/Fink) | + `scope`, `semester`, `academic_year`, `exam_scheme`, `internship_postings`, `ahs_content`; CO-PO/Bloom NULL for pharmacy |
| B.Pharm content | n/a | **reuses** `course_objectives` + `course_content.units[]` + `textbooks` unchanged |
| Pharm.D content | n/a | **reuses AHS** `ahs_content` flat tree + `exam_scheme` + `internship_postings` |
| Form | 7/9 tabs, taxonomy + CAS branches | + `academic_model` branch; pharmacy hides CLO/PO/Pedagogy/Capstone, shows Scope/Exam-Scheme(/Internship) |
| Exports | Anna CO-PO PDF | PCI + Dr. MGR PDF templates |
| Skills | Anna/AICTE + CO-PO only | + PCI branch + Pharm.D(=AHS) branch |
| Rows touched | — | **zero** existing rows changed (all additive, `DEFAULT 'anna_univ'`) |

---

## 8. Phasing, dependencies & risks

**Dependency:** COP builds on the **AHS foundation** (`academic-model.ts`, `academic_model` column,
`exam_scheme`/`internship_postings`/`ahs_content`, temp-code feature). Recommended: land AHS + COP
**together** (shared enum + migration), or land the shared foundation first, then COP's `pci_pharm`
+ `scope` + PCI exam variant + skills.

Suggested phasing:
1. **Foundation (shared w/ AHS):** `academic-model.ts` resolver, `bos_course_syllabi` ALTER (§5.3),
   TS types, syllabus POST/PUT allow-list. *Additive, zero-risk.*
2. **B.Pharm (pci_pharm):** courses-schema branch (Part/Level exempt for COP), syllabus-form
   pharmacy tab set + Scope + Exam-Scheme editor, convert-skill PCI branch. *(No COE change needed —
   B.Pharm has real codes/credits; can proceed on existing COE course fields.)*
3. **Pharm.D (mgr_pharmd):** COE course extension (nullable credits/hours, academic_year, temp codes)
   + resolve **D-1 regex decision**, course-form/import branch, reuse AHS content/exam/internship
   editors, convert-skill Pharm.D branch.
4. **Exports:** PCI + Dr. MGR PDF/XLSX templates.
5. **Data load:** convert both PDFs → seed courses + syllabi; reconcile B.Pharm 208 credits and
   exam-scheme totals.

**Risks:**
- **Two models under one `institution_code` (COP).** The resolver must key on program/board, not
  just code — the single real deviation from the AHS pattern (Open item O-1). Get this wrong and
  B.Pharm and Pharm.D collide.
- **Code regex (D-1).** Silent 400s on Pharm.D temp codes if not resolved first.
- **COE coupling.** Pharm.D course creation is blocked on the COE nullable-fields change; B.Pharm and
  all syllabus authoring are not — sequence accordingly.
- **Duplicated exam-scheme entity** if AHS and COP land separately without sharing `exam_scheme` —
  coordinate the JSONB shape once.

---

## 9. Open decisions / confirmations needed

- **O-1** — COP hosts **both** B.Pharm and Pharm.D. Confirm the resolver key: per **board**, per
  **regulation**, or an explicit **program flag** at creation? (Cannot be `institution_code` alone.)
  Also confirm whether B.Pharm and Pharm.D are separate BoS boards/regulations in COE already.
- **D-1** — Course-code regex: **relax** `^[A-Z0-9]+$` to allow `.`/`-`/`_`, **or** keep it and use
  alnum-only Pharm.D temp codes (`PDY1S01`). (Recommendation: keep regex, alnum temp codes.)
- **O-2** — `mgr_pharmd` as a distinct enum value vs collapsing Pharm.D into `mgr_ahs`
  (Recommendation: keep distinct for the university header/reporting).
- **O-3** — B.Pharm **Reference Books**: reuse `web_resources`, or extend `textbooks` with a
  `kind: 'text'|'reference'`? (Recommendation: `web_resources` — no schema change.)
- **O-4** — B.Pharm **Scope**: dedicated `scope text` column (recommended) vs reuse `notes`.
- **O-5** — Syllabus row granularity for Pharm.D: one row per **subject** (keeps course→syllabus 1:1;
  recommended) vs one per **year**.
- **O-6** — Are COP courses in scope for BoS **meeting-agenda / course-review** flows, or
  syllabus-only?
- **O-7** — B.Pharm **Practice School** (NUE) & **Project Work**: map to existing `Non Academic`/
  `Project` categories, or add PCI-specific category values?
- **O-8** — Official Pharm.D code scheme that eventually replaces temp codes.

---

## Appendix — key references

**Source:** `D:\JKKN\Document\JKKN Syllabus\JKKNCOP\Syllabus\{Syllabus_B_Pharm-08092017.pdf, syllabus pharm.d_011014.pdf}`
· extracted text + model analysis at `scratchpad/cop_txt/` + `scratchpad/cop_source_analysis.md`.

**Courses (COE proxy):**
[courses-schemas.ts](lib/services/bos/courses-schemas.ts) (regex L64, caps L79-86, exempt L56) ·
[app/api/bos/courses-master/route.ts](app/api/bos/courses-master/route.ts) (+`[id]`,`import`) ·
[app/(routes)/bos/courses/_components/](app/(routes)/bos/courses/_components/)

**Syllabus (local):**
[20260506_create_bos_course_syllabi_table.sql](supabase/migrations/20260506_create_bos_course_syllabi_table.sql)
(+ `20260618160000` course_id, `20260625` assessment_structure, `20260709` finks_capstone_v35) ·
[types/bos.ts:642-690](types/bos.ts#L642-L690) (row) / [:424-431](types/bos.ts#L424-L431) (`BosUnit`) ·
[components/bos/syllabus-form.tsx](components/bos/syllabus-form.tsx) (3,930 lines; tabs L985-1001) ·
[app/api/bos/syllabus/](app/api/bos/syllabus/) (14 routes)

**Precedent specs (siblings):**
[docs/plans/2026-07-24-bos-ahs-course-syllabus-design.md](docs/plans/2026-07-24-bos-ahs-course-syllabus-design.md)
· [docs/plans/2026-07-24_bos_cnr-nursing-course-syllabus-tech-spec.md](docs/plans/2026-07-24_bos_cnr-nursing-course-syllabus-tech-spec.md)

**Shared:** `academic-model.ts` (new, per AHS §5.1) ·
[lib/utils/school-label-adapter.ts](lib/utils/school-label-adapter.ts) ·
[lib/services/telephony/exotel-agent-map.ts:15](lib/services/telephony/exotel-agent-map.ts#L15) (`COP` code)
