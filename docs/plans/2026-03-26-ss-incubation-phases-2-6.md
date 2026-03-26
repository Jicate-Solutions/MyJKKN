# Startup Studio Incubation Enhancement: Phases 2-6 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Complete the full-stack incubation management system — Mentor Ecosystem, Graduation & Exit, KPI Framework, Finance & Governance, and Marketing — transforming the NIF pipeline from a thin stage tracker into a comprehensive incubation platform.

**Architecture:** Each phase follows the MyJKKN Pattern A stack: Migration (SQL) → Service (static class) → Hooks (React Query) → API Routes (withAuth) → Pages (shadcn/ui). All phases target the staging Supabase (`hhprjbgknupaplivtoib`) via Management API. Services use `createClientSupabaseClient() as any` for new tables not yet in generated types.

**Tech Stack:** Next.js 16, TypeScript, Supabase (PostgreSQL + RLS), React Query, shadcn/ui, Tailwind CSS, lucide-react icons.

**Master Spec:** `specs/STARTUP-STUDIO-INCUBATION-ENHANCEMENT-SPEC.md` (1,593 lines)

---

## Status Summary

| Phase | Name | Migration | Service | Hooks | API Routes | Pages | Status |
|-------|------|-----------|---------|-------|------------|-------|--------|
| 1 | Portfolio Intelligence | Done | Done (4) | Done (4) | Done (9) | Done (11) | **COMPLETE** |
| 2 | Mentor Ecosystem | Done | Done (514 lines) | Done (181 lines) | Done (6) | Done (4) | **COMPLETE** (verify) |
| 3 | Graduation & Exit | Done | Done (476 lines) | Done (178 lines) | Done (7) | Done (3) | **COMPLETE** (verify) |
| 4 | KPI & Impact | Not started | Not started | Not started | Not started | Not started | **TODO** |
| 5 | Finance + Governance + Compliance | Not started | Not started | Not started | Not started | Not started | **TODO** |
| 6 | Marketing & Outreach | Not started | Not started | Not started | Not started | Not started | **TODO** |

---

## PHASE 2: Mentor Ecosystem — VERIFY & COMPLETE

### What's Built
- Migration: `20260326000002_ss_mentor_ecosystem.sql` (4 tables: ss_mentors, ss_mentor_matches, ss_mentor_sessions, ss_mentor_evaluations)
- Service: `lib/services/startup-studio/mentor-service.ts` (514 lines)
- Hooks: `hooks/startup-studio/use-mentors.ts` (181 lines)
- API Routes: 6 routes under `app/api/startup-studio/mentors/`
- Pages: Mentor directory, mentor detail, NIF mentor tab

### Task 2.1: Push migration to staging DB
**Files:** `supabase/migrations/20260326000002_ss_mentor_ecosystem.sql`

**Step 1: Execute migration on staging via Management API**
```bash
ACCESS_TOKEN=$(cat ~/.supabase/access-token)
SQL=$(cat supabase/migrations/20260326000002_ss_mentor_ecosystem.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/hhprjbgknupaplivtoib/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")"
```

**Step 2: Add RLS + GRANTs**
```sql
-- For each table: ss_mentors, ss_mentor_matches, ss_mentor_sessions, ss_mentor_evaluations
ALTER TABLE ss_mentors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ss_mentors TO authenticated;
GRANT SELECT ON ss_mentors TO anon;
-- RLS policy: institution_id scoped + super_admin bypass
CREATE POLICY "ss_mentors_sel" ON ss_mentors FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
    AND (profiles.role = 'super_admin' OR profiles.institution_id = ss_mentors.institution_id))
);
-- Repeat INSERT/UPDATE/DELETE policies
-- Repeat for all 4 tables
```

**Step 3: Verify tables exist**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/hhprjbgknupaplivtoib/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT tablename FROM pg_tables WHERE tablename LIKE '\''ss_mentor%'\'' ORDER BY tablename"}'
```
Expected: 4 tables (ss_mentors, ss_mentor_matches, ss_mentor_sessions, ss_mentor_evaluations)

### Task 2.2: Verify mentor pages render
**Step 1:** Navigate to `/startup-studio/mentors` — should show directory page
**Step 2:** Navigate to `/startup-studio/nif/[id]` and check Mentor tab exists
**Step 3:** Check browser console for errors

### Task 2.3: Commit Phase 2 verification
```bash
git add -A && git commit -m "verify: Phase 2 Mentor Ecosystem complete"
```

---

## PHASE 3: Graduation & Exit — VERIFY & COMPLETE

### What's Built
- Migration: `20260326000003_ss_graduation_exit.sql` (4 tables: ss_graduation_criteria, ss_graduation_evaluations, ss_exit_procedures, ss_alumni_tracking)
- Service: `lib/services/startup-studio/graduation-service.ts` (476 lines)
- Hooks: `hooks/startup-studio/use-graduation.ts` (178 lines)
- API Routes: 7 routes (graduation criteria, NIF graduation, NIF exit, alumni CRUD, alumni metrics)
- Pages: Alumni directory, NIF graduation tab

### Task 3.1: Push migration to staging DB
Same pattern as Task 2.1 using `20260326000003_ss_graduation_exit.sql`

### Task 3.2: Add RLS + GRANTs for graduation tables
```sql
-- For: ss_graduation_criteria, ss_graduation_evaluations, ss_exit_procedures, ss_alumni_tracking
-- Same RLS pattern: institution_id scoped + super_admin bypass
```

### Task 3.3: Verify graduation pages render
**Step 1:** Navigate to `/startup-studio/alumni` — should show directory
**Step 2:** Navigate to `/startup-studio/nif/[id]` and check Graduation tab
**Step 3:** Test "Evaluate Readiness" action (if available)

### Task 3.4: Add missing Exit Management page (if not built)
**Files:**
- Create: `app/(routes)/startup-studio/nif/[id]/_components/exit-tab.tsx`

The NIF detail page should have an Exit tab showing:
- Exit procedure status (notice, reconciliation, documentation, offboarding)
- "Initiate Exit" button → form with exit type dropdown
- Checklist of exit steps with completion status

### Task 3.5: Commit Phase 3 verification
```bash
git add -A && git commit -m "verify: Phase 3 Graduation & Exit complete"
```

---

## PHASE 4: KPI & Impact Framework — FULL BUILD

**Spec section:** 3H (lines 1105-1257)
**Tables:** ss_kpi_definitions, ss_kpi_measurements, ss_impact_reports
**Priority:** P2

### Task 4.1: Create migration
**File:** `supabase/migrations/20260326000004_ss_kpi_impact.sql`

```sql
-- KPI definitions (seeded with DST/MSH/MoE requirements)
CREATE TABLE ss_kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  framework TEXT NOT NULL CHECK (framework IN ('dst', 'msh', 'moe_innovation_cell', 'nirf', 'internal', 'custom')),
  category TEXT NOT NULL CHECK (category IN ('input', 'output', 'outcome', 'impact')),
  data_type TEXT NOT NULL CHECK (data_type IN ('integer', 'decimal', 'currency', 'percentage', 'boolean', 'text')),
  unit TEXT,
  measurement_method TEXT,
  target_value NUMERIC(15,2),
  target_period TEXT,
  collection_frequency TEXT DEFAULT 'quarterly' CHECK (collection_frequency IN ('monthly', 'quarterly', 'annually', 'real_time')),
  source_table TEXT,
  source_query TEXT,
  is_auto_calculated BOOLEAN DEFAULT false,
  relevant_to TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code, institution_id)
);

-- KPI measurements
CREATE TABLE ss_kpi_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES ss_kpi_definitions(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value NUMERIC(15,2) NOT NULL,
  previous_value NUMERIC(15,2),
  notes TEXT,
  data_source TEXT,
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(kpi_id, period_start, period_end, institution_id)
);

-- Impact reports
CREATE TABLE ss_impact_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('annual_report', 'quarterly_report', 'funder_specific', 'nirf_submission', 'custom')),
  target_audience TEXT NOT NULL CHECK (target_audience IN ('funders', 'board', 'startups', 'policymakers', 'public', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  executive_summary TEXT,
  startup_highlights JSONB DEFAULT '[]',
  kpi_snapshot JSONB DEFAULT '{}',
  report_url TEXT,
  infographic_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published')),
  approved_by UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS, GRANTs, indexes for all 3 tables
-- Seed 10 DST KPIs + 4 MoE KPIs for all institutions
```

### Task 4.2: Create service
**File:** `lib/services/startup-studio/kpi-service.ts`

Methods:
- `getKpiDefinitions(filters: {framework?, category?, institutionId?})` → paginated list
- `getKpiDefinition(id)` → single KPI with measurements
- `createKpiDefinition(data)` → KPI
- `recordMeasurement(kpiId, data)` → measurement
- `getKpiDashboard(institutionId?, period?)` → { kpis with latest values, trends }
- `getImpactReports(filters)` → paginated list
- `createImpactReport(data)` → report
- `generateKpiSnapshot(reportId)` → populates kpi_snapshot from current measurements
- `getFrameworkCompliance(framework)` → { total_kpis, measured, unmeasured, pct }

### Task 4.3: Create hooks
**File:** `hooks/startup-studio/use-kpi.ts`

Hooks: `useKpiDefinitions`, `useKpiDefinition`, `useKpiDashboard`, `useRecordMeasurement`, `useImpactReports`, `useCreateImpactReport`, `useFrameworkCompliance`

### Task 4.4: Create API routes
**Files:**
- `app/api/startup-studio/kpi/route.ts` (GET list, POST create)
- `app/api/startup-studio/kpi/[id]/route.ts` (GET, PATCH)
- `app/api/startup-studio/kpi/[id]/measure/route.ts` (POST record measurement)
- `app/api/startup-studio/kpi/dashboard/route.ts` (GET dashboard)
- `app/api/startup-studio/kpi/compliance/route.ts` (GET framework compliance)
- `app/api/startup-studio/impact-reports/route.ts` (GET list, POST create)
- `app/api/startup-studio/impact-reports/[id]/route.ts` (GET, PATCH)

### Task 4.5: Create KPI Dashboard page
**File:** `app/(routes)/startup-studio/kpi/page.tsx`

Layout:
- KPI cards grid: Each card shows KPI name, current value, target, trend arrow, framework badge
- Framework filter tabs: All | DST | MSH | MoE | NIRF | Internal
- Compliance meters: per-framework % measured
- "Record Measurement" action per KPI
- Link to Impact Reports

### Task 4.6: Create KPI Detail page
**File:** `app/(routes)/startup-studio/kpi/[id]/page.tsx`

Shows: KPI definition, measurement history chart (line), target line, all measurements in table, "Record" button

### Task 4.7: Create Impact Reports page
**File:** `app/(routes)/startup-studio/kpi/reports/page.tsx`

List of impact reports with status badges, "Create Report" button, report detail view with KPI snapshot

### Task 4.8: Add sidebar entries for KPI
**File:** Modify `lib/sidebarMenuLink.ts`

Add under Startup Studio group:
```typescript
{ href: '/startup-studio/kpi', label: 'KPI Dashboard', icon: PieChart }
{ href: '/startup-studio/kpi/reports', label: 'Impact Reports', icon: FileBarChart }
```

### Task 4.9: Push migration to staging + verify
Same Management API pattern as Phase 2.

### Task 4.10: Commit Phase 4
```bash
git add -A && git commit -m "feat: Phase 4 KPI & Impact Framework"
```

---

## PHASE 5: Finance + Governance + Compliance — FULL BUILD

**Spec sections:** 3E (lines 775-935), 3F (lines 937-1033), 3G (lines 1035-1103)
**Tables:** ss_grants, ss_budgets, ss_revenue, ss_audit_records, ss_governance_members, ss_compliance_items, ss_readiness_assessments
**Priority:** P2-P3

### Task 5.1: Create migration
**File:** `supabase/migrations/20260326000005_ss_finance_governance.sql`

7 tables from spec sections 3E, 3F, 3G:
- `ss_grants` (20 cols, GENERATED utilization_pct)
- `ss_budgets` (14 cols, GENERATED variance_pct, UNIQUE constraint)
- `ss_revenue` (10 cols)
- `ss_audit_records` (14 cols)
- `ss_governance_members` (14 cols)
- `ss_compliance_items` (16 cols)
- `ss_readiness_assessments` (30 cols, GENERATED overall_score + overall_pct)

Plus: RLS, GRANTs, indexes, seed compliance checklist items (from spec section 3F table)

### Task 5.2: Create services (3 files)
**Files:**
- `lib/services/startup-studio/finance-service.ts`
  - Methods: getGrants, createGrant, updateGrant, getBudgets, createBudget, getRevenue, recordRevenue, getAuditRecords, createAuditRecord, getSustainabilityMetrics (self_generated / total), getGrantUtilization
- `lib/services/startup-studio/governance-service.ts`
  - Methods: getGovernanceMembers, addMember, updateMember, getCommitteeComposition, getComplianceItems, updateComplianceStatus, getComplianceDashboard (overdue count, completion rate)
- `lib/services/startup-studio/readiness-service.ts`
  - Methods: getAssessments, createAssessment, getLatestAssessment, getReadinessTimeline

### Task 5.3: Create hooks (3 files)
**Files:**
- `hooks/startup-studio/use-finance.ts`
- `hooks/startup-studio/use-governance.ts`
- `hooks/startup-studio/use-readiness.ts`

### Task 5.4: Create API routes (~15 routes)
**Files:**
- `app/api/startup-studio/finance/grants/route.ts` (GET, POST)
- `app/api/startup-studio/finance/grants/[id]/route.ts` (GET, PATCH)
- `app/api/startup-studio/finance/budgets/route.ts` (GET, POST)
- `app/api/startup-studio/finance/revenue/route.ts` (GET, POST)
- `app/api/startup-studio/finance/sustainability/route.ts` (GET metrics)
- `app/api/startup-studio/finance/audits/route.ts` (GET, POST)
- `app/api/startup-studio/governance/members/route.ts` (GET, POST)
- `app/api/startup-studio/governance/members/[id]/route.ts` (PATCH, DELETE)
- `app/api/startup-studio/governance/compliance/route.ts` (GET list, POST create)
- `app/api/startup-studio/governance/compliance/[id]/route.ts` (PATCH status)
- `app/api/startup-studio/governance/compliance/dashboard/route.ts` (GET summary)
- `app/api/startup-studio/readiness/route.ts` (GET list, POST create)
- `app/api/startup-studio/readiness/latest/route.ts` (GET latest)

### Task 5.5: Create Finance Dashboard page
**File:** `app/(routes)/startup-studio/finance/page.tsx`

Layout:
- KPI cards: Total grants, Grant utilization %, Self-sustainability ratio, Budget variance
- Grant list table with status badges
- Budget vs Actual chart (grouped bar)
- Revenue by source (pie chart)
- Audit timeline

### Task 5.6: Create Grant Detail page
**File:** `app/(routes)/startup-studio/finance/grants/[id]/page.tsx`

Shows: Grant details, utilization progress bar, related budgets, UC status, reporting timeline

### Task 5.7: Create Governance page
**File:** `app/(routes)/startup-studio/governance/page.tsx`

Tabs:
- **Board & Committees:** Card grid showing each governance body with members
- **Compliance:** Checklist view with status badges, overdue highlighted, filter by category
- **Readiness:** Spider/radar chart of 5 pillars, assessment history, "New Assessment" form

### Task 5.8: Add sidebar entries
Under Startup Studio group:
```typescript
{ href: '/startup-studio/finance', label: 'Finance', icon: Wallet }
{ href: '/startup-studio/governance', label: 'Governance', icon: Scale }
```

### Task 5.9: Push migration to staging + verify

### Task 5.10: Commit Phase 5
```bash
git add -A && git commit -m "feat: Phase 5 Finance, Governance & Compliance"
```

---

## PHASE 6: Marketing & Outreach — FULL BUILD

**Spec section:** 3J (lines 1320-1368)
**Tables:** ss_marketing_activities
**Priority:** P3

### Task 6.1: Create migration
**File:** `supabase/migrations/20260326000006_ss_marketing.sql`

```sql
CREATE TABLE ss_marketing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'awareness_campaign', 'workshop', 'demo_day', 'media_coverage',
    'social_media', 'website_update', 'brochure', 'newsletter',
    'podcast', 'webinar', 'conference', 'stakeholder_visit', 'other'
  )),
  title TEXT NOT NULL,
  description TEXT,
  target_audience TEXT,
  date_start DATE,
  date_end DATE,
  budget NUMERIC(12,2),
  actual_cost NUMERIC(12,2),
  reach_count INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  applications_from_activity INTEGER DEFAULT 0,
  media_links TEXT[],
  photos TEXT[],
  roi_notes TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  conducted_by UUID REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Task 6.2: Create service
**File:** `lib/services/startup-studio/marketing-service.ts`

Methods: getActivities, createActivity, updateActivity, getMarketingDashboard (total reach, ROI, leads funnel)

### Task 6.3: Create hooks
**File:** `hooks/startup-studio/use-marketing.ts`

### Task 6.4: Create API routes
**Files:**
- `app/api/startup-studio/marketing/route.ts` (GET, POST)
- `app/api/startup-studio/marketing/[id]/route.ts` (GET, PATCH, DELETE)
- `app/api/startup-studio/marketing/dashboard/route.ts` (GET summary)

### Task 6.5: Create Marketing page
**File:** `app/(routes)/startup-studio/marketing/page.tsx`

Layout:
- KPI cards: Total activities, Total reach, Leads generated, Avg ROI
- Calendar view of activities
- Activity list with type badges and status
- "Add Activity" form

### Task 6.6: Add sidebar entry
```typescript
{ href: '/startup-studio/marketing', label: 'Marketing', icon: Megaphone }
```

### Task 6.7: Push migration + verify

### Task 6.8: Commit Phase 6
```bash
git add -A && git commit -m "feat: Phase 6 Marketing & Outreach"
```

---

## PHASE 7: Integration & Command Center (BONUS)

### Task 7.1: Create Incubation Command Center Dashboard
**File:** `app/(routes)/startup-studio/incubation/page.tsx`

This is the "Incubation Command Center" from spec section 7. Pulls data from ALL phases:
- Active startups count (NIF pipeline)
- Avg TRL (Phase 1)
- Mentor ratio (Phase 2)
- Grant utilization % (Phase 5)
- Readiness score (Phase 5)
- Graduation pipeline (Phase 3)
- KPI compliance (Phase 4)
- Marketing reach (Phase 6)

### Task 7.2: Add sidebar entry
```typescript
{ href: '/startup-studio/incubation', label: 'Incubation HQ', icon: LayoutGrid }
```

---

## File Inventory Per Phase

| Phase | Migration | Service | Hooks | API Routes | Pages | Components | Total |
|-------|-----------|---------|-------|------------|-------|------------|-------|
| 2 (verify) | 0 | 0 | 0 | 0 | 0 | 0 | 0 (verify only) |
| 3 (verify) | 0 | 0 | 0 | 0 | 0-1 | 0 | 0-1 |
| 4 (build) | 1 | 1 | 1 | 7 | 3 | 0 | 13 |
| 5 (build) | 1 | 3 | 3 | 13 | 3 | 0 | 23 |
| 6 (build) | 1 | 1 | 1 | 3 | 1 | 0 | 7 |
| 7 (build) | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| **Total** | **3** | **5** | **5** | **23** | **8-9** | **0** | **~45** |

## Agent Parallelization Strategy

| Wave | Agents | What |
|------|--------|------|
| Wave 1 | Agent 1: Verify Phase 2+3 (push migrations, test) | Verify existing work |
| Wave 2 (parallel) | Agent 2: Phase 4 migration+service+hooks, Agent 3: Phase 5 migration+service+hooks | Data layer for both |
| Wave 3 (parallel) | Agent 4: Phase 4 API+pages, Agent 5: Phase 5 API+pages, Agent 6: Phase 6 (full) | UI layer for all |
| Wave 4 | Agent 7: Phase 7 Command Center + sidebar + build verify | Integration |

## Dependency Graph

```
Phase 2 verify ─┐
Phase 3 verify ─┤
                ├─→ Phase 4 (KPI needs data from 1-3) ─┐
                ├─→ Phase 5 (Finance independent)      ─┤─→ Phase 7 (Command Center)
                └─→ Phase 6 (Marketing independent)    ─┘
```

Phases 4, 5, 6 can be built in parallel. Phase 7 requires all others.

---

*Plan generated: 2026-03-26*
*Spec source: specs/STARTUP-STUDIO-INCUBATION-ENHANCEMENT-SPEC.md*
