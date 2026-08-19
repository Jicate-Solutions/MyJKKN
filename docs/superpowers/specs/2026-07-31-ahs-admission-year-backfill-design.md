# Backfill missing admission years — JKKN College of Allied Health Sciences

**Date:** 2026-07-31
**Institution:** JKKN College of Allied Health Sciences — `9c1554e8-12a2-4b76-a9d6-8242bb05eba1`
**Scope:** `learners_profiles.admission_year_id` only. No other column is written.
**Environment:** production (`kvizhngldtiuufknvehv`) — single environment, no staging.

---

## 1. Why the uploaded sheet is not the mechanism

`active-learners-2026-07-28 (1).xlsx` was analysed in full (4,178 rows × 61 columns,
10 institutions). Its 241 AHS rows were matched by `ID*` against production:

| Bucket | Count |
|---|---|
| ID not found in `learners_profiles` | 0 |
| Row exists but institution ≠ AHS | 0 |
| Sheet year not resolvable in `admission_years` | 0 |
| Already correct (no-op) | **240** |
| Currently NULL → would set | **1** |
| Differs → would change | **0** |

The file is an **unedited export**. Applying it changes exactly one learner. It also
cannot reach the real problem: the export is filtered to `lifecycle_status = 'active'`,
and **67 of the 68 AHS learners missing an admission year are not active**.

The sheet is therefore used as *corroboration only*, not as the input.

## 2. The actual gap

AHS holds 389 learner profiles; 68 have `admission_year_id IS NULL`.

| lifecycle_status | count | roll prefix | derived year | in sheet? |
|---|---|---|---|---|
| graduated | 57 | `21…` | 2021 | no |
| inactive | 5 | `23…` | 2023 | no |
| inactive | 2 | `24…` | 2024 | no |
| exited | 2 | `24…` | 2024 | no |
| active | 1 | `24…` | 2024 | **yes** |
| inactive | 1 | *(roll empty)* | — | no |

## 3. Derivation rule and its evidence

**Primary — roll number prefix:** `admission_year = 2000 + roll_number[0:2]`.

Validated against the 240 AHS learners who already have both a roll number and an
admission year: **239 agree (99.58%)**. The single disagreement is listed in §7 and is
explicitly *not* modified by this work.

**Fallback — college email:** `college_email ~ '([0-9]{2})[a-z]+@jkkn.ac.in$'`.
Validated across 138 AHS learners: **134 agree (97.10%)**. Used for exactly one learner
(§6), and only with explicit sign-off, because it is the weaker signal.

**Resolution is institution-scoped.** `admission_years.institution_id` is `NOT NULL`, so
the derived year is resolved by joining on `(institution_id = AHS, year = derived)`.
AHS has exactly seven rows — 2020 through 2026, one per year, all `is_active` — so every
derived year resolves to exactly one UUID with no ambiguity:

| year | admission_year_id |
|---|---|
| 2021 | `b2c14529-9062-4e28-8950-853355c9ecf1` |
| 2023 | `872601e8-43e0-4c6e-b3c2-4b43bdaebf8f` |
| 2024 | `1cf7b11d-a477-45ea-abf1-dc11d28ca4f3` |

## 4. Trigger blast radius — measured, not assumed

Four triggers on `learners_profiles` can fire on this update. All four were read in full
and evaluated against the 68 target rows.

| Trigger | Fires on | Effect on this update |
|---|---|---|
| `trg_validate_learner_admission_year_scope` | `UPDATE OF admission_year_id` | **Passes.** Raises `check_violation` only if the admission year's institution differs from the learner's. Acts as a built-in guarantee that §3's scoping is correct — if the plan were wrong about institution scoping, this aborts the transaction rather than corrupting data. |
| `trg_validate_learner_semester_year_scope` | `UPDATE` (any column) | **No-op.** Every branch is gated on `TG_OP='INSERT' OR <field> IS DISTINCT FROM OLD.<field> OR institution_id IS DISTINCT FROM OLD.institution_id`. We change only `admission_year_id`, so degree / department / semester / academic_year branches are all skipped. Pre-existing inconsistencies on the 57 graduated learners cannot block the write. |
| `trg_detect_fee_dimension_change` | `UPDATE` (any column) | **Returns early.** This trigger lists `admission_year_id` as a fee dimension and would otherwise call `admission_resolve_fee_items_for_lead()` and insert `pending_review` rows into `admission_fee_change_events`. It exits on its *first* check, `NEW.legacy_fee_mode = true`. **All 68 target rows have `legacy_fee_mode = true`**, and 0 have non-superseded bills. Zero fee events created. |
| `trigger_set_learner_application_id_on_update` | `UPDATE` (any column) | **No-op.** Only mints an ID when `application_id` is null or empty; **0 of 68** qualify. |

This measurement is the reason the change is safe to run in one statement. If any target
row had `legacy_fee_mode = false`, this plan would not be valid as written.

## 5. Phase 1 — backfill the 67 roll-derivable learners

Applied via Supabase MCP (`execute_sql`). Derivation happens **inside** the statement, so
no UUID list is transcribed by hand and there is no opportunity for a copy error.

**Step 1.1 — capture rollback key.** Before writing, `SELECT id` for every AHS row with
`admission_year_id IS NULL` and save to a scratchpad file. Because every target is
currently NULL, rollback is total and lossless (§8).

**Step 1.2 — dry run.** The exact `SELECT` below, returning the 67 rows with
`derived_year` and `target_admission_year_id`, reviewed before any write.

**Step 1.3 — apply.**

```sql
UPDATE learners_profiles lp
SET admission_year_id = ay.id,
    updated_at        = now()
FROM admission_years ay
WHERE lp.institution_id     = '9c1554e8-12a2-4b76-a9d6-8242bb05eba1'
  AND lp.admission_year_id IS NULL                       -- idempotent: never overwrites
  AND lp.roll_number ~ '^[0-9]{2}'                       -- excludes KAVINEKA
  AND ay.institution_id     = lp.institution_id          -- institution-scoped resolution
  AND ay.year               = 2000 + substring(lp.roll_number from '^([0-9]{2})')::int;
```

Four independent guards: institution equality, the `IS NULL` predicate (making the
statement idempotent and incapable of overwriting an existing year), the roll-format
regex, and `ay.institution_id = lp.institution_id` inside the join.

**Expected result: exactly 67 rows.** Any other number aborts the plan and is investigated
before proceeding.

**Step 1.4 — verify.** Re-run the gap query; expect exactly 1 remaining (KAVINEKA), and
re-run the roll-vs-year mismatch check; expect it to still return only ANBUSELVAN P (§7) —
confirming the backfill introduced no new contradictions.

## 6. Phase 2 — KAVINEKA V (1 row, separate sign-off)

`dff31a55-5a3e-479d-b2c8-32c8cb944ad3` — inactive, `roll_number` and `register_number`
both empty, `college_email = kavinekav25mrs@jkkn.ac.in`, created 2026-03-08.

The email encodes `25` → **2025** (`20e993e2-bc79-409e-98cb-8defb886dea1`). This rests on
the 97.1% email rule, not the 99.6% roll rule, and the learner has no roll number to
corroborate it. Run as its own single-row statement **only on explicit approval**;
otherwise leave NULL and the gap closes at 67 of 68.

## 7. Explicitly out of scope — reported, not changed

1. **`ANBUSELVAN P`** (`0505e810-0790-4213-8b4a-28f272d2e49d`) — roll `25AECT01` implies
   2025, but DB *and* sheet both say **2023**. The two sources contradict each other and
   there is no third signal to break the tie. Requires a human decision on whether the roll
   number or the admission year is wrong. The Phase 1 `IS NULL` guard cannot touch this row.
2. **`date_of_birth` corruption.** The column is `text`, not `date`, and holds malformed
   values in production (`''`, `'31/05/5/2008'`, `'+039676-01-01'`). 210 such values appear
   sheet-wide, 1 within AHS. Pre-existing; unrelated to admission year.
3. **10 duplicated `ID*` values** in the workbook — all outside AHS (the AHS slice has 241
   distinct IDs, zero duplicates).
4. **Full-workbook re-upload is rejected as an approach.** `/api/learners/bulk-edit-exited`
   builds `sanitizedData` from every column present (`route.ts:292-351`), so uploading the
   61-column sheet would rewrite all fields on all 4,178 rows — including the corrupted DOB
   strings — and still would not reach the 67 non-active learners.

## 8. Rollback

Every target row is `NULL` before the change, so reversal is exact:

```sql
UPDATE learners_profiles
SET admission_year_id = NULL
WHERE id = ANY($1);   -- the ids captured in step 1.1
```

No other column is written except `updated_at`, which is bumped deliberately for
auditability (no trigger maintains it on this table).

## 9. Success criteria

- AHS learners with `admission_year_id IS NULL` drops from **68 → 1** (or **→ 0** if §6 is approved).
- Phase 1 reports exactly **67** rows updated.
- `admission_year_id` unchanged for all 321 AHS learners that already had one.
- Zero new rows in `admission_fee_change_events`.
- Roll-vs-admission-year mismatches across AHS remain at exactly 1 (ANBUSELVAN P).

---

## 10. Outcome — applied 2026-07-31

Phase 1 approved and executed. Phase 2 (§6, KAVINEKA V) **not** approved; left NULL.

Rows updated, by derived year and lifecycle status:

| derived year | status | rows |
|---|---|---|
| 2021 | graduated | 57 |
| 2023 | inactive | 5 |
| 2024 | active | 1 |
| 2024 | exited | 2 |
| 2024 | inactive | 2 |
| | **total** | **67** |

Verification, every criterion from §9:

| Criterion | Expected | Actual | |
|---|---|---|---|
| Rows updated | 67 | 67 | pass |
| AHS `admission_year_id IS NULL` | 68 → 1 | 1 | pass |
| AHS populated | 388 | 388 | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Roll-vs-year mismatches | 1 (ANBUSELVAN P only) | 1 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |

**Independent oracle.** The uploaded workbook was re-diffed against production after the
write. Its 241 AHS rows moved from *240 already-correct + 1 NULL* to **241/241
already-correct, 0 differing** — confirming both that the one active learner in the sheet
(SOUMIYA S, `24AECT09`) received the correct value and that the other 240 were untouched.

Pre-state rollback key (all 68 ids, each NULL at capture time) is retained in the session
scratchpad as `rollback-ahs-admission-year.json`.

## 11. Phase 2 outcome — applied 2026-07-31 (same day)

§6 subsequently approved. **KAVINEKA V** (`dff31a55-5a3e-479d-b2c8-32c8cb944ad3`) set to
**2025** → `20e993e2-bc79-409e-98cb-8defb886dea1` ("2025-2026").

Before writing, the §6 concern — that 2025 rested only on the 97.1% email rule with nothing
to corroborate it — was resolved. Three independent signals agree:

| Signal | Value | Implies |
|---|---|---|
| `college_email` | `kavinekav25mrs@jkkn.ac.in` | 2025; the `mrs` segment matches her actual program **BSC (MRS)**, confirming the encoding is parsed correctly for *this* row rather than merely applied statistically |
| `academic_year_id` | `2025-2026` (AHS-scoped) | consistent |
| `semester_id` | `MRS-YEAR-1`, "1 Year", `semester_order = 1` | a 1st year in 2025-2026 was admitted in 2025 |

The semester + academic-year pair is an arithmetic derivation independent of the email
convention entirely, so the row-level evidence is materially stronger than the
population-level rule §6 was hedging against.

Applied with the same four guards as §5 (id + institution equality + `IS NULL` + scoped
`ay.institution_id = lp.institution_id`). Final verification:

| Criterion | Expected | Actual | |
|---|---|---|---|
| AHS `admission_year_id IS NULL` | **0** | 0 | pass |
| AHS populated | 389 of 389 | 389 | pass |
| `admission_fee_change_events` | 39, unchanged | 39 | pass |
| Cross-institution FK leaks | 0 | 0 | pass |
| Roll-vs-year mismatches | 1 (ANBUSELVAN P only) | 1 | pass |

**Gap fully closed: 68 → 0.** Rollback for this row is included in the same
`rollback-ahs-admission-year.json` key.

**Still open:** §7.1 only — the ANBUSELVAN P roll/year contradiction, which needs a human
decision and is not a backfill.
