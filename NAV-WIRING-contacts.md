# NAV-WIRING — Meetings → Contacts (M6)

Universal Booking **MODULE 6 — "Contacts"** (Calendly parity).
Branch `feat/meet-contacts`, based on `jicate/main`.

This module ships its files only; it does **not** edit any shared/off-limits file
(`sidebarMenuLink.ts`, `permissions.ts`, `route-manifest.generated.ts`,
`SQL_FILE_INDEX.md`, `supabase/setup/*.sql`). The items below are the wiring a
follow-up commit (or the integrator) should apply.

---

## 1. Route

| Page | Path |
|------|------|
| Contact list | `/meetings/contacts` |
| Per-contact detail | drawer on the same page (no separate route) — opens via row click, lazily fetches the booking timeline. |

The detail is a **Sheet/drawer**, not an `[email]` sub-route, so there is no new
dynamic segment to register in the route manifest. The page is reached via
in-page navigation (same as `/meetings/manage` and `/meetings/availability`,
which are not sidebar entries either) — the build's `check:reachability` gate
**passed** with this route present (56 unreachable ≤ 60 baseline).

## 2. Permission key

**`meetings.contacts.view`**

- The page wraps content in
  `<PermissionGuard module="meetings" action={['contacts.view','view']} anyAction>`.
  Any host who can reach the Meetings module (holds `meetings.view`) sees their
  own contacts; an explicit `meetings.contacts.view` grant also passes.
- **The real security boundary is RLS + the RPC**, not the guard:
  - `fn_meeting_contacts_for_host()` is `SECURITY DEFINER` and self-scopes to
    `auth.uid()` — it takes **no host-id argument**, so it can only ever return
    the caller's own contacts.
  - `meeting_contacts` RLS = `is_super_admin() OR is_admin() OR
    (host_profile_id = auth.uid() AND user_has_permission('meetings.contacts.view'
    OR 'meetings.view'))`.

### Follow-up: register the key in the permission catalog (optional, off-limits here)

`lib/constants/permissions.ts` currently lists only `meetings.view` under the
`Meetings` category. To make `meetings.contacts.view` assignable from the Role
Management UI, add:

```ts
{
  name: 'Meetings',
  key: 'meetings',
  permissions: [
    { key: 'meetings.view', label: 'View Meetings Module' },
    { key: 'meetings.contacts.view', label: 'View Meeting Contacts' }, // ADD
  ]
}
```

This is a UI-visibility nicety only — the dynamic permission system honours the
key in `custom_roles.permissions` JSONB whether or not it is in the catalog.

## 3. Migration

**`supabase/migrations/20260617001100_meet_contacts.sql`** — **NOT APPLIED** (draft PR).

What it does (idempotent, ends with `NOTIFY pgrst, 'reload schema'`):
- Adds enrichment table `meeting_contacts` (id, host_profile_id→profiles, email,
  name, phone, notes, created_at/updated_at, **UNIQUE(host_profile_id, email)**)
  + `updated_at` trigger + RLS (select/insert/update/delete, host-owns-own +
  admin bypass + permission grant).
- Adds `SECURITY DEFINER` RPC `fn_meeting_contacts_for_host()` that UNIONs the
  distinct-attendee roster from `meeting_bookings` (counts, first/last booked)
  with `meeting_contacts.notes`. `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO
  authenticated;` (CLAUDE.md anon-default rule).

No new table/RPC name collides with existing migrations (`git grep` clean).
After merge, apply via Supabase MCP/management API, then verify
`select * from fn_meeting_contacts_for_host()` returns the caller's roster.

## 4. Optional: surface a link to Contacts

The inbox footer card (`app/(routes)/meetings/inbox/page.tsx`) currently links to
"Manage event types" + "Set availability". A one-line follow-up can add a
"Contacts" button there for discoverability:

```tsx
<Link href="/meetings/contacts" className="inline-flex">
  <Button variant="outline" size="sm">
    <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden />
    Contacts
  </Button>
</Link>
```

Not applied in this PR to avoid touching a file other parallel M-agents may edit.

---

## Manual test steps

1. Apply the migration (after merge).
2. Sign in as a host who has at least one booking in `meeting_bookings`
   (e.g. any user whose `host_profile_id` appears in that table). Local dev
   must run from a **`jicate/main` worktree** (CLAUDE.md), not `omm-dev`.
3. Visit `/meetings/contacts`:
   - **List** shows one row per distinct attendee email — name, email,
     #bookings, last-booked. A "has notes" pencil icon appears once notes saved.
   - Empty state ("No contacts yet") if the host has zero bookings.
4. Click a row → drawer opens:
   - **Quick stats**: total / confirmed / cancelled booking counts.
   - **Scheduling activity**: the contact's bookings (title + status + datetime),
     newest first, lazily loaded.
   - **Your notes**: type notes + optional corrected name/phone → "Save notes" →
     toast "Notes saved"; the pencil icon now shows on that row.
   - **Share availability**: copies the host's public `/meet/<handle>` link to
     the clipboard (toast shows the URL). If the host has no public page yet,
     toast prompts them to set one up.
5. Permission/isolation check: sign in as a **different** host — they see only
   *their own* attendees, never the first host's. A user with neither
   `meetings.view` nor `meetings.contacts.view` sees the NoAccess card (explicit
   message, never a silent redirect — rule #27).

## Files added (all new — zero edits to existing files)

- `supabase/migrations/20260617001100_meet_contacts.sql`
- `lib/services/meetings/meeting-contacts-service.ts`
- `app/(routes)/meetings/contacts/page.tsx`
- `app/(routes)/meetings/contacts/actions.ts`
- `app/(routes)/meetings/contacts/_components/contacts-table.tsx`
- `__tests__/meetings/meeting-contacts-service.test.ts` (10 tests, all passing)
- `NAV-WIRING-contacts.md` (this file)
