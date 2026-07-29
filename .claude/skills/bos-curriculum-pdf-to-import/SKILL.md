---
name: bos-curriculum-pdf-to-import
description: Convert an AICTE / Anna University engineering curriculum (BE/BTech, any branch, any regulation) into the BoS "Courses Bulk Import" .xlsx that the /bos/courses import dialog accepts. Use when a user provides a curriculum-and-syllabi PDF (semester-wise course tables with COURSE CODE / TITLE / CATEGORY / L-T-P / CREDITS) and asks to "convert", "import", "bulk upload", or "make the import sheet" for BoS courses. Handles the AICTE category (HSMC/BSC/ESC/PCC/PEC/OEC/EEC/MC) → template Type mapping and the L-T-P → Category derivation.
---

# BoS Curriculum PDF → Courses Import Sheet

Turn a regulation curriculum into the BoS bulk-import spreadsheet.

## Fast path: machine-readable tables (auto-extract)

If the source is a `.docx`, `.pdf`, or `.rtf` with real course **tables**, skip the manual JSON
step — run the extractor, which auto-detects the format (R-2021 columnar, R-2026 REC-26,
R-2025 hybrid, or R-2021 RTF), maps everything, and writes the sheet:

```bash
PYTHONUTF8=1 python scripts/extract_curriculum.py <curriculum-file> \
    [--template T.xlsx] [--out O.xlsx] [--expected-credits N]
```

It prints the detected format, course count, credit reconciliation, and any validation issue.
One `.xlsx` per source file. For a folder, loop over the files (merge per-semester files —
e.g. MECH split by semester — into one output; NCC codes are renumbered globally on merge).
If it reports **"No courses extracted"**, the source has no ruled tables (Anna University
non-autonomous affiliated PDF) — fall back to the manual path below for the code-bearing
semesters. Read [references/mapping.md](references/mapping.md) → "Source formats" for details.

## Manual path: unusual layouts / images / hand-checking

When auto-extract can't read the source, read the document yourself and build a JSON spec for
`scripts/convert_curriculum.py`. The rest of this file describes that path.

The PDF→data step is done by reading the document; a bundled script does the deterministic
mapping + file write.

## Critical concept: two axes, not one

The PDF has ONE "CATEGORY" column. The template has TWO independent columns:
- **Type** = classification → this is where the PDF's CATEGORY (HSMC/BSC/ESC/…) goes.
- **Category** = nature of the course (Theory / Practical / Theory + Practical / Project),
  derived from the **L-T-P** period split — NOT from the PDF's CATEGORY.

Never put the PDF's CATEGORY into the template's Category column. This is the #1 mistake.

## Workflow

1. **Get the template.** Use the user's own template if they supplied one (columns/Lists can be
   institution-specific). Otherwise use the bundled `assets/bos-courses-import-template.xlsx`.
   Board and Regulation are chosen later in the import dialog, not in the file.

2. **Extract every course from the PDF** into a JSON spec (schema below). Read all semesters.
   For each course capture: `code`, `name`, `aicte` (the PDF CATEGORY code), `L`, `T`, `P`,
   `credits`. Clean the name — drop `$ # *` footnote markers and duplicated Tamil script.
   For the mapping tables, edge cases (NCC/non-credit/internship/`-` electives), and marks
   guidance, read [references/mapping.md](references/mapping.md).

3. **Write the JSON** to the scratchpad, e.g.:
   ```json
   {
     "template": "<template path>",
     "output": "<output .xlsx path>",
     "expected_total_credits": 162,
     "courses": [
       {"code":"HS3152","name":"Professional English - I","aicte":"HSMC","L":3,"T":0,"P":0,"credits":3},
       {"code":"EC3811","name":"Project Work / Internship","aicte":"EEC","L":0,"T":0,"P":20,"credits":10,"category":"Project"}
     ]
   }
   ```
   Only set `category` to override the derivation (Project / Non Academic). Set `internal`/
   `external` per course only when the source gives a non-default (labs/projects are often 50/50).

4. **Run the converter** (use `PYTHONUTF8=1` on Windows):
   ```bash
   PYTHONUTF8=1 python scripts/convert_curriculum.py <spec.json>
   ```
   It applies the mappings, preserves the Lists/Instructions sheets and their dropdown
   validation, validates every Category/Type against the Lists sheet, checks codes are unique
   and alphanumeric, and prints a credit reconciliation.

5. **Reconcile and report.** Exit code 1 means validation failed — fix and re-run. If the
   credit sum differs from `expected_total_credits`, confirm the residual is explainable
   (almost always the NCC/extra-credit `*`/`#` rows); an unexplained gap means a dropped or
   duplicated course. Tell the user which assumptions to review — especially placeholder NCC
   codes and the 25/75 mark split on labs/projects.

## When the PDF uses an unfamiliar category code

If a curriculum uses a CATEGORY code not in the lookup, stop and confirm the intended Type with
the user, then add it to both `AICTE_TO_TYPE` in `scripts/convert_curriculum.py` and the table
in `references/mapping.md`. Do not silently guess a mapping.

## Pharmacy (COP) curricula — NOT AICTE/Anna

College of Pharmacy has TWO models, neither AICTE. Detect by regulator/university text and
course-table shape (no AICTE CATEGORY column, no L-T-P triple). See the tech spec
`docs/plans/2026-07-24_bos_cop-pharmacy-course-syllabus-tech-spec.md`.

### B.Pharm — PCI CBCS (semester, coded, credited)
- Source table columns: `Course code | Name | No. of hours | Tutorial | Credit points`
  (there is **no** AICTE CATEGORY and **no** separate L/T/P split).
- **Codes carry the type in the suffix** — derive the template **Category** from the code, NOT
  from an L-T-P split: `…T`→Theory, `…P`→Practical, `…PS`→Practice School (map to
  `Non Academic`), `…PW`→Project, `…ET`→Theory (elective), `…RBT`/`…RMT`→Theory (remedial).
- Credit rule (for reconciliation only): lecture & tutorial ×1, practical ×½. Reconcile the
  program against **208** minimum credits.
- Codes already satisfy the alnum course-code regex (`BP101T`) — pass them through unchanged.
- No CO-PO-PSO, no Bloom's — this skill only makes the *courses* sheet; syllabus bodies go
  through `bos-syllabus-convert` (pharmacy branch).

### Pharm.D — Dr. MGR Medical University (year-based, code-less, no credits)
- Source table columns: `Sl.No | Name of Subject | Hours Theory | Hours Practical | Hours Tutorial`.
  Subjects are numbered `year.subject` (`1.1`, `2.5`) with **no course code and no credits**.
- **Assign a deterministic alnum TEMP code** — the course-code regex forbids `.`/`-`, so use
  `makePharmdTempCode` shape `TMPPD<year><seq2>` (e.g. `1.1`→`TMPPD101`, `2.5`→`TMPPD205`).
  Flagged by the `TMP` prefix / COE `is_temp_code`; safe to replace with the official code later
  because syllabi anchor on the stable `course_id`, not the code.
- Leave Category / Credits / L-T-P blank (year-based model relaxes them to optional); set the
  Academic Year (1–5). The import must be created under the **Pharm.D board** so the server
  resolves `academic_model = mgr_pharmd`.
- Year 6 is Internship (no subjects) — do NOT emit courses for it; the internship postings live
  on the syllabus (`internship_postings`), authored via `bos-syllabus-convert`.
