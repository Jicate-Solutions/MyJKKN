# Reservation Slot Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a `pending` or `approved` reservation hold its resource for its `[start, end)` window (up to the resource's unit capacity), enforced atomically in the database, with the conflicting holder surfaced in the booking wizard.

**Architecture:** A `BEFORE INSERT OR UPDATE` trigger on `resource_reservations` takes a per-resource advisory lock, sums overlapping `pending+approved` quantity, and raises `SLOT_LOCKED:` when it would exceed `resources.initial_stock_quantity` — replacing the old approve-only stock guard. A `SECURITY DEFINER` RPC returns the conflicting holder (name + designation + time + status); the service and UI read it so the user sees who holds a slot instead of a dead-end error.

**Tech Stack:** Supabase Postgres (plpgsql triggers + SQL RPC), Next.js 16 / React 19, TanStack Query, TypeScript, Shadcn UI.

## Global Constraints

- TypeScript strict mode is OFF and `typescript.ignoreBuildErrors: true` — verify types with `mcp__ide__getDiagnostics` per file, NOT full `tsc`.
- Supabase errors are plain objects — never `err instanceof Error`; surface via `getErrorMessage()` from `@/lib/utils`.
- Never fire-and-forget a Supabase mutation — always destructure and check `{ error }`.
- Commit the REAL migration SQL body to `supabase/migrations/`; never a `SELECT 1;` placeholder. Mirror function/trigger changes into `supabase/setup/02_functions.sql` and `04_triggers.sql`.
- Verify DB functions by CALLING them (plpgsql validates columns lazily), not just by applying the migration.
- `resource_reservations` has NO `institution_id`; capacity = `resources.initial_stock_quantity` (NULL ⇒ unlimited); owner = `resource_reservations.user_id → profiles`.
- Overlap predicate is half-open: `existing.start_time < NEW.end_time AND existing.end_time > NEW.start_time` (touching slots do not collide).
- Work on branch `feat/reservation-slot-lock`. Do NOT stage the unrelated working-tree changes (`supabase/setup/02_functions.sql` pre-existing edits from concurrent work, `supabase/migrations/20260623170000_*`, `20260623180000_*`, `.superpowers/`) — stage only the files each task names.
- The Supabase project is reachable via `mcp__supabase__apply_migration` / `mcp__supabase__execute_sql`.

---

### Task 1: Database — slot-lock trigger + conflict-reader RPC

**Files:**
- Create: `supabase/migrations/20260623190000_reservation_slot_lock_pending_aware.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror the two functions)
- Modify: `supabase/setup/04_triggers.sql` (mirror the trigger)

**Interfaces:**
- Produces (DB objects later tasks rely on):
  - Trigger `tr_reservation_enforce_slot_lock` on `resource_reservations`, `BEFORE INSERT OR UPDATE OF start_time, end_time, quantity, resource_id, status`, raising `RAISE EXCEPTION 'SLOT_LOCKED: ...' USING ERRCODE='P0001'` on capacity breach.
  - RPC `fn_resource_slot_conflicts(p_resource_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_id uuid DEFAULT NULL)` → `TABLE(reservation_id uuid, user_id uuid, full_name text, designation text, email text, start_time timestamptz, end_time timestamptz, status text, quantity integer)`. Callable from the browser client via `supabase.rpc('fn_resource_slot_conflicts', { p_resource_id, p_start, p_end, p_exclude_id })`.
- Removes: trigger `tr_reservation_approved_decrement_stock` and function `fn_reservation_approved_decrement_stock()`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260623190000_reservation_slot_lock_pending_aware.sql`:

```sql
-- Pending-aware, capacity-aware reservation slot lock.
-- Replaces the approve-only stock guard (fn_reservation_approved_decrement_stock)
-- with a BEFORE INSERT/UPDATE guard that treats both `pending` and `approved`
-- reservations as holding the slot, enforced atomically via a per-resource
-- advisory lock. Adds fn_resource_slot_conflicts for surfacing the holder in UI.

-- 1. Retire the approve-only guard (the new trigger covers the approve transition too).
DROP TRIGGER IF EXISTS tr_reservation_approved_decrement_stock ON public.resource_reservations;
DROP FUNCTION IF EXISTS public.fn_reservation_approved_decrement_stock();

-- 2. The hold-time capacity guard.
CREATE OR REPLACE FUNCTION public.fn_reservation_enforce_slot_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total     int;
  v_committed int;
  v_holder    text;
  v_h_start   timestamptz;
  v_h_end     timestamptz;
BEGIN
  -- Only pending/approved rows hold a slot. cancelled/rejected/completed/no_show free it.
  IF NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0
     OR NEW.start_time IS NULL
     OR NEW.end_time   IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent bookings of the SAME resource (closes the TOCTOU race).
  -- Different resources hash to different keys and never block each other.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.resource_id::text));

  SELECT initial_stock_quantity INTO v_total
  FROM public.resources
  WHERE id = NEW.resource_id;

  -- NULL capacity = untracked/unlimited: no lock.
  IF v_total IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(rr.quantity), 0) INTO v_committed
  FROM public.resource_reservations rr
  WHERE rr.resource_id = NEW.resource_id
    AND rr.id <> NEW.id
    AND rr.status IN ('pending', 'approved')
    AND rr.start_time < NEW.end_time
    AND rr.end_time   > NEW.start_time;

  IF v_committed + NEW.quantity > v_total THEN
    SELECT COALESCE(p.full_name, 'another user'), rr.start_time, rr.end_time
      INTO v_holder, v_h_start, v_h_end
    FROM public.resource_reservations rr
    LEFT JOIN public.profiles p ON p.id = rr.user_id
    WHERE rr.resource_id = NEW.resource_id
      AND rr.id <> NEW.id
      AND rr.status IN ('pending', 'approved')
      AND rr.start_time < NEW.end_time
      AND rr.end_time   > NEW.start_time
    ORDER BY rr.start_time
    LIMIT 1;

    RAISE EXCEPTION
      'SLOT_LOCKED: this resource is already held by % for the overlapping window % to %; only % unit(s) free for the selected time',
      v_holder, v_h_start, v_h_end, GREATEST(v_total - v_committed, 0)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_reservation_enforce_slot_lock ON public.resource_reservations;
CREATE TRIGGER tr_reservation_enforce_slot_lock
  BEFORE INSERT OR UPDATE OF start_time, end_time, quantity, resource_id, status
  ON public.resource_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reservation_enforce_slot_lock();

-- 3. Holder reader for the UI (SECURITY DEFINER so designation is readable uniformly).
CREATE OR REPLACE FUNCTION public.fn_resource_slot_conflicts(
  p_resource_id uuid,
  p_start       timestamptz,
  p_end         timestamptz,
  p_exclude_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  reservation_id uuid,
  user_id        uuid,
  full_name      text,
  designation    text,
  email          text,
  start_time     timestamptz,
  end_time       timestamptz,
  status         text,
  quantity       integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT rr.id, rr.user_id, p.full_name, p.designation, p.email,
         rr.start_time, rr.end_time, rr.status::text, rr.quantity
  FROM public.resource_reservations rr
  LEFT JOIN public.profiles p ON p.id = rr.user_id
  WHERE rr.resource_id = p_resource_id
    AND rr.status IN ('pending', 'approved')
    AND rr.start_time < p_end
    AND rr.end_time   > p_start
    AND (p_exclude_id IS NULL OR rr.id <> p_exclude_id)
  ORDER BY rr.start_time;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_resource_slot_conflicts(uuid, timestamptz, timestamptz, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_resource_slot_conflicts(uuid, timestamptz, timestamptz, uuid) FROM anon;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `mcp__supabase__apply_migration` with name `reservation_slot_lock_pending_aware` and the full SQL body above.
Expected: success, no error.

- [ ] **Step 3: Verify the lock by CALLING it (overlap is blocked, non-overlap is not)**

Run via `mcp__supabase__execute_sql`. This DO block creates test rows, asserts behavior, then raises to roll everything back — nothing persists:

```sql
DO $$
DECLARE
  v_res     uuid;
  v_user    uuid;
  v_blocked boolean := false;
  v_other_day_ok boolean := false;
BEGIN
  SELECT id INTO v_res FROM public.resources
    WHERE is_reservable AND initial_stock_quantity = 1 LIMIT 1;
  SELECT id INTO v_user FROM public.profiles LIMIT 1;

  -- First booking holds 09:00-17:00.
  INSERT INTO public.resource_reservations
    (resource_id, user_id, purpose, start_time, end_time, quantity, status)
    VALUES (v_res, v_user, 'lock-test A', '2030-01-01 09:00+05:30',
            '2030-01-01 17:00+05:30', 1, 'pending');

  -- Overlapping second booking must be blocked.
  BEGIN
    INSERT INTO public.resource_reservations
      (resource_id, user_id, purpose, start_time, end_time, quantity, status)
      VALUES (v_res, v_user, 'lock-test B', '2030-01-01 12:00+05:30',
              '2030-01-01 14:00+05:30', 1, 'pending');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SLOT_LOCKED:%' THEN v_blocked := true; END IF;
  END;

  -- A different day must NOT be blocked.
  BEGIN
    INSERT INTO public.resource_reservations
      (resource_id, user_id, purpose, start_time, end_time, quantity, status)
      VALUES (v_res, v_user, 'lock-test C', '2030-01-02 09:00+05:30',
              '2030-01-02 17:00+05:30', 1, 'pending');
    v_other_day_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_other_day_ok := false;
  END;

  RAISE EXCEPTION 'LOCK TEST RESULT: overlap_blocked=%, other_day_ok=%', v_blocked, v_other_day_ok;
END $$;
```

Expected: the call returns an error whose message is `LOCK TEST RESULT: overlap_blocked=t, other_day_ok=t`. (Any other combination = failure; fix the trigger before continuing.)

- [ ] **Step 4: Verify capacity-N allows N concurrent and blocks N+1**

```sql
DO $$
DECLARE
  v_res uuid; v_user uuid; v_third_blocked boolean := false;
BEGIN
  SELECT id INTO v_res FROM public.resources
    WHERE is_reservable AND initial_stock_quantity >= 2 LIMIT 1;
  IF v_res IS NULL THEN
    RAISE EXCEPTION 'CAPACITY TEST SKIPPED: no resource with initial_stock_quantity >= 2';
  END IF;
  SELECT id INTO v_user FROM public.profiles LIMIT 1;

  INSERT INTO public.resource_reservations (resource_id, user_id, purpose, start_time, end_time, quantity, status)
    VALUES (v_res, v_user, 'cap A', '2030-03-01 09:00+05:30', '2030-03-01 17:00+05:30', 1, 'pending');
  INSERT INTO public.resource_reservations (resource_id, user_id, purpose, start_time, end_time, quantity, status)
    VALUES (v_res, v_user, 'cap B', '2030-03-01 10:00+05:30', '2030-03-01 12:00+05:30',
            (SELECT initial_stock_quantity FROM public.resources WHERE id = v_res) - 1, 'pending');
  BEGIN
    INSERT INTO public.resource_reservations (resource_id, user_id, purpose, start_time, end_time, quantity, status)
      VALUES (v_res, v_user, 'cap C overflow', '2030-03-01 11:00+05:30', '2030-03-01 13:00+05:30', 1, 'pending');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SLOT_LOCKED:%' THEN v_third_blocked := true; END IF;
  END;
  RAISE EXCEPTION 'CAPACITY TEST RESULT: overflow_blocked=%', v_third_blocked;
END $$;
```

Expected: error message `CAPACITY TEST RESULT: overflow_blocked=t` (or the SKIPPED message if no multi-unit resource exists — acceptable).

- [ ] **Step 5: Verify the holder RPC returns name + designation**

```sql
SELECT * FROM public.fn_resource_slot_conflicts(
  (SELECT resource_id FROM public.resource_reservations
     WHERE status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1),
  '2000-01-01 00:00+05:30', '2100-01-01 00:00+05:30', NULL) LIMIT 3;
```

Expected: rows with `full_name`, `designation` (may be null for some users), `status`, `start_time`, `end_time`. No SQL error (confirms no 42804/42702 type mismatch).

- [ ] **Step 6: Mirror the two functions into `supabase/setup/02_functions.sql`**

Find the existing `fn_reservation_approved_decrement_stock` definition in `supabase/setup/02_functions.sql` and REPLACE it with the `fn_reservation_enforce_slot_lock` body from Step 1. Add the `fn_resource_slot_conflicts` body after it. (If `fn_reservation_approved_decrement_stock` is not present in this file — it may live only in the migration history — append both new function bodies in the reservations section instead. Do not duplicate.)

- [ ] **Step 7: Mirror the trigger into `supabase/setup/04_triggers.sql`**

Replace any `tr_reservation_approved_decrement_stock` trigger definition with the `tr_reservation_enforce_slot_lock` `CREATE TRIGGER` from Step 1. If absent, add it in the `resource_reservations` triggers section.

- [ ] **Step 8: Confirm no orphaned references to the dropped function**

Run: `mcp__supabase__execute_sql`
```sql
SELECT proname FROM pg_proc WHERE proname IN
  ('fn_reservation_approved_decrement_stock','fn_reservation_enforce_slot_lock','fn_resource_slot_conflicts');
```
Expected: only `fn_reservation_enforce_slot_lock` and `fn_resource_slot_conflicts` (the approve-only guard is gone).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260623190000_reservation_slot_lock_pending_aware.sql supabase/setup/02_functions.sql supabase/setup/04_triggers.sql
git commit -m "feat(reservations): pending+capacity-aware slot lock trigger and holder RPC"
```

> NOTE: `supabase/setup/02_functions.sql` already had unrelated uncommitted edits before this task. Use `git add -p supabase/setup/02_functions.sql` and stage ONLY the reservation-function hunks if needed; verify with `git diff --cached` before committing.

---

### Task 2: Types — `SlotConflict` + holder fields on `TimeSlot` / `AvailabilityResult`

**Files:**
- Modify: `types/reservation.ts:179-194`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SlotConflict` interface: `{ reservation_id: string; user_id: string; full_name: string | null; designation: string | null; email: string | null; start_time: string; end_time: string; status: string; quantity: number }`
  - `AvailabilityResult.conflicting_reservations?: SlotConflict[]` (changed from `Reservation[]`)
  - `TimeSlot` gains: `booked_by_name?: string | null; booked_by_designation?: string | null; booked_status?: string; booked_start?: string; booked_end?: string`

- [ ] **Step 1: Add `SlotConflict` and extend the two interfaces**

In `types/reservation.ts`, replace the `AvailabilityResult` and `TimeSlot` interfaces (currently lines 179-194) with:

```typescript
export interface SlotConflict {
  reservation_id: string;
  user_id: string;
  full_name: string | null;
  designation: string | null;
  email: string | null;
  start_time: string;
  end_time: string;
  status: string;
  quantity: number;
}

export interface AvailabilityResult {
  is_available: boolean;
  conflicting_reservations?: SlotConflict[];
  available_slots?: TimeSlot[];
  message?: string;
}

export interface TimeSlot {
  start_time: string;
  end_time: string;
  is_available: boolean;
  resource_id: string;
  existing_reservation_id?: string;
  slot_name?: string; // For custom named slots
  max_capacity?: number; // For slots with capacity limits
  // Holder info for booked slots (from fn_resource_slot_conflicts)
  booked_by_name?: string | null;
  booked_by_designation?: string | null;
  booked_status?: string;
  booked_start?: string;
  booked_end?: string;
}
```

- [ ] **Step 2: Verify types**

Run `mcp__ide__getDiagnostics` on `types/reservation.ts`.
Expected: no NEW errors introduced by this change.

- [ ] **Step 3: Commit**

```bash
git add types/reservation.ts
git commit -m "feat(reservations): SlotConflict type and holder fields on TimeSlot/AvailabilityResult"
```

---

### Task 3: Service — capacity-aware + owner-aware `checkAvailability` and `getAvailableSlots`

**Files:**
- Modify: `lib/services/reservation/reservation-service.ts:150-154` (pass quantity in create pre-flight)
- Modify: `lib/services/reservation/reservation-service.ts:371-408` (`checkAvailability`)
- Modify: `lib/services/reservation/reservation-service.ts:413-505` (`getAvailableSlots`)

**Interfaces:**
- Consumes: `SlotConflict`, `AvailabilityResult`, `TimeSlot` (Task 2); RPC `fn_resource_slot_conflicts` (Task 1).
- Produces: `checkAvailability` now capacity-aware and populates `conflicting_reservations: SlotConflict[]` + a holder-naming `message`; `getAvailableSlots` populates `booked_by_*` on booked `TimeSlot`s.

- [ ] **Step 1: Make `checkAvailability` capacity + owner aware**

Replace the body of `checkAvailability` (lines 371-408) with:

```typescript
  static async checkAvailability(
    dto: AvailabilityCheckDto
  ): Promise<AvailabilityResult> {
    const supabase = createClientSupabaseClient();

    // Holder rows for overlapping pending/approved reservations (SECURITY DEFINER RPC).
    const { data: conflicts, error } = await supabase.rpc(
      'fn_resource_slot_conflicts',
      {
        p_resource_id: dto.resource_id,
        p_start: dto.start_time,
        p_end: dto.end_time,
        p_exclude_id: dto.exclude_reservation_id ?? null
      }
    );

    if (error) {
      console.error('Error checking availability:', error);
      throw error;
    }

    const holders = (conflicts ?? []) as SlotConflict[];

    // Capacity = resources.initial_stock_quantity (NULL ⇒ unlimited).
    const { data: resource } = await supabase
      .from('resources')
      .select('initial_stock_quantity')
      .eq('id', dto.resource_id)
      .single();

    const capacity = (resource as any)?.initial_stock_quantity as number | null;
    const requested = dto.quantity ?? 1;
    const committed = holders.reduce((sum, h) => sum + (h.quantity ?? 0), 0);

    const is_available =
      capacity == null || committed + requested <= capacity;

    let message = 'Resource is available';
    if (!is_available) {
      const first = holders[0];
      const who = first?.full_name || 'another user';
      const role = first?.designation ? ` (${first.designation})` : '';
      message = `Already held by ${who}${role}. Only ${Math.max(
        (capacity ?? 0) - committed,
        0
      )} unit(s) free for this window — choose another slot or contact the requester.`;
    }

    return {
      is_available,
      conflicting_reservations: is_available ? undefined : holders,
      message
    };
  }
```

- [ ] **Step 2: Add the `SlotConflict` import**

At the top of `lib/services/reservation/reservation-service.ts`, find the existing import from `@/types/reservation` and add `SlotConflict` to it. Example (match the actual existing import line):

```typescript
import type {
  // ...existing imports...
  SlotConflict
} from '@/types/reservation';
```

- [ ] **Step 3: Pass quantity into the create pre-flight check**

In `createReservation`, replace lines 150-154:

```typescript
    const availability = await this.checkAvailability({
      resource_id: dto.resource_id,
      start_time: dto.start_time,
      end_time: dto.end_time
    });
```

with:

```typescript
    const availability = await this.checkAvailability({
      resource_id: dto.resource_id,
      start_time: dto.start_time,
      end_time: dto.end_time,
      quantity: dto.quantity ?? 1
    });
```

- [ ] **Step 4: Attach holder info in `getAvailableSlots`**

In `getAvailableSlots`, change the resource select (line 420-424) to also read capacity:

```typescript
    const { data: resource } = await supabase
      .from('resources')
      .select('booking_config, status, initial_stock_quantity')
      .eq('id', resourceId)
      .single();
```

Then replace the reservation fetch + slot-marking block (lines 467-504) with a holder-aware, capacity-aware version:

```typescript
    const { data: holders } = await supabase.rpc('fn_resource_slot_conflicts', {
      p_resource_id: resourceId,
      p_start: startOfDay,
      p_end: endOfDay,
      p_exclude_id: null
    });
    const holderRows = (holders ?? []) as SlotConflict[];
    const capacity = (resource as any).initial_stock_quantity as number | null;

    // Step 4: Mark booked slots (capacity-aware) and attach the first holder.
    return generatedSlots.map((slot) => {
      const slotStart = new Date(slot.start_time);
      const slotEnd = new Date(slot.end_time);

      const overlapping = holderRows.filter((h) => {
        const hStart = new Date(h.start_time);
        const hEnd = new Date(h.end_time);
        return hStart < slotEnd && hEnd > slotStart;
      });

      const committed = overlapping.reduce((s, h) => s + (h.quantity ?? 0), 0);
      const isBooked = capacity != null && committed >= capacity;
      const holder = overlapping[0];

      return {
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_available: !isBooked,
        resource_id: resourceId,
        slot_name: slot.slot_name,
        max_capacity: slot.max_capacity,
        existing_reservation_id: holder?.reservation_id,
        booked_by_name: isBooked ? holder?.full_name ?? null : undefined,
        booked_by_designation: isBooked ? holder?.designation ?? null : undefined,
        booked_status: isBooked ? holder?.status : undefined,
        booked_start: isBooked ? holder?.start_time : undefined,
        booked_end: isBooked ? holder?.end_time : undefined
      };
    });
```

- [ ] **Step 5: Verify types**

Run `mcp__ide__getDiagnostics` on `lib/services/reservation/reservation-service.ts`.
Expected: no NEW errors (the `as any` casts on `resource` already exist in this file's style).

- [ ] **Step 6: Runtime sanity-check the RPC wiring**

Run via `mcp__supabase__execute_sql` to confirm the exact argument shape the service sends resolves:

```sql
SELECT count(*) FROM public.fn_resource_slot_conflicts(
  (SELECT id FROM public.resources WHERE is_reservable LIMIT 1),
  now(), now() + interval '1 day', NULL);
```
Expected: a single integer row, no error.

- [ ] **Step 7: Commit**

```bash
git add lib/services/reservation/reservation-service.ts
git commit -m "feat(reservations): capacity- and owner-aware availability via fn_resource_slot_conflicts"
```

---

### Task 4: UI — show the holder on a booked slot in the time-slot picker

**Files:**
- Modify: `app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx:196-209` (slot footer)

**Interfaces:**
- Consumes: `TimeSlot.booked_by_name`, `booked_by_designation`, `booked_status` (Tasks 2-3).
- Produces: a booked slot renders `✗ <Name> (<Status>)` instead of a bare "Booked" badge.

- [ ] **Step 1: Replace the slot footer badge with holder info**

In `renderSlotCard`, replace the "Slot Footer" block (lines 196-209) with:

```tsx
        {/* Slot Footer */}
        <div className='flex flex-col gap-1 mt-2 w-full'>
          <div className='flex items-center gap-2'>
            <Badge
              variant={slot.is_available ? 'default' : 'destructive'}
              className='text-[10px]'
            >
              {slot.is_available ? 'Available' : 'Booked'}
            </Badge>
            {slot.max_capacity && slot.max_capacity > 1 && (
              <Badge variant='outline' className='text-[10px]'>
                Capacity: {slot.max_capacity}
              </Badge>
            )}
          </div>
          {!slot.is_available && slot.booked_by_name && (
            <span className='text-[10px] text-muted-foreground'>
              {slot.booked_by_name}
              {slot.booked_by_designation ? ` · ${slot.booked_by_designation}` : ''}
              {slot.booked_status ? ` (${slot.booked_status})` : ''}
            </span>
          )}
        </div>
```

- [ ] **Step 2: Verify types**

Run `mcp__ide__getDiagnostics` on `app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx`.
Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx"
git commit -m "feat(reservations): name the holder on booked time slots"
```

---

### Task 5: UI — rich conflict alert in the booking form + `SLOT_LOCKED` mapping in the create hook

**Files:**
- Modify: `app/(routes)/resource-management/reservations/_components/booking-form.tsx:205-212` (the destructive Alert)
- Modify: `hooks/reservation/use-reservation-operations.ts:68-91` (create `onError`)

**Interfaces:**
- Consumes: `AvailabilityResult.conflicting_reservations` (`SlotConflict[]`, Tasks 2-3); the `SLOT_LOCKED:` message contract (Task 1).
- Produces: the not-available alert lists the holder(s); a server-side `SLOT_LOCKED` throw renders a friendly toast.

- [ ] **Step 1: Replace the destructive availability alert with a holder card**

In `booking-form.tsx`, replace the `!isAvailable` branch (lines 205-212):

```tsx
            ) : !isAvailable ? (
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>
                  {availabilityCheck?.message ||
                    'This time slot is not available'}
                </AlertDescription>
              </Alert>
            ) : (
```

with:

```tsx
            ) : !isAvailable ? (
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>
                  <p className='font-medium'>
                    {availabilityCheck?.message ||
                      'This time slot is not available'}
                  </p>
                  {availabilityCheck?.conflicting_reservations?.length ? (
                    <ul className='mt-1.5 space-y-1 text-xs'>
                      {availabilityCheck.conflicting_reservations.map((c) => (
                        <li key={c.reservation_id}>
                          <span className='font-medium'>
                            {c.full_name || 'Another user'}
                          </span>
                          {c.designation ? ` · ${c.designation}` : ''}
                          {' — '}
                          {new Date(c.start_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {'–'}
                          {new Date(c.end_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {` (${c.status})`}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : (
```

- [ ] **Step 2: Verify the booking-form types**

Run `mcp__ide__getDiagnostics` on `app/(routes)/resource-management/reservations/_components/booking-form.tsx`.
Expected: no NEW errors.

- [ ] **Step 3: Map `SLOT_LOCKED` to a friendly toast in the create hook**

In `hooks/reservation/use-reservation-operations.ts`, replace the create mutation `onError` (lines 68-91) with a version that strips the `SLOT_LOCKED:` prefix:

```typescript
    onError: (error: any) => {
      console.error('Error creating reservation:', error);
      const raw = getErrorMessage(error);
      const friendly = raw.startsWith('SLOT_LOCKED:')
        ? `This resource is already booked for an overlapping time. ${raw
            .replace(/^SLOT_LOCKED:\s*/, '')
            .replace(/^this resource is /, '')}`
        : raw || 'An unexpected error occurred. Please try again.';
      toast.error(`❌ Failed to Create Reservation\n${friendly}`, {
        duration: 6000,
        style: {
          background: '#ef4444',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '500',
          padding: '16px',
          borderRadius: '8px',
          maxWidth: '500px'
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#ef4444'
        }
      });
    }
```

- [ ] **Step 4: Add the `getErrorMessage` import**

At the top of `hooks/reservation/use-reservation-operations.ts`, confirm/add:

```typescript
import { getErrorMessage } from '@/lib/utils';
```
(If `@/lib/utils` is already imported, add `getErrorMessage` to the existing named import instead of a duplicate line.)

- [ ] **Step 5: Verify the hook types**

Run `mcp__ide__getDiagnostics` on `hooks/reservation/use-reservation-operations.ts`.
Expected: no NEW errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/resource-management/reservations/_components/booking-form.tsx" hooks/reservation/use-reservation-operations.ts
git commit -m "feat(reservations): surface conflicting holder in booking alert and create error"
```

---

### Task 6: End-to-end verification in the browser

**Files:** none (verification only).

**Interfaces:** Consumes the full stack from Tasks 1-5.

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`
Expected: Turbopack starts, no compile error on the touched files.

- [ ] **Step 2: Exercise the double-book block as a real user**

Sign in as a non-super-admin in the same institution as a reservable, capacity-1 resource (e.g. a Seminar Hall). In `/resource-management/reservations/new`:
1. Book the hall for a future date 09:00–17:00 and submit. Expected: success toast, redirect to detail page; reservation is `pending` (or `approved` if no approval config).
2. Start a second booking (same or different user) for the same hall, same date, an overlapping window (e.g. 12:00–14:00).
   - Expected in the **time-slot picker**: the overlapping slot shows `✗ <Name> · <designation> (pending)`.
   - Expected in the **booking-form alert**: red alert naming the holder, designation, time window, and status, with the "choose another slot" guidance.
   - Expected on **submit attempt**: blocked; the toast names the holder (mapped from `SLOT_LOCKED`), not a generic error.
3. Book the same hall for a DIFFERENT date — Expected: succeeds (lock is per-window, not per-resource-forever).

- [ ] **Step 3: Exercise free-on-cancel**

Cancel (as booker) or reject (as approver) the first reservation. Re-attempt the previously-blocked overlapping booking. Expected: now succeeds (the cancelled/rejected row no longer holds the slot).

- [ ] **Step 4: Confirm no regression on multi-unit resources (if any exist)**

For a resource with `initial_stock_quantity > 1`, confirm multiple concurrent overlapping bookings succeed up to the unit count and only the (N+1)th is blocked.

- [ ] **Step 5: Final commit-hygiene check before any PR**

Run: `git status` and `git log --oneline feat/reservation-slot-lock -8`
Confirm the branch contains ONLY the spec, plan, and the six reservation files from Tasks 1-5 — none of the unrelated concurrent-work changes (`20260623170000_*`, `20260623180000_*`, pre-existing `02_functions.sql` hunks, `.superpowers/`). If foreign changes were accidentally staged, unstage them. Report the final diff summary to the user; do not open a PR unless asked.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Layer 1 → Task 1; Layer 2 (service+types) → Tasks 2-3; Layer 3 (UI) → Tasks 4-5; Layer 4 (migration/mirror/verify) → Task 1 Steps 6-9 + Task 6. Out-of-scope items (expiry, waitlist, day-timeline, approvals indicator, `venue-reservation.ts` refactor) are intentionally absent.
- **`venue-reservation.ts`** is NOT modified — by design it's now backstopped by the DB trigger (Task 1), which is the load-bearing reason the lock lives in Postgres.
- **Type consistency:** `SlotConflict` (Task 2) is the single shape returned by `fn_resource_slot_conflicts` (Task 1) and consumed by `checkAvailability`/`getAvailableSlots` (Task 3) and the UI (Tasks 4-5). `booked_by_name`/`booked_by_designation`/`booked_status` names are identical across the type def, the service, and the picker.
