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
