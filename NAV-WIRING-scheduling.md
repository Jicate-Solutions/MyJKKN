# NAV-WIRING — Scheduling Polish + Meeting Modes (M2 + M3)

Branch: `feat/meet-scheduling-polish`
Migration: `supabase/migrations/20260617000300_meet_scheduling_polish.sql` (**NOT applied** — ships with the PR, apply on merge/deploy).

## What shipped

### M2 — slot-rule controls (expose what the engine already supports)
The native slot engine (`lib/services/meetings/native-slot-engine.ts → computeSlots`) already
consumed `bufferBeforeMin`, `bufferAfterMin`, `minNoticeMin`, `slotIntervalMin`, and date `overrides`.
This change exposes them and finishes the one missing wire:

1. **Migration** adds `meeting_types.slot_interval_min smallint NULL` (NULL = back-to-back / use duration).
   The buffer/notice columns already existed (20260611190000) — idempotent `ADD … IF NOT EXISTS` guards only.
   `meeting_schedule_overrides` already existed — no new column; the migration asserts its presence.
2. **Event-type form** (`/meetings/manage`) — new "Scheduling rules" section: Buffer before / Buffer after /
   Minimum notice / Slot increment (with a Back-to-back/15/30/60 preset). Round-trips through
   `app/(routes)/meetings/manage/actions.ts` (`ManageEventType` + `EventTypeFormInput` + `validateForm`).
3. **Holidays / date-override editor** (`/meetings/availability`) — new card below weekly hours
   (`_components/holidays-editor.tsx` + new actions `listScheduleOverrides` / `setScheduleOverride` /
   `deleteScheduleOverrideDate`). Writes to `meeting_schedule_overrides`: a closed date = one NULL/NULL row;
   special hours = one start/end window that REPLACES the weekly hours for that date.
4. **Wiring** — `NativeSchedulingService` now passes `slotIntervalMin: mt.slot_interval_min ?? undefined`
   into all three `computeSlots` calls (listSlots / createBooking / rescheduleBooking). Buffers, min-notice
   and overrides were already passed. The public `/api/public/meet/[handle]/[typeSlug]/slots` route reflects
   all of these because it calls `listSlots`.

### M3 — meeting modes + Google Meet links
The mode picker (In person / Phone / Online-Google-Meet) and the Meet-link machinery already existed
(migration `20260612090000`, decisions D4/D12). This change **hardens the Meet-link read-back**:

5. `meeting_types.location_mode` ('in_person' | 'phone' | 'online') + `location_text` ALREADY exist and are
   already picked in the event-type form. **We deliberately did NOT add the prompt's `location_type`/
   `location_detail`/`'google_meet'` columns** — `location_mode='online'` IS the Google Meet mode and is wired
   end-to-end (95 provisioned rows + the service's `withMeet = location_mode === 'online'`). Adding a parallel
   column would split a working mechanism (CLAUDE.md rule #26). This is called out in the migration header.
6. `GoogleCalendarService.createEvent` — already requested `conferenceData.createRequest` with
   `conferenceSolutionKey.type = 'hangoutsMeet'` when `withMeet`. **Hardened the read-back** to prefer
   `conferenceData.entryPoints[type='video'].uri`, then `hangoutLink`, then any entry-point uri
   (`extractMeetUrl` helper). The book route persists this to `meeting_bookings.video_url` (unchanged path in
   `NativeSchedulingService.createBooking`), and the confirmation email + Google Calendar event both carry it.

## Permission keys
**None added or changed.** Both surfaces live under the existing `/meetings/*` routes already granted
`meetings.view` to all staff roles (migration 20260612090000). RLS is unchanged:
`mt_host_all`, `mhs_host_all`, `mso_host_all` already scope every read/write to `host_profile_id = auth.uid()`.
No new RPC (so no anon-revoke needed).

## Files touched (all within exclusive ownership)
- `supabase/migrations/20260617000300_meet_scheduling_polish.sql` (new)
- `lib/services/meetings/native-scheduling-service.ts` (pass slotIntervalMin ×3 + interface field)
- `lib/services/integrations/google-calendar-service.ts` (extractMeetUrl read-back hardening)
- `app/(routes)/meetings/manage/actions.ts` (slot-rule fields + validation + MT_COLUMNS)
- `app/(routes)/meetings/manage/_components/event-types-manager.tsx` (Scheduling rules UI)
- `app/(routes)/meetings/availability/actions.ts` (override CRUD actions)
- `app/(routes)/meetings/availability/_components/holidays-editor.tsx` (new)
- `app/(routes)/meetings/availability/_components/availability-editor.tsx` (stale-note copy only)
- `app/(routes)/meetings/availability/page.tsx` (render HolidaysEditor)

## MANUAL TEST STEPS (after the migration is applied)

### M2 — buffers / min-notice / slot increment
1. Sign in. Go to `/meetings/manage` → New (or edit) a meeting type. In **Scheduling rules** set
   Buffer before = 15, Buffer after = 15, Minimum notice = 120, Slot increment = 30. Save.
2. Open the host's public page `/meet/<handle>` (host must be public + Google-connected) and pick that type.
   - Slots must start on the **:00/:30 grid** (slot increment 30), not back-to-back.
   - No slot within the **next 2 hours** (min-notice 120).
   - After booking one slot, the 15-min windows immediately **before and after** that booking disappear (buffers).

### M2 — holidays / special hours
3. `/meetings/availability` → **Holidays & special hours** card → pick a future date, "Closed all day", Save override.
   - Reload `/meet/<handle>` for any type → **that date shows NO slots**.
4. Same card → pick another future date, "Special hours" 10:00–11:00, Save.
   - That date now offers slots **only between 10:00 and 11:00**, ignoring the weekly hours.
5. Click **Remove** on a date → it reverts to the weekly hours (slots reappear).

### M3 — Google Meet link
6. Edit a meeting type → set **Where = Online (Google Meet)** → Save.
7. Book that type from `/meet/<handle>` (host's Google Calendar must be connected/active).
   - The created **Google Calendar event has a Meet link** (entryPoints/hangoutLink).
   - `meeting_bookings.video_url` is **populated** with that Meet URL (verify in DB:
     `select uid, location? , video_url, google_event_id from meeting_bookings order by created_at desc limit 1;`).
   - The **confirmation email** to the attendee carries the Meet link (videoUrl passed to the email service).
8. Book an **In person** or **Phone** type → `video_url` stays NULL, no Meet link requested. Correct.

## Notes / blockers
- **DRAFT: migration not applied.** No DB writes were performed by this work.
- Did NOT touch env, the OAuth client, sidebar, permissions catalog, route-manifest, SQL_FILE_INDEX, or setup SQL.
- Weekly-windows table confirmed: `meeting_schedule_windows` (migration 20260611190000). Overrides table:
  `meeting_schedule_overrides` (same migration) — both found, no blocker.
