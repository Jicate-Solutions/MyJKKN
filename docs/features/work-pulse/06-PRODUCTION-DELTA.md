# Work Pulse — Production Delta Report

> Comparing `omm-dev` branch against `origin/main` (production)
> Generated: 2026-03-31

## Summary

| Action | Count |
|--------|-------|
| **New files** (developer must CREATE) | 26 |
| **Modified files** (developer must UPDATE) | 3 |
| **Deleted files** | 0 |
| **DB tables to create** | 4 |
| **DB enum types to create** | 4 |
| **RLS policies to create** | 13 |

## New Files (26) — Developer Must CREATE

### Pages (3)
```
A  app/(routes)/work-pulse/page.tsx
A  app/(routes)/work-pulse/agents/page.tsx
A  app/(routes)/work-pulse/impact/page.tsx
```

### Components (7)
```
A  app/(routes)/work-pulse/_components/weekly-pulse-form.tsx
A  app/(routes)/work-pulse/_components/compliance-tab.tsx
A  app/(routes)/work-pulse/_components/micro-interview-response.tsx
A  app/(routes)/work-pulse/_components/instant-help-card.tsx
A  app/(routes)/work-pulse/_components/badge-display.tsx
A  app/(routes)/work-pulse/agents/_components/pattern-card.tsx
A  app/(routes)/work-pulse/agents/_components/tier-section.tsx
```

### Data Fetchers (4)
```
A  app/(routes)/work-pulse/_data/get-pulse-stats.ts
A  app/(routes)/work-pulse/_data/get-pulse-entries.ts
A  app/(routes)/work-pulse/agents/_data/get-patterns.ts
A  app/(routes)/work-pulse/impact/_data/get-impact.ts
```

### Server Actions (1)
```
A  app/(routes)/work-pulse/_actions/pulse-actions.ts
```

### API Routes (3)
```
A  app/api/work-pulse/analyze/route.ts        (557 lines)
A  app/api/work-pulse/notify/route.ts         (704 lines)
A  app/api/work-pulse/translate/route.ts      (218 lines)
```

### Service (1)
```
A  lib/services/work-pulse/work-pulse-service.ts  (365 lines)
```

### Types (1)
```
A  types/work-pulse.ts                        (168 lines)
```

### Global Component (1)
```
A  components/work-pulse-fab.tsx              (171 lines)
```

### Migrations (4)
```
A  supabase/migrations/20260330000001_wp_pulse_entries.sql
A  supabase/migrations/20260330000002_wp_patterns.sql
A  supabase/migrations/20260330000003_wp_micro_interviews_and_impact.sql
A  supabase/migrations/20260330000004_wp_rls_and_constraints_fixes.sql
```

**Note:** `20260330000001_privilege_monthly_renewal.sql` also appears as new but is UNRELATED to Work Pulse. Skip it or handle separately.

## Modified Files (3) — Developer Must UPDATE

### `app/(routes)/layout.tsx`
**Change:** Add WorkPulseFab import and render
```diff
+ import { WorkPulseFab } from '@/components/work-pulse-fab';
  // Inside layout component, after BugReporterWidget:
+ <WorkPulseFab />
```
Also: QueryClientProvider wrapping order was swapped (now wraps AdminPanelLayout instead of being inside it).

### `lib/sidebarMenuLink.ts`
**Change:** Add Work Pulse sidebar group (3 menu items) + new icon imports
- Added ~25 lines at end of menu array
- Added ~20 new icon imports (Activity, Brain, TrendingUp, etc.)

### `lib/constants/permissions.ts`
**Change:** Add work_pulse permission strings
```diff
+ { key: 'work_pulse.view', label: 'View Work Pulse' },
+ { key: 'work_pulse.agents.view', label: 'View Agent Board' },
+ { key: 'work_pulse.impact.view', label: 'View Impact Dashboard' },
```

## Database Delta

### Production → Staging: No reverse sync needed
Work Pulse is a new module — no tables exist on production. All 4 tables + 4 enums are new.

### Staging → Production: What developer must create
| Object | Type | Notes |
|--------|------|-------|
| wp_pulse_entries | Table | 14 columns, see 03-DATABASE-SCHEMAS.md |
| wp_patterns | Table | 20 columns |
| wp_micro_interviews | Table | 10 columns |
| wp_agent_impact | Table | 13 columns (1 generated) |
| wp_pattern_source | Enum | observer, pulse, both, user_request |
| wp_solution_type | Enum | new_module, standalone_agent, process_change, training |
| wp_pattern_tier | Enum | S, A, B, C |
| wp_pattern_status | Enum | discovered, classified, queued, building, deployed, measuring |
| 13 RLS policies | Policy | See 03-DATABASE-SCHEMAS.md |
| 15 indexes | Index | Including PKs and UNIQUE |
| 1 trigger function | Function | wp_enforce_micro_interview_monthly_limit |
| 1 trigger | Trigger | BEFORE INSERT on wp_micro_interviews |

## Environment Variables Delta

| Variable | On Staging? | On Production? | Action |
|----------|-------------|----------------|--------|
| `ANTHROPIC_API_KEY` | No (503 on API) | No | **Developer: Add to production Vercel** |
| `WORK_PULSE_API_KEY` | No | No | **Developer: Generate + add to production** |

## Merge Strategy

### Recommended: Cherry-pick approach
```bash
# From production branch
git remote add ommdev https://github.com/Jicate-Solutions/myjkkn_ommdev.git
git fetch ommdev omm-dev

# Cherry-pick the work-pulse commits (find exact SHAs)
git log ommdev/omm-dev --oneline -- "app/(routes)/work-pulse/" "app/api/work-pulse/" "lib/services/work-pulse/" "types/work-pulse.ts" "components/work-pulse-fab.tsx"

# Or copy files directly
git checkout ommdev/omm-dev -- \
  "app/(routes)/work-pulse/" \
  "app/api/work-pulse/" \
  "lib/services/work-pulse/" \
  "types/work-pulse.ts" \
  "components/work-pulse-fab.tsx" \
  "supabase/migrations/20260330000001_wp_pulse_entries.sql" \
  "supabase/migrations/20260330000002_wp_patterns.sql" \
  "supabase/migrations/20260330000003_wp_micro_interviews_and_impact.sql" \
  "supabase/migrations/20260330000004_wp_rls_and_constraints_fixes.sql"

# Then manually apply the 3 modified files (layout.tsx, sidebarMenuLink.ts, permissions.ts)
```
