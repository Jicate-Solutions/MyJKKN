# Design — Per-student manual room allocation from Residents › Learners

**Date:** 2026-06-18
**Status:** Approved design, pending spec review
**Area:** Campus Living › Hostel Residents (`/campus-living/residents`, Learners tab)

## Problem

From the **Residents › Learners** table an admin/warden needs to allocate a room to
an individual learner directly, with enough context to do it correctly:

1. See the learner's **current room** and **mess category** in the table.
2. Launch an **Allocate room** action per learner.
3. While picking a room, see **live availability** and **who is already allocated**
   to that room (per-bed status + occupant name/roll).

Today none of this exists on the Residents table. The only manual-allocation UI is a
separate 3-step wizard at `/campus-living/allocations/new` that (a) can't be deep-linked
to a specific learner, and (b) never shows room occupancy. The Residents Learners table
shows Block + Room Category but not room number or mess, and its row actions are only
View / Edit-hostel-fields / Remove.

## Decisions (locked with the requester)

| # | Decision |
|---|----------|
| 1 | **Placement:** new inline `AllocateRoomDialog` launched from the Learners row Actions menu (stays on the Residents page), learner pre-selected. |
| 2 | **Re-allocation:** fresh-allocate **only**. Already-allocated learners (`current_allocation_id != null`) instead get a menu item routing to the existing `TransferDialog` ("Change room/bed") — no duplicate move logic. |
| 3 | **Table columns:** add **Current Room** + **Mess Category** columns; apply the `.pinned-actions-col` right-pinned Actions fix (table widens). |
| 4 | **Occupancy detail:** per-bed list — status + occupant **name + roll**; free beds selectable. |
| 5 | **DB migrations approved** (apply-then-mirror workflow). |
| 6 | **Bed invariant:** fresh allocation must occupy the bed atomically (see Migration C). |

## Architecture

Request path follows the standard page → hook → service/RPC → RLS layering.

```
LearnersTab (residents)
  ├─ learners-columns.tsx        ← + Current Room, Mess Category cols; + "Allocate room" / "Change room/bed" row action
  ├─ AllocateRoomDialog (NEW)    ← learner pre-selected; context strip; block/room/bed + mess pickers; occupancy panel
  │     ├─ useHostelBlocks / useRoomsByBlock / useBedsByRoom      (existing)
  │     ├─ useEffectiveRoomCategories / useEffectiveMessCategories (existing eligibility filter, fail-open)
  │     ├─ useRoomBedOccupancy(roomId) (NEW) → fn_cl_room_bed_occupancy
  │     └─ useAllocateBedAdmin() (NEW)      → fn_cl_admin_allocate_bed  (atomic insert + occupy bed)
  └─ TransferDialog (existing)   ← reused for already-allocated learners
```

### Component: `AllocateRoomDialog`
New file: `app/(routes)/campus-living/residents/_components/allocate-room-dialog.tsx`

- Props: `{ learner: LearnerHostelite | null; onClose: () => void }` (open = `!!learner`).
- **Context strip:** learner name + roll; current room (`current_block_name` / `current_room_number` or "Unassigned"); current mess (`mess_category_name`).
- **Pickers:** Block → Room → Bed selects reusing the existing hooks and the program
  eligibility filter from the wizard (fail-open: only narrow when the resolver returns a
  non-empty set). Mess category select (eligibility-filtered, fail-open).
- **Occupancy panel:** rendered when a room is selected. Lists every bed in the room with
  status badge and, for occupied beds, occupant name + roll. Free beds are the selectable
  ones (bed select disables occupied beds). Header: "X of Y beds free".
- **Submit:** `useAllocateBedAdmin()` → on success invalidate residents/hostelites +
  allocations + beds caches, toast, close. (The base create hook only invalidates the
  allocations key, so the dialog must invalidate the hostelite list itself or the Current
  Room column won't refresh.)
- Emergency-contact + medical fields: **optional** here (admin quick-allocate). The service
  insert does not hard-require them; the wizard's requirement is UI-only.

### Table: `learners-columns.tsx`
- **Current Room** column: `current_block_code`/`current_room_number` (e.g. "GHB · 204"),
  "—" when unallocated.
- **Mess Category** column: `mess_category_name`, "—" when unset.
- Actions menu: when `current_allocation_id == null` → **Allocate room** (opens dialog);
  else → **Change room/bed** (opens `TransferDialog`). Both gated by `canEdit`.
- `learners-tab.tsx`: wrap the `<DataTable>` in `<div className="pinned-actions-col">`
  (reuse the global rule added for the Allocations table) and own the new dialog state.

### Data layer (3 migrations, apply-then-mirror)

**Migration A — extend `v_learner_hostelites`.** Add `current_room_number` and
`current_bed_number` from the active-allocation join the view already performs (it already
derives `current_block_name`/`code`). Recreate the view (CREATE OR REPLACE preserving all
existing columns). Mirror: `types/supabase.ts` (view row type), `types/campus-living.ts`
(`LearnerHostelite`), `supabase/setup/05_views.sql`.

**Migration B — `fn_cl_room_bed_occupancy(p_room_id uuid)`** SECURITY DEFINER, gated on the
allocate permission (see below). Returns one row per bed in the room:
`{ bed_id, bed_number, status, occupant_profile_id, occupant_name, occupant_roll }`,
resolving `hostel_beds.current_occupant_id → profiles → learners_profiles` for name/roll.
`REVOKE EXECUTE … FROM anon, PUBLIC; GRANT … TO authenticated`. Mirror into `02_functions.sql`.

**Migration C — `fn_cl_admin_allocate_bed(p_learner_id, p_block_id, p_room_id, p_bed_id, p_mess_category_id, p_allocation_type, ...)`** SECURITY DEFINER, gated on the allocate
permission. Atomically: insert the `hostel_allocations` row AND set the chosen bed
`status='occupied'` + `current_occupant_id` to the allocation's learner key — the exact
invariant `fn_cl_admin_transfer_allocation` / `fn_auto_allocate_classic` maintain. Fail
closed if the bed is not free. This replaces the bare `allocate()` insert so the occupancy
panel and availability never go stale. Mirror into `02_functions.sql`.

> **Learner-key risk (resolve during implementation):** the Residents view `id` is
> `learners_profiles.id`, but `hostel_allocations.learner_id` keys on `profiles.id`
> (bridge: `profiles.learner_id`). Migration C must resolve the correct key by mirroring
> `fn_auto_allocate_classic` exactly — the source of truth for a correct allocate+occupy.
> The occupancy RPC (B) must resolve occupant names through the same bridge.

### Permission gate
Gate on **`campus_living.upgrades.manage`** (super-admin + the 5 hostel-admin roles), the
same tight key the merged transfer RPC uses and which the Residents page already computes as
`canManageUpgrades` for the Upgrade Categories tab. Reuse that flag for the new
Allocate/Change-room actions.

> **Do NOT gate on `campus_living.residents.edit`.** Verified 2026-06-18: it is mass-granted
> to 64 roles (incl. `student`, `parent`, `driver`, `mess_caterer`, `gate_security`) — the
> same useless-as-a-gate trap as `campus_living.allocations.*`. Gating the allocate RPC on it
> would be a privilege-escalation hole. Both new RPCs gate server-side on
> `is_super_admin() OR user_has_permission('campus_living.upgrades.manage')`, plus institution
> access via `get_user_accessible_institutions(auth.uid())`. The actual write stays RLS-gated.

## Scope boundaries (out, by YAGNI)
- No fee preview in this dialog (the wizard keeps it).
- No transfer/re-allocation logic here — routes to the merged `TransferDialog`.
- No change to auto-allocation or the existing `/allocations/new` wizard.
- No bulk allocate (single-learner only).

## Edge cases
- Learner already allocated → action becomes "Change room/bed" (dialog never fresh-allocates over an existing allocation; aligns with the DB's one-active-allocation constraint).
- Selected bed taken by a concurrent allocation → Migration C fails closed; surface the error toast.
- Room with no free beds → bed select shows all beds disabled; submit blocked.
- Eligibility resolver empty → fail-open (show all rooms/mess) with a subtle hint, never block.
- Super-admin (no `institution_id`) vs institution-scoped user → scope handled by the RPC's institution-access helper, mirroring existing campus-living RPCs.

## Verification
- View returns `current_room_number`/`current_bed_number` for an allocated learner.
- `fn_cl_room_bed_occupancy` returns correct beds + occupant names for a known room (cross-check against `hostel_beds` + active allocations).
- `fn_cl_admin_allocate_bed` (rolled-back DO block) inserts the allocation **and** flips the bed to occupied; second call on the same bed fails closed.
- From the UI: Allocate room on an unallocated learner → table's Current Room/Mess update; occupancy panel shows the new occupant on re-open; already-allocated learner routes to transfer.
- `mcp__ide__getDiagnostics` clean on touched TS files; pinned Actions column reachable; `npm run check:menus` if any permission/nav touched (none expected).
