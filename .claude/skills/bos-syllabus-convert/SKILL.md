---
name: bos-syllabus-convert
description: >-
  Convert an academic course syllabus file (PDF / DOCX / XLSX) into the 8-sheet
  syllabus-template.xlsx and/or bos_course_syllabi INSERT/UPDATE SQL for the
  MyJKKN BoS module. Use when a user uploads or points to a syllabus / curriculum
  document and asks to "convert", "import", "make the Excel/SQL", "extract
  syllabus", or populate bos_course_syllabi. Handles Anna-University / AICTE
  course pages (COURSE OBJECTIVES, UNIT I-V, COURSE OUTCOMES, TEXT BOOKS,
  CO-PO/PSO mapping). This targets course SYLLABI (bos_course_syllabi); it is NOT
  the /bos/courses master bulk-import (that is bos-curriculum-pdf-to-import).
metadata:
  version: 1.0.0
---

# BoS Syllabus Convert

Extracts one or more course syllabi from an academic document and emits the
portal Excel template and/or the database import SQL.

## STEP 0 — ASK OUTPUT FORMAT FIRST (every run, mandatory)

Before extracting or writing anything, call the **AskUserQuestion** tool and
wait for the answer. Ask one single-select question:

> **"Which output should I generate from the uploaded file(s)?"**

Options:
1. **Excel file** — only the populated `syllabus-template.xlsx` (8 sheets).
2. **SQL file** — only the `bos_course_syllabi` INSERT/UPDATE SQL.
3. **Both** — Excel workbook AND SQL file.

Rules:
- Do NOT begin conversion until answered. Ask on EVERY run — the choice is
  per-conversion, never remembered from a prior run.
- Produce ONLY the selected output(s). If the user free-texts a different format
  under "Other", follow that.
- The structured JSON, validation summary, and missing-field report are always
  returned as text regardless of choice.

## Workflow

1. **STEP 0 interview** (above) — get the output format.
2. **Read the full extraction spec** before parsing:
   [references/extraction-spec.md](references/extraction-spec.md) (v3.4). It is
   the authoritative ruleset — unit splitting, flat-list = blank chapter with
   every topic as a sub-topic, CO/CLO detection, books, the CO's-PO's & PSO's
   mapping legend, hours capture, and the exact 8-sheet layout. Follow it
   literally; do not improvise structure.
3. **Extract** every course in the document into the JSON of the spec's REQUIRED
   JSON STRUCTURE. One document often holds many courses (whole-regulation
   folders) — process each.
4. **Emit the chosen output:**
   - **Excel** → build the 8 sheets exactly per the spec's FINAL EXCEL OUTPUT
     (bold + frozen header row, `Sections` column on the Units sheet, PO_Mapping
     columns follow the source count).
   - **SQL** → follow
     [references/sql-import.md](references/sql-import.md) for column mapping,
     JSONB shapes, per-institution PO notation, scope resolution, the
     `created_by` = auth.users gotcha, `course_id` COE bridge, dollar-quoting,
     and INSERT/UPDATE templates. Ask the user for the scope uuids
     (institutions_id, board_id, regulation_id, composition_id, created_by) if
     not supplied.
5. **Report** validation errors and a missing-field list as text alongside the
   output. Preserve source values exactly even when flagged; never fabricate.

## Non-obvious rules (full detail in the references)

- **Institution type drives PO notation** — CET (engineering) stores numbers
  `1/2/3`; CAS (arts & science) stores letters `H/M/L`. Same for the displayed
  legend. The DB column matches the display, per institution.
- **Flat-list units → BLANK chapter title**, every topic (first included) a
  sub-topic. Only genuine header→detail or named sub-sections get a chapter
  title.
- **Capture hours**: `units[].hours` ("6+6","9") stripped from the title, plus
  `course_content.total_hours` ("30+30") from the `TOTAL … PERIODS` line.
- **Lab papers** use `{"units":[],"is_practical":true,"topics":[…]}` — never
  synthesized units.
- **course_credits is integer** — 1.5-credit labs → NULL, note it.
- **Drop the trailing average row** (`CO`/`Avg`/`C`) from mapping tables.

## Pharmacy (COP) syllabi — NO CO-PO/Bloom

College of Pharmacy syllabi have **no Course Outcomes, no PO/PSO mapping, no Bloom's** — skip all
CO/CLO/PO extraction. Set `academic_model` and populate the pharmacy columns instead. Full detail:
`docs/plans/2026-07-24_bos_cop-pharmacy-course-syllabus-tech-spec.md`; column shapes in
`types/bos.ts` (`BosExamScheme`, `BosInternshipPostings`, `BosAhsContent`).

### B.Pharm — PCI CBCS (`academic_model = 'pci_pharm'`)
- Body layout: **Scope** (paragraph) → **Objectives** (numbered) → **Course Content: Unit I–V**
  (each with hours, e.g. "10 hours") → **Recommended Books** → **Reference Books**.
- Map: `scope` ← Scope paragraph; `course_objectives` ← Objectives list; `course_content.units[]`
  ← Unit I–V (capture `hours`); practicals use `is_practical:true, topics:[]` (flat experiment
  list); `textbooks.primary` ← Recommended, `textbooks.references`/`web_resources` ← Reference.
- `exam_scheme` ← Table X (Internal = Continuous + Sessional; End-Sem marks + duration) + the PCI
  question-paper pattern (75/50/35 variants). Store `semester` (1–8). Leave CO/PO NULL.

### Pharm.D — Dr. MGR (`academic_model = 'mgr_pharmd'`)
- Body layout: **Introduction/Objectives** (a–f) → **Course Materials** (Text/Reference books) →
  **Lecture-wise Program: Topics** (flat numbered list).
- Map: `course_objectives` ← Introduction/Objectives; body → **flat topics** in
  `course_content` (`is_practical:true, topics:[]`) OR the richer `ahs_content` tree
  (year→subject→topics) for bulk; `textbooks` ← Course Materials. Store `academic_year` (1–5).
- `exam_scheme` ← Theory 70 + IA 30 + Practical + Oral (3 h theory / 4 h practical).
- 6th-year Internship → `internship_postings` (6 mo General Medicine + 2 mo ×3 specialties).

The pharmacy PO-notation rule does **not** apply (no PO tables). One syllabus row = one course /
subject (keeps the course→syllabus 1:1 linkage).
