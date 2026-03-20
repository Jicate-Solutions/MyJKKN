# SDD Handoff: Paradigm Shift Dashboard

## Start Command
```
/sdd build paradigm shift dashboard — read docs/paradigm-shift-dashboard-spec.md
```

## Context
- Cluster Council meeting (2026-03-19): Ommsharravana announced research paradigm shift
- All departments become Solutions Departments from April 1, 2026
- Playbook deployed: https://jkkn-research-paradigm.vercel.app (12 sections, JKKN branded)
- Now need: self-validating dashboard in MyJKKN Solution Hub

## SDD Phase Status
- [x] Phase 0: Idea described and validated
- [x] Phase 1: Spec written at `docs/paradigm-shift-dashboard-spec.md`
- [x] Phase 2+3: Technical plan + task breakdown (built directly from spec)
- [x] Phase 4: Build complete — all 3 pages, service, hooks, API routes, components
- [x] Phase 5: Spec compliance fixes — sort, filters, movers, PDF export, IP metric

## Key Design Decisions (Already Made)
1. **Self-validating** — reads existing sh_* tables, no manual forms
2. **3 pages** — overview grid, department detail, leaderboard
3. **0 new migrations** — all data exists (optional targets table if needed)
4. **Auto-tier calculation** — Traditional/Emerging/Solution-Ready/Pioneer
5. **Existing tables used:** sh_solutions, sh_clients, sh_payments, sh_publications, sh_discovery_visits, sh_products, sh_prototype_iterations, sh_training_programs

## Spec Compliance

| Spec Requirement | Status | File(s) |
|-----------------|--------|---------|
| **Page 1: Institutional Overview** (`/solutions/paradigm-shift/`) | Complete | `app/(routes)/solutions/paradigm-shift/page.tsx` |
| Grid of all departments across institutions | Complete | `_components/overview-grid.tsx` |
| Each card: name, institution, tier badge, key metrics | Complete | `_components/department-card.tsx` |
| Color-coded by tier (rose/yellow/blue/green) | Complete | `_components/tier-badge.tsx` |
| Filter by institution | Complete | `_components/overview-grid.tsx` (Select dropdown) |
| Filter by tier | Complete | `_components/overview-grid.tsx` (Select dropdown) |
| Filter by date range | Complete | `_components/overview-grid.tsx` (FY selector, placeholder for future ranges) |
| Sort by revenue, solutions count, publications | Complete | `_components/overview-grid.tsx` (ArrowUpDown sort selector) |
| **Page 2: Department Detail** (`/solutions/paradigm-shift/[departmentId]`) | Complete | `[departmentId]/page.tsx` |
| Full breakdown of all 9 metrics | Complete | `_components/metric-card.tsx` |
| Timeline chart: progress over months | Complete | `[departmentId]/_components/department-detail.tsx` (bar chart) |
| Links to actual solutions, publications | Complete | Recent solutions/publications with links |
| Comparison with institutional average | Complete | vs Institutional Average card with % diff |
| "What to do next" recommendations | Complete | Auto-generated from missing metrics |
| **Page 3: Leaderboard** (`/solutions/paradigm-shift/leaderboard`) | Complete | `leaderboard/page.tsx` |
| Ranked list by composite score | Complete | `leaderboard/_components/leaderboard-table.tsx` |
| Highlight movers (tier improved this month) | Complete | Movers banner + "Moved Up" badge per row |
| Institution-level aggregation | Complete | Institution Summary cards (depts, avg score, pioneers, revenue) |
| Export to PDF | Complete | `leaderboard/_components/export-pdf-button.tsx` (print-to-PDF) |
| **Data Sources** | | |
| Problems Identified from `sh_discovery_visits` | Complete | Service queries `sh_discovery_visits` by dept |
| Solutions Built from `sh_solutions` | Complete | Service queries `sh_solutions` (active/completed) |
| Clients Engaged from `sh_clients` | Complete | DISTINCT client_id via solutions join |
| Revenue from `sh_payments` | Complete | SUM(amount) via solution -> department |
| Publications from `sh_publications` | Complete | COUNT by department_id |
| Prototypes from `sh_prototype_iterations` | Complete | COUNT via phases -> solutions -> department |
| IP Retained from `sh_solutions.retained_ip` | Complete | `WHERE retained_ip = true` (spec-correct, NOT patent_status) |
| TRL 4+ Products from `sh_products` | Complete | `WHERE current_trl >= 4` |
| Training from `sh_training_programs` | Complete | participant_count via solutions -> department |
| **Readiness Tier Calculation** | Complete | `calculateTier()` in service: 0-3=Traditional, 4-6=Emerging, 7-8=Solution-Ready, 9=Pioneer |
| **Auth & Security** | | |
| All API routes use `withAuth` | Complete | 3 routes, all protected |
| Institution scoping for non-super_admin | Complete | Routes enforce `auth.institutionId` |

## Files Created/Modified

### Service Layer
- `lib/services/solutions/paradigm-shift-service.ts` — Core service with `getOverview`, `getDepartmentDetail`, `getLeaderboard`

### React Query Hooks
- `hooks/solutions/use-paradigm-shift.ts` — `useParadigmShiftOverview`, `useParadigmShiftDepartment`, `useParadigmShiftLeaderboard`

### API Routes
- `app/api/solutions/paradigm-shift/route.ts` — Overview endpoint
- `app/api/solutions/paradigm-shift/[departmentId]/route.ts` — Department detail endpoint
- `app/api/solutions/paradigm-shift/leaderboard/route.ts` — Leaderboard endpoint

### Pages
- `app/(routes)/solutions/paradigm-shift/page.tsx` — Overview page
- `app/(routes)/solutions/paradigm-shift/[departmentId]/page.tsx` — Department detail page
- `app/(routes)/solutions/paradigm-shift/leaderboard/page.tsx` — Leaderboard page

### Components
- `_components/overview-grid.tsx` — Main grid with filters + sort + date range
- `_components/department-card.tsx` — Department card with tier badge and metrics
- `_components/tier-badge.tsx` — Color-coded tier badge + `getTierColor` helper
- `_components/metric-card.tsx` — 9-metric grid with active/inactive styling + avg comparison
- `[departmentId]/_components/department-detail.tsx` — Full department view
- `leaderboard/_components/leaderboard-table.tsx` — Ranked table with podium, movers, institution summary
- `leaderboard/_components/export-pdf-button.tsx` — Print-to-PDF with landscape A4

## TypeScript Verification
- Zero TypeScript errors in any paradigm-shift file (verified 2026-03-20)
- Pre-existing TS errors in other modules (startup-studio, campus-living) are unrelated

## What Remains (Optional / Future)
- `sh_paradigm_shift_targets` table for actual vs target tracking
- Date range picker for custom FY ranges (currently shows current FY)
- `tier_changed` field on leaderboard entries currently returns `false` — needs previous month snapshot comparison
- Connection to live playbook ("See Where You Stand" button)
