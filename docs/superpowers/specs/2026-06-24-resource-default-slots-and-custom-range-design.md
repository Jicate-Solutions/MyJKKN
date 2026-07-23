# Design: Default Booking Slots for All Resources + User Custom Time-Range Picker

**Date:** 2026-06-24
**Module:** Resource Management → Reservations
**Status:** Approved design (pre-implementation)

---

## 1. Problem

Today, before any resource can be booked, an admin must hand-configure its time slots
inside the resource create/edit form (`time-slot-config.tsx`), one resource at a time.
With a large resource inventory this is impractical, so most resources end up with an empty
`booking_config` and fall through to a hardcoded hourly 9 AM–5 PM grid that nobody chose.

We want two things:

1. **Three sensible default slots available automatically for *every* resource**, with no
   manual admin setup:
   - **Full Day** — 9:00 AM – 5:00 PM
   - **Morning** — 9:00 AM – 1:00 PM
   - **Afternoon** — 1:00 PM – 5:00 PM
2. **A free-form custom time-range picker for end users at booking time**, so a user can
   pick an arbitrary start and end (e.g. 9:00 AM → 5:30 PM) within the resource's allowed
   operating window, and only that exact window is blocked.

Admins must still be able to **override** slots for special resources (the "Defaults +
admin override" model the stakeholder chose).

## 2. Decisions (locked)

| Decision | Choice |
|----------|--------|
| Default-slot model | **Defaults + admin override** — every resource auto-shows the 3 defaults + custom picker; admins can still customize specific resources. |
| Custom-range bound | **Per-resource operating hours**, default global window **9:00 AM – 5:30 PM**. |
| Picker granularity | **30-minute steps, 30-minute minimum** duration. |
| Default slot names | **Full Day / Morning / Afternoon**. |
| Existing "Time Range" toggle | **Replaced** by the real custom start/end picker (it currently only chains two predefined chip clicks). |

## 3. Key architectural facts (from investigation)

These ground the design; they were verified against the live code/DB.

- **Slots are not stored.** There is no slots table. A "slot" is computed at read time in
  TypeScript from `resources.booking_config.time_slot_config` (JSONB, schema-opaque). A
  booking persists only `(start_time, end_time)` timestamptz on `resource_reservations` —
  there is no `slot_id`. **No migration is required for this feature.**
- **One read/expand choke point:** `ReservationService.getAvailableSlots()` →
  `TimeSlotGeneratorService.generateSlotsForDate()`. When a resource has no
  `time_slot_config`, generation falls back to `generateDefaultSlots()` (currently hourly
  9–17). This is the single place to redefine "the defaults," and it covers **all** creation
  paths (form, bulk xlsx import, programmatic) and all pre-existing resources, because slots
  are generated at read time.
- **Double-booking is enforced in the DB**, race-safe, on arbitrary windows, by the
  `fn_reservation_enforce_slot_lock` trigger (advisory lock + overlap sum vs
  `initial_stock_quantity`). A free-form custom range is therefore *already* blocked
  correctly server-side. **This trigger is not changed.**
- **`TimeSlotGeneratorService.validateTimeSlot()` is dead code** — defined, never called. It
  validates end>start, day-open, *within operating hours*, and break conflicts. It returns
  `{valid:true}` immediately if `config` is `undefined`.
- **Capacity = `resources.initial_stock_quantity`** (default 1, NULL = unlimited). Per-slot
  `max_capacity` in config is *not* DB-enforced; the DB only knows resource-level stock.
- **Second insert path stays untouched:** `lib/services/meetings/venue-reservation.ts`
  (anonymous meeting/venue hold) inserts its own reservation rows and legitimately books
  evening times. Operating-hours validation must **not** be applied to it, so the validation
  lives in the UI booking service path only — not in a blanket DB trigger.

## 4. Approach

**Read-time generator default (chosen)** over write-time seeding or a bulk admin action.
Redefining the generator's fallback applies the 3 defaults to every resource instantly,
needs no migration, is the only single change that also covers the bulk-import path (which
hardcodes `booking_config: {}` and bypasses the service), and retuning the defaults later is
a one-constant edit. Admin-configured resources keep their config, so "override" holds by
construction. Write-time seeding of new rows was rejected as redundant (read-time already
guarantees correctness) and more invasive (three insert sites).

## 5. Shared constants (new module)

**New file:** `lib/services/resource-management/default-slots.ts`

```ts
import type { TimeSlotConfig, CustomTimeSlot } from '@/types/resource-management';

// The three quick-pick chips shown for every resource. End at 17:00 (5 PM).
export const DEFAULT_CUSTOM_SLOTS: CustomTimeSlot[] = [
  { id: 'default-full',      name: 'Full Day',  start_time: '09:00', end_time: '17:00', max_capacity: 1, is_active: true },
  { id: 'default-morning',   name: 'Morning',   start_time: '09:00', end_time: '13:00', max_capacity: 1, is_active: true },
  { id: 'default-afternoon', name: 'Afternoon', start_time: '13:00', end_time: '17:00', max_capacity: 1, is_active: true },
];

// Bounds the custom free-form picker. End at 17:30 (5:30 PM) per the chosen decision,
// intentionally wider than the chips so users can grab sub-ranges past 5 PM.
export const DEFAULT_OPERATING_WINDOW = { start: '09:00', end: '17:30' };

export const DEFAULT_TIME_SLOT_CONFIG: TimeSlotConfig = {
  operating_hours: { default: DEFAULT_OPERATING_WINDOW },
  slot_generation: 'custom',
  custom_slots: DEFAULT_CUSTOM_SLOTS,
};

export const CUSTOM_RANGE_STEP_MINUTES = 30;   // picker granularity
export const CUSTOM_RANGE_MIN_MINUTES  = 30;   // minimum booking duration
```

Every other site imports from here so the defaults never drift.

> Note the deliberate asymmetry: chips end 17:00, operating window ends 17:30. The window is
> what the picker and `validateTimeSlot` allow; the chips are convenience presets within it.

## 6. Changes by layer

### 6.1 Backend — make the 3 defaults universal
**File:** `lib/services/resource-management/time-slot-generator-service.ts`

- Rewrite `generateDefaultSlots(date, resourceId)` (lines 156–174) to delegate:
  `return this.generateFromCustomSlots(DEFAULT_CUSTOM_SLOTS, date, resourceId);`
  This reuses the existing TZ-safe ISO construction and emits named slots (so the picker
  auto-renders them as labeled chips).

**File:** `lib/services/reservation/reservation-service.ts`

- In `getAvailableSlots()` (lines 474–478), always route through the generator:
  `const generatedSlots = TimeSlotGeneratorService.generateSlotsForDate(timeConfig, date, resourceId);`
  (`generateSlotsForDate(undefined, …)` already falls back to `generateDefaultSlots`.)
  Retire/remove the divergent `generateLegacySlots()` (536–568). **Behavior change:**
  resources that previously had *only* the legacy top-level `booking_config.operating_hours`
  (and no `time_slot_config`) now show the 3 named defaults instead of a legacy hourly grid —
  this is the intended outcome.

### 6.2 Backend — validate the custom range (closes the operating-hours gap)
**File:** `lib/services/reservation/reservation-service.ts` — `createReservation()` and
`updateReservation()`.

Before the existing `checkAvailability` overlap check, validate the requested window:

1. Resolve `effectiveConfig = booking_config?.time_slot_config ?? DEFAULT_TIME_SLOT_CONFIG`
   (so config-less resources are bound by the 9:00–17:30 default window — `validateTimeSlot`
   no-ops on `undefined`).
2. Generate the date's slots once. **If the requested `(start_time, end_time)` exactly
   matches a generated slot, accept it** (it's a default chip or an admin-defined slot;
   skip granularity checks so admin slots outside the default step never get rejected).
3. Otherwise treat it as a **custom range** and require all of:
   - `TimeSlotGeneratorService.validateTimeSlot(effectiveConfig, start, end, date).valid`
     (end>start, within operating hours, no break conflict),
   - duration ≥ `CUSTOM_RANGE_MIN_MINUTES` (30),
   - start and end aligned to `CUSTOM_RANGE_STEP_MINUTES` (minutes ∈ {0, 30}).
   On failure, throw with the human-readable reason (surfaced as a toast, same pattern as
   `SLOT_LOCKED`).

Overlap/capacity stays enforced by `checkAvailability` (TS pre-check) + the unchanged
`fn_reservation_enforce_slot_lock` DB trigger (authoritative).

### 6.3 Frontend — the custom start/end picker
**File:** `app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx`

- Keep the 3 default slots rendering as quick-pick chips (already works via `slot_name`
  grouping under "Custom Time Slots").
- Replace the existing `selectionMode: 'single' | 'range'` toggle: keep **"Pick a slot"**
  (chips) and replace **"Time Range"** with **"Custom time"**, which reveals two real
  `<input type="time">` controls:
  - `step={CUSTOM_RANGE_STEP_MINUTES * 60}` (1800 → 30-min steps),
  - `min` / `max` from the resource's operating window
    (`operatingHours.start` / `.end`, see 6.4),
  - client-side validation mirroring 6.2 (end>start, within bounds, ≥30 min, 30-min aligned);
    disable the confirm action until valid.
- On a valid custom selection, build ISO timestamps **using the repo's TZ-safe pattern**
  (`new Date(\`${date}T${hhmm}:00\`).toISOString()` — see the load-bearing comment in
  `time-slot-generator-service.ts:116-119`) and call the existing
  `onSelectSlot(startISO, endISO)` (`time-slot-picker.tsx:16`). The page/form downstream is
  unchanged.

### 6.4 Frontend — pass operating hours to the picker
**File:** `app/(routes)/resource-management/reservations/new/page.tsx`

- Derive `operatingHours = selectedResource?.booking_config?.time_slot_config?.operating_hours?.default ?? DEFAULT_OPERATING_WINDOW`
  and pass it as a prop to `<TimeSlotPicker>`. Config-less resources fall back to the
  9:00–17:30 default window (matching backend validation).

### 6.5 Frontend — cache correctness
**File:** `hooks/reservation/use-reservation-operations.ts`

- In `createReservation` (and `updateReservation`) `onSuccess`, also invalidate
  `['available-slots', …]` and `['month-availability', …]` (currently only
  `['resource-availability']` is invalidated, so the picker otherwise refreshes only on its
  60 s interval). This makes a just-booked window show as taken immediately.

### 6.6 (Optional) Admin visibility of defaults
**File:** `app/(routes)/resource-management/resources/_components/resource-form.tsx`

- Change the fallback config passed to `<TimeSlotConfigComponent>` (≈ lines 1783–1794) from
  the `automatic` shape to `DEFAULT_TIME_SLOT_CONFIG`, so a new resource shows the three
  defaults pre-filled and editable. Presentation-only; correctness is already guaranteed by
  6.1 even if the admin saves an empty config. Add a one-line hint: "Leave empty to use the
  three standard slots (Full Day / Morning / Afternoon)."

## 7. Data flow (after change)

```
User opens booking wizard → step 3 TimeSlotPicker
  ├─ "Pick a slot": chips from useAvailableSlots()
  │     getAvailableSlots → generateSlotsForDate(timeConfig?) 
  │        └─ no config → generateDefaultSlots → 3 named slots
  │     each chip overlap/capacity-checked via fn_resource_slot_conflicts
  └─ "Custom time": two <input type=time>, bounds = operating window (default 9:00–17:30)
        valid pick → onSelectSlot(startISO, endISO)

Submit (booking-form) → createReservation(dto)
  ├─ validate range: matches a generated slot OR (within op-hours + ≥30min + 30-min step)
  ├─ checkAvailability (overlap/capacity pre-check, RPC)
  └─ insert (start_time,end_time) → DB trigger fn_reservation_enforce_slot_lock (authoritative)
        on success → invalidate ['available-slots'], ['month-availability'], ['resource-availability']
```

## 8. Edge cases & rules

- **Overlapping defaults:** "Full Day" (9–5) overlaps both "Morning" (9–1) and "Afternoon"
  (1–5). On a capacity-1 resource, booking Morning leaves Afternoon free but marks Full Day
  taken — handled correctly by the existing overlap logic in `getAvailableSlots`; no special
  handling needed.
- **Admin override preserved:** resources with `slot_generation: 'custom'`/`'automatic'`
  config keep using it (the generator prefers saved config; defaults only fill the gap).
- **Admin slot outside default hours:** the "matches a generated slot → accept" clause in
  6.2 ensures an admin slot deliberately set outside 9:00–17:30 is never rejected by the new
  custom-range validation.
- **Walk-in / non-reservation resources:** unaffected — the slot UI only renders for
  `booking_type` ∈ {reservation, both}.
- **Timezone:** all ISO construction uses the existing `new Date(local).toISOString()`
  pattern; the custom picker must not introduce a naive ISO string (would drift 5:30h in IST).
- **Meeting/venue path:** `venue-reservation.ts` is intentionally not validated against
  operating hours (evening meetings are legitimate).

## 9. Out of scope / explicitly NOT changing

- No DB migration; no schema change (`booking_config` is opaque JSONB).
- No new permission keys — existing `resources.reservations.create/edit/cancel` apply.
- `fn_reservation_enforce_slot_lock` and `fn_resource_slot_conflicts` unchanged.
- `venue-reservation.ts` (anonymous meeting flow) unchanged.
- No per-slot DB capacity (DB capacity stays resource-level `initial_stock_quantity`).
- Recurring bookings, blackout/date-availability logic — unchanged.

## 10. Verification plan

No automated test suite exists; verify by diagnostics + browser as a non-super-admin.

1. `mcp__ide__getDiagnostics` clean on every touched file.
2. **Config-less resource:** booking page shows exactly 3 chips (Full Day / Morning /
   Afternoon), not an hourly grid.
3. **Custom pick:** select 9:00 → 5:30 PM; booking succeeds and only that window is blocked;
   the 1:00–5:00 chip becomes (partly) taken, a non-overlapping window stays free.
4. **Out-of-bounds rejected:** custom pick 7:00 AM or 6:00 PM (outside 9:00–17:30) is blocked
   with a clear message; a 15-min or misaligned pick is rejected.
5. **Overlap:** booking that collides surfaces the holder name/designation (existing alert).
6. **Admin override:** a resource with admin custom slots still shows those, not the defaults.
7. **Cache:** after booking, the slot immediately shows as taken without waiting 60 s.

## 11. Touched files summary

| File | Change |
|------|--------|
| `lib/services/resource-management/default-slots.ts` | **New** — shared default constants. |
| `lib/services/resource-management/time-slot-generator-service.ts` | `generateDefaultSlots` → 3 named slots. |
| `lib/services/reservation/reservation-service.ts` | Route `getAvailableSlots` through generator (retire `generateLegacySlots`); add custom-range validation in `createReservation`/`updateReservation`. |
| `app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx` | Replace "Time Range" mode with real custom start/end picker. |
| `app/(routes)/resource-management/reservations/new/page.tsx` | Pass operating-hours window to picker. |
| `hooks/reservation/use-reservation-operations.ts` | Invalidate `available-slots` + `month-availability` on success. |
| `app/(routes)/resource-management/resources/_components/resource-form.tsx` | *(Optional)* prefill form with the 3 defaults + hint. |
