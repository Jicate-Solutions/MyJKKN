# NAV-WIRING — Module 9: Custom Webhooks (Universal Booking)

Branch: `feat/meet-webhooks` · Based on `jicate/main` · 2026-06-17

This module adds real-time booking webhooks to the Universal Booking module
(Calendly "Create custom webhooks to get meeting information in real-time"
parity). A host registers webhook URLs + the booking lifecycle events they
care about; on each event MyJKKN POSTs a signed JSON payload.

The migration is **NOT applied** (draft PR). The wiring below is what a
maintainer must do on merge.

---

## 1. Nav entry (manual — I did NOT edit `lib/sidebarMenuLink.ts`)

The page self-registers a **"Webhooks" tab** in the in-module tab bar on
`/meetings/*` (alongside Availability / Inbox / Manage), so it is reachable
without a sidebar edit.

To also surface it in the desktop left sidebar, a maintainer adds one entry to
`lib/sidebarMenuLink.ts` under the Meetings group:

```ts
{ name: 'Webhooks', href: '/meetings/webhooks', permission: 'meetings.webhooks.view' }
```

(Off-limits for this agent — flagged here for the human.)

## 2. Permission keys (NEW — register in `lib/constants/permissions.ts`)

I did **not** edit `permissions.ts` (off-limits). Add these to the Meetings
category so they appear in Role Management:

| Key | Label |
|---|---|
| `meetings.webhooks.view` | View Meeting Webhooks |
| `meetings.webhooks.manage` | Manage Meeting Webhooks |

Behavior until registered:
- The page is wrapped in `<PermissionGuard module="meetings" action="webhooks.view">`.
- **Super admins always pass** (PermissionGuard super-admin bypass) — they can
  use the feature immediately.
- Non-super-admins see an explicit "Webhooks access not enabled" card (rule #27
  — no silent redirect) until the key is granted.
- RLS also recognizes the key: `meeting_webhooks_select` /
  `meeting_webhook_deliveries_select` include `user_has_permission('meetings.webhooks.view')`,
  but a host can always see/manage their **own** webhooks via
  `host_profile_id = auth.uid()` regardless of the key.

## 3. Migration

- File: `supabase/migrations/20260617001400_meet_webhooks.sql`
- Status: **DRAFT — not applied.** Validated against live prod schema via a
  forced-rollback dry-run (function compiles against real `meeting_bookings`
  columns; trigger attaches; tables/indexes/RLS DDL all valid; zero artifacts
  left in prod).
- Apply with the Supabase MCP `apply_migration` (or the standard migration
  pipeline). Ends with `NOTIFY pgrst, 'reload schema';` so REST sees the new
  tables immediately.
- Creates: tables `meeting_webhooks`, `meeting_webhook_deliveries`; function
  `fn_enqueue_meeting_webhook_deliveries()` (SECURITY DEFINER, `REVOKE EXECUTE
  FROM anon, PUBLIC`); trigger `tg_enqueue_meeting_webhooks AFTER INSERT OR
  UPDATE ON meeting_bookings`; `updated_at` touch trigger on `meeting_webhooks`.
- Does **NOT** edit `meeting_bookings` schema, any existing table, or
  `supabase/setup/*.sql`. Add the index line to `supabase/SQL_FILE_INDEX.md`
  by hand on merge (I did not edit it — off-limits / EOF-append conflict class).

## 4. Cron schedule (add to `vercel.json` on apply)

- Route: `app/api/cron/meeting-webhooks/route.ts`
- Auth: `CRON_SECRET` via `Authorization: Bearer <secret>` header OR `?secret=`
  query param (identical to the other `app/api/cron/*` routes).
- **Schedule: `*/2 * * * *`** (every 2 minutes — webhooks are latency-sensitive).
  `*/5 * * * *` is acceptable if cron budget is tight.

```json
{ "path": "/api/cron/meeting-webhooks", "schedule": "*/2 * * * *" }
```

- Requires env: `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (all already present in prod).

## 5. Event semantics (substrate note)

Reschedules on `meeting_bookings` keep `status='confirmed'` and only move
`start_time` (see `native-scheduling-service.rescheduleBooking`). So the trigger
fires on `AFTER INSERT OR UPDATE` (NOT `UPDATE OF status`) and derives the event
from the row delta:

| Transition | Emitted event |
|---|---|
| INSERT, status=`confirmed` | `booking.created` |
| UPDATE, `confirmed` → `cancelled` | `booking.cancelled` |
| UPDATE, status unchanged, `start_time` moved | `booking.rescheduled` |

All other updates (`updated_at` touch, `video_url`/`google_event_id` backfill)
enqueue nothing.

## 6. Payload + signature

POST body (`application/json`):

```json
{
  "event": "booking.created",
  "created_at": "2026-06-17T10:00:00Z",
  "booking": {
    "id": "uuid", "uid": "...", "meeting_type_id": "uuid",
    "host_profile_id": "uuid", "institution_id": "uuid|null",
    "attendee_name": "...", "attendee_email": "...", "attendee_phone": "...|null",
    "start_time": "...", "end_time": "...", "previous_start_time": "...|null",
    "status": "confirmed", "source": "direct",
    "video_url": "...|null", "google_event_id": "...|null",
    "cancellation_reason": "...|null"
  }
}
```

Headers: `X-MyJKKN-Event: <event>`, `X-MyJKKN-Signature: sha256=<hmac>` where
`hmac = HMAC-SHA256(webhook.signing_secret, raw_body_bytes)`. The receiver
recomputes over the raw body to verify authenticity. 2xx = delivered; anything
else (or timeout/network error) is retried with backoff up to 5 attempts, then
marked `failed`.

## 7. Manual test steps (after migration applied + cron secret set)

1. Sign in as a host (or super admin). Open **/meetings/webhooks**.
2. **New webhook** → name + a test URL (e.g. a https://webhook.site/<id> bin) →
   keep all three events → Create. Copy the one-time signing secret.
3. Make a booking for that host (public booking flow or
   `native-scheduling-service.createBooking`). A `pending` row appears in
   `meeting_webhook_deliveries`.
4. Hit the cron manually: `GET /api/cron/meeting-webhooks?secret=$CRON_SECRET`.
   The delivery flips to `sent` (response_code 200) and webhook.site shows the
   payload + `X-MyJKKN-Signature` header. Recompute the HMAC with your secret to
   confirm it matches.
5. Cancel the booking → another `pending` row (`booking.cancelled`) → cron →
   `sent`. Reschedule → `booking.rescheduled`. Confirm the **Recent deliveries**
   table on the page reflects all three.
6. Toggle the webhook **inactive** and book again → no new delivery enqueued
   (trigger filters on `is_active`). A delivery already pending when you
   deactivate closes as `failed` ("webhook inactive") rather than POSTing.

## 8. Files in this PR

```
supabase/migrations/20260617001400_meet_webhooks.sql        # NOT applied
lib/services/meetings/meeting-webhook-service.ts             # CRUD
lib/services/meetings/meeting-webhook-dispatcher.ts          # dispatchDue + HMAC
app/api/cron/meeting-webhooks/route.ts                       # cron runner
app/(routes)/meetings/webhooks/page.tsx                      # admin page (PermissionGuard)
app/(routes)/meetings/webhooks/actions.ts                    # server actions
app/(routes)/meetings/webhooks/_components/webhooks-manager.tsx
__tests__/meetings/meeting-webhook-dispatcher.test.ts        # 13 tests
__tests__/meetings/meeting-webhook-service.test.ts           # 4 tests
NAV-WIRING-webhooks.md                                       # this file
```

No edits to: `lib/sidebarMenuLink.ts`, `lib/constants/permissions.ts`,
`lib/navigation/route-manifest.generated.ts`, `supabase/SQL_FILE_INDEX.md`,
`supabase/setup/*.sql`, booking routes/services, or any off-limits meetings
subtree.
