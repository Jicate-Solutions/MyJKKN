# Design — Distribute Unassigned Leads (Source Detail · Lead Distribution Tab)

| Meta | |
|---|---|
| **Date** | 2026-05-10 |
| **Author** | Boobalan (with Claude pair) |
| **Status** | Draft — pending user review before plan writing |
| **Scope** | One feature — collapsible "Distribute Unassigned Leads" panel inside the Lead Distribution tab on `/admission/settings/sources/[id]` |
| **Out of scope** | Global `/admission/leads/unassigned` page; CSV export; persistent draft state; webhook on bulk-assign completion |
| **Related code** | `app/(routes)/admission/settings/sources/[id]/_components/distribution-tab.tsx`, `lib/services/admission/lead-distribution-service.ts`, `lib/services/admission/lead-service.ts`, `supabase/migrations/20260509140000_admission_routing_function_v3.sql` |

---

## 1. Problem Statement

The **Lead Distribution tab** currently shows analytics only — KPIs, a top-counselors chart, and a per-counselor breakdown. When a source has unassigned leads (e.g., the WhatsApp source shows `Unassigned: 1`), there is **no UI surface to assign them**. The user must navigate to `/admission/leads`, filter, and assign each lead one by one.

This design adds a focused, source-scoped distribution panel directly on the same tab so source admins can clear unassigned backlogs without leaving the page, with three distribution strategies (manual bulk, engine-driven auto-route, round-robin), filtering, dry-run preview, and a permission-gated override for cap/pause bypass.

## 2. Goals

- **G1**: Discover-first — the action is visible where the user already looks (the Distribution tab), with the count in the CTA itself.
- **G2**: Three distribution modes that cover real ops needs:
  1. *Bulk-one* — pick one counselor, assign N leads to them.
  2. *Auto-route* — delegate per-lead pick to `fn_auto_assign_counselor_v3`, respecting weights and caps.
  3. *Round-robin* — cyclic split across mapped counselors.
- **G3**: Dry-run before commit for non-deterministic modes (B + C), with plan-hash drift detection.
- **G4**: Defense-in-depth permission alignment — UI gate, service mapping, DB door check all use the same permission keys.
- **G5**: Idempotent bulk operations — re-clicking Confirm is safe.

## 3. Non-Goals

- **NG1**: No background-job system. Bulk-assign runs synchronously, capped at 500 leads per run.
- **NG2**: No undo within the panel. Reassign manually if needed.
- **NG3**: No cross-source bulk assign. The panel is one-source-per-run.
- **NG4**: No new `/api/admission/...` HTTP endpoint. Direct `supabase.rpc(…)` from the client.
- **NG5**: No optimistic UI updates. Pessimistic with progress UX is correct for bulk operations.

---

## 4. Architecture & Components

### 4.1 File layout

```
app/(routes)/admission/settings/sources/[id]/_components/
├── distribution-tab.tsx                      // existing — gains <DistributePanel/> at the bottom
└── distribute/                               // NEW — feature folder
    ├── distribute-panel.tsx                  // collapsible card; orchestrates everything
    ├── distribute-mode-tabs.tsx              // mode switcher (Bulk-one | Auto-route | Round-robin)
    ├── unassigned-lead-list.tsx              // filterable, multi-select table
    ├── unassigned-lead-filters.tsx           // stage/hot/search controls
    ├── counselor-target-picker.tsx           // counselor dropdown w/ live load preview
    ├── distribute-dry-run.tsx                // preview state ("5 → A, 3 → B") + Confirm
    └── override-toggle.tsx                   // pause/cap override checkbox (perm-gated)

lib/services/admission/
├── lead-distribution-service.ts              // existing — extends with listUnassigned()
└── bulk-assign-service.ts                    // NEW — wraps the 3 mutation flows

hooks/admission/
└── use-bulk-assign.ts                        // NEW — useMutation per mode + cache invalidation

supabase/migrations/
└── 20260510160000_admission_bulk_assign_unassigned_leads.sql   // NEW — RPCs for round-robin / auto-route
```

### 4.2 Component tree (when expanded)

```
<DistributePanel sourceId sourceEnum institutionId>          ← outermost; owns expand/collapse + RQ keys
├── <Card>                                                    ← shadcn collapsible card pattern
│   ├── header — "Distribute N unassigned leads" + chevron
│   └── body (mounted only when expanded; lazy queries fire here)
│       ├── <DistributeModeTabs mode setMode />              ← Tabs trigger row
│       ├── <UnassignedLeadFilters filters setFilters />     ← stage / hot / search controls
│       ├── <UnassignedLeadList                              ← virtualized if > 100 rows
│       │     leads selectedIds toggleOne toggleAll />
│       ├── <CounselorTargetPicker                           ← single-select in Mode A;
│       │     sourceId mode='single' | 'multi'                 multi-select in Mode C
│       │     selectedIds setSelectedIds />                    (Mode B hides the picker —
│       │                                                       the engine picks per lead)
│       ├── <Textarea reason />                              ← optional reason note
│       ├── <OverrideToggle value setValue />                ← admin-only; perm-gated
│       └── <DistributeDryRun                                ← shown after "Preview" click
│             plan onCommit onCancel />
└── (collapsed state shows only the header CTA)
```

### 4.3 Service-layer surface

**`LeadDistributionService.listUnassigned(input)` — read**
Returns `Lead[]` filtered to `source = sourceEnum`, `counselor_id IS NULL`, `institution_id`, plus optional stage / hot / search filters. Pagination (default `limit 200, offset 0`). Reuses RLS already present on `admission_leads`.

**`BulkAssignService` — three writes**
- `assignAllToOne(leadIds, counselorId, opts)` — Mode A. Loops calling existing `LeadService.assignCounselor` with a pre-check for cross-counselor stale state.
- `autoRoute(leadIds, opts)` — Mode B. Calls new SECURITY DEFINER RPC `bulk_route_unassigned_leads(...)`. Iterates `fn_auto_assign_counselor_v3` per lead. Returns per-lead status rows.
- `roundRobin(leadIds, counselorIds, opts)` — Mode C. Calls new RPC `bulk_round_robin_assign(...)`. Splits leads cyclically server-side.

### 4.4 React Query keys

```ts
// existing
['lead-distribution', sourceEnum, fromIso, toIso, instId]

// NEW
['unassigned-leads', sourceEnum, instId, JSON.stringify(filters)]
['source-counselors-with-load', sourceId]   // counselor list + current_leads/cap, for picker
```

Cache invalidation web (after any successful bulk-assign mutation):
- `['unassigned-leads', …]` — refresh the list.
- `['lead-distribution', …]` — KPIs and breakdown re-aggregate.
- `['counselor-source-assignments', sourceId]` — counselors-tab updates load counts.
- `['admission-leads', …]` — global leads list across the app.
- `emitLeadsChanged()` — for the non-Query leads-data-table at `app/(routes)/admission/leads/_components/leads-data-table.tsx`.

---

## 5. Data Flow, State, Mutations

### 5.1 Panel state machine

```
expanded=false (default, lazy)
   ↓ user clicks CTA
expanded=true, mode='bulk-one' (default)
   ↓ pick mode, set filters, multi-select leads
ready
   ↓ click [Preview]
preview-loading → preview-ready
   ↓ click [Confirm]                       ↓ click [Cancel]
mutating (pessimistic, with progress %)    back to ready
   ├ success → success (toast + reset)
   └ partial → partial (per-row error list, retry-failed-only button)
```

Single `useReducer` state in `distribute-panel.tsx`:
```ts
{ expanded, mode, filters, selectedIds, picker, override, reason, phase, plan, errors }
```

### 5.2 Read queries

```ts
// useUnassignedLeads({ sourceEnum, institutionId, filters, enabled })
queryKey: ['unassigned-leads', sourceEnum, instId, filters.stage ?? '*', filters.hot ?? false, filters.search ?? '']
queryFn: () => LeadDistributionService.listUnassigned({...})
staleTime: 15_000
enabled: expanded && open

// useSourceCounselorsWithLoad(sourceId)
// Returns ALL mapped counselors (paused + active). Filtering by override is a
// render-time concern, not a query-key concern — including `override` in the
// key would force a refetch every time the toggle flips, which is wasteful.
queryKey: ['source-counselors-with-load', sourceId]
queryFn: () => CounselorSourceService.listForSource(sourceId)
staleTime: 5_000

// In CounselorTargetPicker:
const visible = useMemo(
  () => counselors.filter(a => override || !a.is_paused),
  [counselors, override]
);
```

### 5.3 Mutation flows

```ts
// hooks/admission/use-bulk-assign.ts

// Flow A — Bulk-one
useMutation({
  mutationFn: ({ leadIds, counselorId, reason, override }) =>
    BulkAssignService.assignAllToOne({ leadIds, counselorId, reason, override }),
  onSuccess: invalidateAll,
})

// Flow B — Auto-route
useMutation({
  mutationFn: ({ leadIds, override, expectedPlanHash, dryRun }) =>
    BulkAssignService.autoRoute({ leadIds, override, expectedPlanHash, dryRun }),
  onSuccess: invalidateAll,
})

// Flow C — Round-robin
useMutation({
  mutationFn: ({ leadIds, counselorIds, override, expectedPlanHash, dryRun }) =>
    BulkAssignService.roundRobin({ leadIds, counselorIds, override, expectedPlanHash, dryRun }),
  onSuccess: invalidateAll,
})

function invalidateAll(report) {
  queryClient.invalidateQueries({ queryKey: ['unassigned-leads'] });
  queryClient.invalidateQueries({ queryKey: ['lead-distribution'] });
  queryClient.invalidateQueries({ queryKey: ['source-counselors-with-load'] });
  queryClient.invalidateQueries({ queryKey: ['counselor-source-assignments'] });
  queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
  emitLeadsChanged();
  toast.success(`Assigned ${report.successCount} of ${report.total} leads`);
  if (report.failureCount > 0) {
    setPhase('partial');
    setErrors(report.failures);
  } else {
    setPhase('success');
  }
}
```

### 5.4 Dry-run as same path

The dry-run is the same RPC call with `p_dry_run=true`. The RPC computes a plan-hash over `lead_id→counselor_id` pairs (sorted by `created_at`). The client passes `expectedPlanHash` on Confirm. If the live evaluation produces a different hash, RPC raises `40001` ("serialization failure") and the client re-previews.

Bulk-one mode does not need a dry-run — it's deterministic.

### 5.5 Pagination + selection persistence

Lead list paginates 200 per page. Selection lives in component state as a `Set<string>` of lead IDs, surviving page changes. Header shows `Selected: 47 across 3 pages`. A `Select all matching` button selects across the current filter, capped at 500.

### 5.6 Loading & empty states

| State | UI |
|---|---|
| Panel collapsed | "Distribute 5 unassigned leads ▼" — single CTA row |
| Expanded, loading | Skeleton rows for the lead list, mode tabs disabled |
| Expanded, empty | "No unassigned leads from this source. Distribution complete." — dismiss panel |
| Mutating | Progress bar `Assigning 12 / 47…` (best-effort; otherwise indeterminate) |
| Partial success | Banner "37 assigned, 10 failed" + collapsible per-lead error list + "Retry failed only" button |

---

## 6. Distribution Modes & DB Calls

### 6.1 Mode A — Bulk-one (no new RPC)

```ts
static async assignAllToOne({ leadIds, counselorId, reason, override }) {
  const results = [];
  for (const leadId of leadIds) {
    // Pre-check: lead may have been claimed by another user
    const { data: cur } = await supabase.from('admission_leads')
      .select('counselor_id').eq('id', leadId).single();
    if (cur?.counselor_id && cur.counselor_id !== counselorId) {
      results.push({ lead_id: leadId, status: 'invalid-stale',
                     reason: 'Already assigned to another counselor' });
      continue;
    }
    try {
      await LeadService.assignCounselor(leadId, counselorId, undefined, { reason, override });
      results.push({ lead_id: leadId, counselor_id: counselorId, status: 'assigned' });
    } catch (err) {
      results.push({ lead_id: leadId, status: 'failed', error: err.message });
    }
  }
  return summarize(results);
}
```

`LeadService.assignCounselor` gains an optional 4th parameter `{ reason?: string, override?: boolean }`. Existing single-lead UI is unchanged.

### 6.2 Mode B — Auto-route RPC

```sql
CREATE OR REPLACE FUNCTION public.bulk_route_unassigned_leads(
  p_lead_ids        uuid[],
  p_dry_run         boolean DEFAULT false,
  p_override        boolean DEFAULT false,
  p_expected_plan_hash text DEFAULT NULL
)
RETURNS TABLE (
  lead_id        uuid,
  counselor_id   uuid,
  status         text,
  reason         text,
  plan_hash      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_lead     record;
  v_pick     uuid;
  v_plan     text := '';
  v_hash     text;
BEGIN
  -- Permission door check
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
      p_lead_id => v_lead.id,
      p_force_override => p_override
    ) INTO v_pick;

    IF v_pick IS NULL THEN
      RETURN QUERY SELECT v_lead.id, NULL::uuid, 'no-candidate'::text,
                          'No eligible counselor at engine eval'::text, NULL::text;
      CONTINUE;
    END IF;

    v_plan := v_plan || v_lead.id::text || '→' || v_pick::text || ';';

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
```

### 6.3 Mode C — Round-robin RPC

```sql
CREATE OR REPLACE FUNCTION public.bulk_round_robin_assign(
  p_lead_ids        uuid[],
  p_counselor_ids   uuid[],
  p_dry_run         boolean DEFAULT false,
  p_override        boolean DEFAULT false,
  p_expected_plan_hash text DEFAULT NULL
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
  v_user_id     uuid := auth.uid();
  v_idx         int := 0;
  v_n_pickers   int := array_length(p_counselor_ids, 1);
  v_lead        record;
  v_target      uuid;
  v_paused      boolean;
  v_at_cap      boolean;
  v_plan        text := '';
  v_hash        text;
  v_today_count int;
BEGIN
  -- Same door check as Mode B
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
    -- Find next non-paused, under-cap counselor (or override)
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
    v_plan := v_plan || v_lead.id::text || '→' || v_target::text || ';';

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
    RAISE EXCEPTION 'plan drift' USING ERRCODE = '40001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_round_robin_assign(uuid[], uuid[], boolean, boolean, text)
  TO authenticated;
```

### 6.4 Migration file

```
supabase/migrations/20260510160000_admission_bulk_assign_unassigned_leads.sql
```

Order: Mode B RPC, Mode C RPC, GRANTs, COMMENTs. Per project rule: file committed alongside `apply_migration` — no placeholders.

---

## 7. Permissions, RLS, Override Gates

### 7.1 Permission keys

| Key | Where it gates | Holder |
|---|---|---|
| `admission.settings.sources.manage` | Whole `<DistributePanel />`, all RPC calls, all mutations | Admission-office role |
| `admission.counselors.team.manage` | Same RPCs (alternative branch) | Principal/HOD |
| `admission.counselors.team.bulk_override` *(NEW)* | Override pause/cap toggle | Admin-only initially |

### 7.2 UI gate

```tsx
const { canAccess, isSuperAdmin } = usePermissions();
const canDistribute =
  isSuperAdmin || canAccess('admission.settings.sources', 'manage');
const canOverride =
  isSuperAdmin || canAccess('admission.counselors.team', 'bulk_override');

if (!canDistribute) return null;
{canOverride && <OverrideToggle … />}
```

### 7.3 Service layer

Maps DB error codes to domain errors; does **not** re-check permissions.

```ts
if (err?.code === '42501')
  throw new BulkAssignError('PERMISSION_DENIED', 'You don\'t have permission…');
if (err?.code === '40001')
  throw new BulkAssignError('STALE_PREVIEW', 'Distribution plan changed…');
```

### 7.4 DB door check

Section 6.2 / 6.3 RPC bodies show the door check. SECURITY DEFINER means body skips RLS on `admission_leads`; the door check is the security boundary.

### 7.5 RLS on `admission_leads` — unchanged

No new policies, no policy changes. Mode A loops the existing single-lead path which already passes RLS. Modes B/C bypass via SECURITY DEFINER.

### 7.6 Audit trail

| Mode | Where audit row written | Visible in |
|---|---|---|
| A — Bulk-one | One `admission_lead_activity` row per lead via existing `LeadService.assignCounselor` | Lead Timeline tab |
| B — Auto-route | RPC writes one `admission_lead_activity` row per UPDATE'd lead with `metadata.via='bulk_auto_route'` | Lead Timeline |
| C — Round-robin | Same with `metadata.via='bulk_round_robin'` | Lead Timeline |

The reason note flows into `admission_lead_activity.notes` for all three modes.

### 7.7 Override toggle — secondary confirmation

When `Override pause/cap` is checked, the Confirm button gains a secondary modal requiring a mandatory reason. Stored with `metadata.override=true`.

### 7.8 Permission catalog change

```ts
// lib/constants/permissions.ts — adjacent to admission.counselors.team.manage
{ key: 'admission.counselors.team.bulk_override',
  label: 'Override Pause/Cap When Bulk Assigning' },
```

---

## 8. Errors & Edge Cases

### 8.1 Error taxonomy

| Code | Cause | Where caught | UX |
|---|---|---|---|
| `42501` | RLS / permission denial | Service maps to `PERMISSION_DENIED` | Full-panel banner; no retry |
| `40001` | Plan-hash drift | Service maps to `STALE_PREVIEW` | "Refresh preview" button; no commit |
| `'no-candidate'` per-lead | All targets blocked | Per-lead row in report | Per-lead retry-with-override option (if perm) |
| `'invalid-stale'` per-lead | Lead claimed by another user | RPC silently skips | Per-lead "already assigned" message |
| `'denied'` per-lead | Counselor deactivated mid-flight | RPC skip | Per-lead "counselor inactive" message |
| Network error | Transport | Mutation catch | Toast "Connection lost — retry" (selection preserved) |
| Tab closed mid-mutation | User accident | None — server-side completes | Reload shows ground truth |
| Empty counselor list (Mode C) | Defense-in-depth | RPC raises | Toast (button should be disabled) |
| Selection > 500 | Cap | Service pre-flight | Toast "Maximum 500 — narrow filters" |

### 8.2 Race conditions

| Race | Defense |
|---|---|
| Lead concurrently assigned by another user | RPC `WHERE id = ANY(p_lead_ids) AND counselor_id IS NULL` filters; report shows `invalid-stale` |
| Counselor capacity drifts between Preview and Confirm | Plan-hash detects only if picks would change; resulting load is correct accounting |
| Source mapping changed mid-flight | Plan-hash detects, throws 40001 |
| Double-click commit | Button disabled via `isPending`; safety guarantee from `WHERE counselor_id IS NULL` |

### 8.3 Partial failure UX

Banner with success / failure counts, collapsible per-lead error list, **Retry failed only** action that filters selection to failed IDs.

### 8.4 Idempotency

Modes B + C are naturally idempotent (filter `counselor_id IS NULL`). Mode A uses a per-lead pre-check to prevent overwriting a freshly-assigned counselor.

### 8.5 Logging

```ts
logger.info('bulk-assign', 'Run started', { mode, leadCount, sourceId });
logger.info('bulk-assign', 'Run completed', { mode, successCount, failureCount, durationMs });
logger.warn('bulk-assign', 'Partial failure', { mode, failures: failures.slice(0, 50) });
logger.error('bulk-assign', 'Run failed', { mode, error: err.message, code: err.code });
```

---

## 9. Testing Strategy

### 9.1 DB function tests (`supabase/tests/bulk_assign/`)

For `bulk_route_unassigned_leads` (8 cases): happy path, cap exhausted, all paused, override flag, stale lead skip, dry-run, plan-hash drift, empty input.

For `bulk_round_robin_assign` (8 cases): even split, uneven split, skip paused, skip at-cap, all targets blocked, empty counselor list, override bypass, dry-run consistency.

### 9.2 Permission + RLS fuzzer (`supabase/tests/bulk_assign/permission_fuzz.sql`)

Per persona × per mode matrix: super_admin, admin, admission, admission_counselor, staff_counselor, learner_counselor, anonymous. Asserts allowed vs `42501`. Override branch tested separately.

### 9.3 Service tests (`lib/services/admission/__tests__/bulk-assign-service.test.ts`)

`assignAllToOne` happy + partial failure + pre-check stale; `autoRoute` + `roundRobin` happy paths with mocked RPC; error code mapping.

### 9.4 Component tests

Permission gating, panel collapsed by default, mode-tab picker visibility, selection across pages, override toggle gating.

### 9.5 Manual UAT — see Section 11

### 9.6 CI gate

```yaml
- name: Bulk-assign DB function tests
  run: psql "$DATABASE_URL" -f supabase/tests/bulk_assign/run_all.sql
- name: Bulk-assign service tests
  run: vitest run lib/services/admission/__tests__/bulk-assign-service.test.ts
- name: Bulk-assign component tests
  run: vitest run app/\(routes\)/admission/settings/sources/[id]/_components/distribute/__tests__/
```

---

## 10. Decisions Made (with reasoning)

| Decision | Picked | Reason |
|---|---|---|
| Where the panel lives | Inline on Distribution tab | Discovery-first; user already there |
| Layout | Collapsible card, expand on CTA | Lazy-load queries; tab stays clean when unused |
| Distribution modes | All three (Bulk-one, Auto-route, Round-robin) | User multi-selected all on advanced-features question |
| Picker enhancements | All four (load preview, dry-run, reason note, override) | User multi-selected all |
| Update strategy | Pessimistic with progress | Bulk + optimistic = partial-rollback complexity |
| Round-robin algorithm | Server-side SQL function | Atomic, no race, single source of truth |
| Auto-route algorithm | Reuse `fn_auto_assign_counselor_v3` | Single source of truth — bulk matches organic creation |
| Dry-run path | Same RPC with `p_dry_run=true` | Preview honesty; one path, two modes |
| Drift detection | Plan-hash (SHA-256 of pairs) | Detects changed-picks but not capacity drift |
| Override key | New `admission.counselors.team.bulk_override` | Granular — separate from `team.manage` |
| Institution scoping | Trust upstream RLS | Avoid drift with `get_user_accessible_institutions` |
| Partial-failure reporting | Show per-lead `invalid-stale` rows | Visibility > brevity |
| Mode A pre-check | One SELECT per lead before assign | Safety > latency for cross-counselor overwrites |
| Permission fuzzer | DB-level SQL test | Deterministic, fast, catches drift on every PR |

---

## 11. Manual UAT Checklist

```
DISTRIBUTE-UNASSIGNED-LEADS UAT — v1
─────────────────────────────────────
Setup:
  □ As super_admin, ensure the test source has 0 mapped counselors initially
  □ Create 10 unassigned leads via the normal create-lead flow
  □ Map 3 counselors with priority weights 1.0, 0.8, 0.5

Mode A — Bulk-one:
  □ Open Distribution tab → "Distribute 10 unassigned leads" CTA visible
  □ Expand panel → mode tabs show, Mode A is default
  □ Select 5 leads, pick counselor #1
  □ Click Confirm (Mode A has no Preview button — assignment is deterministic)
  □ Toast "Assigned 5 of 5"
  □ KPIs flip: Counselors=1, Unassigned=5, Per-counselor table shows Counselor 1 with 5
  □ Lead Timeline on one of the 5 leads shows the bulk-assign entry with reason note

Mode B — Auto-route:
  □ Select remaining 5 leads, switch to Auto-route, click Preview
  □ Dry-run shows distribution roughly proportional to priority_weight
  □ Click Confirm → all 5 assigned per the engine's pick

Mode C — Round-robin:
  □ Re-create 6 unassigned leads, switch to Round-robin
  □ Confirm cyclic distribution: counselor 1 gets 2, counselor 2 gets 2, counselor 3 gets 2

Permission boundary:
  □ As admission-office user (no bulk_override): override toggle absent
  □ As admin: override toggle visible, requires reason note before confirm

Race conditions:
  □ Open panel in two tabs; commit Mode A in tab 1, then Mode A in tab 2 with same selection
    → tab 2 reports all leads as 'invalid-stale'
  □ Mid-preview, manually assign one of the previewed leads from another window
    → confirm in Mode B/C raises 40001 stale-preview, panel shows "Refresh preview"

Permission misalignment regression:
  □ As admission-office user, Mode A (Bulk-one) succeeds
    (regression check for the bug fixed earlier — counselor_sources_modify mismatch)
```

---

## 12. Open Questions (none currently)

All design decisions made and approved through Sections 1-6 of the brainstorming dialogue. No outstanding ambiguities.

---

## 13. Next Steps

1. **You review this spec.** Push back on anything that needs revision.
2. Once approved → invoke `superpowers:writing-plans` skill to produce a step-by-step implementation plan with exact file paths, complete code, and verification commands.
3. Implementation follows in a separate session via `superpowers:executing-plans` or directly.
