# Campus Living — Housekeeping Module Rebuild

**Spec date:** 2026-09-07
**Status:** Design approved, implementation plan pending
**Supersedes:** `housekeeping-slot-booking-spec-2026-06-10.md` (the slot-booking module) and the
undocumented `hostel_cleaning_schedules`/`_tasks` recurring-sweep module.

---

## 1. Why this rebuild exists

The existing Housekeeping module is two unrelated systems sharing a name:

1. **Recurring block-level sweeps** — `hostel_cleaning_schedules` + `hostel_cleaning_tasks`,
   generated nightly by a cron RPC, with free-text `assigned_staff`.
2. **Resident slot booking** — `hostel_cleaning_bookings`, tier-gated, with
   `assigned_profile_id` picked from a role-permission-derived staff list.

Neither models what the institution actually needs: **dynamic cleaning types** with their own
duration, cost, room-category eligibility and usage frequency; a **cleaner directory**;
**photographic evidence** of each job; and a **feedback loop with consequences**.

Both systems are replaced wholesale. The data is negligible (3 bookings, 4 schedules,
144 tasks) and nothing else in the database depends on it.

### 1.1 A correctness bug the rebuild fixes

`hostel_allocations.learner_id` is a foreign key to **`profiles.id`**, not to
`learners_profiles.id`, despite the column name. All 714 live allocations resolve that way;
zero resolve through `profiles.learner_id`.

The old `hostel_cleaning_bookings.learner_id` FK pointed at `learners_profiles` — a
*different id space*. The old module was joining keys that cannot match. With only 3 rows,
nobody noticed.

**The new module uses one chain throughout:**

```
auth.uid()  =  profiles.id  =  hostel_allocations.learner_id
```

> **Out of scope but worth a follow-up ticket:** `lib/services/campus-living/mess-rating-gate.ts`
> resolves tiers via `profiles.learner_id → hostel_allocations.learner_id`, which matches zero
> rows for all 714 residents. The mess rating tier gate is currently non-functional. Do not copy
> that chain.

---

## 2. Removal

Verified before writing this spec: **no inbound foreign keys and no external RLS policy**
references any of the three tables. The drop is contained.

### 2.1 Database

| Kind | Items |
|---|---|
| Tables | `hostel_cleaning_bookings` (3 rows), `hostel_cleaning_schedules` (4), `hostel_cleaning_tasks` (144) |
| Functions | `fn_housekeeping_assign_booking`, `_assignable_staff`, `_available_slots`, `_book_slot`, `_booking_board`, `_cancel_booking`, `_entitlement_tier`, `_generate_tasks`, `_mark_booking`, `_my_entitlement`, `_schedule_due`, and the trigger fn `_on_cleaning_schedule_seed_task` |
| Enums | `cleaning_type_enum`, `cleaning_frequency_enum`, `cleaning_task_status_enum` |
| Policy rows | 5 of 7 deleted: `slot_duration_minutes`, `service_window`, `capacity_per_slot_per_block`, `cancellation_cutoff_minutes`, `weekly_quota_by_tier`. **Surviving:** `booking_enabled`, `booking_advance_days` |
| Permission keys | `campus_living.housekeeping.schedule` and `.mark_done` revoked from all holders. `.view` survives, re-labelled |

No archival. Approved as irreversible.

### 2.2 Files deleted

```
lib/services/campus-living/housekeeping-service.ts
lib/services/campus-living/housekeeping-booking-service.ts
lib/services/campus-living/housekeeping-policy-keys.ts
hooks/campus-living/use-hostel-housekeeping.ts
hooks/campus-living/use-housekeeping-bookings.ts
app/api/cron/campus-living/housekeeping-task-generator/route.ts

app/(routes)/campus-living/housekeeping/page.tsx
app/(routes)/campus-living/housekeeping/schedules/page.tsx
app/(routes)/campus-living/housekeeping/tasks/page.tsx
app/(routes)/campus-living/housekeeping/my-work/page.tsx
app/(routes)/campus-living/housekeeping/bookings/page.tsx
app/(routes)/campus-living/housekeeping/bookings/_components/booking-day-board.tsx
app/(routes)/campus-living/housekeeping/bookings/_components/assign-booking-dialog.tsx
app/(routes)/campus-living/my-hostel/housekeeping/page.tsx
app/(routes)/campus-living/my-hostel/housekeeping/_components/*   (6 files)
app/(routes)/campus-living/my-hostel/_components/room-cleaning-entry-card.tsx
app/(routes)/campus-living/settings/housekeeping/page.tsx
app/(routes)/campus-living/settings/housekeeping/_components/housekeeping-policy-form.tsx
```

### 2.3 Files edited

| File | Change |
|---|---|
| `app/(routes)/campus-living/settings/mess-services/page.tsx` | **BUILD-BREAKER.** Hard-imports `HousekeepingPolicyForm` (line 42) and renders it as Section 2 (lines 132–138). Remove the import, the section, and the header comment at line 12. |
| `app/(routes)/campus-living/settings/page.tsx` | Remove the "Housekeeping Booking" index card (line 24) |
| `lib/services/campus-living/index.ts` | Remove the `HousekeepingService` barrel export (line 44) |
| `lib/constants/permissions.ts` | Replace the 3-key `// Housekeeping` block with the 8 new keys (§7) |
| `lib/sidebarMenuLink.ts` | Replace the 3 route→permission entries with the new route set |
| `app/(routes)/campus-living/nav-config.ts` | Replace the Housekeeping nav subtree (16 lines) with the new pages |
| `lib/ai-routines/platform-ops.ts` | Remove the `campus-housekeeping-task-generator` metadata block |
| `lib/campus-living/guide/content.ts` | Rewrite the `id: 'cleaning'` resident step; drop the Housekeeping settings bullet; fix the line-31 prose |
| `lib/navigation/route-manifest.generated.ts` | **Do not hand-edit** — regenerate with `npm run gen:routes` |
| `types/supabase.ts` | **Do not hand-edit** — regenerate after the migrations |

**Left alone, verified as unrelated despite the name:** `lib/policies/keys.ts`
(`bed_econ.housekeeping_cost_per_room_month` is a cost line item), `lib/campus-walk/*`
(the plain English word), `components/dashboard/decision-queue-item.tsx` (a comment),
and `my-hostel/_components/wins-feed-card.tsx:25` (a soft label map — the new module keeps
the `housekeeping` recognition event tag, so it stays correct).

---

## 3. Data model

Nine tables. Every foreign key is indexed in the same migration that creates it. Every table
enables RLS in the same migration that creates it.

### 3.1 Configuration (warden-owned)

**`hostel_cleaning_types`** — the dynamic type catalog

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `institution_id` | uuid NOT NULL → institutions | indexed |
| `name` | text NOT NULL | `UNIQUE (institution_id, lower(name))` |
| `description` | text | |
| `duration_minutes` | int NOT NULL | `CHECK > 0` — drives slot length |
| `usage_limit_count` | int NOT NULL | `CHECK >= 1` |
| `usage_period` | text NOT NULL | `CHECK IN ('day','week','month')` |
| `is_active` | boolean NOT NULL DEFAULT true | |
| `sort_order` | int NOT NULL DEFAULT 0 | |
| `created_at` / `updated_at` / `created_by` | | |

**`hostel_cleaning_type_expenses`** — N expected-cost lines per type

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `type_id` | uuid NOT NULL → types **ON DELETE CASCADE** | indexed |
| `institution_id` | uuid NOT NULL | denormalized for RLS speed |
| `item_name` | text NOT NULL | e.g. "Phenyl" |
| `unit` | text | e.g. "litre", "piece" |
| `quantity` | numeric(10,2) NOT NULL | `CHECK > 0` |
| `unit_cost_inr` | numeric(10,2) NOT NULL | `CHECK >= 0` |
| `line_total_inr` | numeric(12,2) | `GENERATED ALWAYS AS (quantity * unit_cost_inr) STORED` |
| `sort_order` | int NOT NULL DEFAULT 0 | |

**`hostel_cleaning_type_categories`** — which room categories may book a type

| Column | Type | Notes |
|---|---|---|
| `type_id` | uuid NOT NULL → types ON DELETE CASCADE | |
| `category_id` | uuid NOT NULL → hostel_categories | indexed |
| | | `PRIMARY KEY (type_id, category_id)` |

> **An empty set means nobody can book this type.** It fails closed, not open. The types UI
> must show a warning on a type with no categories selected, because it is invisible to every
> learner.
>
> Note `hostel_categories` is a **global lookup with no `institution_id`** (12 rows, gender-split).
> The junction is what makes a type institution-scoped.

**`hostel_cleaners`** — the cleaner directory

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `institution_id` | uuid NOT NULL → institutions | indexed |
| `full_name` | text NOT NULL | |
| `phone` | text | |
| `gender` | text | `CHECK IN ('Male','Female','Other')` — repo canonical domain |
| `employee_code` | text | free text, no FK |
| `working_days` | int[] NOT NULL DEFAULT '{1,2,3,4,5,6}' | Postgres DOW: 0=Sunday … 6=Saturday. Default is Mon–Sat. Same convention as `hostel_cleaning_availability.weekday` |
| `shift_start` / `shift_end` | time | |
| `is_active` | boolean NOT NULL DEFAULT true | |
| `notes` | text | |

Cleaners are **directory records, not system users.** They have no `profile_id` and cannot log
in. Nothing in the flow requires them to. (A nullable `staff_id → staff(id)` link, mirroring
`hostel_wardens.staff_id`, is a clean future extension if HR reconciliation is ever wanted —
deliberately out of scope now.)

**`hostel_cleaner_blocks`** — which blocks a cleaner serves

`(cleaner_id, block_id)` composite PK, both FKs indexed.

**`hostel_cleaning_availability`** — per-block weekly service pattern

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `institution_id` | uuid NOT NULL | indexed |
| `block_id` | uuid NOT NULL → hostel_blocks | |
| `weekday` | int NOT NULL | `CHECK BETWEEN 0 AND 6`, 0=Sunday |
| `is_open` | boolean NOT NULL DEFAULT true | |
| `window_start` / `window_end` | time NOT NULL | `CHECK window_end > window_start` |
| `capacity` | int NOT NULL DEFAULT 1 | parallel cleanings the block supports per slot |
| | | `UNIQUE (block_id, weekday)` |

### 3.2 Operational

**`hostel_cleaning_bookings`** — the core record

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `institution_id` | uuid NOT NULL → institutions | indexed |
| `block_id` | uuid NOT NULL → hostel_blocks | indexed |
| `room_id` | uuid NOT NULL → hostel_rooms | indexed |
| `allocation_id` | uuid NOT NULL → hostel_allocations | |
| `learner_id` | uuid NOT NULL **→ profiles(id)** | the booker — see §1.1 |
| `type_id` | uuid NOT NULL → types **ON DELETE RESTRICT** | history must not vanish |
| `booking_date` | date NOT NULL | |
| `slot_start` / `slot_end` | time NOT NULL | `slot_end = slot_start + type.duration_minutes` |
| `status` | text NOT NULL DEFAULT 'booked' | see §4 |
| `cleaner_id` | uuid → hostel_cleaners | nullable until assigned |
| `assigned_at` / `assigned_by` | | |
| `started_at` / `finished_at` | timestamptz | |
| `feedback_due_at` | timestamptz NOT NULL | `booking_date` 23:59:59 Asia/Kolkata. **Display and notification scheduling only** — the hold predicate is `booking_date < p_date` (§5.3), which is the authority |
| `expected_cost_inr` | numeric(12,2) NOT NULL | **snapshot** of the type's expense total |
| `type_name` | text NOT NULL | **snapshot** |
| `duration_minutes` | int NOT NULL | **snapshot** |
| `waived_at` / `waived_by` / `waive_reason` | | the hold safety valve, §5.4 |
| `cancelled_at` / `cancelled_by` / `cancel_reason` | | |
| `notes` | text | learner's note at booking time |

The three snapshot columns exist so that renaming a type, editing its expenses, or deactivating
it never rewrites the history of jobs already done under the old definition.

**The room lock is a database constraint, not a check in application code:**

```sql
CREATE UNIQUE INDEX ux_hk_one_live_booking_per_room
  ON hostel_cleaning_bookings (room_id)
  WHERE status IN ('booked','assigned','in_progress','awaiting_feedback');
```

Two roommates tapping Book in the same second produce one booking and one `23505`. There is no
race window to reason about, and no application path can bypass it.

Supporting indexes: `(institution_id, booking_date)`, `(block_id, booking_date)`,
`(room_id, booking_date)`, `(cleaner_id, booking_date)`, and a partial index on
`status` where `status = 'awaiting_feedback'` (the hold lookup, §5.2).

**`hostel_cleaning_booking_photos`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `booking_id` | uuid NOT NULL → bookings ON DELETE CASCADE | indexed |
| `institution_id` | uuid NOT NULL | |
| `phase` | text NOT NULL | `CHECK IN ('before','after')` |
| `drive_file_id` | text NOT NULL | |
| `drive_url` | text NOT NULL | |
| `file_name` / `mime_type` / `size_bytes` | | |
| `uploaded_by` | uuid NOT NULL → profiles | |
| `uploaded_at` | timestamptz NOT NULL DEFAULT now() | |

**`hostel_cleaning_feedback`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `booking_id` | uuid NOT NULL → bookings ON DELETE CASCADE | indexed |
| `institution_id` | uuid NOT NULL | |
| `room_id` | uuid NOT NULL | |
| `learner_id` | uuid NOT NULL → profiles(id) | the rater |
| `rating` | int NOT NULL | `CHECK BETWEEN 1 AND 5` |
| `comment` | text | optional |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| | | `UNIQUE (booking_id, learner_id)` |

---

## 4. Lifecycle

```
booked ──assign cleaner──► assigned ──BEFORE photo──► in_progress
                                    ──AFTER photo───► awaiting_feedback
                                    ──any roommate rates──► completed

booked / assigned ──► cancelled
```

**Transition rules, enforced in the RPC *and* by constraint:**

- An **AFTER** photo is refused unless a BEFORE photo exists for the booking.
- `completed` is refused unless at least one `hostel_cleaning_feedback` row exists.
- A **learner may cancel only while `status = 'booked'`** (no cleaner assigned yet). Once
  assigned, only a warden with `.cancel` may cancel.
- A cancelled booking does **not** count against the room's quota and releases the room lock
  immediately (the partial unique index excludes `cancelled`).

---

## 5. The three gates

### 5.1 Eligibility — room category

The room's `hostel_rooms.category_id` must appear in the type's
`hostel_cleaning_type_categories`.

**Decision: the seated room's category decides, not the learner's billed category.**
The old module resolved `learners_profiles.hostel_category_id` first and fell back to the
room; the two diverge for roughly 61 residents. Everything in this design is room-shaped — the
booking, the lock, the quota, the photos, the feedback — so cleaning a Premium room is a
Premium job regardless of what its occupant is billed. Making bookability depend on *who is
asking* would let two roommates see different options for the same room.

**Never gate on `hostel_allocations.tier_id`.** It is dead in production: all 1,094 rows say
`standard`.

### 5.2 Quota — per room, rolling window

Counted **per room**, over a rolling window ending on the booking date, sized by the type's own
`usage_period`:

| `usage_period` | Window |
|---|---|
| `day` | the booking date itself |
| `week` | the 7 days ending on the booking date |
| `month` | the 30 days ending on the booking date |

Bookings in any status except `cancelled` count. So "Toilet Cleaning, 2 per week" and
"Deep Cleaning, 1 per month" coexist independently on the same room.

### 5.3 Feedback → attendance hold

Computed live. **No cron job, no stored flag, nothing to fall out of sync.**

```
fn_cl_housekeeping_feedback_holds(p_institution_id, p_block_id, p_date)
  → bookings WHERE status = 'awaiting_feedback'
       AND booking_date < p_date          -- the hold starts the NEXT day
       AND waived_at IS NULL
       AND NOT EXISTS (feedback for this booking)
  → expanded to every currently-allocated learner in that room
```

Room membership uses `fn_cl_roster_statuses()` — the one predicate for who counts as a resident.

**Enforced at both layers**, because a UI-only guard on an RLS-writable table is decorative:

1. **Service.** `HostelAttendanceService.getMarkableResidents` returns a `feedback_hold` per
   learner, shaped like the academic side's `LeaveBlockInfo` / `AttendanceLeaveResult`
   (`types/leaves.ts:383`) so the mark page renders a housekeeping hold and a leave block
   through the same banner. Bulk marking **pre-filters held learners out** and reports them,
   so one held learner never fails a whole block's insert.
2. **Trigger.** `BEFORE INSERT OR UPDATE ON hostel_attendance` raises when the learner has an
   active hold for that date. Cheap: a single `EXISTS` against the partial index on
   `status = 'awaiting_feedback'`, of which a handful of rows exist at any moment.

The moment any roommate rates, the booking becomes `completed`, and the hold disappears for the
whole room on the next query. Same function, nothing to run.

> **Accepted risk.** The trigger is new plumbing on a hot path — `hostel_attendance` has 15,822
> rows and is written in bulk. The mitigation is the indexed `EXISTS` plus the service-side
> pre-filter. If it proves costly in practice, the trigger can be dropped without changing any
> other part of the design; the service check would then stand alone, weaker but functional.

### 5.4 The waive valve

A warden holding `campus_living.housekeeping.waive` may release a hold with a **mandatory
reason**, stamped onto the booking (`waived_at`, `waived_by`, `waive_reason`).

Without this, a room whose learners have left campus or lost account access is attendance-blocked
forever. All 714 current residents do have logins, so this should be rare — but a gate with no
escape hatch is an outage waiting to happen.

### 5.5 Notification, so the block is never a surprise

`hostel-notification-rules-service.ts` gains a **"housekeeping feedback pending"** trigger,
fired when a booking enters `awaiting_feedback`. Every learner in the room is notified that
evening, before the hold lands the next morning. A block nobody was warned about is just a
mystery to the person hitting it.

---

## 6. Slot generation

```
fn_cl_housekeeping_slots(p_room_id, p_type_id, p_date)
  → SETOF (slot_start, slot_end, remaining_capacity, is_bookable, reason)
```

1. Resolve the room's block; read `hostel_cleaning_availability` for `(block_id, weekday(p_date))`.
2. If closed, return no rows.
3. Step from `window_start` by the **type's** `duration_minutes` until `window_end`.
   A 30-minute type yields 30-minute slots; a 90-minute type yields 90-minute slots.
4. For each slot, count non-cancelled bookings in that block overlapping it; compare to `capacity`.
5. `reason` carries `slot_full` / `past` / `closed` so the UI can grey a slot with an explanation
   rather than silently omitting it.

---

## 7. Permissions

Replace the 3 old keys with 8. Catalog entry **and** role grants ship in the *same* migration —
a declared-but-ungranted key renders an empty page with no error.

| Key | Label |
|---|---|
| `campus_living.housekeeping.view` | View Housekeeping |
| `campus_living.housekeeping.types_manage` | Manage Cleaning Types |
| `campus_living.housekeeping.cleaners_manage` | Manage Cleaner Directory |
| `campus_living.housekeeping.availability_manage` | Manage Booking Availability |
| `campus_living.housekeeping.assign` | Assign Cleaner to Booking |
| `campus_living.housekeeping.execute` | Record Cleaning (photos, start/finish) |
| `campus_living.housekeeping.cancel` | Cancel Another's Booking |
| `campus_living.housekeeping.waive` | Waive Feedback Hold |

**Grants** — mirroring exactly who holds the old keys today:

| Role | Keys |
|---|---|
| Warden, Chief Warden, Hostel Office Admin, Executive Administrative Officer, Managing Director, Chief Executive Officer | all 8 |
| Housekeeping Staff | `.view`, `.execute` |

Learners need **no permission key.** Booking is gated on holding a live allocation, enforced
inside the DEFINER RPC. The `Student` role's housekeeping keys stay `false`.

---

## 8. RLS and RPC discipline

Every table: RLS enabled in its creating migration, one permissive policy per verb (not several
ORed), all auth calls wrapped as `(select auth.uid())` so they evaluate once per query rather
than once per row.

Policy shape for config tables:

```sql
using (
  (select is_super_admin())
  OR ((select user_has_permission('campus_living.housekeeping.view'))
      AND role_has_institution_access(institution_id))
)
```

Booking SELECT additionally allows the learner's own room:

```sql
OR EXISTS (SELECT 1 FROM hostel_allocations a
           WHERE a.room_id = hostel_cleaning_bookings.room_id
             AND a.learner_id = (select auth.uid())
             AND a.status::text = ANY (SELECT unnest(fn_cl_roster_statuses())::text))
```

Roommates must see the booking to rate it — that is the point of the room-based flow.

**Four `SECURITY DEFINER` RPCs**, each: deriving the caller from `auth.uid()` internally (never
a caller-id parameter — those are spoofable), `SET search_path = ''`, performing its own
permission check, and with `EXECUTE` revoked from `anon` explicitly after creation.

| RPC | Purpose |
|---|---|
| `fn_cl_housekeeping_slots` | slot grid for a room + type + date |
| `fn_cl_housekeeping_book` | the full validation chain, §8.1 |
| `fn_cl_housekeeping_cancel` | learner-while-unassigned, or warden with `.cancel` |
| `fn_cl_housekeeping_assign` | warden assigns/clears a cleaner |

Plus two non-DEFINER helpers: `fn_cl_housekeeping_feedback_holds` and the attendance trigger
function.

Photo upload and feedback submission go through the **service layer** with a
`requirePermission` check — no RPC needed, so the logic stays typed and testable.

### 8.1 Booking validation order

`fn_cl_housekeeping_book(p_type_id, p_date, p_slot_start, p_notes)` checks in this order,
returning a discriminated union `{success:false, error_code}` at the first failure:

1. `booking_enabled` policy is true → else `feature_disabled`
2. Caller has a live allocation → else `no_allocation`
3. Type is active and in the caller's institution → else `type_unavailable`
4. Room's category is in the type's categories → else `category_not_eligible`
5. No live booking for the room → else `room_locked`
6. Quota not exhausted for the window → else `quota_exhausted`
7. Date is not past and within `booking_advance_days` → else `date_out_of_range`
8. Slot exists in the availability window and has capacity → else `slot_full` / `day_closed`
9. INSERT with the three snapshots and `feedback_due_at`

An advisory lock on `room_id` narrows the race; the partial unique index closes it.

---

## 9. Surfaces

### 9.1 Warden — `/campus-living/housekeeping`

| Route | Purpose |
|---|---|
| *(index)* | **Day board.** Date arrows + block picker; one card per booking showing room, type, slot, cleaner, photo ticks, rating state; inline Assign / Upload Before / Upload After / Waive |
| `/types` | Cleaning types: name, duration, quota (`[2]` per `[week ▾]`), expense lines with a live total, room-category checkboxes |
| `/cleaners` | Cleaner directory: name, phone, gender, blocks, working days, shift |
| `/availability` | Per-block weekday grid (open/closed, window, capacity) + the 2 surviving policy knobs |
| `/holds` | Rooms currently blocking attendance, so a warden can chase or waive |

### 9.2 Learner — `/campus-living/my-hostel/housekeeping`

Pick a type (only those the room's category allows, each showing "2 left this week") → date
strip → slot grid generated at the type's duration → confirm. Below: upcoming bookings, and a
**Rate** card for any job awaiting feedback, carrying the attendance warning once overdue.

Roommate display reuses the existing `fn_my_roommates()` RPC rather than re-querying allocations.

**The My Hostel entry card is rebuilt, not just deleted.** It keeps the old module's best
idea: render nothing unless the learner's room category actually has a bookable type. Never
advertise a feature the next page refuses.

### 9.3 Photos

Google Drive, matching the existing room-condition-photos convention:
`app/api/campus-living/housekeeping/bookings/[bookingId]/photos/route.ts` uploads with server
Drive credentials and stores `drive_url` + `drive_file_id`. This keeps Supabase Storage quota
free and matches the newest campus-living precedent.

---

## 10. Code conventions

The old module drifted from repo convention twice. The rebuild follows CLAUDE.md instead:

- **Query keys live in `lib/query/query-keys.ts`**, not file-local factories. (The old module
  had zero entries there.)
- **CRUD services extend `BaseService`** — types, cleaners, availability and the booking board
  inherit its institution scoping, pagination validation, query timeouts and Postgres error
  mapping. The four booking *actions* stay thin static RPC wrappers, since their validation is
  atomic in the database.

Kept from the old module because it is genuinely good: the **discriminated-union RPC result**
(`{success:true,…} | {success:false, error_code}`) with error codes mapped to learner-friendly
strings in the hook.

**Files to create:**

```
lib/services/campus-living/housekeeping-type-service.ts
lib/services/campus-living/housekeeping-cleaner-service.ts
lib/services/campus-living/housekeeping-availability-service.ts
lib/services/campus-living/housekeeping-booking-service.ts
lib/services/campus-living/housekeeping-feedback-gate.ts
hooks/campus-living/use-housekeeping-types.ts
hooks/campus-living/use-housekeeping-cleaners.ts
hooks/campus-living/use-housekeeping-availability.ts
hooks/campus-living/use-housekeeping-bookings.ts
hooks/campus-living/use-housekeeping-feedback.ts
types/campus-living/housekeeping.ts
```

No file exceeds ~400 lines.

---

## 11. Migration sequence

| # | Contents |
|---|---|
| **M1** | Teardown: drop 3 tables, 12 functions, 3 enums, 5 policy rows; revoke `.schedule` and `.mark_done` from all 7 holding roles |
| **M2** | Create 9 tables + RLS enabled + policies + every FK index + the partial unique room-lock index |
| **M3** | The 4 DEFINER RPCs, `fn_cl_housekeeping_feedback_holds`, and the `hostel_attendance` trigger; `REVOKE EXECUTE … FROM anon` on each |
| **M4** | Permission catalog keys + role grants, in one unit |

Each migration file on disk contains **exactly** the SQL that ran — never a `SELECT 1;`
placeholder, which hides column typos and makes the repo lie about the schema. After applying,
mirror into `supabase/setup/01_tables.sql`, `02_functions.sql`, `03_policies.sql`,
`04_triggers.sql`.

Regenerate `types/supabase.ts` after M2, or `.from('hostel_cleaning_types')` fails typecheck
with a misleading TS2769 cascade.

---

## 12. Verification

"Done" means all of the following were observed, not assumed:

- [ ] `mcp__ide__getDiagnostics` clean on every touched file
- [ ] `npm run gen:routes`, then `npm run check:menus` passes (permission catalog + menu + audit coverage)
- [ ] `mcp__supabase__get_advisors` returns zero ERROR-level findings
- [ ] No public table left with RLS disabled
- [ ] `settings/mess-services` still builds and renders (the hard import is gone)
- [ ] **Exercised in a browser as a Warden and as a Student, not as super admin.** Super-admin sessions hide every permission bug.

The end-to-end browser walk that constitutes acceptance:

1. Warden creates a type: 30 min, 2 per week, 3 expense lines, Premium categories only.
2. Warden sets Girls Hostel B availability and adds a cleaner.
3. Student in a **Classic** room sees the type is unavailable. Student in a **Premium** room books a slot.
4. Second roommate finds booking blocked — room lock.
5. Warden assigns the cleaner, uploads Before, then After.
6. Attendance marking the **same** day is unaffected.
7. Next day, all roommates are blocked on the mark page with the pending-feedback message, and a direct write attempt is refused by the trigger.
8. Any roommate rates → booking completes → the block clears for the whole room immediately.
9. Warden waives a second room's hold with a reason; the block clears and the reason is stamped.

---

## 13. Decisions on record

| Decision | Rationale |
|---|---|
| Hostel attendance, not class attendance | Stays inside Campus Living; the warden who runs housekeeping is the one who marks it |
| Hard block, no override | Chosen deliberately; the waive valve is the release path, and it is logged |
| Cleaners are directory records with no login | Nothing in the flow needs them to log in; avoids the blank-`institution_email` loginless-staff trap |
| Warden uploads both photos | One accountable actor, no cleaner accounts to provision |
| Expected cost is a template only | No billing coupling; the institution plans cost, the learner is not charged |
| Quota per room, rolling window | Coherent with the room lock — the room is the unit throughout |
| Room's category decides eligibility | Bookability must not depend on who is asking (§5.1) |
| Full removal, no archive | 151 rows, no dependents; approved as irreversible |
