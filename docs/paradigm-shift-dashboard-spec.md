# Paradigm Shift Dashboard — MyJKKN Module Spec

## Date: 2026-03-20
## Status: Ready to Build
## Location: `/solutions/paradigm-shift/`

## What This Is

A self-validating dashboard that shows each department's progress on the Research Paradigm Shift (announced March 19, 2026 at Cluster Council meeting). Reads EXISTING Solution Hub data — no manual entry needed.

## Core Principle: Self-Validating

The system already knows:
- Who the user is (auth + role + department + institution)
- What their department has done (solutions, clients, payments, publications, discovery visits)

Dashboard READS existing tables. No self-reporting forms. No gaming metrics.

## Data Sources (All Existing Tables)

| Metric | Source Table | Query |
|--------|-------------|-------|
| Problems Identified | `sh_discovery_visits` | COUNT WHERE department_id = X |
| Solutions Built | `sh_solutions` | COUNT WHERE lead_department_id = X AND status IN ('active', 'completed') |
| Clients Engaged | `sh_clients` | COUNT DISTINCT via sh_solutions join |
| Revenue Generated | `sh_payments` | SUM(amount) WHERE status = 'completed' via solution → department join |
| Publications (real data) | `sh_publications` | COUNT WHERE department contributors match |
| Prototypes Built | `sh_prototype_iterations` | COUNT via builder assignments → department |
| IP Retained | `sh_solutions` | COUNT WHERE retained_ip = true AND lead_department_id = X |
| TRL 4+ Products | `sh_products` | COUNT WHERE current_trl >= 4 via solution → department |
| Training Completed | `sh_training_programs` | Participant count by department |

## Readiness Tier (Auto-Calculated)

Same tiers from the playbook, but calculated from REAL data:

| Tier | Criteria (from actual data) |
|------|---------------------------|
| **Traditional** (0-3 metrics active) | Few/no discovery visits, no solutions, no clients, no revenue |
| **Emerging** (4-6 metrics active) | Some discovery visits, 1+ solution started, maybe a client |
| **Solution-Ready** (7-9 metrics active) | Active solutions, clients engaged, some revenue flowing |
| **Pioneer** (all metrics active) | Multiple solutions, revenue, publications from real data, IP retained |

"Active metric" = has at least 1 entry in the relevant table for current fiscal year.

## Pages to Build

### 1. `/solutions/paradigm-shift/` — Institutional Overview
- Grid of all departments across all 9 institutions
- Each card shows: department name, institution, tier badge, key metrics
- Color-coded by tier (rose/yellow/blue/green)
- Filter by: institution, tier, date range
- Sort by: revenue, solutions count, publications

### 2. `/solutions/paradigm-shift/[departmentId]` — Department Detail
- Full breakdown of all 9 metrics with actual numbers
- Timeline chart: progress over months (when did they start moving?)
- Links to actual solutions, clients, publications in Solution Hub
- Comparison with institutional average
- "What to do next" recommendations based on what's missing

### 3. `/solutions/paradigm-shift/leaderboard` — Leaderboard
- Ranked list of departments by composite score
- Highlight movers (departments that improved tier this month)
- Institution-level aggregation
- Export to PDF for reporting

## Optional: Targets Table (NEW — only if needed)

```sql
CREATE TABLE sh_paradigm_shift_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INT NOT NULL,
  institution_id UUID REFERENCES institutions(id),
  department_id UUID REFERENCES departments(id),
  problems_target INT DEFAULT 0,
  solutions_target INT DEFAULT 0,
  clients_target INT DEFAULT 0,
  revenue_target NUMERIC(12,2) DEFAULT 0,
  publications_target INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID,
  UNIQUE(fiscal_year, institution_id, department_id)
);
```

This allows setting annual targets per department so the dashboard shows actual vs target.

## Connection to Playbook

The live playbook at https://jkkn-research-paradigm.vercel.app can link to this dashboard:
- "See Where You Stand" button → links to MyJKKN paradigm shift dashboard
- Real-time data instead of self-assessment checkboxes

## Build Approach

1. Create service: `lib/services/solutions/paradigm-shift.ts`
2. Create hooks: `hooks/solutions/useParadigmShift.ts`
3. Create pages: 3 pages (overview, detail, leaderboard)
4. Create components: tier badge, metric card, department card, leaderboard table
5. No new migrations needed (reads existing tables) — targets table is optional

## Priority: P0 (April 1st deadline)

This needs to be live before April 1, 2026 when departments officially transition to Solutions Departments. The dashboard is how they see their score.
