# NAV-WIRING — M7 Embed + Theming

Module 7 of Universal Booking. Adds an embeddable booking widget + per-host
brand color. **All files are new except one additive DB column.** The team
lead must wire the items below into the shared, off-limits files.

---

## 1. Permission key (REQUIRED — team lead must add)

The admin page is gated by:

```tsx
<PermissionGuard module="meetings" action="embed.manage"> … </PermissionGuard>
```

→ permission key **`meetings.embed.manage`**.

This key does **NOT yet exist** in `lib/constants/permissions.ts` (that file is
off-limits to this agent). Until it is added and granted to roles, the page
shows its "you don't have access" fallback to everyone **except** super_admin /
admin (who bypass `PermissionGuard`). That is safe-by-default, not broken — but
to make the tab usable for hosts, add the key under the existing **Meetings**
category (around line 1928, next to `meetings.view`):

```ts
{
  name: 'Meetings',
  key: 'meetings',
  permissions: [
    { key: 'meetings.view', label: 'View Meetings Module' },
    { key: 'meetings.embed.manage', label: 'Manage Booking Embed & Theming' }, // M7
  ]
},
```

Then grant `meetings.embed.manage` to whichever roles own a public booking page
(the same roles that have a `/meetings/availability` page — staff/faculty/hod/
counselors/admission). Grant via Role Management UI or a `custom_roles`
permissions-JSONB migration.

## 2. Navigation entry

- **In-page tab:** the page renders a Meetings tab bar
  (Inbox / My Availability / Manage Event Types / **Embed & Theming**) matching
  the sibling `/meetings/availability` page. No new sidebar entry is required —
  the sidebar already links `/meetings` (gated by `meetings.view`), and the new
  tab is reached from there.
- **No `lib/sidebarMenuLink.ts` edit needed.** If you *want* a direct sidebar
  sub-link to `/meetings/embed`, add `'/meetings/embed': 'meetings.embed.manage'`
  to `MENU_PERMISSIONS` and a menu item — but it is optional; the tab bar covers
  navigation. (This agent did not touch sidebarMenuLink.ts.)

## 3. Migration (NOT applied — DRAFT)

**File:** `supabase/migrations/20260617001200_meet_embed_theming.sql`

- `ALTER TABLE meeting_host_pages ADD COLUMN IF NOT EXISTS theme_color text;`
- CHECK constraint `theme_color IS NULL OR theme_color ~ '^#[0-9A-Fa-f]{6}$'`
  (guarded so re-runs don't error).
- Ends with `NOTIFY pgrst, 'reload schema';`.
- **Idempotent.** No new RPC, no new grants. Anon posture unchanged
  (`REVOKE ALL … FROM anon` on `meeting_host_pages` already exists from the
  substrate migration; theme reads for anon flow through the existing
  service-role public read path).

Apply via Supabase MCP / `apply_migration` after merge. **Not applied by this
agent.**

## 4. New files (all self-contained)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260617001200_meet_embed_theming.sql` | theme_color column |
| `lib/services/meetings/meeting-embed-service.ts` | `readThemeColor()` (additive service-role read) + `buildEmbedSnippets()` (pure) + `DEFAULT_THEME_COLOR` / `HEX_COLOR_RE` |
| `app/(public)/embed/[handle]/page.tsx` | public iframe-friendly booking page (server) |
| `app/(public)/embed/[handle]/_components/embed-booking-widget.tsx` | iframe-friendly booking widget (client), themed |
| `app/(routes)/meetings/embed/page.tsx` | admin page (client, PermissionGuard) |
| `app/(routes)/meetings/embed/_components/embed-manager.tsx` | color picker + snippet generator (client) |
| `app/(routes)/meetings/embed/actions.ts` | `getMyEmbedState` / `saveMyThemeColor` (server actions, RLS-scoped) |
| `__tests__/meetings/meeting-embed-service.test.ts` | 8 unit tests (pure fns) |

**Reuses (never edits):**
- `PublicHostService.resolveBookableHost()` — the authoritative D20 bookability
  gate for the embed read.
- `POST /api/public/meet/<handle>/<typeSlug>/slots` + `/book` — the existing
  public booking APIs (the embed widget calls them as-is).

## 5. Manual test steps

Run a dev server from a `jicate/main` worktree (per CLAUDE.md), apply the
migration to the DB it points at, then:

**Admin (theme + snippet):**
1. Sign in as a host who already has a public booking page (handle set, public).
2. Go to **Meetings → Embed & Theming** (`/meetings/embed`).
3. Pick a brand color (color input / hex field / a preset swatch) → **Save color**.
   Expect a "Brand color saved" toast; reload keeps the color.
4. If the host has no page row yet, expect the "Set up your booking page first"
   card instead (no crash).
5. Copy the **iframe** snippet; confirm the URL is `…/embed/<handle>` for the
   current origin.

**Public embed:**
6. Open `/embed/<handle>` directly (or click "Preview the embed"). Expect a bare,
   chrome-less booking widget themed in the saved color (header rule, selected
   slot, Confirm button all use it). With a pale color, button text stays dark
   (readable-foreground logic).
7. Complete a booking → instant confirmation stub with a reference UID (proves
   it uses the existing `/book` API).
8. Open `/embed/<unknown-handle>` or a private host → 404 (same D20 gate as
   `/meet`).
9. Drop the iframe snippet into any static HTML page and confirm it renders
   inside the iframe (no app sidebar/nav leaks in).

## 6. Build

`npm run build` may OOM on the dev Mac — rely on PR CI for the full typecheck.
Unit tests pass: `npx vitest run __tests__/meetings/meeting-embed-service.test.ts`
→ 8/8.
