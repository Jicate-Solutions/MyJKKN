# Admission years — JKKN College of Arts and Science (Aided)

**Date:** 2026-07-31
**Institution:** JKKN College of Arts and Science (Aided) — `a33138b6-4eea-4675-941f-1071bf88b127`
**Methodology:** as the other institution docs in this directory.

**Result: 1 gap filled (1 → 0). Nothing to update.**

> **Sibling hazard, again:** "(Self)" is `b0b8a724-…`, a different institution with 1,747
> learners. The UUID is pinned in every statement.

---

## 1. Scope

553 learners, **1** with `admission_year_id IS NULL`. The sheet's 326 rows were
**326/326 already correct** (all 2025) — no adds, no updates available from it.

Roll numbers here are `AUG25ZY19` / `APG24ZY06` (Aided UG/PG + year + subject + serial),
which the college roll rule parses correctly — but the single gap row has no roll number at
all, so the rule was not used.

## 2. The one row — RATHINAVEL S

`f549a9da-b4d7-49ca-bc3f-2a30565d23ae`, `enquiry`, created 2026-06-30. No roll number, no
register number, no college email. Set to **2026** (`1d6ca393-…`).

| signal | says |
|---|---|
| academic year | 2026-2027 |
| semester | **Semester I** — first semester of MCA |
| created | 2026-06-30 |
| cohort | all 8 Aided `enquiry` / `enquiry_submitted` learners with a value are 2026 |

Four independent signals, no dissent.

## 3. The only row this session where the fee trigger actually fired

Every one of the ~690 rows written across the previous seven institutions was
`legacy_fee_mode = true`, so `trigger_detect_fee_dimension_change` returned on its first
check. **RATHINAVEL is `legacy_fee_mode = false` and `fees_confirmed = false`**, so the
trigger executed for the first time.

Consequences were bounded and verified **before** writing:

1. `PERFORM admission_resolve_fee_items_for_lead(id)` — **runs**.
2. `v_has_active_bills` — he has **0** non-superseded `billing_student_bills`, so the
   trigger returns before inserting into `admission_fee_change_events`.

So the only executed side effect was `admission_resolve_fee_items_for_lead`, whose sole
write is `learners_profiles.fee_items` (jsonb). Read in full beforehand: it looks up an
`admission_fee_structures` row keyed partly on `admission_year_id`, and writes `'[]'` if
none matches.

Pre-flight measurement:

| check | value |
|---|---|
| his `fee_items` before | `[]` |
| candidate active fee structures for his dimensions at 2026 | **0** |

So the function was always going to find nothing and write `[]` over `[]` — a no-op write
of an identical value. Confirmed after the fact: `fee_items` is still `[]`, and
`admission_fee_change_events` is unchanged at 39 with 0 rows for him.

## 4. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Rows filled | 1 | 1 | pass |
| Aided `admission_year_id IS NULL` | 1 → 0 | 0 | pass |
| RATHINAVEL `fee_items` | `[]`, unchanged | `[]` | pass |
| `admission_fee_change_events` (his) | 0 | 0 | pass |
| `admission_fee_change_events` (total) | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Sheet oracle | 326/326 correct | unchanged | pass |

## 5. Rollback

```sql
UPDATE learners_profiles SET admission_year_id = NULL
WHERE id = 'f549a9da-b4d7-49ca-bc3f-2a30565d23ae';
```

Note this re-fires the trigger; `fee_items` would again resolve to `[]`, so the reversal is
clean. Pre-state in the scratchpad as `rollback-arts-science-aided.json`.
