# Regulatory Module -- Day 1 Developer Audit

**Date:** 2026-02-23
**Auditor:** Claude Code (acting as a junior developer joining the team)
**Scope:** All files in the regulatory module (hooks, services, types, pages, _components)

---

## FILES AUDITED

### Barrel Exports
- `hooks/regulatory/index.ts`
- `lib/services/regulatory/index.ts`

### Types
- `types/regulatory.types.ts` (~1380 lines)

### Services (9 files)
- `regulatory-framework-service.ts`
- `regulatory-metric-service.ts`
- `regulatory-evidence-service.ts`
- `regulatory-submission-service.ts`
- `regulatory-simulation-service.ts`
- `regulatory-governance-service.ts`
- `regulatory-peer-visit-service.ts`
- `regulatory-syllabus-service.ts`
- `regulatory-benchmark-service.ts`

### Hooks (9 files)
- `use-frameworks.ts`
- `use-metrics.ts`
- `use-evidence.ts`
- `use-submissions.ts`
- `use-simulations.ts`
- `use-governance.ts`
- `use-peer-visits.ts`
- `use-syllabi.ts`
- `use-benchmarks.ts`

### Pages (6 files)
- `regulatory/page.tsx` (Dashboard)
- `regulatory/[frameworkId]/page.tsx` (Framework detail)
- `regulatory/[frameworkId]/metrics/page.tsx` (Metric entry)
- `regulatory/submissions/page.tsx`
- `regulatory/simulations/page.tsx`
- `regulatory/governance/page.tsx`

### Components (8 files)
- `[frameworkId]/_components/criteria-tree.tsx`
- `[frameworkId]/_components/evidence-panel.tsx`
- `[frameworkId]/_components/metric-table.tsx`
- `governance/_components/body-list.tsx`
- `governance/_components/meeting-list.tsx`
- `governance/_components/peer-visit-timeline.tsx`
- `governance/_components/syllabus-table.tsx`
- `submissions/_components/submission-workflow.tsx`

---

## SECTION 1: FIXES APPLIED (Genuinely Broken)

### FIX 1: `useMeetings` useMemo dependency array referenced non-existent filter fields

**File:** `hooks/regulatory/use-governance.ts` line 143-152

The `useMemo` dependency array for `resolvedFilters` listed `filters.status`, `filters.from_date`, and `filters.to_date` -- but `MeetingFilters` (defined in the governance service) only has `body_id`, `institution_id`, `academic_year`, `page`, `limit`. The old deps tracked non-existent properties (always `undefined`), meaning the memo would never invalidate on actual filter changes like `institution_id` or `academic_year`.

**Fix:** Changed dependency array to match the actual `MeetingFilters` interface:
```
- filters.status, filters.from_date, filters.to_date
+ filters.institution_id, filters.academic_year
```

---

## SECTION 2: CONFUSION CHECKLIST ANSWERS

### Q1. "Naming inconsistencies between hooks, services, and pages?"

**YES -- significant inconsistency in hook naming.**

| What the page imports | What it actually calls | What the service is called |
|---|---|---|
| `useRegulatoryFrameworks` | Adapter hook (flat array) | `RegulatoryFrameworkService` |
| `useFrameworks` | Core hook (paginated `{data, metadata}`) | Same service |
| `useAllSubmissions` | Adapter hook (flat array) | `RegulatorySubmissionService` |
| `useSubmissions` | Core hook (paginated) | Same service |

The pattern is: every hook file has **two layers** -- "core" hooks with paginated responses, and "adapter" hooks below them that return flat arrays for page convenience. This is NOT documented anywhere. A new developer would not know which one to use.

**Naming collision risk:** `useFrameworks` and `useRegulatoryFrameworks` sound like the same thing but return completely different shapes (`{data, metadata}` vs `any[]`).

### Q2. "Type duplication between types/regulatory.types.ts and service files?"

**YES -- extensive duplication with DIFFERENT field sets.**

| Type | In `types/regulatory.types.ts` | In service file | Difference |
|---|---|---|---|
| Framework filters | `RegulatoryFrameworkFilters` has `institution_type`, `search` | Service has `institution_id`, `framework_type`, `body`, `search` | Completely different filter fields |
| `SubmissionStatus` | Union of 7 statuses including `'rejected'`, `'returned'` | Service union of 5 statuses, no rejected/returned | Types file has more statuses |
| `GoverningBodyMember` | Has `email`, `phone`, `is_external` | Service has `designation`, `role_in_body`, `affiliation`, `member_type`, `nominated_by`, `tenure_start/end` | Almost entirely different fields |
| `MeetingResolution` | Has `resolution_text`, `proposed_by`, `seconded_by`, `votes_for/against/abstained` | Service has `resolution`, `status`, `responsible_person`, `deadline`, `follow_up_notes` | Completely different |
| `COPOMapping` | Has `co_id`, `po_id`, `mapping_level` | Service has `co_code`, `po_code`, `strength` | Different field names for same concept |
| Benchmark filters | `RegulatoryPeerBenchmarkFilters` | `BenchmarkFilters` in service | Same concept, different names |
| Evidence filters | `RegulatoryEvidenceFilters` | `EvidenceFilters` in service | Same concept, different names |

**Verdict:** The types file is largely a dead letter. Services and hooks import from the service files, not from the types file. The exception is `use-benchmarks.ts`, which imports from the types file (because it bypasses the service entirely).

### Q3. "Are there two different filter types for the same entity?"

**YES.** See Q2. The `types/regulatory.types.ts` filter interfaces are not used by any service or hook (except benchmarks). They exist only as dead/aspirational type definitions.

### Q4. "Do any hooks bypass the service layer?"

**YES -- two clear cases:**

1. **`use-benchmarks.ts`** -- Queries `regulatory_peer_benchmarks` via Supabase directly. Does NOT import or use `RegulatoryBenchmarkService` at all. This is the ONLY hook file that completely bypasses the service layer.

2. **Several adapter hooks make direct Supabase calls** -- These are in hook files that otherwise use services for their core hooks:
   - `useRegulatoryDashboardStats` (in `use-frameworks.ts`) -- direct Supabase queries
   - `useUpcomingDeadlines` (in `use-frameworks.ts`) -- direct Supabase queries
   - `useFrameworkCriteria` (in `use-frameworks.ts`) -- direct Supabase query
   - `useGoverningMeetings` (in `use-governance.ts`) -- direct Supabase query
   - `useSimulationData` (in `use-simulations.ts`) -- direct Supabase queries
   - `useDeleteSimulation` (in `use-simulations.ts`) -- direct Supabase delete
   - `useFrameworkEvidence` (in `use-evidence.ts`) -- direct Supabase query

**Pattern:** "Core" hooks use services; "adapter" hooks often bypass them with direct Supabase calls.

### Q5. "Is useCalculateScore a query that writes to the DB?"

**YES.** In `use-submissions.ts` line 277-291:

```typescript
export function useCalculateScore(submissionId: string): UseQueryResult<any, Error> {
  return useQuery({
    queryFn: () => RegulatorySubmissionService.calculateSubmissionScore(submissionId),
    ...
  })
}
```

The service method `calculateSubmissionScore` performs an `.update()` call to persist `calculated_score` and `grade` to the `regulatory_submissions` table. Wrapping this in `useQuery` means:
- It fires on mount, on refocus, on window visibility change
- It runs on every cache invalidation
- It has no explicit user trigger

This is an anti-pattern. It should be a `useMutation` that the user triggers, or the write side-effect should be removed from the query function.

### Q6. "Do useRefreshAutoMetric / useBulkRefreshAutoMetrics actually refresh anything?"

**NO.** Both mutations in `use-metrics.ts` (lines 269-309) only call `queryClient.invalidateQueries()` to re-fetch cached data. They do NOT:
- Call any external connector/API
- Trigger any DB function
- Compute any new value

They are cache invalidation wrappers disguised as "refresh" operations. The metric-table component (`_components/metric-table.tsx`) calls them as if they refresh auto-calculated data, but all they do is re-fetch the same stale data from the DB.

### Q7. "What fields does the dashboard page reference that don't exist on the data?"

The dashboard page (`regulatory/page.tsx`) displays framework cards and references:
- `fw.metric_count` -- **does not exist** on raw framework rows. Will always show `0` (via `?? 0`).
- `fw.score` -- **does not exist**. Will show `--`.
- `fw.criteria_count` -- **does not exist**. Will show `0`.
- `fw.cycle` -- **does not exist** on frameworks. Will show nothing.

The submissions page (`submissions/page.tsx`) references:
- `sub.due_date` -- **does not exist** on submission rows. Will show `--`.
- `sub.assigned_to_name` -- **does not exist**. Will show `--`.

The framework detail page references:
- `framework.cycle`, `framework.score`, `framework.max_score` -- **none exist** on raw rows.

**Impact:** The UI renders but shows `--` or `0` for these fields. Not a crash, but misleading.

### Q8. "Upload dialogs -- are they functional?"

**NO.** Both upload dialogs are stubs:

1. **Evidence panel** (`evidence-panel.tsx` line 200-222) -- The "Choose Files" button has no `onChange` handler. The "Upload" button calls nothing. The dialog is visual-only.

2. **Metric table** (`metric-table.tsx` line 409-439) -- Same pattern. "Choose Files" does nothing. "Upload" button has no `onClick`. Pure placeholder.

### Q9. "Boilerplate duplication across service files?"

**YES.** Every service file contains identical copies of:
- `isValidUUID(id: string): boolean`
- `validateId(id: string, label: string): void`
- `sanitizeSearch(search: string): string`
- `formatError(error: unknown, fallback: string): Error`

These are copy-pasted across all 9 service files. Should be extracted to a shared utility.

### Q10. "Does the SubmissionWorkflow component handle all statuses?"

**MOSTLY.** The workflow component defines 5 steps: `draft`, `data_collection`, `in_review`, `approved`, `submitted`. The `SubmissionStatus` type in the submission service also defines exactly these 5 plus `accepted`. The `types/regulatory.types.ts` defines 7 statuses including `rejected` and `returned`.

If a submission has status `accepted`, `rejected`, or `returned`, the workflow component's `findIndex` returns `-1`, and all steps render as "pending" (gray). Not a crash, but confusing.

### Q11. "SimulationOverride interface mismatch?"

**YES.** There are TWO different `SimulationOverride` concepts:

1. **In the service** (`regulatory-simulation-service.ts`): Has `metric_id`, `original_value`, `overridden_value` -- metric-level overrides.
2. **In the page** (`simulations/page.tsx`): Local interface with `criteria_id`, `criteria_code`, `criteria_name`, `original_score`, `overridden_score`, `max_score`, `weight` -- criteria-level overrides.

The page passes `overrides: Record<string, any>` (criteria ID -> number) to `useSaveSimulation`, which passes it through to the service's `createSimulation`. The service stores whatever it gets as `overrides` JSONB. The shapes don't match at all, but it "works" because JSONB accepts any shape.

### Q12. "Are there query key namespace collisions?"

**NO.** Each hook file uses a distinct prefix:
- `regulatory-frameworks`
- `regulatory-metrics`
- `regulatory-evidence`
- `regulatory-submissions`
- `regulatory-simulations`
- `regulatory-governance`
- `regulatory-peer-visits`
- `regulatory-syllabi`
- `regulatory-benchmarks`

All unique. Clean separation.

### Q13. "Does useFrameworkMetricValues construct fields that don't exist on the DB?"

**YES.** In `use-metrics.ts` line 199, the adapter constructs:
```typescript
source_type: m.source_type || 'manual'
```
But the `regulatory_metrics` table schema does not have a `source_type` column. This will always evaluate to `'manual'`, making ALL metrics appear as manual in the metric table component.

### Q14. "Does useSimulationData reference non-existent DB columns?"

**YES.** In `use-simulations.ts` lines 162-165:
```typescript
weight: c.weightage || c.weight || 0,
max_score: c.max_score || 100,
current_score: c.score || 0,
```
- `c.weightage` -- likely does not exist; `c.weight` is the correct column name
- `c.score` -- the `regulatory_criteria` table has no `score` column. Current score must be computed from metric values. This means `current_score` is always `0`, making the simulator show all-zero baselines.

### Q15. "Do saved simulations display correctly?"

**PARTIALLY.** The history dialog (simulations page, line 674) references:
```typescript
sim.total_original?.toFixed(1)
sim.total_simulated?.toFixed(1)
```
These are passed to `useSaveSimulation` but the service's `createSimulation` does not store `total_original` or `total_simulated` -- it only stores `name`, `framework_id`, `institution_id`, `base_academic_year`, `overrides`, and auto-generated fields. So these will always show as `undefined` (rendered as blank by `?.toFixed(1)`).

### Q16. "Are all barrel exports complete and correct?"

**YES.** Both barrel files are clean:
- `hooks/regulatory/index.ts` -- `export *` from all 9 hook files
- `lib/services/regulatory/index.ts` -- Named exports of all 9 service classes + their types

No missing exports, no circular dependencies.

### Q17. "Any unused types in types/regulatory.types.ts?"

**MANY.** The file defines ~80 interfaces/types. Most are used only within the file or not at all:
- `RegulatoryDataConnectorRow/Insert/Update` -- no service or hook uses these
- `RegulatoryMetricValueHistoryInsert` -- no service uses this
- Most `*Insert` and `*Update` DTOs -- services define their own input types
- `RegulatoryFrameworkFilters` -- not used by any service (service defines its own)
- `RegulatoryEvidenceFilters` -- not used (service has `EvidenceFilters`)
- `MeetingAgendaItem` in types file -- not used (service has its own)

**Only `use-benchmarks.ts` imports from the types file** (because it bypasses the service layer).

### Q18. "Is the super_admin pattern consistently applied?"

**YES -- very consistent.** Every hook file follows the same pattern:
```typescript
const { isSuperAdmin } = usePermissions()
const institutionId = isSuperAdmin ? undefined : profile?.institution_id
// ...
enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId)
```

All 9 hook files, all adapter hooks, and all page components implement this correctly. No violations found.

### Q19. "Are all _components actually used by their parent pages?"

**YES.** All 8 component files are imported and used:
- `CriteriaTree` -- used by `[frameworkId]/page.tsx`
- `EvidencePanel` -- used by `[frameworkId]/page.tsx`
- `MetricTable` -- used by `[frameworkId]/metrics/page.tsx`
- `BodyList` -- used by `governance/page.tsx`
- `MeetingList` -- used by `governance/page.tsx`
- `SyllabusTable` -- used by `governance/page.tsx`
- `PeerVisitTimeline` -- used by `governance/page.tsx`
- `SubmissionWorkflow` -- used by `submissions/page.tsx`

---

## SECTION 3: OVERALL ASSESSMENT

### What Would Trip Up a Day 1 Developer

1. **Two-tier hook pattern is undocumented.** Every hook file has "core" hooks (paginated, service-backed) and "adapter" hooks (flat arrays, often direct Supabase). No doc explains when to use which. Names like `useFrameworks` vs `useRegulatoryFrameworks` are confusing.

2. **types/regulatory.types.ts is a red herring.** A new developer would assume these are the canonical types. They are not. Services define their own types. The file is ~1380 lines of mostly-unused type definitions.

3. **use-benchmarks.ts breaks the pattern.** Every other hook file delegates to a service class. This one queries Supabase directly. A developer would read the pattern, try to follow it, then hit benchmarks and be confused.

4. **useRefreshAutoMetric is a no-op.** The UI has a "Refresh Auto" button that appears to trigger data recalculation. It only invalidates the React Query cache. The data doesn't change.

5. **Upload dialogs are non-functional stubs.** The evidence panel and metric table both have upload buttons and drag-drop zones that do nothing. A developer testing the UI would think something is broken.

6. **Dashboard and framework detail show phantom fields.** `metric_count`, `score`, `criteria_count`, `cycle` are referenced but don't exist on the data. The UI silently shows `0` or `--`.

7. **useCalculateScore silently writes to DB on every render cycle.** A developer might not realize a `useQuery` hook is performing writes.

8. **Simulation baselines are always zero.** `useSimulationData` reads `c.score` from criteria, but criteria have no score column. The simulator always starts from 0.

### Severity Summary

| Category | Count | Examples |
|---|---|---|
| Fixed (was broken) | 1 | `useMeetings` wrong dependency array |
| Will show wrong data | 3 | Simulation baselines = 0, phantom dashboard fields, source_type always manual |
| Anti-pattern (functional but risky) | 2 | useCalculateScore writes in useQuery, useRefreshAutoMetric is no-op |
| Dead/misleading code | 2 | types/regulatory.types.ts duplication, upload dialog stubs |
| Undocumented pattern | 2 | Two-tier hook architecture, benchmarks bypass service |

### Recommended Next Steps (Not Done -- For Future)

1. Add a comment block at the top of `hooks/regulatory/index.ts` explaining the two-tier pattern
2. Either delete the unused types from `types/regulatory.types.ts` or align them with service types
3. Convert `useCalculateScore` to a mutation
4. Make `useRefreshAutoMetric` actually call a refresh endpoint (or remove the button)
5. Wire up the upload dialogs or remove them
6. Add computed fields (`metric_count`, `score`, `criteria_count`) to the framework adapter hook
7. Fix `useSimulationData` to compute criteria scores from metric values instead of reading a non-existent column
8. Extract shared utility functions (`isValidUUID`, `validateId`, etc.) from service files
