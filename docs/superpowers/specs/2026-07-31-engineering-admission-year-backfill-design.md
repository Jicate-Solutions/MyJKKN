# Admission years — JKKN College of Engineering and Technology

**Date:** 2026-07-31
**Institution:** JKKN College of Engineering and Technology — `5de4fba1-4564-41ed-8c73-5d948b74b843`
**Methodology:** as [AHS](./2026-07-31-ahs-admission-year-backfill-design.md) and
[Arts & Science (Self)](./2026-07-31-arts-science-self-admission-year-backfill-design.md).
Two pieces of work here: a **correction** to existing data and a **backfill** of gaps.

---

## 1. The sheet had nothing to apply — for any institution

The request was to "update the existing admission year and also fill the gap" from
`active-learners-2026-07-28 (1).xlsx`. The sheet cannot do the first part: all 786
Engineering rows already matched production exactly (0 differing, 0 NULL).

The file *was* edited mid-session (1,814,883 bytes at 10:13 → 1,814,818 at 11:06) and
re-read. A full diff of all 4,178 rows across all 10 institutions found **five** changed
cells, all in **Nattraja Vidhyalya CBSE**, all now reading `0` against a stored 2026, and
all resolving to `(NO LOOKUP ROW)` — there is no year-0 `admission_years` record. Those are
cleared cells that Excel serialised as zero, not usable corrections. Every other
institution round-trips at 100% already-correct.

**Conclusion carried forward:** this export is not a correction channel. Treat it as a
verification oracle only.

## 2. Roll-number format is institution-specific — the earlier regex was wrong

AHS rolls are digits-first (`24AECT09`). Engineering uses **both** forms:

| form | example | note |
|---|---|---|
| letters-then-year | `EC21002`, `MBA23002`, `EM25027` | dominant |
| year-then-letters | `24MBA21`, `25ME001`, `22CS019` | also present |

`^[0-9]{2}` therefore matched 0 of the 83 graduated gap rows and made the roll rule look
useless (11/60 agreement on active learners). The correct pattern for this institution is
**`^[A-Za-z]*([0-9]{2})`** — zero-or-more letters — which covers both forms and measured
**724/725 = 99.86%** agreement on active learners.

### 2.1 Roll strings that are not roll numbers

Three classes of value live in `roll_number` and encode no admission year:

| class | example | rows | derives | outcome |
|---|---|---|---|---|
| Anna Univ. 12-digit register numbers | `731323106303` | 53 | "2073" | no lookup row → skipped |
| lateral-entry short numerics | `1423`, `1329`, `1289` | 12 | 2012-2014 | no lookup row → skipped |
| roll renumbering | `24ME001` stored as 2025 | 2 | 2024 | pre-existing, untouched |

**These self-protect because resolution is a JOIN to `admission_years`, not a computation.**
Deriving `2000 + digits` and writing it would have put 2073 into 53 rows. Making the
lookup row's existence the validity test is what prevents that — the same structural
choice used at AHS and Arts & Science.

## 3. Part A — the `2002-2003` row was a typo for `2022-2023`

`admission_years` row `62872055-4d0e-48be-838d-59b75b9c7fff`, year 2002, sat alone among
2020-2026 with **43 learners** linked to it. Evidence it is a mistyped 2022:

- all 43 are `graduated`; a genuine 2002 engineering cohort graduated in 2006
- **all 43** roll numbers match `^[A-Za-z]*22` (`22CS019`, `ES22047`) — unanimous
- sample email `dhanushkacse2022@jkkn.ac.in` → 2022
- created `2026-05-02`, the same batch as the 2022/2023/2024/2025 rows — one got mistyped
- it produced the entire `+20` delta spike (41 rows) that made the roll rule appear to be
  only 50.6% reliable for graduated learners

`admission_years` has `UNIQUE (institution_id, year)` and a real `2022-2023` row already
exists (`082bfe50-…`, 85 learners), so the bogus row **cannot** be renumbered. The 43
learners were repointed instead, then the empty row deactivated.

Reference check before deactivating — seven tables FK to `admission_years`; only
`learners_profiles` held this id:

| table | rows holding the bogus id |
|---|---|
| `learners_profiles` | 43 |
| `accreditation_iiqa_snapshots`, `admission_campaigns`, `admission_fee_structures`, `admission_historical_pivot`, `admission_leads`, `admission_packages` | **0** |

All 43 are `legacy_fee_mode = true` with 0 live bills → no fee events (see the AHS doc §4
for the trigger analysis, which was re-measured and holds here).

## 4. Part B — backfill 126 of 133 gaps

133 learners had `admission_year_id IS NULL`: graduated 83, inactive 47, approved 2,
exited 1. None appear in the sheet (it is `lifecycle_status = 'active'` only).

Derived with `^[A-Za-z]*([0-9]{2})` and resolved by join. **Semester arithmetic
independently corroborates the entire graduated set**: `EC21002` is Semester VIII in
2025-2026 (4-year BE, 2021+4 = 2025 ✓) and `MBA23002` is Semester IV (2-year MBA,
2023+2 = 2025 ✓).

| derived year | status | rows |
|---|---|---|
| 2021 | graduated | 62 |
| 2022 | inactive | 3 |
| 2023 | graduated | 21 |
| 2023 | inactive | 17 |
| 2023 | exited | 1 |
| 2024 | inactive | 17 |
| 2025 | inactive | 5 |
| | **total** | **126** |

**Not filled — 7 rows.** 5 with unusable roll strings (§2.1) that the join skipped
automatically, and 2 `approved` learners with no roll number, no email year, and no
academic year. These need human input.

### Execution order

Part A → deactivate the 2002 row → Part B. Deactivating *before* the backfill let Part B
carry an `ay.is_active` predicate, so it was structurally incapable of relinking anyone to
the bogus row.

## 5. Verification

| Criterion | Expected | Actual | |
|---|---|---|---|
| Part A rows repointed | 43 | 43 | pass |
| Part B rows filled | 126 | 126 | pass |
| Engineering `admission_year_id IS NULL` | 133 → 7 | 7 | pass |
| Learners still on the 2002 row | 0 | 0 | pass |
| 2002 row `is_active` | false | false | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Sheet re-diff (786 active) | 786/786 correct, 0 differing | unchanged | pass |

**Independent cross-signal check.** Of the rows written, 90 carry a parseable 4-digit
email year. **All 90 confirm the roll-derived value; 0 contradict.**

Cohort distribution after:

| year | active | learners (before → after) |
|---|---|---|
| 2002 | **false** | 43 → **0** |
| 2020 | true | 0 → 0 |
| 2021 | true | 0 → **62** |
| 2022 | true | 85 → **131** (+43 repointed, +3 filled) |
| 2023 | true | 154 → **193** |
| 2024 | true | 260 → **277** |
| 2025 | true | 454 → **459** |
| 2026 | true | 314 → 314 |

Graduated roll-agreement rose **50.6% → 93.01%**; the residual is the register-number and
lateral-entry classes of §2.1, which encode no year.

## 6. Rollback

Pre-state for both parts is in the scratchpad as `rollback-engineering.json` (all 43
repointed rows with their original `admission_year_id`, all 133 gap rows, and the 2002 row
before deactivation).

```sql
-- Part A
UPDATE learners_profiles SET admission_year_id = '62872055-4d0e-48be-838d-59b75b9c7fff'
WHERE id = ANY($1);                      -- the 43 ids
UPDATE admission_years SET is_active = true
WHERE id = '62872055-4d0e-48be-838d-59b75b9c7fff';
-- Part B
UPDATE learners_profiles SET admission_year_id = NULL WHERE id = ANY($2);   -- the 126 ids
```

## 7. Part C — the final 7, resolved individually

The 7 rows §4 could not derive were each resolved from a different signal. Applied
2026-07-31 with the same guards (institution pinned, `IS NULL`, year resolved by join to
an **active** lookup row). All 7 are `legacy_fee_mode = true` → no fee events.

| learner | roll | status | set to | evidence | confidence |
|---|---|---|---|---|---|
| FAISAL K A | `1174.` | inactive | **2024** | cohort match, below | high |
| SARCHIKUMAR K | `1479` | inactive | **2024** | cohort match, below | high |
| SURESHKANNAN C | `1489` | inactive | **2024** | cohort match, below | high |
| HARIPRIYAN.M | `731322106301` | inactive | **2023** | email `…mle2023ece@` — lateral-entry marker `le2023` | high |
| POOMANI | `731323106302` | inactive | **2024** | email `…r24lece@` — lateral marker `24l` | high |
| MUTHAZHAHAN D | — | approved | **2025** | December-2025 intake batch only | medium |
| SARANYA P | — | approved | **2025** | December-2025 intake batch only | medium |

### 7.1 The three short-numeric rolls were a lateral-entry cohort, not year-3 regulars

`1174.` / `1479` / `1489` sit numerically **inside** the roll series 1289–1496, which is a
single B.E. EEE lateral-entry cohort: 12 learners, all with `…24leee@` emails, **all stored
as 2024**, all Semester VII in 2026-2027.

The three NULL rows show Semester V in 2025-2026 — one academic year earlier — because they
went `inactive` and their record froze, while the cohort progressed (2025-26 = sem 5/6,
2026-27 = sem 7/8). Same cohort, different snapshot.

An earlier reading of "Semester V in 2025-2026 → year 3 → admitted 2023" was **wrong**: it
assumed regular 4-year entry, but this cohort entered laterally into year 2. **Comparing
against the actual cohort beat arithmetic from assumptions** — the general lesson from this
institution.

### 7.2 Lateral-entry markers in `college_email`

Two forms, both validated against learners who already had an admission year:

| marker | example | resolves to | agreement |
|---|---|---|---|
| `le<yyyy>` | `sakthivele2022mech@` | 2022 | `le2022`→2022, `le2024`→2024 |
| `<yy>l<branch>` | `baburajj24leee@` | 2024 | 29 of 32 |

These learners' `roll_number` holds an Anna University register number whose embedded year
is the **base cohort they joined into**, not their own admission year — which is why the
register number and the email disagree, and why the email wins for lateral entrants.

## 8. Final state

| Criterion | Result |
|---|---|
| Engineering `admission_year_id IS NULL` | **133 → 0** |
| Learners on the bogus 2002 row | 0 |
| Learners linked to any inactive admission year | 0 |
| `admission_fee_change_events` | 39, unchanged throughout |
| Cross-institution FK leaks | 0 |
| Sheet oracle (786 active) | 786/786 correct, 0 differing |

Total written at this institution: **43 repointed + 126 backfilled + 7 individually
resolved = 176 rows.**

## 9. Open items

1. **2 active learners** whose roll (`24ME001`) contradicts their stored year (2025); their
   email agrees with the stored value, so the roll is the likely error. Not changed.
2. **The 2 `approved` MBA records** (MUTHAZHAHAN D, SARANYA P) were set to 2025 on batch
   evidence alone — no roll, register number, college email, academic year or semester
   exists for either. Worth a confirmation from the MBA admissions team; both are
   pre-enrolment records with no fee or academic impact, so a correction is cheap.
3. **The `roll_number` column mixes three different kinds of identifier** — roll numbers,
   university register numbers, and lateral-entry serials. Any future logic keying on it
   needs the same lookup-join guard used here.
