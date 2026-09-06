# Admission years — JKKN Matric Higher Secondary School

**Date:** 2026-07-31
**Institution:** JKKN Matric Higher Secondary School — `e04b8a7f-1445-4ef1-92e9-bde3d32b1f44`
**Methodology:** as the other institution docs in this directory.

**Result: 2 gaps filled (2 → 0). Nothing to update.**

---

## 1. A school is not a college — the roll rule is actively wrong here

Every prior institution encoded the admission year in the roll number
(`24AECT09`, `EC21002`, `NB21001`, `PB20001`, `DB23A061`). **This school does not.**

KEERTHINATH A.R's roll is `11BE111`, where the leading `11` is **Standard 11** — the
class, not a year. Applying `^[A-Za-z]*([0-9]{2})` would have derived **2011**.

Measured across the whole school: of 346 learners whose roll matches the pattern,
**0 agree** with their stored admission year. The rule that scored 99-100% at six colleges
scores exactly zero here. School roll numbers encode grade and serial; there is no year in
them.

## 2. There is only one admission year

All 550 learners with a value are **2026**. One distinct value school-wide — no cohort
structure to reason about, because a school records the admission year as the current
enrolment year for the whole roll.

**This also means there is nothing to "update":** with a single distinct value, no outlier
is arithmetically possible. The only work available was filling the two blanks.

## 3. The sheet contributed nothing — and a correction to earlier reporting

Both gap learners are **blank** in the workbook, so it could not supply either value.

Earlier runs reported Matric HSS as `null->set: 2`, implying the sheet held usable years.
That was an artefact of the whole-sheet script: `Number("")` is `0`, which passes
`Number.isFinite`, so a blank cell was bucketed by database state **before** the year was
validated against the lookup. The per-institution script additionally checks
`byYear.has(sy)` and correctly classified both as unresolvable.

**Consequence for the remaining work:** the `null->set` figures reported for Nattraja
Vidhyalya CBSE (57) and JKKN Testing Institution (4) are suspect for the same reason and
must be re-checked per-institution before being treated as sheet-supplied values.

## 4. Applied — 2 rows, both from their class cohort

| learner | class | academic year | → | cohort evidence |
|---|---|---|---|---|
| AKASH A (`29a4f3c2-…`) | Standard 5 | 2026-2027 | **2026** | 37 Standard 5 classmates, all 2026 |
| KEERTHINATH A.R (`62fa0546-…`) | Standard 11 | 2026-2027 | **2026** | 62 Standard 11 classmates, all 2026 |

Backed further by the school-wide value (550/550 at 2026) and both records being created
mid-2026 (2026-06-12, 2026-07-09).

The statement deliberately carried **no roll predicate** — it resolved a flat 2026 for every
NULL at this institution, precisely so that KEERTHINATH's `11BE111` could not be misread as
2011.

Both are `legacy_fee_mode = true` with no live bills; no fee-review case opened.

## 5. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Rows filled | 2 | 2 | pass |
| `admission_year_id IS NULL` | 2 → 0 | 0 | pass |
| Distinct admission years school-wide | 1 (2026) | 1 | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Learners linked to an inactive admission year | 0 | 0 | pass |
| Sheet oracle | 550/550 correct, 0 differing | unchanged | pass |

## 6. Rollback

Pre-state in the scratchpad as `rollback-matric-hss.json`.

```sql
UPDATE learners_profiles SET admission_year_id = NULL
WHERE id IN ('29a4f3c2-a797-45da-8bb1-077689f3da49','62fa0546-89e2-4db7-88c5-f05091ba9199');
```
