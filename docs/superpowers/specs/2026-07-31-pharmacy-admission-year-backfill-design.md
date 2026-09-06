# Admission years — JKKN College of Pharmacy

**Date:** 2026-07-31
**Institution:** JKKN College of Pharmacy — `5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334`
**Methodology:** as [AHS](./2026-07-31-ahs-admission-year-backfill-design.md),
[Arts & Science (Self)](./2026-07-31-arts-science-self-admission-year-backfill-design.md),
[Engineering](./2026-07-31-engineering-admission-year-backfill-design.md) and
[Nursing](./2026-07-31-nursing-admission-year-backfill-design.md).

**Result: 231 gaps filled (231 → 0), 1 existing value corrected, 1 lookup row created.
233 changes.**

---

## 1. The sheet, again, contributed nothing

555 Pharmacy rows: **554 already correct, 0 differing**. The 555th (SANTHOSHKUMAR S) is
**blank in the workbook and NULL in the database** — the sheet cannot supply what it also
lacks.

The workbook changed twice more during this session (md5 `7f36c93f…` → `17230f37…`, 11:27 →
11:35). Re-diffed in full each time; the Admission Year column remains unedited for every
institution. The only diffs anywhere are the five Nattraja Vidhyalya CBSE cells reading `0`,
plus one Nursing row that now differs **because this session corrected it** — the workbook
is a 2026-07-28 snapshot and the database has moved ahead of it.

## 2. Derivation

Rolls are letters-first with programme prefixes: `PB` (B.Pharm), `PD` / `BP` (Pharm.D
variants). `^[A-Za-z]*([0-9]{2})` measured **552 / 552 = 100.00%** on active learners — the
cleanest of any institution so far. Email `([0-9]{2})[a-z]+@` agreed 244/246.

## 3. A missing lookup row, not bad data — `2019-2020` created

27 gap learners had rolls `PD19001`–`PD19031`, deriving **2019**. Pharmacy's
`admission_years` began at 2020, so the join resolved them to `NO LOOKUP ROW` and the
backfill would have silently skipped all 27.

Corroboration that 2019 is genuinely correct, not a mis-parse — **all 27 are identical**:

| field | value |
|---|---|
| programme | PHARMD |
| semester | "6 Year" (`semester_order` 6) |
| academic year | 2025-2026 |

Pharm.D is a **6-year** programme. Its final year falling in 2025-26 means admission in
**2019** — exactly what the roll says, from an independent field. Pharm.D simply reaches
further back than the 4-year programmes, which is why this institution needs a year no
other one does.

Row created (`b34cdaff-cce5-4ef4-bab7-abffcd99bf9a`, year 2019, `2019-2020`, active, not
current) via `INSERT … ON CONFLICT (institution_id, year) DO NOTHING` so the statement is
idempotent. It is the **first pre-2020 admission year in the system** — the only other was
Engineering's deactivated 2002 typo.

## 4. Applied

| part | rows | detail |
|---|---|---|
| lookup row | 1 | `2019-2020` for Pharmacy |
| roll-derived | **228** | 2019×27, 2020×101, 2021×95, 2022×5 |
| individually resolved | **3** | below |
| existing value corrected | **1** | §5 |

### 4.1 The three without a usable roll

| learner | status | set to | cohort evidence |
|---|---|---|---|
| SANTHOSHKUMAR S | active | **2024** | BPHARM / Semester IV / 2025-26 → 83 at 2024, 2 at 2025 |
| JISHNU K M | inactive | **2023** | PHARMD / "3 Year" / 2025-26 → 28 at 2023, unanimous |
| Rithwik Anil V | enquiry | **2026** | all 79 Pharmacy enquiry/enquiry_submitted learners are 2026 |

SANTHOSHKUMAR has an empty roll *and* register number; JISHNU's roll is `855` (derives
"2085"); Rithwik has no identifiers at all. All three were resolved from programme +
semester + academic year against their actual cohort.

## 5. Existing value corrected — ELAIYARASAN

`c888d77d-…`, roll `PB22013`, was stored as **2026**; corrected to **2022**.

| signal | says |
|---|---|
| roll `PB22013` | 2022 |
| Semester VII of B.Pharm (4-year) in 2025-26 | 2022 |
| cohort BPHARM / Sem VII / 2025-26 | 5 of 5 at 2022 |

A 2026 admission cannot be in the seventh semester of 2025-26. He was `last_updated`
2026-06-11 — pre-existing, not introduced by this session. `legacy_fee_mode = true`, no
live bills, no fee events.

As with AAQHIL at Nursing §4, the `IS NULL` guard does not apply to an existing-value
change; it was replaced with `admission_year_id = '2206801d-…'` to assert the prior value
and keep the statement idempotent.

## 6. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Lookup row created | 1 | 1 | pass |
| Gap rows filled | 231 | 231 | pass |
| Pharmacy `admission_year_id IS NULL` | 231 → 0 | 0 | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Learners linked to an inactive year | 0 | 0 | pass |
| Roll-vs-year mismatches | 1 (JISHNU only, see below) | 1 | pass |
| Sheet oracle | 554/554 correct, 0 differing | unchanged | pass |

All 231 gap rows were `legacy_fee_mode = true`; no fee-review case was opened, including
for SANTHOSHKUMAR who has live bills.

Cohort distribution after — a smooth curve with no gaps:

| year | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|
| learners | 27 | 127 | 128 | 125 | 125 | 119 | 135 | 259 |

## 7. Open item

The single remaining roll-vs-year mismatch is **JISHNU K M**, and it is **not** an error:
his roll is `855`, which derives "2085". His admission year (2023) is correct per his
cohort; the `roll_number` value is junk. Same class as PRATHAP at Nursing — a
`roll_number` cleanup, not an admission-year issue.

## 8. Rollback

Pre-state for all 231 gap rows is in the scratchpad as `rollback-pharmacy.json`.

```sql
UPDATE learners_profiles SET admission_year_id = NULL WHERE id = ANY($1);   -- the 231 ids
UPDATE learners_profiles SET admission_year_id = '2206801d-8662-4776-b090-7db61fcce087'
WHERE id = 'c888d77d-f373-4d11-a5c6-e3976c22be90';                          -- ELAIYARASAN back to 2026
DELETE FROM admission_years WHERE id = 'b34cdaff-cce5-4ef4-bab7-abffcd99bf9a';  -- only after the 27 are NULL
```
