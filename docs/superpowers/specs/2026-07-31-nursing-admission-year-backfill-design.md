# Admission years — JKKN College of Nursing and Research

**Date:** 2026-07-31
**Institution:** JKKN College of Nursing and Research — `70e54e51-9b98-4e07-9534-a85310609bfd`
**Methodology:** as [AHS](./2026-07-31-ahs-admission-year-backfill-design.md),
[Arts & Science (Self)](./2026-07-31-arts-science-self-admission-year-backfill-design.md)
and [Engineering](./2026-07-31-engineering-admission-year-backfill-design.md).

**Result: 110 gaps filled (110 → 0) and 1 existing value corrected. 111 rows written.**

---

## 1. The sheet contributed nothing, again

`active-learners-2026-07-28 (1).xlsx` — 229 Nursing rows, **229/229 already correct, 0
differing, 0 NULL**. The workbook was re-read at the start of this institution (its md5
had changed from `de67026a…` to `7f36c93f…` since the previous run); a full re-diff of all
4,178 rows across all 10 institutions still showed the same five Nattraja Vidhyalya CBSE
cells reading `0` and **no other pending admission-year change anywhere**. The edits are
landing outside the Admission Year column.

All 110 Nursing gaps were invisible to it: 100 `graduated`, 9 `inactive`, 1
`enquiry_submitted` — the export is `lifecycle_status = 'active'` only.

## 2. Derivation rules for this institution

Rolls are letters-first (`NB21001`, `NP24026`, `NB220046`), the same family as Engineering,
so `^[A-Za-z]*([0-9]{2})` applies. Nursing emails use **two** forms, both validated:

| signal | pattern | agreement on learners who already had a year |
|---|---|---|
| roll number | `^[A-Za-z]*([0-9]{2})` | **226 / 228 = 99.12%** |
| email, year before programme | `([0-9]{2})[a-z]+@jkkn\.ac\.in$` | 113 / 114 = 99.12% |
| email, year at end | `[a-z]([0-9]{2})@jkkn\.ac\.in$` | **58 / 58 = 100%** |

Only `active` learners carry these fields, so the rules could only be measured on that
population — every `graduated` learner was NULL, leaving nothing to validate against.
That is why the cross-checks in §3 mattered more here than elsewhere.

`admission_years` for this institution is complete and unambiguous: 2020-2026, one row per
year, all active, no duplicates.

## 3. Applied — 110 gaps

| derived | status | rows | corroboration |
|---|---|---|---|
| 2021 | graduated | 60 | see §3.1 |
| 2023 | graduated 23, inactive 5 | 28 | 26 email confirmations, 0 contradictions |
| 2024 | graduated 17, inactive 2 | 19 | 17 email confirmations, 0 contradictions |
| 2022 | inactive | 2 | 2 email confirmations, 0 contradictions |
| 2026 | enquiry_submitted | 1 | see §3.2 |
| | **total** | **110** | |

**Across every row that carried an email year: 45 cross-checks, 45 confirmations, 0
contradictions.**

### 3.1 The 60-row 2021 cohort had no email signal — semester arithmetic supplied it

None of the 60 `NB21xxx` learners has a parseable email year, so the roll number stood
alone. Their academic data is perfectly homogeneous: **all 60** are BSC (Nursing),
**Semester 8**, academic year **2025-2026**. A 4-year programme in its eighth semester
during 2025-26 was admitted in **2021** — matching the roll exactly, from an entirely
independent field.

### 3.2 DARSANI A — the one row with no identifier at all

`c0781bc6-…`, `enquiry_submitted`, created 2026-06-20, BSC (Nursing); no roll number, no
register number, no college email. Set to **2026** because all 28 other Nursing
`enquiry_submitted` learners are admission year 2026, created between 2026-03-24 and
2026-07-25 — a window her creation date sits inside. Unanimous cohort, but weaker in kind
than the rest: it is a batch inference, not a per-learner identifier.

## 4. Applied — 1 existing value corrected

**AAQHIL** (`9923bb3c-…`, roll `NB25001`) was stored as **2024**; corrected to **2025**.

| signal | says |
|---|---|
| roll `NB25001` | 2025 |
| email `aaqhil25nur@jkkn.ac.in` | 2025 |
| cohort-mates `NB25002`–`NB25059` (55 learners) | **all 2025** |

He was a lone outlier in an otherwise uniform 56-member cohort.

**A trap avoided:** his semester data reads Semester II in academic year **2026-2027**,
which naively implies a 2026 admission and appears to contradict the roll. But all 55
cohort-mates carry the *identical* Semester II / 2026-2027 while being stored as 2025 — the
cohort's semester field is set uniformly and is not a valid admission-year derivation here.
Checking the cohort before trusting the arithmetic is what resolved it; the same lesson as
Engineering §7.1.

This write changed an existing non-NULL value, so the usual `IS NULL` guard did not apply.
It was replaced with `admission_year_id = '63eb4d8b-…'` (assert the prior value is 2024),
which both asserts the pre-state and keeps the statement idempotent.

AAQHIL is `legacy_fee_mode = true`, so despite having live bills no fee-review case opened.

## 5. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Gap rows filled | 110 | 110 | pass |
| Nursing `admission_year_id IS NULL` | 110 → 0 | 0 | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Learners linked to an inactive admission year | 0 | 0 | pass |
| Roll-vs-year mismatches | 2 → 1 | 1 | pass |
| `NB25` cohort distinct admission years | 1 | 1 | pass |
| Sheet oracle (229 active) | 229/229 correct | unchanged | pass |

All 111 target rows were `legacy_fee_mode = true` with no fee events generated.

## 6. Open item

**PRATHAP** (roll `38`) is the one remaining roll-vs-year mismatch, and it is **not** a
defect in the admission year: his stored 2025 agrees with his email `prathapsingh25nur@`.
The roll number itself is junk — `38` derives "2038". The `roll_number` column needs
cleaning, not the admission year.

## 7. Rollback

Pre-state for all 110 gap rows is in the scratchpad as `rollback-nursing.json`; each was
NULL at capture time.

```sql
UPDATE learners_profiles SET admission_year_id = NULL WHERE id = ANY($1);   -- the 110 ids
UPDATE learners_profiles SET admission_year_id = '63eb4d8b-e882-4497-bea2-b033ee08591c'
WHERE id = '9923bb3c-7817-4d0f-80a7-c0465bf79c7b';                          -- AAQHIL back to 2024
```
