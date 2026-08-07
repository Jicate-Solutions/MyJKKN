# Backfill missing admission years — JKKN College of Arts and Science (Self)

**Date:** 2026-07-31
**Institution:** JKKN College of Arts and Science (Self) — `b0b8a724-7c65-4f07-8047-2a38e8100ad5`
**Methodology:** same as [2026-07-31-ahs-admission-year-backfill-design.md](./2026-07-31-ahs-admission-year-backfill-design.md).
Every measurement was re-run for this institution rather than carried over — and almost
none of the AHS conclusions transferred.

> **Sibling-institution hazard.** "JKKN College of Arts and Science **(Aided)**" is a
> separate institution (`a33138b6-4eea-4675-941f-1071bf88b127`, 326 sheet rows). Because
> `admission_years.institution_id` is `NOT NULL`, any `ilike '%arts and science%'` match
> would silently link Self learners to Aided cohorts. Every statement below pins the UUID.

---

## 1. The sheet, again, changes nothing

`active-learners-2026-07-28 (1).xlsx`, 781 rows for this institution. IDs: 0 blank,
0 malformed, 781 distinct, **0 duplicates**. Sheet Admission Year: 2023×1, 2024×267,
2025×513.

Matched by `ID*` against production: **781 already correct, 0 differing, 0 NULL, 0
unresolvable, 0 not found.** An unedited export, exactly as at AHS.

## 2. The real gap is 2 rows, and neither is in the sheet

1,747 learner profiles; **2** with `admission_year_id IS NULL` — one `graduated`, one
`reserved`. The export covers only `lifecycle_status = 'active'`, so it reaches neither.

**The AHS derivation rule does not apply here.** Neither target has a roll number matching
`^[0-9]{2}` (one is `''`, one is `NULL`), so `2000 + roll[0:2]` derives nothing.

## 3. The email rule is lifecycle-dependent — the headline number is a trap

`college_email ~ '([0-9]{2})[a-z]+@jkkn.ac.in$'` agrees with the stored admission year on
only **1,297 / 1,605 = 80.81%** here, versus 97.10% at AHS. Broken down, the aggregate is
actively misleading:

| lifecycle_status | n | email agrees | pct | modal delta |
|---|---|---|---|---|
| active | 779 | 779 | **100.0%** | 0 |
| reserved | 399 | 399 | **100.0%** | 0 |
| admitted | 21 | 21 | **100.0%** | 0 |
| rejected | 15 | 15 | **100.0%** | 0 |
| account | 1 | 1 | 100.0% | 0 |
| **graduated** | 322 | 50 | **15.5%** | **−2** |
| **inactive** | 67 | 32 | 47.8% | **−1** |
| enquiry | 1 | 0 | 0.0% | −4 |

Delta distribution overall: `0` ×1297, `−2` ×186, `−1` ×121, `−4` ×1. The disagreement is
**systematic, not scatter** — and negative delta means the *stored* year is later than the
email implies.

The rule is therefore trustworthy to two decimal places for pre-graduation statuses and
unusable for graduated/inactive. See §6.

## 4. Applied — KALAIYARASI K → 2026

`480b8b1d-9930-43b9-9da1-7cd7367f1414`, `reserved`, roll and register both NULL.
Set to **2026** → `06882988-0cd3-4301-bb47-7b2d8d907b08` ("2026-2027").

Three independent signals:

| Signal | Value |
|---|---|
| `college_email` | `kalaiyarasik26ucc@jkkn.ac.in` → 2026; `ucc` matches her program, B.COM. COMPUTER APPLICATION |
| `academic_year` | 2026-2027 |
| **Her own fee-change event** (opened 2026-06-24) | `old_admission_year_id` = the 2026 UUID — the system had already recorded 2026 for her before it was cleared to NULL |

Her cohort (`reserved`) has 399/399 email agreement, so the primary signal is exact here.

### 4.1 Fee-trigger side effect — predicted, approved, and net-positive

Unlike all 68 AHS rows, she is `legacy_fee_mode = false`, `fees_confirmed = false`, with
**4 live bills**, so `trigger_detect_fee_dimension_change` fires rather than returning
early. She already had one `pending_review` event, so the trigger took its **update**
branch, not insert. Approved in advance on that basis.

| | before | after |
|---|---|---|
| event id | `33ef5ce5-5ffe-4d21-a76d-9979153a9087` | unchanged |
| status | `pending_review` | unchanged |
| created | 2026-06-24 | unchanged |
| `trigger_field` | `program_id` | **`admission_year_id`** |
| `new_fee_structure_id` | **NULL** | **`897cc009-4e70-4e5f-aa2a-706394396415`** |
| line count | 4 | 4 (deleted and re-inserted) |
| **total events table-wide** | 39 | **39** |

The `new_fee_structure_id` change is a repair, not damage. `admission_fee_structures` is
keyed partly on `admission_year_id`, so while hers was NULL **no fee structure could ever
match** — the case was open but unactionable. Filling the admission year let the lookup
resolve. Billing should be told the trigger reason was overwritten, but the case is now
more useful than before, not less.

## 5. Deliberately NOT applied — SALINI S

`8fdb23ca-9bd9-4ec8-9782-db2a620553af`, `graduated`, roll and register empty. Left NULL by
explicit decision.

| Evidence | Says |
|---|---|
| `college_email` = `salinis22uca@jkkn.ac.in` | **2022** |
| Her only 2 exact cohort-mates (graduated, `…22uca@`) | both stored **2023** |

She sits in the one population where the email rule collapses (15.5%), and the competing
cohort evidence is only n=2. Both signals are weak and they contradict. Writing either
value would produce a plausible-looking entry that later reads as authoritative, so the
gap was left visible instead. Zero fee impact either way (`legacy_fee_mode = true`, no
live bills), so this can be decided and applied at any time.

## 6. Separate finding — NOT acted on

**~272 graduated Arts and Science (Self) learners have stored admission years that
contradict their college email by a systematic −1 or −2 years** (§3). College emails are
minted once at admission and are provably exact for all 1,214 pre-graduation learners, so
the stored values are the likelier error — plausibly a historical backfill that used a
graduation-era year instead of the admission year.

This is a materially larger data-quality question than the gap this document addresses,
affects a different population, and needs a decision from someone who knows the
institution's history. Recorded here; not investigated further and not changed.

## 7. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Rows updated | 1 | 1 | pass |
| A&S (Self) `admission_year_id IS NULL` | 2 → 1 (SALINI, by decision) | 1 | pass |
| `admission_fee_change_events` total | 39 (update branch, not insert) | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Sheet re-diff | 781/781 already correct | unchanged | pass |

Pre-state, including the 4 fee-event lines before deletion, is retained in the session
scratchpad as `rollback-as-self-admission-year.json`.

## 8. Rollback

```sql
UPDATE learners_profiles
SET admission_year_id = NULL
WHERE id = '480b8b1d-9930-43b9-9da1-7cd7367f1414';
```

Note this re-fires the fee trigger and would rewrite the review case a second time. The
event's prior `trigger_field`, `new_fee_structure_id` and its 4 lines are captured in the
rollback file and would need restoring by hand.
