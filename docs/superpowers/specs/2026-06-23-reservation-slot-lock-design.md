# Reservation Slot Lock — Pending-aware, Capacity-aware

**Date:** 2026-06-23
**Module:** Resource Management → Reservations
**Status:** Design approved; ready for implementation planning

## Problem

A user books a resource (e.g. Seminar Hall, 09:00–17:00) and it should be held for
that window so no one else can book the same resource for an overlapping time. Today,
multiple users — or even the same user repeatedly — can stack **pending** reservations
onto the same resource/slot, because:

1. **TOCTOU race at creation.** `ReservationService.createReservation`
   (`lib/services/reservation/reservation-service.ts:150`) runs an *unlocked*
   `checkAvailability` read, then a *separate* direct `.insert` (`:190`). Nothing
   serializes them; concurrent bookings both pass.
2. **The lock is enforced at the wrong moment.** The only DB-enforced capacity guard,
   `fn_reservation_approved_decrement_stock`, fires `AFTER UPDATE OF status` — i.e.
   only when a row turns **`approved`** — and counts **only other `approved` rows**
   (`supabase/migrations/20260623170000_reservation_stock_time_window_aware.sql:41-86`).
   So any number of `pending` rows can pile onto one slot; the clash only surfaces when
   the *second* approver tries to approve.
3. **Identity is dropped from the booking flow.** `checkAvailability` and
   `getAvailableSlots` never join `profiles`, and `TimeSlot` has no booker field, so the
   UI literally cannot say "booked by whom" — and the create-time block is surfaced as a
   generic red toast with no path forward.

## Goal (success criteria)

A reservation in **`pending` or `approved`** status holds its resource for its
`[start, end)` window, up to the resource's unit capacity. An overlapping request beyond
capacity is **rejected at INSERT time, in the database**, with a message naming the
current holder. Cancelling or rejecting a holding reservation frees the slot immediately.
The booking UI shows **who holds a conflicting slot** (name + designation + time +
pending/approved status) and turns the block into a clear inline alert.

### Decisions (confirmed with stakeholder)
- **Capacity-aware lock.** A slot is "taken" only when overlapping `pending+approved`
  quantity reaches `resources.initial_stock_quantity`. Halls (stock = 1) lock on the
  first booking; multi-unit resources (e.g. 30 projectors) lock only when full.
- **Holder info shown:** name + designation/department + time window + status. **Not**
  the free-text `purpose`.
- **UI:** enhance the existing 4-step booking wizard (no new day-timeline component).
- **Hard lock until resolved** — no pending-hold expiry (out of scope).

## Ground truth (verified live + in code)

### Data model
- **`resource_reservations`** — `start_time`/`end_time` are separate `timestamptz` (not a
  range, not date+time). Owner column is **`user_id`** (FK → `profiles`). There is **no
  `institution_id`** on this table — institution is derived via `resources.institution_id`.
  No `approval_level` on the row (multi-level state lives in `resource_approvals`).
  Enum `reservation_status`: `pending, approved, rejected, cancelled, completed, no_show`.
  `quantity` default 1, CHECK `quantity > 0`. CHECK `valid_time_range (end_time > start_time)`.
  Existing indexes include `idx_reservations_time_range (start_time, end_time)`,
  `idx_reservations_status`, partial `idx_reservations_pending`. **No exclusion constraint
  / unique index enforcing non-overlap exists.**
- **`resources`** — `initial_stock_quantity` (int, default 1, nullable) is the authoritative
  capacity (NULL ⇒ untracked/unlimited; room/hall ⇒ 1). `current_stock_quantity` is now
  display-only. `is_reservable bool NOT NULL`, `institution_id`, `approval_config jsonb`
  (`enabled`, `approvers[]`, `approval_type`, `require_all_approvers`).

### Overlap predicate (already correct & consistent everywhere)
Half-open: `existing.start_time < NEW.end_time AND existing.end_time > NEW.start_time`.
Touching slots (12:00 end / 12:00 start) correctly do **not** collide.

### Triggers on `resource_reservations` (live)
- `tr_reservation_approved_decrement_stock` → `fn_reservation_approved_decrement_stock`
  (AFTER UPDATE OF status; approve-only capacity guard) — **to be retired/generalized.**
- `tr_reservation_cancelled_restore_stock_and_waitlist` → promotes next `event_waitlist`
  row on cancel — **keep.**
- `trg_enforce_resource_is_reservable` (BEFORE INSERT; `is_reservable` guard) — **keep.**
- `log_resource_usage_trigger`, `update_resource_reservation_count_trigger`,
  `update_reservations_updated_at`, `trg_sync_meeting_venue_status` — **keep.**

### Status-change RPCs (the pattern we mirror — all `SECURITY DEFINER` + `SELECT … FOR UPDATE`)
- `approve_reservation(p_reservation_id, p_notes)` — sequential/multi-level via
  `approval_config` + `resource_approvals`; flips to `approved`.
- `reject_reservation(p_reservation_id, p_reason)` — reason required; flips to `rejected`.
- `cancel_reservation(p_reservation_id, p_reason)` — booker / super_admin / `resources.manage`;
  `pending|approved → cancelled`.

### RLS
Same-institution authenticated users can already SELECT every reservation row on a resource
(policy `resource_reservations_select_by_resource`), so showing the conflicting holder is
permission-compatible. Permission keys: `resources.reservations.{view,create,edit,cancel}`.
There is **no** `.approve`/`.manage` reservation key (approval auth = membership in
`approval_config.approvers`, checked inside the RPC).

### Second insert path (must be covered by a DB-level lock)
`lib/services/meetings/venue-reservation.ts` — `checkVenueAvailability` (`:63`, **fails open**
on error) + `createVenueReservation` (`:96`) inserts `resource_reservations` directly,
**bypassing `ReservationService`.** A JS-only fix would miss it.

## Architecture (four layers)

### Layer 1 — Database (authoritative lock)

**1a. New `fn_reservation_enforce_slot_lock()` + trigger** (replaces the approve-only guard):
- Fires `BEFORE INSERT OR UPDATE OF start_time, end_time, quantity, resource_id, status`.
- Early-return unless `NEW.status IN ('pending','approved')` (cancel/reject/complete/no_show
  free the slot just by leaving that set).
- `PERFORM pg_advisory_xact_lock(hashtext(NEW.resource_id::text))` — serializes concurrent
  bookings of the *same* resource, closing the TOCTOU race. Different resources never block.
- `SELECT initial_stock_quantity INTO v_total FROM resources WHERE id = NEW.resource_id`;
  if NULL ⇒ untracked ⇒ `RETURN NEW` (no enforcement).
- `SELECT COALESCE(SUM(quantity),0) INTO v_committed FROM resource_reservations
   WHERE resource_id = NEW.resource_id AND id <> NEW.id
     AND status IN ('pending','approved')
     AND start_time < NEW.end_time AND end_time > NEW.start_time;`
- If `v_committed + NEW.quantity > v_total` → look up the earliest overlapping holder
  (name + time) and `RAISE EXCEPTION 'SLOT_LOCKED: % is held by % (%) for % to %', ...`
  using the default plpgsql SQLSTATE (`P0001`). The **`SLOT_LOCKED:` message prefix** is
  the contract the service layer parses to render the friendly holder alert (the codebase
  already maps DB messages by text, e.g. the existing `Insufficient stock` guard). Else
  `RETURN NEW`.
- **Invariant maintained:** overlapping `pending+approved` quantity ≤ capacity, enforced at
  every mutation point. This makes the old approve-time guard redundant (retired) and removes
  the create-vs-approve rule mismatch.
- **Cancellation needs no restore logic** — the lock is a live `SUM` over rows, so a
  cancelled/rejected row simply drops out of the sum. Keep the waitlist-promotion trigger.

**1b. New `fn_resource_slot_conflicts(p_resource_id, p_start, p_end, p_exclude_id)` RPC**
(`SECURITY DEFINER`) returning holder rows for overlapping `pending+approved` reservations:
`{ user_id, full_name, designation_or_department, start_time, end_time, status, quantity }`.
Returns exactly the approved fields (no `purpose`); used by the UI for "booked by whom".
Source of `designation/department`: join `profiles`; if a designation/department column is not
present on `profiles`, fall back to name-only gracefully (confirm column during implementation).

### Layer 2 — Service + types (`lib/services/reservation/`, `types/`)
- **`createReservation`** keeps its JS flow; the DB trigger is the real lock. A conflicting
  insert now throws → post-insert work (approval records, notifications) is correctly skipped.
  Map the structured exception → friendly holder message (replace generic "already booked for
  N slots").
- **`checkAvailability`** becomes **capacity-aware** (sum `quantity` vs `initial_stock_quantity`,
  matching the trigger exactly) and **owner-aware** (holder info via `fn_resource_slot_conflicts`),
  so the pre-flight read agrees with DB enforcement and users rarely hit the hard error.
- **`getAvailableSlots`** attaches holder info to each booked slot.
- **Types** (`types/reservation.ts`): add holder fields to `TimeSlot`
  (`booked_by_name`, `booked_by_designation`, `booked_status`, booked time) and enrich
  `AvailabilityResult.conflicting_reservations`.

### Layer 3 — UI (enhance the wizard)
- **`_components/time-slot-picker.tsx`** — booked slot shows `✗ <Name> (Pending/Approved)`
  with a tooltip (designation + exact time) instead of a bare "Booked" badge.
- **`_components/booking-form.tsx`** — when blocked, render the holder card (name, designation,
  time window, status) + guidance ("choose another slot or contact the requester") instead of a
  dead-end toast (current alert at `:199-221`).
- **`hooks/reservation/use-reservation-operations.ts`** create `onError` (`:68-91`) — map the
  DB exception to the same inline alert.
- **Approvals conflict indicator** — OUT of default scope (pending now locks at creation, so
  double-approval is largely prevented). Opt-in only.

### Layer 4 — Migration, mirroring, verification
- One migration `supabase/migrations/20260623190000_reservation_slot_lock_pending_aware.sql`:
  drop `tr_reservation_approved_decrement_stock` + `fn_reservation_approved_decrement_stock`;
  create `fn_reservation_enforce_slot_lock()` + its `BEFORE INSERT OR UPDATE` trigger; create
  `fn_resource_slot_conflicts(...)`. Mirror into `supabase/setup/02_functions.sql` +
  `04_triggers.sql`. Commit the real SQL body (no `SELECT 1;` placeholder).
- **Verify by CALLING, not just applying** (plpgsql validates columns lazily): (a) two
  overlapping inserts → 2nd raises; (b) approve-one-of-two overlapping pendings → 2nd approval
  blocked; (c) cancel/reject a holder → re-insert into the freed slot succeeds; (d) capacity-N
  resource allows N concurrent and blocks the (N+1)th. Then `getDiagnostics` on touched TS
  files + a browser double-book test.
- **Scope guard:** touch only reservation files. The working tree already has unrelated
  uncommitted migrations (`20260623170000` stock, `20260623180000` timetable) and
  `02_functions.sql` edits from concurrent work — leave those alone; flag commit hygiene
  before any PR.

## Out of scope (YAGNI)
Pending-hold expiry; a general per-slot waitlist; the day-timeline component; refactoring
`venue-reservation.ts` beyond what the trigger covers; enabling RLS on `event_waitlist`
(noted as a separate concern); the approvals conflict indicator (opt-in).

## Risks / edge cases
- **Recurring reservations** (`is_recurring`): each materialized row passes through the
  trigger and is checked independently. If recurrence expands to multiple rows in one
  transaction, each is validated; the advisory lock serializes them.
- **Legacy overlapping pendings** (e.g. the existing June 25 Nalini/Monisha clash): not
  destructively touched. The trigger blocks approving the *second* one — the desired
  manual-decision outcome.
- **Self-service updates** (check-in/out) update other columns, not the locked set, so they
  don't re-trigger enforcement.
- **`venue-reservation.ts` fail-open branch** is now backstopped by the DB trigger; full
  reconciliation of its error handling is out of scope but noted.
