# Admission Fees — Plan 4: Atomic Account Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Roadmap:** [`2026-05-05-admission-fees-roadmap.md`](./2026-05-05-admission-fees-roadmap.md)
**Spec:** [`docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)
**Predecessors:** Plan 1 ✅ · Plan 2 ✅ · Plan 3 ✅

**Goal:** Make the `approved → account` lifecycle transition **atomic and gated**. The transition triggers a documents-checklist confirmation dialog; on confirm, a single SECURITY DEFINER RPC validates the fee structure resolves, persists documents, updates status, generates bills via the existing `createBillsFromProfile` pattern (ported to PL/pgSQL for true atomicity), and emits activity events. Any failure rolls back everything — status unchanged, no bills, no partial state.

**Architecture:** One new table (`learner_admission_documents`). One new SECURITY DEFINER RPC (`admission_account_transition_with_bills`) doing all of: documents persistence + status update + bill generation. One service file (`admission-document-service.ts`) for documents CRUD outside the transition path. One thin wrapper service (`account-transition-service.ts`) for UI consumers. One new dialog component (status-change two-panel modal). Wiring into the lead-row "Move to Account" action. The existing `OnboardingService.markAsAccount` becomes a thin wrapper around the new RPC.

**Tech Stack:** Same as prior plans: Supabase Postgres + plpgsql; TypeScript service layer; Next.js 16 App Router client components; Tailwind + Radix UI; `react-hook-form` + `zod`.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260508100001_create_learner_admission_documents.sql` | Documents audit table |
| `supabase/migrations/20260508100002_learner_admission_documents_rls.sql` | RLS for documents |
| `supabase/migrations/20260508100003_register_admission_documents_permission.sql` | `admission_documents.manage` perm via JSONB on `custom_roles` |
| `supabase/migrations/20260508100004_rpc_admission_account_transition_with_bills.sql` | Atomic transition + bill generation RPC |
| `lib/services/admission/admission-document-service.ts` | CRUD on documents (used outside the transition path) |
| `lib/services/admission/account-transition-service.ts` | Thin wrapper over the transition RPC |
| `app/(routes)/admission/leads/_components/_account/account-transition-dialog.tsx` | Two-panel modal (fee summary + documents checklist) |
| `app/(routes)/admission/leads/_components/_account/documents-checklist.tsx` | Doc-checkboxes with received_via + document_ref inputs |
| `app/(routes)/admission/leads/_components/_account/account-fee-summary-panel.tsx` | Top panel: lead name + matched structure + items + total |

### Modified files

| Path | What changes |
|---|---|
| `supabase/setup/01_tables.sql` | Append `learner_admission_documents` DDL |
| `supabase/setup/02_functions.sql` | Append `admission_account_transition_with_bills` RPC |
| `supabase/setup/03_policies.sql` | Append RLS for documents |
| `types/admission.ts` | Append `LearnerAdmissionDocument`, `AccountTransitionPayload`, `AccountTransitionResult`, `AccountTransitionDocumentEntry` types |
| `lib/services/billing/onboarding/onboarding-service.ts` | `markAsAccount` becomes a thin wrapper over the new RPC |
| `app/(routes)/admission/leads/_components/row-actions.tsx` | Add "Move to Account" action that opens the new dialog |
| `lib/utils/admission-fees-activity-templates.ts` | Add `lifecycle.account_transition`, `documents.received`, `bill.auto_generated` template branches |

---

## Permission key registered in this plan

| Key | Default role grants | Used by |
|---|---|---|
| `admission_documents.manage` | administrator, super_admin, admission_counselor (counsellors record what docs they received from parents) | Documents-checklist write inside the status-change dialog |

(Permissions follow the JSONB-on-`custom_roles` pattern. NO separate `permissions`/`role_permissions` tables.)

---

## Activity log events registered in this plan

`lifecycle.account_transition` · `documents.received` · `bill.auto_generated`

---

## Pre-flight checks

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name='learner_admission_documents')
    AS docs_table_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='admission_account_transition_with_bills')
    AS transition_rpc_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='admission_resolve_fee_items_for_lead')
    AS resolve_rpc_exists,
  (SELECT count(*) FROM public.admission_settings_per_institution) AS settings_rows;
```

Expected before Plan 4 starts: `docs_table_exists=false`, `transition_rpc_exists=false`, `resolve_rpc_exists=true` (Plan 3), `settings_rows = institution_count` (Plan 1).

Also confirm bill generation engine signature is what the RPC will reproduce:

```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='billing_student_bills'
 ORDER BY ordinal_position;
```

Note the columns; the RPC's INSERT into `billing_student_bills` must match these exactly.

---

# PHASE A — Schema + RPC + permissions

## Task 1: Migration — `learner_admission_documents` table

**Files:**
- Create: `supabase/migrations/20260508100001_create_learner_admission_documents.sql`
- Modify: `supabase/setup/01_tables.sql` (append)

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260508100001 — Create learner_admission_documents table
-- ============================================================================
-- Spec §6.6. Audit trail for documents collected at the status='account'
-- transition. One row per (learner_id, doc_type) — UNIQUE constraint enforces
-- the latest receipt overwrites prior. doc_type is free-form text driven by
-- admission_settings_per_institution.required_documents_for_account_transition
-- (a JSONB array of strings).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learner_admission_documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    doc_type        text NOT NULL,
    is_received     boolean NOT NULL DEFAULT false,
    received_at     timestamptz,
    received_by     uuid REFERENCES public.profiles(id),
    received_via    text CHECK (received_via IN ('physical','email','upload')),
    document_ref    text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (learner_id, doc_type)
);

CREATE INDEX IF NOT EXISTS ix_learner_admission_documents_learner
    ON public.learner_admission_documents (learner_id, is_received);

DROP TRIGGER IF EXISTS trg_learner_admission_documents_touch
    ON public.learner_admission_documents;
CREATE TRIGGER trg_learner_admission_documents_touch
    BEFORE UPDATE ON public.learner_admission_documents
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
```

- [ ] **Step 2: Append DDL to `supabase/setup/01_tables.sql`** (idempotent).

- [ ] **Step 3: Apply migration via `mcp__supabase__apply_migration`** with name `20260508100001_create_learner_admission_documents`.

- [ ] **Step 4: Verify**
```sql
SELECT count(*) AS col_count
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='learner_admission_documents';
-- Expected: 11 (id, learner_id, doc_type, is_received, received_at, received_by,
-- received_via, document_ref, notes, created_at, updated_at).

SELECT count(*) AS index_count
  FROM pg_indexes
 WHERE schemaname='public' AND tablename='learner_admission_documents';
-- Expected: ≥ 3 (PK + UNIQUE + named index).
```

- [ ] **Step 5: Commit** with conventional message referencing Spec §6.6 + Plan Task 1.

---

## Task 2: Migration — RLS policies for documents

**Files:**
- Create: `supabase/migrations/20260508100002_learner_admission_documents_rls.sql`
- Modify: `supabase/setup/03_policies.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260508100002 — RLS policies for learner_admission_documents
-- ============================================================================
-- Read: anyone with admission_fees.read or admission_documents.manage who
--       has institution access to the parent learner.
-- Write: admission_documents.manage + same institution access.
-- ============================================================================

ALTER TABLE public.learner_admission_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learner_admission_documents_read
    ON public.learner_admission_documents;
CREATE POLICY learner_admission_documents_read
    ON public.learner_admission_documents FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND (
             public.user_has_permission('admission_fees.read')
             OR public.user_has_permission('admission_documents.manage')
           )
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS learner_admission_documents_write
    ON public.learner_admission_documents;
CREATE POLICY learner_admission_documents_write
    ON public.learner_admission_documents FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND public.user_has_permission('admission_documents.manage')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND public.user_has_permission('admission_documents.manage')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );
```

- [ ] **Step 2: Append to `supabase/setup/03_policies.sql`**.

- [ ] **Step 3: Apply.**

- [ ] **Step 4: Verify** all 2 policies present:
```sql
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='learner_admission_documents'
 ORDER BY 1;
-- Expected: 2 rows.
```

- [ ] **Step 5: Commit** referencing Spec §10.2 + Plan Task 2.

---

## Task 3: Migration — Register `admission_documents.manage` permission

**Files:**
- Create: `supabase/migrations/20260508100003_register_admission_documents_permission.sql`

JSONB-on-`custom_roles` pattern (verified in Plans 2-3 retrospectives).

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260508100003 — Register admission_documents.manage permission
-- ============================================================================
-- Counsellors collect documents from parents at the time of admission, so
-- they need this permission. Admin-tier roles too.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_documents.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('admission_counselor','expo_counselor','administrator','super_admin')
   AND COALESCE(permissions->>'admission_documents.manage','false') <> 'true';
```

- [ ] **Step 2: Apply.**

- [ ] **Step 3: Verify**
```sql
SELECT role_key,
       (permissions ? 'admission_documents.manage') AS has_perm
  FROM public.custom_roles
 WHERE role_key IN ('admission_counselor','expo_counselor','administrator','super_admin')
 ORDER BY role_key;
-- Expected: 4 rows, has_perm=true on all.
```

- [ ] **Step 4: Commit** referencing Spec §10.1 + Plan Task 3.

---

## Task 4: Migration — `admission_account_transition_with_bills` SECURITY DEFINER RPC

**Files:**
- Create: `supabase/migrations/20260508100004_rpc_admission_account_transition_with_bills.sql`
- Modify: `supabase/setup/02_functions.sql` (append)

This is the load-bearing piece of Plan 4. Algorithm:
1. Validate caller has permission (`admission_documents.manage`)
2. Validate lead exists, current status is `approved` (or other valid pre-account)
3. Validate fee structure resolves — call `admission_resolve_fee_items_for_lead` and check result is non-empty (or learner is `legacy_fee_mode=true`, in which case existing fee_items must be non-empty)
4. Validate all required documents from `p_received_documents` cover what the institution requires (read `admission_settings_per_institution.required_documents_for_account_transition`)
5. UPSERT documents into `learner_admission_documents`
6. UPDATE `learners_profiles` SET `lifecycle_status='account'`
7. Generate bills inline (port of `createBillsFromProfile` to PL/pgSQL):
   - Idempotency: count bills, skip if > 0
   - Read `learners_profiles.fee_items` (already resolved)
   - For each item: INSERT a row into `billing_student_bills` with the standard fields
8. RAISE NOTICE / log activity events for `documents.received` (per doc), `lifecycle.account_transition`, `bill.auto_generated`
9. Return JSONB result with success flag + bills_generated count

All in one transaction. Any RAISE EXCEPTION rolls back everything.

- [ ] **Step 1: Read `OnboardingService.createBillsFromProfile`** at `lib/services/billing/onboarding/onboarding-service.ts` end-to-end. Note exactly:
- The fields it inserts into `billing_student_bills`
- The default values (e.g. `due_date = now + 30 days`, `status = 'unpaid'`, `quantity = 1`, `tax_amount = 0`)
- Any computation it does (e.g. `final_amount = total_amount - tax_amount + tax_amount`)
- The remarks template it writes
- How it sources `created_by` (likely auth.uid)
- Whether it reads `legacy_fee_mode` to switch between `fee_items[]` JSONB vs the legacy individual fields (if so, the RPC must handle both paths)

This is critical — the RPC must produce bills that look identical to what `createBillsFromProfile` produces today, so the existing onboarding/payment flow keeps working unchanged.

- [ ] **Step 2: Write the RPC migration**

```sql
-- ============================================================================
-- 20260508100004 — admission_account_transition_with_bills RPC
-- ============================================================================
-- Spec §8.3.1. Atomic: documents persistence + status update + bill generation.
-- Any RAISE EXCEPTION rolls back everything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_account_transition_with_bills(
    p_learner_id          uuid,
    p_required_documents  jsonb,   -- ["pan","aadhaar","parent_id","agreement_form"]
    p_received_documents  jsonb    -- [{"doc_type":"pan","received_via":"physical","document_ref":"PAN-1234"}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead              record;
    v_fee_items         jsonb;
    v_required          text[];
    v_received_types    text[];
    v_missing           text[];
    v_doc               jsonb;
    v_bills_existing    integer;
    v_bills_inserted    integer := 0;
    v_item              jsonb;
    v_due_date          date;
    v_caller            uuid := auth.uid();
BEGIN
    -- 1. Permission check
    IF NOT public.user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Load + validate lead
    SELECT id, institution_id, lifecycle_status, fee_items, legacy_fee_mode
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.lifecycle_status NOT IN ('admitted','pending','approved') THEN
        RAISE EXCEPTION 'invalid_status_for_account_transition: current=%, allowed=admitted/pending/approved',
            v_lead.lifecycle_status;
    END IF;

    -- 3. Validate fee structure resolves (or legacy mode has existing fee_items)
    IF v_lead.legacy_fee_mode = false THEN
        v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
        IF jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'fee_structure_not_resolvable: no matching matrix combo';
        END IF;
    ELSE
        v_fee_items := v_lead.fee_items;
        IF v_fee_items IS NULL OR jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'legacy_fee_items_empty: cannot transition with no fees';
        END IF;
    END IF;

    -- 4. Validate documents
    SELECT array_agg(value::text) INTO v_required
      FROM jsonb_array_elements_text(p_required_documents);

    SELECT array_agg(value->>'doc_type') INTO v_received_types
      FROM jsonb_array_elements(p_received_documents) AS value;

    SELECT array_agg(req) INTO v_missing
      FROM unnest(v_required) AS req
     WHERE req <> ALL (COALESCE(v_received_types, ARRAY[]::text[]));

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'required_documents_missing: %', array_to_string(v_missing, ',');
    END IF;

    -- 5. UPSERT documents
    FOR v_doc IN SELECT * FROM jsonb_array_elements(p_received_documents)
    LOOP
        INSERT INTO public.learner_admission_documents
            (learner_id, doc_type, is_received, received_at, received_by, received_via, document_ref)
        VALUES
            (p_learner_id,
             v_doc->>'doc_type',
             true,
             now(),
             v_caller,
             v_doc->>'received_via',
             v_doc->>'document_ref')
        ON CONFLICT (learner_id, doc_type) DO UPDATE
            SET is_received  = true,
                received_at  = EXCLUDED.received_at,
                received_by  = EXCLUDED.received_by,
                received_via = EXCLUDED.received_via,
                document_ref = EXCLUDED.document_ref,
                updated_at   = now();
    END LOOP;

    -- 6. Update lifecycle status
    UPDATE public.learners_profiles
       SET lifecycle_status = 'account',
           updated_at = now(),
           updated_by = v_caller
     WHERE id = p_learner_id;

    -- 7. Generate bills (idempotent — skip if any exist)
    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 THEN
        v_due_date := (now() + interval '30 days')::date;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_fee_items)
        LOOP
            -- Only insert items with positive amount
            IF (v_item->>'amount')::numeric > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id,
                    bill_description, due_date, quantity,
                    unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    p_learner_id,
                    v_lead.institution_id,
                    NULLIF(v_item->>'category_id','')::uuid,
                    COALESCE(v_item->>'category_name','Fee Item'),
                    v_due_date,
                    1,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    0,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    'unpaid',
                    'Onboarding bill — auto-generated via account transition RPC',
                    v_caller
                );
                v_bills_inserted := v_bills_inserted + 1;
            END IF;
        END LOOP;
    END IF;

    -- 8. Return result (activity log entries written by service-layer caller per
    --    project pattern — keeping the RPC focused on data integrity)
    RETURN jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'lifecycle_status', 'account',
        'documents_recorded', jsonb_array_length(p_received_documents),
        'bills_existing', v_bills_existing,
        'bills_generated', v_bills_inserted,
        'fee_items_count', jsonb_array_length(v_fee_items)
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Surface the original error; transaction auto-rolls back
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb) TO authenticated;
```

**IMPORTANT**: the column list in the bills INSERT must match `OnboardingService.createBillsFromProfile`. Verify after Step 1 inspection. If the existing service inserts more columns (e.g. `is_recurring`, `recurrence_pattern`), add them to the RPC INSERT with the same defaults.

- [ ] **Step 3: Append to `supabase/setup/02_functions.sql`**.

- [ ] **Step 4: Apply migration.**

- [ ] **Step 5: Verify** function exists + is SECURITY DEFINER:
```sql
SELECT proname, prosecdef
  FROM pg_proc
 WHERE proname = 'admission_account_transition_with_bills';
-- Expected: 1 row, prosecdef=true.
```

- [ ] **Step 6: Smoke test the RPC** (read-only or against a disposable test row):
```sql
-- Find a candidate lead in 'approved' status with all 8 dims set
SELECT id FROM public.learners_profiles
 WHERE lifecycle_status = 'approved'
   AND legacy_fee_mode = false
   AND quota_id IS NOT NULL
   AND community_category_id IS NOT NULL
   AND accommodation_type_id IS NOT NULL
   AND admission_year_id IS NOT NULL
 LIMIT 1;

-- Smoke (DO NOT RUN ON PRODUCTION DATA — use a test learner only)
-- SELECT public.admission_account_transition_with_bills(
--   :learner_id,
--   '["pan","aadhaar"]'::jsonb,
--   '[{"doc_type":"pan","received_via":"physical","document_ref":"TEST"},
--     {"doc_type":"aadhaar","received_via":"physical","document_ref":"TEST"}]'::jsonb
-- );
```

If no candidate exists, document why in the commit message and skip the smoke (the RPC's correctness is verified by Plans 5-6 integration tests).

- [ ] **Step 7: Commit** referencing Spec §8.3.1 + Plan Task 4.

---

## Task 5: Type definitions for documents + transition

**Files:**
- Modify: `types/admission.ts` (append)

- [ ] **Step 1: Append types**

```typescript
// ============================================================================
// Atomic Account Transition — Plan 4 types
// ============================================================================
// Spec §6.6, §8.3.1
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-04-atomic-account-transition.md Task 5

export interface LearnerAdmissionDocument {
  id: string;
  learner_id: string;
  doc_type: string;
  is_received: boolean;
  received_at: string | null;
  received_by: string | null;
  received_via: 'physical' | 'email' | 'upload' | null;
  document_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AccountTransitionDocumentEntry = {
  doc_type: string;
  received_via: 'physical' | 'email' | 'upload';
  document_ref?: string;
};

export interface AccountTransitionPayload {
  learner_id: string;
  required_documents: string[];                          // doc_types from settings
  received_documents: AccountTransitionDocumentEntry[];  // user-provided
}

export interface AccountTransitionResult {
  success: boolean;
  learner_id: string;
  lifecycle_status: 'account';
  documents_recorded: number;
  bills_existing: number;
  bills_generated: number;
  fee_items_count: number;
}
```

- [ ] **Step 2: Verify per-file**: `npx tsc --noEmit --skipLibCheck types/admission.ts`. Zero errors.

- [ ] **Step 3: Commit** referencing Spec §6.6 + §8.3.1 + Plan Task 5.

---

# PHASE B — Service layer

## Task 6: `admission-document-service.ts` — Documents CRUD outside transition

**Files:**
- Create: `lib/services/admission/admission-document-service.ts`

The transition path uses the RPC. This service handles the side-by-side documents listing + manual edits OUTSIDE of the transition (e.g. admin viewing what was collected for a learner who's already at status='account').

- [ ] **Step 1: Write the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LearnerAdmissionDocument } from '@/types/admission';

export class AdmissionDocumentService {
  static async listForLearner(learnerId: string): Promise<LearnerAdmissionDocument[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learner_admission_documents')
      .select('*')
      .eq('learner_id', learnerId)
      .order('doc_type', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  static async upsert(input: {
    learner_id: string;
    doc_type: string;
    is_received?: boolean;
    received_via?: 'physical' | 'email' | 'upload' | null;
    document_ref?: string | null;
    notes?: string | null;
  }): Promise<LearnerAdmissionDocument> {
    const supabase = createClientSupabaseClient();
    const payload = {
      ...input,
      received_at: input.is_received ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from('learner_admission_documents')
      .upsert(payload, { onConflict: 'learner_id,doc_type' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async remove(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('learner_admission_documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 2: Verify per-file syntax.**

- [ ] **Step 3: Commit** referencing Spec §8.1 + Plan Task 6.

---

## Task 7: `account-transition-service.ts` — RPC wrapper for UI consumers

**Files:**
- Create: `lib/services/admission/account-transition-service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AccountTransitionPayload,
  AccountTransitionResult,
} from '@/types/admission';
import { logActivityForCurrentUser, AdmissionFeesActivityTemplates }
  from '@/lib/utils/activity-logger-client';

/**
 * Wraps admission_account_transition_with_bills SECURITY DEFINER RPC.
 *
 * The RPC does the atomic data work; this service emits the activity log
 * entries (which fire from the calling user's session, not from inside the
 * SECURITY DEFINER context — keeping audit trail honest about who did the
 * action).
 */
export class AccountTransitionService {
  static async transitionToAccount(payload: AccountTransitionPayload): Promise<AccountTransitionResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_account_transition_with_bills', {
      p_learner_id: payload.learner_id,
      p_required_documents: payload.required_documents,
      p_received_documents: payload.received_documents,
    });
    if (error) throw error;
    const result = data as AccountTransitionResult;

    // Activity logs — written from caller's session for honest audit
    await Promise.all([
      logActivityForCurrentUser(
        'lifecycle.account_transition',
        AdmissionFeesActivityTemplates.lifecycle.account_transition(result.bills_generated),
        { learner_id: payload.learner_id, bills_generated: result.bills_generated },
      ),
      ...payload.received_documents.map((d) =>
        logActivityForCurrentUser(
          'documents.received',
          AdmissionFeesActivityTemplates.documents.received(d.doc_type, d.received_via),
          { learner_id: payload.learner_id, doc_type: d.doc_type },
        ),
      ),
      result.bills_generated > 0
        ? logActivityForCurrentUser(
            'bill.auto_generated',
            AdmissionFeesActivityTemplates.bill.auto_generated(result.bills_generated),
            { learner_id: payload.learner_id, count: result.bills_generated },
          )
        : Promise.resolve(),
    ]);

    return result;
  }
}
```

- [ ] **Step 2: Add the new activity templates** to `lib/utils/admission-fees-activity-templates.ts`. Append the following branches to `AdmissionFeesActivityTemplates`:

```typescript
lifecycle: {
  account_transition: (billsGenerated: number) =>
    `Moved to Account stage; ${billsGenerated} bill${billsGenerated !== 1 ? 's' : ''} generated`,
},
documents: {
  received: (docType: string, via: string) =>
    `Document received: ${docType} (via ${via})`,
},
bill: {
  auto_generated: (count: number) =>
    `Auto-generated ${count} bill${count !== 1 ? 's' : ''} via account transition`,
},
```

- [ ] **Step 3: Verify per-file syntax** for both files.

- [ ] **Step 4: Commit** as a single commit referencing Spec §8.1 + Plan Task 7.

---

## Task 8: Wire `OnboardingService.markAsAccount` to use the new RPC

**Files:**
- Modify: `lib/services/billing/onboarding/onboarding-service.ts`

The existing `markAsAccount(learnerId)` in `OnboardingService` does just a status update. Replace it with a call to `AccountTransitionService.transitionToAccount` that takes a documents payload. **Backward-compat**: if the dialog isn't yet wired everywhere, `markAsAccount(learnerId)` without documents should still work — pass an empty docs payload AND read `admission_settings_per_institution.required_documents_for_account_transition` to validate. If required is non-empty AND no documents passed, throw a clear error.

- [ ] **Step 1: Read current `markAsAccount`** end-to-end. Understand how it's currently called (search for callers in `app/(routes)/billing/onboarding/`).

- [ ] **Step 2: Refactor**

```typescript
// In lib/services/billing/onboarding/onboarding-service.ts
import { AccountTransitionService } from '@/lib/services/admission/account-transition-service';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';

// ... inside OnboardingService class:

static async markAsAccount(
  learnerId: string,
  receivedDocuments?: AccountTransitionDocumentEntry[],
): Promise<AccountTransitionResult> {
  // Read institution + required docs config
  const supabase = createClientSupabaseClient();
  const { data: lp, error: readError } = await supabase
    .from('learners_profiles')
    .select('institution_id')
    .eq('id', learnerId)
    .single();
  if (readError) throw readError;

  const settings = await AdmissionSettingsService.getByInstitution(lp.institution_id);
  const required = settings?.required_documents_for_account_transition ?? [];

  return AccountTransitionService.transitionToAccount({
    learner_id: learnerId,
    required_documents: required,
    received_documents: receivedDocuments ?? [],
  });
}
```

The legacy `validateFinanceFields` call (if present in the original) can be removed — the RPC does its own fee-resolution validation.

- [ ] **Step 3: Verify per-file syntax.**

- [ ] **Step 4: Commit** referencing Spec §8.1 + Plan Task 8.

---

# PHASE C — Status-change dialog

## Task 9: Documents checklist component

**Files:**
- Create: `app/(routes)/admission/leads/_components/_account/documents-checklist.tsx`

Renders one row per required doc: checkbox + (when ticked) `received_via` dropdown + optional `document_ref` text input. Emits a list of `AccountTransitionDocumentEntry` to the parent via `onChange`.

- [ ] **Step 1: Write the component**

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AccountTransitionDocumentEntry } from '@/types/admission';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  requiredDocTypes: string[];
  onChange: (entries: AccountTransitionDocumentEntry[]) => void;
  onValidityChange?: (valid: boolean) => void;
}

const VIA_OPTIONS = [
  { value: 'physical', label: 'Physical' },
  { value: 'email', label: 'Email' },
  { value: 'upload', label: 'Upload' },
] as const;

export function DocumentsChecklist({ requiredDocTypes, onChange, onValidityChange }: Props) {
  const [entries, setEntries] = useState<Record<string, { received_via?: string; document_ref?: string; checked: boolean }>>({});

  // Initialize state when requiredDocTypes changes
  useEffect(() => {
    const next: typeof entries = {};
    for (const dt of requiredDocTypes) {
      next[dt] = entries[dt] ?? { checked: false };
    }
    setEntries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(requiredDocTypes)]);

  // Compute output + validity
  const output: AccountTransitionDocumentEntry[] = useMemo(
    () =>
      Object.entries(entries)
        .filter(([_, v]) => v.checked && v.received_via)
        .map(([dt, v]) => ({
          doc_type: dt,
          received_via: v.received_via as 'physical' | 'email' | 'upload',
          document_ref: v.document_ref,
        })),
    [entries],
  );

  const allRequiredOk = useMemo(
    () => requiredDocTypes.every((dt) => {
      const e = entries[dt];
      return e?.checked && e?.received_via;
    }),
    [entries, requiredDocTypes],
  );

  useEffect(() => { onChange(output); }, [output]);
  useEffect(() => { onValidityChange?.(allRequiredOk); }, [allRequiredOk, onValidityChange]);

  return (
    <div className="space-y-2">
      {requiredDocTypes.map((dt) => {
        const e = entries[dt] ?? { checked: false };
        return (
          <div key={dt} className="flex items-center gap-3">
            <Checkbox
              checked={e.checked}
              onCheckedChange={(checked) =>
                setEntries((s) => ({ ...s, [dt]: { ...s[dt], checked: !!checked } }))
              }
            />
            <span className="w-40 text-sm font-medium capitalize">{dt.replace(/_/g, ' ')}</span>
            {e.checked && (
              <>
                <Select
                  value={e.received_via}
                  onValueChange={(v) => setEntries((s) => ({ ...s, [dt]: { ...s[dt], received_via: v } }))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Via…" />
                  </SelectTrigger>
                  <SelectContent>
                    {VIA_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  placeholder="Reference (optional)"
                  value={e.document_ref ?? ''}
                  onChange={(ev) => setEntries((s) => ({ ...s, [dt]: { ...s[dt], document_ref: ev.target.value } }))}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify per-file syntax.**

- [ ] **Step 3: Commit** referencing Spec §9.4 + Plan Task 9.

---

## Task 10: Account fee summary panel + Status-change dialog

**Files:**
- Create: `app/(routes)/admission/leads/_components/_account/account-fee-summary-panel.tsx`
- Create: `app/(routes)/admission/leads/_components/_account/account-transition-dialog.tsx`

- [ ] **Step 1: Write `account-fee-summary-panel.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import type { ResolvedFeeItem } from '@/types/admission';

interface Props { learnerId: string; }

export function AccountFeeSummaryPanel({ learnerId }: Props) {
  const [items, setItems] = useState<ResolvedFeeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    FeeResolutionService.resolveForLearner(learnerId)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .finally(() => setLoading(false));
  }, [learnerId]);

  if (loading) return <p>Loading fee summary…</p>;
  if (items.length === 0) return <p className="text-amber-600">No fees resolved — transition will fail.</p>;

  return (
    <div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground"><th>Category</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
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
  );
}
```

- [ ] **Step 2: Write `account-transition-dialog.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { AccountFeeSummaryPanel } from './account-fee-summary-panel';
import { DocumentsChecklist } from './documents-checklist';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';
import { AccountTransitionService } from '@/lib/services/admission/account-transition-service';
import type { AccountTransitionDocumentEntry, AccountTransitionResult } from '@/types/admission';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerId: string;
  institutionId: string;
  onSuccess?: (r: AccountTransitionResult) => void;
}

export function AccountTransitionDialog(props: Props) {
  const { open, onOpenChange, learnerId, institutionId, onSuccess } = props;
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);
  const [docs, setDocs] = useState<AccountTransitionDocumentEntry[]>([]);
  const [valid, setValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    AdmissionSettingsService.getByInstitution(institutionId).then((s) =>
      setRequiredDocs(s?.required_documents_for_account_transition ?? []),
    );
  }, [open, institutionId]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const result = await AccountTransitionService.transitionToAccount({
        learner_id: learnerId,
        required_documents: requiredDocs,
        received_documents: docs,
      });
      toast.success(`Moved to Account; ${result.bills_generated} bills generated`);
      onSuccess?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Move to Account stage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <section>
            <h4 className="mb-2 text-sm font-medium">Fee summary</h4>
            <AccountFeeSummaryPanel learnerId={learnerId} />
          </section>
          <section>
            <h4 className="mb-2 text-sm font-medium">Documents checklist</h4>
            {requiredDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents required for this institution.</p>
            ) : (
              <DocumentsChecklist
                requiredDocTypes={requiredDocs}
                onChange={setDocs}
                onValidityChange={setValid}
              />
            )}
          </section>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || (requiredDocs.length > 0 && !valid)}
          >
            {submitting ? 'Submitting…' : 'Confirm — Move to Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify per-file syntax** for both files.

- [ ] **Step 4: Commit** as one commit referencing Spec §9.4 + Plan Task 10.

---

## Task 11: Wire dialog into the lead row "Move to Account" action

**Files:**
- Modify: `app/(routes)/admission/leads/_components/row-actions.tsx`

The existing row-actions DropdownMenu has Hot/Warm/Lost/Delete actions. Add "Move to Account" — visible only when the lead's status is one of the valid pre-account states (`admitted`, `pending`, `approved`).

- [ ] **Step 1: Read the current `row-actions.tsx`** end-to-end. Note:
- How the row data is passed (props vs context)
- The pattern for opening confirmation modals (AlertDialog vs custom Dialog)
- Where `learnerId` and `institution_id` come from on the row

- [ ] **Step 2: Add the action**

Pseudocode (adapt to actual structure):

```tsx
import { AccountTransitionDialog } from './_account/account-transition-dialog';
// ... inside the component:
const [accountDialogOpen, setAccountDialogOpen] = useState(false);
const canMoveToAccount = ['admitted','pending','approved'].includes(row.lifecycle_status ?? row.funnel_stage);

// In the dropdown menu items list:
{canMoveToAccount && (
  <DropdownMenuItem onClick={() => setAccountDialogOpen(true)}>
    Move to Account
  </DropdownMenuItem>
)}

// At the end of the component, alongside other dialogs:
<AccountTransitionDialog
  open={accountDialogOpen}
  onOpenChange={setAccountDialogOpen}
  learnerId={row.id}
  institutionId={row.institution_id}
  onSuccess={() => { /* refetch list */ }}
/>
```

If `row.institution_id` isn't on the row data shape, augment the row's select query to include it (read the data table to find the parent fetch).

- [ ] **Step 3: Verify per-file syntax** with the temp-tsconfig technique (covering `row-actions.tsx` + `_account/*` + their dep tree).

- [ ] **Step 4: Commit** referencing Plan Task 11.

---

## Task 12: Final integration smoke + roadmap update

- [ ] **Step 1: End-to-end smoke (read-only checks since no dev server)**:
1. `git log --oneline -15` shows 11+ Plan 4 commits in order
2. `git status` shows only `.claude/scheduled_tasks.lock` modified
3. SQL: `SELECT proname FROM pg_proc WHERE proname='admission_account_transition_with_bills'` returns 1 row, `prosecdef=true`
4. SQL: `SELECT count(*) FROM information_schema.tables WHERE table_name='learner_admission_documents'` returns 1
5. SQL: `SELECT (permissions ? 'admission_documents.manage') FROM custom_roles WHERE role_key='admission_counselor'` returns true
6. The `_account/` subfolder contains `account-transition-dialog.tsx`, `documents-checklist.tsx`, `account-fee-summary-panel.tsx`
7. `row-actions.tsx` references `AccountTransitionDialog`

- [ ] **Step 2: Mark Plan 4 ✅ in roadmap** with retrospective covering: RPC atomicity verified, bill INSERT column list matched (or any deviations), documents-checklist v1 limitations (no document upload yet, file refs free-form), what Plan 5 needs (the supersede + reallocate flow consumes the bill rows generated here).

- [ ] **Step 3: Commit + push.**

---

## Plan-4 Spec Coverage Self-Review

| Spec section | Addressed by |
|---|---|
| §6.6 learner_admission_documents DDL | Task 1 |
| §8.3.1 admission_account_transition_with_bills RPC | Task 4 |
| §8.1 admission-document-service.ts | Task 6 |
| §8.1 account-transition-service.ts | Task 7 |
| §9.4 status-change dialog (two-panel) | Tasks 9, 10, 11 |
| §10.1 admission_documents.manage permission key | Task 3 |
| §10.2 RLS for documents | Task 2 |
| §11 activity events for lifecycle.account_transition, documents.received, bill.auto_generated | Task 7 |

**Not in this plan (deferred):**
- Fee-change reconciliation (programme/quota changes after bills generated) → Plan 5
- Cutover & adoption (feature flag enforcement) → Plan 6

---

## Open Items / Risks

- **Bill INSERT column list match** — Task 4 Step 1 demands reading `OnboardingService.createBillsFromProfile` to get the EXACT column list it inserts. If the existing service inserts columns the RPC misses, downstream payment / receipt logic breaks. This is the single highest-risk verification step in the plan.
- **`auth.uid()` inside SECURITY DEFINER** — works correctly when invoked via the supabase client with a session JWT. Verified in similar existing RPCs (e.g. `admission_resolve_fee_items_for_lead` from Plan 3).
- **Activity logs from RPC vs service** — RPC keeps focused on data integrity; activity logs fire from the calling user's session via the service wrapper. Pattern: Plan 3 used the same split.
- **Dialog opens on learners with `legacy_fee_mode=true`** — RPC handles both paths (resolves via RPC for non-legacy, reads existing fee_items for legacy). UI must not bail early; dialog should open for both.
- **`row-actions.tsx` row data shape** — institution_id may not be on the row today. Task 11 may need to extend the data-table's parent query to include institution_id.
- **No-bill-yet learners with insufficient required docs** — RPC raises an exception with a clear `required_documents_missing: pan,aadhaar` error. UI surfaces the message via `toast.error(err.message)` (already wired in Task 10 Step 2).
- **Race condition between two operators clicking "Move to Account"** — `FOR UPDATE` lock on the learner row in Task 4 Step 2 prevents this. Verified via the `SELECT ... FOR UPDATE` in the RPC.
- **Reverse-from-Account flow** — `OnboardingService.revertToApproved` already exists per Plan 1's billing-module mapping. Plan 4 doesn't change it; the existing flow continues to work.
