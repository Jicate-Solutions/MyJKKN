# Admin 3-Tier Nav Pattern

> **Status:** Active (Phase 1 — auto-discovery from filesystem)
> **Last updated:** 2026-04-28
> **Owners:** MyJKKN platform engineering
> **CI gate:** `npm run check:admin-nav` (fails build on ghost pages)

## 1. Why this pattern exists

Before this pattern landed, the admin module accumulated **silent ghost pages** —
`page.tsx` files that existed on disk and rendered fine when you typed the URL,
but were not reachable from any sidebar or tab. A fresh user navigating from
`/admin` had no way to find them.

A single audit on 2026-04-28 surfaced **4 ghost admin pages** in production. The
cost: real features the team had built, that the people they were built for
could not discover. Static type-check, lint, and chip-reachability all passed.
The failure mode was structural — pages existed in two places (filesystem and
tree) and the two places drifted.

This pattern fixes the root cause:

- **Tier 1 (sidebar)** stays flat — one entry per top-level module.
- **Tier 2 (category tabs)** is auto-discovered from the filesystem.
- **Tier 3 (sub-page tabs)** is auto-discovered from each category's children.
- **Tier 4 (deeper nesting)** is also auto-discovered, with explicit overrides
  available via the `admin_nav_config` table (Phase 2).
- A CI gate (`scripts/check-admin-nav-coverage.ts`) fails the build whenever a
  page exists on disk but the nav tree can't reach it, or vice versa. Ghost
  pages become impossible to ship.

## 2. The 3-tier shape

```
Tier 1 — Sidebar
└── Admin                              (lib/sidebarMenuLink.ts, FLAT entry)
    └── /admin                         → Admin home

Tier 2 — Category tabs (rendered inside /admin layout)
├── /admin/notifications               (auto-discovered from app/(routes)/admin/notifications/)
├── /admin/lti
├── /admin/pde
├── /admin/counselors
├── /admin/bug-reports
├── /admin/landing-pages
├── /admin/page-metadata
├── /admin/retention-policies
├── /admin/saml
├── /admin/whatsapp-limits
├── /admin/lifecycle
├── /admin/ai-query-tools
└── /admin/reset-driver-passwords

Tier 3 — Sub-page tabs (rendered inside each category's layout)
e.g. /admin/notifications →
├── /admin/notifications               (Overview)
├── /admin/notifications/audiences
├── /admin/notifications/recipients
├── /admin/notifications/compliance
└── /admin/notifications/new

Tier 4 — Optional deeper nesting (also auto-discovered)
e.g. /admin/notifications/audiences →
└── /admin/notifications/audiences/new
```

The visual analog of this pattern (in-page tabs, sidebar stays flat) is
already shipping in the admission module. See
`app/(routes)/admission/counselors/team/layout.tsx` (PR #603) for the
reference implementation in a non-admin module.

## 3. Auto-discovery rules

The auto-discovery logic lives in `lib/admin/nav-tree.ts` (foundation PR by
Agent M). Its rules are:

### When does a directory become a category?

A directory under `app/(routes)/admin/` becomes a Tier 2 category iff:

1. It contains a `page.tsx` (so the category is itself navigable).
2. Its name does **not** start with `_` (private folders are skipped).
3. Its name is **not** a route group `(group)` or dynamic segment `[id]`
   (these don't render a single canonical URL).

### How are sub-pages discovered?

For each category, the same rules apply recursively to its child directories.
Every `page.tsx` found becomes a leaf in the tree.

### How are labels derived?

Default label = directory name converted from `kebab-case` to `Title Case`:

| Filesystem path                          | URL                                | Default label   |
|------------------------------------------|------------------------------------|-----------------|
| `admin/notifications/page.tsx`           | `/admin/notifications`             | Notifications   |
| `admin/notifications/audiences/page.tsx` | `/admin/notifications/audiences`   | Audiences       |
| `admin/lti/grade-sync/page.tsx`          | `/admin/lti/grade-sync`            | Grade Sync      |
| `admin/whatsapp-limits/page.tsx`         | `/admin/whatsapp-limits`           | Whatsapp Limits |

### Ordering

Default order = alphabetical. The `admin_nav_config` DB table (Phase 2) lets
ops override both label and order without a code change.

## 4. How to add a new admin page (happy path)

This is the contract for any dev adding a new admin page:

1. **Create the page file.**
   `app/(routes)/admin/<category>/<page>/page.tsx` (or any deeper nesting
   the data requires).

2. **Wire permissions.**
   Add the route's permission key to `lib/sidebarMenuLink.ts` `MENU_PERMISSIONS`.
   Without it the page leaks to every authenticated role
   (see `feedback_local_dev_may_hit_prod` and
   `scripts/check-tier2-route-coverage.mjs`).

3. **Run the local CI gate.**
   ```bash
   npm run check:admin-nav
   ```
   This walks the filesystem and the nav tree and tells you whether your
   page is reachable. If it isn't, the script tells you exactly which entry
   is missing. If it is, the table prints `OK All N admin pages on disk are
   reachable from the nav tree`.

4. **Commit and PR.**
   The same gate runs in CI on every PR. A green local run is necessary but
   not sufficient — the CI run is the source of truth.

That's it. **No manual sidebar edit, no nav-tree edit** — the auto-discovery
picks the new page up by virtue of its filesystem path. The only manual edit
is the permission key (which CI also enforces).

## 5. How to override defaults (Phase 2 — `admin_nav_config` table)

Phase 2 (planned, not yet shipped) adds a DB table:

```sql
admin_nav_config (
  id UUID PRIMARY KEY,
  href TEXT NOT NULL UNIQUE,    -- e.g. '/admin/lti/grade-sync'
  label TEXT,                    -- override default Title Case label
  sort_order INT DEFAULT 0,      -- override default alphabetical order
  hidden BOOLEAN DEFAULT FALSE,  -- hide from nav without deleting page
  parent_href TEXT,              -- override default parent (re-parenting)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)
```

When `getAdminNavTree()` runs, it left-joins the auto-discovered tree with
`admin_nav_config` and applies overrides. This lets ops:

- Rename a page label without a code deploy.
- Hide a page from nav while leaving it accessible by direct URL (useful
  for staged rollouts or super-admin-only pages).
- Re-parent a page (e.g. move `/admin/lti/grade-sync` under a new
  `Integrations` category without moving the file on disk).
- Reorder categories or sub-pages.

The CI gate stays compatible: a `hidden=true` row is treated as
"intentionally not in tree" and does NOT count as a ghost page.

## 6. The CI check (`scripts/check-admin-nav-coverage.ts`)

The CI gate is the safety net that makes this pattern self-healing.

### What it does

1. Walks the filesystem for every `app/(routes)/admin/__/page.tsx`. Filters
   out dynamic segments and private folders. Result: set A of admin URLs.
2. Calls `getAdminNavTree()` and flattens it into the set of all reachable
   leaf hrefs. Result: set B.
3. Computes `A \ B` (ghost pages — exist on disk, not reachable). Fails
   the build if any are present.
4. Computes `B \ A` (orphan tree entries — referenced in tree, no page on
   disk). Also fails the build.

### Why both directions matter

Ghost detection (A \ B) is the obvious case — that's the original silent
ghost-page bug. Orphan detection (B \ A) catches the inverse: a page that
was deleted while leaving a stale entry in the tree (or in
`admin_nav_config` once Phase 2 lands). A user clicking the orphan tree
entry would 404 — also a silent failure, also caught here.

### Run it

```bash
# CI mode (exit 1 on any gap)
npm run check:admin-nav

# Verbose mode (print every fs path and tree leaf)
npx tsx scripts/check-admin-nav-coverage.ts --verbose
```

### Graceful fallback when the foundation is unmerged

The script imports `getAdminNavTree` dynamically. If the foundation PR
(Agent M) hasn't merged yet, the import fails — the script catches the
error, prints an actionable message, and exits 0 (non-blocking). This
lets the script land in either order relative to the foundation. Once
the foundation merges, the gate becomes blocking on every subsequent PR.

## 7. Pattern reference files

| File                                                              | Role                                              |
|-------------------------------------------------------------------|---------------------------------------------------|
| `app/(routes)/admin/layout.tsx`                                   | Tier 1 admin shell (renders Tier 2 category tabs) |
| `app/(routes)/admin/<category>/layout.tsx`                        | Tier 2 category shell (renders Tier 3 sub-tabs)   |
| `lib/admin/nav-tree.ts`                                           | Auto-discovery + `admin_nav_config` join logic    |
| `components/admin/AdminModuleNav.tsx`                             | Tier 2 category tab renderer                      |
| `components/admin/AdminSubPageNav.tsx`                            | Tier 3 sub-page tab renderer                      |
| `scripts/check-admin-nav-coverage.ts`                             | CI gate (this doc, Section 6)                     |
| `app/(routes)/admission/counselors/team/layout.tsx`               | Cross-module reference for the in-page tab idiom  |
| `lib/sidebarMenuLink.ts`                                          | Tier 1 flat sidebar entry + `MENU_PERMISSIONS`    |
| `scripts/check-tier2-route-coverage.mjs`                          | Sister gate (permission coverage, all modules)    |
| `scripts/check-nav-reachability.ts`                               | Sister gate (chip-click BFS, all modules)         |

## 8. Anti-patterns (do not do this)

### x Adding the page to the sidebar manually

Tier 1 stays flat. One sidebar entry per module. If you find yourself
editing `lib/sidebarMenuLink.ts` to add an entry under `/admin/...`,
stop — the auto-discovery should pick it up for free.

### x Hard-coding the nav tree in a component

Don't write a `const ADMIN_NAV = [...]` literal in
`AdminModuleNav.tsx`. The whole point of `getAdminNavTree()` is that the
filesystem is the source of truth. Hard-coded trees rot.

### x Skipping the CI gate locally

`npm run check:admin-nav` takes under 1 second. Run it before pushing.
Skipping it doesn't save time — CI catches the gap and you cycle back.

### x Using route groups `(group)` to hide a page from nav

Route groups don't render in the URL, but they also don't reliably
suppress auto-discovery. The intended way to hide a page from nav is
the `admin_nav_config.hidden` column once Phase 2 lands. Until then,
move the page out of `admin/` if it shouldn't appear there.

### x Putting business logic in `nav-tree.ts`

The nav tree module owns one concern: walk the filesystem, apply
overrides, return a tree. Permission checks happen in
`PermissionGuard` and `MENU_PERMISSIONS`. Don't conflate them.

## 9. Changelog

| Date       | Change                                                                       |
|------------|------------------------------------------------------------------------------|
| 2026-04-28 | Pattern shipped (Wave 4, parallel agents M + N + O). Phase 1 auto-discovery. |

---

*Questions? Look at the sister gate `check-tier2-route-coverage.mjs` for the
permission-leak analog of this same fs-vs-declaration drift class. Same idea,
different artifact.*
