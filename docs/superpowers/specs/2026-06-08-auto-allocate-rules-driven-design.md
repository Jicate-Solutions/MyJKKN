# Rules-Driven Auto-Allocation (Campus Living) — Design Spec

**Date:** 2026-06-08
**Author:** Boobalan (with Claude)
**Module:** Campus Living → Allocations → Auto-Allocate
**Status:** Design — awaiting plan

> Supersedes the single-target-category model from
> [the validation-preview spec](./2026-06-08-campus-living-auto-allocation-validation-preview-design.md).
> The operator no longer picks a category; each learner is placed into **their own**
> Category-Eligibility-resolved room category, and their mess category is assigned from the rules.

---

## 1. Problem

Auto-Allocate is "fill one chosen category": the operator picks Type → Block → **Category** →
Hostel Year, and the run fills that one category. But the room **and** mess category a learner may
take is already fully determined by the Category Eligibility rules (`fn_hostel_learner_room_categories`
/ `fn_hostel_learner_mess_categories`). Picking a category manually is redundant and can contradict the
rules. The operator wants a **rules-driven sweep**: no category input — each learner goes to the category
the rules resolve for them.

## 2. Locked decisions (stakeholder, 2026-06-08)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Category input | **Removed.** No Category selector on the page; no `p_category_id` on the RPCs. |
| 2 | No-rule fallback | **Strict rules-only.** A learner whose `fn_hostel_learner_room_categories` returns nothing is **skipped** (no saved-category fallback). |
| 3 | Mess | **Assigned from rules.** On placement, set `learners_profiles.mess_category_id = first(fn_hostel_learner_mess_categories(learner))`. |
| 4 | Require-bill toggle | **Removed.** Strict rules-only subsumes it — the resolver already needs an academic year + current-year bill + a matching rule to return a category. |
| 5 | Multi-category | Place into the **first** resolved room category (by the resolver's order, `array_position`) that has a free, rule-covered, gender-matched, strictly-eligible bed in the block. |
| 6 | Gender | Enforced per **resolved room category's** `type` (boys/girls) vs the learner's gender (the block no longer has a single chosen category to gate on). |
| 7 | Preview = generate | The per-learner preview keeps the same cohort + bed logic as generate, minus the actual writes. |

Out of scope: the fee-band → category rules themselves, the residents bill-generation flow, and any
change to mess *bookings* (daily meals) — only the learner's mess **category** field is set.

> **Follow-up (2026-06-09, migration `20260609120000_auto_allocate_fail_open_physical_rooms_institution_order`):**
> The CATEGORY strictness above (decisions #2/#3/#5) is **unchanged**. Two separate axes changed:
> (a) the **physical-room** gate flipped fail-closed → **fail-open** — a room covered by an active
> physical-room rule stays restricted to matching learners; a room with **no** covering rule is open to
> every eligible learner of a block-served institution. The generator's "block needs rules" hard error and
> the page's "set rules first" guard were removed. (b) The generator cohort now fills in
> **institution-priority order** (`is_primary` institution first, then institution name, then learner A→Z),
> so earlier institutions get first pick of shared/no-rule rooms.

## 3. Behaviour

**Cohort** (both preview & generate): hostellers (`accommodation_type='hostel'`) in the block's served
institutions. **Generate additionally requires** `fn_hostel_learner_room_categories(learner)` to be
non-empty (strict). Preview shows the *whole* cohort with per-learner verdicts so skips are explained.

**Per learner (generate):**
1. `roomCats = fn_hostel_learner_room_categories(learner)`; empty → skip.
2. Find the first available bed in a `room_purpose='student'` room whose `category_id = ANY(roomCats)`,
   that is rule-covered (`fn_room_serves_institution` + the block's physical-room rule), gender-matched
   (category type vs learner gender), and `fn_learner_strictly_eligible_for_room`. Order by
   `array_position(roomCats, category_id)`, floor, room, bed. None → skip.
3. Insert the `hostel_allocations` row (`pending_approval`, same shape as today).
4. `mess_category_id := first(fn_hostel_learner_mess_categories(learner))`; if non-null,
   `UPDATE learners_profiles SET mess_category_id = … WHERE id = learner`.

**Expected today:** with 0 tagged current-year bills, the room resolver returns nothing for everyone →
**Generate places 0**, and the preview shows every learner "out — no current-year bill / no rule-resolved
category." Correct for strict mode; the unlock is the residents → Generate-bills flow.

## 4. Function contracts (names kept; "classic" is legacy)

- `fn_auto_allocate_classic(p_block_id uuid, p_hostel_year_id uuid) → uuid`
  Drops `p_category_id`, `p_require_bill`. Strict rules-only sweep + mess assignment (above). Batch row
  is inserted with `category_id = NULL`.
- `fn_auto_allocate_candidates(p_block_id uuid) → TABLE(...)`
  Drops `p_category_id`, `p_require_bill`. Per-learner verdict, **new columns**
  `resolved_room_category_id/name`, `resolved_mess_category_id/name`, `bed_available`; **dropped**
  `fee_category_match`. Verdict priority (strict): academic year set → current-year bill →
  rule-resolved room category → has profile → gender → not already allocated → physical-room rule →
  rule-covered bed free → **in**.
- `fn_auto_allocate_preview(p_block_id uuid) → TABLE(...)`
  Drops `p_category_id`. `available_beds` = all rule-covered free student beds in the block (any
  category). Used only for the summary "available beds".

**Schema:** `ALTER TABLE hostel_allocation_batches ALTER COLUMN category_id DROP NOT NULL` (rules-driven
batches span categories). The batch list/detail already read `category:hostel_categories(name)` null-safe
(`?? null`); a null category renders "—".

**SQL hygiene:** `SECURITY DEFINER`, `REVOKE EXECUTE … FROM anon, PUBLIC` + `GRANT … TO authenticated`,
mirror all three into `supabase/setup/02_functions.sql`.

## 5. Front-end

- `auto/page.tsx`: remove the **Category** `Select` and the **Require current-year bill** `Switch`;
  remove `useAutoCategories` usage and the `categoryId`/`requireBill` state. Keep **Type** (filters the
  block list only), **Block**, **Hostel Year**. Title → "Auto-Allocate" (drop "(Classic)"); update the
  intro copy to describe rules-driven placement. Preview calls `previewCandidates(blockId)`; Generate
  calls `generate(blockId, hostelYearId)`.
- `CandidateValidationTable`: replace the single "Category" provenance cell with two columns —
  **Room category** (`resolved_room_category_name`) and **Mess category** (`resolved_mess_category_name`);
  keep the bill 4-state badge and the verdict column.
- `types/allocation-batch.ts`: `AllocationCandidate` gains the 4 resolved-category fields + `bed_available`;
  drops `fee_category_match`/`fee_resolved` (or keeps them unused — prefer removing).
- `AllocationBatchService`: `preview(blockId)`, `previewCandidates(blockId)`, `generate(blockId, hostelYearId)`.
- `use-allocation-batches.ts`: `generate(blockId, hostelYearId)`.

## 6. Verification

No test runner. (a) `mcp__ide__getDiagnostics` clean on touched TS files. (b) Live SQL: run
`fn_auto_allocate_candidates(<block>)` — expect the cohort with `verdict='out'` reasons led by
"no current-year bill / no rule-resolved category" and **0 `in`** today; confirm
`resolved_room_category_name`/`resolved_mess_category_name` populate for any learner with tagged bills.
(c) Reversible browser pass: Generate → inspect batch (category shows "—", learners placed into their own
categories, mess_category_id set) → reset.

## 7. Out of scope

Renaming the functions away from "classic"; mess bookings/daily meals; the Category-Eligibility config
UI; bill tagging/backfill.
