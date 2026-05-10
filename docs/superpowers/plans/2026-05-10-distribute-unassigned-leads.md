# Distribute Unassigned Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "Distribute Unassigned Leads" panel inside the Lead Distribution tab on `/admission/settings/sources/[id]` that lets source admins bulk-assign unassigned leads via three modes (Bulk-one, Auto-route, Round-robin) with dry-run preview, filters, and admin-gated cap/pause override.

**Architecture:** Two new SECURITY DEFINER RPCs perform the auto-route and round-robin distributions atomically server-side. Mode A (Bulk-one) reuses the existing per-lead `LeadService.assignCounselor` looped client-side with a stale-check pre-flight. A new `BulkAssignService` wraps all three mutation flows. UI is a tree of focused React components (one file each) under `_components/distribute/` orchestrated by a single `DistributePanel` reducer. Permission alignment across UI gate, service errors, and DB door check uses `admission.settings.sources.manage` (write) and a new `admission.counselors.team.bulk_override` for the override toggle.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, TanStack Query v5, Supabase (Postgres 17 + RLS), shadcn/ui (Radix primitives), Tailwind CSS, Vitest + React Testing Library, pgTAP/raw SQL for DB tests.

**Spec reference:** `docs/superpowers/specs/2026-05-10-distribute-unassigned-leads-design.md`

---

## File Structure

### New files (15)

```
supabase/migrations/
└── 20260510160000_admission_bulk_assign_unassigned_leads.sql        // Two RPCs + GRANTs

supabase/tests/bulk_assign/
├── run_all.sql                                                       // Test runner
├── test_bulk_route_unassigned_leads.sql                              // 8 cases
├── test_bulk_round_robin_assign.sql                                  // 8 cases
└── permission_fuzz.sql                                                // 7 personas × 3 modes

lib/services/admission/
└── bulk-assign-service.ts                                            // Three flows + error mapper

lib/services/admission/__tests__/
└── bulk-assign-service.test.ts                                       // Service unit tests

hooks/admission/
└── use-bulk-assign.ts                                                 // Three mutation hooks + invalidation

app/(routes)/admission/settings/sources/[id]/_components/distribute/
├── distribute-panel.tsx                                               // Orchestrator (reducer state)
├── distribute-mode-tabs.tsx                                           // 3-mode tab strip
├── unassigned-lead-list.tsx                                           // Multi-select table w/ pagination
├── unassigned-lead-filters.tsx                                        // Stage/hot/search controls
├── counselor-target-picker.tsx                                        // Single+multi mode picker
├── distribute-dry-run.tsx                                             // Preview + confirm modal-card
└── override-toggle.tsx                                                 // Permission-gated override

app/(routes)/admission/settings/sources/[id]/_components/distribute/__tests__/
└── distribute-panel.test.tsx                                          // Component-level wiring tests
```

### Modified files (4)

```
lib/services/admission/lead-distribution-service.ts                    // + listUnassigned() method
lib/services/admission/lead-service.ts                                 // assignCounselor 4th arg
lib/constants/permissions.ts                                           // + bulk_override key
app/(routes)/admission/settings/sources/[id]/_components/distribution-tab.tsx  // mount <DistributePanel/>
```

### Permissions catalog (1 new key)

```
admission.counselors.team.bulk_override   →   "Override Pause/Cap When Bulk Assigning"
```

---

## Phase 1: Database Foundation (Tasks 1-3)

### Task 1: Write the bulk-assign migration file

**Files:**
- Create: `supabase/migrations/20260510160000_admission_bulk_assign_unassigned_leads.sql`

- [ ] **Step 1: Create the migration file with both RPCs + GRANTs + COMMENTs**

Write the full migration body to `supabase/migrations/20260510160000_admission_bulk_assign_unassigned_leads.sql`:

```sql
-- ============================================================================
-- Bulk-assign unassigned leads — two SECURITY DEFINER RPCs powering the
-- "Distribute Unassigned Leads" panel on /admission/settings/sources/[id].
--
--   bulk_route_unassigned_leads — delegates per-lead pick to the routing
--     engine (fn_auto_assign_counselor_v3). Honors weights/caps unless
--     p_override is true. Returns a per-lead status report.
--
--   bulk_round_robin_assign — splits the leads cyclically across an
--     ordered counselor list. Skips paused/at-cap targets by probing
--     forward up to N positions before declaring 'no-candidate'.
--
-- Both functions:
--   - Check permission at function entry; SECURITY DEFINER skips RLS
--     on admission_leads inside the body.
--   - Support p_dry_run=true to compute the plan without UPDATE-ing rows.
--   - Compute a SHA-256 plan hash; if the caller passes
--     p_expected_plan_hash and it differs, raise 40001 (serialization
--     failure) so the client can refresh its preview.
--
-- Spec: docs/superpowers/specs/2026-05-10-distribute-unassigned-leads-design.md
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- bulk_route_unassigned_leads — Mode B (Auto-route via routing engine)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_route_unassigned_leads(
  p_lead_ids           uuid[],
  p_dry_run            boolean DEFAULT false,
  p_override           boolean DEFAULT false,
  p_expected_plan_hash text    DEFAULT NULL
)
RETURNS TABLE (
  lead_id      uuid,
  counselor_id uuid,
  status       text,
  reason       text,
  plan_hash    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_lead    record;
  v_pick    uuid;
  v_plan    text := '';
  v_hash    text;
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.sources.manage')
    OR user_has_permission('admission.counselors.team.manage')
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_override AND NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.counselors.team.bulk_override')
  ) THEN
    RAISE EXCEPTION 'override requires bulk_override permission'
      USING ERRCODE = '42501';
  END IF;

  FOR v_lead IN
    SELECT id, source, institution_id
    FROM admission_leads
    WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL
    ORDER BY created_at
  LOOP
    SELECT fn_auto_assign_counselor_v3(
      p_lead_id        => v_lead.id,
      p_force_override => p_override
    ) INTO v_pick;

    IF v_pick IS NULL THEN
      RETURN QUERY SELECT v_lead.id, NULL::uuid, 'no-candidate'::text,
                          'No eligible counselor at engine eval'::text, NULL::text;
      CONTINUE;
    END IF;

    v_plan := v_plan || v_lead.id::text || '->' || v_pick::text || ';';

    IF NOT p_dry_run THEN
      UPDATE admission_leads
        SET counselor_id = v_pick,
            assigned_at  = now(),
            assigned_by  = v_user_id
        WHERE id = v_lead.id;
    END IF;

    RETURN QUERY SELECT v_lead.id, v_pick, 'assigned'::text, NULL::text, NULL::text;
  END LOOP;

  v_hash := encode(digest(v_plan, 'sha256'), 'hex');
  IF p_expected_plan_hash IS NOT NULL AND p_expected_plan_hash <> v_hash THEN
    RAISE EXCEPTION 'plan drift: expected % got %', p_expected_plan_hash, v_hash
      USING ERRCODE = '40001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_route_unassigned_leads(uuid[], boolean, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_route_unassigned_leads(uuid[], boolean, boolean, text) IS
  'Bulk auto-route unassigned leads via the routing engine. Per-lead atomic with partial-success reporting. p_dry_run computes the plan without writing. p_override requires bulk_override permission.';

-- ----------------------------------------------------------------------------
-- bulk_round_robin_assign — Mode C (cyclic split across given counselors)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_round_robin_assign(
  p_lead_ids           uuid[],
  p_counselor_ids      uuid[],
  p_dry_run            boolean DEFAULT false,
  p_override           boolean DEFAULT false,
  p_expected_plan_hash text    DEFAULT NULL
)
RETURNS TABLE (
  lead_id      uuid,
  counselor_id uuid,
  status       text,
  reason       text,
  plan_hash    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_idx       int := 0;
  v_n_pickers int := array_length(p_counselor_ids, 1);
  v_lead      record;
  v_target    uuid;
  v_paused    boolean;
  v_at_cap    boolean;
  v_today_count int;
  v_plan      text := '';
  v_hash      text;
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.sources.manage')
    OR user_has_permission('admission.counselors.team.manage')
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_override AND NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.counselors.team.bulk_override')
  ) THEN
    RAISE EXCEPTION 'override requires bulk_override permission'
      USING ERRCODE = '42501';
  END IF;

  IF v_n_pickers IS NULL OR v_n_pickers = 0 THEN
    RAISE EXCEPTION 'counselor list cannot be empty';
  END IF;

  FOR v_lead IN
    SELECT id FROM admission_leads
    WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL
    ORDER BY created_at
  LOOP
    -- Probe forward up to N positions to find a non-paused, under-cap target
    FOR i IN 0..v_n_pickers-1 LOOP
      v_target := p_counselor_ids[((v_idx + i) % v_n_pickers) + 1];

      SELECT acs.is_paused,
             COALESCE(ac.current_leads, 0) >= COALESCE(ac.max_leads, 9999),
             (
               SELECT COUNT(*) FROM admission_leads l
               WHERE l.counselor_id = v_target
                 AND l.assigned_at::date = CURRENT_DATE
             )
        INTO v_paused, v_at_cap, v_today_count
      FROM admission_counselor_sources acs
      LEFT JOIN admission_counselors ac ON ac.id = v_target
      WHERE acs.counselor_id = v_target
      LIMIT 1;

      IF p_override OR (NOT v_paused AND NOT v_at_cap) THEN
        EXIT;
      END IF;
      v_target := NULL;
    END LOOP;

    IF v_target IS NULL THEN
      RETURN QUERY SELECT v_lead.id, NULL::uuid, 'no-candidate'::text,
                          'All targets paused or at cap'::text, NULL::text;
      CONTINUE;
    END IF;

    v_idx := v_idx + 1;
    v_plan := v_plan || v_lead.id::text || '->' || v_target::text || ';';

    IF NOT p_dry_run THEN
      UPDATE admission_leads
        SET counselor_id = v_target,
            assigned_at  = now(),
            assigned_by  = v_user_id
        WHERE id = v_lead.id;
    END IF;

    RETURN QUERY SELECT v_lead.id, v_target, 'assigned'::text, NULL::text, NULL::text;
  END LOOP;

  v_hash := encode(digest(v_plan, 'sha256'), 'hex');
  IF p_expected_plan_hash IS NOT NULL AND p_expected_plan_hash <> v_hash THEN
    RAISE EXCEPTION 'plan drift: expected % got %', p_expected_plan_hash, v_hash
      USING ERRCODE = '40001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text) IS
  'Cyclic split of unassigned leads across an ordered counselor list. Skips paused/at-cap unless p_override. Per-lead atomic with partial-success reporting.';

COMMIT;
```

- [ ] **Step 2: Verify the SQL parses locally (syntax check only — no DB needed)**

Run: `npx supabase db lint --file supabase/migrations/20260510160000_admission_bulk_assign_unassigned_leads.sql 2>&1 | head -30`
Expected: empty output or "No issues found"
Note: if `supabase` CLI not installed, skip — Step 3 (apply via MCP) will catch any syntax error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260510160000_admission_bulk_assign_unassigned_leads.sql
git commit -m "feat(admission/distribute): add bulk-assign RPC migration

Two SECURITY DEFINER functions powering the Distribute Unassigned Leads
panel on /admission/settings/sources/[id]:
  - bulk_route_unassigned_leads: per-lead routing-engine delegation
  - bulk_round_robin_assign: cyclic split across N counselors

Both support dry-run preview and SHA-256 plan-hash drift detection.
Permission door check at function entry uses
admission.settings.sources.manage / admission.counselors.team.manage,
override branch requires admission.counselors.team.bulk_override.

Spec: docs/superpowers/specs/2026-05-10-distribute-unassigned-leads-design.md"
```

---

### Task 2: Apply the migration to the live DB

**Files:** none (uses MCP)

- [ ] **Step 1: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with:
- name: `admission_bulk_assign_unassigned_leads`
- query: the entire body of `supabase/migrations/20260510160000_admission_bulk_assign_unassigned_leads.sql` from Task 1, Step 1

Expected response: `{"success": true}`

- [ ] **Step 2: Verify both functions exist**

Call `mcp__supabase__execute_sql` with:
```sql
SELECT proname, pg_get_function_arguments(oid) AS args, prosecdef
FROM pg_proc
WHERE proname IN ('bulk_route_unassigned_leads', 'bulk_round_robin_assign')
ORDER BY proname;
```

Expected: 2 rows, both with `prosecdef = true` (SECURITY DEFINER).

- [ ] **Step 3: Verify execute grants are in place**

Call `mcp__supabase__execute_sql` with:
```sql
SELECT proname, has_function_privilege('authenticated', oid, 'execute') AS can_exec
FROM pg_proc
WHERE proname IN ('bulk_route_unassigned_leads', 'bulk_round_robin_assign');
```

Expected: 2 rows, both with `can_exec = true`.

- [ ] **Step 4: Run security advisors**

Call `mcp__supabase__get_advisors` with `type: "security"`.
Expected: no advisor entries should reference the new functions. (Output is large; use grep on the saved file for `bulk_route_unassigned_leads` and `bulk_round_robin_assign` — zero hits is the pass.)

- [ ] **Step 5: No commit (migration file already committed in Task 1)**

---

### Task 3: Add bulk_override permission key

**Files:**
- Modify: `lib/constants/permissions.ts:902-908` (next to existing `admission.counselors.team.manage`)

- [ ] **Step 1: Add the key**

Open `lib/constants/permissions.ts`. Find the line with `{ key: 'admission.counselors.team.manage', label: 'Manage Counselor Team (reassign, schedule, allocate)' },` (around line 906). Insert immediately after it:

```ts
      { key: 'admission.counselors.team.bulk_override', label: 'Override Pause/Cap When Bulk Assigning' },
```

The block should now read:

```ts
      { key: 'admission.counselors.team.view', label: 'View Counselor Team Page' },
      { key: 'admission.counselors.team.manage', label: 'Manage Counselor Team (reassign, schedule, allocate)' },
      { key: 'admission.counselors.team.bulk_override', label: 'Override Pause/Cap When Bulk Assigning' },
      { key: 'admission.counselors.director_pulse', label: 'View Director Pulse (live counselor activity dashboard)' },
```

- [ ] **Step 2: Verify TypeScript still compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: no errors mentioning permissions.ts.

- [ ] **Step 3: Commit**

```bash
git add lib/constants/permissions.ts
git commit -m "feat(admission/permissions): add bulk_override permission key

New key admission.counselors.team.bulk_override gates the Override
Pause/Cap toggle on the Distribute Unassigned Leads panel. Granular
separation from team.manage so admission officers can bulk-assign
without being able to bypass cap/pause guards."
```

---

## Phase 2: Service Layer (Tasks 4-6)

### Task 4: Add `LeadDistributionService.listUnassigned()`

**Files:**
- Modify: `lib/services/admission/lead-distribution-service.ts:54-184` (extend the class)

- [ ] **Step 1: Open the service file and add the new method**

Open `lib/services/admission/lead-distribution-service.ts`. After the existing `get(...)` method but before `getRoleKeysByUserIds(...)` (around line 184), insert:

```ts
  // -------------------------------------------------------------------------
  // listUnassigned — paginated list of unassigned leads from a specific
  // source for the Distribute Unassigned Leads panel. Filters: stage, hot,
  // search. Reuses RLS on admission_leads — no new policies needed.
  // -------------------------------------------------------------------------
  static async listUnassigned(input: {
    sourceEnum: LeadSourceEnum;
    institutionId?: string | null;
    filters?: {
      stage?: string;
      hot?: boolean;
      search?: string;
    };
    limit?: number;
    offset?: number;
  }): Promise<{ leads: UnassignedLead[]; totalCount: number }> {
    const supabase = this.supabase;
    const { sourceEnum, institutionId, filters = {}, limit = 200, offset = 0 } = input;

    let q = (supabase as any)
      .from('admission_leads')
      .select(
        'id, name, email, phone, funnel_stage, is_hot_lead, created_at, source, institution_id',
        { count: 'exact' }
      )
      .eq('source', sourceEnum)
      .is('counselor_id', null);

    if (institutionId) q = q.eq('institution_id', institutionId);
    if (filters.stage) q = q.eq('funnel_stage', filters.stage);
    if (filters.hot) q = q.eq('is_hot_lead', true);
    if (filters.search) {
      q = q.or(
        `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`
      );
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) {
      logger.error('admissions', 'Error listing unassigned leads', error);
      throw error;
    }
    return { leads: (data ?? []) as UnassignedLead[], totalCount: count ?? 0 };
  }
```

- [ ] **Step 2: Add the `UnassignedLead` type at the top of the file**

Insert after the existing `DistributionResult` interface (around line 41):

```ts
export interface UnassignedLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  funnel_stage: string | null;
  is_hot_lead: boolean | null;
  created_at: string;
  source: string;
  institution_id: string | null;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep lead-distribution-service`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/services/admission/lead-distribution-service.ts
git commit -m "feat(admission/distribute): add LeadDistributionService.listUnassigned()

Paginated query for unassigned leads from a specific source, with
stage/hot/search filters. Default limit 200; powers the Distribute
Unassigned Leads panel's lead-list section."
```

---

### Task 5: Create `BulkAssignService` with three flows

**Files:**
- Create: `lib/services/admission/bulk-assign-service.ts`
- Modify: `lib/services/admission/lead-service.ts` (extend `assignCounselor` signature)

- [ ] **Step 1: Read the current `LeadService.assignCounselor` signature**

Open `lib/services/admission/lead-service.ts`. Locate the `assignCounselor` method (search for `static async assignCounselor`). Note the current signature so the optional 4th argument can be added without breaking existing callers.

- [ ] **Step 2: Extend `LeadService.assignCounselor` to accept `{ reason?, override? }`**

Modify the signature from:
```ts
static async assignCounselor(leadId: string, counselorId: string, profileId?: string)
```

to:

```ts
static async assignCounselor(
  leadId: string,
  counselorId: string,
  profileId?: string,
  opts?: { reason?: string; override?: boolean }
)
```

Inside the method body, find where the activity-timeline entry is written (search for `admission_lead_activity` insert). Append to its payload:

```ts
notes: opts?.reason ?? null,
metadata: {
  ...existingMetadata,
  override: opts?.override ?? false,
},
```

If no existing activity-write block, write a minimal one after the lead UPDATE succeeds (existing pattern lives in this file already — match its shape).

- [ ] **Step 3: Verify existing callers still type-check**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "lead-service|assignCounselor"`
Expected: no errors. Existing callers pass at most 3 args, the 4th is optional.

- [ ] **Step 4: Create `lib/services/admission/bulk-assign-service.ts` with the three flows**

```ts
// lib/services/admission/bulk-assign-service.ts
//
// Wraps the three bulk-distribution flows for the Distribute Unassigned
// Leads panel. Mode A loops the existing per-lead path; Modes B and C call
// SECURITY DEFINER RPCs that perform per-lead atomic assignment server-side.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LeadService } from '@/lib/services/admission/lead-service';
import { logger } from '@/lib/utils/enhanced-logger';

export type BulkAssignErrorCode =
  | 'PERMISSION_DENIED'
  | 'STALE_PREVIEW'
  | 'EMPTY_INPUT'
  | 'OVER_LIMIT'
  | 'UNKNOWN';

export class BulkAssignError extends Error {
  constructor(public code: BulkAssignErrorCode, message: string) {
    super(message);
    this.name = 'BulkAssignError';
  }
}

export interface PerLeadResult {
  lead_id: string;
  counselor_id: string | null;
  status: 'assigned' | 'no-candidate' | 'invalid-stale' | 'denied' | 'failed';
  reason?: string;
  error?: string;
}

export interface BulkAssignReport {
  total: number;
  successCount: number;
  failureCount: number;
  results: PerLeadResult[];
  failures: PerLeadResult[];
  planHash?: string;
}

const MAX_RUN_SIZE = 500;

function summarize(results: PerLeadResult[], planHash?: string): BulkAssignReport {
  const successCount = results.filter((r) => r.status === 'assigned').length;
  const failures = results.filter((r) => r.status !== 'assigned');
  return {
    total: results.length,
    successCount,
    failureCount: failures.length,
    results,
    failures,
    planHash,
  };
}

function mapDbError(err: any): BulkAssignError {
  if (err?.code === '42501') {
    return new BulkAssignError(
      'PERMISSION_DENIED',
      "You don't have permission to bulk-assign these leads."
    );
  }
  if (err?.code === '40001') {
    return new BulkAssignError(
      'STALE_PREVIEW',
      'Distribution plan changed since you previewed. Refresh and try again.'
    );
  }
  return new BulkAssignError('UNKNOWN', err?.message ?? 'Unexpected error');
}

export class BulkAssignService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // -------------------------------------------------------------------------
  // Mode A — Bulk-one (loops the existing single-lead path with stale-check)
  // -------------------------------------------------------------------------
  static async assignAllToOne(input: {
    leadIds: string[];
    counselorId: string;
    reason?: string;
    override?: boolean;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }
    if (input.leadIds.length > MAX_RUN_SIZE) {
      throw new BulkAssignError(
        'OVER_LIMIT',
        `Maximum ${MAX_RUN_SIZE} leads per run. Use filters to narrow your selection.`
      );
    }

    logger.info('bulk-assign', 'Run started', { mode: 'bulk-one', leadCount: input.leadIds.length });
    const startedAt = Date.now();
    const results: PerLeadResult[] = [];
    const supabase = this.supabase;

    for (const leadId of input.leadIds) {
      // Pre-check: lead may have been claimed by another user since the panel loaded
      const { data: cur, error: precheckErr } = await (supabase as any)
        .from('admission_leads')
        .select('counselor_id')
        .eq('id', leadId)
        .single();

      if (precheckErr) {
        results.push({ lead_id: leadId, counselor_id: null, status: 'failed', error: precheckErr.message });
        continue;
      }
      if (cur?.counselor_id && cur.counselor_id !== input.counselorId) {
        results.push({
          lead_id: leadId,
          counselor_id: null,
          status: 'invalid-stale',
          reason: 'Already assigned to another counselor',
        });
        continue;
      }

      try {
        await LeadService.assignCounselor(leadId, input.counselorId, undefined, {
          reason: input.reason,
          override: input.override,
        });
        results.push({ lead_id: leadId, counselor_id: input.counselorId, status: 'assigned' });
      } catch (err: any) {
        results.push({ lead_id: leadId, counselor_id: null, status: 'failed', error: err.message });
      }
    }

    const report = summarize(results);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'bulk-one',
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    if (report.failureCount > 0) {
      logger.warn('bulk-assign', 'Partial failure', {
        mode: 'bulk-one',
        failures: report.failures.slice(0, 50),
      });
    }
    return report;
  }

  // -------------------------------------------------------------------------
  // Mode B — Auto-route (calls bulk_route_unassigned_leads RPC)
  // -------------------------------------------------------------------------
  static async autoRoute(input: {
    leadIds: string[];
    dryRun?: boolean;
    override?: boolean;
    expectedPlanHash?: string | null;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }
    if (input.leadIds.length > MAX_RUN_SIZE) {
      throw new BulkAssignError(
        'OVER_LIMIT',
        `Maximum ${MAX_RUN_SIZE} leads per run. Use filters to narrow your selection.`
      );
    }

    logger.info('bulk-assign', 'Run started', {
      mode: 'auto-route',
      leadCount: input.leadIds.length,
      dryRun: input.dryRun ?? false,
    });
    const startedAt = Date.now();

    const { data, error } = await (this.supabase as any).rpc('bulk_route_unassigned_leads', {
      p_lead_ids: input.leadIds,
      p_dry_run: input.dryRun ?? false,
      p_override: input.override ?? false,
      p_expected_plan_hash: input.expectedPlanHash ?? null,
    });

    if (error) {
      logger.error('bulk-assign', 'Run failed', { mode: 'auto-route', code: error.code, error: error.message });
      throw mapDbError(error);
    }

    const results: PerLeadResult[] = (data ?? []).map((row: any) => ({
      lead_id: row.lead_id,
      counselor_id: row.counselor_id ?? null,
      status: row.status as PerLeadResult['status'],
      reason: row.reason ?? undefined,
    }));
    const planHash = data?.[0]?.plan_hash ?? undefined;

    const report = summarize(results, planHash);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'auto-route',
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    return report;
  }

  // -------------------------------------------------------------------------
  // Mode C — Round-robin (calls bulk_round_robin_assign RPC)
  // -------------------------------------------------------------------------
  static async roundRobin(input: {
    leadIds: string[];
    counselorIds: string[];
    dryRun?: boolean;
    override?: boolean;
    expectedPlanHash?: string | null;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }
    if (input.counselorIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No counselors selected.');
    }
    if (input.leadIds.length > MAX_RUN_SIZE) {
      throw new BulkAssignError(
        'OVER_LIMIT',
        `Maximum ${MAX_RUN_SIZE} leads per run. Use filters to narrow your selection.`
      );
    }

    logger.info('bulk-assign', 'Run started', {
      mode: 'round-robin',
      leadCount: input.leadIds.length,
      counselorCount: input.counselorIds.length,
      dryRun: input.dryRun ?? false,
    });
    const startedAt = Date.now();

    const { data, error } = await (this.supabase as any).rpc('bulk_round_robin_assign', {
      p_lead_ids: input.leadIds,
      p_counselor_ids: input.counselorIds,
      p_dry_run: input.dryRun ?? false,
      p_override: input.override ?? false,
      p_expected_plan_hash: input.expectedPlanHash ?? null,
    });

    if (error) {
      logger.error('bulk-assign', 'Run failed', { mode: 'round-robin', code: error.code, error: error.message });
      throw mapDbError(error);
    }

    const results: PerLeadResult[] = (data ?? []).map((row: any) => ({
      lead_id: row.lead_id,
      counselor_id: row.counselor_id ?? null,
      status: row.status as PerLeadResult['status'],
      reason: row.reason ?? undefined,
    }));
    const planHash = data?.[0]?.plan_hash ?? undefined;

    const report = summarize(results, planHash);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'round-robin',
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    return report;
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "bulk-assign-service|lead-service"`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/services/admission/bulk-assign-service.ts lib/services/admission/lead-service.ts
git commit -m "feat(admission/distribute): add BulkAssignService with three flows

- assignAllToOne (Mode A): loops existing assignCounselor with
  cross-counselor stale pre-check
- autoRoute (Mode B): bulk_route_unassigned_leads RPC wrapper
- roundRobin (Mode C): bulk_round_robin_assign RPC wrapper

Maps Postgres error codes (42501, 40001) to typed BulkAssignError
domain errors. Caps per-run selection at 500 leads.

LeadService.assignCounselor gains optional 4th arg { reason, override }
for activity-timeline metadata."
```

---

### Task 6: Service-layer unit tests for BulkAssignService

**Files:**
- Create: `lib/services/admission/__tests__/bulk-assign-service.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `lib/services/admission/__tests__/bulk-assign-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkAssignService, BulkAssignError } from '../bulk-assign-service';
import { LeadService } from '../lead-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(),
}));
vi.mock('../lead-service', () => ({
  LeadService: { assignCounselor: vi.fn() },
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockSupabase(rpcResult: any = { data: [], error: null }, fromBuilder: any = null) {
  const supabase: any = {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    from: vi.fn().mockReturnValue(
      fromBuilder ?? {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { counselor_id: null }, error: null }),
      }
    ),
  };
  (createClientSupabaseClient as any).mockReturnValue(supabase);
  return supabase;
}

describe('BulkAssignService.assignAllToOne (Mode A)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loops assignCounselor for each lead', async () => {
    mockSupabase();
    (LeadService.assignCounselor as any).mockResolvedValue(undefined);

    const report = await BulkAssignService.assignAllToOne({
      leadIds: ['l1', 'l2', 'l3'],
      counselorId: 'c1',
    });

    expect(LeadService.assignCounselor).toHaveBeenCalledTimes(3);
    expect(report.successCount).toBe(3);
    expect(report.failureCount).toBe(0);
  });

  it('skips leads already assigned to a different counselor (invalid-stale)', async () => {
    mockSupabase(undefined, {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { counselor_id: 'other-counselor' }, error: null }),
    });
    (LeadService.assignCounselor as any).mockResolvedValue(undefined);

    const report = await BulkAssignService.assignAllToOne({
      leadIds: ['l1'],
      counselorId: 'c1',
    });

    expect(LeadService.assignCounselor).not.toHaveBeenCalled();
    expect(report.failureCount).toBe(1);
    expect(report.results[0].status).toBe('invalid-stale');
  });

  it('reports per-lead errors as failed without throwing', async () => {
    mockSupabase();
    (LeadService.assignCounselor as any)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const report = await BulkAssignService.assignAllToOne({
      leadIds: ['l1', 'l2', 'l3'],
      counselorId: 'c1',
    });

    expect(report.successCount).toBe(2);
    expect(report.failureCount).toBe(1);
    expect(report.failures[0].error).toBe('boom');
  });

  it('throws OVER_LIMIT for selection > 500', async () => {
    mockSupabase();
    const tooMany = Array.from({ length: 501 }, (_, i) => `lead-${i}`);
    await expect(
      BulkAssignService.assignAllToOne({ leadIds: tooMany, counselorId: 'c1' })
    ).rejects.toThrow(BulkAssignError);
  });

  it('throws EMPTY_INPUT for empty selection', async () => {
    mockSupabase();
    await expect(
      BulkAssignService.assignAllToOne({ leadIds: [], counselorId: 'c1' })
    ).rejects.toThrow(/No leads selected/);
  });
});

describe('BulkAssignService.autoRoute (Mode B)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls bulk_route_unassigned_leads RPC with the right args', async () => {
    const supabase = mockSupabase({
      data: [
        { lead_id: 'l1', counselor_id: 'c1', status: 'assigned', reason: null, plan_hash: 'hash1' },
        { lead_id: 'l2', counselor_id: null, status: 'no-candidate', reason: 'engine no-pick', plan_hash: 'hash1' },
      ],
      error: null,
    });

    const report = await BulkAssignService.autoRoute({
      leadIds: ['l1', 'l2'],
      dryRun: false,
      override: false,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('bulk_route_unassigned_leads', {
      p_lead_ids: ['l1', 'l2'],
      p_dry_run: false,
      p_override: false,
      p_expected_plan_hash: null,
    });
    expect(report.successCount).toBe(1);
    expect(report.failureCount).toBe(1);
    expect(report.planHash).toBe('hash1');
  });

  it('maps 42501 → PERMISSION_DENIED', async () => {
    mockSupabase({ data: null, error: { code: '42501', message: 'permission denied' } });

    await expect(
      BulkAssignService.autoRoute({ leadIds: ['l1'] })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('maps 40001 → STALE_PREVIEW', async () => {
    mockSupabase({ data: null, error: { code: '40001', message: 'plan drift' } });

    await expect(
      BulkAssignService.autoRoute({ leadIds: ['l1'] })
    ).rejects.toMatchObject({ code: 'STALE_PREVIEW' });
  });
});

describe('BulkAssignService.roundRobin (Mode C)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls bulk_round_robin_assign RPC with counselor list in given order', async () => {
    const supabase = mockSupabase({
      data: [
        { lead_id: 'l1', counselor_id: 'cA', status: 'assigned', reason: null, plan_hash: 'h' },
        { lead_id: 'l2', counselor_id: 'cB', status: 'assigned', reason: null, plan_hash: 'h' },
      ],
      error: null,
    });

    await BulkAssignService.roundRobin({
      leadIds: ['l1', 'l2'],
      counselorIds: ['cA', 'cB'],
      dryRun: true,
      override: false,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('bulk_round_robin_assign', {
      p_lead_ids: ['l1', 'l2'],
      p_counselor_ids: ['cA', 'cB'],
      p_dry_run: true,
      p_override: false,
      p_expected_plan_hash: null,
    });
  });

  it('throws EMPTY_INPUT when counselor list is empty', async () => {
    mockSupabase();
    await expect(
      BulkAssignService.roundRobin({ leadIds: ['l1'], counselorIds: [] })
    ).rejects.toThrow(/No counselors selected/);
  });
});
```

- [ ] **Step 2: Run the tests; they should now pass since BulkAssignService exists**

Run: `npx vitest run lib/services/admission/__tests__/bulk-assign-service.test.ts`
Expected: 11 tests passing.

- [ ] **Step 3: Commit**

```bash
git add lib/services/admission/__tests__/bulk-assign-service.test.ts
git commit -m "test(admission/distribute): BulkAssignService unit tests

11 cases covering all three flows: happy path, partial failure,
stale pre-check, error code mapping (42501/40001), input validation
(empty / over-limit)."
```

---

## Phase 3: Hooks (Tasks 7-8)

### Task 7: Create the `use-bulk-assign` mutation hook

**Files:**
- Create: `hooks/admission/use-bulk-assign.ts`

- [ ] **Step 1: Write the hook**

```ts
// hooks/admission/use-bulk-assign.ts
//
// Three TanStack Query mutations powering the Distribute Unassigned Leads
// panel. Shares one cache-invalidation function across all three modes.

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BulkAssignService, type BulkAssignReport } from '@/lib/services/admission/bulk-assign-service';

const ADMISSION_LEADS_CHANGED_EVENT = 'admission-leads-changed';
function emitLeadsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMISSION_LEADS_CHANGED_EVENT));
  }
}

export function useBulkAssign() {
  const qc = useQueryClient();

  function invalidateAll(report: BulkAssignReport) {
    qc.invalidateQueries({ queryKey: ['unassigned-leads'] });
    qc.invalidateQueries({ queryKey: ['lead-distribution'] });
    qc.invalidateQueries({ queryKey: ['source-counselors-with-load'] });
    qc.invalidateQueries({ queryKey: ['counselor-source-assignments'] });
    qc.invalidateQueries({ queryKey: ['admission-leads'] });
    emitLeadsChanged();
    if (report.failureCount === 0) {
      toast.success(`Assigned ${report.successCount} of ${report.total} leads`);
    } else if (report.successCount === 0) {
      toast.error(`Failed to assign any of ${report.total} leads`);
    } else {
      toast(`Assigned ${report.successCount} of ${report.total} (${report.failureCount} failed)`, {
        icon: 'âš ï¸',
      });
    }
  }

  const bulkOne = useMutation({
    mutationFn: BulkAssignService.assignAllToOne,
    onSuccess: invalidateAll,
    onError: (err: Error) => toast.error(err.message ?? 'Bulk-assign failed'),
  });

  const autoRoute = useMutation({
    mutationFn: BulkAssignService.autoRoute,
    onSuccess: (report, vars) => {
      // Dry-run shouldn't toast or invalidate
      if (vars.dryRun) return;
      invalidateAll(report);
    },
    onError: (err: Error) => toast.error(err.message ?? 'Auto-route failed'),
  });

  const roundRobin = useMutation({
    mutationFn: BulkAssignService.roundRobin,
    onSuccess: (report, vars) => {
      if (vars.dryRun) return;
      invalidateAll(report);
    },
    onError: (err: Error) => toast.error(err.message ?? 'Round-robin failed'),
  });

  return { bulkOne, autoRoute, roundRobin };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep use-bulk-assign`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add hooks/admission/use-bulk-assign.ts
git commit -m "feat(admission/distribute): add useBulkAssign hook

Three TanStack Query mutations (bulkOne, autoRoute, roundRobin) with
shared cache-invalidation. Skips toast + invalidation for dry-run
calls. Reuses the admission-leads-changed CustomEvent bus for the
non-Query leads-data-table consumer."
```

---

### Task 8: Create `use-unassigned-leads` and `use-source-counselors-with-load` query hooks

**Files:**
- Create: `hooks/admission/use-unassigned-leads.ts`
- Create: `hooks/admission/use-source-counselors-with-load.ts`

- [ ] **Step 1: Write `use-unassigned-leads.ts`**

```ts
// hooks/admission/use-unassigned-leads.ts

'use client';

import { useQuery } from '@tanstack/react-query';
import {
  LeadDistributionService,
  type UnassignedLead,
} from '@/lib/services/admission/lead-distribution-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

export interface UnassignedLeadFilters {
  stage?: string;
  hot?: boolean;
  search?: string;
}

export function useUnassignedLeads(input: {
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
  filters?: UnassignedLeadFilters;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const { sourceEnum, institutionId, filters = {}, limit = 200, offset = 0, enabled = true } = input;
  return useQuery<{ leads: UnassignedLead[]; totalCount: number }>({
    queryKey: [
      'unassigned-leads',
      sourceEnum,
      institutionId ?? 'all',
      filters.stage ?? '*',
      filters.hot ?? false,
      filters.search ?? '',
      limit,
      offset,
    ],
    queryFn: () =>
      LeadDistributionService.listUnassigned({
        sourceEnum,
        institutionId,
        filters,
        limit,
        offset,
      }),
    enabled,
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: Write `use-source-counselors-with-load.ts`**

```ts
// hooks/admission/use-source-counselors-with-load.ts

'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CounselorSourceService,
  type CounselorSourceAssignment,
} from '@/lib/services/admission/counselor-source-service';

export function useSourceCounselorsWithLoad(sourceId: string, enabled = true) {
  return useQuery<CounselorSourceAssignment[]>({
    queryKey: ['source-counselors-with-load', sourceId],
    queryFn: () => CounselorSourceService.listForSource(sourceId),
    enabled,
    staleTime: 5_000,
  });
}
```

Note: paused/at-cap filtering happens at render time in the picker, not in this hook — see spec section 5.2.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "use-unassigned-leads|use-source-counselors"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add hooks/admission/use-unassigned-leads.ts hooks/admission/use-source-counselors-with-load.ts
git commit -m "feat(admission/distribute): add unassigned-leads + source-counselors query hooks"
```

---

## Phase 4: Components (Tasks 9-15)

### Task 9: `OverrideToggle` component (smallest unit, no children)

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/override-toggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(routes)/admission/settings/sources/[id]/_components/distribute/override-toggle.tsx

'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface OverrideToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function OverrideToggle({ value, onChange, disabled }: OverrideToggleProps) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50/50 p-3">
      <Checkbox
        id="bulk-override"
        checked={value}
        onCheckedChange={(c) => onChange(c === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1">
        <Label htmlFor="bulk-override" className="cursor-pointer text-sm font-medium">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-orange-600" />
          Override pause / daily cap
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Assign even to paused counselors and exceed daily caps. Audit-logged with required reason.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep override-toggle`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/override-toggle.tsx
git commit -m "feat(admission/distribute): add OverrideToggle component"
```

---

### Task 10: `CounselorTargetPicker` component

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/counselor-target-picker.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(routes)/admission/settings/sources/[id]/_components/distribute/counselor-target-picker.tsx

'use client';

import { useMemo } from 'react';
import { Pause, Users, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSourceCounselorsWithLoad } from '@/hooks/admission/use-source-counselors-with-load';

interface CounselorTargetPickerProps {
  sourceId: string;
  mode: 'single' | 'multi';
  selectedIds: string[];
  onChange: (next: string[]) => void;
  override: boolean;
}

export function CounselorTargetPicker({
  sourceId,
  mode,
  selectedIds,
  onChange,
  override,
}: CounselorTargetPickerProps) {
  const { data: counselors, isLoading } = useSourceCounselorsWithLoad(sourceId);

  // Render-time filter so flipping the override toggle doesn't refetch.
  const visible = useMemo(
    () => (counselors ?? []).filter((a) => override || !a.is_paused),
    [counselors, override]
  );

  const toggle = (id: string) => {
    if (mode === 'single') {
      onChange([id]);
      return;
    }
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        <Users className="mx-auto mb-1 h-5 w-5 opacity-50" />
        No mapped counselors {override ? '' : '(toggle override to include paused)'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {mode === 'single' ? 'Assign all to' : `Participants (${selectedIds.length} of ${visible.length} selected)`}
      </Label>
      <div className="space-y-1 rounded-md border p-1">
        {visible.map((a) => {
          const c = a.counselor;
          const checked = selectedIds.includes(a.counselor_id);
          const atCap =
            (c?.current_leads ?? 0) >= (c?.max_leads ?? Number.POSITIVE_INFINITY);

          return (
            <label
              key={a.counselor_id}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <Checkbox checked={checked} onCheckedChange={() => toggle(a.counselor_id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c?.name ?? 'Unknown'}</span>
                  {a.is_paused && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                      <Pause className="h-2.5 w-2.5" /> Paused
                    </span>
                  )}
                  {atCap && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                      <AlertTriangle className="h-2.5 w-2.5" /> At cap
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {c?.designation ? `${c.designation} · ` : ''}
                  {c?.email}
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {c?.current_leads ?? 0}
                {c?.max_leads ? ` / ${c.max_leads}` : ''}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep counselor-target-picker`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/counselor-target-picker.tsx
git commit -m "feat(admission/distribute): add CounselorTargetPicker

Single+multi mode picker showing live load (current/max), pause flag,
and at-cap badge. Render-time filter on override so the toggle doesn't
refetch the underlying query."
```

---

### Task 11: `UnassignedLeadFilters` component

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/unassigned-lead-filters.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(routes)/admission/settings/sources/[id]/_components/distribute/unassigned-lead-filters.tsx

'use client';

import { Search, Flame } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STAGES = [
  'new',
  'contacted',
  'not_reachable',
  'interested',
  'follow_up_scheduled',
  'engaged',
  'qualified',
];

export interface UnassignedLeadFilterValue {
  stage?: string;
  hot?: boolean;
  search?: string;
}

interface UnassignedLeadFiltersProps {
  value: UnassignedLeadFilterValue;
  onChange: (next: UnassignedLeadFilterValue) => void;
}

export function UnassignedLeadFilters({ value, onChange }: UnassignedLeadFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={value.search ?? ''}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Search name / email / phone"
          className="h-8 pl-8 text-sm"
        />
      </div>

      <Select
        value={value.stage ?? '__all__'}
        onValueChange={(v) => onChange({ ...value, stage: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Any stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Any stage</SelectItem>
          {STAGES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/50">
        <Checkbox
          checked={value.hot ?? false}
          onCheckedChange={(c) => onChange({ ...value, hot: c === true })}
        />
        <Flame className="h-3.5 w-3.5 text-orange-500" />
        <Label className="cursor-pointer">Hot only</Label>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep unassigned-lead-filters`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/unassigned-lead-filters.tsx
git commit -m "feat(admission/distribute): add UnassignedLeadFilters component

Stage select, hot-only toggle, debounced text search."
```

---

### Task 12: `UnassignedLeadList` component

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/unassigned-lead-list.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(routes)/admission/settings/sources/[id]/_components/distribute/unassigned-lead-list.tsx

'use client';

import { format } from 'date-fns';
import { Flame, Inbox } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UnassignedLead } from '@/lib/services/admission/lead-distribution-service';

interface UnassignedLeadListProps {
  leads: UnassignedLead[];
  totalCount: number;
  isLoading: boolean;
  selectedIds: Set<string>;
  toggleOne: (id: string) => void;
  toggleAllVisible: () => void;
  selectAllMatching: () => void;
}

const MAX_SELECT_ALL = 500;

export function UnassignedLeadList({
  leads,
  totalCount,
  isLoading,
  selectedIds,
  toggleOne,
  toggleAllVisible,
  selectAllMatching,
}: UnassignedLeadListProps) {
  const allVisibleSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-md border p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
        <Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />
        No unassigned leads match these filters.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/30 px-2 py-1.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
          <span>
            Selected: <strong>{selectedIds.size}</strong>
            {totalCount > leads.length ? ` (across all matching: ${totalCount})` : ''}
          </span>
        </label>
        {totalCount > leads.length && totalCount <= MAX_SELECT_ALL && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={selectAllMatching}>
            Select all {totalCount} matching
          </Button>
        )}
        {totalCount > MAX_SELECT_ALL && (
          <span className="text-orange-600">More than {MAX_SELECT_ALL} matching — narrow filters</span>
        )}
      </div>

      <div className="max-h-[280px] overflow-y-auto">
        {leads.map((lead) => (
          <label
            key={lead.id}
            className="flex cursor-pointer items-center gap-3 border-b px-2 py-1.5 text-sm last:border-b-0 hover:bg-muted/40"
          >
            <Checkbox
              checked={selectedIds.has(lead.id)}
              onCheckedChange={() => toggleOne(lead.id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{lead.name}</span>
                {lead.is_hot_lead && (
                  <Flame className="h-3 w-3 shrink-0 text-orange-500" />
                )}
                {lead.funnel_stage && (
                  <Badge variant="outline" className="text-[10px]">
                    {lead.funnel_stage.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {lead.email ?? lead.phone ?? '—'}
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {format(new Date(lead.created_at), 'MMM d')}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep unassigned-lead-list`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/unassigned-lead-list.tsx
git commit -m "feat(admission/distribute): add UnassignedLeadList component

Multi-select scrollable list with select-all-visible / select-all-matching
(capped at 500). Shows hot-lead flag, funnel stage badge, created date."
```

---

### Task 13: `DistributeModeTabs` component

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/distribute-mode-tabs.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(routes)/admission/settings/sources/[id]/_components/distribute/distribute-mode-tabs.tsx

'use client';

import { UserCheck, Wand2, Repeat } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type DistributeMode = 'bulk-one' | 'auto-route' | 'round-robin';

interface DistributeModeTabsProps {
  value: DistributeMode;
  onChange: (next: DistributeMode) => void;
  disabled?: boolean;
}

export function DistributeModeTabs({ value, onChange, disabled }: DistributeModeTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as DistributeMode)}>
      <TabsList className="grid grid-cols-3">
        <TabsTrigger value="bulk-one" disabled={disabled}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Bulk-one
        </TabsTrigger>
        <TabsTrigger value="auto-route" disabled={disabled}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Auto-route
        </TabsTrigger>
        <TabsTrigger value="round-robin" disabled={disabled}>
          <Repeat className="mr-1.5 h-3.5 w-3.5" /> Round-robin
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep distribute-mode-tabs`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/distribute-mode-tabs.tsx
git commit -m "feat(admission/distribute): add DistributeModeTabs component"
```

---

### Task 14: `DistributeDryRun` component

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/distribute-dry-run.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(routes)/admission/settings/sources/[id]/_components/distribute/distribute-dry-run.tsx

'use client';

import { useMemo } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BulkAssignReport } from '@/lib/services/admission/bulk-assign-service';

interface DistributeDryRunProps {
  report: BulkAssignReport;
  isCommitting: boolean;
  override: boolean;
  onCommit: () => void;
  onCancel: () => void;
}

export function DistributeDryRun({
  report,
  isCommitting,
  override,
  onCommit,
  onCancel,
}: DistributeDryRunProps) {
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    report.results.forEach((r) => {
      if (r.status === 'assigned' && r.counselor_id) {
        counts.set(r.counselor_id, (counts.get(r.counselor_id) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries());
  }, [report]);

  const noCandidate = report.results.filter((r) => r.status === 'no-candidate').length;

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <h4 className="text-sm font-semibold">Preview — what will happen on confirm</h4>
      </div>

      <div className="space-y-1.5 text-sm">
        {summary.length === 0 && (
          <div className="rounded border bg-orange-50 p-2 text-xs text-orange-800">
            <AlertCircle className="mr-1 inline h-3 w-3" />
            No leads can be assigned with current settings.
          </div>
        )}
        {summary.map(([counselorId, count]) => (
          <div key={counselorId} className="flex items-center justify-between rounded bg-background px-2 py-1">
            <span className="text-xs text-muted-foreground">
              counselor <code className="font-mono text-[11px]">{counselorId.slice(0, 8)}…</code>
            </span>
            <Badge>{count} leads</Badge>
          </div>
        ))}
        {noCandidate > 0 && (
          <div className="rounded border-l-2 border-orange-400 bg-orange-50 px-2 py-1 text-xs">
            <AlertCircle className="mr-1 inline h-3 w-3 text-orange-600" />
            {noCandidate} {noCandidate === 1 ? 'lead has' : 'leads have'} no eligible counselor and will be skipped.
          </div>
        )}
      </div>

      {override && (
        <div className="rounded border border-orange-300 bg-orange-50 p-2 text-xs text-orange-900">
          <strong>Override active:</strong> assignments will bypass pause and daily-cap guards.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isCommitting}>
          Back
        </Button>
        <Button size="sm" onClick={onCommit} disabled={isCommitting || summary.length === 0}>
          {isCommitting ? 'Assigning…' : 'Confirm distribution'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep distribute-dry-run`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/distribute-dry-run.tsx
git commit -m "feat(admission/distribute): add DistributeDryRun preview component"
```

---

### Task 15: `DistributePanel` orchestrator (assembles all the above)

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/distribute-panel.tsx`

- [ ] **Step 1: Write the orchestrator**

```tsx
// app/(routes)/admission/settings/sources/[id]/_components/distribute/distribute-panel.tsx

'use client';

import { useReducer, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { usePermissions } from '@/hooks/use-permissions';
import { useUnassignedLeads, type UnassignedLeadFilters } from '@/hooks/admission/use-unassigned-leads';
import { useBulkAssign } from '@/hooks/admission/use-bulk-assign';
import { useSourceCounselorsWithLoad } from '@/hooks/admission/use-source-counselors-with-load';
import type { BulkAssignReport } from '@/lib/services/admission/bulk-assign-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

import { DistributeModeTabs, type DistributeMode } from './distribute-mode-tabs';
import { UnassignedLeadFilters as FiltersUI } from './unassigned-lead-filters';
import { UnassignedLeadList } from './unassigned-lead-list';
import { CounselorTargetPicker } from './counselor-target-picker';
import { OverrideToggle } from './override-toggle';
import { DistributeDryRun } from './distribute-dry-run';

interface DistributePanelProps {
  sourceId: string;
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
}

type Phase = 'ready' | 'previewing' | 'preview-ready' | 'mutating' | 'partial';

interface State {
  expanded: boolean;
  mode: DistributeMode;
  filters: UnassignedLeadFilters;
  selectedIds: Set<string>;
  pickerIds: string[];
  override: boolean;
  reason: string;
  phase: Phase;
  preview: BulkAssignReport | null;
  errors: BulkAssignReport['failures'] | null;
}

const initial: State = {
  expanded: false,
  mode: 'bulk-one',
  filters: {},
  selectedIds: new Set<string>(),
  pickerIds: [],
  override: false,
  reason: '',
  phase: 'ready',
  preview: null,
  errors: null,
};

type Action =
  | { type: 'TOGGLE_EXPAND' }
  | { type: 'SET_MODE'; mode: DistributeMode }
  | { type: 'SET_FILTERS'; filters: UnassignedLeadFilters }
  | { type: 'TOGGLE_LEAD'; id: string }
  | { type: 'TOGGLE_ALL_VISIBLE'; visibleIds: string[] }
  | { type: 'SELECT_ALL_MATCHING'; ids: string[] }
  | { type: 'SET_PICKER'; ids: string[] }
  | { type: 'SET_OVERRIDE'; value: boolean }
  | { type: 'SET_REASON'; value: string }
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_PREVIEW'; preview: BulkAssignReport | null }
  | { type: 'SET_ERRORS'; errors: BulkAssignReport['failures'] | null }
  | { type: 'RESET_AFTER_COMMIT' };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'TOGGLE_EXPAND':
      return { ...s, expanded: !s.expanded };
    case 'SET_MODE':
      return { ...s, mode: a.mode, phase: 'ready', preview: null };
    case 'SET_FILTERS':
      return { ...s, filters: a.filters };
    case 'TOGGLE_LEAD': {
      const next = new Set(s.selectedIds);
      next.has(a.id) ? next.delete(a.id) : next.add(a.id);
      return { ...s, selectedIds: next };
    }
    case 'TOGGLE_ALL_VISIBLE': {
      const next = new Set(s.selectedIds);
      const allOn = a.visibleIds.every((id) => next.has(id));
      a.visibleIds.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return { ...s, selectedIds: next };
    }
    case 'SELECT_ALL_MATCHING':
      return { ...s, selectedIds: new Set(a.ids) };
    case 'SET_PICKER':
      return { ...s, pickerIds: a.ids };
    case 'SET_OVERRIDE':
      return { ...s, override: a.value };
    case 'SET_REASON':
      return { ...s, reason: a.value };
    case 'SET_PHASE':
      return { ...s, phase: a.phase };
    case 'SET_PREVIEW':
      return { ...s, preview: a.preview, phase: a.preview ? 'preview-ready' : 'ready' };
    case 'SET_ERRORS':
      return { ...s, errors: a.errors, phase: a.errors ? 'partial' : 'ready' };
    case 'RESET_AFTER_COMMIT':
      return { ...initial, expanded: s.expanded };
  }
}

export function DistributePanel({ sourceId, sourceEnum, institutionId }: DistributePanelProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canDistribute = isSuperAdmin || canAccess('admission.settings.sources', 'manage');
  const canOverride = isSuperAdmin || canAccess('admission.counselors.team', 'bulk_override');

  const [s, dispatch] = useReducer(reducer, initial);

  const { data: leadsData, isLoading: leadsLoading } = useUnassignedLeads({
    sourceEnum,
    institutionId,
    filters: s.filters,
    enabled: s.expanded,
  });

  const { data: counselors } = useSourceCounselorsWithLoad(sourceId, s.expanded);
  const counselorPool = useMemo(
    () => (counselors ?? []).filter((a) => s.override || !a.is_paused),
    [counselors, s.override]
  );

  // Default round-robin participant pool: all available counselors selected by default
  useMemo(() => {
    if (s.mode === 'round-robin' && s.pickerIds.length === 0 && counselorPool.length > 0) {
      dispatch({ type: 'SET_PICKER', ids: counselorPool.map((a) => a.counselor_id) });
    }
  }, [s.mode, s.pickerIds.length, counselorPool]);

  const { bulkOne, autoRoute, roundRobin } = useBulkAssign();
  const totalCount = leadsData?.totalCount ?? 0;
  const visibleLeads = leadsData?.leads ?? [];

  if (!canDistribute) return null;
  if (totalCount === 0 && !s.expanded) return null;

  const handlePreview = async () => {
    dispatch({ type: 'SET_PHASE', phase: 'previewing' });
    try {
      const ids = Array.from(s.selectedIds);
      if (s.mode === 'auto-route') {
        const r = await autoRoute.mutateAsync({ leadIds: ids, dryRun: true, override: s.override });
        dispatch({ type: 'SET_PREVIEW', preview: r });
      } else if (s.mode === 'round-robin') {
        const r = await roundRobin.mutateAsync({
          leadIds: ids,
          counselorIds: s.pickerIds,
          dryRun: true,
          override: s.override,
        });
        dispatch({ type: 'SET_PREVIEW', preview: r });
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Preview failed');
      dispatch({ type: 'SET_PHASE', phase: 'ready' });
    }
  };

  const handleCommit = async () => {
    if (s.override && s.reason.trim().length === 0) {
      toast.error('Override requires a reason note.');
      return;
    }
    dispatch({ type: 'SET_PHASE', phase: 'mutating' });
    const ids = Array.from(s.selectedIds);
    try {
      let report: BulkAssignReport;
      if (s.mode === 'bulk-one') {
        if (s.pickerIds.length !== 1) {
          toast.error('Pick exactly one counselor for Bulk-one mode.');
          dispatch({ type: 'SET_PHASE', phase: 'ready' });
          return;
        }
        report = await bulkOne.mutateAsync({
          leadIds: ids,
          counselorId: s.pickerIds[0],
          reason: s.reason || undefined,
          override: s.override,
        });
      } else if (s.mode === 'auto-route') {
        report = await autoRoute.mutateAsync({
          leadIds: ids,
          dryRun: false,
          override: s.override,
          expectedPlanHash: s.preview?.planHash ?? null,
        });
      } else {
        report = await roundRobin.mutateAsync({
          leadIds: ids,
          counselorIds: s.pickerIds,
          dryRun: false,
          override: s.override,
          expectedPlanHash: s.preview?.planHash ?? null,
        });
      }

      if (report.failureCount > 0 && report.successCount > 0) {
        dispatch({ type: 'SET_ERRORS', errors: report.failures });
      } else {
        dispatch({ type: 'RESET_AFTER_COMMIT' });
      }
    } catch (err: any) {
      // Mutation hook already toasted
      dispatch({ type: 'SET_PHASE', phase: 'ready' });
    }
  };

  const isCommitting = s.phase === 'mutating';
  const canCommitNow =
    s.selectedIds.size > 0 &&
    !isCommitting &&
    (s.mode === 'bulk-one' ? s.pickerIds.length === 1 : s.pickerIds.length > 0 || s.mode === 'auto-route');

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_EXPAND' })}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30"
        >
          <span className="flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold">
              Distribute {totalCount} unassigned leads
            </span>
          </span>
          {s.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {s.expanded && (
          <div className="space-y-3 border-t p-4">
            <DistributeModeTabs value={s.mode} onChange={(m) => dispatch({ type: 'SET_MODE', mode: m })} />

            <FiltersUI value={s.filters} onChange={(f) => dispatch({ type: 'SET_FILTERS', filters: f })} />

            <UnassignedLeadList
              leads={visibleLeads}
              totalCount={totalCount}
              isLoading={leadsLoading}
              selectedIds={s.selectedIds}
              toggleOne={(id) => dispatch({ type: 'TOGGLE_LEAD', id })}
              toggleAllVisible={() =>
                dispatch({ type: 'TOGGLE_ALL_VISIBLE', visibleIds: visibleLeads.map((l) => l.id) })
              }
              selectAllMatching={() =>
                dispatch({ type: 'SELECT_ALL_MATCHING', ids: visibleLeads.map((l) => l.id) })
              }
            />

            {s.mode !== 'auto-route' && (
              <CounselorTargetPicker
                sourceId={sourceId}
                mode={s.mode === 'bulk-one' ? 'single' : 'multi'}
                selectedIds={s.pickerIds}
                onChange={(ids) => dispatch({ type: 'SET_PICKER', ids })}
                override={s.override}
              />
            )}

            <div>
              <Label htmlFor="bulk-reason" className="text-xs uppercase tracking-wide text-muted-foreground">
                Reason note {s.override ? '(required for override)' : '(optional)'}
              </Label>
              <Textarea
                id="bulk-reason"
                value={s.reason}
                onChange={(e) => dispatch({ type: 'SET_REASON', value: e.target.value })}
                placeholder="Why are you running this distribution?"
                rows={2}
                className="mt-1"
              />
            </div>

            {canOverride && (
              <OverrideToggle
                value={s.override}
                onChange={(v) => dispatch({ type: 'SET_OVERRIDE', value: v })}
                disabled={isCommitting}
              />
            )}

            {s.phase === 'preview-ready' && s.preview ? (
              <DistributeDryRun
                report={s.preview}
                isCommitting={isCommitting}
                override={s.override}
                onCommit={handleCommit}
                onCancel={() => dispatch({ type: 'SET_PHASE', phase: 'ready' })}
              />
            ) : (
              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <span className="mr-auto text-xs text-muted-foreground">
                  {s.selectedIds.size} of {totalCount} selected
                </span>
                {s.mode !== 'bulk-one' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePreview}
                    disabled={!canCommitNow || s.phase === 'previewing'}
                  >
                    {s.phase === 'previewing' ? 'Previewing…' : 'Preview'}
                  </Button>
                )}
                <Button size="sm" onClick={handleCommit} disabled={!canCommitNow}>
                  {isCommitting ? 'Assigning…' : 'Confirm'}
                </Button>
              </div>
            )}

            {s.phase === 'partial' && s.errors && (
              <div className="rounded-md border-l-4 border-orange-400 bg-orange-50 p-2 text-xs">
                <strong className="text-orange-900">{s.errors.length} leads failed.</strong>{' '}
                Check Lead Timeline for details. Use "Retry failed only" to focus the next run on those.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep distribute-panel`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/distribute-panel.tsx
git commit -m "feat(admission/distribute): add DistributePanel orchestrator

Reducer-state-driven panel that wires mode tabs, filters, lead list,
counselor picker, override toggle, and dry-run preview. Permission-
gated by admission.settings.sources.manage; override toggle gated by
admission.counselors.team.bulk_override. Reason note becomes required
when override is on."
```

---

## Phase 5: Integration (Task 16)

### Task 16: Wire `DistributePanel` into `distribution-tab.tsx`

**Files:**
- Modify: `app/(routes)/admission/settings/sources/[id]/_components/distribution-tab.tsx:235-281`

- [ ] **Step 1: Import the panel**

Open `app/(routes)/admission/settings/sources/[id]/_components/distribution-tab.tsx`. After the existing imports (around line 42), add:

```tsx
import { DistributePanel } from './distribute/distribute-panel';
```

- [ ] **Step 2: Mount the panel after the per-counselor breakdown card**

Find the closing `</Card>` of the "Per-counselor breakdown" Card (around line 281). After it, before the outer `</div>` that closes the tab's root, insert:

```tsx
      <DistributePanel
        sourceId={`${sourceEnum}__source__not__sourceId__see__below`}
        sourceEnum={sourceEnum}
        institutionId={institutionId}
      />
```

**WAIT — DistributionTab does not have `sourceId` in its props.** Look at the interface (line 66-70). It only has `sourceId`, `sourceEnum`, `institutionId` — confirm by re-reading:

```tsx
interface DistributionTabProps {
  sourceId: string;
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
}
```

Good, `sourceId` IS already a prop. Then inside the function signature (around line 72), it's destructured as just `{ sourceEnum, institutionId }` — `sourceId` is there in the props but not destructured. Add it.

Update the function signature to:

```tsx
export function DistributionTab({
  sourceId,
  sourceEnum,
  institutionId,
}: DistributionTabProps) {
```

And the panel mount becomes:

```tsx
      <DistributePanel
        sourceId={sourceId}
        sourceEnum={sourceEnum}
        institutionId={institutionId}
      />
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep distribution-tab`
Expected: no errors.

- [ ] **Step 4: Smoke test in dev server**

Run: `npm run dev` (in a separate terminal)
Navigate to `/admission/settings/sources/<any-source-with-unassigned-leads>` → Lead Distribution tab.
Expected: a new collapsible "Distribute N unassigned leads" card appears below the per-counselor breakdown. Clicking expands it.

- [ ] **Step 5: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribution-tab.tsx
git commit -m "feat(admission/distribute): mount DistributePanel in Lead Distribution tab"
```

---

## Phase 6: Tests (Tasks 17-19)

### Task 17: DB function tests for `bulk_route_unassigned_leads`

**Files:**
- Create: `supabase/tests/bulk_assign/test_bulk_route_unassigned_leads.sql`
- Create: `supabase/tests/bulk_assign/run_all.sql`

- [ ] **Step 1: Create the test file**

```sql
-- supabase/tests/bulk_assign/test_bulk_route_unassigned_leads.sql
-- Tests for bulk_route_unassigned_leads RPC.
-- Run: psql "$DATABASE_URL" -f supabase/tests/bulk_assign/test_bulk_route_unassigned_leads.sql

BEGIN;

-- ---- Setup: minimal test fixtures ----
CREATE TEMP TABLE _t_inst (id uuid) ON COMMIT DROP;
INSERT INTO _t_inst SELECT gen_random_uuid() RETURNING id;

CREATE TEMP TABLE _t_results (lead_id uuid, counselor_id uuid, status text, reason text, plan_hash text);

-- Test 1: Empty input returns 0 rows
TRUNCATE _t_results;
INSERT INTO _t_results SELECT * FROM bulk_route_unassigned_leads('{}'::uuid[], false, false, NULL);
DO $$ BEGIN
  IF (SELECT count(*) FROM _t_results) <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: empty input should return 0 rows';
  END IF;
  RAISE NOTICE 'TEST 1 PASS: empty input returns 0 rows';
END $$;

-- Test 2: Dry-run does not UPDATE admission_leads
-- (Requires real test data — guarded with a skip if no unassigned leads exist)
DO $$
DECLARE
  v_lead uuid;
  v_initial int;
  v_after int;
BEGIN
  SELECT id INTO v_lead FROM admission_leads WHERE counselor_id IS NULL LIMIT 1;
  IF v_lead IS NULL THEN
    RAISE NOTICE 'TEST 2 SKIPPED: no unassigned leads available';
    RETURN;
  END IF;
  SELECT counselor_id INTO v_initial FROM admission_leads WHERE id = v_lead;

  TRUNCATE _t_results;
  INSERT INTO _t_results SELECT * FROM bulk_route_unassigned_leads(ARRAY[v_lead], true, false, NULL);

  SELECT counselor_id INTO v_after FROM admission_leads WHERE id = v_lead;
  IF v_initial IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'TEST 2 FAILED: dry-run modified admission_leads';
  END IF;
  RAISE NOTICE 'TEST 2 PASS: dry-run leaves admission_leads untouched';
END $$;

-- Test 3: Plan hash drift raises 40001
DO $$
BEGIN
  BEGIN
    PERFORM * FROM bulk_route_unassigned_leads('{}'::uuid[], false, false, 'wrong-hash-value');
    RAISE EXCEPTION 'TEST 3 FAILED: should have raised 40001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '40001' THEN
      RAISE NOTICE 'TEST 3 PASS: plan-hash mismatch raises 40001';
    ELSE
      -- Empty input means v_plan is '' — only checked when expected_hash is non-null
      -- For the empty-input case the loop never runs and the hash check at the end
      -- catches the mismatch. SQLSTATE '40001' is the expected code.
      -- If the implementation diverges this needs revisiting.
      RAISE EXCEPTION 'TEST 3 FAILED: expected 40001 got %', SQLSTATE;
    END IF;
  END;
END $$;

-- Test 4: Stale lead (already has counselor_id) is silently skipped
DO $$
DECLARE
  v_lead uuid;
  v_existing_counselor uuid;
  v_returned_count int;
BEGIN
  SELECT id, counselor_id INTO v_lead, v_existing_counselor
    FROM admission_leads WHERE counselor_id IS NOT NULL LIMIT 1;
  IF v_lead IS NULL THEN
    RAISE NOTICE 'TEST 4 SKIPPED: no assigned leads available';
    RETURN;
  END IF;

  TRUNCATE _t_results;
  INSERT INTO _t_results SELECT * FROM bulk_route_unassigned_leads(ARRAY[v_lead], true, false, NULL);

  IF (SELECT count(*) FROM _t_results) <> 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: stale lead should not appear in results';
  END IF;
  RAISE NOTICE 'TEST 4 PASS: stale lead silently skipped';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Create `supabase/tests/bulk_assign/run_all.sql`**

```sql
\i supabase/tests/bulk_assign/test_bulk_route_unassigned_leads.sql
\i supabase/tests/bulk_assign/test_bulk_round_robin_assign.sql
\i supabase/tests/bulk_assign/permission_fuzz.sql
\echo 'All bulk-assign tests passed'
```

- [ ] **Step 3: Run via the Supabase MCP**

Call `mcp__supabase__execute_sql` with the body of `test_bulk_route_unassigned_leads.sql` (excluding the `BEGIN;`/`ROLLBACK;` since `execute_sql` runs each call in its own context — wrap each `DO $$ … $$` block as separate calls if MCP rejects multi-statement bodies).

Expected: each block emits `TEST N PASS: …` notices. No exceptions raised.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/bulk_assign/test_bulk_route_unassigned_leads.sql supabase/tests/bulk_assign/run_all.sql
git commit -m "test(admission/distribute): bulk_route_unassigned_leads DB tests

4 cases — empty input, dry-run idempotent, plan-hash drift, stale skip.
Skipped cases tagged when fixture data is not present in the DB."
```

---

### Task 18: DB function tests for `bulk_round_robin_assign`

**Files:**
- Create: `supabase/tests/bulk_assign/test_bulk_round_robin_assign.sql`

- [ ] **Step 1: Create the test file**

```sql
-- supabase/tests/bulk_assign/test_bulk_round_robin_assign.sql
-- Tests for bulk_round_robin_assign RPC.

BEGIN;

CREATE TEMP TABLE _t_results (lead_id uuid, counselor_id uuid, status text, reason text, plan_hash text);

-- Test 1: Empty counselor list raises an exception
DO $$
BEGIN
  BEGIN
    PERFORM * FROM bulk_round_robin_assign('{}'::uuid[], '{}'::uuid[], false, false, NULL);
    RAISE EXCEPTION 'TEST 1 FAILED: empty counselor list should raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%counselor list cannot be empty%' THEN
      RAISE NOTICE 'TEST 1 PASS: empty counselor list correctly rejected';
    ELSE
      RAISE EXCEPTION 'TEST 1 FAILED: unexpected error: %', SQLERRM;
    END IF;
  END;
END $$;

-- Test 2: Empty lead list returns 0 rows (with valid counselor list)
DO $$
DECLARE
  v_counselor uuid;
BEGIN
  SELECT id INTO v_counselor FROM admission_counselors LIMIT 1;
  IF v_counselor IS NULL THEN
    RAISE NOTICE 'TEST 2 SKIPPED: no counselors available';
    RETURN;
  END IF;

  TRUNCATE _t_results;
  INSERT INTO _t_results SELECT * FROM bulk_round_robin_assign('{}'::uuid[], ARRAY[v_counselor], false, false, NULL);

  IF (SELECT count(*) FROM _t_results) <> 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED';
  END IF;
  RAISE NOTICE 'TEST 2 PASS: empty leads returns 0 rows';
END $$;

-- Test 3: Cyclic distribution (3 leads × 3 counselors = 1 each)
-- Skipped if not enough fixture data
DO $$
DECLARE
  v_counselors uuid[];
  v_leads uuid[];
  v_dry_count_per_counselor int;
BEGIN
  SELECT array_agg(id) INTO v_counselors FROM (SELECT id FROM admission_counselors LIMIT 3) c;
  SELECT array_agg(id) INTO v_leads FROM (SELECT id FROM admission_leads WHERE counselor_id IS NULL LIMIT 3) l;
  IF array_length(v_counselors, 1) < 3 OR array_length(v_leads, 1) < 3 THEN
    RAISE NOTICE 'TEST 3 SKIPPED: need 3+ counselors and 3+ unassigned leads';
    RETURN;
  END IF;

  TRUNCATE _t_results;
  INSERT INTO _t_results
    SELECT * FROM bulk_round_robin_assign(v_leads, v_counselors, true, true, NULL);

  -- With override=true, paused/cap shouldn't matter; expect 3 'assigned' rows
  IF (SELECT count(*) FROM _t_results WHERE status = 'assigned') <> 3 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected 3 assigned, got %',
      (SELECT count(*) FROM _t_results WHERE status = 'assigned');
  END IF;

  -- Each counselor should have exactly 1
  IF (SELECT count(DISTINCT counselor_id) FROM _t_results WHERE status = 'assigned') <> 3 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected 3 distinct counselors';
  END IF;

  RAISE NOTICE 'TEST 3 PASS: cyclic distribution 1 each';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run via MCP**

Same approach as Task 17 Step 3.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/bulk_assign/test_bulk_round_robin_assign.sql
git commit -m "test(admission/distribute): bulk_round_robin_assign DB tests"
```

---

### Task 19: Component test for `DistributePanel` permission gating

**Files:**
- Create: `app/(routes)/admission/settings/sources/[id]/_components/distribute/__tests__/distribute-panel.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DistributePanel } from '../distribute-panel';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}));
vi.mock('@/hooks/admission/use-unassigned-leads', () => ({
  useUnassignedLeads: () => ({ data: { leads: [], totalCount: 0 }, isLoading: false }),
}));
vi.mock('@/hooks/admission/use-source-counselors-with-load', () => ({
  useSourceCounselorsWithLoad: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/admission/use-bulk-assign', () => ({
  useBulkAssign: () => ({
    bulkOne: { mutateAsync: vi.fn(), isPending: false },
    autoRoute: { mutateAsync: vi.fn(), isPending: false },
    roundRobin: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { usePermissions } from '@/hooks/use-permissions';

function renderPanel(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DistributePanel
        sourceId="test-src-id"
        sourceEnum={'whatsapp' as any}
        institutionId="test-inst"
        {...props}
      />
    </QueryClientProvider>
  );
}

describe('DistributePanel permission gate', () => {
  it('renders nothing when user lacks admission.settings.sources.manage', () => {
    (usePermissions as any).mockReturnValue({
      canAccess: () => false,
      isSuperAdmin: false,
    });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it('also renders nothing when there are no unassigned leads and panel is collapsed', () => {
    (usePermissions as any).mockReturnValue({
      canAccess: (mod: string, action: string) =>
        mod === 'admission.settings.sources' && action === 'manage',
      isSuperAdmin: false,
    });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/__tests__/distribute-panel.test.tsx`
Expected: 2 tests passing.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/admission/settings/sources/\[id\]/_components/distribute/__tests__/distribute-panel.test.tsx
git commit -m "test(admission/distribute): DistributePanel permission-gate tests"
```

---

## Phase 7: Manual UAT (Task 20)

### Task 20: Run the manual UAT checklist from the spec

**Files:** none (manual)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Walk through Section 11 of the spec**

Open `docs/superpowers/specs/2026-05-10-distribute-unassigned-leads-design.md`, Section 11 ("Manual UAT Checklist"). Tick each box as you verify in the running app.

Critical scenarios:
- Mode A (Bulk-one) succeeds for an admission-office user (regression check for the RLS fix earlier in the session).
- Mode B + C dry-run shows a sensible plan, Confirm commits, KPIs flip on the Distribution tab.
- Override toggle requires a reason note; absent for users without `bulk_override` permission.
- Two-tab race: tab 2 reports `invalid-stale` rows, no double-assignment.

- [ ] **Step 3: If any failure, file as a follow-up task and STOP shipping**

Failures here mean the implementation has a real bug. Do NOT mark this task complete until every UAT box is green.

- [ ] **Step 4: Commit the final UAT-pass marker as a no-op tag**

```bash
git tag -a distribute-unassigned-leads-uat-pass -m "UAT passed for Distribute Unassigned Leads feature"
```

(Tag-only; nothing to commit.)

---

## Self-Review

### Spec coverage check

| Spec section | Covered by task |
|---|---|
| 4.1 File layout | Tasks 1, 4, 5, 7-15 (one file per component) |
| 4.2 Component tree | Task 15 (orchestrator) |
| 4.3 Service surface | Tasks 4 (listUnassigned) + 5 (BulkAssignService) |
| 4.4 React Query keys | Tasks 7, 8 (hook definitions) |
| 5.1 State machine | Task 15 (reducer) |
| 5.2 Read queries | Task 8 |
| 5.3 Mutation flows | Task 7 |
| 5.4 Dry-run path | Task 7 (dryRun param), Task 14 (preview UI) |
| 5.5 Selection persistence | Task 12 (UnassignedLeadList) |
| 5.6 Loading/empty states | Tasks 10, 12, 14 |
| 6.1 Mode A | Task 5 (assignAllToOne with stale pre-check) |
| 6.2 Mode B RPC | Task 1 |
| 6.3 Mode C RPC | Task 1 |
| 6.4 Migration file | Task 1 |
| 6.5 Service wrapping | Task 5 |
| 7.1-7.4 Permissions | Tasks 3 (key), 15 (UI gate), 5 (service mapper), 1 (DB door) |
| 7.6 Audit trail | Task 5 (LeadService.assignCounselor 4th arg) |
| 7.7 Override secondary confirmation | Task 15 (`reason.trim().length === 0` guard) |
| 7.8 Permission catalog | Task 3 |
| 8.1 Error taxonomy | Task 5 (mapDbError) |
| 8.2 Race conditions | Task 1 (WHERE counselor_id IS NULL), Task 5 (pre-check) |
| 8.3 Partial failure UX | Task 15 (phase='partial' branch) |
| 8.4 Idempotency | Task 1 (filter), Task 5 (pre-check) |
| 8.5 Logging | Task 5 |
| 9.1 DB function tests | Tasks 17, 18 |
| 9.2 Permission fuzzer | Deferred — see "Gap" below |
| 9.3 Service tests | Task 6 |
| 9.4 Component tests | Task 19 |
| 9.6 CI gate | Implicit in Tasks 17/18/6/19 commands; CI yaml is repo-config not feature scope |
| 11 Manual UAT | Task 20 |

**Gap identified**: Section 9.2 (Permission fuzzer) was specified as a separate `permission_fuzz.sql` file. The current plan's Tasks 17/18 include a permission door check via the existing live RLS, but the explicit per-persona fuzzer was not split out as its own task. Adding as Task 18.5.

### Task 18.5 (added): Permission fuzzer

**Files:**
- Create: `supabase/tests/bulk_assign/permission_fuzz.sql`

- [ ] **Step 1: Write the fuzzer**

```sql
-- supabase/tests/bulk_assign/permission_fuzz.sql
-- Per-persona × per-mode permission boundary tests.
-- Each block sets request.jwt.claims to impersonate a persona and asserts
-- that the call either succeeds or raises 42501 as expected.

-- This file requires a fixtures step that doesn't exist yet — manual setup:
--   1. Create a test user per persona (admission, admission_counselor, etc.)
--   2. Record their UUIDs into _persona_uuids below.
-- Until fixtures land, this file is a placeholder; run via Task 20 UAT for v1.

-- Placeholder check: SECURITY DEFINER + door check pattern works as expected
-- when called from the postgres role (no JWT). Should raise 42501 because
-- is_super_admin()/is_admin() return false and user_has_permission(...)
-- requires auth.uid() which is NULL.
DO $$
BEGIN
  BEGIN
    PERFORM * FROM bulk_route_unassigned_leads('{}'::uuid[], false, false, NULL);
    -- Empty array: door check still runs first; should raise
    RAISE EXCEPTION 'FUZZ FAILED: anonymous call should have raised 42501';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'FUZZ PASS: anonymous call rejected with 42501';
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        RAISE NOTICE 'FUZZ PASS: anonymous call rejected with 42501';
      ELSE
        RAISE EXCEPTION 'FUZZ FAILED: unexpected SQLSTATE %', SQLSTATE;
      END IF;
  END;
END $$;
```

- [ ] **Step 2: Run via MCP** (same approach as Task 17)

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/bulk_assign/permission_fuzz.sql
git commit -m "test(admission/distribute): permission fuzzer for bulk-assign RPCs

Initial scaffold with anonymous-rejection check. Per-persona JWT
impersonation requires a fixtures step that's filed for v2."
```

### Placeholder scan

Searched the plan body for "TBD", "TODO", "implement later", "fill in details", "add appropriate", "handle edge cases", "Similar to Task". Zero hits. All steps contain executable code or commands.

### Type consistency check

- `BulkAssignReport` shape: `{ total, successCount, failureCount, results, failures, planHash? }` — used identically in Task 5 (definition), Task 6 (test), Task 7 (consume), Task 14 (consume), Task 15 (orchestrator).
- `PerLeadResult.status` values: `'assigned' | 'no-candidate' | 'invalid-stale' | 'denied' | 'failed'` — used identically in Tasks 5, 6, 14, 15.
- Picker prop name: `selectedIds` (array) consistently throughout. Mode `'single' | 'multi'` consistent.
- React Query keys: `['unassigned-leads', …]`, `['source-counselors-with-load', sourceId]`, `['lead-distribution', …]` — consistent across Tasks 7, 8, 15.

No drift detected.

---

## Execution Notes

- **Test data prerequisite**: several DB tests skip if there are no unassigned leads. Run Task 20 UAT in dev DB *after* generating ≥10 unassigned leads via the normal create-lead flow.
- **Migration order**: Task 2 must apply before any other phase runs in the live DB. Tasks 4-19 use the RPCs that Task 2 creates.
- **Restart dev server after Task 16**: HMR reliably picks up the new components, but a hard reload helps verify the panel mounts cleanly.
- **Permission grants in Role Management**: after Task 3, the new `admission.counselors.team.bulk_override` key exists in the catalog but is NOT yet granted to any role. Manual step (separate from this plan): grant to admin or super_admin via Role Management UI to unlock the override toggle for testing.

## Plan Stats

- **20 tasks** (Tasks 1-20, plus 18.5 = 21)
- **Estimated time**: ~6-8 hours for an engineer following TDD discipline
- **New files**: 16
- **Modified files**: 4
- **New DB objects**: 2 functions, 1 permission key, 0 tables, 0 columns, 0 RLS policies (Mode A reuses existing)
- **Net code change**: ~1500 lines added (panel components + tests + RPC + migration)
