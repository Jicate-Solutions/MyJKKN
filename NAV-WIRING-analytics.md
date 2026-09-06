# NAV-WIRING — Module 8: Meetings Analytics

PR: `feat(meetings): analytics & insights dashboard (Calendly parity) [M8]`
Branch: `feat/meet-analytics`

This module was built under the **parallel-agent conflict rule**: it only creates
NEW files and does NOT touch the shared registries (`lib/sidebarMenuLink.ts`,
`lib/constants/permissions.ts`, `lib/navigation/route-manifest.generated.ts`,
`supabase/SQL_FILE_INDEX.md`, `supabase/setup/*.sql`). The wiring below must be
applied by whoever owns those shared files (or in a follow-up reconciliation PR).

---

## 1. Permission key

**New key:** `meetings.analytics.view`

The page is gated with:

```tsx
<PermissionGuard module="meetings" action="analytics.view"> … </PermissionGuard>
```

`PermissionGuard` composes the key as `${module}.${action}` → `meetings.analytics.view`.

### Add to `lib/constants/permissions.ts`

The Meetings category currently has only `meetings.view` (around line 1924–1930).
Add the analytics key to that category's `permissions` array:

```ts
{
  name: 'Meetings',
  key: 'meetings',
  permissions: [
    { key: 'meetings.view', label: 'View Meetings Module' },
    { key: 'meetings.analytics.view', label: 'View Meetings Analytics' }, // M8
  ]
},
```

After adding, grant `meetings.analytics.view` to the relevant roles in **Role
Management UI** (e.g. super_admin already bypasses; grant to admission/admin/host
roles as the Director decides). RLS is enforced server-side inside the RPCs
regardless of UI grant — the permission key only controls page visibility.

---

## 2. Nav entry

### `MENU_PERMISSIONS` route→permission map (`lib/sidebarMenuLink.ts`, ~line 940)

There is currently one mapping: `'/meetings': 'meetings.view'`. Add:

```ts
'/meetings/analytics': 'meetings.analytics.view',
```

### Sidebar menu object (left sidebar)

The Meetings module has **no left-sidebar nav object yet** — it is reached by
direct URL only. If/when a `Meetings` sidebar entry is added, give it an
`Analytics` child pointing at `/meetings/analytics` with permission
`meetings.analytics.view`. Until then the page is reachable at:

```
/meetings/analytics
```

(Mobile BottomNav + in-module tabs live in `lib/navigation/modules.ts` — add a
tab there too if the module gets a tabbed shell.)

---

## 3. Migration (NOT applied — DRAFT)

**File:** `supabase/migrations/20260617001300_meet_analytics.sql`

Adds two read-only `SECURITY DEFINER` aggregation RPCs over existing tables
(`meeting_bookings`, `meeting_routing_log`) — no new tables, no schema changes:

| Function | Returns | Purpose |
|---|---|---|
| `fn_meeting_analytics_summary(p_from timestamptz, p_to timestamptz)` | `jsonb` | totals (total/confirmed/cancelled/completed/no_show + cancel_rate) and by_type / by_host / by_day / by_source breakdowns |
| `fn_meeting_routing_distribution(p_from timestamptz, p_to timestamptz)` | `jsonb` | round-robin funnel: by_strategy / by_pool / by_counselor over `meeting_routing_log` |

Both:
- Host-scope inside the function body: `is_super_admin() OR is_admin()` → all
  hosts; otherwise own only (`host_profile_id = auth.uid()` for bookings,
  `counselor_user_id = auth.uid()` for routing log).
- `REVOKE EXECUTE … FROM anon, PUBLIC; GRANT … TO authenticated;` (anon-lockdown
  standard).
- Migration ends with `NOTIFY pgrst, 'reload schema';`.

**Apply step (for whoever merges):** run the migration against prod via Supabase
MCP / Management API. It is idempotent (`CREATE OR REPLACE` + explicit
REVOKE/GRANT). Also add the filename to `supabase/SQL_FILE_INDEX.md`.

---

## 4. Manual test steps

Prereq: log in (e.g. `test.superadmin@jkkn.ac.in` / the password from
`NEXT_PUBLIC_TEST_PASSWORD` in `.env.local` — set by whoever owns the
credential, and rotated periodically — at `/auth/test-login`) and ensure the
migration has been applied.

1. Navigate to `/meetings/analytics`.
2. **Super-admin / admin:** page loads, header says "across all hosts", metric
   cards show totals across every host, charts populate (or show empty-state
   text if no bookings in range).
3. **Date range:** change the preset (Last 7 / 30 / 90 days) — all cards and
   charts refetch and update for the new window.
4. **Host (non-admin) with `meetings.analytics.view`:** header says "for your
   meetings"; metric counts reflect only their own bookings (`host_profile_id =
   their uid`); routing counselor chart shows only routings that picked them.
5. **User WITHOUT `meetings.analytics.view`:** page shows the explicit
   "You don't have access — contact your administrator" fallback (NOT a redirect
   or blank page).
6. **Anon (logged out) hitting the RPC directly:** `fn_meeting_analytics_summary`
   / `fn_meeting_routing_distribution` return 401/permission-denied (anon
   revoked).

---

## 5. Files in this PR

```
supabase/migrations/20260617001300_meet_analytics.sql          (DRAFT — not applied)
lib/services/meetings/meeting-analytics-service.ts
hooks/meetings/use-meeting-analytics.ts
app/(routes)/meetings/analytics/page.tsx
NAV-WIRING-analytics.md
```
