# Dynamic Page-Tabs System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 3-tier dynamic page-tab system where admins rename, reorder, hide, re-parent, and add tabs from `/admin/navigation/page-tabs` without a code deploy, while preserving every existing route and `MENU_PERMISSIONS` entry.

**Architecture:** Two new Supabase tables (`page_tab_definitions` for code-declared baseline, `page_tab_overrides` for admin edits) joined by a SECURITY DEFINER resolver RPC. A `useDynamicTabs` React Query hook merges DB rows into the existing `lib/navigation/tier-rendering.ts:resolveTiers()` so `<AutoTabNav />` reflects edits without touching call sites. Build-time auto-discovery extends `scripts/generate-route-manifest.ts` to seed new pages as ghost rows in `page_tab_definitions`. Admin UI lives under a new `/admin/navigation` umbrella alongside existing `/admin/nav-config` and `/admin/page-metadata`.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript, TanStack Query v5, shadcn/ui, Lucide icons, Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-04-29-dynamic-page-tabs-design.md`
**Flow Diagrams:** `docs/superpowers/specs/2026-04-29-dynamic-page-tabs-flow-diagrams.md`
**User Flows:** `docs/superpowers/specs/2026-04-29-dynamic-page-tabs-user-flows.md`

---

## Worktree Recommendation

This is a multi-day implementation. Run it in an isolated git worktree:
```bash
git worktree add ../MyJKKN-page-tabs -b feat/dynamic-page-tabs main
cd ../MyJKKN-page-tabs
```
All commits below assume the worktree is the working directory.

---

## File Map

### Created — Supabase migrations
| File | Responsibility |
|---|---|
| `supabase/migrations/20260430000001_page_tab_definitions.sql` | Registry table for code-declared tabs |
| `supabase/migrations/20260430000002_page_tab_overrides.sql` | Admin-editable override layer |
| `supabase/migrations/20260430000003_menu_permissions_seed.sql` | DB-side mirror of `MENU_PERMISSIONS` map |
| `supabase/migrations/20260430000004_fn_get_route_permission.sql` | SQL helper to resolve route → perm key |
| `supabase/migrations/20260430000005_fn_get_resolved_page_tabs.sql` | Read RPC (SECURITY DEFINER) |
| `supabase/migrations/20260430000006_fn_upsert_page_tab.sql` | Write RPC for definitions+overrides |
| `supabase/migrations/20260430000007_fn_reorder_page_tabs.sql` | Bulk reorder RPC |
| `supabase/migrations/20260430000008_fn_delete_page_tab_override.sql` | Reset-to-default RPC |
| `supabase/migrations/20260430000009_fn_resync_tab_definitions_from_seed.sql` | Build-time sync RPC |
| `supabase/migrations/20260430000010_fn_resync_menu_permissions.sql` | Build-time perm sync RPC |
| `supabase/migrations/20260430000011_page_tabs_grants.sql` | EXECUTE grants + audit trigger setup |

### Created — TypeScript core
| File | Responsibility |
|---|---|
| `lib/navigation/tab-key.ts` | Canonical `tab_key` derivation (single source of truth) |
| `lib/navigation/dynamic-tabs.ts` | Merge DB tabs with static `nav-config.ts` result |
| `lib/services/admin/page-tabs-service.ts` | TanStack Query service layer |
| `hooks/use-dynamic-tabs.ts` | Read hook for `<AutoTabNav />` |
| `hooks/use-page-tabs-admin.ts` | Mutation hooks for admin UI |

### Created — Build & CI scripts
| File | Responsibility |
|---|---|
| `scripts/sync-tab-definitions.ts` | Post-deploy seed runner |
| `scripts/sync-menu-permissions.ts` | Post-deploy menu-perm seed runner |
| `scripts/check-tab-coverage.ts` | CI gate: orphan/depth/collision detector |

### Created — Admin UI
| File | Responsibility |
|---|---|
| `app/(routes)/admin/navigation/layout.tsx` | Umbrella layout with 3 sub-tabs |
| `app/(routes)/admin/navigation/page.tsx` | Redirect to admin-nav sub-tab |
| `app/(routes)/admin/navigation/admin-nav/page.tsx` | Re-export of existing nav-config UI |
| `app/(routes)/admin/navigation/page-metadata/page.tsx` | Re-export of existing page-metadata UI |
| `app/(routes)/admin/navigation/page-tabs/page.tsx` | Main page-tabs admin UI |
| `app/(routes)/admin/navigation/page-tabs/_components/tabs-tree.tsx` | 3-tier tree view |
| `app/(routes)/admin/navigation/page-tabs/_components/tab-row.tsx` | Single-row controls |
| `app/(routes)/admin/navigation/page-tabs/_components/tab-edit-dialog.tsx` | Edit modal |
| `app/(routes)/admin/navigation/page-tabs/_components/add-tab-dialog.tsx` | Add admin-authored tab modal |
| `app/(routes)/admin/navigation/page-tabs/_components/refresh-from-filesystem-button.tsx` | Manual sync trigger |
| `app/(routes)/admin/navigation/page-tabs/_components/module-scope-selector.tsx` | Module + scope dropdowns |
| `app/(routes)/admin/navigation/page-tabs/_components/reset-defaults-button.tsx` | Per-row reset control |

### Created — Tests
| File | Responsibility |
|---|---|
| `__tests__/navigation/tab-key.spec.ts` | tab_key derivation correctness |
| `__tests__/navigation/dynamic-tabs-merge.spec.ts` | Merge precedence |
| `__tests__/navigation/resolve-tiers-with-db.spec.ts` | Tier rendering integration |
| `__tests__/services/page-tabs-service.spec.ts` | Service layer mocks |
| `e2e/admin-page-tabs.spec.ts` | Playwright smoke flow |

### Modified
| File | What changes |
|---|---|
| `scripts/generate-route-manifest.ts` | Emit `route-tab-seed.generated.json` and `menu-permissions.generated.json` |
| `package.json` | Add `sync:tabs`, `sync:menu-perms`, `check:tab-coverage` scripts; wire into `build` |
| `lib/navigation/tier-rendering.ts` | `resolveTiers()` accepts optional `dynamicTabs` parameter |
| `components/navigation/auto-tab-nav.tsx` | Call `useDynamicTabs`, pass result into `resolveTiers` |
| `lib/navigation/page-registry.ts` | Optional 4th merge source: admin-added route tabs |
| `app/(routes)/admin/nav-config/page.tsx` | Replaced by redirect to `/admin/navigation/admin-nav` |
| `app/(routes)/admin/page-metadata/page.tsx` | Replaced by redirect to `/admin/navigation/page-metadata` |
| `lib/types/database.types.ts` | Regenerated after migrations |
| `lib/navigation/nav-config.ts` | JSDoc explaining DB-override precedence |

### Generated (committed to git, parity with `route-manifest.generated.ts`)
| File | Generated by |
|---|---|
| `lib/navigation/route-tab-seed.generated.json` | `scripts/generate-route-manifest.ts` |
| `lib/navigation/menu-permissions.generated.json` | `scripts/generate-route-manifest.ts` |

---

## Phase 1 — Schema Foundation (Tasks 1–11)

### Task 1: Create `page_tab_definitions` migration

**Files:**
- Create: `supabase/migrations/20260430000001_page_tab_definitions.sql`

- [ ] **Step 1: Write migration body**

```sql
-- 20260430000001_page_tab_definitions.sql
-- Code-declared tab registry. Rows are seeded by build script (source='filesystem'|'nav-config')
-- or admin-authored (source='admin'). Admin overrides live in page_tab_overrides.

CREATE TABLE IF NOT EXISTS public.page_tab_definitions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_key                TEXT NOT NULL UNIQUE,
  module_slug            TEXT NOT NULL,
  parent_tab_key         TEXT REFERENCES public.page_tab_definitions(tab_key) ON DELETE CASCADE,
  kind                   TEXT NOT NULL DEFAULT 'route'
                         CHECK (kind IN ('route','section')),
  href                   TEXT,
  default_label          TEXT NOT NULL,
  default_icon           TEXT,
  default_display_order  INT  NOT NULL DEFAULT 0,
  default_is_default     BOOLEAN NOT NULL DEFAULT false,
  required_permission    TEXT,
  source                 TEXT NOT NULL CHECK (source IN ('filesystem','nav-config','admin')),
  is_active              BOOLEAN NOT NULL DEFAULT true,
  depth                  INT NOT NULL CHECK (depth BETWEEN 1 AND 3),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             UUID REFERENCES public.profiles(id),
  updated_by             UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_ptd_module ON public.page_tab_definitions(module_slug);
CREATE INDEX IF NOT EXISTS idx_ptd_parent ON public.page_tab_definitions(parent_tab_key);
CREATE INDEX IF NOT EXISTS idx_ptd_kind   ON public.page_tab_definitions(kind);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptd_default
  ON public.page_tab_definitions(parent_tab_key)
  WHERE default_is_default = true;

ALTER TABLE public.page_tab_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ptd_select ON public.page_tab_definitions;
CREATE POLICY ptd_select ON public.page_tab_definitions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS ptd_write ON public.page_tab_definitions;
CREATE POLICY ptd_write ON public.page_tab_definitions FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

COMMENT ON TABLE public.page_tab_definitions IS
  'Registry of code-declared tabs. source=filesystem|nav-config rows are upserted by build script; admin rows are user-created.';
```

- [ ] **Step 2: Apply via Supabase MCP**

Run via `mcp__supabase__apply_migration`:
- name: `20260430000001_page_tab_definitions`
- query: contents of the file above

- [ ] **Step 3: Verify table exists**

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='page_tab_definitions'
ORDER BY ordinal_position;
```
Expected: 16 columns matching the DDL.

- [ ] **Step 4: Also commit to setup file**

Per memory note "Placeholder migrations hide column-name typos", append the same DDL to `supabase/setup/01_tables.sql` so fresh setups include this table.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260430000001_page_tab_definitions.sql supabase/setup/01_tables.sql
git commit -m "feat(page-tabs): add page_tab_definitions registry table"
```

---

### Task 2: Create `page_tab_overrides` migration

**Files:**
- Create: `supabase/migrations/20260430000002_page_tab_overrides.sql`

- [ ] **Step 1: Write migration body**

```sql
-- 20260430000002_page_tab_overrides.sql
-- Admin-editable override layer. One row per (tab_key, scope) — admins
-- override label, icon, order, parent, default-flag, hidden, required perm.

CREATE TABLE IF NOT EXISTS public.page_tab_overrides (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_key                       TEXT NOT NULL
                                REFERENCES public.page_tab_definitions(tab_key) ON DELETE CASCADE,
  scope_type                    TEXT NOT NULL CHECK (scope_type IN ('global','institution')),
  scope_id                      UUID,
  label_override                TEXT,
  icon_override                 TEXT,
  display_order_override        INT,
  parent_tab_key_override       TEXT REFERENCES public.page_tab_definitions(tab_key),
  is_default_override           BOOLEAN,
  hidden                        BOOLEAN NOT NULL DEFAULT false,
  required_permission_override  TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                    UUID REFERENCES public.profiles(id),
  updated_by                    UUID REFERENCES public.profiles(id),

  CONSTRAINT chk_pto_scope_id CHECK (
    (scope_type = 'global'      AND scope_id IS NULL) OR
    (scope_type = 'institution' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT uq_pto_key_scope UNIQUE (
    tab_key, scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
);

CREATE INDEX IF NOT EXISTS idx_pto_tab_key ON public.page_tab_overrides(tab_key);
CREATE INDEX IF NOT EXISTS idx_pto_scope   ON public.page_tab_overrides(scope_type, scope_id);

ALTER TABLE public.page_tab_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pto_select ON public.page_tab_overrides;
CREATE POLICY pto_select ON public.page_tab_overrides FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS pto_write ON public.page_tab_overrides;
CREATE POLICY pto_write ON public.page_tab_overrides FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

COMMENT ON TABLE public.page_tab_overrides IS
  'Admin-editable override layer for page_tab_definitions. One row per (tab_key, scope_type, scope_id).';
```

- [ ] **Step 2: Apply via Supabase MCP** as in Task 1.

- [ ] **Step 3: Verify**
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name='page_tab_overrides';
```
Expected: `1`.

- [ ] **Step 4: Append to `supabase/setup/01_tables.sql`.**

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260430000002_page_tab_overrides.sql supabase/setup/01_tables.sql
git commit -m "feat(page-tabs): add page_tab_overrides admin layer"
```

---

### Task 3: Create `menu_permissions_seed` migration

**Files:**
- Create: `supabase/migrations/20260430000003_menu_permissions_seed.sql`

- [ ] **Step 1: Write migration body**

```sql
-- 20260430000003_menu_permissions_seed.sql
-- DB mirror of lib/sidebarMenuLink.ts MENU_PERMISSIONS so SQL can resolve route → perm key.
-- Refreshed by fn_resync_menu_permissions(p_seed jsonb).

CREATE TABLE IF NOT EXISTS public.menu_permissions_seed (
  route_normalized TEXT PRIMARY KEY,
  permission_key   TEXT NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_permissions_seed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mps_select ON public.menu_permissions_seed;
CREATE POLICY mps_select ON public.menu_permissions_seed FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS mps_write ON public.menu_permissions_seed;
CREATE POLICY mps_write ON public.menu_permissions_seed FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMENT ON TABLE public.menu_permissions_seed IS
  'Mirror of lib/sidebarMenuLink.ts MENU_PERMISSIONS, refreshed by fn_resync_menu_permissions on each deploy.';
```

- [ ] **Step 2: Apply, verify, append to setup, commit** (same pattern as Task 1).

---

### Task 4: Create `fn_get_route_permission` helper

**Files:**
- Create: `supabase/migrations/20260430000004_fn_get_route_permission.sql`

- [ ] **Step 1: Write the function**

```sql
-- 20260430000004_fn_get_route_permission.sql
-- Resolves a route href to its required permission key via menu_permissions_seed.
-- Used inside fn_get_resolved_page_tabs to inherit permissions for route-kind tabs.

CREATE OR REPLACE FUNCTION public.fn_get_route_permission(p_href TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_perm TEXT;
BEGIN
  IF p_href IS NULL THEN RETURN NULL; END IF;

  -- Normalize: replace UUID segments with [id], replace numeric ids with [id]
  v_normalized := regexp_replace(
    p_href,
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    '/[id]', 'g'
  );
  v_normalized := regexp_replace(v_normalized, '/\d+', '/[id]', 'g');

  SELECT permission_key INTO v_perm
  FROM public.menu_permissions_seed
  WHERE route_normalized = v_normalized
  LIMIT 1;

  RETURN v_perm;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_route_permission(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_get_route_permission(TEXT) IS
  'Resolves a route href to its required permission key. NULL if no entry in menu_permissions_seed.';
```

- [ ] **Step 2: Apply, verify, commit** as Task 1.

- [ ] **Step 3: Append to `supabase/setup/02_functions.sql`** (memory note compliance).

---

### Task 5: Create `fn_get_resolved_page_tabs` resolver RPC

**Files:**
- Create: `supabase/migrations/20260430000005_fn_get_resolved_page_tabs.sql`

- [ ] **Step 1: Write the resolver**

```sql
-- 20260430000005_fn_get_resolved_page_tabs.sql
-- Read RPC: returns merged 3-tier tab tree for one module, applying
-- institution > global > defaults priority and user_has_permission filter.

CREATE OR REPLACE FUNCTION public.fn_get_resolved_page_tabs(
  p_module_slug    TEXT,
  p_institution_id UUID DEFAULT NULL
)
RETURNS TABLE (
  tab_key             TEXT,
  parent_tab_key      TEXT,
  kind                TEXT,
  href                TEXT,
  label               TEXT,
  icon                TEXT,
  display_order       INT,
  is_default          BOOLEAN,
  hidden              BOOLEAN,
  depth               INT,
  required_permission TEXT,
  override_source     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH resolved AS (
    SELECT
      d.tab_key,
      COALESCE(po_inst.parent_tab_key_override, po_glob.parent_tab_key_override, d.parent_tab_key) AS parent_tab_key,
      d.kind,
      d.href,
      COALESCE(po_inst.label_override, po_glob.label_override, d.default_label) AS label,
      COALESCE(po_inst.icon_override, po_glob.icon_override, d.default_icon)    AS icon,
      COALESCE(po_inst.display_order_override, po_glob.display_order_override, d.default_display_order) AS display_order,
      COALESCE(po_inst.is_default_override, po_glob.is_default_override, d.default_is_default) AS is_default,
      COALESCE(po_inst.hidden, po_glob.hidden, false) AS hidden,
      d.depth,
      -- Effective required_permission:
      --   1) override (institution > global) if set
      --   2) explicit definitions.required_permission if set
      --   3) inherit via fn_get_route_permission(href) for kind='route'
      --   4) NULL otherwise
      COALESCE(
        po_inst.required_permission_override,
        po_glob.required_permission_override,
        d.required_permission,
        CASE WHEN d.kind = 'route' THEN public.fn_get_route_permission(d.href) ELSE NULL END
      ) AS required_permission,
      CASE
        WHEN po_inst.id IS NOT NULL THEN 'institution'
        WHEN po_glob.id IS NOT NULL THEN 'global'
        ELSE NULL
      END AS override_source
    FROM public.page_tab_definitions d
    LEFT JOIN public.page_tab_overrides po_glob
      ON po_glob.tab_key = d.tab_key AND po_glob.scope_type = 'global'
    LEFT JOIN public.page_tab_overrides po_inst
      ON po_inst.tab_key = d.tab_key
     AND po_inst.scope_type = 'institution'
     AND po_inst.scope_id = p_institution_id
    WHERE d.module_slug = p_module_slug
      AND d.is_active = true
  )
  SELECT
    r.tab_key, r.parent_tab_key, r.kind, r.href, r.label, r.icon,
    r.display_order, r.is_default, r.hidden, r.depth,
    r.required_permission, r.override_source
  FROM resolved r
  WHERE NOT r.hidden
    AND (
      is_super_admin()
      OR (r.required_permission IS NOT NULL AND user_has_permission(r.required_permission))
    )
  ORDER BY r.depth, r.display_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_resolved_page_tabs(TEXT, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_get_resolved_page_tabs(TEXT, UUID) IS
  'Returns merged 3-tier tab tree for a module, applying institution>global>defaults and user permission filter.';
```

- [ ] **Step 2: Apply via MCP, verify, commit, append to setup file.**

- [ ] **Step 3: Smoke-test the function**

```sql
-- Should return zero rows (no seed yet) without errors
SELECT * FROM public.fn_get_resolved_page_tabs('admission', NULL);
```
Expected: `(0 rows)`, no error.

---

### Task 6: Create `fn_upsert_page_tab` write RPC

**Files:**
- Create: `supabase/migrations/20260430000006_fn_upsert_page_tab.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- 20260430000006_fn_upsert_page_tab.sql
-- Write RPC for both definitions (admin-authored) and overrides (any source).
-- Mode: 'definition' creates source='admin' rows; 'override' writes page_tab_overrides.

CREATE OR REPLACE FUNCTION public.fn_upsert_page_tab(
  p_mode               TEXT,            -- 'definition' | 'override'
  p_tab_key            TEXT,
  p_module_slug        TEXT DEFAULT NULL,
  p_parent_tab_key     TEXT DEFAULT NULL,
  p_kind               TEXT DEFAULT 'route',
  p_href               TEXT DEFAULT NULL,
  p_label              TEXT DEFAULT NULL,
  p_icon               TEXT DEFAULT NULL,
  p_display_order      INT  DEFAULT NULL,
  p_is_default         BOOLEAN DEFAULT NULL,
  p_required_permission TEXT DEFAULT NULL,
  p_scope_type         TEXT DEFAULT NULL,
  p_scope_id           UUID DEFAULT NULL,
  p_hidden             BOOLEAN DEFAULT NULL,
  p_depth              INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_parent_depth INT;
  v_row JSONB;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'unauthorized: requires super_admin or admin' USING ERRCODE = '42501';
  END IF;

  -- Validate parent_tab_key exists and depth fits
  IF p_parent_tab_key IS NOT NULL THEN
    SELECT depth INTO v_parent_depth
    FROM public.page_tab_definitions WHERE tab_key = p_parent_tab_key;
    IF v_parent_depth IS NULL THEN
      RAISE EXCEPTION 'parent_tab_key % does not exist', p_parent_tab_key;
    END IF;
    IF (p_depth IS NULL AND v_parent_depth + 1 > 3) OR (p_depth IS NOT NULL AND p_depth > 3) THEN
      RAISE EXCEPTION 'depth would exceed 3 (parent depth=%)', v_parent_depth;
    END IF;
  END IF;

  IF p_mode = 'definition' THEN
    -- Validate href exists in route manifest (admin-added route tabs only)
    IF p_kind = 'route' AND p_href IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.menu_permissions_seed WHERE route_normalized = p_href) THEN
        RAISE EXCEPTION 'href % is not a known route. Add the page first.', p_href;
      END IF;
    END IF;

    INSERT INTO public.page_tab_definitions (
      tab_key, module_slug, parent_tab_key, kind, href,
      default_label, default_icon, default_display_order, default_is_default,
      required_permission, source, depth,
      created_by, updated_by
    )
    VALUES (
      p_tab_key, p_module_slug, p_parent_tab_key, p_kind, p_href,
      p_label, p_icon, COALESCE(p_display_order, 0), COALESCE(p_is_default, false),
      p_required_permission, 'admin', COALESCE(p_depth, COALESCE(v_parent_depth, 0) + 1),
      v_uid, v_uid
    )
    ON CONFLICT (tab_key) DO UPDATE SET
      default_label          = EXCLUDED.default_label,
      default_icon           = EXCLUDED.default_icon,
      default_display_order  = EXCLUDED.default_display_order,
      default_is_default     = EXCLUDED.default_is_default,
      required_permission    = EXCLUDED.required_permission,
      parent_tab_key         = EXCLUDED.parent_tab_key,
      updated_by             = v_uid,
      updated_at             = now()
    RETURNING to_jsonb(page_tab_definitions.*) INTO v_row;

  ELSIF p_mode = 'override' THEN
    INSERT INTO public.page_tab_overrides (
      tab_key, scope_type, scope_id,
      label_override, icon_override, display_order_override,
      parent_tab_key_override, is_default_override, hidden,
      required_permission_override,
      created_by, updated_by
    )
    VALUES (
      p_tab_key, p_scope_type, p_scope_id,
      p_label, p_icon, p_display_order,
      p_parent_tab_key, p_is_default, COALESCE(p_hidden, false),
      p_required_permission,
      v_uid, v_uid
    )
    ON CONFLICT (tab_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE SET
      label_override               = COALESCE(EXCLUDED.label_override, page_tab_overrides.label_override),
      icon_override                = COALESCE(EXCLUDED.icon_override, page_tab_overrides.icon_override),
      display_order_override       = COALESCE(EXCLUDED.display_order_override, page_tab_overrides.display_order_override),
      parent_tab_key_override      = COALESCE(EXCLUDED.parent_tab_key_override, page_tab_overrides.parent_tab_key_override),
      is_default_override          = COALESCE(EXCLUDED.is_default_override, page_tab_overrides.is_default_override),
      hidden                       = EXCLUDED.hidden,
      required_permission_override = COALESCE(EXCLUDED.required_permission_override, page_tab_overrides.required_permission_override),
      updated_by                   = v_uid,
      updated_at                   = now()
    RETURNING to_jsonb(page_tab_overrides.*) INTO v_row;
  ELSE
    RAISE EXCEPTION 'invalid mode: %, expected definition|override', p_mode;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_upsert_page_tab(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN, TEXT, TEXT, UUID, BOOLEAN, INT
) TO authenticated, service_role;
```

- [ ] **Step 2: Apply, verify, commit, append to setup file.**

---

### Task 7: Create `fn_reorder_page_tabs` RPC

**Files:**
- Create: `supabase/migrations/20260430000007_fn_reorder_page_tabs.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- 20260430000007_fn_reorder_page_tabs.sql

CREATE OR REPLACE FUNCTION public.fn_reorder_page_tabs(
  p_parent_tab_key   TEXT,
  p_ordered_tab_keys TEXT[],
  p_scope_type       TEXT DEFAULT 'global',
  p_scope_id         UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_idx INT := 0;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  FOREACH v_key IN ARRAY p_ordered_tab_keys LOOP
    -- Verify each key is a child of p_parent_tab_key (or top-level if NULL)
    IF NOT EXISTS (
      SELECT 1 FROM public.page_tab_definitions
      WHERE tab_key = v_key
        AND parent_tab_key IS NOT DISTINCT FROM p_parent_tab_key
    ) THEN
      RAISE EXCEPTION 'tab_key % is not a child of %', v_key, p_parent_tab_key;
    END IF;

    INSERT INTO public.page_tab_overrides (
      tab_key, scope_type, scope_id, display_order_override,
      created_by, updated_by
    )
    VALUES (v_key, p_scope_type, p_scope_id, v_idx, v_uid, v_uid)
    ON CONFLICT (tab_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE SET
      display_order_override = v_idx,
      updated_by             = v_uid,
      updated_at             = now();

    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object('reordered', v_idx);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_reorder_page_tabs(TEXT, TEXT[], TEXT, UUID)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply, verify, commit, append to setup file.**

---

### Task 8: Create `fn_delete_page_tab_override` RPC

**Files:**
- Create: `supabase/migrations/20260430000008_fn_delete_page_tab_override.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- 20260430000008_fn_delete_page_tab_override.sql

CREATE OR REPLACE FUNCTION public.fn_delete_page_tab_override(
  p_tab_key    TEXT,
  p_scope_type TEXT DEFAULT 'global',
  p_scope_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.page_tab_overrides
  WHERE tab_key = p_tab_key
    AND scope_type = p_scope_type
    AND scope_id IS NOT DISTINCT FROM p_scope_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_delete_page_tab_override(TEXT, TEXT, UUID)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply, verify, commit, append to setup file.**

---

### Task 9: Create `fn_resync_tab_definitions_from_seed` RPC

**Files:**
- Create: `supabase/migrations/20260430000009_fn_resync_tab_definitions_from_seed.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- 20260430000009_fn_resync_tab_definitions_from_seed.sql
-- Bulk-upsert page_tab_definitions from a build-time seed JSON.
-- Never deletes source='admin' rows. Marks missing source IN ('filesystem','nav-config')
-- rows as is_active=false (soft delete) so the admin UI can flag stale entries.

CREATE OR REPLACE FUNCTION public.fn_resync_tab_definitions_from_seed(
  p_seed JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_seen_keys TEXT[] := ARRAY[]::TEXT[];
  v_record JSONB;
  v_inserted INT := 0;
  v_updated INT := 0;
  v_deactivated INT := 0;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'unauthorized: super_admin only' USING ERRCODE = '42501';
  END IF;

  -- Upsert each row from the seed
  FOR v_record IN SELECT * FROM jsonb_array_elements(p_seed) LOOP
    v_seen_keys := array_append(v_seen_keys, v_record->>'tab_key');

    INSERT INTO public.page_tab_definitions (
      tab_key, module_slug, parent_tab_key, kind, href,
      default_label, default_icon, default_display_order, default_is_default,
      required_permission, source, is_active, depth,
      created_by, updated_by
    )
    VALUES (
      v_record->>'tab_key',
      v_record->>'module_slug',
      v_record->>'parent_tab_key',
      COALESCE(v_record->>'kind', 'route'),
      v_record->>'href',
      v_record->>'default_label',
      v_record->>'default_icon',
      COALESCE((v_record->>'default_display_order')::INT, 0),
      COALESCE((v_record->>'default_is_default')::BOOLEAN, false),
      v_record->>'required_permission',
      v_record->>'source',
      true,
      (v_record->>'depth')::INT,
      v_uid, v_uid
    )
    ON CONFLICT (tab_key) DO UPDATE SET
      module_slug             = EXCLUDED.module_slug,
      parent_tab_key          = EXCLUDED.parent_tab_key,
      kind                    = EXCLUDED.kind,
      href                    = EXCLUDED.href,
      default_label           = EXCLUDED.default_label,
      default_icon            = EXCLUDED.default_icon,
      default_display_order   = EXCLUDED.default_display_order,
      default_is_default      = EXCLUDED.default_is_default,
      required_permission     = COALESCE(EXCLUDED.required_permission, page_tab_definitions.required_permission),
      source                  = EXCLUDED.source,
      is_active               = true,
      depth                   = EXCLUDED.depth,
      updated_by              = v_uid,
      updated_at              = now()
    WHERE page_tab_definitions.source IN ('filesystem','nav-config');
    -- ^ critical: never overwrite source='admin' rows
  END LOOP;

  -- Soft-delete missing filesystem/nav-config rows (page deleted from codebase)
  UPDATE public.page_tab_definitions
  SET is_active = false, updated_at = now(), updated_by = v_uid
  WHERE source IN ('filesystem', 'nav-config')
    AND tab_key <> ALL(v_seen_keys)
    AND is_active = true;
  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  RETURN jsonb_build_object(
    'seen', array_length(v_seen_keys, 1),
    'deactivated', v_deactivated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resync_tab_definitions_from_seed(JSONB)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply, verify, commit, append to setup file.**

---

### Task 10: Create `fn_resync_menu_permissions` RPC

**Files:**
- Create: `supabase/migrations/20260430000010_fn_resync_menu_permissions.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- 20260430000010_fn_resync_menu_permissions.sql

CREATE OR REPLACE FUNCTION public.fn_resync_menu_permissions(p_seed JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record JSONB;
  v_count INT := 0;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'unauthorized: super_admin only' USING ERRCODE = '42501';
  END IF;

  -- Truncate-and-replace; menu permissions don't need historical retention
  TRUNCATE public.menu_permissions_seed;

  FOR v_record IN SELECT * FROM jsonb_array_elements(p_seed) LOOP
    INSERT INTO public.menu_permissions_seed (route_normalized, permission_key)
    VALUES (v_record->>'route', v_record->>'permission');
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('synced', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resync_menu_permissions(JSONB)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply, verify, commit, append to setup file.**

---

### Task 11: Generate fresh TypeScript types

**Files:**
- Modify: `lib/types/database.types.ts`

- [ ] **Step 1: Generate types via Supabase MCP**

Use `mcp__supabase__generate_typescript_types`. Replace the contents of `lib/types/database.types.ts` with the result.

- [ ] **Step 2: Verify new types are present**

```bash
grep -c "page_tab_definitions\|page_tab_overrides\|menu_permissions_seed\|fn_get_resolved_page_tabs" lib/types/database.types.ts
```
Expected: ≥ 4.

- [ ] **Step 3: Verify type compiles**
```bash
npx tsc --noEmit lib/types/database.types.ts
```
Expected: no output (success).

- [ ] **Step 4: Commit**
```bash
git add lib/types/database.types.ts
git commit -m "feat(page-tabs): regenerate database.types.ts after migrations"
```

---

## Phase 2 — Core TypeScript Utilities (Tasks 12–14)

### Task 12: Implement `lib/navigation/tab-key.ts`

**Files:**
- Create: `lib/navigation/tab-key.ts`
- Test: `__tests__/navigation/tab-key.spec.ts`

- [ ] **Step 1: Write the failing test first**

```ts
// __tests__/navigation/tab-key.spec.ts
import { describe, it, expect } from 'vitest';
import { tabKeyFromHref, tabKeyFromSection, parseTabKey, normalizePath } from '@/lib/navigation/tab-key';

describe('tab-key', () => {
  it('derives tab_key from href', () => {
    expect(tabKeyFromHref('/admission/leads/kanban')).toBe('admission.leads.kanban');
  });

  it('strips dynamic UUID segments', () => {
    expect(tabKeyFromHref('/admission/leads/550e8400-e29b-41d4-a716-446655440000/detail'))
      .toBe('admission.leads.[id].detail');
  });

  it('strips numeric ids', () => {
    expect(tabKeyFromHref('/admission/leads/123/detail'))
      .toBe('admission.leads.[id].detail');
  });

  it('returns module-only key for module-root href', () => {
    expect(tabKeyFromHref('/admission')).toBe('admission');
  });

  it('throws on empty or root href', () => {
    expect(() => tabKeyFromHref('/')).toThrow();
    expect(() => tabKeyFromHref('')).toThrow();
  });

  it('builds section keys', () => {
    expect(tabKeyFromSection('/users/permissions-audit', 'ask'))
      .toBe('users.permissions-audit.ask');
  });

  it('parseTabKey round-trips', () => {
    const key = 'admission.leads.kanban';
    const parsed = parseTabKey(key);
    expect(parsed.moduleSlug).toBe('admission');
    expect(parsed.segments).toEqual(['leads', 'kanban']);
    expect(parsed.depth).toBe(3);
  });

  it('normalizePath strips group folders', () => {
    expect(normalizePath('/(routes)/admission/leads')).toBe('/admission/leads');
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**
```bash
npx vitest run __tests__/navigation/tab-key.spec.ts
```
Expected: FAIL with `Cannot find module @/lib/navigation/tab-key`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/navigation/tab-key.ts
const UUID_RE = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;
const NUMERIC_RE = /\/\d+(?=\/|$)/g;
const GROUP_RE = /\/\([^)]+\)/g;

export interface ParsedTabKey {
  moduleSlug: string;
  segments: string[];
  depth: number;
}

export function normalizePath(path: string): string {
  return path
    .replace(GROUP_RE, '')
    .replace(UUID_RE, '/[id]')
    .replace(NUMERIC_RE, '/[id]');
}

export function tabKeyFromHref(href: string): string {
  if (!href || href === '/') {
    throw new Error('tabKeyFromHref: href cannot be empty or "/"');
  }
  const normalized = normalizePath(href);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`tabKeyFromHref: no segments in ${href}`);
  }
  return segments.join('.');
}

export function tabKeyFromSection(pageHref: string, sectionId: string): string {
  return `${tabKeyFromHref(pageHref)}.${sectionId}`;
}

export function parseTabKey(tabKey: string): ParsedTabKey {
  const parts = tabKey.split('.');
  if (parts.length === 0) {
    throw new Error(`parseTabKey: empty key`);
  }
  return {
    moduleSlug: parts[0],
    segments: parts.slice(1),
    depth: parts.length,
  };
}

export function deriveModuleSlugFromPath(pathname: string): string {
  const segments = normalizePath(pathname).split('/').filter(Boolean);
  return segments[0] ?? '';
}
```

- [ ] **Step 4: Run the test — expect PASS**
```bash
npx vitest run __tests__/navigation/tab-key.spec.ts
```
Expected: 7 passing.

- [ ] **Step 5: Commit**
```bash
git add lib/navigation/tab-key.ts __tests__/navigation/tab-key.spec.ts
git commit -m "feat(page-tabs): add tab-key derivation utilities"
```

---

### Task 13: Implement `lib/navigation/dynamic-tabs.ts` merge layer

**Files:**
- Create: `lib/navigation/dynamic-tabs.ts`
- Test: `__tests__/navigation/dynamic-tabs-merge.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/navigation/dynamic-tabs-merge.spec.ts
import { describe, it, expect } from 'vitest';
import { mergeDynamicTabs, type StaticTab, type ResolvedTab } from '@/lib/navigation/dynamic-tabs';

const staticTabs: StaticTab[] = [
  { tab_key: 'admission.leads', label: 'Leads', href: '/admission/leads', icon: 'Users', display_order: 0, depth: 1, parent_tab_key: null, is_default: true },
  { tab_key: 'admission.leads.kanban', label: 'Kanban', href: '/admission/leads/kanban', icon: 'Columns3', display_order: 0, depth: 2, parent_tab_key: 'admission.leads', is_default: true },
  { tab_key: 'admission.leads.list', label: 'List', href: '/admission/leads/list', icon: 'List', display_order: 1, depth: 2, parent_tab_key: 'admission.leads', is_default: false },
];

describe('mergeDynamicTabs', () => {
  it('returns static tabs when DB result is empty', () => {
    expect(mergeDynamicTabs(staticTabs, [])).toEqual(staticTabs);
  });

  it('DB row overrides label per tab_key', () => {
    const db: ResolvedTab[] = [
      { tab_key: 'admission.leads.kanban', label: 'Board', href: '/admission/leads/kanban', icon: 'Columns3', display_order: 0, depth: 2, parent_tab_key: 'admission.leads', is_default: true, hidden: false, kind: 'route', required_permission: null, override_source: 'global' },
    ];
    const merged = mergeDynamicTabs(staticTabs, db);
    expect(merged.find(t => t.tab_key === 'admission.leads.kanban')?.label).toBe('Board');
    expect(merged.find(t => t.tab_key === 'admission.leads.list')?.label).toBe('List');
  });

  it('hidden=true drops the tab from result', () => {
    const db: ResolvedTab[] = [
      { tab_key: 'admission.leads.list', label: 'List', href: '/admission/leads/list', icon: 'List', display_order: 1, depth: 2, parent_tab_key: 'admission.leads', is_default: false, hidden: true, kind: 'route', required_permission: null, override_source: 'global' },
    ];
    const merged = mergeDynamicTabs(staticTabs, db);
    expect(merged.find(t => t.tab_key === 'admission.leads.list')).toBeUndefined();
  });

  it('admin-added tab not in static set is appended', () => {
    const db: ResolvedTab[] = [
      { tab_key: 'admission.leads.pipeline', label: 'Pipeline', href: '/admission/leads/pipeline', icon: 'Filter', display_order: 5, depth: 2, parent_tab_key: 'admission.leads', is_default: false, hidden: false, kind: 'route', required_permission: null, override_source: null },
    ];
    const merged = mergeDynamicTabs(staticTabs, db);
    expect(merged.find(t => t.tab_key === 'admission.leads.pipeline')?.label).toBe('Pipeline');
  });

  it('preserves order: static order, then admin-added by display_order', () => {
    const db: ResolvedTab[] = [
      { tab_key: 'admission.leads.kanban', label: 'Kanban', href: '/admission/leads/kanban', icon: 'Columns3', display_order: 10, depth: 2, parent_tab_key: 'admission.leads', is_default: true, hidden: false, kind: 'route', required_permission: null, override_source: 'global' },
    ];
    const merged = mergeDynamicTabs(staticTabs, db);
    const tier2 = merged.filter(t => t.depth === 2).sort((a, b) => a.display_order - b.display_order);
    expect(tier2.map(t => t.tab_key)).toEqual(['admission.leads.list', 'admission.leads.kanban']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Write implementation**

```ts
// lib/navigation/dynamic-tabs.ts

export interface StaticTab {
  tab_key: string;
  label: string;
  href: string | null;
  icon: string | null;
  display_order: number;
  depth: number;
  parent_tab_key: string | null;
  is_default: boolean;
}

export interface ResolvedTab extends StaticTab {
  hidden: boolean;
  kind: 'route' | 'section';
  required_permission: string | null;
  override_source: 'institution' | 'global' | null;
}

/**
 * Merge static tabs (from nav-config.ts / route-manifest) with DB-resolved tabs.
 * Per tab_key:
 *   - DB row hidden=true → drop tab.
 *   - DB row exists, hidden=false → DB wins (label, icon, order, parent, is_default).
 *   - DB row absent → static row passes through unchanged.
 * Admin-added DB rows whose tab_key isn't in static are appended.
 */
export function mergeDynamicTabs(
  staticTabs: StaticTab[],
  dbTabs: ResolvedTab[]
): StaticTab[] {
  const dbByKey = new Map(dbTabs.map(t => [t.tab_key, t]));
  const staticKeys = new Set(staticTabs.map(t => t.tab_key));

  const merged: StaticTab[] = [];

  for (const s of staticTabs) {
    const db = dbByKey.get(s.tab_key);
    if (db?.hidden) continue;
    if (db) {
      merged.push({
        tab_key: db.tab_key,
        label: db.label,
        href: db.href,
        icon: db.icon,
        display_order: db.display_order,
        depth: db.depth,
        parent_tab_key: db.parent_tab_key,
        is_default: db.is_default,
      });
    } else {
      merged.push(s);
    }
  }

  // Append admin-added tabs (DB rows not in static)
  for (const db of dbTabs) {
    if (db.hidden) continue;
    if (staticKeys.has(db.tab_key)) continue;
    merged.push({
      tab_key: db.tab_key,
      label: db.label,
      href: db.href,
      icon: db.icon,
      display_order: db.display_order,
      depth: db.depth,
      parent_tab_key: db.parent_tab_key,
      is_default: db.is_default,
    });
  }

  return merged;
}
```

- [ ] **Step 4: Run — expect PASS (5 tests).**

- [ ] **Step 5: Commit**
```bash
git add lib/navigation/dynamic-tabs.ts __tests__/navigation/dynamic-tabs-merge.spec.ts
git commit -m "feat(page-tabs): add dynamic-tabs merge layer"
```

---

### Task 14: Implement `lib/services/admin/page-tabs-service.ts`

**Files:**
- Create: `lib/services/admin/page-tabs-service.ts`

- [ ] **Step 1: Write the service**

```ts
// lib/services/admin/page-tabs-service.ts
import { createClientSupabaseClient } from '@/lib/supabase-client';
import type { Database } from '@/lib/types/database.types';
import type { ResolvedTab } from '@/lib/navigation/dynamic-tabs';

type Definition = Database['public']['Tables']['page_tab_definitions']['Row'];
type Override = Database['public']['Tables']['page_tab_overrides']['Row'];

export interface UpsertOverrideInput {
  tab_key: string;
  scope_type: 'global' | 'institution';
  scope_id: string | null;
  label?: string;
  icon?: string;
  display_order?: number;
  parent_tab_key?: string;
  is_default?: boolean;
  hidden?: boolean;
  required_permission?: string;
}

export interface UpsertDefinitionInput {
  tab_key: string;
  module_slug: string;
  parent_tab_key: string | null;
  kind: 'route' | 'section';
  href: string | null;
  label: string;
  icon: string | null;
  display_order: number;
  is_default: boolean;
  required_permission: string | null;
  depth: number;
}

export const pageTabsService = {
  async getResolved(moduleSlug: string, institutionId: string | null): Promise<ResolvedTab[]> {
    const sb = createClientSupabaseClient();
    const { data, error } = await sb.rpc('fn_get_resolved_page_tabs', {
      p_module_slug: moduleSlug,
      p_institution_id: institutionId,
    });
    if (error) throw error;
    return (data ?? []) as ResolvedTab[];
  },

  async listDefinitions(moduleSlug: string): Promise<Definition[]> {
    const sb = createClientSupabaseClient();
    const { data, error } = await sb
      .from('page_tab_definitions')
      .select('*')
      .eq('module_slug', moduleSlug)
      .order('depth')
      .order('default_display_order');
    if (error) throw error;
    return data ?? [];
  },

  async listOverrides(moduleSlug: string, scopeType: 'global' | 'institution', scopeId: string | null): Promise<Override[]> {
    const sb = createClientSupabaseClient();
    const defs = await this.listDefinitions(moduleSlug);
    const tabKeys = defs.map(d => d.tab_key);
    if (tabKeys.length === 0) return [];

    let q = sb.from('page_tab_overrides').select('*').in('tab_key', tabKeys).eq('scope_type', scopeType);
    q = scopeId === null ? q.is('scope_id', null) : q.eq('scope_id', scopeId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },

  async upsertOverride(input: UpsertOverrideInput) {
    const sb = createClientSupabaseClient();
    const { data, error } = await sb.rpc('fn_upsert_page_tab', {
      p_mode: 'override',
      p_tab_key: input.tab_key,
      p_scope_type: input.scope_type,
      p_scope_id: input.scope_id,
      p_label: input.label ?? null,
      p_icon: input.icon ?? null,
      p_display_order: input.display_order ?? null,
      p_parent_tab_key: input.parent_tab_key ?? null,
      p_is_default: input.is_default ?? null,
      p_hidden: input.hidden ?? null,
      p_required_permission: input.required_permission ?? null,
    });
    if (error) throw error;
    return data;
  },

  async upsertDefinition(input: UpsertDefinitionInput) {
    const sb = createClientSupabaseClient();
    const { data, error } = await sb.rpc('fn_upsert_page_tab', {
      p_mode: 'definition',
      p_tab_key: input.tab_key,
      p_module_slug: input.module_slug,
      p_parent_tab_key: input.parent_tab_key,
      p_kind: input.kind,
      p_href: input.href,
      p_label: input.label,
      p_icon: input.icon,
      p_display_order: input.display_order,
      p_is_default: input.is_default,
      p_required_permission: input.required_permission,
      p_depth: input.depth,
    });
    if (error) throw error;
    return data;
  },

  async deleteOverride(tabKey: string, scopeType: 'global' | 'institution', scopeId: string | null) {
    const sb = createClientSupabaseClient();
    const { data, error } = await sb.rpc('fn_delete_page_tab_override', {
      p_tab_key: tabKey, p_scope_type: scopeType, p_scope_id: scopeId,
    });
    if (error) throw error;
    return data;
  },

  async reorder(parentTabKey: string | null, orderedTabKeys: string[], scopeType: 'global' | 'institution', scopeId: string | null) {
    const sb = createClientSupabaseClient();
    const { data, error } = await sb.rpc('fn_reorder_page_tabs', {
      p_parent_tab_key: parentTabKey,
      p_ordered_tab_keys: orderedTabKeys,
      p_scope_type: scopeType,
      p_scope_id: scopeId,
    });
    if (error) throw error;
    return data;
  },

  async resyncFromSeed(seed: unknown[]) {
    const sb = createClientSupabaseClient();
    const { data, error } = await sb.rpc('fn_resync_tab_definitions_from_seed', { p_seed: seed });
    if (error) throw error;
    return data;
  },
};
```

- [ ] **Step 2: Verify it compiles**
```bash
npx tsc --noEmit lib/services/admin/page-tabs-service.ts
```
Expected: no output.

- [ ] **Step 3: Commit**
```bash
git add lib/services/admin/page-tabs-service.ts
git commit -m "feat(page-tabs): add page-tabs service layer"
```

---

## Phase 3 — Hooks (Tasks 15–16)

### Task 15: `hooks/use-dynamic-tabs.ts`

**Files:**
- Create: `hooks/use-dynamic-tabs.ts`

- [ ] **Step 1: Implement**

```ts
// hooks/use-dynamic-tabs.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { pageTabsService } from '@/lib/services/admin/page-tabs-service';

export function useDynamicTabs(moduleSlug: string | null, institutionId: string | null = null) {
  return useQuery({
    queryKey: ['page-tabs', 'resolved', moduleSlug, institutionId ?? 'global'] as const,
    queryFn: () => pageTabsService.getResolved(moduleSlug!, institutionId),
    enabled: !!moduleSlug,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
```

- [ ] **Step 2: Verify compile**
```bash
npx tsc --noEmit hooks/use-dynamic-tabs.ts
```

- [ ] **Step 3: Commit**
```bash
git add hooks/use-dynamic-tabs.ts
git commit -m "feat(page-tabs): add useDynamicTabs hook"
```

---

### Task 16: `hooks/use-page-tabs-admin.ts`

**Files:**
- Create: `hooks/use-page-tabs-admin.ts`

- [ ] **Step 1: Implement**

```ts
// hooks/use-page-tabs-admin.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pageTabsService, type UpsertOverrideInput, type UpsertDefinitionInput } from '@/lib/services/admin/page-tabs-service';
import { toast } from 'sonner';

export function usePageTabDefinitions(moduleSlug: string) {
  return useQuery({
    queryKey: ['page-tabs', 'definitions', moduleSlug],
    queryFn: () => pageTabsService.listDefinitions(moduleSlug),
    enabled: !!moduleSlug,
    staleTime: 30_000,
  });
}

export function usePageTabOverrides(moduleSlug: string, scopeType: 'global' | 'institution', scopeId: string | null) {
  return useQuery({
    queryKey: ['page-tabs', 'overrides', moduleSlug, scopeType, scopeId ?? 'null'],
    queryFn: () => pageTabsService.listOverrides(moduleSlug, scopeType, scopeId),
    enabled: !!moduleSlug,
    staleTime: 30_000,
  });
}

export function useUpsertPageTabOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertOverrideInput) => pageTabsService.upsertOverride(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['page-tabs'] });
      toast.success('Tab updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpsertPageTabDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertDefinitionInput) => pageTabsService.upsertDefinition(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['page-tabs'] });
      toast.success('Tab created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePageTabOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabKey: string; scopeType: 'global' | 'institution'; scopeId: string | null }) =>
      pageTabsService.deleteOverride(input.tabKey, input.scopeType, input.scopeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['page-tabs'] });
      toast.success('Reset to default');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReorderPageTabs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentKey: string | null; orderedKeys: string[]; scopeType: 'global' | 'institution'; scopeId: string | null }) =>
      pageTabsService.reorder(input.parentKey, input.orderedKeys, input.scopeType, input.scopeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-tabs'] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useResyncTabsFromSeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seed: unknown[]) => pageTabsService.resyncFromSeed(seed),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['page-tabs'] });
      toast.success(`Synced ${data?.seen ?? 0} tabs`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
```

- [ ] **Step 2: Verify compile + commit.**
```bash
git add hooks/use-page-tabs-admin.ts
git commit -m "feat(page-tabs): add admin mutation hooks"
```

---

## Phase 4 — Build-Time Discovery (Tasks 17–21)

### Task 17: Extend `scripts/generate-route-manifest.ts` to emit tab seed

**Files:**
- Modify: `scripts/generate-route-manifest.ts`

- [ ] **Step 1: Read existing file** to understand the `RouteNode` shape and walking logic. Then locate the end of `generate()` function.

- [ ] **Step 2: Add tab-seed emission**

Append after existing manifest write:

```ts
// scripts/generate-route-manifest.ts (additions)
import { tabKeyFromHref, deriveModuleSlugFromPath } from '../lib/navigation/tab-key';

interface TabSeedRow {
  tab_key: string;
  module_slug: string;
  parent_tab_key: string | null;
  kind: 'route';
  href: string;
  default_label: string;
  default_icon: string | null;
  default_display_order: number;
  default_is_default: boolean;
  required_permission: string | null;
  source: 'filesystem' | 'nav-config';
  depth: number;
}

function flattenManifestToTabSeed(roots: RouteNode[]): TabSeedRow[] {
  const rows: TabSeedRow[] = [];
  function walk(node: RouteNode, parentKey: string | null) {
    const href = node.path;
    if (!href || href === '/') {
      for (const child of node.children) walk(child, null);
      return;
    }
    let tab_key: string;
    try { tab_key = tabKeyFromHref(href); } catch { return; }
    const moduleSlug = deriveModuleSlugFromPath(href);
    const depth = tab_key.split('.').length;
    if (depth > 3) return; // 3-tier hard limit

    rows.push({
      tab_key, module_slug: moduleSlug,
      parent_tab_key: parentKey,
      kind: 'route', href,
      default_label: node.label,
      default_icon: node.iconName || null,
      default_display_order: rows.filter(r => r.parent_tab_key === parentKey).length,
      default_is_default: false,
      required_permission: null,
      source: 'filesystem',
      depth,
    });
    for (const child of node.children) walk(child, tab_key);
  }
  for (const root of roots) walk(root, null);
  return rows;
}

// MENU_PERMISSIONS seed
import { MENU_PERMISSIONS } from '../lib/sidebarMenuLink';
function buildMenuPermSeed() {
  return Object.entries(MENU_PERMISSIONS).map(([route, permission]) => ({ route, permission }));
}

// At end of generate(), before exit:
const tabSeed = flattenManifestToTabSeed(/* manifest tree variable */);
fs.writeFileSync(
  path.join(process.cwd(), 'lib/navigation/route-tab-seed.generated.json'),
  JSON.stringify(tabSeed, null, 2) + '\n'
);
console.log(`✓ wrote route-tab-seed.generated.json (${tabSeed.length} rows)`);

const permSeed = buildMenuPermSeed();
fs.writeFileSync(
  path.join(process.cwd(), 'lib/navigation/menu-permissions.generated.json'),
  JSON.stringify(permSeed, null, 2) + '\n'
);
console.log(`✓ wrote menu-permissions.generated.json (${permSeed.length} rows)`);
```

- [ ] **Step 3: Run the script**
```bash
npx tsx scripts/generate-route-manifest.ts
```
Expected: console output `✓ wrote route-tab-seed.generated.json (... rows)` and `✓ wrote menu-permissions.generated.json (... rows)`. Both files exist on disk.

- [ ] **Step 4: Verify the JSON shape**
```bash
node -e "const j = require('./lib/navigation/route-tab-seed.generated.json'); console.log(j.slice(0, 3));"
```
Expected: 3 entries each with `tab_key`, `module_slug`, `parent_tab_key`, etc.

- [ ] **Step 5: Commit**
```bash
git add scripts/generate-route-manifest.ts lib/navigation/route-tab-seed.generated.json lib/navigation/menu-permissions.generated.json
git commit -m "feat(page-tabs): emit route-tab-seed and menu-permissions JSON at build time"
```

---

### Task 18: Create `scripts/sync-tab-definitions.ts`

**Files:**
- Create: `scripts/sync-tab-definitions.ts`

- [ ] **Step 1: Implement**

```ts
// scripts/sync-tab-definitions.ts
// Reads route-tab-seed.generated.json and calls fn_resync_tab_definitions_from_seed.
// Run by postdeploy hook OR manually via `npm run sync:tabs`.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    process.exit(1);
  }
  const seedPath = path.join(process.cwd(), 'lib/navigation/route-tab-seed.generated.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('fn_resync_tab_definitions_from_seed', { p_seed: seed });
  if (error) {
    console.error('sync failed:', error);
    process.exit(1);
  }
  console.log('✓ synced tab definitions:', data);
}

main();
```

- [ ] **Step 2: Verify compile**
```bash
npx tsc --noEmit scripts/sync-tab-definitions.ts
```

- [ ] **Step 3: Commit**
```bash
git add scripts/sync-tab-definitions.ts
git commit -m "feat(page-tabs): add sync-tab-definitions script"
```

---

### Task 19: Create `scripts/sync-menu-permissions.ts`

**Files:**
- Create: `scripts/sync-menu-permissions.ts`

- [ ] **Step 1: Implement (mirror of Task 18, different file/RPC)**

```ts
// scripts/sync-menu-permissions.ts
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing env vars'); process.exit(1); }
  const seedPath = path.join(process.cwd(), 'lib/navigation/menu-permissions.generated.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('fn_resync_menu_permissions', { p_seed: seed });
  if (error) { console.error('sync failed:', error); process.exit(1); }
  console.log('✓ synced menu permissions:', data);
}

main();
```

- [ ] **Step 2: Compile + commit.**

---

### Task 20: Create `scripts/check-tab-coverage.ts` CI gate

**Files:**
- Create: `scripts/check-tab-coverage.ts`

- [ ] **Step 1: Implement**

```ts
// scripts/check-tab-coverage.ts
// CI gate. Fails if:
//   - tab_seed entry has parent_tab_key not in seed
//   - any tab depth > 3
//   - duplicate tab_key
//   - route exists in MENU_PERMISSIONS but no tab_seed entry
import fs from 'node:fs';
import path from 'node:path';

const tabSeed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/navigation/route-tab-seed.generated.json'), 'utf8')) as Array<{
  tab_key: string; parent_tab_key: string | null; depth: number; href: string;
}>;
const menuPerms = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/navigation/menu-permissions.generated.json'), 'utf8')) as Array<{
  route: string;
}>;

const errors: string[] = [];
const seen = new Set<string>();
const allKeys = new Set<string>(tabSeed.map(r => r.tab_key));

for (const row of tabSeed) {
  if (seen.has(row.tab_key)) errors.push(`duplicate tab_key: ${row.tab_key}`);
  seen.add(row.tab_key);
  if (row.depth > 3) errors.push(`depth > 3: ${row.tab_key}`);
  if (row.parent_tab_key && !allKeys.has(row.parent_tab_key)) {
    errors.push(`broken hierarchy: ${row.tab_key} → parent ${row.parent_tab_key} not in seed`);
  }
}

const seedHrefs = new Set(tabSeed.map(r => r.href));
for (const mp of menuPerms) {
  if (!seedHrefs.has(mp.route)) {
    errors.push(`orphan route in MENU_PERMISSIONS not seeded as tab: ${mp.route}`);
  }
}

if (errors.length > 0) {
  console.error(`✗ tab-coverage FAILED with ${errors.length} errors:`);
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}
console.log(`✓ tab-coverage OK (${tabSeed.length} tabs, ${menuPerms.length} routes)`);
```

- [ ] **Step 2: Run**
```bash
npx tsx scripts/check-tab-coverage.ts
```
Expected: either `✓ tab-coverage OK` or a list of errors to address.

- [ ] **Step 3: Address any errors** (orphan routes, etc.) before committing.

- [ ] **Step 4: Commit**
```bash
git add scripts/check-tab-coverage.ts
git commit -m "feat(page-tabs): add CI tab-coverage gate"
```

---

### Task 21: Wire scripts into `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add scripts**

In the `scripts` block of `package.json`, add:
```json
"sync:tabs": "tsx scripts/sync-tab-definitions.ts",
"sync:menu-perms": "tsx scripts/sync-menu-permissions.ts",
"check:tab-coverage": "tsx scripts/check-tab-coverage.ts"
```

And modify the existing `build` line. Example transformation:
```json
"build": "npm run gen:routes && npm run check:sidebar && npm run check:reachability && npm run check:tab-coverage && next build"
```

- [ ] **Step 2: Run new scripts**
```bash
npm run check:tab-coverage
```
Expected: `✓ tab-coverage OK`.

- [ ] **Step 3: Commit**
```bash
git add package.json
git commit -m "feat(page-tabs): wire sync and coverage scripts into package.json"
```

---

## Phase 5 — Render Bridge (Tasks 22–25)

### Task 22: Modify `lib/navigation/tier-rendering.ts:resolveTiers()`

**Files:**
- Modify: `lib/navigation/tier-rendering.ts`
- Test: `__tests__/navigation/resolve-tiers-with-db.spec.ts`

- [ ] **Step 1: Read existing `resolveTiers` to understand input/output shape.**

- [ ] **Step 2: Add optional `dynamicTabs` parameter.**

Locate `export function resolveTiers(pathname, opts?)`. Modify the signature:
```ts
import { mergeDynamicTabs, type ResolvedTab, type StaticTab } from '@/lib/navigation/dynamic-tabs';

export interface ResolveTiersOptions {
  // ... existing options
  dynamicTabs?: ResolvedTab[];
}

export function resolveTiers(pathname: string, opts: ResolveTiersOptions = {}) {
  // existing logic builds staticTier1, staticTier2, staticTier3 chips
  // ... (unchanged)

  if (opts.dynamicTabs?.length) {
    // Convert existing chip data into StaticTab[] for merge
    const allStatic: StaticTab[] = [
      ...staticTier1.map(c => toStatic(c, 1)),
      ...staticTier2.map(c => toStatic(c, 2)),
      ...staticTier3.map(c => toStatic(c, 3)),
    ];
    const merged = mergeDynamicTabs(allStatic, opts.dynamicTabs);
    return splitByDepth(merged);
  }

  return { tier1: staticTier1, tier2: staticTier2, tier3: staticTier3 };
}

function toStatic(chip: any, depth: number): StaticTab {
  return {
    tab_key: chip.tabKey ?? '',
    label: chip.label,
    href: chip.href,
    icon: chip.iconName ?? null,
    display_order: chip.order ?? 0,
    depth,
    parent_tab_key: chip.parentKey ?? null,
    is_default: chip.isDefault ?? false,
  };
}

function splitByDepth(tabs: StaticTab[]) {
  return {
    tier1: tabs.filter(t => t.depth === 1).sort((a,b) => a.display_order - b.display_order),
    tier2: tabs.filter(t => t.depth === 2).sort((a,b) => a.display_order - b.display_order),
    tier3: tabs.filter(t => t.depth === 3).sort((a,b) => a.display_order - b.display_order),
  };
}
```

- [ ] **Step 3: Write test for the new param**

```ts
// __tests__/navigation/resolve-tiers-with-db.spec.ts
import { describe, it, expect } from 'vitest';
import { resolveTiers } from '@/lib/navigation/tier-rendering';

describe('resolveTiers with dynamicTabs', () => {
  it('falls back to static behavior when dynamicTabs is undefined', () => {
    const result = resolveTiers('/admission/leads/kanban');
    expect(result).toBeDefined();
    expect(result.tier1).toBeDefined();
  });

  it('merges DB-resolved tabs over static defaults', () => {
    const result = resolveTiers('/admission/leads/kanban', {
      dynamicTabs: [{
        tab_key: 'admission.leads.kanban',
        label: 'Board',
        href: '/admission/leads/kanban',
        icon: 'Columns3',
        display_order: 0,
        depth: 2,
        parent_tab_key: 'admission.leads',
        is_default: true,
        hidden: false,
        kind: 'route',
        required_permission: null,
        override_source: 'global',
      }],
    });
    expect(result.tier2.find((c: any) => c.tab_key === 'admission.leads.kanban')?.label).toBe('Board');
  });
});
```

- [ ] **Step 4: Run tests**
```bash
npx vitest run __tests__/navigation/resolve-tiers-with-db.spec.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**
```bash
git add lib/navigation/tier-rendering.ts __tests__/navigation/resolve-tiers-with-db.spec.ts
git commit -m "feat(page-tabs): resolveTiers accepts optional dynamicTabs"
```

---

### Task 23: Wire `useDynamicTabs` into `<AutoTabNav />`

**Files:**
- Modify: `components/navigation/auto-tab-nav.tsx`

- [ ] **Step 1: Read existing AutoTabNav to find where `resolveTiers(pathname)` is called.**

- [ ] **Step 2: Add the hook + pass `dynamicTabs` into resolver**

```tsx
// components/navigation/auto-tab-nav.tsx (additions near top of component)
import { useDynamicTabs } from '@/hooks/use-dynamic-tabs';
import { deriveModuleSlugFromPath } from '@/lib/navigation/tab-key';
import { useAuth } from '@/contexts/auth-context'; // confirm exact path

// Inside the component:
const moduleSlug = deriveModuleSlugFromPath(pathname);
const { profile } = useAuth();
const institutionId = profile?.institution_id ?? null;
const { data: dynamicTabs } = useDynamicTabs(moduleSlug || null, institutionId);

// Replace the existing resolveTiers call:
const tiers = resolveTiers(pathname, { dynamicTabs: dynamicTabs ?? undefined });
```

- [ ] **Step 3: Test in dev**
```bash
npm run dev
```
Open `/admission/leads/kanban` → tabs render. Add an override row in DB via SQL → refresh page → tab label changes.

- [ ] **Step 4: Commit**
```bash
git add components/navigation/auto-tab-nav.tsx
git commit -m "feat(page-tabs): AutoTabNav consumes useDynamicTabs"
```

---

### Task 24: Extend `lib/navigation/page-registry.ts` with admin-tab merge

**Files:**
- Modify: `lib/navigation/page-registry.ts`

- [ ] **Step 1: Find `buildRegistry()` function.** It currently merges 3 sources (sidebar, marathon dynamic, manifest pages).

- [ ] **Step 2: Add fourth merge step**

```ts
// lib/navigation/page-registry.ts (additions inside buildRegistry)
import { pageTabsService } from '@/lib/services/admin/page-tabs-service';

// At the end of buildRegistry, after the 3rd merge step:
async function mergeAdminAddedTabs(seen: Set<string>, entries: PageEntry[]) {
  // Iterate all 34 module slugs to fetch admin-added tabs
  for (const mod of MODULES) {
    try {
      const resolved = await pageTabsService.getResolved(mod.slug, null);
      for (const t of resolved) {
        if (t.kind !== 'route' || !t.href) continue;
        if (seen.has(t.href)) continue;
        seen.add(t.href);
        entries.push({
          path: t.href,
          title: t.label,
          keywords: [],
          description: '',
          module: mod.slug,
          icon: lookupLucideIcon(t.icon),
          iconName: t.icon ?? '',
          permission: t.required_permission ?? undefined,
        });
      }
    } catch {
      // best-effort; if RPC fails, fall back to static registry
    }
  }
}
```

Note: `buildRegistry()` may be sync today. If so, leave the static fast path and add a separate `enrichRegistryWithAdminTabs()` async function that the Cmd+K palette calls in a `useEffect`. Implementation depends on existing structure — read first, adapt second.

- [ ] **Step 3: Verify Cmd+K still works in dev** by opening palette and confirming all known pages still appear.

- [ ] **Step 4: Commit**
```bash
git add lib/navigation/page-registry.ts
git commit -m "feat(page-tabs): page-registry merges admin-added route tabs"
```

---

### Task 25: Add JSDoc to `lib/navigation/nav-config.ts` documenting precedence

**Files:**
- Modify: `lib/navigation/nav-config.ts`

- [ ] **Step 1: Add a header comment** to the top of the file:

```ts
/**
 * Per-module nav configuration.
 *
 * PRECEDENCE (top wins):
 *   1. page_tab_overrides (institution scope)
 *   2. page_tab_overrides (global scope)
 *   3. This file (`nav-config.ts`)
 *   4. route-manifest.generated.ts (filesystem)
 *
 * Admin edits via /admin/navigation/page-tabs override what's defined here.
 * To revert an admin override: delete the matching page_tab_overrides row
 * (admin UI: click "⟲ Reset to default" on the relevant tab).
 *
 * @see docs/superpowers/specs/2026-04-29-dynamic-page-tabs-design.md
 */
```

- [ ] **Step 2: Commit**
```bash
git add lib/navigation/nav-config.ts
git commit -m "docs(page-tabs): document DB-override precedence in nav-config"
```

---

## Phase 6 — Admin UI (Tasks 26–34)

### Task 26: Create `/admin/navigation/layout.tsx` umbrella

**Files:**
- Create: `app/(routes)/admin/navigation/layout.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(routes)/admin/navigation/layout.tsx
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SUB_TABS = [
  { value: 'admin-nav',     label: 'Admin Nav',     href: '/admin/navigation/admin-nav' },
  { value: 'page-metadata', label: 'Page Metadata', href: '/admin/navigation/page-metadata' },
  { value: 'page-tabs',     label: 'Page Tabs',     href: '/admin/navigation/page-tabs' },
];

export default function NavigationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Navigation</h1>
        <p className="text-sm text-muted-foreground">Configure sidebar, page metadata, and in-page tab navigation.</p>
      </div>
      <Tabs defaultValue="page-tabs" className="w-full">
        <TabsList>
          {SUB_TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              <Link href={t.href}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/layout.tsx
git commit -m "feat(page-tabs): add /admin/navigation umbrella layout"
```

---

### Task 27: `/admin/navigation/page.tsx` redirect

**Files:**
- Create: `app/(routes)/admin/navigation/page.tsx`

- [ ] **Step 1: Write redirect**

```tsx
// app/(routes)/admin/navigation/page.tsx
import { redirect } from 'next/navigation';
export default function NavigationIndex() { redirect('/admin/navigation/page-tabs'); }
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/page.tsx
git commit -m "feat(page-tabs): /admin/navigation redirects to page-tabs"
```

---

### Task 28: Move existing `/admin/nav-config` and `/admin/page-metadata`

**Files:**
- Create: `app/(routes)/admin/navigation/admin-nav/page.tsx`
- Create: `app/(routes)/admin/navigation/page-metadata/page.tsx`
- Modify: `app/(routes)/admin/nav-config/page.tsx`
- Modify: `app/(routes)/admin/page-metadata/page.tsx`

- [ ] **Step 1: Make admin-nav re-export the existing component**

Create `app/(routes)/admin/navigation/admin-nav/page.tsx`:
```tsx
export { default } from '@/app/(routes)/admin/nav-config/page';
```

- [ ] **Step 2: Same for page-metadata**

```tsx
// app/(routes)/admin/navigation/page-metadata/page.tsx
export { default } from '@/app/(routes)/admin/page-metadata/page';
```

- [ ] **Step 3: Replace old paths with redirects**

`app/(routes)/admin/nav-config/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
export default function OldNavConfig() { redirect('/admin/navigation/admin-nav'); }
```

`app/(routes)/admin/page-metadata/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
export default function OldPageMetadata() { redirect('/admin/navigation/page-metadata'); }
```

- [ ] **Step 4: Add MENU_PERMISSIONS entries for new paths**

In `lib/sidebarMenuLink.ts`, add:
```ts
'/admin/navigation': 'admin.navigation.view',
'/admin/navigation/admin-nav': 'admin.navigation.view',
'/admin/navigation/page-metadata': 'admin.navigation.view',
'/admin/navigation/page-tabs': 'admin.navigation.view',
```

(If `admin.navigation.view` doesn't exist, add it to `lib/constants/permissions.ts` under the `admin` category and seed it for `super_admin` and `admin` roles.)

- [ ] **Step 5: Test in dev** — `/admin/nav-config` should now redirect to `/admin/navigation/admin-nav`. Both pages load.

- [ ] **Step 6: Commit**
```bash
git add app/(routes)/admin/navigation/ app/(routes)/admin/nav-config/page.tsx app/(routes)/admin/page-metadata/page.tsx lib/sidebarMenuLink.ts lib/constants/permissions.ts
git commit -m "feat(page-tabs): move admin-nav and page-metadata under /admin/navigation umbrella"
```

---

### Task 29: Module + Scope selector component

**Files:**
- Create: `app/(routes)/admin/navigation/page-tabs/_components/module-scope-selector.tsx`

- [ ] **Step 1: Implement**

```tsx
// _components/module-scope-selector.tsx
'use client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODULES } from '@/lib/navigation/modules';

interface Props {
  moduleSlug: string;
  setModuleSlug: (slug: string) => void;
  scopeType: 'global' | 'institution';
  setScopeType: (s: 'global' | 'institution') => void;
  institutionId: string | null;
  setInstitutionId: (id: string | null) => void;
  institutions: Array<{ id: string; name: string }>;
}

export function ModuleScopeSelector(p: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Module:</label>
        <Select value={p.moduleSlug} onValueChange={p.setModuleSlug}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODULES.map(m => <SelectItem key={m.slug || '_root'} value={m.slug}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Scope:</label>
        <Select value={p.scopeType} onValueChange={(v) => p.setScopeType(v as 'global'|'institution')}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global</SelectItem>
            <SelectItem value="institution">Institution</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {p.scopeType === 'institution' && (
        <Select value={p.institutionId ?? ''} onValueChange={(v) => p.setInstitutionId(v || null)}>
          <SelectTrigger className="w-[240px]"><SelectValue placeholder="Pick institution" /></SelectTrigger>
          <SelectContent>
            {p.institutions.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/_components/module-scope-selector.tsx
git commit -m "feat(page-tabs): module-scope selector component"
```

---

### Task 30: `<TabRow />` component

**Files:**
- Create: `app/(routes)/admin/navigation/page-tabs/_components/tab-row.tsx`

- [ ] **Step 1: Implement**

```tsx
// _components/tab-row.tsx
'use client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Edit2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import type { ResolvedTab } from '@/lib/navigation/dynamic-tabs';
import type { Database } from '@/lib/types/database.types';

type Definition = Database['public']['Tables']['page_tab_definitions']['Row'];

interface Props {
  resolved: ResolvedTab;
  definition: Definition;
  hasOverride: boolean;
  indent: number; // depth-1
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onToggleHidden: () => void;
  onReset: () => void;
}

export function TabRow(p: Props) {
  const isHidden = p.resolved.hidden;
  const sourceLabel =
    p.definition.source === 'admin' ? 'Admin-added' :
    p.hasOverride ? 'Code · overridden' : 'Code';

  return (
    <div
      className="flex items-center gap-2 py-2 border-b last:border-b-0"
      style={{ paddingLeft: `${p.indent * 24}px` }}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={isHidden ? 'text-muted-foreground line-through' : 'font-medium'}>
            {p.resolved.label}
          </span>
          {p.resolved.is_default && <Badge variant="outline">default</Badge>}
          <Badge variant={p.definition.source === 'admin' ? 'default' : 'secondary'}>
            {sourceLabel}
          </Badge>
        </div>
        {p.resolved.href && <div className="text-xs text-muted-foreground">{p.resolved.href}</div>}
      </div>
      <Button size="icon" variant="ghost" onClick={p.onMoveUp} title="Move up"><ArrowUp className="size-4" /></Button>
      <Button size="icon" variant="ghost" onClick={p.onMoveDown} title="Move down"><ArrowDown className="size-4" /></Button>
      <Button size="sm" variant="outline" onClick={p.onEdit}><Edit2 className="size-3 mr-1"/>Edit</Button>
      <Button size="icon" variant="ghost" onClick={p.onToggleHidden} title={isHidden ? 'Show' : 'Hide'}>
        {isHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>
      {p.hasOverride && (
        <Button size="icon" variant="ghost" onClick={p.onReset} title="Reset to default">
          <RotateCcw className="size-4" />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/_components/tab-row.tsx
git commit -m "feat(page-tabs): tab-row component"
```

---

### Task 31: `<TabEditDialog />` component

**Files:**
- Create: `app/(routes)/admin/navigation/page-tabs/_components/tab-edit-dialog.tsx`

- [ ] **Step 1: Implement**

```tsx
// _components/tab-edit-dialog.tsx
'use client';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUpsertPageTabOverride } from '@/hooks/use-page-tabs-admin';
import type { ResolvedTab } from '@/lib/navigation/dynamic-tabs';
import type { Database } from '@/lib/types/database.types';

type Definition = Database['public']['Tables']['page_tab_definitions']['Row'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolved: ResolvedTab;
  definition: Definition;
  scopeType: 'global' | 'institution';
  scopeId: string | null;
}

export function TabEditDialog(p: Props) {
  const upsert = useUpsertPageTabOverride();
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const [permission, setPermission] = useState('');
  const [isDefault, setIsDefault] = useState<boolean>(false);

  useEffect(() => {
    if (p.open) {
      setLabel(p.resolved.label);
      setIcon(p.resolved.icon ?? '');
      setPermission(p.resolved.required_permission ?? '');
      setIsDefault(p.resolved.is_default);
    }
  }, [p.open, p.resolved]);

  const onSave = async () => {
    await upsert.mutateAsync({
      tab_key: p.resolved.tab_key,
      scope_type: p.scopeType,
      scope_id: p.scopeId,
      label: label !== p.definition.default_label ? label : undefined,
      icon: icon !== (p.definition.default_icon ?? '') ? icon : undefined,
      required_permission: permission !== (p.definition.required_permission ?? '') ? permission : undefined,
      is_default: isDefault !== p.definition.default_is_default ? isDefault : undefined,
    });
    p.onOpenChange(false);
  };

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit tab: {p.resolved.tab_key}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="text-xs text-muted-foreground">
            Code default: <code>{p.definition.default_label}</code>
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Icon (lucide name)</Label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. Columns3" />
          </div>
          <div className="space-y-2">
            <Label>Required permission (narrow-only)</Label>
            <Input value={permission} onChange={(e) => setPermission(e.target.value)} placeholder="e.g. admission.leads.view" />
            <p className="text-xs text-muted-foreground">
              Inherits route's permission if blank. Cannot widen access.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            <Label>Default tab for parent</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => p.onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={upsert.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/_components/tab-edit-dialog.tsx
git commit -m "feat(page-tabs): tab-edit dialog"
```

---

### Task 32: `<AddTabDialog />` component

**Files:**
- Create: `app/(routes)/admin/navigation/page-tabs/_components/add-tab-dialog.tsx`

- [ ] **Step 1: Implement**

```tsx
// _components/add-tab-dialog.tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpsertPageTabDefinition } from '@/hooks/use-page-tabs-admin';
import { tabKeyFromHref } from '@/lib/navigation/tab-key';
import type { Database } from '@/lib/types/database.types';

type Definition = Database['public']['Tables']['page_tab_definitions']['Row'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleSlug: string;
  potentialParents: Definition[];
}

export function AddTabDialog(p: Props) {
  const upsert = useUpsertPageTabDefinition();
  const [parent, setParent] = useState<string>('');
  const [label, setLabel] = useState('');
  const [href, setHref] = useState('');
  const [icon, setIcon] = useState('');
  const [permission, setPermission] = useState('');

  const onCreate = async () => {
    let tabKey: string;
    try { tabKey = tabKeyFromHref(href); }
    catch (e: any) { return alert(e.message); }
    const parentDepth = p.potentialParents.find(d => d.tab_key === parent)?.depth ?? 0;
    await upsert.mutateAsync({
      tab_key: tabKey,
      module_slug: p.moduleSlug,
      parent_tab_key: parent || null,
      kind: 'route',
      href,
      label,
      icon: icon || null,
      display_order: 999, // append to end
      is_default: false,
      required_permission: permission || null,
      depth: parentDepth + 1,
    });
    p.onOpenChange(false);
    setParent(''); setLabel(''); setHref(''); setIcon(''); setPermission('');
  };

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add admin-authored tab</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Parent (optional)</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger><SelectValue placeholder="(top level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(top level)</SelectItem>
                {p.potentialParents.filter(d => d.depth < 3).map(d => (
                  <SelectItem key={d.tab_key} value={d.tab_key}>{d.default_label} ({d.tab_key})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Label *</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} required /></div>
          <div className="space-y-2">
            <Label>Href *</Label>
            <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/admission/leads/pipeline" required />
            <p className="text-xs text-muted-foreground">Must match an existing page in route-manifest.</p>
          </div>
          <div className="space-y-2"><Label>Icon (lucide)</Label><Input value={icon} onChange={(e) => setIcon(e.target.value)} /></div>
          <div className="space-y-2"><Label>Required permission</Label><Input value={permission} onChange={(e) => setPermission(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => p.onOpenChange(false)}>Cancel</Button>
          <Button onClick={onCreate} disabled={!label || !href || upsert.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/_components/add-tab-dialog.tsx
git commit -m "feat(page-tabs): add-tab dialog"
```

---

### Task 33: `<TabsTree />` component

**Files:**
- Create: `app/(routes)/admin/navigation/page-tabs/_components/tabs-tree.tsx`

- [ ] **Step 1: Implement**

```tsx
// _components/tabs-tree.tsx
'use client';
import { useState, useMemo } from 'react';
import { useDynamicTabs } from '@/hooks/use-dynamic-tabs';
import { usePageTabDefinitions, usePageTabOverrides, useUpsertPageTabOverride, useDeletePageTabOverride, useReorderPageTabs } from '@/hooks/use-page-tabs-admin';
import { TabRow } from './tab-row';
import { TabEditDialog } from './tab-edit-dialog';
import type { ResolvedTab } from '@/lib/navigation/dynamic-tabs';
import type { Database } from '@/lib/types/database.types';

type Definition = Database['public']['Tables']['page_tab_definitions']['Row'];

interface Props {
  moduleSlug: string;
  scopeType: 'global' | 'institution';
  scopeId: string | null;
}

export function TabsTree(p: Props) {
  const { data: resolved = [] } = useDynamicTabs(p.moduleSlug, p.scopeId);
  const { data: definitions = [] } = usePageTabDefinitions(p.moduleSlug);
  const { data: overrides = [] } = usePageTabOverrides(p.moduleSlug, p.scopeType, p.scopeId);
  const reorder = useReorderPageTabs();
  const toggleHidden = useUpsertPageTabOverride();
  const reset = useDeletePageTabOverride();

  const [editing, setEditing] = useState<ResolvedTab | null>(null);

  const defByKey = useMemo(() => new Map(definitions.map(d => [d.tab_key, d])), [definitions]);
  const overrideKeys = useMemo(() => new Set(overrides.map(o => o.tab_key)), [overrides]);

  const tree = useMemo(() => {
    // group by parent_tab_key
    const map = new Map<string | null, ResolvedTab[]>();
    for (const t of resolved) {
      const parent = t.parent_tab_key ?? null;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(t);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.display_order - b.display_order);
    return map;
  }, [resolved]);

  const renderRow = (tab: ResolvedTab, indent: number) => {
    const def = defByKey.get(tab.tab_key);
    if (!def) return null;
    const siblings = tree.get(tab.parent_tab_key) ?? [];
    const idx = siblings.findIndex(s => s.tab_key === tab.tab_key);
    return (
      <div key={tab.tab_key}>
        <TabRow
          resolved={tab}
          definition={def}
          hasOverride={overrideKeys.has(tab.tab_key)}
          indent={indent}
          onMoveUp={async () => {
            if (idx <= 0) return;
            const newOrder = [...siblings];
            [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
            await reorder.mutateAsync({
              parentKey: tab.parent_tab_key, orderedKeys: newOrder.map(s => s.tab_key),
              scopeType: p.scopeType, scopeId: p.scopeId,
            });
          }}
          onMoveDown={async () => {
            if (idx >= siblings.length - 1) return;
            const newOrder = [...siblings];
            [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
            await reorder.mutateAsync({
              parentKey: tab.parent_tab_key, orderedKeys: newOrder.map(s => s.tab_key),
              scopeType: p.scopeType, scopeId: p.scopeId,
            });
          }}
          onEdit={() => setEditing(tab)}
          onToggleHidden={() => toggleHidden.mutate({
            tab_key: tab.tab_key, scope_type: p.scopeType, scope_id: p.scopeId, hidden: !tab.hidden,
          })}
          onReset={() => reset.mutate({ tabKey: tab.tab_key, scopeType: p.scopeType, scopeId: p.scopeId })}
        />
        {(tree.get(tab.tab_key) ?? []).map(child => renderRow(child, indent + 1))}
      </div>
    );
  };

  return (
    <div className="rounded border">
      {(tree.get(null) ?? []).map(t => renderRow(t, 0))}
      {editing && defByKey.get(editing.tab_key) && (
        <TabEditDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          resolved={editing}
          definition={defByKey.get(editing.tab_key)!}
          scopeType={p.scopeType}
          scopeId={p.scopeId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/_components/tabs-tree.tsx
git commit -m "feat(page-tabs): tabs-tree component"
```

---

### Task 34: `<RefreshFromFilesystemButton />` and main page

**Files:**
- Create: `app/(routes)/admin/navigation/page-tabs/_components/refresh-from-filesystem-button.tsx`
- Create: `app/(routes)/admin/navigation/page-tabs/page.tsx`

- [ ] **Step 1: Refresh button**

```tsx
// _components/refresh-from-filesystem-button.tsx
'use client';
import { Button } from '@/components/ui/button';
import { useResyncTabsFromSeed } from '@/hooks/use-page-tabs-admin';
import { RefreshCw } from 'lucide-react';

export function RefreshFromFilesystemButton() {
  const resync = useResyncTabsFromSeed();
  const onClick = async () => {
    const seed = await fetch('/api/page-tabs/seed').then(r => r.json());
    await resync.mutateAsync(seed);
  };
  return (
    <Button variant="outline" onClick={onClick} disabled={resync.isPending}>
      <RefreshCw className="size-4 mr-2" />Refresh from filesystem
    </Button>
  );
}
```

- [ ] **Step 2: Tiny API route to expose the seed JSON**

Create `app/api/page-tabs/seed/route.ts`:
```ts
import { NextResponse } from 'next/server';
import seed from '@/lib/navigation/route-tab-seed.generated.json';
export async function GET() { return NextResponse.json(seed); }
```

- [ ] **Step 3: Main admin page**

```tsx
// app/(routes)/admin/navigation/page-tabs/page.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ModuleScopeSelector } from './_components/module-scope-selector';
import { TabsTree } from './_components/tabs-tree';
import { AddTabDialog } from './_components/add-tab-dialog';
import { RefreshFromFilesystemButton } from './_components/refresh-from-filesystem-button';
import { usePageTabDefinitions } from '@/hooks/use-page-tabs-admin';

export default function PageTabsAdminPage() {
  const [moduleSlug, setModuleSlug] = useState('admission');
  const [scopeType, setScopeType] = useState<'global'|'institution'>('global');
  const [institutionId, setInstitutionId] = useState<string|null>(null);
  const [adding, setAdding] = useState(false);
  const { data: definitions = [] } = usePageTabDefinitions(moduleSlug);

  // TODO: fetch institutions from existing service if needed
  const institutions: Array<{id:string,name:string}> = [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModuleScopeSelector
          moduleSlug={moduleSlug} setModuleSlug={setModuleSlug}
          scopeType={scopeType} setScopeType={setScopeType}
          institutionId={institutionId} setInstitutionId={setInstitutionId}
          institutions={institutions}
        />
        <div className="flex items-center gap-2">
          <RefreshFromFilesystemButton />
          <Button onClick={() => setAdding(true)}><Plus className="size-4 mr-2" />Add tab</Button>
        </div>
      </div>
      <TabsTree moduleSlug={moduleSlug} scopeType={scopeType} scopeId={institutionId} />
      <AddTabDialog
        open={adding}
        onOpenChange={setAdding}
        moduleSlug={moduleSlug}
        potentialParents={definitions}
      />
    </div>
  );
}
```

(Note: replace the `// TODO: fetch institutions` with real data using existing `useInstitutions` or equivalent hook in the codebase. If none exists, leave the array empty for v1 — Global scope still works.)

- [ ] **Step 4: Test in dev**
```bash
npm run dev
```
Open `/admin/navigation/page-tabs`. Select a module. Verify the tree renders. Click Edit, change label, save, see badge change to "Code · overridden".

- [ ] **Step 5: Commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/ app/api/page-tabs/seed/
git commit -m "feat(page-tabs): admin UI page-tabs main page + refresh button"
```

---

## Phase 7 — Tests (Tasks 35–37)

### Task 35: Integration test for `fn_get_resolved_page_tabs`

**Files:**
- Create: `__tests__/integration/fn-get-resolved-page-tabs.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/integration/fn-get-resolved-page-tabs.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Requires .env.test with SUPABASE_URL + SERVICE_ROLE_KEY
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

describe('fn_get_resolved_page_tabs (integration)', () => {
  beforeAll(async () => {
    await sb.from('page_tab_definitions').insert([
      { tab_key: 'test.alpha', module_slug: 'test', kind: 'route', href: '/test/alpha', default_label: 'Alpha', source: 'filesystem', depth: 1, default_display_order: 0 },
      { tab_key: 'test.beta',  module_slug: 'test', kind: 'route', href: '/test/beta',  default_label: 'Beta',  source: 'filesystem', depth: 1, default_display_order: 1 },
    ]);
  });

  afterAll(async () => {
    await sb.from('page_tab_definitions').delete().eq('module_slug', 'test');
  });

  it('returns rows in display_order', async () => {
    const { data } = await sb.rpc('fn_get_resolved_page_tabs', { p_module_slug: 'test', p_institution_id: null });
    const labels = (data ?? []).map((r: any) => r.label);
    expect(labels).toContain('Alpha');
  });

  it('hidden=true via override hides the row', async () => {
    await sb.from('page_tab_overrides').insert({ tab_key: 'test.alpha', scope_type: 'global', hidden: true });
    const { data } = await sb.rpc('fn_get_resolved_page_tabs', { p_module_slug: 'test', p_institution_id: null });
    expect((data ?? []).find((r: any) => r.tab_key === 'test.alpha')).toBeUndefined();
    await sb.from('page_tab_overrides').delete().eq('tab_key', 'test.alpha');
  });

  it('label_override wins', async () => {
    await sb.from('page_tab_overrides').insert({ tab_key: 'test.beta', scope_type: 'global', label_override: 'Bravo' });
    const { data } = await sb.rpc('fn_get_resolved_page_tabs', { p_module_slug: 'test', p_institution_id: null });
    expect((data ?? []).find((r: any) => r.tab_key === 'test.beta')?.label).toBe('Bravo');
    await sb.from('page_tab_overrides').delete().eq('tab_key', 'test.beta');
  });
});
```

- [ ] **Step 2: Run**
```bash
npx vitest run __tests__/integration/fn-get-resolved-page-tabs.spec.ts
```
Expected: 3 passing.

- [ ] **Step 3: Commit**
```bash
git add __tests__/integration/fn-get-resolved-page-tabs.spec.ts
git commit -m "test(page-tabs): integration tests for resolver RPC"
```

---

### Task 36: Service-layer tests with mocked Supabase

**Files:**
- Create: `__tests__/services/page-tabs-service.spec.ts`

- [ ] **Step 1: Write tests**

```ts
// __tests__/services/page-tabs-service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { pageTabsService } from '@/lib/services/admin/page-tabs-service';

vi.mock('@/lib/supabase-client', () => ({
  createClientSupabaseClient: () => ({
    rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
    }),
  }),
}));

describe('pageTabsService', () => {
  it('upsertOverride passes correct mode', async () => {
    const result = await pageTabsService.upsertOverride({
      tab_key: 'x.y', scope_type: 'global', scope_id: null, label: 'Test',
    });
    expect(result).toEqual({ ok: true });
  });

  it('upsertDefinition passes mode=definition', async () => {
    const result = await pageTabsService.upsertDefinition({
      tab_key: 'x.z', module_slug: 'x', parent_tab_key: null,
      kind: 'route', href: '/x/z', label: 'Z', icon: null,
      display_order: 0, is_default: false, required_permission: null, depth: 1,
    });
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run + commit.**

---

### Task 37: Playwright E2E smoke test

**Files:**
- Create: `e2e/admin-page-tabs.spec.ts`

- [ ] **Step 1: Implement**

```ts
// e2e/admin-page-tabs.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Admin page-tabs', () => {
  test.beforeEach(async ({ page }) => {
    // assume helper logs in as super_admin
    await page.goto('/admin/navigation/page-tabs');
  });

  test('shows tab tree for admission module', async ({ page }) => {
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Admission CRM' }).click();
    await expect(page.locator('text=Leads').first()).toBeVisible();
  });

  test('edit dialog opens and closes', async ({ page }) => {
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Admission CRM' }).click();
    await page.getByRole('button', { name: /edit/i }).first().click();
    await expect(page.locator('role=dialog')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.locator('role=dialog')).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run**
```bash
npx playwright test e2e/admin-page-tabs.spec.ts
```
Expected: 2 passing (assuming login helper exists; otherwise mark as TODO and skip in CI for v1).

- [ ] **Step 3: Commit**
```bash
git add e2e/admin-page-tabs.spec.ts
git commit -m "test(page-tabs): playwright smoke for admin UI"
```

---

## Phase 8 — Documentation + Memory (Tasks 38–39)

### Task 38: Add README to admin UI directory

**Files:**
- Create: `app/(routes)/admin/navigation/page-tabs/README.md`

- [ ] **Step 1: Write README**

```markdown
# /admin/navigation/page-tabs

Admin UI for managing in-page tab navigation across modules.

## Precedence (top wins)
1. `page_tab_overrides` (institution scope)
2. `page_tab_overrides` (global scope)
3. `lib/navigation/nav-config.ts` (per-module hand-declared)
4. `lib/navigation/route-manifest.generated.ts` (filesystem default)

## Editing
- **Edit a tab**: rename, change icon, narrow permission, set default — creates a `page_tab_overrides` row.
- **Reset**: deletes the override row, falls back to code defaults.
- **Add tab**: only `kind='route'` in v1; href must exist in route manifest.
- **Refresh from filesystem**: re-runs `fn_resync_tab_definitions_from_seed` from latest committed seed.

## Adding a new page (developer)
1. Create `app/(routes)/<slug>/<page>/page.tsx`
2. Optional: `export const navMeta = { label, icon }`
3. Add `MENU_PERMISSIONS` entry
4. Run `npm run gen:routes`
5. Commit + push; CI runs `check:tab-coverage`
6. Deploy → postdeploy runs `sync:tabs`
7. New tab appears as ghost row in admin UI

## See also
- Spec: `docs/superpowers/specs/2026-04-29-dynamic-page-tabs-design.md`
- Flow diagrams: `docs/superpowers/specs/2026-04-29-dynamic-page-tabs-flow-diagrams.md`
- User flows: `docs/superpowers/specs/2026-04-29-dynamic-page-tabs-user-flows.md`
```

- [ ] **Step 2: Commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/README.md
git commit -m "docs(page-tabs): admin UI README"
```

---

### Task 39: Update `MEMORY.md`

**Files:**
- Modify: `C:/Users/Admin/.claude/projects/D--Projects-MyJKKN/memory/MEMORY.md`
- Create: `C:/Users/Admin/.claude/projects/D--Projects-MyJKKN/memory/project_dynamic_page_tabs.md`

- [ ] **Step 1: Create project memory file**

```markdown
---
name: Dynamic Page-Tabs System
description: 3-tier page tab system with admin override layer; route-as-tab kind only in v1
type: project
---

Admin UI lives at `/admin/navigation/page-tabs`. Two new tables: `page_tab_definitions` (code-declared baseline) and `page_tab_overrides` (admin layer). Resolver RPC `fn_get_resolved_page_tabs(module_slug, institution_id)` applies institution > global > defaults priority + permission filter. Bridge into existing `<AutoTabNav />` via `useDynamicTabs(moduleSlug)` hook merged into `lib/navigation/tier-rendering.ts:resolveTiers()` via optional `dynamicTabs` parameter.

**Why**: admins need to rename, reorder, hide, re-parent, and add tabs without code deploys. Existing `nav-config.ts` files preserved as code-defined defaults; DB overrides layer on top.

**How to apply**: When adding a new module page, just add `page.tsx` + permission key + `MENU_PERMISSIONS` entry. CI gate `check:tab-coverage` enforces depth ≤ 3 and orphan detection. Build script auto-emits `route-tab-seed.generated.json` consumed by `fn_resync_tab_definitions_from_seed` post-deploy.

**Spec**: `docs/superpowers/specs/2026-04-29-dynamic-page-tabs-design.md`
**Plan**: `docs/superpowers/plans/2026-04-29-dynamic-page-tabs.md`
```

- [ ] **Step 2: Add line to `MEMORY.md`**

```markdown
## Dynamic Page-Tabs System
- [Dynamic Page-Tabs](project_dynamic_page_tabs.md) — 3-tier admin-editable tab system; route-as-tab kind v1; integrates with existing AutoTabNav via tier-rendering merge layer.
```

- [ ] **Step 3: Final smoke**
```bash
npm run build
```
Expected: full build succeeds, including `check:tab-coverage`.

- [ ] **Step 4: Final commit**
```bash
git add app/(routes)/admin/navigation/page-tabs/README.md
# memory files are outside repo, not committed
git commit -m "docs(page-tabs): final docs + memory updates" --allow-empty
```

---

## Acceptance Verification

After all tasks complete, run through the spec's §15 acceptance criteria manually:

- [ ] **AC1**: `/admin/navigation/page-tabs` allows rename, reorder, hide, re-parent, add for `kind='route'` tabs at global + institution scope.
- [ ] **AC2**: Edits propagate to `<AutoTabNav />` within 60s (or immediately on next page navigation).
- [ ] **AC3**: Adding `app/(routes)/x/y/page.tsx` + `npm run gen:routes` + redeploy → ghost row appears in admin UI.
- [ ] **AC4**: All 9 existing `nav-config.ts` files render same default tab tree (regression check).
- [ ] **AC5**: All 600 `MENU_PERMISSIONS` entries unchanged.
- [ ] **AC6**: `DELETE FROM page_tab_overrides` reverts UI immediately on next refetch.
- [ ] **AC7**: CI gate blocks PRs with orphan/depth/collision issues.
- [ ] **AC8**: RLS prevents non-admin direct writes (verified with test user via Supabase Studio).
- [ ] **AC9**: `/admin/nav-config` and `/admin/page-metadata` redirect to umbrella correctly.
- [ ] **AC10**: No URLs changed outside `/admin/navigation/*`.

---

## Plan Self-Review

**Spec coverage**: Each spec section maps to tasks:
- §6 Data Model → Tasks 1–3 (tables) + Task 11 (types).
- §7 RPC Surface → Tasks 4–10.
- §8 Build-Time Discovery → Tasks 17, 18, 19, 20, 21.
- §9 Render Bridge → Tasks 22, 23, 24.
- §10 Admin UI → Tasks 26–34.
- §11 Permission Gating → embedded in Task 5 (resolver) + Task 31 (edit dialog narrow-only).
- §13 Testing → Tasks 12, 13, 22, 35, 36, 37.
- §14 Risks (LOCKED) → encoded in Task 5 SQL (perm parity) + Task 6 (href validation).
- §15 Acceptance → final checklist above.

**Type consistency**: `ResolvedTab` (Task 13) used by `useDynamicTabs` (Task 15), `TabRow` (Task 30), `TabEditDialog` (Task 31), `TabsTree` (Task 33), `mergeDynamicTabs` (Task 13). Method names match across hooks ↔ service ↔ RPCs (`upsertOverride`, `upsertDefinition`, `deleteOverride`, `reorder`, `resyncFromSeed`).

**Placeholder scan**: One acknowledged TODO inside Task 34 (`// TODO: fetch institutions`) — left intentionally because the existing institution-fetching helper isn't part of this plan's scope. Otherwise no `TBD`, `TODO`, or vague directives.

---

## Execution Path

This plan is large enough to benefit from subagent-driven execution: dispatch a fresh subagent per task, review between tasks. Suggested groupings for review checkpoints:

1. **After Phase 1** (Tasks 1–11): all migrations + types regenerated; nothing visible yet but DB shape is locked.
2. **After Phase 4** (Tasks 17–21): build pipeline emits seed JSON + CI gate works; still no UI.
3. **After Phase 5** (Tasks 22–25): `<AutoTabNav />` reads DB overrides — manually testable via direct SQL inserts.
4. **After Phase 6** (Tasks 26–34): admin UI fully wired.
5. **After Phase 7+8** (Tasks 35–39): tests + docs.

Total: 39 tasks across 8 phases. Estimate: 3–5 working days for one engineer with codebase familiarity, longer for one without.
