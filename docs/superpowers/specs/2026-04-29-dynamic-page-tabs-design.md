# Dynamic Page-Tabs System — Design Spec

**Date:** 2026-04-29
**Status:** Pending user review (post-brainstorming, pre-implementation-plan)
**Author:** Boobalan (via Claude Code brainstorming session, four parallel research agents)

---

## 1. Problem Statement

The MyJKKN codebase already has rich navigation infrastructure:

- A filesystem-derived route manifest (`lib/navigation/route-manifest.generated.ts`, ~540 pages) regenerated each build by `scripts/generate-route-manifest.ts`.
- A 34-entry module catalogue at `lib/navigation/modules.ts`.
- 9 per-module `nav-config.ts` files declaring 3-tier in-page tab groupings (group → child → grandchild).
- A global `<AutoTabNav />` mounted at `app/(routes)/layout.tsx:51` that already renders these tabs from the manifest + nav-config.
- A 600-entry `MENU_PERMISSIONS` map (`lib/sidebarMenuLink.ts:138`) that gates every nav surface (sidebar, AutoTabNav, SectionSubNav, Cmd+K palette).
- Two newly-shipped (2026-04-29) override admin UIs: `/admin/nav-config` (admin-area nav overrides via `platform_policies`) and `/admin/page-metadata` (keywords/shortcuts via dedicated table).

What is **missing** is a way for admins to **rename, reorder, hide, re-parent, or add tabs** that appear inside module pages **without a code deploy**. Today the only path is editing `nav-config.ts` and shipping a PR. There is also no DB-readable surface admins can configure for newly-added pages.

---

## 2. Goals

1. **Admin-editable in-page tab tree, 3 tiers deep** — rename, reorder, hide, re-parent, add new tabs from a UI in `/admin/navigation/page-tabs` without a deploy.
2. **Auto-discovery for new pages** — when a developer adds a new page, its tab definition is auto-seeded by the build script. Admin sees a "ghost row" in the UI on next deploy and can promote/edit/hide.
3. **Per-institution overrides** — different institutions can present different module tab layouts (e.g. one institution hides a tab another shows).
4. **Zero churn for existing routes** — all 600 `MENU_PERMISSIONS` entries, all 9 `nav-config.ts` files, all 34 `MODULES` slugs continue to work unchanged. The DB layer is purely additive.
5. **Clean revert path** — `DELETE FROM page_tab_overrides WHERE …` restores baseline immediately.
6. **Future-proof for in-page section tabs** — `kind='section'` slot reserved in schema so the 155 `<TabsList>` callsites can migrate later without schema changes.

---

## 3. Out of Scope (v1)

- Migrating any of the **155 in-page `<TabsList>` callsites** to the new system. v1 supports `kind='route'` only.
- Per-role or per-user tab overrides. v1 supports `scope_type IN ('global', 'institution')`.
- A new permission category `navigation.tabs.manage`. v1 gates writes on `is_super_admin() OR is_admin()`, matching `/admin/nav-config`.
- Replacing or deleting any existing `nav-config.ts` file. They remain code-defined defaults.
- Cron-based filesystem polling. v1 uses build-time seed + a manual "Refresh from filesystem" admin button.
- Changing any URL.
- Changing `MENU_PERMISSIONS`, the sidebar, the Cmd+K palette structure, or `AutoBreadcrumbs`.
- Localisation / i18n of tab labels (label is a single TEXT column).
- Drag-and-drop animations. v1 uses up/down arrow buttons; DnD-Kit is a v2 polish.

---

## 4. Locked Decisions

Decided during the brainstorming session preceding this spec.

| # | Decision | Rationale |
|---|---|---|
| 1 | **Phase D**: route-as-tab now (`kind='route'`); `kind='section'` reserved for in-page tabs later. | Honors PR-S2's deliberate split between sidebar and in-page tabs; smallest viable v1 surface. |
| 2 | **Hybrid discovery**: filesystem → `nav-config.ts` → DB overrides. Three-layer precedence. | Honors existing 9 `nav-config.ts` files; adds zero ceremony for simple modules; admin DB always wins. |
| 3 | **Module-key FK**: `module_slug` from `lib/navigation/modules.ts` (text, 34 stable slugs). | Route-as-tab is URL-driven; matches `nav-config.ts` and `module_scopes` JSONB convention. |
| 4 | **Override scope**: `scope_type IN ('global', 'institution')`. | Per-role/per-user is mostly redundant with permissions; per-institution is genuinely useful. |
| 5 | **Permission gating**: inherit `MENU_PERMISSIONS[normalized_href]` by default; tab can declare `required_permission` to *narrow* further (never widen). | 90% of tabs need no extra config; admins keep narrow-down power. |
| 6 | **Active-tab URL strategy**: `kind='route'` uses path segments (existing behavior); `kind='section'` (future) uses `?tab=`. Captured in `kind` enum. | Inherent to the kind. No second column needed. |
| 7 | **Admin UI location**: `/admin/navigation/page-tabs` under a new `/admin/navigation` umbrella with sub-tabs to existing `/admin/nav-config` and `/admin/page-metadata`. | Eats our own dogfood; gives admins one mental home for nav config. |
| 8 | **Existing 9 `nav-config.ts`**: stay as code-defined defaults. DB overrides layer on top. | Honors precedent set by `/admin/nav-config`'s relationship to `lib/admin/nav-tree.ts`. |
| 9 | **Write authorization**: `is_super_admin() OR is_admin()` (verbatim from `platform_policies` policies). | Mirrors `/admin/nav-config`. No new permission category to seed. |
| 10 | **Auto-detect new pages**: build-time only (extend `gen:routes`) + manual "Refresh from filesystem" admin button. No cron. | Manifest is the authoritative source already; cron adds infra for negligible benefit. |
| 11 | **Depth limit**: 3 tiers, enforced by both DB CHECK constraint and RPC validation. | Cheap defense in depth. |
| 12 | **Default tab**: explicit `is_default` BOOLEAN per parent (uniqueness via partial unique index). | Clearer than implicit ordering. |
| 13 | **Architectural shape**: two dedicated tables (`page_tab_definitions` + `page_tab_overrides`) — Approach 1 from the brainstorming session. | Strongest precedent (`dashboard_widgets` + `platform_policies`); cleanest revert; clearest auditing. |

---

## 5. Architecture Overview

### 5.1 Substrate stack (existing — unchanged)

```
filesystem (app/(routes)/**)
        │
        ▼
scripts/generate-route-manifest.ts  ──► route-manifest.generated.ts (~540 pages)
        │
        ▼
MODULES (34) ──► nav-config.ts (9 modules, hand-declared 3-tier groups)
        │
        ▼
MENU_PERMISSIONS (600 entries, single permission map for all nav surfaces)
        │
        ▼
<AutoTabNav /> (mounted globally in app/(routes)/layout.tsx:51)
└─► resolveTiers() in lib/navigation/tier-rendering.ts
```

### 5.2 New layer (this spec)

```
[ existing nav-config.ts result ]
              │
              │ (merge per tab_key — DB wins)
              ▼
fn_get_resolved_page_tabs(module_slug, institution_id)
              │
              │ (RLS-filtered, perm-filtered, priority-resolved)
              ▼
page_tab_definitions  ────── seeded by build script + nav-config.ts walk
        ⨝ (LEFT JOIN on tab_key)
page_tab_overrides    ────── admin-edited via /admin/navigation/page-tabs
              │
              ▼
useDynamicTabs(moduleSlug) hook  ──►  resolveTiers() merges DB + code result
              │
              ▼
<AutoTabNav /> renders the merged tree
```

### 5.3 The `tab_key` canonicalization

Every tab has a stable, deterministic `tab_key`:

- `kind='route'`: derived from URL path with dots — `/admission/leads/kanban` → `admission.leads.kanban`. Path normalization (UUID → `[id]`, group folders stripped) reuses `lib/sidebarMenuLink.ts:1584` `normalizeRoute()`.
- `kind='section'` (future): `<module_slug>.<page_path_dotted>.<section_slug>` — e.g. `users.permissions-audit.ask`.

A new module `lib/navigation/tab-key.ts` exports `tabKeyFromHref(href)`, `tabKeyFromSection(href, sectionId)`, and `parseTabKey(key)`. This is the ONE function every layer uses to translate between URL and tab_key.

---

## 6. Data Model

### 6.1 `page_tab_definitions` — code-declared baseline (registry)

```sql
CREATE TABLE page_tab_definitions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_key                TEXT NOT NULL UNIQUE,
  module_slug            TEXT NOT NULL,
  parent_tab_key         TEXT REFERENCES page_tab_definitions(tab_key) ON DELETE CASCADE,
  kind                   TEXT NOT NULL DEFAULT 'route'
                         CHECK (kind IN ('route','section')),
  href                   TEXT,                 -- canonical path for kind='route'; nullable for section
  default_label          TEXT NOT NULL,
  default_icon           TEXT,                 -- lucide icon name
  default_display_order  INT  NOT NULL DEFAULT 0,
  default_is_default     BOOLEAN NOT NULL DEFAULT false,
  required_permission    TEXT,                 -- NULL → inherit MENU_PERMISSIONS[normalized_href]
  source                 TEXT NOT NULL CHECK (source IN ('filesystem','nav-config','admin')),
  is_active              BOOLEAN NOT NULL DEFAULT true,
  depth                  INT NOT NULL CHECK (depth BETWEEN 1 AND 3),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             UUID REFERENCES profiles(id),
  updated_by             UUID REFERENCES profiles(id)
);

CREATE INDEX idx_ptd_module       ON page_tab_definitions(module_slug);
CREATE INDEX idx_ptd_parent       ON page_tab_definitions(parent_tab_key);
CREATE INDEX idx_ptd_kind         ON page_tab_definitions(kind);
CREATE UNIQUE INDEX uq_ptd_default
  ON page_tab_definitions(parent_tab_key)
  WHERE default_is_default = true;
```

`source` semantics:
- `'filesystem'` — tab discovered by the build script from a `page.tsx` file with no enclosing nav-config entry.
- `'nav-config'` — tab declared in a `<slug>/nav-config.ts` file.
- `'admin'` — tab created by an admin in the UI (no source code presence).

### 6.2 `page_tab_overrides` — admin-editable layer

```sql
CREATE TABLE page_tab_overrides (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_key                       TEXT NOT NULL REFERENCES page_tab_definitions(tab_key) ON DELETE CASCADE,
  scope_type                    TEXT NOT NULL CHECK (scope_type IN ('global','institution')),
  scope_id                      UUID,            -- NULL when scope_type='global'
  label_override                TEXT,
  icon_override                 TEXT,
  display_order_override        INT,
  parent_tab_key_override       TEXT REFERENCES page_tab_definitions(tab_key),
  is_default_override           BOOLEAN,
  hidden                        BOOLEAN NOT NULL DEFAULT false,
  required_permission_override  TEXT,            -- can only narrow; resolver enforces
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                    UUID REFERENCES profiles(id),
  updated_by                    UUID REFERENCES profiles(id),

  CONSTRAINT chk_scope_id CHECK (
    (scope_type = 'global'      AND scope_id IS NULL) OR
    (scope_type = 'institution' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT uq_pto_key_scope
    UNIQUE (tab_key, scope_type,
            COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX idx_pto_tab_key  ON page_tab_overrides(tab_key);
CREATE INDEX idx_pto_scope    ON page_tab_overrides(scope_type, scope_id);
```

### 6.3 RLS

Modeled verbatim on `platform_policies` (`supabase/migrations/20260429000002_platform_policies_substrate.sql:41-58`):

```sql
ALTER TABLE page_tab_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_tab_overrides   ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (filtering by perm happens in the RPC, not RLS)
CREATE POLICY ptd_select ON page_tab_definitions FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY pto_select ON page_tab_overrides FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Write: super_admin or admin only
CREATE POLICY ptd_write ON page_tab_definitions FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());
CREATE POLICY pto_write ON page_tab_overrides FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());
```

Note: per memory-note "Browser-side mutations need SECURITY DEFINER RPC", clients **never** write directly to these tables. They go through `fn_upsert_page_tab` / `fn_reorder_page_tabs` / `fn_delete_page_tab_override` (defined below). RLS write policies exist as a defense-in-depth backstop only.

---

## 7. RPC Surface

### 7.1 `fn_get_resolved_page_tabs(p_module_slug TEXT, p_institution_id UUID DEFAULT NULL)`

SECURITY DEFINER. Returns the merged 3-tier tree for one module, with `institution > global` priority and `user_has_permission()` filtering applied. Mirrors `fn_get_admin_nav_overrides()` shape (`supabase/migrations/20260429_admin_nav_overrides_seeds.sql:26-58`).

Returns table:
```
tab_key TEXT, parent_tab_key TEXT, kind TEXT, href TEXT,
label TEXT, icon TEXT, display_order INT, is_default BOOLEAN,
hidden BOOLEAN, depth INT, required_permission TEXT,
override_source TEXT  -- 'institution' | 'global' | NULL (no override)
```

Implementation outline:
```sql
WITH resolved AS (
  SELECT
    d.tab_key,
    COALESCE(po_inst.parent_tab_key_override, po_glob.parent_tab_key_override, d.parent_tab_key) AS parent_tab_key,
    d.kind, d.href,
    COALESCE(po_inst.label_override, po_glob.label_override, d.default_label) AS label,
    COALESCE(po_inst.icon_override,  po_glob.icon_override,  d.default_icon)  AS icon,
    COALESCE(po_inst.display_order_override, po_glob.display_order_override, d.default_display_order) AS display_order,
    COALESCE(po_inst.is_default_override,    po_glob.is_default_override,    d.default_is_default)    AS is_default,
    COALESCE(po_inst.hidden, po_glob.hidden, false) AS hidden,
    d.depth,
    COALESCE(po_inst.required_permission_override, po_glob.required_permission_override, d.required_permission) AS required_permission,
    CASE WHEN po_inst.id IS NOT NULL THEN 'institution'
         WHEN po_glob.id IS NOT NULL THEN 'global'
         ELSE NULL END AS override_source
  FROM page_tab_definitions d
  LEFT JOIN page_tab_overrides po_glob
    ON po_glob.tab_key = d.tab_key AND po_glob.scope_type = 'global'
  LEFT JOIN page_tab_overrides po_inst
    ON po_inst.tab_key = d.tab_key AND po_inst.scope_type = 'institution' AND po_inst.scope_id = p_institution_id
  WHERE d.module_slug = p_module_slug AND d.is_active = true
)
SELECT * FROM resolved
WHERE NOT hidden
  AND (
    is_super_admin()
    OR (required_permission IS NOT NULL AND user_has_permission(required_permission))
  )
ORDER BY depth, display_order;
```

### 7.2 `fn_upsert_page_tab(...)`

SECURITY DEFINER. Creates or updates a `page_tab_definitions` row OR a `page_tab_overrides` row depending on the `mode` argument. Validates depth ≤ 3, validates `parent_tab_key` exists, validates uniqueness. Returns the affected row.

### 7.3 `fn_reorder_page_tabs(p_parent_tab_key TEXT, p_ordered_tab_keys TEXT[], p_scope_type TEXT, p_scope_id UUID)`

SECURITY DEFINER. Bulk updates `display_order_override` (or `default_display_order` for `source='admin'` rows) in a single transaction.

### 7.4 `fn_delete_page_tab_override(p_tab_key TEXT, p_scope_type TEXT, p_scope_id UUID)`

SECURITY DEFINER. Deletes one override row → tab falls back to defaults.

### 7.5 `fn_resync_tab_definitions_from_seed(p_seed JSONB)`

SECURITY DEFINER, super_admin only. Called by `scripts/sync-tab-definitions.ts` post-build. Upserts `source IN ('filesystem','nav-config')` rows from the build seed JSON; never deletes; preserves `source='admin'` rows.

All RPCs grant `EXECUTE` to `authenticated` (gating happens inside via `is_super_admin() OR is_admin()` for writes).

---

## 8. Build-Time Discovery

### 8.1 Extension to `scripts/generate-route-manifest.ts`

After emitting `route-manifest.generated.ts`, the script also emits `lib/navigation/route-tab-seed.generated.json`:

```json
[
  {
    "tab_key": "admission.leads.kanban",
    "module_slug": "admission",
    "parent_tab_key": "admission.leads",
    "kind": "route",
    "href": "/admission/leads/kanban",
    "default_label": "Kanban",
    "default_icon": "Columns3",
    "default_display_order": 0,
    "depth": 3,
    "source": "nav-config",
    "required_permission": null
  },
  ...
]
```

Source-of-truth precedence when computing each row:
1. If a `<slug>/nav-config.ts` entry maps to this href → `source='nav-config'`, label/icon/order from nav-config.
2. Else if the page exists in the manifest → `source='filesystem'`, label/icon from `navMeta` export (already supported by the script at `:103-122`), order = stable hash of href.

### 8.2 `scripts/sync-tab-definitions.ts` (new)

Runs in `package.json:postdeploy` (or admins click "Refresh from filesystem" in the UI). Reads `route-tab-seed.generated.json`, calls `fn_resync_tab_definitions_from_seed`. Local dev runs it via `npm run sync:tabs`.

### 8.3 CI gate `scripts/check-tab-coverage.ts` (new)

Joins `route-manifest.generated.ts` × `route-tab-seed.generated.json` × `MENU_PERMISSIONS`. Fails CI if:
- A route has a `MENU_PERMISSIONS` entry but no tab seed (orphan route).
- A tab seed references a `parent_tab_key` not in the seed (broken hierarchy).
- A tab depth > 3.
- A `tab_key` collides with another (non-deterministic key derivation bug).

Wired into `package.json:build` after `check:reachability`.

---

## 9. Render Bridge

### 9.1 `hooks/use-dynamic-tabs.ts` (new)

```ts
export function useDynamicTabs(moduleSlug: string, institutionId?: string | null) {
  return useQuery({
    queryKey: ['page-tabs', 'resolved', moduleSlug, institutionId ?? 'global'],
    queryFn: () => pageTabsService.getResolved(moduleSlug, institutionId ?? null),
    staleTime: 60_000,
  });
}
```

### 9.2 Modification to `lib/navigation/tier-rendering.ts:resolveTiers()`

`resolveTiers(pathname, opts)` gains an optional `dynamicTabs?: ResolvedTab[]` parameter. When passed, it merges per-tab_key:
- DB tab present + not hidden → DB row wins (label, icon, order, parent).
- DB tab present + hidden → drop the row.
- DB tab absent → fall back to existing nav-config / manifest result.

Merge happens at flatten-time, before chip ordering. No public API change — call sites that don't pass `dynamicTabs` get the existing behavior.

### 9.3 Modification to `components/navigation/auto-tab-nav.tsx`

```tsx
const moduleSlug = deriveModuleSlugFromPath(pathname);
const { institutionId } = useCurrentInstitution();
const { data: dynamicTabs } = useDynamicTabs(moduleSlug, institutionId);
const tiers = resolveTiers(pathname, { dynamicTabs: dynamicTabs ?? undefined });
```

If the query hasn't resolved yet, fall back to the static tier result so first paint is fast.

### 9.4 Cmd+K registry inclusion

`lib/navigation/page-registry.ts:buildRegistry()` gains a fourth merge step (after the manifest-pages merge): pull all `page_tab_definitions WHERE kind='route' AND is_active = true` and add any tabs whose `href` isn't already in `seen`. This ensures admin-added tabs are discoverable in Cmd+K.

(This step runs client-side after registry initialization, behind the same `useDynamicTabs` query, so it's automatically permission-filtered.)

---

## 10. Admin UI — `/admin/navigation/page-tabs`

### 10.1 Umbrella

`app/(routes)/admin/navigation/layout.tsx` renders a 3-tab header:
- **Admin Nav** (existing `/admin/nav-config`)
- **Page Metadata** (existing `/admin/page-metadata`)
- **Page Tabs** (new — this spec)

`/admin/nav-config` and `/admin/page-metadata` redirect to `/admin/navigation/admin-nav` and `/admin/navigation/page-metadata` respectively (preserving any old bookmarks).

### 10.2 Page Tabs UI surface

Layout:
```
┌─────────────────────────────────────────────────────────────┐
│ [Module ▼: admission]  [Scope ▼: Global / <Institution>]    │
│ [Refresh from filesystem]  [Add tab]                        │
├─────────────────────────────────────────────────────────────┤
│ ▼ Leads                          [↑] [↓] [Edit] [Hide] [⟲] │
│   ▼ Kanban (default)             [↑] [↓] [Edit] [Hide] [⟲] │
│     • Detail                     [↑] [↓] [Edit] [Hide] [⟲] │
│   ▼ List                         [↑] [↓] [Edit] [Hide] [⟲] │
│ ▼ Counselors                     [↑] [↓] [Edit] [Hide] [⟲] │
│   …                                                         │
└─────────────────────────────────────────────────────────────┘
```

Per-row controls:
- **↑ / ↓**: bulk-reorder via `fn_reorder_page_tabs`.
- **Edit**: opens a Dialog with label, icon (lucide picker), required_permission_override, parent_tab_key_override, is_default_override.
- **Hide**: toggles `hidden=true` on the override row (creating one if absent).
- **⟲ Reset to default**: calls `fn_delete_page_tab_override` for the current scope. Removes only that scope's override.

Source badges per row:
- "Code" — `source IN ('filesystem','nav-config')`, no override exists.
- "Code · overridden" — code-defined, override exists for current scope.
- "Admin-added" — `source='admin'`.

"Add tab" only allows `source='admin'`, `kind='route'` rows in v1. The dialog requires an `href` and validates it against the route manifest (rejects unknown hrefs). The `kind='section'` option is disabled in v1; it ships in a future phase along with the in-page section-tab migration.

### 10.3 Service & hooks

```
lib/services/admin/page-tabs-service.ts
  ├─ getResolved(moduleSlug, institutionId)
  ├─ listDefinitions(moduleSlug)
  ├─ listOverrides(moduleSlug, scopeType, scopeId)
  ├─ upsertDefinition(...)        ← admin-added rows only
  ├─ upsertOverride(...)
  ├─ deleteOverride(tabKey, scopeType, scopeId)
  ├─ reorder(parentKey, orderedKeys, scopeType, scopeId)
  └─ resyncFromSeed()              ← super_admin only

hooks/use-page-tabs-admin.ts
  ├─ usePageTabDefinitions(moduleSlug)
  ├─ usePageTabOverrides(moduleSlug, scopeType, scopeId)
  ├─ useUpsertPageTab(...)
  ├─ useDeletePageTabOverride(...)
  ├─ useReorderPageTabs(...)
  └─ useResyncTabsFromSeed()
```

All hooks invalidate `['page-tabs', 'resolved', moduleSlug, …]` so the live `<AutoTabNav />` reflects edits within seconds.

---

## 11. Permission Gating Detail

### 11.1 Render-time

`fn_get_resolved_page_tabs` filters server-side via `user_has_permission(required_permission)`. The client never sees rows the user can't access, eliminating leaky-trigger UI bugs.

### 11.2 Permission resolution

For a tab with `required_permission = NULL`:
1. Resolver looks up `MENU_PERMISSIONS[normalizeRoute(href)]` via the existing helper exposed to SQL by `fn_get_route_permission(text)` (NEW — wraps a JSONB seed of MENU_PERMISSIONS uploaded each build, similar to `route-manifest.generated.ts`).
2. If lookup yields a permission key, `user_has_permission()` is called.
3. If lookup yields NULL, the tab is shown (matches current sidebar behavior for routes with no permission entry — *but see open question §14.1*).

Build-time addition: `scripts/generate-route-manifest.ts` also emits `lib/navigation/menu-permissions.generated.json` so SQL can read it. Sync RPC `fn_resync_menu_permissions(p_seed JSONB)` upserts rows into a small `menu_permissions_seed (route_normalized TEXT PRIMARY KEY, permission_key TEXT)` table. `fn_get_route_permission` reads from there.

### 11.3 Narrow-only override invariant

`required_permission_override` may only specify a permission that the user holding the inherited permission would also typically hold (i.e., it adds an *additional* required permission). The resolver enforces this by ANDing both keys: the user must have BOTH the inherited and the override permission. This guarantees overrides cannot widen access.

---

## 12. File Tree of Changes

### 12.1 New files

```
supabase/migrations/
  20260430000001_page_tab_definitions.sql
  20260430000002_page_tab_overrides.sql
  20260430000003_menu_permissions_seed.sql
  20260430000004_fn_get_resolved_page_tabs.sql
  20260430000005_fn_upsert_page_tab.sql
  20260430000006_fn_reorder_page_tabs.sql
  20260430000007_fn_delete_page_tab_override.sql
  20260430000008_fn_resync_tab_definitions_from_seed.sql
  20260430000009_fn_resync_menu_permissions.sql
  20260430000010_page_tabs_grants_and_indexes.sql

lib/services/admin/page-tabs-service.ts
lib/navigation/dynamic-tabs.ts
lib/navigation/tab-key.ts
lib/navigation/route-tab-seed.generated.json    -- generated artifact (gitignored? see §14.2)
lib/navigation/menu-permissions.generated.json  -- generated artifact

hooks/use-dynamic-tabs.ts
hooks/use-page-tabs-admin.ts

scripts/sync-tab-definitions.ts
scripts/sync-menu-permissions.ts
scripts/check-tab-coverage.ts

app/(routes)/admin/navigation/
  layout.tsx                              -- umbrella with 3 sub-tabs
  page.tsx                                -- redirect to admin-nav sub-tab
  admin-nav/
    page.tsx                              -- moved from /admin/nav-config (or re-export)
  page-metadata/
    page.tsx                              -- moved from /admin/page-metadata (or re-export)
  page-tabs/
    page.tsx                              -- main admin UI
    _components/
      tabs-tree.tsx
      tab-row.tsx
      tab-edit-dialog.tsx
      add-tab-dialog.tsx
      reset-defaults-button.tsx
      refresh-from-filesystem-button.tsx
      module-scope-selector.tsx

__tests__/navigation/
  tab-key.spec.ts
  dynamic-tabs-merge.spec.ts
  resolve-tiers-with-db.spec.ts
```

### 12.2 Modified files

| File | Change |
|---|---|
| `scripts/generate-route-manifest.ts` | Emit `route-tab-seed.generated.json` and `menu-permissions.generated.json` after `route-manifest.generated.ts`. |
| `package.json` | Add `gen:routes` to also produce the new JSONs; add `sync:tabs`, `sync:menu-perms`, `check:tab-coverage` scripts; wire into `build`. |
| `lib/navigation/tier-rendering.ts` | `resolveTiers()` accepts optional `dynamicTabs` parameter; merge logic. |
| `components/navigation/auto-tab-nav.tsx` | Call `useDynamicTabs`, pass result into `resolveTiers`. |
| `lib/navigation/page-registry.ts` | Optional 4th merge source: admin-added route tabs. |
| `app/(routes)/admin/nav-config/page.tsx` | Replaced by redirect to `/admin/navigation/admin-nav`. |
| `app/(routes)/admin/page-metadata/page.tsx` | Replaced by redirect to `/admin/navigation/page-metadata`. |

Total surface: ~10 SQL migrations, ~12 new TS files, ~6 modified TS files. No deletions.

---

## 13. Testing Strategy

### 13.1 Unit tests

- `tab-key.spec.ts` — `tabKeyFromHref` is deterministic for all 540 manifest pages; round-trips through `parseTabKey`.
- `dynamic-tabs-merge.spec.ts` — merge precedence (institution > global > nav-config > filesystem) for 12 fixture cases.
- `resolve-tiers-with-db.spec.ts` — confirms passing `dynamicTabs` doesn't regress the static path; confirms hidden tabs disappear from output.

### 13.2 Integration tests (Supabase test branch)

- `fn_get_resolved_page_tabs` returns expected tree for a fixture module under both global and institution scopes.
- Permission filtering: tab with `required_permission='admission.leads.view'` is hidden from a user without it.
- `fn_reorder_page_tabs` updates orders atomically; partial failure rolls back.
- `fn_resync_tab_definitions_from_seed` never deletes `source='admin'` rows.

### 13.3 E2E (Playwright, smoke only)

- Admin navigates `/admin/navigation/page-tabs`, edits a label, sees it reflected in `<AutoTabNav />` after page navigation.
- Admin clicks "Hide" on a tab, the chip disappears for that institution.
- Admin clicks "⟲ Reset to default", default reappears.

### 13.4 CI gate

`check:tab-coverage` runs on every PR; fails on orphan routes, broken hierarchies, depth > 3, or duplicate tab_keys.

---

## 14. Risks & Open Questions

### 14.1 Sidebar permission-leak parity (LOCKED)

**Risk**: The current sidebar (`lib/sidebarMenuLink.ts:1750-1756`) **hides** routes with no `MENU_PERMISSIONS` entry from non-super-admins. A naive resolver would **show** tabs with `required_permission = NULL`, creating an inconsistency between sidebar and tabs.

**Decision**: Resolver mimics sidebar. If a `kind='route'` tab's effective permission resolves to NULL via `MENU_PERMISSIONS` lookup AND the user is not `super_admin`, the tab is hidden. Encoded in `fn_get_resolved_page_tabs` as:
```sql
AND (required_permission IS NOT NULL AND user_has_permission(required_permission))
    OR is_super_admin()
```
This guarantees every visible tab traces to either an explicit permission or super-admin authority.

### 14.2 Generated JSON commit policy (LOCKED)

**Decision**: Both `route-tab-seed.generated.json` and `menu-permissions.generated.json` are **committed** to git, matching `route-manifest.generated.ts` precedent. PR diffs show tab-tree drift visibly, which is a feature for code review. Merge conflicts are tolerated and resolved by re-running `npm run gen:routes`.

### 14.3 Admin-added route tabs that point to nonexistent pages

**Risk**: An admin adds a tab with `href='/admission/foo'` but no `page.tsx` exists. Clicking yields a 404.

**Resolution**: `fn_upsert_page_tab` validates `href` against `route-manifest.generated.ts` (uploaded as a JSONB seed similar to `menu_permissions_seed`). Reject unknown hrefs with a clear error.

### 14.4 Cmd+K cache staleness

**Risk**: Admin adds a tab; Cmd+K palette doesn't show it until page reload.

**Resolution**: Invalidate the page-registry query on tab mutation. Acceptable.

### 14.5 Migration of `lib/navigation/nav-config.ts` ownership

**Risk**: Devs and admins might both edit a tab's properties — devs in `nav-config.ts`, admins via DB override. Confusion possible.

**Resolution**: Document the precedence (DB override > nav-config > filesystem) prominently in `lib/navigation/nav-config.ts` JSDoc and in the admin UI footer ("Code default: …; Override: …"). UI shows both values side-by-side in the Edit dialog.

### 14.6 Future `kind='section'` migration

**Risk**: When we ship in-page section tabs (future phase), the 155 existing `<TabsList>` callsites need a phased migration. Migration plan is out of scope for v1 spec but should not be blocked by this design.

**Resolution**: Schema reserves `kind='section'`. URL strategy column-coded. Migration plan = future spec.

---

## 15. Acceptance Criteria

1. Admin at `/admin/navigation/page-tabs` can rename, reorder, hide, re-parent, and add `kind='route'` tabs for any module slug at global or institution scope.
2. Edits propagate to `<AutoTabNav />` within one query refetch (≤ 60s by default; immediate on mutation invalidation).
3. Adding a new `page.tsx` under any module + running `npm run gen:routes` + redeploy seeds a new row in `page_tab_definitions` with `source='filesystem'`. Admin sees a "ghost row" in the UI labeled with the inferred title.
4. Existing 9 `nav-config.ts` files continue to render the same default tab tree.
5. Existing 600 `MENU_PERMISSIONS` entries continue to gate access; no permission keys deleted or renamed.
6. `DELETE FROM page_tab_overrides WHERE …` immediately reverts to defaults.
7. CI gate `check:tab-coverage` blocks merges that introduce orphan routes, broken hierarchies, or depth > 3.
8. RLS prevents non-admin users from writing to `page_tab_definitions` or `page_tab_overrides`.
9. The umbrella `/admin/navigation` redirects from old `/admin/nav-config` and `/admin/page-metadata` work without breaking bookmarks.
10. No URL changes anywhere outside `/admin/navigation/*`.

---

## 16. Definition of Done

- All 10 SQL migrations applied and committed to `supabase/migrations/` (no placeholder `SELECT 1;` migrations per memory note).
- `supabase/setup/02_functions.sql` updated with the bodies of all new RPCs.
- All new TS files written + types generated via `mcp__supabase__generate_typescript_types`.
- All unit + integration + E2E tests passing.
- CI gate `check:tab-coverage` passing.
- Manual UAT: admin walks through reorder, rename, hide, add, and reset-to-default flows on `/admin/navigation/page-tabs` against a real institution scope.
- Documentation: README in `app/(routes)/admin/navigation/page-tabs/` explaining the precedence model.
- Memory note added to `MEMORY.md` linking this spec.

---

## 17. References

- Brainstorming session transcript (2026-04-29) — locked decisions §4.
- Agent reports: sidebar architecture, page-tab patterns, page registry, Supabase tables — all 2026-04-29.
- Existing patterns:
  - `supabase/migrations/20260429000002_platform_policies_substrate.sql` — RLS template
  - `supabase/migrations/20260429_admin_nav_overrides_seeds.sql` — SECURITY DEFINER read-helper template
  - `supabase/migrations/20260130140000_create_dashboard_tables.sql` — registry+overrides shape
  - `lib/services/admin/admin-nav-overrides-service.ts` — service shape
  - `app/(routes)/admin/nav-config/page.tsx` — admin UI shape
  - `app/(routes)/admin/page-metadata/page.tsx` — keyword/shortcut admin UI shape
  - `app/(routes)/system/attention-bar/_components/attention-bar-admin-client.tsx` — declarative permission-gated tab pattern
- Related specs:
  - `docs/superpowers/specs/2026-04-24-unified-navigation-design.md` — sidebar/AutoTabNav unification
- Memory notes consulted (`MEMORY.md`):
  - "Dynamic Permission & RLS System"
  - "Browser-side user_roles INSERT needs SECURITY DEFINER RPC"
  - "Placeholder migrations hide column-name typos"
  - "Module-key fragmentation in audit tabs"
