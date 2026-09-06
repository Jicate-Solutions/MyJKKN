# Auto-Allocation Validation Preview (Campus Living) — Design Spec

**Date:** 2026-06-08
**Author:** Boobalan (with Claude)
**Module:** Campus Living → Allocations → Auto-Allocate
**Status:** Design — awaiting plan

> Builds on [Fee-aware Program Eligibility](./2026-06-06-campus-living-fee-aware-program-eligibility-design.md)
> and the rules-driven auto-allocation fix (migration `20260607120000_auto_allocate_rules_driven_cohort.sql`).
> Adds a **per-learner validation preview** with a **mandatory academic-year + bill prerequisite gate** in
> front of the existing eligibility conditions.

---

## 1. Problem

The Auto-Allocate page (`app/(routes)/campus-living/allocations/auto/page.tsx`) currently runs
`fn_auto_allocate_preview`, which returns **only four aggregate numbers** (eligible cohort, available
beds, no-profile, already-allocated). It does **not** show, per learner, *which conditions passed/failed*
or *whether the fee-based condition could even be evaluated*.

The operator configured fee-band Category Eligibility rules (Program Eligibility → Category Eligibility),
expecting auto-allocation to place students by their current-academic-year fee. **It silently does nothing
fee-aware** — and there was no way to see why.

### Root cause (verified against live DB, 2026-06-08)

The fee chain is `fn_hostel_learner_room_categories → fn_learner_current_year_academic_fee →
fn_hostel_effective_room_categories`. The fee fn sums academic bills where
**`bill.academic_year_id = learners_profiles.academic_year_id`** (exact-UUID equality). When that sum is
NULL the resolver returns nothing and auto-allocation **fail-opens** to the stored `hostel_category_id`.

| Metric | Value |
|---|---|
| Hostellers | **912** |
| …with `academic_year_id` set on profile | 849 (⇒ **63 have none**) |
| …with any academic bill | 311 |
| **…with a bill tagged to their current academic year (pass the fee gate today)** | **0** |
| Academic bills with `academic_year_id` populated | **1 of 5,857** |
| `hostel_program_eligibility` rules | 1 row / 1 institution |
| `hostel_room_eligibility_rules` (active) | 1 / 1 institution |

Two stacked data problems make the gate inert (both stay **out of scope** to *fix* here — the preview
only *exposes* them):

1. **Bills are not year-tagged** — 1/5,857 academic bills carry `academic_year_id`.
2. **`academic_years` is duplicated** — "2025-2026" exists as *many distinct UUIDs* (plus a trailing-space
   `"2025-2026 "` and `"… Additional 3/4"` variants); 2026-2027 likewise. Matching is exact-UUID and has
   **no normalization/validation**, so a bill tagged to one "2025-2026" row will not match a profile that
   points at a *different* "2025-2026" row.

---

## 2. Locked decisions (stakeholder, 2026-06-08)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope | **Preview + diagnostics only.** Bill tagging / academic-year de-duplication are *exposed* but **not** rewritten here (separate follow-up). |
| 2 | Academic year on profile | **Mandatory hard prerequisite.** A hosteller with `academic_year_id IS NULL` is reported OUT with *"Academic year not set"* and **no further conditions are evaluated**. |
| 3 | Current-year bill | **Mandatory prerequisite**, governed by a **"Require current-year bill" toggle (default ON)**. ON ⇒ a matching current-year academic bill is required; OFF ⇒ Stage 0 is skipped and behavior reverts to today's fail-open (escape hatch while bills are being tagged). |
| 4 | Evaluation order | **Two-stage, short-circuit.** Stage 0 (academic year → bill) is checked first; only learners who pass Stage 0 have Stage 1 (gender, profile, not-allocated, physical-room rule, fee-band category) evaluated. The **first** blocking reason in priority order is reported. |
| 5 | Preview rows | **All candidates + per-condition verdict.** Every candidate for the selected block/category, each with pass/fail per condition and a final In/Out + reason. |
| 6 | Bill indicator | **4 states:** ✅ Matched · 🟠 Different year (bill tagged to another `academic_year_id` — show both year names) · ⚠️ Untagged (`academic_year_id` NULL) · ❌ None. |
| 7 | Preview = generate | The generator (`fn_auto_allocate_classic`) enforces the **identical** Stage-0 gate, so the preview never drifts from what is allocated. |
| 8 | "Current academic year" | = the learner's own `learners_profiles.academic_year_id` (there is **no** global `is_current` flag on `academic_years`). Unchanged from the existing resolver semantics. |

Out of scope: tagging/backfilling existing bills, de-duplicating `academic_years`, and mess-category
auto-allocation.

---

## 3. Candidate universe & two-stage validation

**Candidate universe** (unchanged from `fn_auto_allocate_classic`'s `targeted` CTE): hostellers
(`accommodation_type='hostel'`) in the block's served institutions
(`hostel_block_institutions`) whose **fee-resolved OR stored** category equals the selected target
category — `COALESCE(p_category_id = ANY(fee_aware_cats), hostel_category_id = p_category_id)`.

**Stage 0 — Mandatory prerequisites (when toggle ON):** evaluated first; on failure, STOP.

1. **Academic year set** — `learners_profiles.academic_year_id IS NOT NULL`.
   Fail ⇒ OUT, reason *"Academic year not set on student profile."*
2. **Current-year bill generated** — `fn_learner_current_year_academic_fee(learner) IS NOT NULL`.
   Fail ⇒ OUT, reason names the sub-state: *"No academic bill"* / *"Bills exist but not year-tagged"* /
   *"Bill tagged to a different academic-year row."*

When the toggle is **OFF**, Stage 0 is skipped and the fee dimension reverts to today's fail-open.

**Stage 1 — Eligibility conditions (only if Stage 0 passes):**
`has_profile` · `gender_ok` · `not_allocated` · `physical_rule_ok` · `fee_category_match`.
All pass ⇒ **IN**; first failure ⇒ OUT with that reason.

```
Candidate
  │ Stage 0 (toggle ON)
  ├─ academic_year_id NULL? ──────────────► OUT "Academic year not set"     (stop)
  ├─ current-year bill NULL? ─────────────► OUT "No bill for academic year…" (stop)
  │ Stage 1
  ├─ no login profile? ───────────────────► OUT "No login profile"
  ├─ gender mismatch? ────────────────────► OUT "Gender mismatch"
  ├─ already allocated? ──────────────────► OUT "Already allocated"
  ├─ no physical-room rule match? ────────► OUT "No physical-room rule"
  ├─ target category not in eligibility? ─► OUT "Category not eligible"
  └─ else ────────────────────────────────► IN
```

### Expected result today (proves the root cause)

| Stage-0 outcome | Hostellers | Operator sees |
|---|---|---|
| ❌ No academic year | 63 | "Academic year needed" |
| ❌ Academic year set, no matching bill | 849 | "No bill generated for academic year …" |
| ✅ Reach Stage 1 | **0** | — |

---

## 4. Architecture

Standard 4-layer path; one new RPC, one altered RPC, no new tables.

```
auto/page.tsx
  └─ AllocationBatchService.previewCandidates(blockId, categoryId, requireBill)
       └─ fn_auto_allocate_candidates(p_block_id, p_category_id, p_require_bill)   ← NEW
  └─ AllocationBatchService.generate(blockId, categoryId, hostelYearId, requireBill)
       └─ fn_auto_allocate_classic(p_block_id, p_category_id, p_hostel_year_id, p_require_bill)  ← ALTERED
```

### 4.1 `fn_auto_allocate_candidates` (NEW) — `SECURITY DEFINER`, `STABLE`

Returns one row per candidate:

| Column | Meaning |
|---|---|
| `learner_id` uuid | profile id of the learner |
| `full_name`, `email` | display (name falls back to email) |
| `program_name` | learner program |
| `gender` text | normalized for display |
| `has_profile` bool | login `profiles` row exists |
| `gender_ok` bool | matches block/category gender |
| `not_allocated` bool | not in active/pending allocation |
| `physical_rule_ok` bool | matches an active physical-room rule with rooms in the target category |
| `academic_year_id` uuid, `academic_year_name` text | learner's profile year |
| `academic_bill_count` int, `current_year_bill_count` int | drive the 4-state indicator |
| `bill_other_year_name` text | when bills are tagged to a different year, its name (for 🟠) |
| `current_year_fee` numeric | `fn_learner_current_year_academic_fee` (NULL ⇒ no matching bill) |
| `fee_resolved` bool | fee rule applied (vs. fail-open to stored category) |
| `fee_category_match` bool | target category ∈ fee-resolved categories |
| `bill_state` text | `matched` / `different_year` / `untagged` / `none` |
| `stage` text | `prerequisite` / `eligibility` / `ok` |
| `verdict` text | `in` / `out` |
| `exclusion_reason` text | first blocking reason (NULL when `in`) |

The cohort/`targeted` logic and gender/rule/bed checks are **copied verbatim** from
`fn_auto_allocate_classic` so the two never diverge. `p_require_bill` toggles Stage 0.

### 4.2 `fn_auto_allocate_classic` (ALTERED)

Add trailing param `p_require_bill boolean DEFAULT true`. When true, the cohort additionally requires
`academic_year_id IS NOT NULL` AND `fn_learner_current_year_academic_fee(lp.id) IS NOT NULL`. The
`DEFAULT true` keeps the existing 3-arg signature callable; the service is updated to pass 4 args.

### 4.3 `fn_auto_allocate_preview`

No longer called by the page (the candidate fn supersedes it; summary stats are derived client-side from
the returned rows). Left in place for backward-compatibility; **not** modified.

### 4.4 SQL hygiene

- `SECURITY DEFINER`, `SET search_path = public`.
- Gate inside the candidate fn: `is_super_admin()` OR `user_has_permission('campus_living.allocations.view')`
  OR `user_has_permission('campus_living.allocations.create')` (returns no rows otherwise).
- `REVOKE EXECUTE ... FROM anon, PUBLIC;` then `GRANT EXECUTE ... TO authenticated;` (anon-not-PUBLIC rule).
- **Mirror all three auto-allocate functions into `supabase/setup/02_functions.sql`** (they were never
  mirrored — known gap).

---

## 5. UI — `auto/page.tsx`

- A **"Require current-year bill" `Switch`** (default ON), passed to both `previewCandidates` and `generate`.
- **Summary cards** derived from rows: *Eligible · Available beds · Will place (min) · Excluded · Bill-ready (X/N)*.
- A **per-learner verdict table**: Name · Program · Gender · Profile · Not-allocated · Physical rule ·
  Fee / category · **Bill (current yr)** · **Verdict**.
  - Stage-0 failures show the prerequisite cells red and Stage-1 cells **"— not checked"** (greyed).
  - The Bill cell renders the 4 states: ✅ *Matched (₹fee)* · 🟠 *Different year (profile: A · bill: B)* ·
    ⚠️ *Untagged* · ❌ *None*.
- A **banner when Bill-ready = 0**: *"No hosteller has a current-year bill tagged — the fee condition is
  inactive; allocation falls back to saved categories,"* linking to the Campus-Living bill generation page
  (`/campus-living/residents?tab=generate`).
- Existing block-missing-rules alert and gender/block/category/year selectors are unchanged.

---

## 6. Plumbing

- `types/allocation-batch.ts` — add `AllocationCandidate` (mirrors §4.1) and a `BillState` union.
- `lib/services/campus-living/allocation-batch-service.ts` — add `previewCandidates()`; extend `generate()`
  to pass `p_require_bill`.
- `hooks/campus-living/use-allocation-batches.ts` — thread `requireBill` through the `generate` action.

No route, permission-catalog, or `types/supabase.ts` table changes (RPCs are wrapped loosely via the
existing `rpcCall` helper). The `check:*` build gates are therefore not triggered.

---

## 7. Verification

No test runner exists. "Done" =

1. `mcp__ide__getDiagnostics` clean on the 4 touched TS files.
2. `fn_auto_allocate_candidates` run via SQL for the configured institution returns the expected shape:
   63 rows ❌ *Academic year not set*, the rest ❌ *No bill…*, **0** reaching Stage 1.
3. Browser: toggle **ON** excludes no-bill students with the right reason; toggle **OFF** falls back to
   today's fail-open cohort; the Bill-ready=0 banner renders.
4. `fn_auto_allocate_classic` with `p_require_bill=true` generates an empty/abbreviated batch matching the
   preview's "Will place" count (reversible — reset the batch after).

---

## 8. Out of scope (explicit)

- Backfilling / tagging existing academic bills with `academic_year_id`.
- De-duplicating / normalizing the `academic_years` table.
- Mess-category auto-allocation.
- Any change to the fee-band resolver math or the Category Eligibility config UI.
