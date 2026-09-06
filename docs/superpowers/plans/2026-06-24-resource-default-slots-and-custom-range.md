# Resource Default Slots + Custom Time-Range Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every resource three default booking slots (Full Day / Morning / Afternoon) automatically with no admin setup, and let end-users book a free-form custom start/end time within the resource's operating window.

**Architecture:** Slots are computed at read time from `resources.booking_config` JSONB — no slots table, no migration. We redefine the generator's no-config fallback to emit three named slots (covers every resource, including bulk-imported and pre-existing, since generation happens at read time), add a real custom time-range picker in the booking wizard, and wire the dead `validateTimeSlot` into the booking service so out-of-bounds custom ranges are rejected. The authoritative double-booking DB trigger (`fn_reservation_enforce_slot_lock`) is unchanged and already enforces arbitrary windows.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, TanStack Query v5, Shadcn UI, react-hook-form + Zod.

## Global Constraints

- **No DB migration, no schema change** — `booking_config` is opaque JSONB (`z.record(z.any())`).
- **No new permission keys** — existing `resources.reservations.create/edit/cancel` apply.
- **TZ-safe ISO only:** build instants with `new Date(\`${date}T${HH:MM}:00\`).toISOString()`; never emit a naive ISO string (a naive string drifts 5:30h in IST and breaks overlap checks). See the load-bearing comment at `time-slot-generator-service.ts:116-119`.
- **Default window:** custom picker bound = `09:00–17:30`. Quick-pick chips = Full Day `09:00–17:00`, Morning `09:00–13:00`, Afternoon `13:00–17:00`. Granularity = 30-min steps, 30-min minimum.
- **Do NOT touch** `lib/services/meetings/venue-reservation.ts`, `fn_reservation_enforce_slot_lock`, or `fn_resource_slot_conflicts`.
- **No test runner exists** in this repo. Each task verifies with `mcp__ide__getDiagnostics` on the touched files (must show no NEW errors) plus the stated browser check as a non-super-admin user. Never claim "tests pass."
- **Commit** at the end of each task. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Branch is `feat/resource-default-slots-custom-range` (already created; spec committed there).

---

### Task 1: Shared default-slot constants module

**Files:**
- Create: `lib/services/resource-management/default-slots.ts`

**Interfaces:**
- Produces: `DEFAULT_CUSTOM_SLOTS: CustomTimeSlot[]`, `DEFAULT_OPERATING_WINDOW: { start: string; end: string }`, `DEFAULT_TIME_SLOT_CONFIG: TimeSlotConfig`, `CUSTOM_RANGE_STEP_MINUTES: number`, `CUSTOM_RANGE_MIN_MINUTES: number`. Imported by Tasks 2, 4, 5, 6, 8.

- [ ] **Step 1: Create the constants file**

```ts
// lib/services/resource-management/default-slots.ts
// Single source of truth for the product-default booking slots applied to
// every resource that has no admin-configured time_slot_config. Keeping these
// here means the three slots and the custom-picker bounds never drift across
// the generator, the booking service, the picker UI, and the resource form.

import type { TimeSlotConfig, CustomTimeSlot } from '@/types/resource-management';

// The three quick-pick chips shown for every resource. End at 17:00 (5 PM).
export const DEFAULT_CUSTOM_SLOTS: CustomTimeSlot[] = [
  { id: 'default-full',      name: 'Full Day',  start_time: '09:00', end_time: '17:00', max_capacity: 1, is_active: true },
  { id: 'default-morning',   name: 'Morning',   start_time: '09:00', end_time: '13:00', max_capacity: 1, is_active: true },
  { id: 'default-afternoon', name: 'Afternoon', start_time: '13:00', end_time: '17:00', max_capacity: 1, is_active: true },
];

// Bounds the free-form custom picker. Ends at 17:30 (5:30 PM) — intentionally
// wider than the chips so users can grab sub-ranges past 5 PM.
export const DEFAULT_OPERATING_WINDOW = { start: '09:00', end: '17:30' };

export const DEFAULT_TIME_SLOT_CONFIG: TimeSlotConfig = {
  operating_hours: { default: DEFAULT_OPERATING_WINDOW },
  slot_generation: 'custom',
  custom_slots: DEFAULT_CUSTOM_SLOTS,
};

export const CUSTOM_RANGE_STEP_MINUTES = 30; // picker granularity
export const CUSTOM_RANGE_MIN_MINUTES = 30;  // minimum booking duration
```

- [ ] **Step 2: Typecheck the new file**

Run: `mcp__ide__getDiagnostics` for `lib/services/resource-management/default-slots.ts`
Expected: no errors. (Confirms `CustomTimeSlot`/`TimeSlotConfig` shapes match — `max_capacity` and `is_active` are required on `CustomTimeSlot`; `operating_hours` + `slot_generation` are required on `TimeSlotConfig`.)

- [ ] **Step 3: Commit**

```bash
git add lib/services/resource-management/default-slots.ts
git commit -m "feat(reservations): shared default-slot constants module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Make the three default slots universal

**Files:**
- Modify: `lib/services/resource-management/time-slot-generator-service.ts:156-174`
- Modify: `lib/services/reservation/reservation-service.ts:474-478` and remove `:533-568`

**Interfaces:**
- Consumes: `DEFAULT_CUSTOM_SLOTS` (Task 1), existing `generateFromCustomSlots(customSlots, date, resourceId)`.
- Produces: every config-less resource now yields three named slots from `getAvailableSlots`.

- [ ] **Step 1: Rewrite `generateDefaultSlots` to emit the three named slots**

In `lib/services/resource-management/time-slot-generator-service.ts`, add the import at the top (next to the existing `import type` line):

```ts
import { DEFAULT_CUSTOM_SLOTS } from './default-slots';
```

Replace the whole `generateDefaultSlots` method body (currently lines 156-174, the `for (let hour = 9; hour < 17; hour++)` loop) with:

```ts
  /**
   * Default slots applied when a resource has no time_slot_config:
   * Full Day (9-5), Morning (9-1), Afternoon (1-5). Delegates to the custom-slot
   * generator so it reuses the same TZ-safe ISO construction and carries slot_name.
   */
  private static generateDefaultSlots(
    date: string,
    resourceId: string
  ): GeneratedTimeSlot[] {
    return this.generateFromCustomSlots(DEFAULT_CUSTOM_SLOTS, date, resourceId);
  }
```

- [ ] **Step 2: Route `getAvailableSlots` through the generator and drop the legacy fallback**

In `lib/services/reservation/reservation-service.ts`, replace the ternary at lines 475-478:

```ts
    const timeConfig = bookingConfig?.time_slot_config;
    const generatedSlots = timeConfig
      ? TimeSlotGeneratorService.generateSlotsForDate(timeConfig, date, resourceId)
      : this.generateLegacySlots(date, bookingConfig, resourceId);
```

with (note `generateSlotsForDate` already handles `undefined` → `generateDefaultSlots`):

```ts
    const timeConfig = bookingConfig?.time_slot_config;
    const generatedSlots = TimeSlotGeneratorService.generateSlotsForDate(
      timeConfig,
      date,
      resourceId
    );
```

Then delete the now-unused `generateLegacySlots` method (currently lines 533-568, the `/** Generate legacy slots for backward compatibility */` block and its body).

- [ ] **Step 3: Confirm nothing else references `generateLegacySlots`**

Run (Grep tool): pattern `generateLegacySlots` across the repo.
Expected: zero matches after the deletion. If any remain, they must be updated to `getAvailableSlots`/`generateSlotsForDate` before continuing.

- [ ] **Step 4: Typecheck**

Run: `mcp__ide__getDiagnostics` for both `time-slot-generator-service.ts` and `reservation-service.ts`
Expected: no new errors.

- [ ] **Step 5: Browser verify**

Start dev server (`npm run dev`), log in as a non-super-admin, open `/resource-management/reservations/new`, pick a resource that has empty `booking_config`, pick a date, and confirm Step 3 shows exactly three slots — **Full Day, Morning, Afternoon** — under a "Custom Time Slots" header (not an hourly 9–5 grid).

- [ ] **Step 6: Commit**

```bash
git add lib/services/resource-management/time-slot-generator-service.ts lib/services/reservation/reservation-service.ts
git commit -m "feat(reservations): three default slots for all resources at read time

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add `validateCustomRange` to the generator service

**Files:**
- Modify: `lib/services/resource-management/time-slot-generator-service.ts` (add a static method after `validateTimeSlot`, ~line 245)

**Interfaces:**
- Consumes: existing `validateTimeSlot(config, start, end, date)` and `timeToMinutes`.
- Produces: `static validateCustomRange(config: TimeSlotConfig | undefined, startTime: string, endTime: string, opts?: { stepMinutes?: number; minMinutes?: number }): { valid: boolean; reason?: string }`. Consumed by Tasks 4 and 5.

- [ ] **Step 1: Add the method**

In `lib/services/resource-management/time-slot-generator-service.ts`, immediately after the closing brace of `validateTimeSlot` (after line 245, before `timeToMinutes`), insert:

```ts
  /**
   * Validate a free-form custom booking range. Reuses validateTimeSlot for the
   * end>start / within-operating-hours / break-conflict checks, then adds a
   * minimum-duration and step-alignment guard for the custom picker.
   * NOTE: validateTimeSlot returns {valid:true} when config is undefined, so
   * callers must pass an effective config (e.g. DEFAULT_TIME_SLOT_CONFIG) to
   * actually enforce operating hours.
   */
  static validateCustomRange(
    config: TimeSlotConfig | undefined,
    startTime: string,
    endTime: string,
    opts?: { stepMinutes?: number; minMinutes?: number }
  ): { valid: boolean; reason?: string } {
    const base = this.validateTimeSlot(config, startTime, endTime, '');
    if (!base.valid) return base;

    const step = opts?.stepMinutes ?? 30;
    const min = opts?.minMinutes ?? 30;

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;

    if (durationMinutes < min) {
      return { valid: false, reason: `Booking must be at least ${min} minutes long` };
    }
    if (start.getMinutes() % step !== 0 || end.getMinutes() % step !== 0) {
      return {
        valid: false,
        reason: `Start and end times must align to ${step}-minute steps`,
      };
    }
    return { valid: true };
  }
```

- [ ] **Step 2: Typecheck**

Run: `mcp__ide__getDiagnostics` for `time-slot-generator-service.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/services/resource-management/time-slot-generator-service.ts
git commit -m "feat(reservations): validateCustomRange guard (op-hours + step + min duration)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Enforce custom-range validation in the booking service

**Files:**
- Modify: `lib/services/reservation/reservation-service.ts` — add static imports + a private helper, wire into `createReservation` (~after line 170) and `updateReservation` (~after line 288)

**Interfaces:**
- Consumes: `DEFAULT_TIME_SLOT_CONFIG`, `CUSTOM_RANGE_STEP_MINUTES`, `CUSTOM_RANGE_MIN_MINUTES` (Task 1); `TimeSlotGeneratorService.generateSlotsForDate` + `validateCustomRange` (Tasks 2, 3).
- Produces: a thrown `Error` with a human-readable reason when a requested window is out of bounds; surfaced via the existing `onError` toast.

- [ ] **Step 1: Add static imports at the top of `reservation-service.ts`**

```ts
import { TimeSlotGeneratorService } from '@/lib/services/resource-management/time-slot-generator-service';
import {
  DEFAULT_TIME_SLOT_CONFIG,
  CUSTOM_RANGE_STEP_MINUTES,
  CUSTOM_RANGE_MIN_MINUTES,
} from '@/lib/services/resource-management/default-slots';
```

(Note: `getAvailableSlots` also uses a dynamic `await import` of `TimeSlotGeneratorService`; that may stay as-is — a static import alongside it is fine since the generator only imports types, so there is no circular dependency.)

- [ ] **Step 2: Add the private helpers inside the `ReservationService` class**

Add these two private static methods (e.g. just above `createReservation` at line 144):

```ts
  /** Local YYYY-MM-DD for an ISO instant (matches how generated slots are keyed). */
  private static toLocalDateString(iso: string): string {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Guard a requested booking window. Accepts it when it exactly matches a
   * generated slot (a default chip or an admin-configured slot, which are valid
   * by construction); otherwise validates it as a free-form custom range within
   * the resource's operating hours. Throws with a human-readable reason.
   */
  private static validateBookingRange(
    bookingConfig: any,
    resourceId: string,
    startTime: string,
    endTime: string
  ): void {
    const timeConfig = bookingConfig?.time_slot_config;
    const effectiveConfig = timeConfig ?? DEFAULT_TIME_SLOT_CONFIG;
    const bookingDate = this.toLocalDateString(startTime);

    const generated = TimeSlotGeneratorService.generateSlotsForDate(
      effectiveConfig,
      bookingDate,
      resourceId
    );
    const matchesSlot = generated.some(
      (s) => s.start_time === startTime && s.end_time === endTime
    );
    if (matchesSlot) return;

    const check = TimeSlotGeneratorService.validateCustomRange(
      effectiveConfig,
      startTime,
      endTime,
      { stepMinutes: CUSTOM_RANGE_STEP_MINUTES, minMinutes: CUSTOM_RANGE_MIN_MINUTES }
    );
    if (!check.valid) {
      throw new Error(check.reason || 'Invalid booking time range');
    }
  }
```

- [ ] **Step 3: Wire into `createReservation`**

In `createReservation`, the resource is already loaded at lines 166-170 (`select('approval_config, booking_config')`). Immediately after that block (before line 172 `const requiresApproval = ...`), insert:

```ts
    // Reject out-of-bounds custom time ranges before inserting. Booked-by-slot
    // selections (default chips / admin slots) pass through untouched.
    this.validateBookingRange(
      (resource as any)?.booking_config,
      dto.resource_id,
      dto.start_time,
      dto.end_time
    );
```

- [ ] **Step 4: Wire into `updateReservation`**

In `updateReservation`, inside the `if (dto.start_time || dto.end_time) { ... }` block, immediately after the `availability` check throws (after line 288, before the block's closing `}` at line 289), insert:

```ts
      const { data: res } = await supabase
        .from('resources')
        .select('booking_config')
        .eq('id', existing.resource_id)
        .single();
      this.validateBookingRange(
        (res as any)?.booking_config,
        existing.resource_id,
        dto.start_time || existing.start_time,
        dto.end_time || existing.end_time
      );
```

- [ ] **Step 5: Typecheck**

Run: `mcp__ide__getDiagnostics` for `reservation-service.ts`
Expected: no new errors.

- [ ] **Step 6: Browser verify (after Task 5/6 land the UI, or via an existing chip now)**

For now, confirm a normal **chip** booking still succeeds end-to-end (the `matchesSlot` clause must let it through). Full out-of-bounds rejection is exercised in Task 6's browser check.

- [ ] **Step 7: Commit**

```bash
git add lib/services/reservation/reservation-service.ts
git commit -m "feat(reservations): validate custom booking range in create/update

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Custom start/end picker in the time-slot picker

**Files:**
- Modify: `app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx`

**Interfaces:**
- Consumes: `DEFAULT_OPERATING_WINDOW` (Task 1), `TimeSlotGeneratorService.validateCustomRange` (Task 3), existing `onSelectSlot(startTime, endTime)`.
- Produces: a `TimeSlotPicker` that accepts an optional `operatingHours?: { start: string; end: string }` prop (consumed by Task 6) and offers a "Custom time" mode.

- [ ] **Step 1: Add imports**

After the existing imports (after line 11), add:

```ts
import { Input } from '@/components/ui/input';
import { TimeSlotGeneratorService } from '@/lib/services/resource-management/time-slot-generator-service';
import { DEFAULT_OPERATING_WINDOW } from '@/lib/services/resource-management/default-slots';
```

- [ ] **Step 2: Add the `operatingHours` prop**

Replace the `TimeSlotPickerProps` interface (lines 13-19) with:

```ts
interface TimeSlotPickerProps {
  resourceId: string;
  date: string;
  onSelectSlot: (startTime: string, endTime: string) => void;
  selectedStartTime?: string;
  selectedEndTime?: string;
  operatingHours?: { start: string; end: string };
}
```

Replace the destructuring (lines 21-27) with:

```ts
export function TimeSlotPicker({
  resourceId,
  date,
  onSelectSlot,
  selectedStartTime,
  selectedEndTime,
  operatingHours = DEFAULT_OPERATING_WINDOW
}: TimeSlotPickerProps) {
```

- [ ] **Step 3: Replace mode state and add custom state**

Replace lines 28-30:

```ts
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>(
    'single'
  );
```

with:

```ts
  const [selectionMode, setSelectionMode] = useState<'slots' | 'custom'>('slots');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
```

- [ ] **Step 4: Simplify `handleSlotClick` to single-select**

Replace the whole `handleSlotClick` (lines 60-85) with:

```ts
  // Handle slot click — single-select; the custom-time mode covers ranges.
  const handleSlotClick = (slot: TimeSlot) => {
    if (!slot.is_available) return;
    onSelectSlot(slot.start_time, slot.end_time);
  };
```

- [ ] **Step 5: Add the custom-confirm handler**

Immediately after `handleClearSelection` (after line 90), add:

```ts
  // Confirm a free-form custom time range (reuses the server-side validator).
  const handleCustomConfirm = () => {
    if (!customStart || !customEnd) {
      setCustomError('Please choose a start and end time.');
      return;
    }
    // TZ-safe: build instants from the local date + picked HH:MM, matching how
    // generated slots are constructed (see time-slot-generator-service.ts).
    const startISO = new Date(`${date}T${customStart}:00`).toISOString();
    const endISO = new Date(`${date}T${customEnd}:00`).toISOString();
    const config = {
      operating_hours: { default: operatingHours },
      slot_generation: 'custom' as const
    };
    const result = TimeSlotGeneratorService.validateCustomRange(
      config,
      startISO,
      endISO,
      { stepMinutes: 30, minMinutes: 30 }
    );
    if (!result.valid) {
      setCustomError(result.reason || 'Invalid time range.');
      return;
    }
    setCustomError(null);
    onSelectSlot(startISO, endISO);
  };
```

- [ ] **Step 6: Replace the mode-toggle buttons**

Replace the toggle block (lines 263-278, the two `Single Slot` / `Time Range` buttons) with:

```tsx
          <div className='flex items-center gap-2'>
            <Button
              variant={selectionMode === 'slots' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setSelectionMode('slots')}
            >
              Pick a slot
            </Button>
            <Button
              variant={selectionMode === 'custom' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setSelectionMode('custom')}
            >
              Custom time
            </Button>
          </div>
```

- [ ] **Step 7: Insert the custom panel after the Selection Summary**

Immediately after the Selection Summary block's closing `)}` (line 305) and before the `{/* Loading State */}` comment (line 307), insert:

```tsx
        {/* Custom Time Range */}
        {selectionMode === 'custom' && (
          <div className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <label className='text-sm font-medium'>Start time</label>
                <Input
                  type='time'
                  step={1800}
                  min={operatingHours.start}
                  max={operatingHours.end}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className='space-y-1.5'>
                <label className='text-sm font-medium'>End time</label>
                <Input
                  type='time'
                  step={1800}
                  min={operatingHours.start}
                  max={operatingHours.end}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>
              Pick any range between {operatingHours.start} and {operatingHours.end},
              in 30-minute steps (minimum 30 minutes).
            </p>
            {customError && (
              <p className='text-sm text-destructive'>{customError}</p>
            )}
            <Button
              onClick={handleCustomConfirm}
              disabled={!customStart || !customEnd}
            >
              Set custom time
            </Button>
          </div>
        )}
```

- [ ] **Step 8: Gate the slot grid behind `slots` mode**

Wrap the existing slot-rendering region so it only shows in `slots` mode. Insert the opening line immediately before the `{/* Loading State */}` comment (now just after the custom panel from Step 7):

```tsx
        {selectionMode === 'slots' && (
          <>
```

and insert the closing line immediately after the Statistics block's closing `)}` (line 399, the last block before `</CardContent>`):

```tsx
          </>
        )}
```

(The Loading / Empty / Custom-named / Period-grouped / Statistics blocks in between are unchanged — they are now children of this fragment.)

- [ ] **Step 9: Typecheck**

Run: `mcp__ide__getDiagnostics` for `time-slot-picker.tsx`
Expected: no errors. (If `'range'`/`'single'` are referenced anywhere else in the file, they must be removed — Steps 3-8 remove all of them.)

- [ ] **Step 10: Commit**

```bash
git add "app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx"
git commit -m "feat(reservations): real custom start/end time picker in booking wizard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Pass the resource's operating hours to the picker

**Files:**
- Modify: `app/(routes)/resource-management/reservations/new/page.tsx:261-267`

**Interfaces:**
- Consumes: `TimeSlotPicker`'s optional `operatingHours` prop (Task 5). Passing `undefined` for a config-less resource is intentional — the picker falls back to `DEFAULT_OPERATING_WINDOW`.

- [ ] **Step 1: Add the prop to the `<TimeSlotPicker>` usage**

Replace the `<TimeSlotPicker ... />` block (lines 261-267) with:

```tsx
            <TimeSlotPicker
              resourceId={selectedResource.id}
              date={selectedDate}
              onSelectSlot={handleTimeSlotSelect}
              selectedStartTime={selectedStartTime}
              selectedEndTime={selectedEndTime}
              operatingHours={
                (selectedResource as any).booking_config?.time_slot_config
                  ?.operating_hours?.default
              }
            />
```

- [ ] **Step 2: Typecheck**

Run: `mcp__ide__getDiagnostics` for `new/page.tsx`
Expected: no errors.

- [ ] **Step 3: Browser verify the full custom flow**

As a non-super-admin: open the booking wizard, pick a resource + date, switch to **Custom time**.
- Pick `09:00 → 17:30` → "Set custom time" → the Selection Summary shows 9:00 AM – 5:30 PM and Step 4 becomes reachable; complete the booking and confirm it succeeds.
- Re-open the same resource/date: the slots view should now show the overlapping default chips (e.g. Afternoon) as **Booked** with the holder name, while a non-overlapping window stays free.
- Try a custom pick outside hours (e.g. start `07:00` or end `18:00`): "Set custom time" shows an inline error and does not advance. Confirm the server also rejects it if forced (it will throw → red toast).

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/resource-management/reservations/new/page.tsx"
git commit -m "feat(reservations): bound custom picker by per-resource operating hours

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Invalidate slot caches on booking

**Files:**
- Modify: `hooks/reservation/use-reservation-operations.ts:35` and `:104`

**Interfaces:**
- Consumes: existing query keys `['available-slots', resourceId, date]` and `['month-availability', …]`.

- [ ] **Step 1: Add invalidations in `createReservation.onSuccess`**

In `hooks/reservation/use-reservation-operations.ts`, immediately after line 35 (`queryClient.invalidateQueries({ queryKey: ['resource-availability'] });` in the create mutation), add:

```ts
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['month-availability'] });
```

- [ ] **Step 2: Add the same in `updateReservation.onSuccess`**

Immediately after line 104 (`queryClient.invalidateQueries({ queryKey: ['resource-availability'] });` in the update mutation), add:

```ts
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['month-availability'] });
```

- [ ] **Step 3: Typecheck**

Run: `mcp__ide__getDiagnostics` for `use-reservation-operations.ts`
Expected: no errors.

- [ ] **Step 4: Browser verify**

Book a slot, then (without manually refreshing) return to the same resource/date in the wizard — the just-booked window shows as **Booked** immediately, rather than only after the 60-second refetch.

- [ ] **Step 5: Commit**

```bash
git add hooks/reservation/use-reservation-operations.ts
git commit -m "fix(reservations): invalidate available-slots + month-availability on booking

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 (Optional): Show the three defaults in the admin resource form

**Files:**
- Modify: `app/(routes)/resource-management/resources/_components/resource-form.tsx:1783-1794`

**Interfaces:**
- Consumes: `DEFAULT_TIME_SLOT_CONFIG` (Task 1). Presentation-only — read-time defaults (Task 2) already guarantee correctness if an admin saves an empty config.

- [ ] **Step 1: Import the default config**

Add near the top of `resource-form.tsx` (with the other `@/lib/services/...` or type imports):

```ts
import { DEFAULT_TIME_SLOT_CONFIG } from '@/lib/services/resource-management/default-slots';
```

- [ ] **Step 2: Swap the `<TimeSlotConfigComponent>` fallback**

Replace the inline fallback object (lines 1784-1793) so a new resource shows the three defaults pre-filled and editable:

```tsx
          <TimeSlotConfigComponent
            config={bookingConfig.time_slot_config || DEFAULT_TIME_SLOT_CONFIG}
            onChange={(timeConfig: TimeSlotConfig) =>
              updateBookingConfig('time_slot_config', timeConfig)
            }
          />
```

- [ ] **Step 3: Typecheck**

Run: `mcp__ide__getDiagnostics` for `resource-form.tsx`
Expected: no new errors.

- [ ] **Step 4: Browser verify**

Open `/resource-management/resources/new`, set Booking Type to Reservation → the Time Slot Configuration card shows the three default custom slots (Full Day / Morning / Afternoon) pre-filled and editable; "Add Slot" still adds more.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/resource-management/resources/_components/resource-form.tsx"
git commit -m "feat(reservations): prefill resource form with the three default slots

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

1. `mcp__ide__getDiagnostics` clean on all seven (eight with optional) touched files.
2. Config-less resource → 3 chips, not hourly. (Task 2)
3. Custom 9:00→5:30 booking succeeds and blocks only that window; overlapping chip shows Booked + holder, non-overlapping stays free. (Tasks 4-6)
4. Out-of-bounds / misaligned custom pick rejected client-side (inline error) and server-side (toast). (Tasks 3-6)
5. Booked slot updates immediately without waiting 60 s. (Task 7)
6. A resource with admin custom slots still shows those, not the defaults. (Task 2 override)
7. Walk-in resources unaffected; `venue-reservation.ts` meeting path untouched.
