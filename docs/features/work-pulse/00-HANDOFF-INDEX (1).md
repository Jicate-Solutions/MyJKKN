# Work Pulse Module — Handoff Index

> **Quick Start:** Read this file first, then `01-ARCHITECTURE.md`, then `03-DATABASE-SCHEMAS.md`.

## Files to Create (26 new files)

### Pages (3)
```
app/(routes)/work-pulse/page.tsx                         # My Pulse — main dashboard + weekly form
app/(routes)/work-pulse/agents/page.tsx                  # Agent Opportunity Board (S/A/B/C tiers)
app/(routes)/work-pulse/impact/page.tsx                  # Impact Dashboard — hours saved, flywheel
```

### Components (7)
```
app/(routes)/work-pulse/_components/weekly-pulse-form.tsx          # 2-question weekly form
app/(routes)/work-pulse/_components/compliance-tab.tsx             # HOD/admin compliance view
app/(routes)/work-pulse/_components/micro-interview-response.tsx   # Inline interview response
app/(routes)/work-pulse/_components/instant-help-card.tsx          # Post-submit pattern matching
app/(routes)/work-pulse/_components/badge-display.tsx              # Agent Originator badges
app/(routes)/work-pulse/agents/_components/pattern-card.tsx        # Expandable pattern card
app/(routes)/work-pulse/agents/_components/tier-section.tsx        # Tier grouping wrapper
```

### Data Fetchers (4)
```
app/(routes)/work-pulse/_data/get-pulse-stats.ts         # Personal stats
app/(routes)/work-pulse/_data/get-pulse-entries.ts       # Entry history
app/(routes)/work-pulse/agents/_data/get-patterns.ts     # Pattern list + impact summary
app/(routes)/work-pulse/impact/_data/get-impact.ts       # Impact metrics
```

### Server Actions (1)
```
app/(routes)/work-pulse/_actions/pulse-actions.ts        # submit, quickSubmit, respondInterview, instantHelp
```

### API Routes (3)
```
app/api/work-pulse/analyze/route.ts                      # Claude AI weekly analysis (557 lines)
app/api/work-pulse/notify/route.ts                       # 7 notification types (704 lines)
app/api/work-pulse/translate/route.ts                    # Tamil→English via Claude (218 lines)
```

### Service Layer (1)
```
lib/services/work-pulse/work-pulse-service.ts            # 13 methods, 365 lines
```

### Types (1)
```
types/work-pulse.ts                                      # All entities + DTOs + filters (168 lines)
```

### Global Component (1)
```
components/work-pulse-fab.tsx                             # Floating Action Button (171 lines)
```

### Database Migrations (4)
```
supabase/migrations/20260330000001_wp_pulse_entries.sql
supabase/migrations/20260330000002_wp_patterns.sql
supabase/migrations/20260330000003_wp_micro_interviews_and_impact.sql
supabase/migrations/20260330000004_wp_rls_and_constraints_fixes.sql
```

**Note:** Migration `20260330000001_privilege_monthly_renewal.sql` is unrelated to Work Pulse — skip it.

## Files to Modify (3 existing files)

| File | Change | Lines Affected |
|------|--------|---------------|
| `app/(routes)/layout.tsx` | Add `import { WorkPulseFab }` + render `<WorkPulseFab />` | +2 lines, reorder QueryClientProvider wrapping |
| `lib/sidebarMenuLink.ts` | Add Work Pulse sidebar group with 3 menu items + new icon imports | ~25 lines added at end of menu array |
| `lib/constants/permissions.ts` | Add `work_pulse.view`, `work_pulse.agents.view`, `work_pulse.impact.view` | ~5 lines |

## Environment Variables Required

| Variable | Purpose | Example |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Claude API calls for analysis + translation | `sk-ant-api03-...` |
| `WORK_PULSE_API_KEY` | Cron endpoint authentication | `wp-cron-...` (generate secure key) |

## Dependencies

| Package | Already in project? | Purpose |
|---------|-------------------|---------|
| `@anthropic-ai/sdk` | Yes | Claude API client |
| `react-hook-form` | Yes | Form handling |
| `zod` | Yes | Schema validation |
| `framer-motion` | Yes | FAB animations |
| `sonner` | Yes | Toast notifications |

No new package installations needed.

## Spec Reference

Full specification: `docs/work-pulse-spec.md` (639 lines, v2.0)
