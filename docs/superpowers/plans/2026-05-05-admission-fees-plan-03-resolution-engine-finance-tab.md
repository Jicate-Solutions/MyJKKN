# Admission Fees — Plan 3: Resolution Engine + Finance Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Roadmap:** [`2026-05-05-admission-fees-roadmap.md`](./2026-05-05-admission-fees-roadmap.md)
**Spec:** [`docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)
**Predecessors:** Plan 1 (Foundation) ✅ · Plan 2 (Fee Structure module) ✅

**Goal:** Make fee structures actually *do something* on the enquiry form. Introduce the Adjustments table for first-class exceptions, the resolution RPC that merges structure + adjustments into the `fee_items[]` snapshot, the Finance tab refactor that auto-populates from the matrix, the pre-submit confirmation dialog, and the legacy-row adoption banner. After Plan 3 ships, every new enquiry from a flag-enabled institution is fee-automated end-to-end up to (but not including) status='account' transition — that gate is Plan 4.

**Architecture:** One new table (`admission_fee_adjustments`) with per-enquiry signed deltas + reason codes. One new SECURITY DEFINER RPC (`admission_resolve_fee_items_for_lead`) that performs the 8-dim matrix lookup, fetches active adjustments, merges them into a resolved JSONB array, persists into `learners_profiles.fee_items`, and returns the array. One new service (`fee-adjustment-service.ts`). Surgical refactor of `learners/enquiries/_components/form-sections/finance-details.tsx` to replace the manual `fee_items[]` repeater with three vertical sections (read-only Structure / editable Adjustments / Resolved Total). One pre-submit confirmation dialog. One legacy-row adoption banner. Bill generation engine remains untouched.

**Tech Stack:** Same as Plans 1-2: Supabase Postgres + plpgsql for RPC; TypeScript service layer; Next.js 16 App Router client components; Tailwind + Radix UI; `react-hook-form` + `zod` for forms.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260507100001_create_admission_fee_adjustments.sql` | Adjustments table |
| `supabase/migrations/20260507100002_admission_fee_adjustments_rls.sql` | RLS for adjustments |
| `supabase/migrations/20260507100003_register_admission_fees_adjustment_permissions.sql` | `manage_adjustments` + `override` perms via JSONB on `custom_roles` |
| `supabase/migrations/20260507100004_rpc_admission_resolve_fee_items_for_lead.sql` | SECURITY DEFINER resolution RPC |
| `lib/services/admission/fee-adjustment-service.ts` | CRUD on adjustments + invokes resolution RPC after each mutation |
| `lib/services/admission/fee-resolution-service.ts` | Thin wrapper over the resolution RPC for UI consumers |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/fee-structure-readonly-panel.tsx` | Read-only Structure section in Finance tab |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/fee-adjustments-panel.tsx` | Editable Adjustments section |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/adjustment-dialog.tsx` | Add/edit Adjustment modal |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/resolved-total-panel.tsx` | Live total panel |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/no-match-empty-state.tsx` | When 8-dim lookup returns null |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/legacy-mode-banner.tsx` | Banner on `legacy_fee_mode=true` rows |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/adopt-structure-dialog.tsx` | Preview + confirm flow for legacy → matrix adoption |
| `app/(routes)/learners/enquiries/_components/pre-submit-confirmation-dialog.tsx` | Pre-submit summary modal |

### Modified files

| Path | What changes |
|---|---|
| `supabase/setup/01_tables.sql` | Append `admission_fee_adjustments` DDL |
| `supabase/setup/02_functions.sql` | Append `admission_resolve_fee_items_for_lead` RPC |
| `supabase/setup/03_policies.sql` | Append RLS for adjustments |
| `types/admission.ts` | Append `AdmissionFeeAdjustment`, Create/Update inputs, `ResolvedFeeItem`, `ResolveFeeItemsResult` |
| `app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx` | **Surgical refactor** — replace manual `fee_items[]` repeater with the three new panels + legacy banner; pre-submit dialog wired into the parent form submit |
| `lib/utils/admission-fees-activity-templates.ts` | Add `fee_adjustment.{added,updated,removed,reversed}`, `enquiry.fee_resolved`, `enquiry.fee_match_failed` templates |
| `lib/utils/activity-logger-client.ts` | (Already imports `AdmissionFeesActivityTemplates` from Plan 2 — no change) |

---

## Permission keys registered in this plan

| Key | Default role grants | Used by |
|---|---|---|
| `admission_fees.manage_adjustments` | administrator, super_admin | Add / edit / remove adjustments on enquiries |
| `admission_fees.override` | super_admin only | Edit resolved `fee_items[]` directly on legacy rows (rare escape hatch) |

(Permissions follow the JSONB-on-`custom_roles` pattern documented in Plan 2 retrospective. NO separate `permissions`/`role_permissions` tables.)

---

## Activity log events registered in this plan

`fee_adjustment.added` · `fee_adjustment.updated` · `fee_adjustment.removed` · `fee_adjustment.reversed` · `enquiry.fee_resolved` · `enquiry.fee_match_failed` · `enquiry.legacy_fee_adopted`

---

## Pre-flight checks

```sql
-- All Plan 1 + 2 deliverables present
SELECT
  (SELECT count(*) FROM public.admission_fee_structures) AS structures_count,
  (SELECT count(*) FROM public.admission_fee_structure_items) AS items_count,
  EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name='admission_fee_adjustments')
    AS adjustments_table_exists,
  EXISTS (SELECT 1 FROM pg_proc
            WHERE proname='admission_resolve_fee_items_for_lead')
    AS resolve_rpc_exists,
  (SELECT count(*) FROM public.admission_settings_per_institution
     WHERE use_fee_structures = true) AS institutions_with_flag_on;
```

Expected before Plan 3 starts: structures_count ≥ 0 (admin may have configured some), items_count ≥ 0, adjustments_table_exists = false, resolve_rpc_exists = false, institutions_with_flag_on = 0 (still off — flipped only in Plan 6).

---

# PHASE A — Schema + RPC + permissions

## Task 1: Migration — `admission_fee_adjustments` table

**Files:**
- Create: `supabase/migrations/20260507100001_create_admission_fee_adjustments.sql`
- Modify: `supabase/setup/01_tables.sql` (append)

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260507100001 — Create admission_fee_adjustments table
-- ============================================================================
-- Spec §6.3. Per-enquiry first-class exceptions: scholarships, donor seats,
-- sibling rebates, management waivers, etc. delta_amount is signed: positive
-- = surcharge, negative = discount. billing_category_id NULL = global flat
-- delta against the resolved total.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_fee_adjustments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id          uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    billing_category_id uuid REFERENCES public.billing_categories(id),
    reason_code         text NOT NULL CHECK (reason_code IN
                          ('scholarship_merit','donor_seat','sibling_rebate','management_waiver',
                           'fee_concession','staff_ward','financial_hardship','other')),
    reason_notes        text,
    delta_amount        numeric(15,2) NOT NULL,
    applied_at          timestamptz NOT NULL DEFAULT now(),
    approved_by         uuid REFERENCES public.profiles(id),
    evidence_documents  jsonb NOT NULL DEFAULT '[]'::jsonb,
    status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','reversed')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_fee_adjustments_learner_active
    ON public.admission_fee_adjustments (learner_id, status);

CREATE INDEX IF NOT EXISTS ix_fee_adjustments_category
    ON public.admission_fee_adjustments (billing_category_id);

DROP TRIGGER IF EXISTS trg_admission_fee_adjustments_touch ON public.admission_fee_adjustments;
CREATE TRIGGER trg_admission_fee_adjustments_touch
    BEFORE UPDATE ON public.admission_fee_adjustments
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
```

- [ ] **Step 2: Append DDL to `supabase/setup/01_tables.sql`** (idempotent).

- [ ] **Step 3: Apply migration via `mcp__supabase__apply_migration` with name `20260507100001_create_admission_fee_adjustments`.**

- [ ] **Step 4: Verify**
```sql
SELECT count(*) AS col_count
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='admission_fee_adjustments';
-- Expected: 13.

SELECT count(*) AS index_count
  FROM pg_indexes
 WHERE schemaname='public' AND tablename='admission_fee_adjustments';
-- Expected: ≥ 3 (PK + the two named indexes).
```

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260507100001_create_admission_fee_adjustments.sql supabase/setup/01_tables.sql
git commit -m "$(cat <<'EOF'
feat(admission-fees): create admission_fee_adjustments table

First-class exceptions table: scholarships, donor seats, sibling rebates,
management waivers, etc. Per-learner signed deltas (positive=surcharge,
negative=discount) against either a specific billing_category or globally.
Status reversed/active for audit trail.

Spec: §6.3
Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-03-resolution-engine-finance-tab.md Task 1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration — RLS policies for adjustments

**Files:**
- Create: `supabase/migrations/20260507100002_admission_fee_adjustments_rls.sql`
- Modify: `supabase/setup/03_policies.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260507100002 — RLS policies for admission_fee_adjustments
-- ============================================================================
-- Read: admission_fees.read + access to the parent learner's institution
-- Write: admission_fees.manage_adjustments + same institution access
-- ============================================================================

ALTER TABLE public.admission_fee_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_adjustments_read ON public.admission_fee_adjustments;
CREATE POLICY fee_adjustments_read
    ON public.admission_fee_adjustments FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_adjustments_write ON public.admission_fee_adjustments;
CREATE POLICY fee_adjustments_write
    ON public.admission_fee_adjustments FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.manage_adjustments')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.manage_adjustments')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );
```

- [ ] **Step 2: Append to `supabase/setup/03_policies.sql`**.

- [ ] **Step 3: Apply via `mcp__supabase__apply_migration`.**

- [ ] **Step 4: Verify** all 2 policies present + RLS active:
```sql
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='admission_fee_adjustments'
 ORDER BY 1;
```
Expected: 2 rows.

- [ ] **Step 5: Commit** with conventional message referencing Spec §10.2 and Plan Task 2.

---

## Task 3: Migration — Register `manage_adjustments` + `override` permissions

**Files:**
- Create: `supabase/migrations/20260507100003_register_admission_fees_adjustment_permissions.sql`

This project uses **JSONB on `public.custom_roles.permissions`** (verified in Plan 2 retrospective). Resolver: `public.user_has_permission(text)` reads `cr.permissions->>permission_name`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260507100003 — Register admission_fees.{manage_adjustments,override}
-- ============================================================================

-- Grant manage_adjustments to admin-tier roles
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.manage_adjustments": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE(permissions->>'admission_fees.manage_adjustments','false') <> 'true';

-- Grant override to super_admin only (rare escape hatch)
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.override": true}'::jsonb,
       updated_at  = now()
 WHERE role_key = 'super_admin'
   AND COALESCE(permissions->>'admission_fees.override','false') <> 'true';
```

- [ ] **Step 2: Apply via MCP.**

- [ ] **Step 3: Verify**
```sql
SELECT role_key,
       (permissions ? 'admission_fees.manage_adjustments') AS has_manage_adj,
       (permissions ? 'admission_fees.override')           AS has_override
  FROM public.custom_roles
 WHERE role_key IN ('administrator','super_admin')
 ORDER BY role_key;
-- Expected: administrator → manage_adj=true, override=false
--           super_admin   → manage_adj=true, override=true
```

- [ ] **Step 4: Commit** referencing Spec §10.1.

---

## Task 4: Migration — `admission_resolve_fee_items_for_lead` SECURITY DEFINER RPC

**Files:**
- Create: `supabase/migrations/20260507100004_rpc_admission_resolve_fee_items_for_lead.sql`
- Modify: `supabase/setup/02_functions.sql` (append)

The RPC is the load-bearing piece of Plan 3. Algorithm: matrix lookup → base items from structure → apply active adjustments (per-category deltas merged into matching items, global adjustments appended as synthetic rows) → clamp negatives to 0 → return JSONB array AND persist into `learners_profiles.fee_items` + log activity.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260507100004 — admission_resolve_fee_items_for_lead RPC
-- ============================================================================
-- Spec §7. Computes the resolved fee_items[] for a learner by:
--   1. Looking up matching active fee_structure on the 8 dimensions
--   2. Loading base items from the structure
--   3. Applying active adjustments (per-category merged, global appended)
--   4. Clamping negative resulting amounts to 0 (with audit log entry)
--   5. Persisting result into learners_profiles.fee_items
--   6. Returning the JSONB array
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_adjustments       jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
BEGIN
    -- 1. Load lead's matrix dimensions
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- Legacy mode short-circuit: return existing fee_items unchanged.
    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    -- 2. Lookup matching active fee structure on the 8 dimensions
    SELECT id INTO v_structure_id
      FROM public.admission_fee_structures
     WHERE institution_id        = v_lead.institution_id
       AND degree_id             = v_lead.degree_id
       AND department_id         = v_lead.department_id
       AND programme_id          = v_lead.program_id
       AND quota_id              = v_lead.quota_id
       AND community_category_id = v_lead.community_category_id
       AND accommodation_type_id = v_lead.accommodation_type_id
       AND admission_year_id     = v_lead.admission_year_id
       AND status = 'active'
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        -- No-match: write empty array. Caller distinguishes by inspecting array length.
        UPDATE public.learners_profiles SET fee_items = '[]'::jsonb WHERE id = p_learner_id;
        RETURN '[]'::jsonb;
    END IF;

    -- 3. Base items from the structure
    SELECT jsonb_agg(jsonb_build_object(
                'category_id',   fsi.billing_category_id,
                'category_name', bc.category_name,
                'amount',        fsi.amount,
                'source',        'structure'))
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id;

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    -- 4. Active adjustments — merge per-category, sum global deltas
    -- Per-category merge: GROUP adjustments by billing_category_id, sum delta_amount,
    -- then for each base item add the matching summed delta. Items that don't have
    -- a matching adjustment stay unchanged.
    -- Global (billing_category_id IS NULL) deltas summed into v_global_deltas_sum,
    -- appended as a synthetic "Adjustment" row at the end.

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',   item->>'category_id',
               'category_name', item->>'category_name',
               'amount',        GREATEST(0, (item->>'amount')::numeric
                                  + COALESCE(pc.delta_sum, 0)),
               'source',        item->>'source'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    -- Global deltas
    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',   NULL,
                'category_name', 'Global Adjustment',
                'amount',        v_global_deltas_sum,
                'source',        'adjustment_global'
            )
        );
    END IF;

    -- 5. Persist
    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    -- 6. Return
    RETURN v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) TO authenticated;
```

- [ ] **Step 2: Append to `supabase/setup/02_functions.sql`**.

- [ ] **Step 3: Apply via MCP.**

- [ ] **Step 4: Verify the function exists and is callable**
```sql
SELECT proname, prosecdef
  FROM pg_proc
 WHERE proname = 'admission_resolve_fee_items_for_lead';
-- Expected: 1 row, prosecdef=true (SECURITY DEFINER).
```

- [ ] **Step 5: Smoke test the RPC against a real learner row** (pick any non-legacy learner from a flag-OFF institution — RPC must work even with flag OFF; the flag gates UI, not the RPC):
```sql
-- Pick a learner with all 8 FK dims populated
WITH candidate AS (
  SELECT id FROM public.learners_profiles
   WHERE legacy_fee_mode = false
     AND quota_id IS NOT NULL
     AND community_category_id IS NOT NULL
     AND accommodation_type_id IS NOT NULL
     AND admission_year_id IS NOT NULL
   LIMIT 1
)
SELECT public.admission_resolve_fee_items_for_lead(id) AS resolved
  FROM candidate;
-- Expected: jsonb array. If no fee structure configured for that combo, returns [].
-- If structure exists, returns the items. Either is correct — the test is that the
-- function executes without error.
```

If no candidate row exists (because all `legacy_fee_mode=true` after Plan 1's seed default), pick any row, set `legacy_fee_mode=false` temporarily for the test, then revert:
```sql
UPDATE public.learners_profiles SET legacy_fee_mode = false WHERE id = '<some-uuid>' RETURNING id;
SELECT public.admission_resolve_fee_items_for_lead('<same-uuid>');
UPDATE public.learners_profiles SET legacy_fee_mode = true WHERE id = '<same-uuid>';
```

- [ ] **Step 6: Commit** referencing Spec §7 + Plan Task 4.

---

## Task 5: Type definitions for adjustments + resolution

**Files:**
- Modify: `types/admission.ts` (append)

- [ ] **Step 1: Append types**

```typescript
// ============================================================================
// Admission Fee Adjustments + Resolution — Plan 3 types
// ============================================================================
// Spec §6.3, §7
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-03-resolution-engine-finance-tab.md Task 5

export type AdmissionFeeAdjustmentReasonCode =
  | 'scholarship_merit'
  | 'donor_seat'
  | 'sibling_rebate'
  | 'management_waiver'
  | 'fee_concession'
  | 'staff_ward'
  | 'financial_hardship'
  | 'other';

export type AdmissionFeeAdjustmentStatus = 'active' | 'reversed';

export interface AdmissionFeeAdjustment {
  id: string;
  learner_id: string;
  billing_category_id: string | null;
  reason_code: AdmissionFeeAdjustmentReasonCode;
  reason_notes: string | null;
  delta_amount: number;
  applied_at: string;
  approved_by: string | null;
  evidence_documents: unknown[];
  status: AdmissionFeeAdjustmentStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateAdmissionFeeAdjustmentInput = Pick<
  AdmissionFeeAdjustment,
  'learner_id' | 'reason_code' | 'delta_amount'
> &
  Partial<
    Pick<
      AdmissionFeeAdjustment,
      'billing_category_id' | 'reason_notes' | 'evidence_documents' | 'approved_by'
    >
  >;

export type UpdateAdmissionFeeAdjustmentInput = Partial<
  Pick<
    AdmissionFeeAdjustment,
    'reason_code' | 'reason_notes' | 'delta_amount' | 'evidence_documents' | 'approved_by' | 'status'
  >
>;

/** Shape of a single resolved fee_items[] entry (after RPC merge) */
export interface ResolvedFeeItem {
  category_id: string | null;
  category_name: string;
  amount: number;
  source: 'structure' | 'adjustment_global';
}

/** RPC return wrapper for UI consumers */
export interface ResolveFeeItemsResult {
  items: ResolvedFeeItem[];
  matched: boolean;
  total: number;
}
```

- [ ] **Step 2: Verify per-file syntax** — `npx tsc --noEmit --skipLibCheck types/admission.ts`. Expect zero errors except `@/`-alias resolution failures.

- [ ] **Step 3: Commit** referencing Spec §6.3 + §7 + Plan Task 5.

---

# PHASE B — Service layer

## Task 6: `fee-adjustment-service.ts`

**Files:**
- Create: `lib/services/admission/fee-adjustment-service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionFeeAdjustment,
  CreateAdmissionFeeAdjustmentInput,
  UpdateAdmissionFeeAdjustmentInput,
  ResolvedFeeItem,
} from '@/types/admission';
import { logActivityForCurrentUser, AdmissionFeesActivityTemplates } from '@/lib/utils/activity-logger-client';

/**
 * CRUD for admission_fee_adjustments. Every mutation:
 *   1. Writes to the table
 *   2. Invokes admission_resolve_fee_items_for_lead RPC to recompute fee_items
 *   3. Logs activity
 *
 * Per project memory `feedback_supabase_mutations_must_check_error.md`,
 * every mutation explicitly destructures { error } and throws.
 */
export class FeeAdjustmentService {
  static async listForLearner(learnerId: string, includeReversed = false): Promise<AdmissionFeeAdjustment[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_fee_adjustments')
      .select('*')
      .eq('learner_id', learnerId)
      .order('applied_at', { ascending: false });
    if (!includeReversed) query = query.eq('status', 'active');
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  static async create(input: CreateAdmissionFeeAdjustmentInput): Promise<AdmissionFeeAdjustment> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_adjustments')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;

    // Recompute fee_items via RPC
    await this.resolveAndPersist(input.learner_id);

    // Log activity
    await logActivityForCurrentUser(
      'fee_adjustment.added',
      AdmissionFeesActivityTemplates.fee_adjustment.added(input.reason_code, input.delta_amount),
      { learner_id: input.learner_id, adjustment_id: data.id },
    );
    return data;
  }

  static async update(id: string, input: UpdateAdmissionFeeAdjustmentInput): Promise<AdmissionFeeAdjustment> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_adjustments')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    await this.resolveAndPersist(data.learner_id);
    await logActivityForCurrentUser(
      'fee_adjustment.updated',
      AdmissionFeesActivityTemplates.fee_adjustment.updated(data.reason_code, data.delta_amount),
      { learner_id: data.learner_id, adjustment_id: id },
    );
    return data;
  }

  static async remove(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    // Read learner_id + reason_code first so we can log + resolve after delete
    const { data: row, error: readError } = await supabase
      .from('admission_fee_adjustments')
      .select('learner_id, reason_code')
      .eq('id', id)
      .single();
    if (readError) throw readError;

    const { error: deleteError } = await supabase
      .from('admission_fee_adjustments')
      .delete()
      .eq('id', id);
    if (deleteError) throw deleteError;

    await this.resolveAndPersist(row.learner_id);
    await logActivityForCurrentUser(
      'fee_adjustment.removed',
      AdmissionFeesActivityTemplates.fee_adjustment.removed(row.reason_code),
      { learner_id: row.learner_id, adjustment_id: id },
    );
  }

  /** Soft-revert: status='reversed' instead of delete (keeps audit trail). */
  static async reverse(id: string): Promise<AdmissionFeeAdjustment> {
    return this.update(id, { status: 'reversed' });
  }

  /** Wrap the RPC for callers that don't otherwise need the service. */
  static async resolveAndPersist(learnerId: string): Promise<ResolvedFeeItem[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_resolve_fee_items_for_lead', {
      p_learner_id: learnerId,
    });
    if (error) throw error;
    return (data as ResolvedFeeItem[]) ?? [];
  }
}
```

- [ ] **Step 2: Add the new activity template names to `AdmissionFeesActivityTemplates`** in `lib/utils/admission-fees-activity-templates.ts`:

```typescript
// Existing fee_structure / fee_structure_item branches stay as-is.
// Append:
fee_adjustment: {
  added:    (reason: string, delta: number) =>
    `Adjustment added: ${reason}, delta ₹${delta.toLocaleString()}`,
  updated:  (reason: string, delta: number) =>
    `Adjustment updated: ${reason}, delta ₹${delta.toLocaleString()}`,
  removed:  (reason: string) => `Adjustment removed: ${reason}`,
  reversed: (reason: string) => `Adjustment reversed: ${reason}`,
},
enquiry: {
  fee_resolved:      (count: number, total: number) =>
    `Resolved ${count} fee items totalling ₹${total.toLocaleString()}`,
  fee_match_failed:  () =>
    `Fee structure lookup failed — no matching matrix combo`,
  legacy_fee_adopted: (count: number, total: number) =>
    `Adopted matrix-derived fees: ${count} items totalling ₹${total.toLocaleString()}`,
},
```

- [ ] **Step 3: Verify per-file syntax** for both new/modified files.

- [ ] **Step 4: Commit** — single commit covering both the service file and the templates extension. Reference Spec §8.1 + Plan Task 6.

---

## Task 7: `fee-resolution-service.ts` — UI-facing wrapper

**Files:**
- Create: `lib/services/admission/fee-resolution-service.ts`

A thin wrapper that exposes the RPC plus a convenience computeMatchStatus helper for the Finance tab's no-match empty state.

- [ ] **Step 1: Write the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ResolvedFeeItem,
  ResolveFeeItemsResult,
  FeeStructureMatrixDimensions,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';
import { FeeStructureService } from './fee-structure-service';

/**
 * UI-facing facade over admission_resolve_fee_items_for_lead.
 *
 * Two consumer flows:
 *   1. Finance tab on enquiry edit — calls resolveForLearner whenever an
 *      adjustment changes OR when the matrix dimensions in the form change.
 *   2. Pre-submit confirmation dialog — calls resolveForLearner one last time
 *      to display the totals + line items the lead will be admitted with.
 *
 * The legacy_fee_mode short-circuit lives in the RPC, not here — this service
 * is honest about returning whatever the RPC says.
 */
export class FeeResolutionService {
  /** Calls the RPC and shapes the result. Persists fee_items on the learner. */
  static async resolveForLearner(learnerId: string): Promise<ResolveFeeItemsResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_resolve_fee_items_for_lead', {
      p_learner_id: learnerId,
    });
    if (error) throw error;
    const items = (data as ResolvedFeeItem[]) ?? [];
    const total = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    return { items, matched: items.length > 0, total };
  }

  /**
   * Pure read — does not mutate fee_items. Used by the no-match UI to show a
   * preview *before* the lead is saved.
   */
  static async previewMatchByDimensions(
    dims: FeeStructureMatrixDimensions,
  ): Promise<AdmissionFeeStructureWithItems | null> {
    return FeeStructureService.findByDimensions(dims);
  }
}
```

- [ ] **Step 2: Verify syntax** per-file.

- [ ] **Step 3: Commit** referencing Spec §7 + Plan Task 7.

---

## Task 8: Wire activity logging into `lead-service.ts` for resolution events

**Files:**
- Modify: `lib/services/admission/lead-service.ts`

The `enquiry.fee_resolved` and `enquiry.fee_match_failed` events should fire when the enquiry form invokes the RPC (UI-driven). Wiring lives in the form code (Task 13), not in the service. **This task is intentionally minimal** — for v1, the events are emitted directly from the form on submit (Task 13 Step 5). Skip this task unless `lead-service.ts` itself calls the RPC; if it does, add the logActivityForCurrentUser call inline.

- [ ] **Step 1: Read `lib/services/admission/lead-service.ts`** end to end. Identify any methods that already write to `learners_profiles.fee_items`. If found, wrap them to invoke `FeeResolutionService.resolveForLearner` instead, and log `enquiry.fee_resolved`.

- [ ] **Step 2: If no such methods exist**, mark this task `- [x] N/A — handled in Task 13 form submit` and skip to Task 9.

- [ ] **Step 3: Commit only if changes were made.** Empty task = no commit.

---

# PHASE C — Finance Tab refactor

## Task 9: Finance tab — Read-only Structure section panel

**Files:**
- Create: `app/(routes)/learners/enquiries/_components/form-sections/_fee/fee-structure-readonly-panel.tsx`

This panel renders the matrix-derived line items in a read-only table. Auto-fetches via `FeeResolutionService.previewMatchByDimensions` when the 8 dimensions are present in the form.

- [ ] **Step 1: Read the existing Finance tab** at `app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx` end-to-end. Note:
- How form values are passed in (props vs `useFormContext`)
- What the parent form passes for the 8 matrix dimensions
- The current shape of `fee_items` in the form
- Whether the form is react-hook-form-based (likely yes — verify import)

- [ ] **Step 2: Write the read-only panel**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import type {
  FeeStructureMatrixDimensions,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';

interface Props {
  dims: Partial<FeeStructureMatrixDimensions>;
  onMatchChange?: (matched: boolean) => void;
}

export function FeeStructureReadonlyPanel({ dims, onMatchChange }: Props) {
  const [match, setMatch] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isFullDims(dims)) {
      setMatch(null);
      onMatchChange?.(false);
      return;
    }
    setLoading(true);
    FeeResolutionService.previewMatchByDimensions(dims as FeeStructureMatrixDimensions)
      .then((m) => {
        setMatch(m);
        onMatchChange?.(!!m);
      })
      .finally(() => setLoading(false));
  }, [JSON.stringify(dims)]);

  if (!isFullDims(dims)) {
    return (
      <p className="text-sm text-muted-foreground">
        Select institution, degree, department, programme, quota, community, accommodation, and admission year to load the fee structure.
      </p>
    );
  }
  if (loading) return <p className="text-sm">Loading fee structure…</p>;
  if (!match) {
    // Empty state handled separately by NoMatchEmptyState component.
    return null;
  }

  return (
    <div className="rounded border bg-muted/30 p-4">
      <div className="mb-2 text-sm font-medium">
        Auto-populated from: <span className="font-mono">{match.name}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th>Category</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {match.items.map((it) => (
            <tr key={it.id}>
              <td>{(it as { category_name?: string }).category_name ?? it.billing_category_id}</td>
              <td className="text-right">₹{it.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isFullDims(d: Partial<FeeStructureMatrixDimensions>): boolean {
  return !!(
    d.institution_id && d.degree_id && d.department_id && d.programme_id
    && d.quota_id && d.community_category_id && d.accommodation_type_id && d.admission_year_id
  );
}
```

(`previewMatchByDimensions` returns `AdmissionFeeStructureWithItems | null`; the items array carries `billing_category_id` but not `category_name` directly — the executor should join in via `BillingCategoryService.getActiveBillingCategories()` or extend the service shape. Pick whichever fits the Plan 2 conventions.)

- [ ] **Step 3: Verify syntax** per-file.

- [ ] **Step 4: Commit** referencing Spec §9.2 + Plan Task 9.

---

## Task 10: Finance tab — Adjustments section panel

**Files:**
- Create: `app/(routes)/learners/enquiries/_components/form-sections/_fee/fee-adjustments-panel.tsx`
- Create: `app/(routes)/learners/enquiries/_components/form-sections/_fee/adjustment-dialog.tsx`

The adjustments panel:
- Lists existing adjustments for the learner via `FeeAdjustmentService.listForLearner`
- Shows category + reason + delta + Edit / Remove buttons per row
- Has "+ Add Adjustment" button (gated by `admission_fees.manage_adjustments` permission)
- Plus a small `AdjustmentDialog` modal with form: reason_code dropdown + delta_amount + notes textarea + (optional) billing_category dropdown + (optional) evidence file upload

- [ ] **Step 1: Write `adjustment-dialog.tsx`** — react-hook-form + zod, modeled on Plan 2's `quota-form-dialog.tsx`. Submit calls `FeeAdjustmentService.create` or `update` based on mode. On success: toast + close + parent refetches list.

- [ ] **Step 2: Write `fee-adjustments-panel.tsx`** — fetches list, renders rows + Add button (permission-gated via `usePermission('admission_fees.manage_adjustments')` hook — find the project's permission hook by reading `components/auth/permission-guard.tsx`).

- [ ] **Step 3: Verify syntax** per-file.

- [ ] **Step 4: Commit** referencing Spec §9.2 + Plan Task 10.

---

## Task 11: Finance tab — Resolved Total panel

**Files:**
- Create: `app/(routes)/learners/enquiries/_components/form-sections/_fee/resolved-total-panel.tsx`

A simple panel that shows the live resolved total. Computed by either:
- (Edit mode, learner already exists) calling `FeeResolutionService.resolveForLearner(learnerId)` after every adjustment change
- (Create mode, learner not yet saved) computing locally from the structure preview + adjustments-in-flight (since RPC requires a learner_id)

For v1 simplicity: in **create mode**, compute locally; in **edit mode** call the RPC.

- [ ] **Step 1: Write the component**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import type { ResolvedFeeItem, AdmissionFeeAdjustment, AdmissionFeeStructureWithItems } from '@/types/admission';

interface Props {
  learnerId?: string;                 // present in edit mode
  matchedStructure: AdmissionFeeStructureWithItems | null;
  inFlightAdjustments?: AdmissionFeeAdjustment[];   // create mode only
  refreshTick: number;                 // bumped by parent to force recompute
}

export function ResolvedTotalPanel({ learnerId, matchedStructure, inFlightAdjustments, refreshTick }: Props) {
  const [items, setItems] = useState<ResolvedFeeItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (learnerId) {
      FeeResolutionService.resolveForLearner(learnerId).then((res) => {
        setItems(res.items);
        setTotal(res.total);
      });
    } else if (matchedStructure) {
      const baseItems: ResolvedFeeItem[] = matchedStructure.items.map((it) => ({
        category_id: it.billing_category_id,
        category_name: (it as { category_name?: string }).category_name ?? it.billing_category_id,
        amount: it.amount,
        source: 'structure',
      }));
      // Apply in-flight adjustments locally
      const perCat = new Map<string, number>();
      let global = 0;
      (inFlightAdjustments ?? [])
        .filter((a) => a.status === 'active')
        .forEach((a) => {
          if (a.billing_category_id) {
            perCat.set(a.billing_category_id, (perCat.get(a.billing_category_id) ?? 0) + Number(a.delta_amount));
          } else {
            global += Number(a.delta_amount);
          }
        });
      const merged = baseItems.map((it) => ({
        ...it,
        amount: Math.max(0, it.amount + (perCat.get(it.category_id ?? '') ?? 0)),
      }));
      if (global !== 0) {
        merged.push({
          category_id: null,
          category_name: 'Global Adjustment',
          amount: global,
          source: 'adjustment_global',
        });
      }
      setItems(merged);
      setTotal(merged.reduce((s, it) => s + Number(it.amount), 0));
    } else {
      setItems([]);
      setTotal(0);
    }
  }, [learnerId, matchedStructure, JSON.stringify(inFlightAdjustments), refreshTick]);

  return (
    <div className="rounded border-2 border-primary p-4">
      <div className="mb-2 text-sm font-medium">Resolved Total</div>
      <div className="text-2xl font-bold">₹{total.toLocaleString()}</div>
      <div className="mt-1 text-xs text-muted-foreground">{items.length} line items</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit** referencing Spec §9.2 + Plan Task 11.

---

## Task 12: No-match empty state + Legacy banner + Adopt-structure dialog

**Files:**
- Create: `app/(routes)/learners/enquiries/_components/form-sections/_fee/no-match-empty-state.tsx`
- Create: `app/(routes)/learners/enquiries/_components/form-sections/_fee/legacy-mode-banner.tsx`
- Create: `app/(routes)/learners/enquiries/_components/form-sections/_fee/adopt-structure-dialog.tsx`

- [ ] **Step 1: `no-match-empty-state.tsx`** — appears when `FeeStructureReadonlyPanel` returns null match. Shows: descriptive text "No fee structure configured for B.Tech CSE / Govt Quota / OC / Hostel / 2026-2027" (assemble from dim labels), plus two buttons:
  - "Configure now" → `Link` to `/admission/settings/fees-structure?prefill=<dims-encoded>` (admins only — gate via permission)
  - "Adjust selections" → no-op, just dismiss / scroll to course-selection tab

- [ ] **Step 2: `legacy-mode-banner.tsx`** — appears at the top of the Finance tab when the loaded learner has `legacy_fee_mode = true`. Single line: "This lead uses legacy manual fee entry." + "Migrate to fee structure" button (admin only) → opens `AdoptStructureDialog`.

- [ ] **Step 3: `adopt-structure-dialog.tsx`** — preview + confirm flow. Body:
  - Top: current `learners_profiles.fee_items[]` (legacy)
  - Bottom: structure-derived preview from `FeeStructureService.findByDimensions(...)` using the lead's current dim FKs
  - Confirm button → fetches the resolved items via RPC (after temporarily flipping `legacy_fee_mode = false` in a transaction), saves, logs `enquiry.legacy_fee_adopted`
  - Cancel button → no-op

  **Implementation note**: the flip + RPC + resolve must be atomic. v1 acceptable to do it as service-level sequence (`AdmissionSettingsService.upsert` to flip + `FeeResolutionService.resolveForLearner` + log). Plan 6 will move this into a SECURITY DEFINER RPC for true atomicity.

- [ ] **Step 4: Verify syntax** for all three files per-file.

- [ ] **Step 5: Commit** as a single commit ("Finance tab: empty state + legacy banner + adopt-structure flow") referencing Spec §9.2 + Plan Task 12.

---

## Task 13: Pre-submit confirmation dialog

**Files:**
- Create: `app/(routes)/learners/enquiries/_components/pre-submit-confirmation-dialog.tsx`

A read-only modal that shows the lead summary + matched fee structure + adjustments + grand total, with Cancel / Submit buttons. Per spec §7 Decision: read-only summary, no theatre.

- [ ] **Step 1: Write the dialog**

```tsx
'use client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ResolvedFeeItem, AdmissionFeeStructureWithItems } from '@/types/admission';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  matchedStructureName: string | null;
  resolvedItems: ResolvedFeeItem[];
  total: number;
  onConfirm: () => void;
  submitting?: boolean;
}

export function PreSubmitConfirmationDialog(props: Props) {
  const { open, onOpenChange, leadName, matchedStructureName, resolvedItems, total, onConfirm, submitting } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirm enquiry submission</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><span className="text-muted-foreground">Lead:</span> <strong>{leadName}</strong></div>
          {matchedStructureName ? (
            <div><span className="text-muted-foreground">Fee Structure:</span> {matchedStructureName}</div>
          ) : (
            <div className="text-amber-600">No fee structure matched — submission will fail.</div>
          )}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th>Category</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {resolvedItems.map((it, i) => (
                <tr key={`${it.category_id ?? 'global'}-${i}`}>
                  <td>{it.category_name}</td>
                  <td className="text-right">₹{it.amount.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t font-bold">
                <td>Total</td>
                <td className="text-right">₹{total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={onConfirm} disabled={submitting || !resolvedItems.length}>
            {submitting ? 'Submitting…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into the parent enquiry form** — find the parent file (likely `app/(routes)/learners/enquiries/_components/enquiry-form.tsx` or `new/page.tsx`). The submit handler:
  1. Checks `admission_settings_per_institution.pre_submit_dialog_enabled` for the institution. If false, skip dialog.
  2. Otherwise: open the dialog, await confirm.
  3. On confirm: call the existing submit logic + invoke `FeeResolutionService.resolveForLearner(learnerId)` after creation/update + log `enquiry.fee_resolved` (with item count + total) or `enquiry.fee_match_failed` if items.length === 0.

- [ ] **Step 3: Commit** referencing Spec §9.3 + Plan Task 13.

---

# PHASE D — Integration + Wrap

## Task 14: Refactor Finance tab — replace manual repeater with new panels

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx`

The surgical refactor that ties everything together. Replace the existing manual `fee_items[]` repeater with the four new panels (LegacyBanner if applicable, FeeStructureReadonlyPanel, FeeAdjustmentsPanel, ResolvedTotalPanel) plus NoMatchEmptyState fallback.

- [ ] **Step 1: Read the current `finance-details.tsx`** end-to-end. Note exactly:
- How it receives form values (props vs context)
- The `learnerId` (or equivalent) it has access to (from form vs URL param)
- Whether legacy fee fields (the old individual columns) are also rendered — if yes, decide whether to keep them as fallback or remove (recommend keep behind `legacy_fee_mode === true` only)

- [ ] **Step 2: Replace the body** with the new layout:

```tsx
// Top of the component body, after imports:
const { watch } = useFormContext();
const dims = {
  institution_id: watch('institution_id'),
  degree_id: watch('degree_id'),
  department_id: watch('department_id'),
  programme_id: watch('program_id'),  // NB: form uses program_id for the column
  quota_id: watch('quota_id'),
  community_category_id: watch('community_category_id'),
  accommodation_type_id: watch('accommodation_type_id'),
  admission_year_id: watch('admission_year_id'),
};
const learnerId = watch('id');                  // present in edit mode
const legacyFeeMode = watch('legacy_fee_mode'); // boolean column
const [matchedStructure, setMatchedStructure] = useState<AdmissionFeeStructureWithItems | null>(null);
const [refreshTick, setRefreshTick] = useState(0);
```

Then replace the JSX repeater with:

```tsx
<div className="space-y-4">
  {legacyFeeMode && <LegacyModeBanner learnerId={learnerId} onAdopted={() => setRefreshTick(t => t + 1)} />}

  <section>
    <h3 className="text-sm font-medium mb-2">Fee Structure</h3>
    <FeeStructureReadonlyPanel dims={dims} onMatchChange={(m) => setMatchedStructure(m ? matchedStructure /* loaded inside panel */ : null)} />
    {!matchedStructure && isFullDims(dims) && !legacyFeeMode && (
      <NoMatchEmptyState dims={dims} />
    )}
  </section>

  {learnerId && !legacyFeeMode && (
    <section>
      <h3 className="text-sm font-medium mb-2">Adjustments</h3>
      <FeeAdjustmentsPanel learnerId={learnerId} onChange={() => setRefreshTick(t => t + 1)} />
    </section>
  )}

  {(matchedStructure || legacyFeeMode) && (
    <section>
      <ResolvedTotalPanel
        learnerId={learnerId}
        matchedStructure={matchedStructure}
        refreshTick={refreshTick}
      />
    </section>
  )}
</div>
```

- [ ] **Step 3: Delete the obsolete repeater code** (the `useFieldArray('fee_items')` block + Add Fee button + per-row inputs). Keep any imports the new panels need; remove others.

- [ ] **Step 4: Smoke test** — load an existing legacy lead, verify banner shows. Load a non-legacy lead with all 8 dims, verify Structure panel populates. Load a non-legacy lead with missing dims, verify the "select all 8" hint shows.

- [ ] **Step 5: Verify syntax** per-file.

- [ ] **Step 6: Commit** with detailed message — this is the most user-visible single change in Plan 3.

---

## Task 15: Final integration smoke + roadmap update + push

- [ ] **Step 1: End-to-end smoke**

As an admin with `admission_fees.manage` + `admission_fees.manage_adjustments`:
1. Configure a fee structure for a known dim combo via `/admission/settings/fees-structure` (if not already configured)
2. Create a new enquiry with all 8 dims matching that combo. Finance tab should show the structure rows read-only.
3. Add a per-category adjustment (e.g. "scholarship_merit, -5000 against Tuition Fee"). Resolved Total should drop by 5000.
4. Add a global adjustment (e.g. "donor_seat, +10000, no category"). Resolved Total should rise by 10000.
5. Click Submit. Pre-submit dialog appears. Confirm. Lead saved.
6. Reload the lead. Verify `learners_profiles.fee_items` JSONB matches the resolved view.
7. Pick a legacy lead (`legacy_fee_mode=true`). Verify the legacy banner appears. Click "Migrate". Preview shows structure-derived. Confirm. Verify `legacy_fee_mode=false` and `fee_items` updated.

- [ ] **Step 2: Mark Plan 3 ✅ Completed in the roadmap** — same pattern as Plans 1 and 2 retrospectives. Note any deferrals to v1.5 / Plan 6.

- [ ] **Step 3: Commit + push.**

```bash
git add docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md
git commit -m "docs(admission-fees): mark Plan 3 (Resolution Engine + Finance Tab) complete"
git push origin main
```

---

## Plan-3 Spec Coverage Self-Review

| Spec section | Addressed by |
|---|---|
| §6.3 admission_fee_adjustments DDL | Task 1 |
| §7 Resolution engine RPC | Task 4 |
| §8.1 fee-adjustment-service.ts | Task 6 |
| §8.1 fee-resolution-service.ts | Task 7 |
| §9.2 Finance tab — Structure panel | Task 9 |
| §9.2 Finance tab — Adjustments panel + dialog | Task 10 |
| §9.2 Finance tab — Resolved Total | Task 11 |
| §9.2 No-match empty state, legacy banner, adopt-structure dialog | Task 12 |
| §9.3 Pre-submit confirmation dialog | Task 13 |
| §10.1 admission_fees.{manage_adjustments,override} permission keys | Task 3 |
| §10.2 RLS for adjustments | Task 2 |
| §11 activity log events for fee_adjustment.* and enquiry.fee_* | Task 6 + Task 13 |
| §12.1 Finance tab refactor wires the new panels | Task 14 |

**Not in this plan (deferred to later plans):**
- Atomic account transition + documents-checklist + status-change dialog → Plan 4
- Fee-change reconciliation → Plan 5
- Cutover & adoption (feature flag enforcement) → Plan 6

---

## Open Items / Risks

- **`finance-details.tsx` integration is the riskiest task.** The current file likely has tight coupling to `useFieldArray('fee_items')`. Task 14 needs to surgically remove that and wire the new panels in. **Read the file first** before writing replacement code.
- **Form context vs props**: the new panels assume form data is accessible via `useFormContext()`. If the parent form passes values explicitly via props, adapt the panel signatures.
- **`category_name` in items**: `admission_fee_structure_items` doesn't denormalize the category name. The read-only panel needs to JOIN against `billing_categories` either at the DB layer (extend `getWithItems` to include the joined name) or at the UI layer (fetch all categories once + map locally).
- **Adopt-structure flow atomicity**: v1 does it as a service-level sequence (flip flag → resolve → log). Plan 6 should wrap this in a single SECURITY DEFINER RPC for true atomicity. Document in retrospective.
- **`useFormContext` vs explicit props in adjustment-dialog**: react-hook-form has separate form instances per `<Form>`; the adjustment dialog should NOT share the parent enquiry form's context — use a local `useForm` instance for the dialog.
- **Negative-amount clamp loses signal**: when an adjustment drives a category amount below 0, the RPC clamps to 0 silently. v1 acceptable; v1.5 could write a row to `data_quality_review` or fire `enquiry.fee_clamped_to_zero` activity event.
- **`legacy_fee_mode` flow without admin permission**: counsellors viewing a legacy lead should NOT see the "Migrate to fee structure" button. Gate via `usePermission('admission_fees.manage_adjustments')` at minimum (admin-only flow).
