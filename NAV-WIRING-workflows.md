# Meeting Workflows (Module 4) — Nav Wiring & Operations

Calendly "Workflows" parity for the MyJKKN Universal Booking module: automated
lifecycle communications (reminders before, follow-ups after, host/attendee
notices on cancel/reschedule).

This file lists every wiring step that must be done by the platform owner
**outside this PR's allowed-file set** (sidebar, permission catalog, vercel.json
cron, migration apply). Nothing here is applied automatically — the PR is DRAFT
and the migration is NOT applied.

---

## 1. Migration to apply

```
supabase/migrations/20260617000200_meet_workflows.sql
```

Idempotent, TIER-0 safe-additive. Creates:
- `meeting_workflows` (config)
- `meeting_workflow_actions` (ordered messages per workflow)
- `meeting_workflow_runs` (operational ledger; index on `(status, scheduled_for)`)
- `fn_enqueue_meeting_workflow_runs()` (SECURITY DEFINER, anon/PUBLIC revoked)
- trigger `trg_enqueue_meeting_workflow_runs` `AFTER INSERT OR UPDATE OF status ON meeting_bookings`

Ends with `NOTIFY pgrst, 'reload schema';`.

Apply via Supabase MCP `apply_migration` (show SQL first per project discipline).
The trigger is additive on `meeting_bookings` — it only INSERTs into the new
runs table and never blocks/alters a booking write.

---

## 2. Permission keys to add (lib/constants/permissions.ts — owner edit)

The `meetings` permission category currently has only `meetings.view`. Add the
workflows sub-keys under the existing `Meetings` block:

```ts
{ key: 'meetings.workflows.view',   label: 'View Meeting Workflows' },
{ key: 'meetings.workflows.create', label: 'Create Meeting Workflows' },
{ key: 'meetings.workflows.edit',   label: 'Edit Meeting Workflows' },
{ key: 'meetings.workflows.delete', label: 'Delete Meeting Workflows' },
```

The pages gate on `<PermissionGuard module="meetings" action="workflows.view">`.
Until the key exists in the catalog, only super_admin / admin pass the guard
(the keyed guard is still correct — it simply grants no one else yet). RLS in the
migration ALSO honours `host_profile_id = auth.uid()`, so a host always reaches
their own workflows once the page is visible to them.

---

## 3. Sidebar entry (lib/sidebarMenuLink.ts — owner edit)

Add a child link under the existing Meetings group:

```ts
{ name: 'Workflows', href: '/meetings/workflows', permission: 'meetings.workflows.view' }
```

The four meetings sub-pages (Availability / Inbox / Manage / Workflows) already
render an in-page tab bar; the new "Workflows" tab is included in each page's tab
list. The sidebar link is the deep entry point.

---

## 4. Cron schedule (vercel.json — owner edit)

Add a cron entry pointing at the runner route:

```json
{ "path": "/api/cron/meeting-workflows?secret=${CRON_SECRET}", "schedule": "*/5 * * * *" }
```

- **Every 5 minutes.** `before_meeting` reminders fire within 5 min of their
  scheduled instant — the right granularity for "1 hour before" / "1 day before".
- Auth: the route accepts `Authorization: Bearer <CRON_SECRET>` (Vercel's auto
  header) OR `?secret=<CRON_SECRET>` (manual curl). Mirrors
  `app/api/cron/jicate-booking-reconcile/route.ts`.
- Idempotent: each run row is CLAIMed (`pending -> sent`) before dispatch, so an
  overlapping cron pass never double-sends.

Required env (already present platform-wide, but verify VALUES are non-empty —
empty vars silently disable sends):
- `CRON_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL` (email actions)
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp actions)

A missing provider degrades a send to `skipped` (run row status), never a crash.

---

## 5. How it works (data flow)

1. Host creates a workflow at `/meetings/workflows` → trigger + timing + ordered
   actions (email/WhatsApp templates).
2. A booking is created or its status changes → the DB trigger expands matching
   active workflows of that booking's host into `meeting_workflow_runs` with a
   computed `scheduled_for`:
   - `on_booked` → `now()`
   - `before_meeting` → `start_time - offset_minutes`
   - `after_meeting` → `end_time + offset_minutes`
   - `on_cancelled` / `on_rescheduled` → `now()` (only when status changes)
3. The cron runner picks up `pending` runs with `scheduled_for <= now()`,
   renders each action's template, and sends via Resend / WhatsApp, marking the
   run `sent` / `failed` / `skipped`.

Template placeholders: `{{attendee_name}}`, `{{start_time}}`, `{{host_name}}`,
`{{cancel_url}}`.

---

## 6. MANUAL TEST steps (after migration applied + cron wired)

Local dev MUST run from a `jicate/main` worktree (per CLAUDE.md), not omm-dev.

**A. Builder UI (no provider needed):**
1. Sign in as `test.superadmin@jkkn.ac.in` (`/auth/test-login`, password from
   `NEXT_PUBLIC_TEST_PASSWORD` in `.env.local` — set by whoever owns the
   credential, and rotated periodically).
2. Go to `/meetings/workflows` → "New workflow" → name "Day-before reminder",
   trigger "Before the meeting" → Create.
3. In the builder, set offset to `1440` (1 day), add an Email action with
   subject `Reminder: {{start_time}}` and body using all four placeholders, add a
   WhatsApp action, reorder them, Save. Reopen → confirm it round-trips.
4. Toggle Active off/on; Delete a throwaway workflow.

**B. Enqueue trigger (DB):**
1. Create an active `before_meeting` workflow (offset 60) for a host.
2. Insert/confirm a `meeting_bookings` row for that host with `start_time` ~2h
   out. Verify a `meeting_workflow_runs` row appears with
   `scheduled_for = start_time - 60 min`, `status='pending'`.
3. Cancel the booking (`status='cancelled'`). If an `on_cancelled` workflow
   exists, verify a new run row at `now()`.

**C. Runner (providers configured):**
1. Set a run's `scheduled_for` to a past instant (or wait).
2. `curl "https://www.jkkn.ai/api/cron/meeting-workflows?secret=$CRON_SECRET"`.
3. Expect JSON `{ ok: true, examined, sent, failed, skipped, actions_dispatched }`.
4. Verify the run row flipped to `sent` (or `skipped` if no provider) and the
   attendee received the email/WhatsApp. Re-run the curl → the same row is NOT
   re-sent (idempotent claim).

---

## 7. Files in this PR

- `supabase/migrations/20260617000200_meet_workflows.sql`
- `lib/services/meetings/meeting-workflow-service.ts` (CRUD, RLS client)
- `lib/services/meetings/meeting-workflow-runner.ts` (`runDueWorkflows`)
- `app/api/cron/meeting-workflows/route.ts` (runner route)
- `app/(routes)/meetings/workflows/actions.ts` (server actions)
- `app/(routes)/meetings/workflows/page.tsx` (list)
- `app/(routes)/meetings/workflows/[id]/page.tsx` (builder)
- `__tests__/meetings/meeting-workflow-runner.test.ts` (vitest — pure render/format)
- `NAV-WIRING-workflows.md` (this file)
