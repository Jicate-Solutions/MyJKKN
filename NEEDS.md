# NEEDS — Universal Booking Wave-3 (event-type variants + booking lifecycle)

Items the lead must apply at reconciliation. None were applied to any DB by this
agent (per instructions). No shared registries were edited.

## 1. Apply the migration (lead applies, not me)
`supabase/migrations/20260619000100_meet_type_variants_lifecycle.sql`
- Adds to `public.meeting_types`: `kind`, `capacity`, `host_pool uuid[]`,
  `redirect_url`, `cancellation_policy`.
- New table `public.meeting_type_cohosts` (collective co-hosts), RLS mirrors
  `meeting_types` (`mtc_host_all`).
- Idempotent; ends with `NOTIFY pgrst, 'reload schema';`.

## 2. GROUP capacity > 1 needs a `meeting_bookings` constraint change (NOT owned)
The existing exclusion constraint blocks group capacity beyond the first seat:
```
CONSTRAINT mb_no_double_booking EXCLUDE USING gist (
  host_profile_id WITH =, tstzrange(start_time, end_time) WITH &&
) WHERE (status = 'confirmed')
```
A second guest on the SAME host+slot (a legitimate group seat) trips 23P01 →
the service returns SLOT_TAKEN. `meeting_bookings` is OUT OF MY OWNED FILES, so I
did NOT alter it.
- The slot-serving + capacity read path, seat display, and the service-layer
  capacity gate are all fully built and tested; only the persisted 2nd+ seat is
  blocked by this constraint.
- Suggested follow-up migration (lead): make the exclusion group-aware, e.g.
  exclude rows whose meeting type is `kind='group'` from the constraint and rely
  on the service-layer capacity gate for those, OR carry a `seat_index` and
  include it in the gist key. One-on-one/collective/round-robin are unaffected
  (each is single-host-single-range and works under the current constraint).

## 3. types/supabase.ts (NOT edited — by guardrail)
New columns/table are not in generated types. All new-column reads cast the
client untyped (`as any` / `as unknown`) per instructions; no generated-types
edit. Regenerate types when convenient (cosmetic only).

## 4. Permissions / nav
No new permission key or nav entry required — the feature extends existing
`/meetings/manage` (host-owned via `mt_host_all` RLS) and the existing public
`/meet/[handle]` + `/book/cancel/[uid]` surfaces. Nothing to add to
`lib/constants/permissions.ts` or `lib/sidebarMenuLink.ts`.

## 5. Same-module companion edit (flagged for transparency)
`app/(routes)/meetings/manage/actions.ts` was edited (it was NOT in the owned
list). It is the module-local server layer the owned `event-types-manager.tsx`
directly imports (`EventTypeFormInput`, `ManageEventType`, create/update
actions); the UI cannot persist the new fields without it. It is NOT a shared
registry. Changes: new fields on the types, email→profile-id resolution,
`host_pool` write, and `meeting_type_cohosts` sync.
