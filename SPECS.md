# MyJKKN Workshop Alignment Transformation - SPECS

## Vision

Transform MyJKKN from input-focused (attendance, fees) to outcome-focused (capabilities, employability) based on the Workshop Intelligence Report analysis and Fink's Taxonomy of Significant Learning.

---

## Phase 1.1: OKR Module Restrictions

**Goal**: Restrict OKR to Organization + Institution + Department levels only. Remove Individual/Learner-specific OKRs.

### Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| 1.1.1 | Soft-deprecate learner OKR tables (add deprecated_at, block inserts via RLS) | DONE |
| 1.1.2 | Keep 'individual' in enum for historical data, block new creation in UI | DONE |
| 1.1.3 | Mark OKRTierAllowed as tier_1 + tier_2 only (no tier_3) | DONE |
| 1.1.4 | Mark OKRLevelAllowed as organization + institution + department only | DONE |
| 1.1.5 | Learner OKR services/hooks marked @deprecated | DONE |
| 1.1.6 | Elective routes show deprecation notice + redirect | DONE |
| 1.1.7 | Sidebar menu has no learner/elective OKR items | DONE |
| 1.1.8 | OKR dashboard filters out individual-level objectives | DONE |
| 1.1.9 | Create page only shows active tiers/levels | DONE |
| 1.1.10 | All existing learner OKR data preserved (no deletes) | DONE |

### Database Changes

- Migration: `20260201000001_deprecate_learner_okr_tables.sql`
- Tables affected: `learner_core_okrs`, `learner_okr_assignments`, `learner_elective_okrs`
- Action: Added `deprecated_at` column, blocked inserts via RLS, added deprecation comments

---

## Phase 1.2: Competency Catalog Module (NEW)

**Goal**: Define taxonomy of skills and learning targets using Fink's Taxonomy of Significant Learning.

### Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| 1.2.1 | Create `competency_catalog` table with Fink's dimensions, AI resistance score | DONE |
| 1.2.2 | Create `competency_program_mapping` table | DONE |
| 1.2.3 | Create `course_competency_mapping` table | DONE |
| 1.2.4 | Create `learner_competencies` table | DONE |
| 1.2.5 | RLS policies on all 4 tables (authenticated CRUD) | DONE |
| 1.2.6 | Indexes on institution_id, type, active, learner_id, competency_id | DONE |
| 1.2.7 | Updated_at triggers on catalog + learner_competencies | DONE |
| 1.2.8 | TypeScript types: CompetencyCatalog, mappings, DTOs, filters | DONE |
| 1.2.9 | Service: competency-catalog-service.ts (CRUD, stats, bulk import) | DONE |
| 1.2.10 | Service: competency-mapping-service.ts (program + course mappings) | DONE |
| 1.2.11 | Service: learner-competency-service.ts (tracking, progress, gap analysis) | DONE |
| 1.2.12 | Hooks: use-competencies.ts (queries + mutations) | DONE |
| 1.2.13 | Hooks: use-competency-mappings.ts (program + course) | DONE |
| 1.2.14 | Hooks: use-learner-competencies.ts (tracking + progress) | DONE |
| 1.2.15 | List page: /competency-catalog with filters, summary cards, data table | DONE |
| 1.2.16 | Create page: /competency-catalog/new with full form (Fink's, proficiency levels) | DONE |
| 1.2.17 | Detail page: /competency-catalog/[id] with tabs (overview, levels, mappings) | DONE |
| 1.2.18 | Edit page: /competency-catalog/[id]/edit pre-filled form | DONE |
| 1.2.19 | Components: competency-form, competency-table, finks-radar-chart, finks-dimension-input, proficiency-level-builder | DONE |
| 1.2.20 | Sidebar: "Competency & Outcomes" group before OKR | DONE |
| 1.2.21 | Permissions: competency.catalog.view/create/edit/delete | DONE |
| 1.2.22 | Build passes with zero TypeScript errors | PENDING |
| 1.2.23 | Browser test: CRUD workflow verified | PENDING |

### Database Tables

| Table | Columns | Purpose |
|-------|---------|---------|
| `competency_catalog` | id, institution_id, code, name, type, description, proficiency_levels (JSONB), evidence_requirements (JSONB), industry_tags (TEXT[]), finks_dimensions (JSONB), ai_resistance_score (0-100), is_active | Master competency definitions |
| `competency_program_mapping` | id, competency_id, program_id, required_level, weight_percentage, semester_expected, is_mandatory | Program requirements |
| `course_competency_mapping` | id, course_id, competency_id, contribution_level, learning_hours, finks_assessment_methods (JSONB) | Course-competency links |
| `learner_competencies` | id, learner_id, competency_id, current_level, evidence (JSONB), assessments (JSONB), verified_by, verified_at | Individual tracking |

### Competency Types

- `technical` - Programming, engineering, lab skills
- `behavioral` - Communication, teamwork, leadership
- `domain` - Subject-specific knowledge
- `soft_skill` - Emotional intelligence, adaptability
- `metacognitive` - Learning strategies, self-regulation

### Fink's Taxonomy Dimensions (scored 0-10 each)

1. **Foundational Knowledge** - Facts, principles, relationships
2. **Application** - Skills, thinking (critical, creative, practical), managing projects
3. **Integration** - Connecting ideas, people, realms of life
4. **Human Dimension** - Learning about oneself and others
5. **Caring** - Developing new feelings, interests, values
6. **Learning to Learn** - Becoming a better learner, self-directed

### Proficiency Levels

1. **Novice** - Basic awareness
2. **Beginner** - Can perform with guidance
3. **Intermediate** - Can perform independently
4. **Advanced** - Can teach others
5. **Expert** - Industry-recognized mastery

---

## Phase 1.5: Existing Module Modifications

### 1.5.1 Course Enhancements

| ID | Requirement | Status |
|----|-------------|--------|
| 1.5.1.1 | Add learning_hours_target, self_study_hours, practical_hours, theory_hours to courses | PENDING |
| 1.5.1.2 | Add competency_coverage JSONB to courses | PENDING |
| 1.5.1.3 | Update Course TypeScript interface | PENDING |
| 1.5.1.4 | Update course form with new fields | PENDING |

### 1.5.2 Learner Profile - Capabilities

| ID | Requirement | Status |
|----|-------------|--------|
| 1.5.2.1 | Add capabilities, career_aspirations (JSONB), industry_readiness_score, portfolio_url to learners_profiles | PENDING |
| 1.5.2.2 | Update learner profile TypeScript types | PENDING |
| 1.5.2.3 | Add capability tab to learner profile UI | PENDING |

### 1.5.3 Staff - Facilitator Role

| ID | Requirement | Status |
|----|-------------|--------|
| 1.5.3.1 | Add role_type, facilitator_certification (JSONB), outcome_metrics (JSONB) to staff | PENDING |
| 1.5.3.2 | Update staff TypeScript types | PENDING |
| 1.5.3.3 | Add facilitator metrics to staff profile UI | PENDING |

### 1.5.4 Attendance - Learning Engagement

| ID | Requirement | Status |
|----|-------------|--------|
| 1.5.4.1 | Enhance attendance_data JSONB with engagement_score, learning_behaviors, notes | PENDING |
| 1.5.4.2 | Engagement score REQUIRED for practical/lab periods, optional for lectures | PENDING |
| 1.5.4.3 | Update attendance marking UI | PENDING |

### 1.5.5 Billing - Outcome-Linked Discounts

| ID | Requirement | Status |
|----|-------------|--------|
| 1.5.5.1 | Add is_outcome_based, outcome_criteria (JSONB), outcome_verification (JSONB) to billing_discounts | PENDING |
| 1.5.5.2 | Add outcome-based option to discount form | PENDING |

---

## Phase 2: Industry Integration Module (NEW)

| ID | Requirement | Status |
|----|-------------|--------|
| 2.1 | Create industry_partners table | PENDING |
| 2.2 | Create industry_mentors table | PENDING |
| 2.3 | Create industry_projects table | PENDING |
| 2.4 | Create learner_industry_engagements table | PENDING |
| 2.5 | Types, services, hooks for all industry entities | PENDING |
| 2.6 | UI: Partner management (CRUD) | PENDING |
| 2.7 | UI: Mentor management (CRUD) | PENDING |
| 2.8 | UI: Project management with competency links | PENDING |
| 2.9 | UI: Learner engagement tracking | PENDING |
| 2.10 | Sidebar: "Industry Connect" group | PENDING |

---

## Phase 3: Personalization

### 3.1 Learning Path Module (NEW)

| ID | Requirement | Status |
|----|-------------|--------|
| 3.1.1 | Create learning_paths table | PENDING |
| 3.1.2 | Create learning_path_steps table | PENDING |
| 3.1.3 | Types, services, hooks | PENDING |
| 3.1.4 | UI: Path builder, step tracking, progress visualization | PENDING |

### 3.2 Parent Portal Module (NEW)

| ID | Requirement | Status |
|----|-------------|--------|
| 3.2.1 | Create parent_portal_access table | PENDING |
| 3.2.2 | Create parent_communications table | PENDING |
| 3.2.3 | Types, services, hooks | PENDING |
| 3.2.4 | UI: Parent dashboard, communication history | PENDING |

---

## Phase 4: Accountability

### 4.1 Alumni Outcomes Module (NEW)

| ID | Requirement | Status |
|----|-------------|--------|
| 4.1.1 | Create alumni_outcomes table | PENDING |
| 4.1.2 | Create outcome_program_correlation table | PENDING |
| 4.1.3 | Types, services, hooks | PENDING |
| 4.1.4 | UI: Outcome tracking, program correlation dashboard | PENDING |

### 4.2 Facilitator Development Module (NEW)

| ID | Requirement | Status |
|----|-------------|--------|
| 4.2.1 | Create facilitator_development table | PENDING |
| 4.2.2 | Create facilitator_industry_immersion table | PENDING |
| 4.2.3 | Types, services, hooks | PENDING |
| 4.2.4 | UI: Development stages, immersion tracking | PENDING |

---

## Phase 5: AI-Solution Graduation Gate + Compliance Dashboard

**Goal**: Every JKKN graduate from June 2026 must have **built a solution using AI** before degree conferment. Activate the existing Solutions Hub ecosystem — no new system needed.

**Terminology**: Use "Solution" everywhere, never "Project." The word "Solution" triggers the Flywheel mindset. The word "Project" triggers academic compliance mindset.

**Team Model**: Students work in teams of 4-5 (roles: lead, contributor). 609 students = ~120-150 solutions needed.

**University Alignment**: Students already do a university-required final year project. JKKN says: "Do that same work using AI (Lovable), tracked in Solutions Hub." Zero additional burden.

### What Already Exists

| Component | Table/Module | Data |
|-----------|-------------|------|
| Builder profiles | `sh_builders` (learner_id FK) | 18 registered |
| Solution tracking | `sh_solutions` | 8 solutions |
| Team assignments | `sh_builder_assignments` (roles: lead/contributor) | 3 assignments |
| Phase deliverables | `sh_solution_phases` | Hours, requirements docs |
| Deployment tracking | `sh_phase_deployments` | Vercel/Supabase URLs |
| Version history | `sh_prototype_iterations` | Client approval tracking |
| Full Solutions Hub UI | `/solutions/*` routes | CRUD for all entities |
| Builder Portal | `/talent/builder/*` | Self-service for builders |

### 5.1 Graduation Gate Field

| ID | Requirement | Status |
|----|-------------|--------|
| 5.1.1 | Add `ai_solution_cleared` BOOLEAN to `learners_profiles` (default false) | PENDING |
| 5.1.2 | Add `ai_solution_cleared_at` TIMESTAMPTZ to `learners_profiles` | PENDING |
| 5.1.3 | Add `ai_solution_cleared_by` UUID to `learners_profiles` | PENDING |
| 5.1.4 | Create `check_ai_solution_clearance(learner_id)` database function | PENDING |
| 5.1.5 | Create trigger on `sh_builder_assignments` — auto-check clearance when status → completed | PENDING |

#### Database Migration

```sql
-- Add graduation gate fields
ALTER TABLE learners_profiles
  ADD COLUMN ai_solution_cleared BOOLEAN DEFAULT false,
  ADD COLUMN ai_solution_cleared_at TIMESTAMPTZ,
  ADD COLUMN ai_solution_cleared_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN learners_profiles.ai_solution_cleared IS
  'Whether learner completed an AI-collaboration solution via Solutions Hub. Required for June 2026+ graduation.';
```

#### Clearance Check Function

```sql
CREATE OR REPLACE FUNCTION check_ai_solution_clearance(p_learner_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_cleared BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM sh_builders b
    JOIN sh_builder_assignments ba ON ba.builder_id = b.id
    WHERE b.learner_id = p_learner_id
      AND ba.status = 'completed'
      AND ba.rating IS NOT NULL
  ) INTO v_cleared;

  UPDATE learners_profiles
  SET ai_solution_cleared = v_cleared,
      ai_solution_cleared_at = CASE WHEN v_cleared THEN NOW() ELSE NULL END
  WHERE id = p_learner_id;

  RETURN v_cleared;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Auto-Trigger

```sql
CREATE OR REPLACE FUNCTION trigger_check_ai_clearance()
RETURNS TRIGGER AS $$
DECLARE v_learner_id UUID;
BEGIN
  SELECT b.learner_id INTO v_learner_id
  FROM sh_builders b WHERE b.id = NEW.builder_id;

  IF v_learner_id IS NOT NULL THEN
    PERFORM check_ai_solution_clearance(v_learner_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_builder_assignment_clearance
  AFTER UPDATE OF status ON sh_builder_assignments
  FOR EACH ROW WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trigger_check_ai_clearance();
```

---

### 5.2 Compliance Dashboard

| ID | Requirement | Status |
|----|-------------|--------|
| 5.2.1 | TypeScript types: `types/compliance.ts` | PENDING |
| 5.2.2 | Service: `lib/services/solutions/compliance-service.ts` | PENDING |
| 5.2.3 | React Query hook: `hooks/solutions/use-compliance-dashboard.ts` | PENDING |
| 5.2.4 | Page: `/solutions/compliance/page.tsx` with 4 tabs | PENDING |
| 5.2.5 | Component: Overview tab — stats cards + progress ring | PENDING |
| 5.2.6 | Component: Department breakdown tab — department-level table | PENDING |
| 5.2.7 | Component: Individual learners tab — searchable/filterable table | PENDING |
| 5.2.8 | Component: Solutions tab — solutions with team composition | PENDING |
| 5.2.9 | Sidebar: Add "Compliance" under Solutions Hub (icon: ShieldCheck) | PENDING |
| 5.2.10 | Permissions: `solutions.compliance.view`, `solutions.compliance.manage` | PENDING |
| 5.2.11 | Build passes with zero TypeScript errors | PENDING |
| 5.2.12 | Browser test: All 4 tabs verified with real data | PENDING |

#### File Structure

```
app/(routes)/solutions/compliance/
├── page.tsx                          # Main compliance dashboard
├── _components/
│   ├── compliance-overview.tsx       # Tab 1: Stats + progress ring
│   ├── department-breakdown.tsx      # Tab 2: Department table
│   ├── learner-compliance-table.tsx  # Tab 3: Individual learners
│   └── solution-teams-view.tsx       # Tab 4: Solutions with teams

lib/services/solutions/
├── compliance-service.ts             # Data fetching

hooks/solutions/
├── use-compliance-dashboard.ts       # React Query hook

types/
├── compliance.ts                     # TypeScript types
```

#### Tab 1: Overview

| Card | Value | Source |
|------|-------|--------|
| Total Graduating Learners | Count of active learners | `learners_profiles` |
| Cleared | Count where `ai_solution_cleared = true` | `learners_profiles` |
| In Progress | Registered as builder, assignment not completed | `sh_builders` + `sh_builder_assignments` |
| Not Started | Not registered as builder | No `sh_builders` record |
| Clearance Rate | Cleared / Total * 100 | Calculated |
| Progress Ring | Visual clearance rate | Animated component |

#### Tab 2: Department Breakdown

| Column | Source |
|--------|--------|
| Department Name | `departments` |
| Total Learners | Count per department |
| Cleared | `ai_solution_cleared = true` per department |
| In Progress | Builder registered, not completed |
| Not Started | No builder record |
| Clearance Rate % | Calculated |

Sortable by any column. Click row to expand individual learners.

#### Tab 3: Individual Learners

| Column | Source |
|--------|--------|
| Name | `learners_profiles.first_name + last_name` |
| Roll Number | `learners_profiles.roll_number` |
| Department | `departments.department_name` |
| Builder Status | Derived: Not Registered / Registered / Assigned / Completed / Cleared |
| Solution | `sh_solutions.title` via assignment chain |
| Team Role | `sh_builder_assignments.role` (lead / contributor) |
| Rating | `sh_builder_assignments.rating` |
| Cleared | `ai_solution_cleared` badge (green/red) |

Filters: Institution, Department, Status (All / Cleared / In Progress / Not Started)
Search: By name or roll number

#### Tab 4: Solutions

| Column | Source |
|--------|--------|
| Solution Title | `sh_solutions.title` |
| Solution Code | `sh_solutions.solution_code` |
| Type | `sh_solutions.solution_type` |
| Status | `sh_solutions.status` |
| Team Members | Count from `sh_builder_assignments` |
| Graduating Builders | Count where builder has `learner_id` with active status |
| Deployment URL | `sh_phase_deployments.deployment_url` |

#### Clearance Status Badge Colors

| Status | Color | Meaning |
|--------|-------|---------|
| Cleared | Green | `ai_solution_cleared = true` |
| Completed | Blue | Assignment done, clearance pending auto-update |
| In Progress | Amber | Builder assigned, working on solution |
| Registered | Gray | Builder registered, no assignment yet |
| Not Started | Red | Not registered as builder |

#### TypeScript Types

```typescript
export type ClearanceStatus = 'cleared' | 'completed' | 'in_progress' | 'registered' | 'not_started';

export interface ComplianceOverview {
  totalLearners: number;
  cleared: number;
  inProgress: number;
  notStarted: number;
  clearanceRate: number;
}

export interface DepartmentCompliance {
  departmentId: string;
  departmentName: string;
  institutionId: string;
  totalLearners: number;
  cleared: number;
  inProgress: number;
  notStarted: number;
  clearanceRate: number;
}

export interface LearnerCompliance {
  learnerId: string;
  firstName: string;
  lastName: string;
  rollNumber: string | null;
  registerNumber: string | null;
  institutionId: string;
  departmentId: string | null;
  aiSolutionCleared: boolean;
  aiSolutionClearedAt: string | null;
  builderId: string | null;
  builderCode: string | null;
  assignmentStatus: string | null;
  assignmentRole: string | null;
  assignmentRating: number | null;
  solutionTitle: string | null;
  solutionCode: string | null;
  clearanceStatus: ClearanceStatus;
}

export interface SolutionTeam {
  solutionId: string;
  solutionTitle: string;
  solutionCode: string;
  solutionType: string;
  solutionStatus: string;
  deploymentUrl: string | null;
  teamMembers: Array<{
    builderId: string;
    builderName: string;
    role: string;
    isGraduating: boolean;
    clearanceStatus: ClearanceStatus;
  }>;
}

export interface ComplianceDashboardData {
  overview: ComplianceOverview;
  departments: DepartmentCompliance[];
  learners: LearnerCompliance[];
  solutions: SolutionTeam[];
}

export interface ComplianceFilters {
  institutionId?: string;
  departmentId?: string;
  clearanceStatus?: ClearanceStatus | 'all';
  searchQuery?: string;
}
```

#### Service Pattern

Follow `FacilitatorImpactService` pattern:

```typescript
export class ComplianceService {
  static async getOverview(filters): Promise<ComplianceOverview>
  static async getDepartmentBreakdown(filters): Promise<DepartmentCompliance[]>
  static async getLearnerCompliance(filters): Promise<LearnerCompliance[]>
  static async getSolutionTeams(filters): Promise<SolutionTeam[]>
  static async toggleClearance(learnerId, cleared, clearedBy): Promise<void>
}
```

#### Core Query

```sql
SELECT
  lp.id AS learner_id, lp.first_name, lp.last_name,
  lp.roll_number, lp.institution_id, lp.department_id,
  lp.ai_solution_cleared, lp.ai_solution_cleared_at,
  b.id AS builder_id, b.builder_code,
  ba.status AS assignment_status, ba.role AS assignment_role, ba.rating,
  s.title AS solution_title, s.solution_code, s.status AS solution_status,
  CASE
    WHEN lp.ai_solution_cleared = true THEN 'cleared'
    WHEN ba.status = 'completed' THEN 'completed'
    WHEN ba.id IS NOT NULL THEN 'in_progress'
    WHEN b.id IS NOT NULL THEN 'registered'
    ELSE 'not_started'
  END AS clearance_status
FROM learners_profiles lp
LEFT JOIN sh_builders b ON b.learner_id = lp.id
LEFT JOIN sh_builder_assignments ba ON ba.builder_id = b.id
LEFT JOIN sh_solution_phases sp ON sp.id = ba.phase_id
LEFT JOIN sh_solutions s ON s.id = sp.solution_id
WHERE lp.lifecycle_status = 'active';
```

---

### 5.3 Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | Database migration (fields + function + trigger) | `supabase/migrations/` |
| 2 | TypeScript types | `types/compliance.ts` |
| 3 | Service layer | `lib/services/solutions/compliance-service.ts` |
| 4 | React Query hook | `hooks/solutions/use-compliance-dashboard.ts` |
| 5 | Page + 4 tab components | `app/(routes)/solutions/compliance/` |
| 6 | Sidebar link | `lib/sidebarMenuLink.ts` |
| 7 | Browser test all tabs | Production verification |

### Out of Scope

- Blocking degree conferment in the system (policy, not platform)
- Student-facing "My Clearance Status" view (future)
- Email notifications to non-compliant students (future)
- Faculty training materials (communication, not code)

---

## User Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| OKR Levels | Keep Org + Institution + Department (remove Individual/Learner) | Learner outcomes tracked via Competency module instead |
| Learner OKR Data | Soft deprecate (keep data, block new entries) | Historical reference preserved, no data loss |
| Scope | Full transformation (All 4 phases) | Complete outcome-focused transformation |
| Attendance Quality | Mandatory for practicals, optional for lectures | Practical engagement directly maps to Fink's Application dimension |
| Competency Taxonomy | Fink's Taxonomy of Significant Learning | Research-backed, holistic, covers AI-proof skills |
| AI Resistance Score | 0-100 scale per competency | Future-proofing curriculum against AI automation |

---

*Created: 2026-02-06*
*Source Plan: Workshop Alignment Transformation Plan*
*Total Scope: 6 new modules + 5 module modifications + 1 OKR restriction*
