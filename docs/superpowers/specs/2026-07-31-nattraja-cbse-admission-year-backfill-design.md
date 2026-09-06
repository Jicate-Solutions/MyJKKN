# Admission years — Nattraja Vidhyalya CBSE

**Date:** 2026-07-31
**Institution:** Nattraja Vidhyalya CBSE — `29c221d1-b918-4c46-9d67-857273b0b553`
**Methodology:** as the other institution docs in this directory; school-specific handling
follows [Matric HSS](./2026-07-31-matric-hss-admission-year-backfill-design.md).

**Result: 76 gaps filled (76 → 0). Nothing to update.**

---

## 1. The gap was 76, not the 57 previously reported

Earlier whole-sheet runs reported "57" for this institution. That figure came from the
whole-sheet script, which treats a blank Admission Year cell as `Number("") === 0` — finite,
so it passed validation and was bucketed by database state before the year was checked
against the lookup. Re-measured per-institution against the database directly:

| lifecycle_status | learners | NULL |
|---|---|---|
| active | 226 | 57 |
| admitted | 15 | 15 |
| inactive | 12 | 4 |
| **total** | **253** | **76** |

**Sibling-name hazard:** `ilike '%nattraja%'` matches two institutions — this one and
`Nattraja Incubation Forum` (`550fc158-…`, 0 learners). The UUID is pinned throughout.

## 2. The five zeroed cells are gone

Previous runs found 5 Nattraja rows whose Admission Year read `0` against a stored 2026.
The workbook has since been edited again (md5 `0cf376a7…` → `86e44ebe…`) and those cells
are now genuinely blank: the sheet's distribution is `164 × 2026` and `62 blank`, with no
zeros. No action was needed and none was taken — a blank is not a change.

## 3. The sheet still contributed nothing

164 of 226 sheet rows were already correct; the other 62 are blank. `C null->set` = 0,
`E differs` = 0. Across eight institutions the workbook has now supplied **zero** usable
admission-year values.

The 62 blanks exceed the 57 active NULLs by 5 — those 5 are the formerly-zeroed rows, which
hold 2026 in the database and are blank in the sheet.

## 4. Derivation: a school, so no roll rule

Rolls are grade-and-section coded: `NV-G3A-01`, `NV-G4B-04`, `NV1A01`, `NV4A09`. No year is
present. The capture step confirmed this structurally — **0 of 76** gap rows even match
`^[A-Za-z]*[0-9]{2}`, so the college roll rule could not have fired here regardless.

As at Matric HSS, the school has exactly **one** admission year: all 177 learners holding a
value are **2026** (169 active, 8 inactive). With a single distinct value, no outlier is
arithmetically possible, so **there was nothing to update** — only blanks to fill.

## 5. Applied — 76 rows, flat 2026

| status | rows | evidence |
|---|---|---|
| active | 57 | academic year 2026-2027; 177 school-wide peers at 2026 |
| admitted | 15 | see below |
| inactive | 4 | academic year 2026-2027 |
| | **76** | |

61 of the 76 carry academic year **2026-2027** directly. The 15 `admitted` rows have no
programme and no academic year yet — they were created **2026-07-22** with rolls
`NV-G3A-02`–`NV-G4B-04`, i.e. a July-2026 intake for the 2026-2027 year. Their evidence is
creation-date plus school-wide uniformity rather than their own academic-year field, which
is weaker in kind but admits no alternative: 2026 is the only admission year this school
has ever used.

The statement carried **no roll predicate**, resolving a flat 2026 for every NULL, so a
grade number could not be misread as a year.

All 76 are `legacy_fee_mode = true` with no live bills; no fee-review case opened.

## 6. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Rows filled | 76 | 76 | pass |
| `admission_year_id IS NULL` | 76 → 0 | 0 | pass |
| Distinct admission years school-wide | 1 (2026) | 1 | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Learners linked to an inactive admission year | 0 | 0 | pass |
| Sheet oracle | 164/164 correct, 0 differing | unchanged | pass |

## 7. Rollback

Pre-state for all 76 rows is in the scratchpad as `rollback-nattraja-cbse.json`.

```sql
UPDATE learners_profiles SET admission_year_id = NULL WHERE id = ANY($1);   -- the 76 ids
```
