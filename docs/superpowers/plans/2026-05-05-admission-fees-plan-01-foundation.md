# Admission Fees — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Roadmap:** [`2026-05-05-admission-fees-roadmap.md`](./2026-05-05-admission-fees-roadmap.md)
**Spec:** [`docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)

**Goal:** Land the database foundation (lookup tables, shadow-FK columns, feature-flag scaffolding, seeds, backfill, RLS, service layer) that every subsequent plan depends on. **No UI in this plan** — that comes in Plan 2.

**Architecture:** Three new global/scoped lookup tables (`quotas`, `community_categories`, `accommodation_types`); shadow-FK columns added to `learners_profiles` and `admission_leads` alongside the existing TEXT columns (gradual cutover per the project's `admission_year` precedent); a new `admission_settings_per_institution` table that hosts the v1 feature flag. Curated seed data lands canonical quota and community values; a backfill migration matches observed TEXT to FK identity and writes a `data_quality_review` row for any unmatched value. Service layer exposes CRUD operations consumed by Plan 2's UI.

**Tech Stack:** Supabase (PostgreSQL 15) for schema + RLS; TypeScript service layer in `lib/services/admission/`; types in `types/admission.ts`. No UI in this plan.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260505100001_create_lookup_tables_quotas_communities_accommodations.sql` | DDL for `quotas`, `community_categories`, `accommodation_types` |
| `supabase/migrations/20260505100002_add_shadow_fk_columns_learners_admission_leads.sql` | Adds `quota_id`, `community_category_id`, `accommodation_type_id`, `legacy_fee_mode` FK columns |
| `supabase/migrations/20260505100003_create_admission_settings_per_institution.sql` | DDL for `admission_settings_per_institution` (feature flag home) |
| `supabase/migrations/20260505100004_seed_lookup_tables_canonical.sql` | Inserts curated canonical quota + community values |
| `supabase/migrations/20260505100005_backfill_shadow_fk_from_text.sql` | Matches existing TEXT values to FK; writes `data_quality_review` rows for misses |
| `supabase/migrations/20260505100006_lookup_tables_rls_policies.sql` | RLS policies for the three lookup tables + settings table |
| `lib/services/admission/lookup-service.ts` | List/get/create/update/archive across all three lookup tables |
| `lib/services/admission/admission-settings-service.ts` | Read/upsert feature flag + required-docs config per institution |

### Modified files

| Path | What changes |
|---|---|
| `supabase/setup/01_tables.sql` | Append new table definitions (matches each migration) |
| `supabase/setup/03_policies.sql` | Append RLS policies for the new tables |
| `types/admission.ts` | Add `Quota`, `CommunityCategory`, `AccommodationType`, `AdmissionSettingsPerInstitution`, related Input types |

---

## Pre-flight checks

Before starting: confirm you can apply migrations via the Supabase MCP server (`mcp__supabase__apply_migration`) and that the `data_quality_review` table already exists in the database.

```sql
-- Run this once to verify the data_quality_review table is available.
-- If not present, the backfill task (Task 5) will create a stub instead.
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'data_quality_review'
) AS has_dqr_table;
```

If `has_dqr_table = false`, Task 5 will inline-create a minimal `data_quality_review` table; otherwise the backfill writes into the existing one.

---

## Task 1: Lookup tables schema migration

**Files:**
- Create: `supabase/migrations/20260505100001_create_lookup_tables_quotas_communities_accommodations.sql`
- Modify: `supabase/setup/01_tables.sql` (append after section that defines admission tables)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260505100001_create_lookup_tables_quotas_communities_accommodations.sql` with exactly this content:

```sql
-- ============================================================================
-- 20260505100001 — Create lookup tables (quotas, community_categories,
-- accommodation_types) for the admission fee structure module
-- ============================================================================
-- See: docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md §6.1
-- See: docs/superpowers/plans/2026-05-05-admission-fees-plan-01-foundation.md Task 1
--
-- Two are global (quotas, community_categories), one is institution-scoped
-- (accommodation_types).
-- ============================================================================

-- Global lookup: quotas
CREATE TABLE IF NOT EXISTS public.quotas (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL UNIQUE,
    name          text NOT NULL,
    sort_order    integer NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_quotas_active_sort
    ON public.quotas (is_active, sort_order);

-- Global lookup: community_categories
CREATE TABLE IF NOT EXISTS public.community_categories (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL UNIQUE,
    name          text NOT NULL,
    sort_order    integer NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_community_categories_active_sort
    ON public.community_categories (is_active, sort_order);

-- Institution-scoped lookup: accommodation_types
CREATE TABLE IF NOT EXISTS public.accommodation_types (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    code            text NOT NULL,
    name            text NOT NULL,
    sort_order      integer NOT NULL DEFAULT 0,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS ix_accommodation_types_institution_active
    ON public.accommodation_types (institution_id, is_active, sort_order);

-- updated_at maintenance triggers
CREATE OR REPLACE FUNCTION public._touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotas_touch ON public.quotas;
CREATE TRIGGER trg_quotas_touch
    BEFORE UPDATE ON public.quotas
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_community_categories_touch ON public.community_categories;
CREATE TRIGGER trg_community_categories_touch
    BEFORE UPDATE ON public.community_categories
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_accommodation_types_touch ON public.accommodation_types;
CREATE TRIGGER trg_accommodation_types_touch
    BEFORE UPDATE ON public.accommodation_types
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
```

- [ ] **Step 2: Append the same DDL to `supabase/setup/01_tables.sql`**

Open `supabase/setup/01_tables.sql`. Find a sensible insertion point — search for the marker comment that introduces admission-related lookup tables (e.g. `admission_years` definition near line 2045 of the existing file) and append after the closing of that section. Paste the same `CREATE TABLE` blocks from Step 1 (omit the trigger function `_touch_updated_at` if it already exists in the setup file — check with `grep -n "_touch_updated_at" supabase/setup/01_tables.sql` first).

- [ ] **Step 3: Apply the migration**

Use the Supabase MCP tool:

```
mcp__supabase__apply_migration with:
  name: "20260505100001_create_lookup_tables"
  query: <paste the entire migration file contents from Step 1>
```

- [ ] **Step 4: Verify schema**

Run this verification query via `mcp__supabase__execute_sql`:

```sql
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name=t.table_name) AS column_count
FROM (VALUES ('quotas'), ('community_categories'), ('accommodation_types')) AS t(table_name)
WHERE EXISTS (
    SELECT 1 FROM information_schema.tables it
     WHERE it.table_schema='public' AND it.table_name=t.table_name
);
```

Expected output: 3 rows, with `column_count` of 9 for `quotas` and `community_categories` and 11 for `accommodation_types` (the institution-scoped one has institution_id + the unique index uses 2 cols). If any row missing, fix migration and re-apply.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260505100001_create_lookup_tables_quotas_communities_accommodations.sql \
        supabase/setup/01_tables.sql
git commit -m "feat(admission-fees): create lookup tables (quotas, community_categories, accommodation_types)

Foundation for the admission fee structure module — three lookup tables
provide stable identity for the matrix lookup. Global scope for quotas and
community_categories; institution-scoped for accommodation_types.

Spec: docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md §6.1
Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-01-foundation.md Task 1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shadow-FK columns + `legacy_fee_mode` flag migration

**Files:**
- Create: `supabase/migrations/20260505100002_add_shadow_fk_columns_learners_admission_leads.sql`
- Modify: `supabase/setup/01_tables.sql` (append ALTER TABLE block)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260505100002_add_shadow_fk_columns_learners_admission_leads.sql` with exactly this content:

```sql
-- ============================================================================
-- 20260505100002 — Add shadow-FK columns to learners_profiles and admission_leads
-- ============================================================================
-- Adds quota_id, community_category_id, accommodation_type_id alongside the
-- existing TEXT columns (gradual cutover per the admission_year_id precedent).
-- Also adds legacy_fee_mode flag — defaults to true so all existing rows are
-- treated as legacy until the per-institution feature flag flips ON.
-- ============================================================================

ALTER TABLE public.learners_profiles
    ADD COLUMN IF NOT EXISTS quota_id              uuid REFERENCES public.quotas(id),
    ADD COLUMN IF NOT EXISTS community_category_id uuid REFERENCES public.community_categories(id),
    ADD COLUMN IF NOT EXISTS accommodation_type_id uuid REFERENCES public.accommodation_types(id),
    ADD COLUMN IF NOT EXISTS legacy_fee_mode       boolean NOT NULL DEFAULT true;

ALTER TABLE public.admission_leads
    ADD COLUMN IF NOT EXISTS quota_id              uuid REFERENCES public.quotas(id),
    ADD COLUMN IF NOT EXISTS community_category_id uuid REFERENCES public.community_categories(id),
    ADD COLUMN IF NOT EXISTS accommodation_type_id uuid REFERENCES public.accommodation_types(id);

-- Indexes to support matrix lookup
CREATE INDEX IF NOT EXISTS ix_learners_profiles_matrix_full
    ON public.learners_profiles
       (institution_id, degree_id, department_id, program_id,
        quota_id, community_category_id, accommodation_type_id, admission_year_id)
    WHERE legacy_fee_mode = false;

CREATE INDEX IF NOT EXISTS ix_admission_leads_shadow_fks
    ON public.admission_leads
       (quota_id, community_category_id, accommodation_type_id);
```

- [ ] **Step 2: Append same ALTER TABLEs to `supabase/setup/01_tables.sql`**

Append after the existing `learners_profiles` and `admission_leads` table definitions in the setup file. Use the same `ADD COLUMN IF NOT EXISTS` form so re-running `01_tables.sql` is idempotent.

- [ ] **Step 3: Apply the migration**

```
mcp__supabase__apply_migration with:
  name: "20260505100002_shadow_fk_columns"
  query: <migration file from Step 1>
```

- [ ] **Step 4: Verify columns**

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'learners_profiles'
         AND column_name IN ('quota_id','community_category_id','accommodation_type_id','legacy_fee_mode'))
     OR (table_name = 'admission_leads'
         AND column_name IN ('quota_id','community_category_id','accommodation_type_id')))
 ORDER BY table_name, column_name;
```

Expected: 7 rows total. `legacy_fee_mode` has `is_nullable = NO` and `column_default = true`. All other new columns are nullable (allows backfill via Task 5).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260505100002_add_shadow_fk_columns_learners_admission_leads.sql \
        supabase/setup/01_tables.sql
git commit -m "feat(admission-fees): add shadow-FK columns + legacy_fee_mode flag

Adds quota_id / community_category_id / accommodation_type_id FK columns
to learners_profiles and admission_leads, alongside existing TEXT columns.
Also introduces legacy_fee_mode (default true) — flipped to false during
per-institution adoption flow in Plan 6.

Spec: §6.1
Plan: Task 2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `admission_settings_per_institution` table migration

**Files:**
- Create: `supabase/migrations/20260505100003_create_admission_settings_per_institution.sql`
- Modify: `supabase/setup/01_tables.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- 20260505100003 — Create admission_settings_per_institution table
-- ============================================================================
-- Hosts the v1 feature flag (use_fee_structures), the required-documents
-- list for the status='account' transition, and dialog-enabled toggles.
-- One row per institution. Defaults to OFF for all institutions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_settings_per_institution (
    id                                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id                              uuid NOT NULL UNIQUE REFERENCES public.institutions(id) ON DELETE CASCADE,
    use_fee_structures                          boolean NOT NULL DEFAULT false,
    required_documents_for_account_transition   jsonb   NOT NULL DEFAULT '["pan","aadhaar","parent_id","agreement_form"]'::jsonb,
    pre_submit_dialog_enabled                   boolean NOT NULL DEFAULT true,
    status_change_dialog_enabled                boolean NOT NULL DEFAULT true,
    created_at                                  timestamptz NOT NULL DEFAULT now(),
    updated_at                                  timestamptz NOT NULL DEFAULT now(),
    created_by                                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by                                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_admission_settings_touch ON public.admission_settings_per_institution;
CREATE TRIGGER trg_admission_settings_touch
    BEFORE UPDATE ON public.admission_settings_per_institution
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- One row per institution, auto-created with defaults
INSERT INTO public.admission_settings_per_institution (institution_id)
SELECT id FROM public.institutions
ON CONFLICT (institution_id) DO NOTHING;
```

- [ ] **Step 2: Append to `supabase/setup/01_tables.sql`**

Append the `CREATE TABLE`, the trigger, and a note that the seeding `INSERT ... ON CONFLICT` ran via the migration (don't re-run on every setup application).

- [ ] **Step 3: Apply migration**

```
mcp__supabase__apply_migration with:
  name: "20260505100003_admission_settings_per_institution"
  query: <migration file from Step 1>
```

- [ ] **Step 4: Verify settings rows present**

```sql
SELECT count(*) AS settings_rows,
       (SELECT count(*) FROM public.institutions) AS institution_count
  FROM public.admission_settings_per_institution;
```

Expected: `settings_rows = institution_count`. Every institution has exactly one settings row, all with `use_fee_structures = false`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260505100003_create_admission_settings_per_institution.sql \
        supabase/setup/01_tables.sql
git commit -m "feat(admission-fees): create admission_settings_per_institution

Per-institution feature flag scaffolding. use_fee_structures defaults to false;
flipped to true in Plan 6 once an institution's fee structures are configured.
Seeds one row per existing institution with safe defaults.

Spec: §6.6
Plan: Task 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Seed canonical lookup values

**Files:**
- Create: `supabase/migrations/20260505100004_seed_lookup_tables_canonical.sql`

- [ ] **Step 1: Write the migration file**

Curated canonical lists chosen for the Tamil Nadu / Indian higher-education context. Add or remove values as your institutions need; these are seeds, not constraints.

```sql
-- ============================================================================
-- 20260505100004 — Seed canonical quotas + community_categories
-- ============================================================================
-- accommodation_types are institution-scoped — admin seeds those per
-- institution from Plan 2's lookup admin UI. This migration handles only the
-- two global tables.
-- ============================================================================

INSERT INTO public.quotas (code, name, sort_order) VALUES
    ('government',          'Government Quota',           10),
    ('management',          'Management Quota',           20),
    ('nri',                 'NRI Quota',                  30),
    ('community',           'Community Quota',            40),
    ('sports',              'Sports Quota',               50),
    ('physically_disabled', 'Physically Disabled Quota',  60),
    ('staff_ward',          'Staff Ward Quota',           70),
    ('lateral_entry',       'Lateral Entry Quota',        80)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.community_categories (code, name, sort_order) VALUES
    ('oc',          'OC',                       10),
    ('bc',          'BC',                       20),
    ('bcm',         'BCM (Backward Class Muslim)', 30),
    ('mbc',         'MBC',                      40),
    ('sc',          'SC',                       50),
    ('sca',         'SCA',                      60),
    ('st',          'ST',                       70),
    ('dnt',         'DNT (Denotified Tribe)',   80),
    ('not_applicable', 'Not Applicable',        99)
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Apply migration**

```
mcp__supabase__apply_migration with:
  name: "20260505100004_seed_lookup_tables"
  query: <migration file from Step 1>
```

- [ ] **Step 3: Verify seed rows present**

```sql
SELECT 'quotas' AS table_name, count(*) AS row_count FROM public.quotas
UNION ALL
SELECT 'community_categories', count(*) FROM public.community_categories;
```

Expected: `quotas = 8`, `community_categories = 9`. If any institution requires additional canonical values, add them in a follow-up migration; do not edit this file after commit.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260505100004_seed_lookup_tables_canonical.sql
git commit -m "feat(admission-fees): seed canonical quotas + community_categories

Curated TN / Indian higher-ed values: 8 quotas, 9 community categories.
accommodation_types are institution-scoped and seeded by admin in Plan 2.

Spec: §12.1 Phase 2 — lookup-table backfill
Plan: Task 4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Backfill shadow-FK columns from observed TEXT

**Files:**
- Create: `supabase/migrations/20260505100005_backfill_shadow_fk_from_text.sql`

This task matches the existing TEXT values in `learners_profiles.quota`, `community`, `accommodation_type` (and the same on `admission_leads`) to the seeded FK rows. Unmatched values surface in `data_quality_review` for admin to map.

- [ ] **Step 1: Verify or create `data_quality_review` table**

Run the pre-flight check from the top of this plan. If `has_dqr_table = false`, prepend the following block to your migration file (otherwise skip it):

```sql
-- Inline-create minimal data_quality_review if it doesn't exist
CREATE TABLE IF NOT EXISTS public.data_quality_review (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name   text NOT NULL,
    column_name  text NOT NULL,
    observed_value text NOT NULL,
    occurrence_count integer NOT NULL DEFAULT 1,
    review_status text NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending','mapped','ignored')),
    mapped_to_id uuid,
    review_notes text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (table_name, column_name, observed_value)
);
```

- [ ] **Step 2: Write the backfill migration**

Create `supabase/migrations/20260505100005_backfill_shadow_fk_from_text.sql`. The case-mapping CTEs use lowercase + trim normalization to forgive minor entry inconsistencies. **For accommodation_types**: this migration creates a small per-institution starter set (`hostel`, `dayscholar`, `pg`) and maps observed TEXT to those — admins can edit/extend in Plan 2.

```sql
-- ============================================================================
-- 20260505100005 — Backfill shadow-FK columns from observed TEXT
-- ============================================================================
-- For each row in learners_profiles / admission_leads with a non-null TEXT
-- value but null FK, find the canonical match by lower(trim(text)) = code OR
-- name. On miss, insert a data_quality_review row.
-- ============================================================================

-- ---------- 1. Seed institution-scoped accommodation_types starter set ----------
INSERT INTO public.accommodation_types (institution_id, code, name, sort_order)
SELECT i.id, t.code, t.name, t.sort_order
  FROM public.institutions i
 CROSS JOIN (VALUES
    ('hostel',       'Hostel',         10),
    ('dayscholar',   'Day Scholar',    20),
    ('pg',           'Paying Guest',   30),
    ('not_applicable','Not Applicable', 99)
 ) AS t(code, name, sort_order)
ON CONFLICT (institution_id, code) DO NOTHING;

-- ---------- 2. Backfill learners_profiles.quota_id ----------
UPDATE public.learners_profiles lp
   SET quota_id = q.id
  FROM public.quotas q
 WHERE lp.quota IS NOT NULL
   AND lp.quota_id IS NULL
   AND (
       lower(trim(lp.quota)) = lower(q.code)
    OR lower(trim(lp.quota)) = lower(q.name)
   );

-- ---------- 3. Backfill learners_profiles.community_category_id ----------
UPDATE public.learners_profiles lp
   SET community_category_id = c.id
  FROM public.community_categories c
 WHERE lp.community IS NOT NULL
   AND lp.community_category_id IS NULL
   AND (
       lower(trim(lp.community)) = lower(c.code)
    OR lower(trim(lp.community)) = lower(c.name)
   );

-- ---------- 4. Backfill learners_profiles.accommodation_type_id ----------
UPDATE public.learners_profiles lp
   SET accommodation_type_id = a.id
  FROM public.accommodation_types a
 WHERE lp.accommodation_type IS NOT NULL
   AND lp.accommodation_type_id IS NULL
   AND a.institution_id = lp.institution_id
   AND (
       lower(trim(lp.accommodation_type)) = lower(a.code)
    OR lower(trim(lp.accommodation_type)) = lower(a.name)
   );

-- ---------- 5. Repeat 2–4 for admission_leads ----------
UPDATE public.admission_leads al
   SET quota_id = q.id
  FROM public.quotas q
 WHERE al.quota IS NOT NULL
   AND al.quota_id IS NULL
   AND (
       lower(trim(al.quota)) = lower(q.code)
    OR lower(trim(al.quota)) = lower(q.name)
   );

UPDATE public.admission_leads al
   SET community_category_id = c.id
  FROM public.community_categories c
 WHERE al.community IS NOT NULL
   AND al.community_category_id IS NULL
   AND (
       lower(trim(al.community)) = lower(c.code)
    OR lower(trim(al.community)) = lower(c.name)
   );

UPDATE public.admission_leads al
   SET accommodation_type_id = a.id
  FROM public.accommodation_types a
 WHERE al.accommodation_type IS NOT NULL
   AND al.accommodation_type_id IS NULL
   AND a.institution_id = al.institution_id
   AND (
       lower(trim(al.accommodation_type)) = lower(a.code)
    OR lower(trim(al.accommodation_type)) = lower(a.name)
   );

-- ---------- 6. Surface unmatched values to data_quality_review ----------
INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'learners_profiles', 'quota', lp.quota, count(*)
  FROM public.learners_profiles lp
 WHERE lp.quota IS NOT NULL AND lp.quota_id IS NULL
 GROUP BY lp.quota
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'learners_profiles', 'community', lp.community, count(*)
  FROM public.learners_profiles lp
 WHERE lp.community IS NOT NULL AND lp.community_category_id IS NULL
 GROUP BY lp.community
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'learners_profiles', 'accommodation_type', lp.accommodation_type, count(*)
  FROM public.learners_profiles lp
 WHERE lp.accommodation_type IS NOT NULL AND lp.accommodation_type_id IS NULL
 GROUP BY lp.accommodation_type
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();

-- ---------- 7. data_quality_review for admission_leads ----------
INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'admission_leads', 'quota', al.quota, count(*)
  FROM public.admission_leads al
 WHERE al.quota IS NOT NULL AND al.quota_id IS NULL
 GROUP BY al.quota
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'admission_leads', 'community', al.community, count(*)
  FROM public.admission_leads al
 WHERE al.community IS NOT NULL AND al.community_category_id IS NULL
 GROUP BY al.community
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'admission_leads', 'accommodation_type', al.accommodation_type, count(*)
  FROM public.admission_leads al
 WHERE al.accommodation_type IS NOT NULL AND al.accommodation_type_id IS NULL
 GROUP BY al.accommodation_type
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();
```

- [ ] **Step 3: Apply migration**

```
mcp__supabase__apply_migration with:
  name: "20260505100005_backfill_shadow_fk"
  query: <migration file from Step 2>
```

- [ ] **Step 4: Verify backfill ratios**

```sql
SELECT 'learners_profiles.quota' AS field,
       count(*) FILTER (WHERE quota IS NOT NULL) AS text_count,
       count(*) FILTER (WHERE quota_id IS NOT NULL) AS fk_count,
       count(*) FILTER (WHERE quota IS NOT NULL AND quota_id IS NULL) AS unmatched
  FROM public.learners_profiles
UNION ALL
SELECT 'learners_profiles.community',
       count(*) FILTER (WHERE community IS NOT NULL),
       count(*) FILTER (WHERE community_category_id IS NOT NULL),
       count(*) FILTER (WHERE community IS NOT NULL AND community_category_id IS NULL)
  FROM public.learners_profiles
UNION ALL
SELECT 'learners_profiles.accommodation_type',
       count(*) FILTER (WHERE accommodation_type IS NOT NULL),
       count(*) FILTER (WHERE accommodation_type_id IS NOT NULL),
       count(*) FILTER (WHERE accommodation_type IS NOT NULL AND accommodation_type_id IS NULL)
  FROM public.learners_profiles;

SELECT * FROM public.data_quality_review
 WHERE review_status = 'pending'
 ORDER BY occurrence_count DESC LIMIT 50;
```

Expected: `unmatched + fk_count = text_count` for each row of the first query. Each unmatched value appears in `data_quality_review` with the right occurrence count. Document the unmatched-row counts in the commit message — they're useful baseline.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260505100005_backfill_shadow_fk_from_text.sql
git commit -m "feat(admission-fees): backfill shadow-FK columns from observed TEXT

Matches existing TEXT values to canonical FK identity via lower(trim(text)) =
code OR name. Unmatched values surface in data_quality_review for admin
mapping. Also seeds a starter set of accommodation_types per institution
(hostel, dayscholar, pg, not_applicable).

Spec: §12.1 Phase 2
Plan: Task 5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: RLS policies for lookup tables + settings

**Files:**
- Create: `supabase/migrations/20260505100006_lookup_tables_rls_policies.sql`
- Modify: `supabase/setup/03_policies.sql` (append)

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- 20260505100006 — RLS policies for lookup tables + admission_settings
-- ============================================================================
-- quotas, community_categories: global read for any authenticated user;
-- write only by users with admission_fees.manage permission.
-- accommodation_types: read scoped to institution (role_has_institution_access);
-- write requires admission_fees.manage AND institution access.
-- admission_settings_per_institution: read scoped to institution;
-- write requires admission.settings.manage.
-- ============================================================================

ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_settings_per_institution ENABLE ROW LEVEL SECURITY;

-- quotas — global read, gated write
DROP POLICY IF EXISTS quotas_read ON public.quotas;
CREATE POLICY quotas_read
    ON public.quotas FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS quotas_write ON public.quotas;
CREATE POLICY quotas_write
    ON public.quotas FOR ALL
    USING (public.user_has_permission('admission_fees.manage'))
    WITH CHECK (public.user_has_permission('admission_fees.manage'));

-- community_categories — same pattern
DROP POLICY IF EXISTS community_categories_read ON public.community_categories;
CREATE POLICY community_categories_read
    ON public.community_categories FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS community_categories_write ON public.community_categories;
CREATE POLICY community_categories_write
    ON public.community_categories FOR ALL
    USING (public.user_has_permission('admission_fees.manage'))
    WITH CHECK (public.user_has_permission('admission_fees.manage'));

-- accommodation_types — institution-scoped
DROP POLICY IF EXISTS accommodation_types_read ON public.accommodation_types;
CREATE POLICY accommodation_types_read
    ON public.accommodation_types FOR SELECT
    USING (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS accommodation_types_write ON public.accommodation_types;
CREATE POLICY accommodation_types_write
    ON public.accommodation_types FOR ALL
    USING (
        public.user_has_permission('admission_fees.manage')
        AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
        public.user_has_permission('admission_fees.manage')
        AND public.role_has_institution_access(institution_id)
    );

-- admission_settings_per_institution — institution-scoped
DROP POLICY IF EXISTS admission_settings_read ON public.admission_settings_per_institution;
CREATE POLICY admission_settings_read
    ON public.admission_settings_per_institution FOR SELECT
    USING (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS admission_settings_write ON public.admission_settings_per_institution;
CREATE POLICY admission_settings_write
    ON public.admission_settings_per_institution FOR ALL
    USING (
        public.user_has_permission('admission.settings.manage')
        AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
        public.user_has_permission('admission.settings.manage')
        AND public.role_has_institution_access(institution_id)
    );
```

- [ ] **Step 2: Append same policies to `supabase/setup/03_policies.sql`**

Append after the existing institution-scoped policies block. Keep `DROP POLICY IF EXISTS` form so re-running setup is safe.

- [ ] **Step 3: Apply migration**

```
mcp__supabase__apply_migration with:
  name: "20260505100006_lookup_rls_policies"
  query: <migration file from Step 1>
```

- [ ] **Step 4: Verify RLS active and policies present**

```sql
SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname='public'
   AND tablename IN ('quotas','community_categories','accommodation_types','admission_settings_per_institution');

SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('quotas','community_categories','accommodation_types','admission_settings_per_institution')
 ORDER BY tablename, policyname;
```

Expected: all four tables have `rowsecurity = true`. Each table has 2 policies (read + write/all).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260505100006_lookup_tables_rls_policies.sql \
        supabase/setup/03_policies.sql
git commit -m "feat(admission-fees): RLS policies for lookup tables + settings

quotas + community_categories: global read, write gated by admission_fees.manage.
accommodation_types: institution-scoped read + write.
admission_settings_per_institution: institution-scoped read,
write gated by admission.settings.manage + institution access.

Spec: §10.2
Plan: Task 6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Type definitions in `types/admission.ts`

**Files:**
- Modify: `types/admission.ts` (append)

- [ ] **Step 1: Read existing `types/admission.ts` to find a sensible append point**

Use `Read` tool. Append the new interfaces at the end of the file or after the existing lookup-related types if such a section exists.

- [ ] **Step 2: Append the type definitions**

```typescript
// ============================================================================
// Admission Fee Structure module — Foundation types
// ============================================================================
// Spec: docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md §6.1, §6.6
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-01-foundation.md Task 7

export interface Quota {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateQuotaInput = Pick<Quota, 'code' | 'name'> & Partial<Pick<Quota, 'sort_order' | 'is_active'>>;
export type UpdateQuotaInput = Partial<Pick<Quota, 'code' | 'name' | 'sort_order' | 'is_active'>>;

export interface CommunityCategory {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateCommunityCategoryInput = Pick<CommunityCategory, 'code' | 'name'> &
  Partial<Pick<CommunityCategory, 'sort_order' | 'is_active'>>;
export type UpdateCommunityCategoryInput = Partial<Pick<CommunityCategory, 'code' | 'name' | 'sort_order' | 'is_active'>>;

export interface AccommodationType {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateAccommodationTypeInput = Pick<AccommodationType, 'institution_id' | 'code' | 'name'> &
  Partial<Pick<AccommodationType, 'sort_order' | 'is_active'>>;
export type UpdateAccommodationTypeInput = Partial<
  Pick<AccommodationType, 'code' | 'name' | 'sort_order' | 'is_active'>
>;

export interface AdmissionSettingsPerInstitution {
  id: string;
  institution_id: string;
  use_fee_structures: boolean;
  required_documents_for_account_transition: string[];
  pre_submit_dialog_enabled: boolean;
  status_change_dialog_enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type UpsertAdmissionSettingsInput = Partial<
  Pick<
    AdmissionSettingsPerInstitution,
    | 'use_fee_structures'
    | 'required_documents_for_account_transition'
    | 'pre_submit_dialog_enabled'
    | 'status_change_dialog_enabled'
  >
> & {
  institution_id: string;
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from project root:
```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: zero errors. If a name collision (e.g. `Quota` already defined elsewhere), prefix the new types with `AdmissionFee` (e.g. `AdmissionFeeQuota`) and update Tasks 8–9 references accordingly.

- [ ] **Step 4: Commit**

```bash
git add types/admission.ts
git commit -m "feat(admission-fees): add foundation types (Quota, CommunityCategory, AccommodationType, AdmissionSettingsPerInstitution)

Type definitions consumed by the lookup-service and admission-settings-service.

Spec: §6.1, §6.6
Plan: Task 7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `lookup-service.ts` — CRUD across all three lookup tables

**Files:**
- Create: `lib/services/admission/lookup-service.ts`

- [ ] **Step 1: Read an existing admission service for house-style reference**

Use `Read` on `lib/services/admission/admission-year-service.ts` (or `assignment-rules-service.ts` if shorter). Note:
- How they obtain the Supabase client (`createClientSupabaseClient()` singleton)
- Error handling pattern (every mutation destructures `{error}`)
- Method naming
- Return shape

- [ ] **Step 2: Write the lookup-service.ts file**

Create `lib/services/admission/lookup-service.ts` with the following content. Follow the project's existing house style for client creation — replace the `createClientSupabaseClient` import path if needed to match what the reference service uses.

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  Quota,
  CreateQuotaInput,
  UpdateQuotaInput,
  CommunityCategory,
  CreateCommunityCategoryInput,
  UpdateCommunityCategoryInput,
  AccommodationType,
  CreateAccommodationTypeInput,
  UpdateAccommodationTypeInput,
} from '@/types/admission';

/**
 * Read/write access to the three lookup tables that anchor the admission
 * fee-structure matrix: quotas (global), community_categories (global),
 * accommodation_types (institution-scoped).
 *
 * Every mutation destructures { error } and surfaces it — never silent.
 */
export class LookupService {
  // ---------------- quotas (global) ----------------

  static async listQuotas(activeOnly = true): Promise<Quota[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('quotas')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getQuota(id: string): Promise<Quota | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.from('quotas').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  static async createQuota(input: CreateQuotaInput): Promise<Quota> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('quotas')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateQuota(id: string, input: UpdateQuotaInput): Promise<Quota> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('quotas')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async archiveQuota(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('quotas').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  }

  // ---------------- community_categories (global) ----------------

  static async listCommunityCategories(activeOnly = true): Promise<CommunityCategory[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('community_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getCommunityCategory(id: string): Promise<CommunityCategory | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('community_categories')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async createCommunityCategory(input: CreateCommunityCategoryInput): Promise<CommunityCategory> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('community_categories')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateCommunityCategory(
    id: string,
    input: UpdateCommunityCategoryInput,
  ): Promise<CommunityCategory> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('community_categories')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async archiveCommunityCategory(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('community_categories')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }

  // ---------------- accommodation_types (institution-scoped) ----------------

  static async listAccommodationTypes(
    institutionId: string,
    activeOnly = true,
  ): Promise<AccommodationType[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('accommodation_types')
      .select('*')
      .eq('institution_id', institutionId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getAccommodationType(id: string): Promise<AccommodationType | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('accommodation_types')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async createAccommodationType(input: CreateAccommodationTypeInput): Promise<AccommodationType> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('accommodation_types')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateAccommodationType(
    id: string,
    input: UpdateAccommodationTypeInput,
  ): Promise<AccommodationType> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('accommodation_types')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async archiveAccommodationType(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('accommodation_types')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 3: Verify imports + TypeScript**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: zero errors. If `@/lib/supabase/client` import path is wrong (collision in your project), fix it to match what `assignment-rules-service.ts` uses.

- [ ] **Step 4: Smoke test (manual, optional but recommended)**

Open a Next.js dev console (or temporary script) and run:

```typescript
import { LookupService } from '@/lib/services/admission/lookup-service';
const quotas = await LookupService.listQuotas();
console.log('Active quotas:', quotas.length, quotas.map(q => q.code));
```

Expected: 8 active quotas (codes: government, management, nri, community, sports, physically_disabled, staff_ward, lateral_entry).

- [ ] **Step 5: Commit**

```bash
git add lib/services/admission/lookup-service.ts
git commit -m "feat(admission-fees): add LookupService for quotas, communities, accommodations

CRUD across the three lookup tables. Static class methods, all mutations
explicitly destructure { error } and surface failures.

Spec: §8.1
Plan: Task 8

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `admission-settings-service.ts` — feature flag + required docs

**Files:**
- Create: `lib/services/admission/admission-settings-service.ts`

- [ ] **Step 1: Write the service file**

Create `lib/services/admission/admission-settings-service.ts`:

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionSettingsPerInstitution,
  UpsertAdmissionSettingsInput,
} from '@/types/admission';

/**
 * Read/write access to admission_settings_per_institution. Hosts the v1
 * feature flag (use_fee_structures) and the required-documents list for the
 * status='account' transition.
 *
 * One row per institution, auto-created at migration time. This service only
 * READS or UPSERTS — never INSERT (rows already exist).
 */
export class AdmissionSettingsService {
  static async getByInstitution(
    institutionId: string,
  ): Promise<AdmissionSettingsPerInstitution | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_settings_per_institution')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async upsert(
    input: UpsertAdmissionSettingsInput,
  ): Promise<AdmissionSettingsPerInstitution> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_settings_per_institution')
      .upsert(input, { onConflict: 'institution_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  /** Convenience: is the feature flag ON for this institution? */
  static async isFeeStructuresEnabled(institutionId: string): Promise<boolean> {
    const row = await this.getByInstitution(institutionId);
    return row?.use_fee_structures ?? false;
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: zero errors.

- [ ] **Step 3: Smoke test (manual, optional)**

```typescript
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';
// Replace with a real institution UUID from your database
const institutionId = '<some-institution-uuid>';
const settings = await AdmissionSettingsService.getByInstitution(institutionId);
console.log('Feature flag ON?', settings?.use_fee_structures);
console.log('Required docs:', settings?.required_documents_for_account_transition);
```

Expected: `use_fee_structures = false`; required_documents = `["pan","aadhaar","parent_id","agreement_form"]`.

- [ ] **Step 4: Commit**

```bash
git add lib/services/admission/admission-settings-service.ts
git commit -m "feat(admission-fees): add AdmissionSettingsService for per-institution config

Read/upsert API for admission_settings_per_institution. Plus a convenience
isFeeStructuresEnabled(institutionId) used as the feature-flag gate by
downstream plans.

Spec: §6.6, §8.1
Plan: Task 9

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Update roadmap status + final integration check

**Files:**
- Modify: `docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md`

- [ ] **Step 1: Run a final cross-cutting verification**

```sql
-- 1. All three lookup tables present + RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname='public'
   AND tablename IN ('quotas','community_categories','accommodation_types','admission_settings_per_institution');

-- 2. Shadow-FK columns present on both target tables
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema='public'
   AND ((table_name='learners_profiles' AND column_name IN ('quota_id','community_category_id','accommodation_type_id','legacy_fee_mode'))
     OR (table_name='admission_leads' AND column_name IN ('quota_id','community_category_id','accommodation_type_id')))
 ORDER BY 1, 2;

-- 3. Seed rows present
SELECT 'quotas' AS t, count(*) FROM quotas
UNION ALL SELECT 'community_categories', count(*) FROM community_categories
UNION ALL SELECT 'accommodation_types', count(*) FROM accommodation_types
UNION ALL SELECT 'admission_settings_per_institution', count(*) FROM admission_settings_per_institution;

-- 4. Backfill ratios + unmatched count surfaced
SELECT count(*) AS pending_dqr_rows FROM data_quality_review WHERE review_status='pending';
```

Expected: all four tables present with RLS=true; 7 shadow-FK columns; 8 quotas + 9 community_categories + (4 × institution_count) accommodation_types + (1 × institution_count) settings rows; `pending_dqr_rows` ≥ 0 (any value is OK; it's a worklist for admin).

- [ ] **Step 2: Edit the roadmap to mark Plan 1 complete**

Open `docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md` and:

- Replace the Plan 1 row in the Status Tracker table:
  - `⬜ Not started` → `✅ Completed (YYYY-MM-DD)`
- Edit the "Plan 1 retrospective" section under "Retrospective Notes". Replace `_Not yet started._` with a 2-sentence retrospective. Example:
  > Foundation landed cleanly with all 6 migrations applied and 9 unit-of-work commits. data_quality_review surfaced N unmatched values (mostly capitalization variants) — admin to map before Plan 6 cutover. No surprises in service-layer house style.
- If anything in Plan 2's scope needs adjustment based on what was learned (e.g. unmatched values reveal you need an extra canonical seed), note it in the Plan 2 Summary block.

- [ ] **Step 3: Commit the roadmap update**

```bash
git add docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md
git commit -m "docs(admission-fees): mark Plan 1 (Foundation) complete

All schema, seeds, backfill, RLS, types, and service layer landed.
Roadmap status updated; retrospective added.

Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-01-foundation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand off to Plan 2**

Plan 1 is done. Open a fresh session (or continue in this one) and ask Claude to **write Plan 2** (Fee Structure module — matrix CRUD + builder UI + lookup admin UI). It will read the roadmap + spec + this completed plan and produce `2026-05-05-admission-fees-plan-02-fee-structure-module.md`.

---

## Plan-1 Spec Coverage Self-Review

| Spec section | Addressed by |
|---|---|
| §6.1 lookup tables (quotas, community_categories, accommodation_types) | Task 1, 4, 5, 6 |
| §6.1 shadow-FK columns + legacy_fee_mode | Task 2 |
| §6.6 admission_settings_per_institution | Task 3 |
| §10.2 RLS on new tables | Task 6 |
| §12.1 Phase 1 additive deploy | Tasks 1–6 |
| §12.1 Phase 2 lookup-table backfill + data_quality_review | Tasks 4, 5 |
| §16.1 service files (lookup-service, admission-settings-service) | Tasks 8, 9 |
| §16.1 type definitions | Task 7 |

**Not in this plan (deferred to later plans):**
- Fee structure tables + items (Plan 2)
- Adjustments table (Plan 3)
- Fee-change-events tables (Plan 5)
- Bill `superseded` state + `superseded_by_bill_id` (Plan 5)
- Credit balance + documents tables (Plan 4 / 5)
- All RPCs (Plans 3, 4, 5)
- All UI surfaces (Plans 2, 3, 4, 5)
- Activity logging events (registered as plans land — none in Plan 1)
- Permission keys (registered in role-management when consumers ship — none gated by Plan 1 itself; quotas/communities/accommodations write-gates use `admission_fees.manage` which lands with Plan 2)

---

## Open Items to Watch

- **Permission key `admission_fees.manage`** is referenced in RLS (Task 6) but not yet in the role-management catalogue. The lookup tables will have write-deny for everyone until Plan 2 registers the permission and assigns it. This is intentional — Plan 1 is read-mostly.
- **Permission key `admission.settings.manage`** in Task 6 RLS — same caveat. The settings rows are admin-managed via SQL until Plan 6 ships an admin UI.
- **`accommodation_types` per-institution starter set** seeded in Task 5 (hostel/dayscholar/pg/not_applicable) — institutions with different accommodation models should add custom rows via the lookup admin UI in Plan 2.
- **`createClientSupabaseClient` import path** in Tasks 8, 9 — verify the path matches your project's actual export. If different, update both tasks.
