# Global Calendar Module — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a global, multi-institution Calendar module whose unified grid shows holidays from three sources (global-owned + academic `institution_leaves` + `hr_public_holidays`), lets super-admins manage cross-institution "common" holidays/events, and makes common holidays optionally block attendance everywhere.

**Architecture:** Aggregator + thin global owner. Three new tables own only cross-institution data (`calendar_entries`, `calendar_categories`, `calendar_feed_settings`). One `SECURITY DEFINER` resolver RPC (`fn_calendar_items`) UNIONs all holiday/event sources into a normalized "calendar item", scoped server-side to the viewer's accessible institutions. The UI calls the service directly from React Query hooks (the academic leave-calendar pattern), not via API routes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), TanStack Query v5, Shadcn UI, `react-big-calendar` (already installed), `moment`.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-06-23-global-calendar-module-design.md`) and `CLAUDE.md`. Every task implicitly includes these:

- **No test runner exists in this repo.** Do NOT write pytest/jest tests or claim "tests pass." Verify each task by: (1) `mcp__ide__getDiagnostics` on every touched TS file; (2) `mcp__supabase__execute_sql` verification queries for DB work; (3) the `check:*` CI gates after touching routes/permissions; (4) browser smoke as a non-super-admin role.
- **Gate on permission keys, never role names**, in SQL and UI.
- **Multi-tenancy:** never branch on `isSuperAdmin` to decide data scope. Pass accessible-institution ids; let RLS / the resolver scope. (`isSuperAdmin` is only for *UI affordances* like showing the "All Institutions" option.)
- **Supabase errors are plain objects** — surface with `getErrorMessage()` from `@/lib/utils`, never `err instanceof Error`.
- **Never fire-and-forget a Supabase mutation** — always destructure `{ error }` and check it.
- **`institutionId ?? x`, never `|| ''`.** Normalize empty string `''` → `null` for nullable FK fields before insert.
- **Permissions are DB-driven:** declaring a key in `permissions.ts` does nothing until granted to roles via a JSONB migration. Front-end-only permission changes produce a silent empty state.
- **Mirror every DB change** into `supabase/setup/` reference files (`01_tables.sql`, `02_functions.sql`, `03_policies.sql`).
- **Register every new table in `types/supabase.ts`** or `.from('table')` fails typecheck.
- **`SECURITY DEFINER` functions are anon-callable by default** — `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT EXECUTE ... TO authenticated;`.
- **Client permission checks use `usePermissions()`** (`canAccess(module, action)`, `isSuperAdmin`, `userProfile`, `isLoading`) — NOT `useAuth()` (which here exposes only `{profile, isLoading, error}`).
- Apply migrations with `mcp__supabase__apply_migration` AND commit the real SQL body to `supabase/migrations/` (never a `SELECT 1;` placeholder).

---

## File Structure

**New files:**
- `supabase/migrations/20260623100000_calendar_module_tables.sql` — 3 tables, indexes, triggers, RLS, seed categories
- `supabase/migrations/20260623100100_calendar_resolver_rpc.sql` — `fn_calendar_feed_enabled` + `fn_calendar_items`
- `supabase/migrations/20260623100200_calendar_attendance_integration.sql` — extend `is_date_blocked_by_leave` + `hr_calc_leave_days`
- `supabase/migrations/20260623100300_calendar_permissions_grants.sql` — JSONB grants of `calendar.*` keys
- `types/calendar.ts` — domain types (`CalendarItem`, `CalendarEntry`, DTOs, `CalendarCategory`)
- `lib/services/calendar/calendar-service.ts` — read via RPC + CRUD on `calendar_entries`
- `hooks/calendar/use-calendar.ts` — React Query hooks
- `app/(routes)/calendar/layout.tsx` — `RoutePermissionGuard` wrapper
- `app/(routes)/calendar/page.tsx` — unified calendar grid
- `app/(routes)/calendar/_components/calendar-view.tsx` — `react-big-calendar` grid + picker + chips + legend
- `app/(routes)/calendar/holidays/page.tsx` — common holidays/events admin (table + dialog)
- `app/(routes)/calendar/holidays/_components/holidays-admin.tsx` — client table + create/edit dialog

**Modified files:**
- `types/supabase.ts` — register the 3 new tables
- `lib/constants/permissions.ts` — add the `Calendar` category (before the closing `];` at line ~2153)
- `lib/sidebarMenuLink.ts` — add `MenuGroup` in `GetPages` + `MENU_PERMISSIONS` entries
- `lib/query/query-keys.ts` — add `calendar` key namespace
- `supabase/setup/01_tables.sql`, `02_functions.sql`, `03_policies.sql` — mirror DB changes

---

## Task 1: Database tables, RLS, seed categories

**Files:**
- Create: `supabase/migrations/20260623100000_calendar_module_tables.sql`
- Modify: `supabase/setup/01_tables.sql`, `supabase/setup/03_policies.sql` (mirror)

**Interfaces:**
- Produces: tables `public.calendar_entries`, `public.calendar_categories`, `public.calendar_feed_settings`; trigger fn `public.fn_calendar_entries_touch_updated_at`; seeded category slugs `public-holiday`, `institution-leave`, `event`, `meeting`.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260623100000_calendar_module_tables.sql
-- =====================================================================
-- Global Calendar module — Phase 1 substrate (3 owned tables)            2026-06-23
-- calendar_entries:        cross-institution holidays/events/meetings.
--                          scope_institution_ids NULL = COMMON (all institutions);
--                          a populated uuid[] = a specific subset.
-- calendar_categories:     global color/legend vocabulary.
-- calendar_feed_settings:  per-feed on/off; institution_id NULL = global default,
--                          a row with institution_id = per-institution override.
-- RLS: admin bypass OR permission key AND institution scope (the standard
-- MyJKKN idiom). Reads for the grid go through the SECURITY DEFINER resolver
-- (next migration); these policies gate DIRECT reads/writes from the admin UI.
-- =====================================================================

-- 1. calendar_categories ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  color_code       TEXT NOT NULL DEFAULT '#6b7280',
  applies_to_kinds TEXT[] NOT NULL DEFAULT ARRAY['holiday','event','meeting'],
  icon             TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. calendar_entries ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  TEXT NOT NULL DEFAULT 'holiday'
                          CHECK (kind IN ('holiday','event','meeting')),
  title                 TEXT NOT NULL,
  description           TEXT,
  category_id           UUID REFERENCES public.calendar_categories(id),
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  all_day               BOOLEAN NOT NULL DEFAULT true,
  blocks_attendance     BOOLEAN NOT NULL DEFAULT true,
  scope_institution_ids UUID[],                       -- NULL = common (all institutions)
  visibility            TEXT NOT NULL DEFAULT 'public'
                          CHECK (visibility IN ('public','restricted')),
  location              TEXT,
  meeting_url           TEXT,
  is_recurring          BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern    JSONB,
  color_code            TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_entries_end_after_start CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_active_start
  ON public.calendar_entries (is_active, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_kind_start
  ON public.calendar_entries (kind, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_scope
  ON public.calendar_entries USING GIN (scope_institution_ids);

-- 3. calendar_feed_settings --------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_feed_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_key        TEXT NOT NULL,
  institution_id  UUID REFERENCES public.institutions(id),  -- NULL = global default
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- one global-default row per feed, one override row per (feed, institution)
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_feed_global
  ON public.calendar_feed_settings (feed_key) WHERE institution_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_feed_institution
  ON public.calendar_feed_settings (feed_key, institution_id) WHERE institution_id IS NOT NULL;

-- 4. updated_at touch trigger (shared by the 3 tables) ------------------
CREATE OR REPLACE FUNCTION public.fn_calendar_entries_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_entries_touch ON public.calendar_entries;
CREATE TRIGGER trg_calendar_entries_touch BEFORE UPDATE ON public.calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_calendar_entries_touch_updated_at();
DROP TRIGGER IF EXISTS trg_calendar_categories_touch ON public.calendar_categories;
CREATE TRIGGER trg_calendar_categories_touch BEFORE UPDATE ON public.calendar_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_calendar_entries_touch_updated_at();
DROP TRIGGER IF EXISTS trg_calendar_feed_settings_touch ON public.calendar_feed_settings;
CREATE TRIGGER trg_calendar_feed_settings_touch BEFORE UPDATE ON public.calendar_feed_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_calendar_entries_touch_updated_at();

-- 5. RLS ----------------------------------------------------------------
ALTER TABLE public.calendar_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feed_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_categories    FROM anon;
REVOKE ALL ON public.calendar_entries       FROM anon;
REVOKE ALL ON public.calendar_feed_settings FROM anon;

-- categories: any calendar viewer reads; config managers write
DROP POLICY IF EXISTS calendar_categories_select ON public.calendar_categories;
CREATE POLICY calendar_categories_select ON public.calendar_categories
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.view')
  );
DROP POLICY IF EXISTS calendar_categories_write ON public.calendar_categories;
CREATE POLICY calendar_categories_write ON public.calendar_categories
  FOR ALL USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  ) WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  );

-- entries: viewers see common + their-scope; holiday managers write common + their-scope
DROP POLICY IF EXISTS calendar_entries_select ON public.calendar_entries;
CREATE POLICY calendar_entries_select ON public.calendar_entries
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.view')
        AND (scope_institution_ids IS NULL
             OR scope_institution_ids && public._user_accessible_institutions()))
  );
DROP POLICY IF EXISTS calendar_entries_write ON public.calendar_entries;
CREATE POLICY calendar_entries_write ON public.calendar_entries
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.holidays.manage')
        AND (scope_institution_ids IS NULL
             OR scope_institution_ids && public._user_accessible_institutions()))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.holidays.manage')
        AND (scope_institution_ids IS NULL
             OR scope_institution_ids && public._user_accessible_institutions()))
  );

-- feed settings: viewers read; config managers write
DROP POLICY IF EXISTS calendar_feed_settings_select ON public.calendar_feed_settings;
CREATE POLICY calendar_feed_settings_select ON public.calendar_feed_settings
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.view')
  );
DROP POLICY IF EXISTS calendar_feed_settings_write ON public.calendar_feed_settings;
CREATE POLICY calendar_feed_settings_write ON public.calendar_feed_settings
  FOR ALL USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  ) WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  );

-- 6. seed the legend categories ----------------------------------------
INSERT INTO public.calendar_categories (name, slug, color_code, applies_to_kinds, sort_order)
VALUES
  ('Public Holiday',    'public-holiday',    '#f59e0b', ARRAY['holiday'], 1),
  ('Institution Leave', 'institution-leave', '#0ea5e9', ARRAY['holiday'], 2),
  ('Event',             'event',             '#22c55e', ARRAY['event'],   3),
  ('Meeting',           'meeting',           '#8b5cf6', ARRAY['meeting'], 4)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with name `calendar_module_tables` and the SQL body above.

- [ ] **Step 3: Verify the tables, indexes, and seed rows exist**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE 'calendar_%' ORDER BY 1;
SELECT slug, color_code FROM public.calendar_categories ORDER BY sort_order;
```
Expected: three tables (`calendar_categories`, `calendar_entries`, `calendar_feed_settings`); four seeded category rows.

- [ ] **Step 4: Verify RLS is enabled**
```sql
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('calendar_entries','calendar_categories','calendar_feed_settings');
```
Expected: `relrowsecurity = true` for all three.

- [ ] **Step 5: Mirror into `supabase/setup/`**

Append the three `CREATE TABLE` blocks (with indexes) to `supabase/setup/01_tables.sql`, and the RLS policies to `supabase/setup/03_policies.sql`. Match the existing ordering/style in those files.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/20260623100000_calendar_module_tables.sql supabase/setup/01_tables.sql supabase/setup/03_policies.sql
git commit -m "feat(calendar): add calendar_entries/categories/feed_settings tables + RLS"
```

---

## Task 2: Resolver RPC (`fn_calendar_items`) + feed-enabled helper

**Files:**
- Create: `supabase/migrations/20260623100100_calendar_resolver_rpc.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

**Interfaces:**
- Consumes: tables from Task 1; `public.get_user_accessible_institutions(uuid)` (returns TABLE with `institution_id`); `auth.uid()`.
- Produces: `public.fn_calendar_feed_enabled(text, uuid) → boolean`; `public.fn_calendar_items(uuid[], date, date, text[], text[]) → TABLE(item_id text, source_module text, source_id uuid, kind text, title text, description text, start_at timestamptz, end_at timestamptz, all_day boolean, institution_id uuid, institution_name text, category text, color_code text, blocks_attendance boolean, visibility text, person_name text, meta jsonb)`.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260623100100_calendar_resolver_rpc.sql
-- =====================================================================
-- Global Calendar resolver — Phase 1 (holiday/event feeds)               2026-06-23
-- fn_calendar_items UNIONs: (1) global calendar_entries, (2) academic
-- institution_leaves (approved), (3) hr_public_holidays. SECURITY DEFINER,
-- so it MUST scope itself: it intersects the requested institutions with the
-- viewer's get_user_accessible_institutions(auth.uid()). Person-level leave is
-- Phase 2 (not included here). Each name column is cast ::text to match the
-- declared TABLE types (avoids 42804); every institution_id is qualified
-- (avoids 42702).
-- =====================================================================

-- helper: is a feed on for an institution? per-institution override > global > ON
CREATE OR REPLACE FUNCTION public.fn_calendar_feed_enabled(p_feed_key text, p_institution_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.calendar_feed_settings
       WHERE feed_key = p_feed_key AND institution_id = p_institution_id LIMIT 1),
    (SELECT is_enabled FROM public.calendar_feed_settings
       WHERE feed_key = p_feed_key AND institution_id IS NULL LIMIT 1),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_calendar_items(
  p_institution_ids uuid[] DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_feeds text[] DEFAULT NULL,
  p_kinds text[] DEFAULT NULL
)
RETURNS TABLE (
  item_id text,
  source_module text,
  source_id uuid,
  kind text,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean,
  institution_id uuid,
  institution_name text,
  category text,
  color_code text,
  blocks_attendance boolean,
  visibility text,
  person_name text,
  meta jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_accessible uuid[];
  v_effective  uuid[];
BEGIN
  -- viewer's accessible institutions (never trust the client)
  SELECT COALESCE(array_agg(gua.institution_id), ARRAY[]::uuid[])
    INTO v_accessible
    FROM public.get_user_accessible_institutions(auth.uid()) gua;

  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    v_effective := v_accessible;
  ELSE
    SELECT COALESCE(array_agg(x), ARRAY[]::uuid[])
      INTO v_effective
      FROM unnest(p_institution_ids) x
     WHERE x = ANY(v_accessible);
  END IF;

  RETURN QUERY
  -- Source 1: global-owned entries (common ⇒ everyone; subset ⇒ intersect) -----
  SELECT
    ('global:' || ce.id::text),
    'global'::text,
    ce.id,
    ce.kind::text,
    ce.title::text,
    ce.description::text,
    ce.start_at,
    ce.end_at,
    ce.all_day,
    NULL::uuid,
    NULL::text,
    COALESCE(cc.name, ce.kind)::text,
    COALESCE(ce.color_code, cc.color_code, '#6b7280')::text,
    ce.blocks_attendance,
    ce.visibility::text,
    NULL::text,
    jsonb_build_object('scope_institution_ids', ce.scope_institution_ids)
  FROM public.calendar_entries ce
  LEFT JOIN public.calendar_categories cc ON cc.id = ce.category_id
  WHERE ce.is_active = true
    AND (p_kinds IS NULL OR ce.kind = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'global_entries' = ANY(p_feeds))
    AND (p_start IS NULL OR ce.end_at::date   >= p_start)
    AND (p_end   IS NULL OR ce.start_at::date <= p_end)
    AND public.fn_calendar_feed_enabled('global_entries', NULL)
    AND (ce.scope_institution_ids IS NULL OR ce.scope_institution_ids && v_effective)

  UNION ALL
  -- Source 2: academic institution_leaves (approved holidays) -----------------
  SELECT
    ('academic:' || il.id::text),
    'academic'::text,
    il.id,
    'holiday'::text,
    il.leave_name::text,
    il.description::text,
    il.start_date::timestamptz,
    (il.end_date::timestamptz + interval '1 day' - interval '1 second'),
    true,
    il.institution_id,
    i.name::text,
    COALESCE(lt.leave_type_name, 'Institution Leave')::text,
    COALESCE(lt.color_code, '#0ea5e9')::text,
    true,
    'public'::text,
    NULL::text,
    jsonb_build_object('scope_level', il.scope_level, 'leave_type_id', il.leave_type_id)
  FROM public.institution_leaves il
  JOIN public.institutions i ON i.id = il.institution_id
  LEFT JOIN public.leave_types lt ON lt.id = il.leave_type_id
  WHERE il.status = 'approved'
    AND il.institution_id = ANY(v_effective)
    AND (p_kinds IS NULL OR 'holiday' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'academic_holidays' = ANY(p_feeds))
    AND (p_start IS NULL OR il.end_date   >= p_start)
    AND (p_end   IS NULL OR il.start_date <= p_end)
    AND public.fn_calendar_feed_enabled('academic_holidays', il.institution_id)

  UNION ALL
  -- Source 3: HR public holidays (current version only) -----------------------
  SELECT
    ('hr:' || hph.id::text),
    'hr'::text,
    hph.id,
    'holiday'::text,
    hph.name::text,
    hph.notes::text,
    hph.holiday_date::timestamptz,
    (hph.holiday_date::timestamptz + interval '1 day' - interval '1 second'),
    true,
    ho.institution_id,
    i2.name::text,
    'Public Holiday'::text,
    '#f59e0b'::text,
    true,
    'public'::text,
    NULL::text,
    jsonb_build_object('is_optional', hph.is_optional)
  FROM public.hr_public_holidays hph
  JOIN public.hr_organizations ho ON ho.id = hph.hr_organization_id
  JOIN public.institutions i2 ON i2.id = ho.institution_id
  WHERE ho.institution_id = ANY(v_effective)
    AND hph.superseded_by IS NULL
    AND (p_kinds IS NULL OR 'holiday' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'hr_public_holidays' = ANY(p_feeds))
    AND (p_start IS NULL OR hph.holiday_date >= p_start)
    AND (p_end   IS NULL OR hph.holiday_date <= p_end)
    AND public.fn_calendar_feed_enabled('hr_public_holidays', ho.institution_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendar_feed_enabled(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_feed_enabled(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) TO authenticated;
```

> **Note on `hr_public_holidays.superseded_by`:** the resolver assumes a `superseded_by` column (the table is versioned). Before applying, confirm with `mcp__supabase__execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_name='hr_public_holidays';`. If the version column is named differently (e.g. only `valid_until`), replace `hph.superseded_by IS NULL` with `(hph.valid_until IS NULL OR hph.valid_until > now())`.

- [ ] **Step 2: Confirm the `hr_public_holidays` column name, then apply**

Run the column check above first. Then apply via `mcp__supabase__apply_migration` (name `calendar_resolver_rpc`).

- [ ] **Step 3: Verify the function runs and returns the expected shape**
```sql
SELECT * FROM public.fn_calendar_items(NULL, '2026-01-01', '2026-12-31', NULL, NULL) LIMIT 5;
```
Expected: executes without error (42804/42702 would surface here). Likely 0 rows under the service role / no auth context — that's fine; the goal is "no type/column errors." Confirm column list matches the declared RETURNS TABLE.

- [ ] **Step 4: Mirror into `supabase/setup/02_functions.sql`**

Append both functions.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260623100100_calendar_resolver_rpc.sql supabase/setup/02_functions.sql
git commit -m "feat(calendar): add fn_calendar_items resolver + feed-enabled helper"
```

---

## Task 3: Attendance integration (extend two existing functions — load-bearing)

**Files:**
- Create: `supabase/migrations/20260623100200_calendar_attendance_integration.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

**Interfaces:**
- Consumes: `public.calendar_entries`.
- Produces: updated `public.is_date_blocked_by_leave(...)` and `public.hr_calc_leave_days(...)` that also honor `calendar_entries` holidays with `blocks_attendance = true`.

> **CAUTION:** these two functions are load-bearing (academic attendance + HR leave-day math). Changes are **additive only** — preserve every existing branch. `hr_calc_leave_days` has no committed body in the repo, so Step 1 dumps the live definition before editing.

- [ ] **Step 1: Dump the live `hr_calc_leave_days` body**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='hr_calc_leave_days';
```
Keep the returned body — Step 2 modifies exactly that, not the spec snippet.

- [ ] **Step 2: Write the migration file**

`is_date_blocked_by_leave` is reproduced in full from `supabase/migrations/20251216_create_leave_management_tables.sql` with one added `UNION ALL` source. For `hr_calc_leave_days`, paste the body from Step 1 and add the `OR EXISTS (calendar_entries ...)` branch shown below into its holiday check.

```sql
-- supabase/migrations/20260623100200_calendar_attendance_integration.sql
-- =====================================================================
-- Calendar → attendance integration                                     2026-06-23
-- A global calendar_entries holiday with blocks_attendance=true now blocks
-- attendance (is_date_blocked_by_leave) and is skipped by the HR leave-day
-- counter (hr_calc_leave_days), for institutions in its scope (or all, when
-- scope_institution_ids IS NULL). ADDITIVE: existing institution_leaves logic
-- is unchanged.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_date_blocked_by_leave(
    p_institution_id UUID,
    p_date DATE,
    p_department_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL
)
RETURNS TABLE (
    is_blocked BOOLEAN,
    leave_id UUID,
    leave_name VARCHAR,
    leave_type_name VARCHAR,
    color_code VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- existing source: institution_leaves
    SELECT true, il.id, il.leave_name, lt.leave_type_name, lt.color_code
    FROM public.institution_leaves il
    JOIN public.leave_types lt ON lt.id = il.leave_type_id
    WHERE il.institution_id = p_institution_id
      AND il.status = 'approved'
      AND p_date BETWEEN il.start_date AND il.end_date
      AND (
          il.scope_level = 'institution'
          OR (il.scope_level = 'department' AND p_department_id IS NOT NULL AND p_department_id = ANY(il.department_ids))
          OR (il.scope_level = 'semester' AND p_semester_id IS NOT NULL AND p_semester_id = ANY(il.semester_ids))
          OR (il.scope_level = 'section' AND p_section_id IS NOT NULL AND p_section_id = ANY(il.section_ids))
      )

    UNION ALL
    -- NEW source: global calendar_entries holidays that block attendance
    SELECT true, ce.id, ce.title::varchar,
           COALESCE(cc.name, 'Holiday')::varchar,
           COALESCE(ce.color_code, cc.color_code, '#f59e0b')::varchar
    FROM public.calendar_entries ce
    LEFT JOIN public.calendar_categories cc ON cc.id = ce.category_id
    WHERE ce.kind = 'holiday'
      AND ce.is_active = true
      AND ce.blocks_attendance = true
      AND p_date BETWEEN ce.start_at::date AND ce.end_at::date
      AND (ce.scope_institution_ids IS NULL OR p_institution_id = ANY(ce.scope_institution_ids))

    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.is_date_blocked_by_leave IS 'Blocks attendance on approved institution_leaves OR global calendar_entries holidays (blocks_attendance=true)';

-- hr_calc_leave_days: paste the body dumped in Step 1 and, inside its
-- p_skip_holidays check, change the single institution_leaves EXISTS to:
--
--   ELSIF p_skip_holidays AND (
--       EXISTS (
--         SELECT 1 FROM institution_leaves
--         WHERE institution_id = inst_id
--           AND cur BETWEEN start_date AND end_date
--       )
--       OR EXISTS (
--         SELECT 1 FROM calendar_entries ce
--         WHERE ce.kind = 'holiday' AND ce.is_active = true AND ce.blocks_attendance = true
--           AND cur BETWEEN ce.start_at::date AND ce.end_at::date
--           AND (ce.scope_institution_ids IS NULL OR inst_id = ANY(ce.scope_institution_ids))
--       )
--   ) THEN
--
-- (Leave the rest of the dumped body byte-for-byte identical.)
```

Replace the trailing comment block with the actual `CREATE OR REPLACE FUNCTION public.hr_calc_leave_days(...)` built from Step 1 + the `OR EXISTS` branch above.

- [ ] **Step 3: Apply the migration** via `mcp__supabase__apply_migration` (name `calendar_attendance_integration`).

- [ ] **Step 4: Verify additive behavior with a temporary common holiday**
```sql
-- create a transient common holiday that blocks attendance
INSERT INTO public.calendar_entries (kind, title, start_at, end_at, blocks_attendance, scope_institution_ids)
VALUES ('holiday','__test_block__', now()::date, now()::date, true, NULL)
RETURNING id;

-- any institution id:
SELECT * FROM public.is_date_blocked_by_leave(
  (SELECT id FROM public.institutions LIMIT 1), now()::date);
-- Expected: is_blocked = true, leave_name = '__test_block__'

-- cleanup
DELETE FROM public.calendar_entries WHERE title = '__test_block__';
```
Then confirm a date with no holiday returns `is_blocked = false`.

- [ ] **Step 5: Mirror both function bodies into `supabase/setup/02_functions.sql`** (replace the existing `is_date_blocked_by_leave` if present; add `hr_calc_leave_days`).

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/20260623100200_calendar_attendance_integration.sql supabase/setup/02_functions.sql
git commit -m "feat(calendar): common holidays block attendance (extend is_date_blocked_by_leave + hr_calc_leave_days)"
```

---

## Task 4: TypeScript types (`types/supabase.ts` + `types/calendar.ts`)

**Files:**
- Modify: `types/supabase.ts`
- Create: `types/calendar.ts`

**Interfaces:**
- Produces: `CalendarItem`, `CalendarEntry`, `CalendarEntryKind`, `CalendarVisibility`, `CreateCalendarEntryInput`, `UpdateCalendarEntryInput`, `CalendarCategory`.

- [ ] **Step 1: Register the 3 tables in `types/supabase.ts`**

Inside the `public: { Tables: { ... } }` object, add these entries (alphabetical placement near other `calendar_*`/`c*` tables):

```ts
      calendar_categories: {
        Row: {
          applies_to_kinds: string[]
          color_code: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          applies_to_kinds?: string[]
          color_code?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applies_to_kinds?: string[]
          color_code?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      calendar_entries: {
        Row: {
          all_day: boolean
          blocks_attendance: boolean
          category_id: string | null
          color_code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string
          id: string
          is_active: boolean
          is_recurring: boolean
          kind: string
          location: string | null
          meeting_url: string | null
          recurrence_pattern: Json | null
          scope_institution_ids: string[] | null
          start_at: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          all_day?: boolean
          blocks_attendance?: boolean
          category_id?: string | null
          color_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          kind?: string
          location?: string | null
          meeting_url?: string | null
          recurrence_pattern?: Json | null
          scope_institution_ids?: string[] | null
          start_at: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          all_day?: boolean
          blocks_attendance?: boolean
          category_id?: string | null
          color_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          kind?: string
          location?: string | null
          meeting_url?: string | null
          recurrence_pattern?: Json | null
          scope_institution_ids?: string[] | null
          start_at?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "calendar_categories"
            referencedColumns: ["id"]
          }
        ]
      }
      calendar_feed_settings: {
        Row: {
          created_at: string
          feed_key: string
          id: string
          institution_id: string | null
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          feed_key: string
          id?: string
          institution_id?: string | null
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          feed_key?: string
          id?: string
          institution_id?: string | null
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
```

(If the file uses `Json` for jsonb columns, the import already exists at the top of `types/supabase.ts`; `recurrence_pattern: Json | null` matches that convention.)

- [ ] **Step 2: Create `types/calendar.ts`**

```ts
// types/calendar.ts
// Domain types for the global Calendar module.

export type CalendarEntryKind = 'holiday' | 'event' | 'meeting';
export type CalendarVisibility = 'public' | 'restricted';

/** Normalized row returned by the fn_calendar_items resolver RPC. */
export interface CalendarItem {
  item_id: string;
  source_module: string;
  source_id: string;
  kind: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  institution_id: string | null;
  institution_name: string | null;
  category: string | null;
  color_code: string | null;
  blocks_attendance: boolean;
  visibility: string;
  person_name: string | null;
  meta: Record<string, unknown> | null;
}

/** A global-owned calendar_entries row. */
export interface CalendarEntry {
  id: string;
  kind: CalendarEntryKind;
  title: string;
  description: string | null;
  category_id: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  blocks_attendance: boolean;
  scope_institution_ids: string[] | null;
  visibility: CalendarVisibility;
  location: string | null;
  meeting_url: string | null;
  is_recurring: boolean;
  recurrence_pattern: Record<string, unknown> | null;
  color_code: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCalendarEntryInput {
  kind: CalendarEntryKind;
  title: string;
  description?: string | null;
  category_id?: string | null;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  blocks_attendance?: boolean;
  scope_institution_ids?: string[] | null;
  visibility?: CalendarVisibility;
  location?: string | null;
  meeting_url?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: Record<string, unknown> | null;
  color_code?: string | null;
  is_active?: boolean;
}

export type UpdateCalendarEntryInput = Partial<CreateCalendarEntryInput>;

export interface CalendarCategory {
  id: string;
  name: string;
  slug: string;
  color_code: string;
  applies_to_kinds: string[];
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface CalendarItemsQuery {
  institutionIds?: string[] | null;
  start: string; // 'YYYY-MM-DD'
  end: string;   // 'YYYY-MM-DD'
  feeds?: string[] | null;
  kinds?: string[] | null;
}
```

- [ ] **Step 3: Typecheck both files**

Run `mcp__ide__getDiagnostics` on `types/calendar.ts` and `types/supabase.ts`.
Expected: no new errors introduced by the additions (pre-existing unrelated diagnostics may exist; do not introduce new ones in these regions).

- [ ] **Step 4: Commit**
```bash
git add types/calendar.ts types/supabase.ts
git commit -m "feat(calendar): register calendar tables in supabase types + add domain types"
```

---

## Task 5: Service layer (`calendar-service.ts`)

**Files:**
- Create: `lib/services/calendar/calendar-service.ts`

**Interfaces:**
- Consumes: `BaseService` (`@/lib/services/base-service`); `getErrorMessage` (`@/lib/utils`); types from Task 4; RPC `fn_calendar_items`.
- Produces: `CalendarService` with static methods `getCalendarItems(query)`, `listEntries({page,limit,search,kind})`, `createEntry(input)`, `updateEntry(id, updates)`, `deleteEntry(id)`, `getCategories()`.

- [ ] **Step 1: Write the service**

```ts
// lib/services/calendar/calendar-service.ts
// Global Calendar module — reads via the fn_calendar_items resolver RPC and
// CRUDs the global-owned calendar_entries table. calendar_entries uses
// scope_institution_ids (uuid[]), so the admin list does NOT use
// executeListQuery (which requires a scalar institution_id) — it runs a
// direct paginated query instead.

import { BaseService } from '../base-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  CalendarItem,
  CalendarItemsQuery,
  CalendarEntry,
  CreateCalendarEntryInput,
  UpdateCalendarEntryInput,
  CalendarCategory,
} from '@/types/calendar';

const ENTRIES = 'calendar_entries';
const CATEGORIES = 'calendar_categories';

export class CalendarService extends BaseService {
  /** Unified calendar feed for the grid (holiday/event sources, scoped server-side). */
  static async getCalendarItems(query: CalendarItemsQuery): Promise<CalendarItem[]> {
    const { data, error } = await this.supabase.rpc('fn_calendar_items', {
      p_institution_ids: query.institutionIds ?? null,
      p_start: query.start,
      p_end: query.end,
      p_feeds: query.feeds ?? null,
      p_kinds: query.kinds ?? null,
    });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as CalendarItem[];
  }

  /** Paginated list of global-owned entries for the admin table. */
  static async listEntries(params: {
    page?: number;
    limit?: number;
    search?: string;
    kind?: string;
  } = {}): Promise<{ data: CalendarEntry[]; totalCount: number }> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from(ENTRIES)
      .select('*', { count: 'exact' })
      .order('start_at', { ascending: false })
      .range(from, to);

    if (params.kind) query = query.eq('kind', params.kind);
    if (params.search) {
      const s = this.sanitize(params.search);
      query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return { data: (data ?? []) as CalendarEntry[], totalCount: count ?? 0 };
  }

  static async createEntry(input: CreateCalendarEntryInput): Promise<CalendarEntry> {
    // normalize empty arrays/strings to null for the "common" sentinel + nullable FKs
    const payload = {
      ...input,
      scope_institution_ids:
        input.scope_institution_ids && input.scope_institution_ids.length > 0
          ? input.scope_institution_ids
          : null,
      category_id: input.category_id || null,
    };
    const { data, error } = await this.supabase
      .from(ENTRIES)
      .insert(payload)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as CalendarEntry;
  }

  static async updateEntry(id: string, updates: UpdateCalendarEntryInput): Promise<CalendarEntry> {
    const { id: _omit, ...safe } = updates as UpdateCalendarEntryInput & { id?: string };
    const payload: Record<string, unknown> = { ...safe };
    if ('scope_institution_ids' in safe) {
      payload.scope_institution_ids =
        safe.scope_institution_ids && safe.scope_institution_ids.length > 0
          ? safe.scope_institution_ids
          : null;
    }
    if ('category_id' in safe) payload.category_id = safe.category_id || null;

    const { data, error } = await this.supabase
      .from(ENTRIES)
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as CalendarEntry;
  }

  static async deleteEntry(id: string): Promise<void> {
    const { error } = await this.supabase.from(ENTRIES).delete().eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async getCategories(): Promise<CalendarCategory[]> {
    const { data, error } = await this.supabase
      .from(CATEGORIES)
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as CalendarCategory[];
  }
}
```

> `this.supabase` and `this.sanitize` are inherited from `BaseService` (the `supabase` getter returns the browser singleton client-side). Confirm `sanitize` is `protected static` in `base-service.ts`; if it is named differently, inline `params.search.replace(/[%_]/g, '')`.

- [ ] **Step 2: Typecheck** — `mcp__ide__getDiagnostics` on `lib/services/calendar/calendar-service.ts`. Expected: no errors. (`fn_calendar_items` will typecheck only after Task 4's `types/supabase.ts` change registers nothing for RPCs — RPC names are loosely typed, so `.rpc('fn_calendar_items', ...)` is accepted.)

- [ ] **Step 3: Commit**
```bash
git add lib/services/calendar/calendar-service.ts
git commit -m "feat(calendar): add CalendarService (resolver read + entries CRUD)"
```

---

## Task 6: Query keys + React Query hooks

**Files:**
- Modify: `lib/query/query-keys.ts`
- Create: `hooks/calendar/use-calendar.ts`

**Interfaces:**
- Consumes: `CalendarService` (Task 5); `queryKeys.calendar` (added here).
- Produces: `useCalendarItems(query)`, `useCalendarEntries(params)`, `useCalendarCategories()`, `useCreateCalendarEntry()`, `useUpdateCalendarEntry()`, `useDeleteCalendarEntry()`.

- [ ] **Step 1: Add the `calendar` namespace to `lib/query/query-keys.ts`**

Inside the `queryKeys` object (e.g. after `transportCollectables`), add:
```ts
  calendar: {
    all: ['calendar'] as const,
    items: (query: unknown) => ['calendar', 'items', query] as const,
    entries: (params: unknown) => ['calendar', 'entries', params] as const,
    categories: () => ['calendar', 'categories'] as const,
  },
```

- [ ] **Step 2: Create `hooks/calendar/use-calendar.ts`**

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { CalendarService } from '@/lib/services/calendar/calendar-service';
import type {
  CalendarItemsQuery,
  CreateCalendarEntryInput,
  UpdateCalendarEntryInput,
} from '@/types/calendar';

export function useCalendarItems(query: CalendarItemsQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendar.items(query),
    queryFn: () => CalendarService.getCalendarItems(query),
    enabled,
  });
}

export function useCalendarEntries(params: {
  page?: number;
  limit?: number;
  search?: string;
  kind?: string;
} = {}) {
  return useQuery({
    queryKey: queryKeys.calendar.entries(params),
    queryFn: () => CalendarService.listEntries(params),
  });
}

export function useCalendarCategories() {
  return useQuery({
    queryKey: queryKeys.calendar.categories(),
    queryFn: () => CalendarService.getCategories(),
  });
}

export function useCreateCalendarEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCalendarEntryInput) => CalendarService.createEntry(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useUpdateCalendarEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateCalendarEntryInput }) =>
      CalendarService.updateEntry(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useDeleteCalendarEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CalendarService.deleteEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}
```

- [ ] **Step 3: Typecheck** — `mcp__ide__getDiagnostics` on both files. Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add lib/query/query-keys.ts hooks/calendar/use-calendar.ts
git commit -m "feat(calendar): add query keys + React Query hooks"
```

---

## Task 7: Permissions catalog + RBAC grants + navigation + route guard

**Files:**
- Modify: `lib/constants/permissions.ts`
- Create: `supabase/migrations/20260623100300_calendar_permissions_grants.sql`
- Modify: `lib/sidebarMenuLink.ts`
- Create: `app/(routes)/calendar/layout.tsx`

**Interfaces:**
- Produces: permission keys `calendar.view`, `calendar.people_leave.view`, `calendar.holidays.manage`, `calendar.config.manage`; sidebar group "Calendar"; `MENU_PERMISSIONS` for `/calendar`, `/calendar/holidays`, `/calendar/settings`; route guard layout.

- [ ] **Step 1: Add the `Calendar` category to `lib/constants/permissions.ts`**

Immediately before the array's closing `];` (≈ line 2153). Ensure the preceding RCLTP block now ends with `},`:
```ts
  {
    name: 'Calendar',
    key: 'calendar',
    permissions: [
      { key: 'calendar.view', label: 'View Calendar' },
      { key: 'calendar.people_leave.view', label: 'View Person-Level Leave on Calendar' },
      { key: 'calendar.holidays.manage', label: 'Manage Common Holidays & Events' },
      { key: 'calendar.config.manage', label: 'Manage Calendar Config (Feeds, Categories)' }
    ]
  }
```

- [ ] **Step 2: Write the RBAC grant migration**

```sql
-- supabase/migrations/20260623100300_calendar_permissions_grants.sql
-- =====================================================================
-- Grant calendar.* keys                                                  2026-06-23
-- calendar.view              → broad (all role users can view the calendar)
-- calendar.people_leave.view → approver/admin roles only (person-level leave)
-- calendar.holidays.manage   → super_admin + admin
-- calendar.config.manage     → super_admin + admin
-- Declaring keys in permissions.ts only populates the Role-Management dialog;
-- these JSONB grants are what actually surface the module. Idempotent.
-- =====================================================================

-- broad VIEW grant: every active role gets calendar.view
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('calendar.view', true),
       updated_at = now()
 WHERE COALESCE((permissions->>'calendar.view')::boolean, false) = false;

-- person-level leave overlay: approver-ish roles
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('calendar.people_leave.view', true),
       updated_at = now()
 WHERE role_key IN ('super_admin','admin','principal','hod','hr_admin','hr_manager')
   AND COALESCE((permissions->>'calendar.people_leave.view')::boolean, false) = false;

-- manage grants: super_admin + admin
UPDATE public.custom_roles
   SET permissions = permissions
        || jsonb_build_object('calendar.holidays.manage', true)
        || jsonb_build_object('calendar.config.manage', true),
       updated_at = now()
 WHERE role_key IN ('super_admin','admin')
   AND COALESCE((permissions->>'calendar.holidays.manage')::boolean, false) = false;
```

> Before applying, confirm the role_keys exist: `SELECT role_key FROM public.custom_roles ORDER BY 1;`. Drop any that don't exist from the `IN (...)` lists (a non-existent role_key just matches nothing, so this is safe but worth a glance).

- [ ] **Step 3: Apply the grant migration** via `mcp__supabase__apply_migration` (name `calendar_permissions_grants`).

- [ ] **Step 4: Verify grants landed**
```sql
SELECT role_key,
       (permissions->>'calendar.view')::boolean AS view,
       (permissions->>'calendar.holidays.manage')::boolean AS manage
FROM public.custom_roles ORDER BY role_key;
```
Expected: `view = true` for all roles; `manage = true` for super_admin/admin.

- [ ] **Step 5: Add navigation to `lib/sidebarMenuLink.ts`**

(a) In `GetPages(pathname)`, add a single-row `MenuGroup` (model on the Audit Workflow block). `Calendar` is already imported from `lucide-react`:
```ts
    {
      groupLabel: 'Calendar',
      menus: [
        {
          href: '/calendar',
          label: 'Calendar',
          active: pathname === '/calendar' || pathname.startsWith('/calendar/'),
          icon: Calendar,
          submenus: []
        }
      ]
    },
```
(b) In the `MENU_PERMISSIONS` map (opens ≈ line 148), add:
```ts
  // Global Calendar module
  '/calendar': 'calendar.view',
  '/calendar/holidays': 'calendar.holidays.manage',
  '/calendar/settings': 'calendar.config.manage',
```

- [ ] **Step 6: Create the route guard layout `app/(routes)/calendar/layout.tsx`**

```tsx
// Global Calendar module — route guard for the whole subtree.
// Enforces, per route, the SAME permission declared in MENU_PERMISSIONS
// (calendar.view / calendar.holidays.manage / calendar.config.manage) via the
// shared isPageAccessible() rule the sidebar uses. Mirrors app/(routes)/hr/layout.tsx.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
```

- [ ] **Step 7: Typecheck** the three TS/TSX files (`mcp__ide__getDiagnostics`). Expected: no errors.

- [ ] **Step 8: Run the nav/permission CI gates**

Run: `npm run gen:routes` then `npm run check:menus`
Expected: routes manifest regenerates; the permissions-catalog + menu-coverage checks pass (every `MENU_PERMISSIONS` value now has a catalog entry from Step 1). If `check:reachability` is part of your gate set, run `npm run check:reachability` too.

- [ ] **Step 9: Commit**
```bash
git add lib/constants/permissions.ts supabase/migrations/20260623100300_calendar_permissions_grants.sql lib/sidebarMenuLink.ts "app/(routes)/calendar/layout.tsx"
git commit -m "feat(calendar): permissions catalog + grants + sidebar nav + route guard"
```

---

## Task 8: Calendar grid page (`/calendar`)

**Files:**
- Create: `app/(routes)/calendar/page.tsx`
- Create: `app/(routes)/calendar/_components/calendar-view.tsx`

**Interfaces:**
- Consumes: `useCalendarItems` (Task 6); `useInstitutionsWithAccess` (`@/hooks/organization/use-institutions-with-access`); `usePermissions` (`@/hooks/use-permissions`); `react-big-calendar` + `moment`.
- Produces: the rendered unified calendar.

- [ ] **Step 1: Create the server page shell `app/(routes)/calendar/page.tsx`**

```tsx
import { CalendarView } from './_components/calendar-view';

export const metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-6">
      <CalendarView />
    </div>
  );
}
```

- [ ] **Step 2: Create the client grid `app/(routes)/calendar/_components/calendar-view.tsx`**

```tsx
'use client';

import { useMemo, useState, useCallback } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useCalendarItems } from '@/hooks/calendar/use-calendar';
import type { CalendarItem } from '@/types/calendar';

const localizer = momentLocalizer(moment);

const FEEDS = [
  { key: 'global_entries', label: 'Global' },
  { key: 'academic_holidays', label: 'Academic Holidays' },
  { key: 'hr_public_holidays', label: 'HR Holidays' },
];

interface RBCEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  resource: CalendarItem;
}

export function CalendarView() {
  const { isSuperAdmin } = usePermissions();
  const { institutions } = useInstitutionsWithAccess({ isActive: true, entityType: 'all' });

  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(null); // null = All
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [activeFeeds, setActiveFeeds] = useState<string[]>(FEEDS.map((f) => f.key));

  // visible window (pad a month each side so multi-day items at edges render)
  const { start, end } = useMemo(() => {
    const s = moment(currentDate).startOf('month').subtract(7, 'days').format('YYYY-MM-DD');
    const e = moment(currentDate).endOf('month').add(7, 'days').format('YYYY-MM-DD');
    return { start: s, end: e };
  }, [currentDate]);

  const { data: items = [], isLoading } = useCalendarItems({
    institutionIds: selectedInstitution ? [selectedInstitution] : null,
    start,
    end,
    feeds: activeFeeds.length ? activeFeeds : null,
  });

  const events: RBCEvent[] = useMemo(
    () =>
      items
        .filter((it) => activeFeeds.length === 0 || activeFeeds.includes(feedKeyFor(it)))
        .map((it) => ({
          id: it.item_id,
          title: it.institution_name ? `${it.title} · ${it.institution_name}` : it.title,
          start: new Date(it.start_at),
          end: new Date(it.end_at),
          allDay: it.all_day,
          color: it.color_code || '#6b7280',
          resource: it,
        })),
    [items, activeFeeds]
  );

  const legend = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((it) => {
      if (it.category) m.set(it.category, it.color_code || '#6b7280');
    });
    return Array.from(m.entries());
  }, [items]);

  const eventStyleGetter = useCallback(
    (event: RBCEvent) => ({
      style: { backgroundColor: event.color, color: '#fff', border: 'none', borderRadius: '6px' },
    }),
    []
  );

  const toggleFeed = (key: string) =>
    setActiveFeeds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const showPicker = isSuperAdmin && institutions.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Calendar</h1>
        {showPicker && (
          <div className="max-w-xs">
            <Select
              value={selectedInstitution ?? 'all'}
              onValueChange={(v) => setSelectedInstitution(v === 'all' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Filter by institution..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FEEDS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={activeFeeds.includes(f.key) ? 'default' : 'outline'}
            onClick={() => toggleFeed(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        <div className="rounded-lg border p-2" style={{ height: 680 }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={currentView}
            date={currentDate}
            onNavigate={(d) => setCurrentDate(d)}
            onView={(v) => setCurrentView(v)}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            eventPropGetter={eventStyleGetter}
            popup
            style={{ height: '100%' }}
          />
        </div>
        <aside className="space-y-3">
          <div className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold">Legend</h2>
            {legend.length === 0 && <p className="text-xs text-muted-foreground">No items in view.</p>}
            <ul className="space-y-1">
              {legend.map(([name, color]) => (
                <li key={name} className="flex items-center gap-2 text-xs">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  {name}
                </li>
              ))}
            </ul>
          </div>
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        </aside>
      </div>
    </div>
  );
}

function feedKeyFor(it: CalendarItem): string {
  if (it.source_module === 'global') return 'global_entries';
  if (it.source_module === 'academic') return 'academic_holidays';
  if (it.source_module === 'hr') return 'hr_public_holidays';
  return it.source_module;
}
```

> Confirm `useInstitutionsWithAccess` returns `{ institutions: {id, name}[] }` (it does per the access-hook). Confirm the shadcn `Select`, `Button`, `Badge` import paths match your repo (`@/components/ui/*`). If `Badge` is unused after your edits, remove the import to keep diagnostics clean.

- [ ] **Step 3: Typecheck** both files (`mcp__ide__getDiagnostics`). Expected: no errors.

- [ ] **Step 4: Browser smoke (manual)**

Run `npm run dev`, log in as a **super-admin**, visit `/calendar`. Confirm: the page renders the month grid; the "All Institutions" picker shows; switching institution refetches; academic/HR holidays appear if any exist in the window. Then create a quick common holiday via SQL and confirm it appears for "All Institutions":
```sql
INSERT INTO public.calendar_entries (kind, title, start_at, end_at, scope_institution_ids, category_id)
VALUES ('holiday','__smoke Republic Day__', date_trunc('month', now()), date_trunc('month', now()),
        NULL, (SELECT id FROM public.calendar_categories WHERE slug='public-holiday'));
```
(Delete it after: `DELETE FROM public.calendar_entries WHERE title='__smoke Republic Day__';`.)

- [ ] **Step 5: Commit**
```bash
git add "app/(routes)/calendar/page.tsx" "app/(routes)/calendar/_components/calendar-view.tsx"
git commit -m "feat(calendar): unified calendar grid page with institution picker + feed chips + legend"
```

---

## Task 9: Common holidays/events admin (`/calendar/holidays`)

**Files:**
- Create: `app/(routes)/calendar/holidays/page.tsx`
- Create: `app/(routes)/calendar/holidays/_components/holidays-admin.tsx`

**Interfaces:**
- Consumes: `useCalendarEntries`, `useCalendarCategories`, `useCreateCalendarEntry`, `useUpdateCalendarEntry`, `useDeleteCalendarEntry` (Task 6); `useInstitutionsWithAccess`; `usePermissions`; shadcn `Dialog`/`Table`/form primitives.
- Produces: the rendered admin table + create/edit dialog.

> **Phase-1 simplification (deliberate):** this admin uses a client-side table (React Query + shadcn `Table`) rather than the server-paginated `@/components/data-table/data-table`, because `calendar_entries` is small and the advanced DataTable's `fetchDataFn` contract is not needed here. Swapping to the advanced DataTable is a later, optional refinement.

- [ ] **Step 1: Create the server page shell `app/(routes)/calendar/holidays/page.tsx`**

```tsx
import { HolidaysAdmin } from './_components/holidays-admin';

export const metadata = { title: 'Calendar · Holidays' };

export default function CalendarHolidaysPage() {
  return (
    <div className="p-4 md:p-6">
      <HolidaysAdmin />
    </div>
  );
}
```

- [ ] **Step 2: Create the client admin `app/(routes)/calendar/holidays/_components/holidays-admin.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import moment from 'moment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useCalendarEntries, useCalendarCategories,
  useCreateCalendarEntry, useUpdateCalendarEntry, useDeleteCalendarEntry,
} from '@/hooks/calendar/use-calendar';
import { getErrorMessage } from '@/lib/utils';
import type { CalendarEntry, CalendarEntryKind } from '@/types/calendar';

interface FormState {
  id?: string;
  kind: CalendarEntryKind;
  title: string;
  description: string;
  category_id: string;
  start_date: string;
  end_date: string;
  blocks_attendance: boolean;
  scope: 'all' | 'specific';
  scope_institution_ids: string[];
}

const EMPTY: FormState = {
  kind: 'holiday', title: '', description: '', category_id: '',
  start_date: moment().format('YYYY-MM-DD'), end_date: moment().format('YYYY-MM-DD'),
  blocks_attendance: true, scope: 'all', scope_institution_ids: [],
};

export function HolidaysAdmin() {
  const { toast } = useToast();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('calendar.holidays', 'manage');

  const [search, setSearch] = useState('');
  const { data: list, isLoading } = useCalendarEntries({ search });
  const { data: categories = [] } = useCalendarCategories();
  const { institutions } = useInstitutionsWithAccess({ isActive: true, entityType: 'all' });

  const create = useCreateCalendarEntry();
  const update = useUpdateCalendarEntry();
  const remove = useDeleteCalendarEntry();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const entries = list?.data ?? [];

  const openCreate = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (e: CalendarEntry) => {
    setForm({
      id: e.id, kind: e.kind, title: e.title, description: e.description ?? '',
      category_id: e.category_id ?? '',
      start_date: moment(e.start_at).format('YYYY-MM-DD'),
      end_date: moment(e.end_at).format('YYYY-MM-DD'),
      blocks_attendance: e.blocks_attendance,
      scope: e.scope_institution_ids && e.scope_institution_ids.length ? 'specific' : 'all',
      scope_institution_ids: e.scope_institution_ids ?? [],
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    const payload = {
      kind: form.kind,
      title: form.title.trim(),
      description: form.description || null,
      category_id: form.category_id || null,
      start_at: moment(form.start_date).startOf('day').toISOString(),
      end_at: moment(form.end_date).endOf('day').toISOString(),
      all_day: true,
      blocks_attendance: form.kind === 'holiday' ? form.blocks_attendance : false,
      scope_institution_ids: form.scope === 'all' ? null : form.scope_institution_ids,
    };
    try {
      if (form.id) await update.mutateAsync({ id: form.id, updates: payload });
      else await create.mutateAsync(payload);
      toast({ title: form.id ? 'Entry updated' : 'Entry created' });
      setOpen(false);
    } catch (err) {
      toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const del = async (e: CalendarEntry) => {
    try {
      await remove.mutateAsync(e.id);
      toast({ title: 'Entry deleted' });
    } catch (err) {
      toast({ title: 'Delete failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const scopeLabel = (e: CalendarEntry) =>
    e.scope_institution_ids && e.scope_institution_ids.length
      ? `${e.scope_institution_ids.length} institution(s)`
      : 'All institutions';

  const toggleInstitution = (id: string) =>
    setForm((f) => ({
      ...f,
      scope_institution_ids: f.scope_institution_ids.includes(id)
        ? f.scope_institution_ids.filter((x) => x !== id)
        : [...f.scope_institution_ids, id],
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Common Holidays &amp; Events</h1>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openCreate}>New entry</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? 'Edit' : 'New'} entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Kind</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as CalendarEntryKind }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start date</Label>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>End date</Label>
                    <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v as 'all' | 'specific' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All institutions (common)</SelectItem>
                      <SelectItem value="specific">Specific institutions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.scope === 'specific' && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                    {institutions.map((inst) => (
                      <label key={inst.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.scope_institution_ids.includes(inst.id)}
                          onChange={() => toggleInstitution(inst.id)}
                        />
                        {inst.name}
                      </label>
                    ))}
                  </div>
                )}
                {form.kind === 'holiday' && (
                  <div className="flex items-center justify-between">
                    <Label>Blocks attendance</Label>
                    <Switch checked={form.blocks_attendance} onCheckedChange={(v) => setForm((f) => ({ ...f, blocks_attendance: v }))} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={create.isPending || update.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Input placeholder="Search title/description…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Blocks attendance</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>}
            {!isLoading && entries.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No entries.</TableCell></TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.title}</TableCell>
                <TableCell className="capitalize">{e.kind}</TableCell>
                <TableCell>{moment(e.start_at).format('DD MMM YYYY')} – {moment(e.end_at).format('DD MMM YYYY')}</TableCell>
                <TableCell>{scopeLabel(e)}</TableCell>
                <TableCell>{e.kind === 'holiday' ? (e.blocks_attendance ? 'Yes' : 'No') : '—'}</TableCell>
                {canManage && (
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(e)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => del(e)}>Delete</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

> Confirm the toast hook import path (`@/components/ui/use-toast` vs `@/hooks/use-toast`) by checking an existing page; the repo has a toast migrator skill, so match whatever the neighbors use. Confirm `Switch`, `Textarea`, `Label`, `Dialog`, `Table` exist under `@/components/ui/`.

- [ ] **Step 3: Typecheck** both files (`mcp__ide__getDiagnostics`). Expected: no errors.

- [ ] **Step 4: Browser smoke (manual)**

As super-admin, visit `/calendar/holidays`. Create a **common** holiday (scope = All institutions, blocks attendance ON). Confirm it appears in the table, then visit `/calendar` and confirm it renders for "All Institutions". Edit it to a **specific** institution and confirm the scope label updates. Delete it.

- [ ] **Step 5: Commit**
```bash
git add "app/(routes)/calendar/holidays/page.tsx" "app/(routes)/calendar/holidays/_components/holidays-admin.tsx"
git commit -m "feat(calendar): common holidays/events admin (table + create/edit dialog)"
```

---

## Task 10: Final verification (gates + cross-role smoke)

**Files:** none (verification only).

- [ ] **Step 1: Run the full nav/permission gate set**

Run: `npm run gen:routes && npm run check:menus`
(Also `npm run check:sidebar` and `npm run check:reachability` if those are separate scripts in `package.json`.)
Expected: all pass. If `check:reachability` reports `/calendar/holidays` or `/calendar/settings` as unreachable, that's expected for admin-only leaf routes reached via in-page links; confirm it's within the `--max-unreachable` budget rather than a hard failure.

- [ ] **Step 2: Typecheck the whole touched set**

Run `mcp__ide__getDiagnostics` on every created/modified TS/TSX file. Expected: no new errors.

- [ ] **Step 3: Non-super-admin smoke (the silent-empty-state check)**

Log in as a **single-institution, non-admin** role that has `calendar.view` (granted broadly in Task 7). Confirm:
- `/calendar` renders and shows that institution's holidays + common holidays (NO institution picker — it's hidden for non-super-admins).
- `/calendar/holidays` is **blocked** by the route guard (no `calendar.holidays.manage`) → redirected/unauthorized.
- The grid does NOT show any other institution's data.

- [ ] **Step 4: Attendance regression check**

Pick an institution with an existing `institution_leaves` approved holiday and confirm `is_date_blocked_by_leave` still returns `is_blocked = true` for that date (Task 3 was additive). Then confirm a common `calendar_entries` holiday with `blocks_attendance = true` also blocks, and one with `blocks_attendance = false` does NOT.

- [ ] **Step 5: Final commit (if any setup-mirror files were updated late)**
```bash
git add -A
git commit -m "chore(calendar): finalize Phase 1 verification + setup mirrors" || echo "nothing to commit"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** tables (Task 1) ↔ spec §5; resolver + feed gating (Task 2) ↔ §6; attendance toggle/integration (Task 3) ↔ §10 + D5; types (Task 4) ↔ §5 note; service/hooks (Tasks 5–6) ↔ §4; RBAC + nav + guard (Task 7) ↔ §7; grid (Task 8) + holidays admin (Task 9) ↔ §9; verification (Task 10) ↔ §12 gates. Person-level leave, events/meetings aggregation, settings UI, and Google sync are **out of Phase 1** by design (spec §11 Phases 2–5) — not gaps.
- **Placeholder scan:** the only deferred specifics are explicit, justified runtime confirmations (live `hr_calc_leave_days` body in Task 3; `hr_public_holidays` version column name in Task 2; toast import path in Task 9) — each with a concrete fallback. No "TBD/handle edge cases/add validation" placeholders.
- **Type consistency:** `CalendarItem`/`CalendarEntry`/DTO field names match across Tasks 4–9; the RPC param names (`p_institution_ids`, `p_start`, `p_end`, `p_feeds`, `p_kinds`) match between Task 2 (SQL) and Task 5 (service); `scope_institution_ids` NULL-vs-array handling is consistent in SQL, service, and form.
