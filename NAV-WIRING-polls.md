# NAV-WIRING — Meeting Polls (M5)

Wiring notes for the **Meeting Polls** module (Universal Booking M5 — Calendly
"Meeting Polls" parity). This file is the merge-time checklist for the surfaces
this PR does NOT touch (sidebar, permissions registry, route manifest) so the
human merger can apply them deliberately.

## What this PR ships

| Layer | Files |
|---|---|
| Migration | `supabase/migrations/20260617001000_meet_polls.sql` |
| Service | `lib/services/meetings/meeting-poll-service.ts` |
| Public page | `app/(public)/poll/[slug]/page.tsx` + `_components/poll-vote-widget.tsx` |
| Public API | `app/api/public/poll/[slug]/vote/route.ts` |
| Admin pages | `app/(routes)/meetings/polls/page.tsx`, `[id]/page.tsx`, `actions.ts`, `_components/polls-manager.tsx`, `_components/poll-results.tsx` |
| Tests | `__tests__/meetings/meeting-poll-service.test.ts` |

## Migration

- **Filename:** `20260617001000_meet_polls.sql`
- **NOT applied to any database by this PR (DRAFT).** Apply post-merge via
  Supabase MCP / `exec_sql` (append-safe: idempotent `IF NOT EXISTS`, ends with
  `NOTIFY pgrst, 'reload schema';`).
- Creates `meeting_polls`, `meeting_poll_options`, `meeting_poll_votes` + RLS.
- **Public RPCs (SECURITY DEFINER, intentionally anon-granted with audit
  comments):** `fn_get_active_poll(text)`, `fn_cast_poll_votes(text, text, text, uuid[])`.
  The trigger fn `tg_meeting_polls_set_updated_at()` is locked from anon/PUBLIC.

## Permission keys (NOT added to `lib/constants/permissions.ts` by this PR)

Add these to `PERMISSION_CATEGORIES` under the `meetings` module:

- `meetings.polls.view` — see the Polls list + results pages (gates the admin UI
  and the RLS `*_perm_select` read policies).
- `meetings.polls.manage` — create / confirm / delete polls (reserved for a
  future explicit-manage gate; today the admin write path is RLS-scoped to the
  host via `host_profile_id = auth.uid()`).

The admin pages wrap content in `<PermissionGuard module="meetings" action="polls.view">`.
Until `meetings.polls.view` exists in the registry, super_admin/admin still pass
(PermissionGuard bypasses for them); grant the key to host roles in Role
Management so non-admin hosts can reach the pages.

## Sidebar / nav entry (NOT edited by this PR)

`lib/sidebarMenuLink.ts` is OFF-LIMITS for this PR (shared file, parallel agents).
To surface Polls in the left sidebar, add under the **Meetings** group:

```
{ title: 'Polls', url: '/meetings/polls', icon: <Vote /> }  // permission: meetings.polls.view
```

The page is already reachable via the in-page tab strip on every `/meetings/*`
surface (Inbox · Availability · Manage · **Polls**), so it is usable without the
sidebar edit.

## Route manifest

`lib/navigation/route-manifest.generated.ts` is generated. If `npm run build`
regenerates it, `git checkout` it before committing (do NOT hand-edit). The new
routes (`/meetings/polls`, `/meetings/polls/[id]`, `/poll/[slug]`,
`/api/public/poll/[slug]/vote`) will be picked up when the manifest is
regenerated on `main`.

## Manual test steps (post-deploy)

1. **Create a poll:** sign in as a host → `/meetings/polls` → New poll → title +
   duration + add 2+ candidate times → Create. Poll appears as **Open**.
2. **Copy the link:** click "Copy link" → open `/poll/<slug>` in an incognito
   window (anon). The candidate times render in IST.
3. **Vote (anon):** select 1+ times → name + email → Submit. "Thanks for voting".
   Re-submit from the same email → it replaces the prior ballot (no dupes).
4. **Results:** back in `/meetings/polls/<id>` → vote bars + "Leading" badge.
5. **Confirm winner:** click "Confirm winner" on a time → "Confirm this time".
   Poll flips to **Confirmed**; a `meeting_bookings` row (source `poll`,
   status `confirmed`) is created; `/poll/<slug>` now shows "Voting has closed".
6. **Closed-poll vote attempt:** voting on a closed poll returns a 409 with a
   clear "this poll has closed" message (no silent failure).

## Post-merge follow-ups (out of scope for M5, owned by scheduling layer)

- **Google Calendar event** for the confirmed booking — `closePoll` deliberately
  does NOT create a Google event (the booking routes / scheduling layer own
  Google integration; see `native-scheduling-service.ts createBooking`). Wire
  the event + Meet link + voter invitations as a follow-up.
- **Voter notification** on confirm (email the voters the final time).
- Adding `meetings.polls.view` / `.manage` to `lib/constants/permissions.ts`
  and the sidebar entry to `lib/sidebarMenuLink.ts`.
