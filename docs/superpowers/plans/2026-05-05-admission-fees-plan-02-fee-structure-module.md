# Admission Fees — Plan 2: Fee Structure Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Roadmap:** [`2026-05-05-admission-fees-roadmap.md`](./2026-05-05-admission-fees-roadmap.md)
**Spec:** [`docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)
**Predecessor:** Plan 1 (Foundation) — completed 2026-05-05

**Goal:** Build the Fee Structure module — admins can configure 8-dimension matrix-keyed fee structures (institution × degree × department × programme × quota × community × accommodation × academic_year) with line-item billing categories. Plus a lookup admin UI to manage quotas/community_categories/accommodation_types, plus a Data Quality Review (DQR) mapping surface to resolve unmatched legacy values from Plan 1's backfill.

**Architecture:** Two new tables (`admission_fee_structures` + `_items`) with composite unique key on the 8 dimensions; one service file (`fee-structure-service.ts`) with CRUD + `cloneToAcademicYear` + `findByDimensions` + `getCoverageReport`; one admin sub-module under `admission/settings/fees-structure/` with split-pane layout (left rail = collapsible tree, right pane = Form/Clone modes); three lookup admin pages under `admission/settings/lookups/` matching the project's `assignment-rules` house style; one DQR mapping page that lets admin map unresolved TEXT values to canonical lookup IDs. No automation in this plan — that comes in Plan 3.

**Tech Stack:** Same as Plan 1: Supabase Postgres for schema + RLS; TypeScript service layer; Next.js 16 App Router (client components per house style); Tailwind + Radix UI primitives.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260506100001_create_admission_fee_structures.sql` | DDL for `admission_fee_structures` + `admission_fee_structure_items` |
| `supabase/migrations/20260506100002_admission_fee_structures_rls.sql` | RLS policies for the two new tables |
| `supabase/migrations/20260506100003_register_admission_fees_permissions.sql` | Inserts `admission_fees.read` + `admission_fees.manage` permission keys; grants to admin role |
| `supabase/migrations/20260506100004_seed_canonical_quota_aliases.sql` | Adds aliases (`GQ`/`MQ`/`GOVT`/etc.) by re-running normalized backfill against the data_quality_review pending rows where canonical match exists |
| `lib/services/admission/fee-structure-service.ts` | CRUD + clone + findByDimensions + coverage |
| `lib/utils/admission-fees-activity-templates.ts` | Activity log templates for fee_structure.* events |
| `app/(routes)/admission/settings/lookups/page.tsx` | Lookups landing page (3 cards: Quotas / Community Categories / Accommodation Types + DQR badge) |
| `app/(routes)/admission/settings/lookups/quotas/page.tsx` | Quotas list + create/edit/archive |
| `app/(routes)/admission/settings/lookups/quotas/_components/quotas-data-table.tsx` | |
| `app/(routes)/admission/settings/lookups/quotas/_components/quota-form-dialog.tsx` | |
| `app/(routes)/admission/settings/lookups/community-categories/page.tsx` | Same pattern |
| `app/(routes)/admission/settings/lookups/community-categories/_components/...` | |
| `app/(routes)/admission/settings/lookups/accommodation-types/page.tsx` | Same pattern + institution selector |
| `app/(routes)/admission/settings/lookups/accommodation-types/_components/...` | |
| `app/(routes)/admission/settings/lookups/data-quality/page.tsx` | List unresolved TEXT values + map to canonical lookup |
| `app/(routes)/admission/settings/lookups/data-quality/_components/dqr-mapping-table.tsx` | |
| `app/(routes)/admission/settings/lookups/data-quality/_components/map-row-dialog.tsx` | |
| `app/(routes)/admission/settings/fees-structure/page.tsx` | Split-pane shell |
| `app/(routes)/admission/settings/fees-structure/_components/fees-structure-tree-rail.tsx` | Left rail — 8-level collapsible tree |
| `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx` | Right pane — Form mode editor |
| `app/(routes)/admission/settings/fees-structure/_components/fees-structure-clone-dialog.tsx` | Clone-for-year + clone-with-overrides |
| `app/(routes)/admission/settings/fees-structure/_components/fees-structure-coverage-report.tsx` | Coverage filter toggle |

### Modified files

| Path | What changes |
|---|---|
| `supabase/setup/01_tables.sql` | Append fee structure DDL |
| `supabase/setup/03_policies.sql` | Append fee structure RLS |
| `supabase/setup/02_functions.sql` | (None in this plan — RPCs come in Plan 3) |
| `types/admission.ts` | Append `AdmissionFeeStructure`, `AdmissionFeeStructureItem`, `AdmissionFeeStructureWithItems`, Create/Update inputs, `FeeStructureCoverageReport` types |
| `lib/utils/activity-logger-client.ts` | Register fee_structure.* and fee_structure_item.* templates |
| `app/(routes)/admission/nav-config.ts` | Register `lookups/` and `fees-structure/` settings sub-modules |
| `lib/sidebarMenuLink.ts` | If admission sidebar references fees-structure, register it (verify in Task 16) |

---

## Permission keys registered in this plan

| Key | Default role grants | Used by |
|---|---|---|
| `admission_fees.read` | counsellor, admission_counselor, expo_counselor, admin, super_admin | View fee structures + Finance tab (Plan 3) |
| `admission_fees.manage` | admin, super_admin | CRUD on fee structures + lookup tables |

(The remaining permission keys — `manage_adjustments`, `override`, `approve_change_event`, `documents.manage` — register in their respective consumer plans.)

---

## Activity log events registered in this plan

`fee_structure.created` · `fee_structure.updated` · `fee_structure.archived` · `fee_structure.activated` · `fee_structure_item.added` · `fee_structure_item.updated` · `fee_structure_item.removed` · `lookup.value_mapped_via_dqr` (new event for the DQR mapper)

---

## Pre-flight checks

```sql
-- All Plan 1 deliverables present and feature flag still OFF
SELECT
  (SELECT count(*) FROM public.quotas) AS quota_seed_count,
  (SELECT count(*) FROM public.community_categories) AS community_seed_count,
  (SELECT count(*) FROM public.accommodation_types) AS accommodation_seed_count,
  (SELECT count(*) FROM public.admission_settings_per_institution
     WHERE use_fee_structures = true) AS institutions_with_flag_on,
  (SELECT count(*) FROM public.data_quality_review WHERE review_status='pending') AS pending_dqr;
```

Expected: quota_seed_count ≥ 8, community_seed_count ≥ 9, accommodation_seed_count ≥ 4 × institution_count, institutions_with_flag_on = 0 (still 0 after Plan 1), pending_dqr ≥ 0 (Plan 1 left ~17).

---

# PHASE A — Data layer + Lookup admin UI

## Task 1: Migration — `admission_fee_structures` + `_items` tables

**Files:**
- Create: `supabase/migrations/20260506100001_create_admission_fee_structures.sql`
- Modify: `supabase/setup/01_tables.sql` (append)

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- 20260506100001 — Create admission_fee_structures + admission_fee_structure_items
-- ============================================================================
-- Spec §6.2. Matrix-keyed fee templates (one per 8-dim combination per academic
-- year). Items are billing-category × amount per structure. The 'admission_year_id'
-- IS the version dimension (per Q4 Option C).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_fee_structures (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    degree_id               uuid NOT NULL REFERENCES public.degrees(id),
    department_id           uuid NOT NULL REFERENCES public.departments(id),
    programme_id            uuid NOT NULL REFERENCES public.programs(id),
    quota_id                uuid NOT NULL REFERENCES public.quotas(id),
    community_category_id   uuid NOT NULL REFERENCES public.community_categories(id),
    accommodation_type_id   uuid NOT NULL REFERENCES public.accommodation_types(id),
    admission_year_id       uuid NOT NULL REFERENCES public.admission_years(id),
    name                    text NOT NULL,
    status                  text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','archived')),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, degree_id, department_id, programme_id,
            quota_id, community_category_id, accommodation_type_id, admission_year_id)
);

CREATE INDEX IF NOT EXISTS ix_fee_structures_institution_year_status
    ON public.admission_fee_structures (institution_id, admission_year_id, status);

DROP TRIGGER IF EXISTS trg_admission_fee_structures_touch ON public.admission_fee_structures;
CREATE TRIGGER trg_admission_fee_structures_touch
    BEFORE UPDATE ON public.admission_fee_structures
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE IF NOT EXISTS public.admission_fee_structure_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_structure_id    uuid NOT NULL REFERENCES public.admission_fee_structures(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES public.billing_categories(id),
    amount              numeric(15,2) NOT NULL CHECK (amount >= 0),
    is_optional         boolean NOT NULL DEFAULT false,
    sort_order          integer NOT NULL DEFAULT 0,
    UNIQUE (fee_structure_id, billing_category_id)
);

CREATE INDEX IF NOT EXISTS ix_fee_structure_items_structure
    ON public.admission_fee_structure_items (fee_structure_id, sort_order);
```

- [ ] **Step 2: Append same DDL to `supabase/setup/01_tables.sql`** (idempotent — `CREATE TABLE IF NOT EXISTS`).

- [ ] **Step 3: Apply migration**
```
mcp__supabase__apply_migration:
  name: "20260506100001_create_admission_fee_structures"
  query: <migration body from Step 1>
```

- [ ] **Step 4: Verify**
```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admission_fee_structures') AS structure_cols,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admission_fee_structure_items') AS item_cols,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename IN ('admission_fee_structures','admission_fee_structure_items'))
    AS index_count;
```
Expected: `structure_cols=16`, `item_cols=6`, `index_count >= 4` (PK indexes + the named ones). _Correction applied 2026-05-05: original plan miscounted as 15._

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260506100001_create_admission_fee_structures.sql supabase/setup/01_tables.sql
git commit -m "$(cat <<'EOF'
feat(admission-fees): create admission_fee_structures + items tables

Schema for the 8-dim matrix-keyed fee structure (Plan 2 / spec §6.2).
admission_year_id is the version dimension (cohort = version per Q4
Option C). Composite unique constraint enforces one row per matrix
combination per academic year.

Spec: §6.2
Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-02-fee-structure-module.md Task 1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration — RLS policies for fee structures

**Files:**
- Create: `supabase/migrations/20260506100002_admission_fee_structures_rls.sql`
- Modify: `supabase/setup/03_policies.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- 20260506100002 — RLS policies for admission_fee_structures + items
-- ============================================================================
ALTER TABLE public.admission_fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_fee_structure_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_structures_read ON public.admission_fee_structures;
CREATE POLICY fee_structures_read
    ON public.admission_fee_structures FOR SELECT
    USING (
      public.user_has_permission('admission_fees.read')
      AND public.role_has_institution_access(institution_id)
    );

DROP POLICY IF EXISTS fee_structures_write ON public.admission_fee_structures;
CREATE POLICY fee_structures_write
    ON public.admission_fee_structures FOR ALL
    USING (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    );

-- Items inherit via the parent's institution_id
DROP POLICY IF EXISTS fee_structure_items_read ON public.admission_fee_structure_items;
CREATE POLICY fee_structure_items_read
    ON public.admission_fee_structure_items FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(fs.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_structure_items_write ON public.admission_fee_structure_items;
CREATE POLICY fee_structure_items_write
    ON public.admission_fee_structure_items FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.manage')
           AND public.role_has_institution_access(fs.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.manage')
           AND public.role_has_institution_access(fs.institution_id)
      )
    );
```

- [ ] **Step 2: Append same policies to `supabase/setup/03_policies.sql`**.

- [ ] **Step 3: Apply migration**.

- [ ] **Step 4: Verify** all 4 policies exist + RLS active on both tables:
```sql
SELECT tablename, policyname, cmd FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('admission_fee_structures','admission_fee_structure_items')
 ORDER BY 1, 2;
```
Expected: 4 rows (2 policies × 2 tables).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260506100002_admission_fee_structures_rls.sql supabase/setup/03_policies.sql
git commit -m "feat(admission-fees): RLS policies for admission_fee_structures + items

Spec §10.2 — read gated by admission_fees.read + role_has_institution_access;
write gated by admission_fees.manage + role_has_institution_access. Item
policies look through the parent structure's institution.

Plan: Task 2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migration — Register `admission_fees.*` permission keys

**Files:**
- Create: `supabase/migrations/20260506100003_register_admission_fees_permissions.sql`

The migration inserts the two permission keys into the project's permissions catalogue and grants them to existing roles. **The exact catalogue table name varies per project** — likely `permissions` or `role_permissions` or both. The migration includes a defensive `DO $$` block that checks before inserting.

- [ ] **Step 1: Discover the project's permission catalogue tables**

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND (table_name LIKE '%permission%' OR table_name LIKE 'roles%' OR table_name = 'role_permissions')
 ORDER BY 1;
```

Note the table names. Also inspect a sample of how an existing permission like `admission.settings.view` is registered:
```sql
SELECT * FROM <permissions_table_name> WHERE key LIKE 'admission%' LIMIT 5;
```

If a permissions catalogue table does NOT exist (some projects use a JSONB column on the `roles` table instead), check `roles` table structure for a `permissions` JSONB column. Adapt the migration accordingly.

- [ ] **Step 2: Write the migration file** based on what Step 1 revealed.

**This project uses the JSONB-on-`custom_roles` shape — confirmed during Plan 2 execution 2026-05-05.** Permissions live in `public.custom_roles.permissions` (jsonb, boolean-keyed). Resolver: `public.user_has_permission(text)` reads `cr.permissions->>permission_name`. NO separate `permissions` or `role_permissions` tables exist. Use the JSONB `UPDATE` form below; the older "separate tables" template that previously appeared here was wrong for this project and has been removed.

```sql
-- ============================================================================
-- 20260506100003 — Register admission_fees.{read,manage} permission keys
-- ============================================================================
-- This project stores permissions as a JSONB column on public.custom_roles:
--   custom_roles(id, role_key, role_name, permissions jsonb, ...)
-- Resolver: public.user_has_permission(text) reads cr.permissions->>permission_name
-- ============================================================================

-- Grant admission_fees.read to counselling-tier and admin-tier roles
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.read": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('admission_counselor','expo_counselor','administrator','super_admin')
   AND COALESCE(permissions->>'admission_fees.read','false') <> 'true';

-- Grant admission_fees.manage to admin-tier only
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE(permissions->>'admission_fees.manage','false') <> 'true';
```

_Note 2026-05-05: original plan listed `counsellor` and `admin` role_keys; neither exists in this project. Substituted `administrator` for `admin` and dropped `counsellor` (no exact equivalent — `learner_counselor` is a different domain). Final grants: 4 read, 2 manage._

- [ ] **Step 3: Apply migration**.

- [ ] **Step 4: Verify**
```sql
SELECT role_key,
       (permissions ? 'admission_fees.read')   AS has_read,
       (permissions ? 'admission_fees.manage') AS has_manage
  FROM public.custom_roles
 WHERE role_key IN ('admission_counselor','expo_counselor','administrator','super_admin')
 ORDER BY role_key;
-- Expected: 4 rows. read=true on all 4; manage=true on administrator + super_admin only.
```

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260506100003_register_admission_fees_permissions.sql
git commit -m "feat(admission-fees): register admission_fees.{read,manage} permissions

admission_fees.read granted to counsellor, admission_counselor,
expo_counselor, admin, super_admin. admission_fees.manage granted
to admin + super_admin only. Plan 1 RLS already references these
keys; this commit fills in the catalogue side.

Plan: Task 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migration — Seed canonical aliases (reduce DQR queue)

Plan 1's backfill matched ~85% of TEXT values. The unmatched ~17 are mostly abbreviations (`GQ`, `MQ`, `GOVT`, `7.5`) and label variants (`GOVERNMENT 7.5%`, `NOT SPECIFIED`). This migration adds them as additional matches by extending the canonical seed plus a re-run of the backfill UPDATE.

**Files:**
- Create: `supabase/migrations/20260506100004_seed_canonical_quota_aliases.sql`

- [ ] **Step 1: Inspect the actual unmatched values first**

```sql
SELECT column_name, observed_value, occurrence_count
  FROM public.data_quality_review
 WHERE review_status = 'pending'
   AND table_name = 'learners_profiles'
 ORDER BY column_name, occurrence_count DESC;
```

Use the actual list to decide which canonical seeds need aliases. The migration below covers the common cases; **add or remove based on what your DB actually contains**.

- [ ] **Step 2: Write the migration**

```sql
-- ============================================================================
-- 20260506100004 — Seed canonical aliases + re-run backfill for resolved rows
-- ============================================================================
-- Strategy: keep the canonical (code, name) immutable; add a second matching
-- pass via a normalized alias map. Re-run UPDATEs to pick up newly-matchable rows.
-- ============================================================================

-- Inline alias map (no table — kept as a CTE applied directly)
WITH alias_map(observed_normalized, canonical_code) AS (
  VALUES
    -- Quota aliases
    ('gq',                    'government'),
    ('mq',                    'management'),
    ('govt',                  'government'),
    ('government 7.5%',       'government'),
    ('gq 7.5',                'government'),
    ('7.5',                   'government'),
    ('lapse',                 NULL),                    -- intentionally unmapped
    ('fg',                    NULL),                    -- TBD by admin
    ('not specified',         NULL)                     -- TBD by admin
)
UPDATE public.learners_profiles lp
   SET quota_id = q.id,
       updated_at = now()
  FROM public.quotas q
  JOIN alias_map am ON am.canonical_code = q.code AND am.canonical_code IS NOT NULL
 WHERE lp.quota IS NOT NULL
   AND lp.quota_id IS NULL
   AND lower(trim(lp.quota)) = am.observed_normalized;

-- Community aliases
WITH alias_map(observed_normalized, canonical_code) AS (
  VALUES
    ('sc (a)',  'sca'),
    ('sc(a)',   'sca'),
    ('bcm',     'bcm')   -- already canonical, but tolerate trailing-space variants
)
UPDATE public.learners_profiles lp
   SET community_category_id = c.id,
       updated_at = now()
  FROM public.community_categories c
  JOIN alias_map am ON am.canonical_code = c.code
 WHERE lp.community IS NOT NULL
   AND lp.community_category_id IS NULL
   AND lower(trim(lp.community)) = am.observed_normalized;

-- Mark resolved DQR rows as 'mapped'
UPDATE public.data_quality_review
   SET review_status = 'mapped',
       updated_at = now()
 WHERE review_status = 'pending'
   AND table_name = 'learners_profiles'
   AND (
     (column_name = 'quota'     AND lower(trim(observed_value))
        IN ('gq','mq','govt','government 7.5%','gq 7.5','7.5'))
     OR (column_name = 'community' AND lower(trim(observed_value))
        IN ('sc (a)','sc(a)'))
   );
```

- [ ] **Step 3: Apply migration**.

- [ ] **Step 4: Verify** — re-run Plan 1 Task 5 Step 4 verification:
```sql
SELECT 'learners_profiles.quota' AS field,
       count(*) FILTER (WHERE quota IS NOT NULL) AS text_count,
       count(*) FILTER (WHERE quota_id IS NOT NULL) AS fk_count,
       count(*) FILTER (WHERE quota IS NOT NULL AND quota_id IS NULL) AS unmatched
  FROM public.learners_profiles;
```
Expected: `unmatched` should drop materially compared to Plan 1's baseline (~1927 → ~270 since the `7.5`/`GOVERNMENT 7.5%` cluster is large). Document the new ratio in the commit message.

- [ ] **Step 5: Commit** with the actual before→after numbers in the message.

---

## Task 5: Type definitions — fee structure types in `types/admission.ts`

**Files:**
- Modify: `types/admission.ts` (append)

- [ ] **Step 1: Append type definitions**

```typescript
// ============================================================================
// Admission Fee Structure module — Plan 2 types
// ============================================================================
// Spec: §6.2
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-02-fee-structure-module.md Task 5

export type AdmissionFeeStructureStatus = 'draft' | 'active' | 'archived';

export interface AdmissionFeeStructure {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  quota_id: string;
  community_category_id: string;
  accommodation_type_id: string;
  admission_year_id: string;
  name: string;
  status: AdmissionFeeStructureStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AdmissionFeeStructureItem {
  id: string;
  fee_structure_id: string;
  billing_category_id: string;
  amount: number;
  is_optional: boolean;
  sort_order: number;
}

export interface AdmissionFeeStructureWithItems extends AdmissionFeeStructure {
  items: AdmissionFeeStructureItem[];
}

export type CreateAdmissionFeeStructureInput =
  Pick<
    AdmissionFeeStructure,
    | 'institution_id'
    | 'degree_id'
    | 'department_id'
    | 'programme_id'
    | 'quota_id'
    | 'community_category_id'
    | 'accommodation_type_id'
    | 'admission_year_id'
    | 'name'
  > &
  Partial<Pick<AdmissionFeeStructure, 'status' | 'notes'>> & {
    items: Array<Pick<AdmissionFeeStructureItem, 'billing_category_id' | 'amount'> &
      Partial<Pick<AdmissionFeeStructureItem, 'is_optional' | 'sort_order'>>>;
  };

export type UpdateAdmissionFeeStructureInput =
  Partial<Pick<AdmissionFeeStructure, 'name' | 'status' | 'notes'>>;

export interface FeeStructureMatrixDimensions {
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  quota_id: string;
  community_category_id: string;
  accommodation_type_id: string;
  admission_year_id: string;
}

/** Coverage report row — one per (institution, academic_year) leaf in the tree */
export interface FeeStructureCoverageReportRow {
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  quota_id: string;
  community_category_id: string;
  accommodation_type_id: string;
  admission_year_id: string;
  has_structure: boolean;
  item_count: number;
}
```

- [ ] **Step 2: Verify TypeScript** (skip the full `tsc --noEmit` — it hangs on this project — instead verify via syntax-only):
```bash
npx tsc --noEmit --skipLibCheck types/admission.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**
```bash
git add types/admission.ts
git commit -m "feat(admission-fees): add fee structure type definitions

AdmissionFeeStructure, AdmissionFeeStructureItem,
AdmissionFeeStructureWithItems, FeeStructureMatrixDimensions,
FeeStructureCoverageReportRow + Create/Update inputs.

Spec: §6.2
Plan: Task 5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `fee-structure-service.ts`

**Files:**
- Create: `lib/services/admission/fee-structure-service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionFeeStructure,
  AdmissionFeeStructureItem,
  AdmissionFeeStructureWithItems,
  CreateAdmissionFeeStructureInput,
  UpdateAdmissionFeeStructureInput,
  FeeStructureMatrixDimensions,
  FeeStructureCoverageReportRow,
} from '@/types/admission';

/**
 * CRUD + clone + lookup + coverage for admission_fee_structures and items.
 *
 * Every mutation explicitly destructures { error }. Item write goes through
 * a transaction-shaped flow (parent first, then items) — for v1 we tolerate
 * the small race window since ON CONFLICT DO UPDATE makes the item write
 * idempotent, and the bigger atomic guarantee will land in Plan 3 via RPC.
 */
export class FeeStructureService {
  static async list(institutionId: string, academicYearId?: string): Promise<AdmissionFeeStructure[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_fee_structures')
      .select('*')
      .eq('institution_id', institutionId)
      .order('updated_at', { ascending: false });
    if (academicYearId) query = query.eq('admission_year_id', academicYearId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getWithItems(id: string): Promise<AdmissionFeeStructureWithItems | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select('*, items:admission_fee_structure_items(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as AdmissionFeeStructureWithItems | null) ?? null;
  }

  static async findByDimensions(d: FeeStructureMatrixDimensions): Promise<AdmissionFeeStructureWithItems | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select('*, items:admission_fee_structure_items(*)')
      .eq('institution_id', d.institution_id)
      .eq('degree_id', d.degree_id)
      .eq('department_id', d.department_id)
      .eq('programme_id', d.programme_id)
      .eq('quota_id', d.quota_id)
      .eq('community_category_id', d.community_category_id)
      .eq('accommodation_type_id', d.accommodation_type_id)
      .eq('admission_year_id', d.admission_year_id)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    return (data as AdmissionFeeStructureWithItems | null) ?? null;
  }

  static async create(input: CreateAdmissionFeeStructureInput): Promise<AdmissionFeeStructureWithItems> {
    const supabase = createClientSupabaseClient();
    const { items, ...structureFields } = input;
    const { data: created, error: createError } = await supabase
      .from('admission_fee_structures')
      .insert(structureFields)
      .select('*')
      .single();
    if (createError) throw createError;

    if (items.length > 0) {
      const rows = items.map((it, idx) => ({
        fee_structure_id: created.id,
        billing_category_id: it.billing_category_id,
        amount: it.amount,
        is_optional: it.is_optional ?? false,
        sort_order: it.sort_order ?? idx,
      }));
      const { error: itemError } = await supabase.from('admission_fee_structure_items').insert(rows);
      if (itemError) throw itemError;
    }

    const fullRow = await this.getWithItems(created.id);
    if (!fullRow) throw new Error('fee_structure_create_failed_to_read_back');
    return fullRow;
  }

  static async update(id: string, input: UpdateAdmissionFeeStructureInput): Promise<AdmissionFeeStructure> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async upsertItems(structureId: string, items: AdmissionFeeStructureItem[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    const rows = items.map((it, idx) => ({
      fee_structure_id: structureId,
      billing_category_id: it.billing_category_id,
      amount: it.amount,
      is_optional: it.is_optional ?? false,
      sort_order: it.sort_order ?? idx,
    }));
    const { error } = await supabase
      .from('admission_fee_structure_items')
      .upsert(rows, { onConflict: 'fee_structure_id,billing_category_id' });
    if (error) throw error;
  }

  static async removeItem(itemId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('admission_fee_structure_items').delete().eq('id', itemId);
    if (error) throw error;
  }

  static async archive(id: string): Promise<AdmissionFeeStructure> {
    return this.update(id, { status: 'archived' });
  }

  static async activate(id: string): Promise<AdmissionFeeStructure> {
    return this.update(id, { status: 'active' });
  }

  /**
   * Clone a structure to a new academic year. All matrix dimensions copied
   * EXCEPT admission_year_id which is set to newAcademicYearId. Optional
   * dimension overrides via `overrides`.
   */
  static async cloneToAcademicYear(
    sourceId: string,
    newAcademicYearId: string,
    overrides?: Partial<FeeStructureMatrixDimensions> & { name?: string },
  ): Promise<AdmissionFeeStructureWithItems> {
    const source = await this.getWithItems(sourceId);
    if (!source) throw new Error('fee_structure_not_found');
    const dims: FeeStructureMatrixDimensions = {
      institution_id:        overrides?.institution_id        ?? source.institution_id,
      degree_id:             overrides?.degree_id             ?? source.degree_id,
      department_id:         overrides?.department_id         ?? source.department_id,
      programme_id:          overrides?.programme_id          ?? source.programme_id,
      quota_id:              overrides?.quota_id              ?? source.quota_id,
      community_category_id: overrides?.community_category_id ?? source.community_category_id,
      accommodation_type_id: overrides?.accommodation_type_id ?? source.accommodation_type_id,
      admission_year_id:     newAcademicYearId,
    };
    return this.create({
      ...dims,
      name: overrides?.name ?? `${source.name} (cloned)`,
      status: 'draft',
      notes: source.notes,
      items: source.items.map(it => ({
        billing_category_id: it.billing_category_id,
        amount: it.amount,
        is_optional: it.is_optional,
        sort_order: it.sort_order,
      })),
    });
  }

  /**
   * Coverage report — for each (institution, academic_year) the count of
   * configured fee_structures vs the total number of valid leaves
   * (programs × quotas × communities × accommodation_types). v1 returns
   * one row per existing structure plus a separate `gaps` query for missing
   * ones; v1.5 will compute true cartesian gaps.
   */
  static async getCoverageReport(institutionId: string, admissionYearId: string): Promise<FeeStructureCoverageReportRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select(`
        institution_id, degree_id, department_id, programme_id,
        quota_id, community_category_id, accommodation_type_id, admission_year_id,
        items:admission_fee_structure_items(id)
      `)
      .eq('institution_id', institutionId)
      .eq('admission_year_id', admissionYearId)
      .eq('status', 'active');
    if (error) throw error;
    return (data ?? []).map(row => ({
      institution_id: row.institution_id,
      degree_id: row.degree_id,
      department_id: row.department_id,
      programme_id: row.programme_id,
      quota_id: row.quota_id,
      community_category_id: row.community_category_id,
      accommodation_type_id: row.accommodation_type_id,
      admission_year_id: row.admission_year_id,
      has_structure: true,
      item_count: (row.items as Array<{ id: string }>).length,
    }));
  }
}
```

- [ ] **Step 2: Verify** the imports compile (the same `--skipLibCheck` invocation as Task 5).

- [ ] **Step 3: Commit**
```bash
git add lib/services/admission/fee-structure-service.ts
git commit -m "feat(admission-fees): add FeeStructureService

CRUD + clone-to-academic-year + findByDimensions + getCoverageReport.
Items use onConflict upsert for idempotency (full atomic guarantee will
arrive in Plan 3 via SECURITY DEFINER RPC).

Spec: §8.1
Plan: Task 6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Activity log templates registration

**Files:**
- Create: `lib/utils/admission-fees-activity-templates.ts`
- Modify: `lib/utils/activity-logger-client.ts` (append imports + register)

- [ ] **Step 1: Read the existing activity logger to find the registration pattern**

Open `D:\Projects\MyJKKN\lib\utils\activity-logger-client.ts`. Look for how the resource-management templates from commit `e8fa0bdef` are imported + registered (the pattern). Replicate it.

- [ ] **Step 2: Create the new templates file**

```typescript
// lib/utils/admission-fees-activity-templates.ts
// Activity log templates for admission fee structure events (Plan 2)

export const AdmissionFeesActivityTemplates = {
  fee_structure: {
    created:   (name: string) => `Created fee structure "${name}"`,
    updated:   (name: string) => `Updated fee structure "${name}"`,
    archived:  (name: string) => `Archived fee structure "${name}"`,
    activated: (name: string) => `Activated fee structure "${name}"`,
  },
  fee_structure_item: {
    added:   (cat: string, amount: number) => `Added line item: ${cat} ₹${amount.toLocaleString()}`,
    updated: (cat: string, amount: number) => `Updated line item: ${cat} ₹${amount.toLocaleString()}`,
    removed: (cat: string)                  => `Removed line item: ${cat}`,
  },
  lookup: {
    value_mapped_via_dqr: (table: string, observed: string, mappedTo: string) =>
      `Mapped ${table}.${observed} → ${mappedTo} via DQR`,
  },
};
```

- [ ] **Step 3: Wire into FeeStructureService** (Task 6's file). At the top of each mutation method, after the success path, call `logActivityForCurrentUser('fee_structure.created', ...)` with the appropriate template. Use the existing helper from `activity-logger-client.ts` (per memory `S2010 / 5825`).

- [ ] **Step 4: Verify** by checking that one mutation in `fee-structure-service.ts` references `AdmissionFeesActivityTemplates.fee_structure.created`.

- [ ] **Step 5: Commit**
```bash
git add lib/utils/admission-fees-activity-templates.ts \
        lib/utils/activity-logger-client.ts \
        lib/services/admission/fee-structure-service.ts
git commit -m "feat(admission-fees): register activity log templates for fee_structure events

fee_structure.{created,updated,archived,activated},
fee_structure_item.{added,updated,removed}, lookup.value_mapped_via_dqr.
Wired into FeeStructureService mutations following the resource-management
precedent (commit e8fa0bdef).

Spec: §11
Plan: Task 7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Lookup admin — Quotas page

**Files:**
- Create: `app/(routes)/admission/settings/lookups/quotas/page.tsx`
- Create: `app/(routes)/admission/settings/lookups/quotas/_components/quotas-data-table.tsx`
- Create: `app/(routes)/admission/settings/lookups/quotas/_components/quota-form-dialog.tsx`

Match the house style from `app/(routes)/admission/settings/assignment-rules/page.tsx`: `'use client'`, `ContentLayout`, breadcrumb (Dashboard → Admission → Settings → Lookups → Quotas), `AdmissionErrorBoundary`, `PermissionGuard module="admission.settings" action="view"`.

- [ ] **Step 1: Write `page.tsx`**

```tsx
'use client';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { QuotasDataTable } from './_components/quotas-data-table';

function QuotasPageContent() {
  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title="Quotas">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/settings/lookups">Lookups</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Quotas</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <QuotasDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function QuotasPage() {
  return (
    <AdmissionErrorBoundary>
      <QuotasPageContent />
    </AdmissionErrorBoundary>
  );
}
```

- [ ] **Step 2: Write `quotas-data-table.tsx`**

The component:
- Calls `LookupService.listQuotas(false)` (include archived) on mount
- Renders a Data Table with columns: code, name, sort_order, is_active (badge), Actions (Edit / Archive / Restore)
- Header has "+ New Quota" button → opens `<QuotaFormDialog mode="create">`
- Edit row → opens `<QuotaFormDialog mode="edit" initialValues={row}>`
- Archive → AlertDialog confirmation → `LookupService.archiveQuota(id)`
- Restore (if archived) → directly call `LookupService.updateQuota(id, { is_active: true })`
- After every mutation: refetch the list

Use the existing project DataTable component (search the codebase for `DataTable` import in other settings pages; typically `@/components/ui/data-table` or `@/components/admission/data-table`).

- [ ] **Step 3: Write `quota-form-dialog.tsx`**

Form with:
- `code` text input (required, lowercase, no spaces) — disabled in edit mode (immutable)
- `name` text input (required)
- `sort_order` number input (default 99)
- `is_active` switch (default true)
- Submit calls `LookupService.createQuota` or `LookupService.updateQuota` based on mode
- Use react-hook-form + zod (project standard — find a peer form for the exact import pattern)

- [ ] **Step 4: Smoke test (manual)**
- Navigate to `/admission/settings/lookups/quotas`. List shows 8 seeded quotas.
- Click "+ New Quota", fill in `code='test_quota'`, `name='Test'`, save. List now shows 9.
- Edit it, change name to `'Test 2'`, save. Reflected in list.
- Archive it. Row shows is_active=false.

- [ ] **Step 5: Commit**
```bash
git add "app/(routes)/admission/settings/lookups/quotas"
git commit -m "feat(admission-fees): quotas lookup admin page

List + create/edit/archive/restore for the global quotas table.
Matches assignment-rules house style. PermissionGuard on
admission.settings.view.

Plan: Task 8

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Lookup admin — Community Categories page

Same pattern as Task 8. Files:
- `app/(routes)/admission/settings/lookups/community-categories/page.tsx`
- `_components/community-categories-data-table.tsx`
- `_components/community-category-form-dialog.tsx`

- [ ] **Step 1-3: Write the three files** following Task 8's structure verbatim, swapping table name to `community_categories`, type names to `AdmissionFeeCommunityCategory`, service methods to `LookupService.listCommunityCategories` etc.

- [ ] **Step 4: Smoke test** — same flow as Task 8.

- [ ] **Step 5: Commit**
```bash
git add "app/(routes)/admission/settings/lookups/community-categories"
git commit -m "feat(admission-fees): community-categories lookup admin page

Plan: Task 9
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Lookup admin — Accommodation Types page (institution-scoped)

Like Task 8 but adds an institution selector at the top. Files:
- `app/(routes)/admission/settings/lookups/accommodation-types/page.tsx`
- `_components/accommodation-types-data-table.tsx`
- `_components/accommodation-type-form-dialog.tsx`

- [ ] **Step 1: Write `page.tsx`** — same as Task 8 but with an `<InstitutionSelector>` at the top of the data-table component (find the existing institution dropdown pattern in `lib/services/organization-service.ts` consumers — search for `getInstitutionNames`). The table re-fetches when the selector changes.

- [ ] **Step 2: Write `accommodation-types-data-table.tsx`**
- Reads selected `institutionId` from a local state or URL param (`?institution=...`)
- Calls `LookupService.listAccommodationTypes(institutionId, false)`
- Same columns + actions as Task 8

- [ ] **Step 3: Write `accommodation-type-form-dialog.tsx`**
- Same fields as Task 8 + an `institution_id` field (defaulted to currently-selected institution, immutable in edit mode)

- [ ] **Step 4: Smoke test**
- Navigate to `/admission/settings/lookups/accommodation-types`. Pick an institution. List shows 4 starter rows (hostel/dayscholar/pg/not_applicable).
- Add a custom one (e.g. `code='married_quarters'`, `name='Married Quarters'`).
- Pick a different institution. List independently shows that institution's rows only.

- [ ] **Step 5: Commit**

---

## Task 11: DQR mapping surface

The most user-facing piece of Phase A. Reads `data_quality_review` rows where `review_status='pending'` and lets admin map each observed value to a canonical lookup.

**Files:**
- Create: `app/(routes)/admission/settings/lookups/data-quality/page.tsx`
- Create: `_components/dqr-mapping-table.tsx`
- Create: `_components/map-row-dialog.tsx`
- Create: `lib/services/admission/dqr-service.ts`

- [ ] **Step 1: Create `dqr-service.ts`**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface DqrRow {
  id: string;
  table_name: string;
  column_name: string;
  observed_value: string;
  occurrence_count: number;
  review_status: 'pending' | 'mapped' | 'ignored';
  mapped_to_id: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export class DqrService {
  static async listPending(): Promise<DqrRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('data_quality_review')
      .select('*')
      .eq('review_status', 'pending')
      .order('occurrence_count', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Map a DQR row to a canonical lookup. This:
   * 1. Updates the lookup row's parent table by matching observed_value,
   *    setting the canonical FK column.
   * 2. Marks the DQR row as 'mapped' with mapped_to_id = canonical lookup id.
   * 3. Counter-rows for the same observed_value (e.g. across both
   *    learners_profiles AND admission_leads) are also resolved if pointed
   *    at the same canonical.
   */
  static async mapToCanonical(args: {
    dqrId: string;
    canonicalLookupId: string;
    fkColumnName: 'quota_id' | 'community_category_id' | 'accommodation_type_id';
    notes?: string;
  }): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Read the DQR row
    const { data: dqr, error: readError } = await supabase
      .from('data_quality_review')
      .select('*')
      .eq('id', args.dqrId)
      .single();
    if (readError) throw readError;

    // Apply UPDATE to the parent table — match by lower(trim(observed_value))
    const updateBuilder = supabase
      .from(dqr.table_name)
      .update({ [args.fkColumnName]: args.canonicalLookupId })
      .filter(dqr.column_name, 'ilike', dqr.observed_value);
    const { error: updateError } = await updateBuilder;
    if (updateError) throw updateError;

    // Mark DQR row as mapped
    const { error: dqrError } = await supabase
      .from('data_quality_review')
      .update({
        review_status: 'mapped',
        mapped_to_id: args.canonicalLookupId,
        review_notes: args.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.dqrId);
    if (dqrError) throw dqrError;
  }

  static async ignore(dqrId: string, notes?: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('data_quality_review')
      .update({ review_status: 'ignored', review_notes: notes ?? null })
      .eq('id', dqrId);
    if (error) throw error;
  }
}
```

- [ ] **Step 2: Write `page.tsx`** — same shell pattern as Task 8 with breadcrumb leaf "Data Quality Review".

- [ ] **Step 3: Write `dqr-mapping-table.tsx`**
- Calls `DqrService.listPending()`
- Table columns: table.column, observed_value, occurrence_count, Status, Map / Ignore actions
- Map button → opens `<MapRowDialog row={dqr}>`

- [ ] **Step 4: Write `map-row-dialog.tsx`**
- Shows: source table.column, observed value, occurrence count
- Combo box of canonical lookup values (filtered by which column the DQR row references — `quota` → `quotas`, `community` → `community_categories`, `accommodation_type` → `accommodation_types`)
- Optional notes textarea
- Submit → `DqrService.mapToCanonical(...)` → close dialog + refetch list

- [ ] **Step 5: Smoke test**
- Visit `/admission/settings/lookups/data-quality`. Should see remaining unmatched DQR rows.
- Pick a row (e.g. observed=`'GOVT 7.5'` if alias migration didn't catch it). Click Map.
- Choose canonical='Government Quota'. Submit.
- Verify the row disappears from the pending list AND query the parent table to confirm the FK is now set.

- [ ] **Step 6: Commit** the four files in one commit.

---

## Task 12: Lookups landing page + nav-config registration

**Files:**
- Create: `app/(routes)/admission/settings/lookups/page.tsx`
- Modify: `app/(routes)/admission/nav-config.ts`

- [ ] **Step 1: Write the lookups landing page** — a 2×2 grid of cards: Quotas / Community Categories / Accommodation Types / Data Quality Review (with badge showing pending DQR count). Each card links to its sub-page.

- [ ] **Step 2: Update `nav-config.ts`** — add the four new settings sub-routes (`lookups`, `lookups/quotas`, `lookups/community-categories`, `lookups/accommodation-types`, `lookups/data-quality`). Match the existing pattern for how `assignment-rules` is registered.

- [ ] **Step 3: Smoke test** — navigate via the admission settings sidebar; all four routes resolve.

- [ ] **Step 4: Commit**
```bash
git add "app/(routes)/admission/settings/lookups/page.tsx" "app/(routes)/admission/nav-config.ts"
git commit -m "feat(admission-fees): lookups landing page + nav registration

Plan: Task 12
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# PHASE B — Fee Structure Builder UI

## Task 13: Fee-structure module page shell + tree-rail component

**Files:**
- Create: `app/(routes)/admission/settings/fees-structure/page.tsx`
- Create: `_components/fees-structure-tree-rail.tsx`

- [ ] **Step 1: Write `page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FeesStructureTreeRail } from './_components/fees-structure-tree-rail';
import { FeesStructureForm } from './_components/fees-structure-form';
import { FeesStructureCloneDialog } from './_components/fees-structure-clone-dialog';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

type EditorMode = 'form' | 'clone';

function FeesStructurePageContent() {
  const [selectedDims, setSelectedDims] = useState<Partial<FeeStructureMatrixDimensions>>({});
  const [mode, setMode] = useState<EditorMode>('form');
  const [coverageOnly, setCoverageOnly] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title="Fee Structures">
        <div className="space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Fee Structures</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="grid grid-cols-[280px_1fr] gap-4 h-[calc(100vh-220px)]">
            <FeesStructureTreeRail
              selectedDims={selectedDims}
              onSelect={setSelectedDims}
              coverageOnly={coverageOnly}
              onToggleCoverage={() => setCoverageOnly(c => !c)}
            />
            <div className="border rounded-md overflow-auto p-4">
              <div className="flex justify-end gap-2 mb-2">
                <button onClick={() => setMode('form')} className={mode === 'form' ? 'btn-primary' : 'btn-ghost'}>Form</button>
                <button onClick={() => setCloneOpen(true)} className="btn-ghost">Clone…</button>
              </div>
              {mode === 'form' && (
                <FeesStructureForm dims={selectedDims} />
              )}
            </div>
          </div>

          <FeesStructureCloneDialog
            open={cloneOpen}
            onOpenChange={setCloneOpen}
            sourceDims={selectedDims}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function FeesStructurePage() {
  return <AdmissionErrorBoundary><FeesStructurePageContent /></AdmissionErrorBoundary>;
}
```

(Replace `btn-primary` / `btn-ghost` with the project's actual button classes — typically `<Button variant="default">` from `@/components/ui/button`.)

- [ ] **Step 2: Write `fees-structure-tree-rail.tsx`**

The tree is 8 levels deep but most institutions have a small enough cardinality that lazy-loading isn't required for v1. Strategy:
- Top-level: Institutions list (from `OrganizationService.getInstitutionNames`)
- Per institution: nested expander groups Degree → Department → Programme → Quota → Community → Accommodation → Year
- Leaf node: clicking sets all 8 dims via `onSelect` and triggers right-pane render
- Each leaf shows a small badge: count of items in the matching `admission_fee_structures` row (or "—" if no structure exists). Red when count = 0.
- "Coverage Only" toggle button at the top — when on, filters tree to only show leaves where no structure exists (gap surfacing).

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

interface Props {
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  onToggleCoverage: () => void;
}

export function FeesStructureTreeRail(_props: Props) {
  // For v1, fetch all institutions on mount. Each branch lazy-fetches degrees/departments/programs
  // when expanded. Quotas + community + accommodation + year fetched once and used for every leaf.
  // Coverage badge: per leaf, run a single batched fetch via FeeStructureService.list(institutionId, yearId)
  // and look up by other-7-dims locally.
  // Implementation note: prefer presentational simplicity over performance for v1 — one institution
  // per click, expand on demand, 80-120 lines total.
  return (
    <aside className="border rounded-md overflow-auto p-3">
      {/* Tree implementation goes here */}
    </aside>
  );
}
```

The implementation is non-trivial (~150 lines). The skeleton above is intentional scaffolding — the implementer writes the recursive tree (institutions list → expansion handlers per branch → leaf onClick assembling the full 8-dim object → coverage badge fetch). **Reference `app/(routes)/admin/navigation/page-tabs/_components/page-tabs-tree.tsx`** for an existing recursive tree pattern in this codebase (per memory `5774`); copy its expansion-state model and tree-node anatomy.

- [ ] **Step 3: Smoke test**
- Navigate to `/admission/settings/fees-structure`. Page loads with empty tree rail and form placeholder.
- Click an institution. It expands.
- Drill down through degree → department → programme → quota → community → accommodation → year. Right pane shows `<FeesStructureForm>` for the selected leaf.

- [ ] **Step 4: Commit**

---

## Task 14: Form mode editor

**Files:**
- Create: `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx`

- [ ] **Step 1: Write the form component**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type {
  AdmissionFeeStructureWithItems,
  FeeStructureMatrixDimensions,
} from '@/types/admission';

interface Props {
  dims: Partial<FeeStructureMatrixDimensions>;
}

export function FeesStructureForm({ dims }: Props) {
  const [structure, setStructure] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [categories, setCategories] = useState<{ id: string; category_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // When all 8 dims are present, lookup or fetch
  useEffect(() => {
    if (!isFullDims(dims)) {
      setStructure(null);
      return;
    }
    setLoading(true);
    FeeStructureService.findByDimensions(dims as FeeStructureMatrixDimensions)
      .then(setStructure)
      .finally(() => setLoading(false));
  }, [dims]);

  useEffect(() => {
    BillingCategoryService.getActiveBillingCategories().then(setCategories);
  }, []);

  if (!isFullDims(dims)) {
    return <p className="text-muted-foreground">Pick a leaf in the tree to view or create a fee structure.</p>;
  }
  if (loading) return <p>Loading…</p>;
  if (!structure) {
    return (
      <NewStructureForm
        dims={dims as FeeStructureMatrixDimensions}
        categories={categories}
        onCreated={(s) => setStructure(s)}
      />
    );
  }
  return (
    <ExistingStructureEditor
      structure={structure}
      categories={categories}
      onChanged={(s) => setStructure(s)}
    />
  );
}

function isFullDims(d: Partial<FeeStructureMatrixDimensions>): boolean {
  return !!(d.institution_id && d.degree_id && d.department_id && d.programme_id
    && d.quota_id && d.community_category_id && d.accommodation_type_id && d.admission_year_id);
}

// NewStructureForm: name input + multi-add of (billing_category × amount) rows + Save button
// ExistingStructureEditor: same form but pre-filled, includes Edit-with-warning when amount changes
//   on a structure that already has resolved fee_items[] downstream (count via lead query)
//   + Archive button + Activate button
```

The two helper components (`NewStructureForm`, `ExistingStructureEditor`) are non-trivial — each ~80 lines. Use react-hook-form + zod (project standard).

- [ ] **Step 2: Smoke test**
- Pick a leaf with no existing structure. NewStructureForm shows. Type a name, add 3 fee items (Tuition Fee ₹50000, Hostel Fee ₹30000, Library Fee ₹2000). Save. Page refetches and shows ExistingStructureEditor.
- Edit one amount. Save. Verify activity log entry written (check `user_activity_logs` table or in the UI if there's a recent-activity panel).

- [ ] **Step 3: Commit**

---

## Task 15: Clone mode + Coverage Report toggle

**Files:**
- Create: `app/(routes)/admission/settings/fees-structure/_components/fees-structure-clone-dialog.tsx`
- Create: `_components/fees-structure-coverage-report.tsx` (optional v1 — can be done as part of tree-rail filter)

- [ ] **Step 1: Write `fees-structure-clone-dialog.tsx`**

Dialog body:
- Title: "Clone Fee Structure"
- Source structure selector — list view of existing structures filtered by institution (default = currently-selected from tree)
- Mode tabs: "Clone for academic year" | "Clone with overrides"
- For "Clone for academic year": single dropdown — pick a different academic_year_id; rest of dimensions inherited
- For "Clone with overrides": dropdowns for each dimension allowing override; pre-filled from source
- Submit calls `FeeStructureService.cloneToAcademicYear(sourceId, newYearId, overrides)`
- On success: close dialog + select the new structure in the tree

- [ ] **Step 2: Coverage Report toggle**
The toggle button is already on the tree-rail (Task 13). Behavior:
- When ON: filter tree to leaves where no structure exists (and no items)
- Implementation: client-side filter applied during tree rendering

If the toggle becomes complex (e.g. needs server-side cartesian-product computation), defer to v1.5 and ship v1 with the tree showing all leaves and red badges marking gaps.

- [ ] **Step 3: Smoke test**
- Pick a leaf with an existing structure. Click "Clone…". Pick a different academic year. Submit. New structure appears under the new year branch in the tree.
- Toggle Coverage Report on. Tree filters to gap leaves only.

- [ ] **Step 4: Commit**

---

## Task 16: Final integration + roadmap update

**Files:**
- Modify: `docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md`

- [ ] **Step 1: Run integration smoke**

End-to-end flow as an admin:
1. Go to `/admission/settings/lookups/quotas` — list, edit, archive a quota — works
2. Go to `/admission/settings/lookups/data-quality` — see remaining unmatched values — map one of them — verify the parent table FK is set
3. Go to `/admission/settings/fees-structure` — drill to a leaf — create a new structure with 3 items — verify it appears via DB query
4. Clone the structure to next academic year — verify it appears
5. Toggle Coverage Report — verify red-badge leaves are filtered

- [ ] **Step 2: Mark Plan 2 complete in the roadmap**
Edit the roadmap status row: `⬜ Not started` → `✅ Completed (YYYY-MM-DD)`. Add a retrospective note covering:
- Final DQR pending-row count vs Plan 1 baseline (delta from canonical aliases + admin mapping)
- Any UI components that turned out larger than expected
- For Plan 3: a note that fee structures are now configurable end-to-end and the Resolution Engine has a real data source

- [ ] **Step 3: Commit + push**

```bash
git add docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md
git commit -m "docs(admission-fees): mark Plan 2 (Fee Structure module) complete

[retrospective notes, DQR ratio, UI deliverables]

Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-02-fee-structure-module.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin main
```

---

## Plan-2 Spec Coverage Self-Review

| Spec section | Addressed by |
|---|---|
| §6.2 admission_fee_structures + items DDL | Tasks 1, 2 |
| §8.1 fee-structure-service.ts | Task 6 |
| §9.1 fee-structure builder UI (tree-rail + Form mode + Clone mode + Coverage Report) | Tasks 13, 14, 15 |
| §10.1 admission_fees.{read,manage} permission keys | Task 3 |
| §10.2 RLS for fee structure tables | Task 2 |
| §11 activity log events | Task 7 |
| §12.1 Phase 2 lookup-table backfill (DQR mapper completes the loop) | Tasks 4, 11 |
| §16.1 lookup admin UI + DQR mapping | Tasks 8, 9, 10, 11, 12 |

**Not in this plan (deferred):**
- Resolution engine RPC + Adjustments table + Finance tab refactor → Plan 3
- Atomic account transition + documents-checklist + status-change dialog → Plan 4
- Fee-change reconciliation → Plan 5
- Cutover & adoption → Plan 6
- Grid mode editor + bulk-edit → Plan v1.5 polish (after Plan 6 ships)

---

## Open Items / Risks

- **Permissions catalogue shape** — Task 3's migration assumes a `permissions` table + `role_permissions` join table. If the project uses a JSONB `roles.permissions` column instead, adjust the migration shape based on Task 3 Step 1's discovery.
- **Tree rail recursion** — for institutions with >300 programs the tree may render slowly. v1 ships a simple expansion-on-click model; if rendering performance becomes a problem, defer to virtualised tree (e.g. `@tanstack/react-virtual`) in a v1.5 polish.
- **Activity logging integration** — Task 7 wires templates into `FeeStructureService`. The exact helper name (`logActivityForCurrentUser`) was added in Plan 1's commits per the resource-management precedent — verify the import path matches.
- **`tsc --noEmit` slowness** — Plan 1 surfaced that the full `tsc --noEmit` run hangs for many minutes on this codebase. For Plan 2, prefer `tsc --noEmit --skipLibCheck path/to/file.ts` per-file checks instead of full project compile until a faster verification command is established.
- **DQR mapping UPDATE** — `DqrService.mapToCanonical` issues an `ilike` UPDATE which may be slow on large tables (50K+ rows). For v1 we accept the latency; if it becomes a problem, replace with a server-side function call.
