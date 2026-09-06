# Admission years — JKKN Dental College and Hospital

**Date:** 2026-07-31
**Institution:** JKKN Dental College and Hospital — `e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5`
**Methodology:** as the AHS / Arts & Science (Self) / Engineering / Nursing / Pharmacy docs
in this directory.

**Result: 22 of 23 gaps filled (23 → 1, deliberate). 18 existing values flagged, none
changed.**

---

## 1. Why the sheet could not help — a subtler reason than elsewhere

The workbook holds 476 Dental rows and the database holds 476 **active** Dental learners,
so the two look interchangeable. They are not: **none of the 10 active learners with a NULL
admission year appears in the sheet at all.** They entered the active set after the
2026-07-28 snapshot. The two 476-row sets overlap but are not the same set — a coincidence
of size that could easily have been mistaken for a contradiction in the diff.

The workbook changed twice more during this session (`17230f37…` → `9068ef73…`). A new diff
appeared: **Pharmacy `2024 → 0`**, which is SANTHOSHKUMAR — the learner set to 2024 earlier
today, whose sheet cell now reads `0`. That is the same zeroing seen on five Nattraja
Vidhyalya CBSE rows. Zeros are being written into the Admission Year column; there is still
no valid pending admission-year edit anywhere in the workbook.

## 2. Roll rule: 98.9% on active, 0% on everything else — and why that was not a red light

| status | roll agreement |
|---|---|
| active | 445 / 450 = **98.9%** |
| graduated | **0 / 77** |
| inactive | **0 / 12** |
| enquiry | **0 / 2** |

Zero agreement suggested a systematic offset like Engineering's 2002 typo, but the delta
histogram showed **two opposing deltas** — graduated stored `roll+1`, inactive stored
`roll−1`. A single defect produces one constant delta, so this was two unrelated
situations, and each had to be resolved separately.

### 2.1 The graduated 77 are correct — do not "fix" them

Rolls `DB20001`–`DB20100`, stored **2021**, semester **CRRI**, academic year 2025-2026.
CRRI is the compulsory rotatory internship — BDS is 4 academic years **plus** CRRI, so a
2021 admission reaches CRRI in 2025-26. The stored value back-calculates exactly.

The `DB20` prefix reflects the **2020 admission cycle**, which COVID pushed into calendar
2021. Roll prefix and admission year legitimately differ for this one batch. Applying the
roll rule here would have corrupted 77 correct rows.

Crucially, **no NULL row is in the `DB20` series**, so this exception could not contaminate
the backfill.

### 2.2 The inactive rows are the ones that are wrong

Every NULL group's roll year matches a large **active** cohort carrying the same roll
series — meaning the roll rule is sound and the existing inactive values are the outliers:

| NULL group | n | → | active cohort reference |
|---|---|---|---|
| `DB23A`, "3 Year", 2025-26 | 10 | 2023 | 88 active `DB23A001`–`DB23A100` at 2023 |
| `DB22`, "4 Year" | 7 | 2022 | 80 active `DB22` at 2022 |
| `DB23`, inactive ×2 + enquiry ×1 | 3 | 2023 | 55 active `DB23` at 2023 |
| `DB24A`, "1 Year" | 1 | 2024 | 98 active `DB24A` at 2024 |

## 3. Applied — 22 rows

| year | status | rows |
|---|---|---|
| 2022 | inactive | 7 |
| 2023 | active | 10 |
| 2023 | inactive | 2 |
| 2023 | enquiry | 1 |
| 2024 | inactive | 1 |
| 2026 | enquiry | 1 |
| | **total** | **22** |

The 2026 row is **POONTHAMIZHAN R** (`b64a6733-…`), an enquiry with no roll, register
number or email, created 2026-07-11. All 5 other Dental `enquiry` and all 58
`enquiry_submitted` learners with a value are 2026.

All 23 candidates were `legacy_fee_mode = true`, so no fee-review case opened — including
for the 10 active learners who have live bills.

## 4. Deliberately left NULL — 1 row

**`LTI-Test Student`** (`4437be85-…`, `lti.student@jkkn.ac.in`), inactive, no roll number,
no academic year, no cohort. This is an **LTI integration test account**, not a person.
Assigning it an admission year would invent data about a record that should arguably not be
in `learners_profiles` at all. Dental therefore ends at 1 NULL by design, not omission.

## 5. Flagged, NOT changed — 18 existing values

Reported for the Dental office to confirm. Unlike the single clear-cut outliers corrected
at Nursing (AAQHIL) and Pharmacy (ELAIYARASAN), these span several anomaly types and some
may reflect repeats, transfers or re-admissions not visible in this data.

| # | rows | stored | contradicted by | detail |
|---|---|---|---|---|
| 1 | 8 | 2022 | 55 active `DB23` peers at 2023 | `DB23003, DB23014, DB23015, DB23032, DB23049, DB23050, DB23058, DB23071` (inactive) |
| 2 | 4 | 2021 | 80 active `DB22` peers at 2022 | `DB22023, DB22038, DB22065, DB22071` (inactive) |
| 3 | 2 | 2021 | created 2026-07-27/28 as new enquiries | TANUSHREE N S, ANAAMICA KENNADY — a 2021 admission year on a brand-new enquiry |
| 4 | 1 | 2026 | in CRRI during 2025-26 | `DB17062` (active) — a 2026 admission cannot be in the final internship year |
| 5 | 1 | 2026 | in CRRI during 2025-26 | `DB19086` (enquiry) |
| 6 | 1 | 2025 | 80 active `DB22` peers at 2022 | `DB22112` (enquiry) |
| 7 | 1 | 2020 | 77 `DB20` peers at 2021 | one active `DB20` learner, also in CRRI 2025-26 |

Item 7 is the mirror of §2.1: this learner agrees with the roll but disagrees with the 77
CRRI classmates whose stored 2021 is demonstrably right.

## 6. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Rows filled | 22 | 22 | pass |
| Dental `admission_year_id IS NULL` | 23 → 1 (test account) | 1 | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Learners linked to an inactive admission year | 0 | 0 | pass |
| Graduated `DB20` CRRI cohort | untouched at 2021 | untouched | pass |

## 7. Rollback

Pre-state for all 23 gap rows is in the scratchpad as `rollback-dental.json`.

```sql
UPDATE learners_profiles SET admission_year_id = NULL WHERE id = ANY($1);   -- the 22 ids
```
