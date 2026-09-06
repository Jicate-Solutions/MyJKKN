# Campus Living — Room Allocation System (Design & Roadmap)

**Status:** ✅ COMPLETE — P0 foundations · P1 physical-room eligibility · P2 auto-allocation (Classic) + warden batch approval · P3 manual self-selection (premium) + individual warden approval. **Date:** 2026-05-31.
**Working mode:** direct commits to `main`, one commit per phase, verify before next.

## Goal

Two allocation modes plus a physical-room eligibility layer:

1. **Auto allocation (Classic category):** admin selects a batch of Classic learners → system auto-assigns them to *eligible* Classic rooms/beds in **alphabetical order by learner name** → **warden reviews & approves the batch** → committed.
2. **Manual self-selection (Premium / Deluxe / Premium Plus):** learner self-selects a category in **My Hostel** ("category update") and picks an *eligibility-filtered* room → **warden approves** → assigned.
3. **Physical-room eligibility (both modes):** per **block + floor + room-set**, gated by **Institution → Degree → Department → Program → Semester**. A room covered by a rule admits only matching learners (fail-closed); uncovered rooms stay open.

## Key investigation findings (2026-05-31, 5-agent sweep)

- **Greenfield data:** `hostel_allocations` = 0, `hostel_beds` = 0, `hostel_waitlist` = 0, all premium tables = 0. 207 rooms, 130 residents, 5,625 learners.
- **Three conflicting tier taxonomies:** `hostel_categories`/`category_id` (Classic/Deluxe/Premium/Premium Plus, *unreliable data*), `hostel_rooms.tier_access` (classic/deluxe/premium, *fully populated*), `hostel_tier_policy` (standard/premium/premium_plus, drives premium flow via `allocations.tier_id`).
- **No auto-allocation logic** anywhere. **No approval status** (`allocation_status_enum` = active/vacated/transferred/suspended/pending_vacate). `allocations.approve` perm key + `warden_id` column exist but are inert.
- **Beds never generated;** occupancy = `capacity − active_allocations` (`v_hostel_room_occupancy`), bed-agnostic. But `allocations.bed_id` is NOT NULL.
- **Eligibility today** = `hostel_program_room_eligibility` (program→category, institution-default+override, fail-open). All 5 academic dims are reliable FK columns on `learners_profiles` (institution 100%, program 99.7%, degree 99.5%, department 99.5%, semester 99.3%; avoid admission_year/batch ~62%). "Year-1" = `semester_id`.
- **Premium self-select UI exists** end-to-end (`my-hostel/premium/pick-room` + `fn_premium_reserve_bed`) but commits immediately as `active` — no warden gate; no learner "category update" mechanism.
- **Generic approval engine exists** (`ApprovalChainService` + rules/runs, powers vacate/leave). `role_has_block_access()` RLS helper exists, but **`user_block_access` grant path is unbuilt** — wardens get no block access today (prerequisite to fix).

## Locked decisions

1. **Categories canonical** = `hostel_categories`; add `allocation_mode` (`auto`|`manual`): **Classic = auto**, rest = manual. Backfill `hostel_rooms.category_id` from `tier_access` (gender-aware).
2. **Beds real** = materialize `hostel_beds` from capacity (backfill + auto-create on room create).
3. **Approval lightweight** = new allocation statuses `pending_approval` → `active`/`rejected`; `hostel_allocation_batches` for auto-batch approval; warden review page; block-scoped RLS.
4. **Eligibility fail-closed** = new `hostel_room_eligibility_rules` (+ `_rooms` child): target (block + optional floor + explicit room set) × predicate (institution required; degree/department/program/semester nullable = "any"). Covered room ⇒ only matching learners; uncovered ⇒ open.
5. **Eligibility UX** = new **"Physical Rooms" tab** on the existing Settings → Program Eligibility page (reuse shell + institution picker; separate table). Program Eligibility stays as-is (category-tier gate, dormant).

### Resolved sub-decisions
- **Warden→block access:** trigger mirrors `hostel_wardens` (+ `hostel_blocks.warden_id`) into `user_block_access` so `role_has_block_access()` works; add a minimal Assign-Warden action (current dialog is a stub).
- **Auto-allocation cohort:** admin picks institution + Classic category + hostel year; engine = hostelite learners with `hostel_category_id`=Classic, **no active allocation**, **gender-matched** to block, **alpha-sorted**, filling eligibility-passing Classic rooms/beds.
- **Room targeting:** rules store an explicit room set (admin picks block→floor→rooms, "select whole floor") — robust vs free-text `room_number`.

## Phased roadmap (each phase = confirm → build → verify, one commit)

### P0 — Foundations (prerequisite)
- Migration: `hostel_categories.allocation_mode` + Classic=auto; backfill `hostel_rooms.category_id` from `tier_access` (gender-aware).
- Migration + service: generate `hostel_beds` from capacity (backfill 207 student rooms) + auto-create on room create; only `room_purpose='student'`.
- Migration: `user_block_access` sync trigger on `hostel_wardens`/`hostel_blocks.warden_id`; minimal Assign-Warden action.
- Types + categories settings UI: surface `allocation_mode` (badge/toggle).

### P1 — Physical-room eligibility
- Table `hostel_room_eligibility_rules` (+ `_rooms` child); `fn_learner_eligible_for_room(learner_id, room_id)`; RLS (use `user_has_permission`, not hardcoded roles).
- New "Physical Rooms" tab on `/campus-living/settings/program-eligibility` with cascading Institution→Degree→Department→Program→Semester pickers + block/floor/room targeting; service + hook + types.

### P2 — Auto-allocation (Classic) + warden approval
- `hostel_allocation_batches` table; `allocation_status_enum` += `pending_approval`, `rejected`.
- Engine RPC (SECURITY DEFINER): cohort → alpha sort → eligibility+gender-filtered Classic rooms → fill beds → create `pending_approval` batch (warden_id = block warden).
- Admin "Auto-Allocate" page (preview count → generate); warden batch-review page (approve → commit beds occupied; reject → free).

### P3 — Manual self-selection (premium tiers)
- My Hostel "category update / upgrade" option; eligibility-filtered room+bed pick (reuse premium picker) → creates `pending_approval` (modify `fn_premium_reserve_bed` or new RPC).
- Warden per-row approval (reuse P2 review infra) → commit.

## Open items / risks
- Bed `institution_id` is NOT NULL but rooms are many-to-many with institutions (`room_institution_access`) — pick the room's primary institution for generated beds.
- `floor` not constrained to `total_floors`; floors 0 and 3 both occur — enumerate defensively.
- Warden roster (`hostel_wardens`) is empty — wardens must be assigned before approval can be exercised.
- Program-eligibility RLS hardcodes role names (against convention); new tables must use `user_has_permission()`.
