# Curriculum → BoS Import Mapping Reference

Table of contents:
- Source formats (auto-detected)
- The two-axis problem
- AICTE code → Type lookup (R-2021)
- New-regulation code → Type lookup (R-2025 / R-2026)
- L-T-P → Category rules
- Field-by-field column mapping
- Special / edge-case rows
- Credit reconciliation

## Source formats (auto-detected)

`scripts/extract_curriculum.py` reads all of these and picks the parser automatically.

| # | Regulation / doc | File | Table shape |
|---|---|---|---|
| A | R-2021 columnar | .docx / .pdf | `CODE \| TITLE \| CATEGORY \| L \| T \| P \| TCP \| CREDITS` (AICTE codes) |
| B | R-2026 "REC-26" | .docx / .pdf | `CODE \| Name \| CourseType \| L-T-P(combined) \| TCP \| Credits \| Category` |
| C | R-2025 hybrid | .docx / .pdf | CourseType col + **separate OR combined** L-T-P + **trailing** Category |
| D | R-2021 RTF | .rtf | striprtf renders pipe-delimited rows; same fields as A |

Detection: a `.rtf` → D; else if any header has a **Course Type** *and* a **Category** column → B/C;
else → A. Codes may start with the batch year (`26HSS01`) — the code filter allows that.

**Not auto-handled:** Anna University *NON-AUTONOMOUS affiliated* PDFs (e.g. some R-2025 CSE) are
text-layout with no ruled tables, and omit course codes from Sem III onward — the extractor writes
nothing and says so. Parse those by hand (only the code-bearing early semesters are recoverable).

## The two-axis problem

## The two-axis problem

An AICTE / Anna University curriculum table has ONE classification column ("CATEGORY":
HSMC, BSC, ESC, PCC, PEC, OEC, EEC, MC). The BoS import template has TWO independent axes:

- **Type** — the *classification* (Core, Elective, Basic Science, ...). The PDF's CATEGORY maps HERE.
- **Category** — the *nature* of the course (Theory / Practical / Theory + Practical / Project).
  The PDF encodes this implicitly in the **L-T-P** weekly period split, NOT in its CATEGORY column.

Getting this backwards is the single most common mistake. The PDF's "CATEGORY" is never the
template's "Category".

## AICTE code → Type lookup

Every value on the right MUST exist on the template's Lists sheet (the script verifies this).

| PDF CATEGORY | Meaning | Template **Type** |
|---|---|---|
| HSMC | Humanities, Social Sciences & Mgmt | `Humanities, Social Sciences & Management Courses` |
| BSC  | Basic Science Courses | `Basic Science Courses` |
| ESC  | Engineering Science Courses | `Engineering Science Courses` |
| PCC  | Professional Core Courses | `Professional Core Courses` |
| PEC  | Professional Elective Courses | `Programme Elective`  (no literal "Professional Elective" in Lists) |
| OEC  | Open Elective Courses | `Open Elective Courses` |
| EEC  | Employability Enhancement Courses | `Employability Enhancement Courses` |
| MC   | Mandatory Courses (audit/non-credit) | `Mandatory Courses` |
| (none) | Induction / uncategorised | leave Type blank |

If a curriculum uses a code not in this table, STOP and confirm the mapping with the user —
do not silently guess. Add the new code to `AICTE_TO_TYPE` in the script and to this table.

## L-T-P → Category rules

`L` = lecture, `T` = tutorial, `P` = practical periods per week.

| Condition | Template **Category** |
|---|---|
| `P == 0` (lecture/tutorial only) | `Theory` |
| `L == 0 and T == 0 and P > 0` | `Practical` |
| `L > 0 and P > 0` | `Theory + Practical` |
| Project work / Internship / dissertation | `Project` (pass explicit `"category":"Project"`) |
| Induction Programme (0-0-0, 0 credit, no exam) | `Non Academic` |

## Field-by-field column mapping

Template columns (Courses sheet): Course Code, Course Name, Category, Type, Exam Duration (Hrs),
Credits, Theory Hours, Practical Hours, Internal Max Mark, External Max Mark.

| Column | Source |
|---|---|
| Course Code | PDF course code (letters+digits only; must be unique per institution) |
| Course Name | PDF course title (drop the `$`, `#`, `*` footnote markers and Tamil duplicate script) |
| Category | derived from L-T-P (above) |
| Type | AICTE code lookup (above) |
| Exam Duration (Hrs) | `3` default; `0` for zero-credit / Non Academic rows |
| Credits | PDF credits column |
| Theory Hours | `L + T` (tutorials are theory-side contact) |
| Practical Hours | `P` |
| Internal Max Mark | `25` default (see caveat below) |
| External Max Mark | `75` default (see caveat below) |

**Marks caveat:** 25/75 is the template default and is correct for most theory courses.
Anna University practicals and project courses are frequently **50/50** (or 40/60). The script
does not know the real scheme — if the source document or user specifies lab/project splits,
pass `"internal"`/`"external"` per course. Otherwise flag this to the user for review.

## Special / edge-case rows

- **NCC Credit Courses** — the PDF gives no course code. Assign `NCC1` / `NCC2` / `NCC3`
  (letters+digits, satisfies the code rule) and tell the user these are placeholders. Their
  credits are usually flagged `*`/`#` as *extra* (over-and-above the degree total).
- **Non-credit MC courses** (e.g. Disaster Management, Industrial Safety) — credits `0`,
  exam `0`. Still Type = `Mandatory Courses`.
- **Electives shown with `-` periods** (offered on demand) — assume a standard `3-0-0` for a
  3-credit theory elective and note the assumption.
- **Summer Internship / Project Work** — Category `Project`; Type follows the PDF's CATEGORY
  (usually EEC → `Employability Enhancement Courses`).
- **Same course listed under VII/VIII\*** (either-semester) — include once; do not duplicate.

## Credit reconciliation

After building, sum the Credits column and compare to the PDF's stated "TOTAL CREDITS".
They often differ — and the difference must be *explainable*, usually the NCC/extra-credit
rows carrying `*`/`#`. Pass `expected_total_credits` in the JSON so the script prints the
residual. If the residual is NOT explained by known extra-credit rows, a course was dropped
or duplicated — re-check the extraction before delivering.
