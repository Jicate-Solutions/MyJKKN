# Solutions Hub -- Complete Specification

> **Status:** Active
> **Created:** 2026-02-03 (consolidated 2026-02-12)
> **Sources:** Solutions Hub Merger Spec, MyJKKN Enhancement Spec, Products & TRL Spec, FST-Team Analysis
> **Scope:** Everything needed to build, operate, and evolve the Solutions Hub within MyJKKN

---

## Table of Contents

1. [Strategic Context](#1-strategic-context)
2. [Architecture Overview](#2-architecture-overview)
3. [Role & Permission Model](#3-role--permission-model)
4. [Database Schema](#4-database-schema)
5. [Service Layer](#5-service-layer)
6. [React Hooks](#6-react-hooks)
7. [Pages & Routes](#7-pages--routes)
8. [Components](#8-components)
9. [Workflows](#9-workflows)
10. [Business Rules](#10-business-rules)
11. [MyJKKN Enhancement Integration](#11-myjkkn-enhancement-integration)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [Future Enhancements](#13-future-enhancements)
14. [File Inventory](#14-file-inventory)

---

## 1. Strategic Context

### 1.1 What This Is

The Solutions Hub is JKKN's consulting, training, and content production platform -- merged into MyJKKN as integrated modules. It tracks three types of client solutions (software, training, content), the talent that delivers them, the revenue they generate, and the intellectual property that emerges from them.

### 1.2 Why It Was Merged

| Factor | Separate (Before) | Merged (Now) |
|--------|-------------------|--------------|
| Data duplication | `departments` table duplicated | Single source of truth |
| User sync | Manual webhook needed | Shared `users` table |
| Revenue reporting | ETL across projects | Direct joins |
| Staff/builder data | Duplicated | Shared entities |
| Maintenance | 2 codebases | 1 codebase |
| Client portal | Works | Works (RLS-protected) |

**What stays separate:** jkkn-recruit -- external applicants uploading files = security boundary.

### 1.3 The Service Trap (FST Analysis)

The FST-Team adversarial analysis (2026-02-10) identified a critical structural flaw in JICATE's business model: the **Service Trap**. Every client solution delivers IP to the client, meaning revenue never compounds and JICATE never builds assets.

The recommended fix: a **licensing pivot** -- change one contract clause so clients receive a perpetual license while JICATE retains IP ownership. This drove the creation of the Products & TRL module.

| Finding | Impact on Design |
|---------|-----------------|
| JKKN has 2 of 9 RDIF prerequisites | RDIF scorecard shows current state honestly |
| "Entirely" recalibrating toward RDIF is catastrophically wrong | Products are a parallel track, not a pivot |
| Licensing pivot is minimum viable change | `retained_ip` flag on solutions links client work to product development |
| Health-tech is the target product domain | Domain classification prioritizes health-tech variants |
| TRL 4+ is the critical RDIF gate | TRL progress component highlights TRL 4 threshold |
| Three-year bridge plan with year-end gates | RDIF service implements bridge status with go/no-go logic |

### 1.4 Two Distinct Entity Types

| Attribute | SHSolution (Client Delivery) | SHProduct (JKKN-Owned IP) |
|-----------|-------------------------------|--------------------------|
| **Owner** | Client (fee-for-service) | JKKN/JICATE (retained IP) |
| **Revenue** | One-time deal value | Licensing, RDIF grants, recurring |
| **IP** | Goes to client | Retained by JICATE |
| **Lifecycle** | Prospecting -> Live -> AMC | Concept -> TRL 1-9 -> Deployed |
| **Table** | `sh_solutions` | `sh_products` |
| **Link** | `originating_solution_ids[]` on product references the solutions it came from |

---

## 2. Architecture Overview

### 2.1 Current State Inventory

| Category | Count | Notes |
|----------|-------|-------|
| Database tables | 45+ (Solutions Hub) + 3 (Products/TRL) | All prefixed with `sh_` |
| Migrations | 19+ | ~1,500+ lines SQL |
| RLS policies | 20+ | Role-based access |
| Enums | 20+ | Custom types |
| Functions | 10+ | Triggers, helpers |
| Routes/Pages | 70+ | Admin + 4 portals |
| Components | 114+ | Domain-organized |
| Services | 35+ | Data layer |
| Hooks | 30+ | Query integration |
| Types | 4+ files | 50+ interfaces |

### 2.2 Shared Entities (Use MyJKKN)

| Entity | Solutions Hub | MyJKKN Equivalent | Action |
|--------|--------------|-------------------|--------|
| departments | `departments` table | `departments` table | USE MyJKKN |
| users | `users` table | `users` table | USE MyJKKN |
| institutions | Hardcoded | `institutions` table | USE MyJKKN |

### 2.3 File Structure

```
app/(routes)/
  solutions/                    # Admin views
    page.tsx                    # Solutions dashboard
    new/page.tsx                # Create solution
    [id]/page.tsx               # Solution detail
    software/                   # Software module
    training/                   # Training module
    content/                    # Content module
    products/                   # Products & TRL module
      page.tsx                  # Products list
      new/page.tsx              # Create product
      [id]/page.tsx             # Product detail with 5 tabs
      rdif/                     # RDIF readiness dashboard (planned)
    discovery/page.tsx          # Site visits
    payments/page.tsx           # Payments
    earnings/page.tsx           # Earnings ledger
    publications/page.tsx       # Publications
    clients/page.tsx            # Client management

  portal/client/                # Client portal
    page.tsx                    # Dashboard
    projects/page.tsx           # Their solutions
    deliverables/page.tsx       # Their content
    invoices/page.tsx           # Their invoices

  talent/                       # Talent portals
    builder/                    # Builder portal
    cohort/                     # Cohort member portal
    production/                 # Production learner portal

lib/services/solutions/         # Service layer
  solutions-service.ts
  phases-service.ts
  clients-service.ts
  builders-service.ts
  training-service.ts
  content-service.ts
  payments-service.ts
  earnings-service.ts
  discovery-service.ts
  publications-service.ts
  products-service.ts           # Products & TRL
  rdif-service.ts               # RDIF readiness
  index.ts

hooks/solutions/                # React Query hooks
  use-solutions.ts
  use-phases.ts
  use-clients.ts
  use-builders.ts
  use-builder-portal.ts
  use-training.ts
  use-cohort-portal.ts
  use-content.ts
  use-production-portal.ts
  use-payments.ts
  use-earnings.ts
  use-products.ts               # Products & TRL hooks
  index.ts

types/
  solutions.ts                  # Solutions Hub types
  products.ts                   # Products & TRL types

app/(routes)/solutions/_components/
  trl-badge.tsx                 # TRL level badge
  trl-progress.tsx              # TRL 1-9 progress visualization
  rdif-scorecard.tsx            # RDIF circular progress + checklist
  solutions-dashboard.tsx       # Dashboard with Products & TRL card
```

---

## 3. Role & Permission Model

### 3.1 Role Mapping

| Solutions Hub Role | MyJKKN Equivalent | Access |
|--------------------|-------------------|--------|
| md_caio | `super_admin` | Full admin |
| department_head | `hod` | Department scope |
| department_staff | `staff` | Department scope |
| builder | `builder` (NEW) | Builder portal |
| cohort_member | `cohort_member` (NEW) | Cohort portal |
| production_learner | `production_learner` (NEW) | Production portal |
| jicate_staff | `jicate_staff` (NEW) | JICATE admin |
| client | `client` (NEW) | Client portal |

### 3.2 Permission Matrix (Solutions Hub Scope)

| Action | Builder | Cohort | Production | Client | Staff | HOD | Admin |
|--------|---------|--------|------------|--------|-------|-----|-------|
| View own assignments | Y | Y | Y | -- | -- | -- | Y |
| View own earnings | Y | Y | Y | -- | -- | -- | Y |
| View own solutions | -- | -- | -- | Y | -- | -- | Y |
| View department solutions | -- | -- | -- | -- | Y | Y | Y |
| View all solutions | -- | -- | -- | -- | -- | -- | Y |
| Create solutions | -- | -- | -- | -- | -- | Y | Y |
| Manage builders | -- | -- | -- | -- | -- | Y | Y |
| Manage payments | -- | -- | -- | -- | -- | -- | Y |
| Manage products | -- | -- | -- | -- | -- | -- | Y |
| Update RDIF prerequisites | -- | -- | -- | -- | -- | -- | Y |

### 3.3 RLS Helper Functions

| Function | Purpose |
|----------|---------|
| `sh_is_admin()` | User is super_admin, admin, or jicate_staff |
| `sh_is_hod()` | User is hod |
| `sh_is_staff()` | User is staff |
| `sh_is_builder()` | User has active builder record |
| `sh_is_cohort_member()` | User has active cohort member record |
| `sh_is_production_learner()` | User has active production learner record |
| `sh_is_client()` | User has client role |
| `sh_client_id()` | Returns client ID linked to current user's email |
| `sh_user_department_id()` | Returns user's department ID |
| `sh_has_management_access()` | Admin or management level |

---

## 4. Database Schema

### 4.1 Enum Types

```sql
CREATE TYPE solution_type AS ENUM ('software', 'training', 'content');
CREATE TYPE solution_status AS ENUM ('active', 'on_hold', 'completed', 'cancelled', 'in_amc');
CREATE TYPE phase_status AS ENUM (
  'prospecting', 'discovery', 'prd_writing', 'prototype_building',
  'client_demo', 'revisions', 'approved', 'deploying', 'training',
  'live', 'in_amc', 'completed', 'on_hold', 'cancelled'
);
CREATE TYPE source_type AS ENUM ('placement', 'alumni', 'clinical', 'referral', 'direct', 'yi', 'intent');
CREATE TYPE partner_status AS ENUM ('standard', 'yi', 'alumni', 'mou', 'referral');
CREATE TYPE payment_type AS ENUM ('advance', 'milestone', 'completion', 'amc', 'mou_signing', 'deployment', 'acceptance');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
CREATE TYPE recipient_type AS ENUM ('builder', 'cohort_member', 'production_learner', 'department', 'jicate', 'institution', 'council', 'infrastructure', 'referral_bonus');
```

### 4.2 Table Inventory

All tables use `sh_` prefix to avoid name collisions with existing MyJKKN tables.

#### Clients Module

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_clients` | External companies | name, contact_person, contact_email, source_type, partner_status |
| `sh_client_referrals` | Department referral bonuses | client_id, referring_dept_id, executing_dept_id, bonus_percentage |

#### Solutions Module

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_solutions` | Work tracking | solution_code (JKKN-SOL-YYYY-NNN), solution_type, client_id, lead_department_id, status, retained_ip, ip_retention_notes |
| `sh_solution_phases` | Phase breakdown | solution_id, phase_number, status, owner_department_id, estimated_value |
| `sh_solution_mous` | MOU agreements | solution_id, deal_value, amc_value, payment_terms (JSONB) |

#### Builders Module (Software Talent)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_builders` | Software talent pool | user_id, department_id, specialization |
| `sh_builder_skills` | Skill inventory | builder_id, skill_name, proficiency_level (1-5) |
| `sh_builder_assignments` | Phase assignments | phase_id, builder_id, role (lead/contributor), status |
| `sh_prototype_iterations` | Prototype versions | phase_id, version, prototype_url, client_approved |
| `sh_bug_reports` | Bug tracking | iteration_id, severity, status, resolution_notes |
| `sh_phase_deployments` | Deployment records | phase_id, environment, vercel_url, supabase_project_id |
| `sh_implementation_users` | End-user tracking | phase_id, user_name, trained_date, usage_status |

#### Training Module

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_training_programs` | Training programs | solution_id, program_type, track, participant_count |
| `sh_training_sessions` | Individual sessions | program_id, session_number, session_date, attendance_count |
| `sh_cohort_members` | Training talent | user_id, level (observer/co_lead/lead/master), sessions counts |
| `sh_cohort_assignments` | Session assignments | session_id, cohort_member_id, role, earnings, rating |

#### Content Module

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_content_orders` | Content orders | solution_id, order_type, division, quantity, revision_rounds |
| `sh_content_deliverables` | Individual deliverables | order_id, file_url, status, revision_count |
| `sh_production_learners` | Content talent | user_id, division, skill_level, orders_completed |
| `sh_production_assignments` | Deliverable assignments | deliverable_id, learner_id, role, quality_rating |

#### Products & TRL Module

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_products` | JKKN-owned products | product_code (JKKN-PRD-YYYY-XXX), title, current_trl (1-9), target_trl, domain, sector, patent_status, status, originating_solution_ids[] |
| `sh_product_validations` | TRL evidence | product_id, trl_level, validation_type, evidence_description, is_external, status |
| `sh_rdif_prerequisites` | 9 organizational prerequisites | prerequisite_key (UNIQUE), label, is_met, evidence, target_date |

**Product Domain Values:** health_tech, edu_tech, pharma_tech, dental_tech, nursing_tech, construction_tech, other

**RDIF Sector Values:** health_technologies, digital_economy, energy, agriculture, defence, space, telecom

**Patent Status Values:** none, provisional_filed, full_filed, granted, rejected

**Product Status Values:** concept, prototype, lab_validated, field_validated, market_ready, deployed, archived

#### Discovery & Communications

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_discovery_visits` | Client site visits | client_id, visit_date, observations, pain_points, opportunities |
| `sh_client_communications` | Communication log | client_id, communication_type, direction, content |

#### Financials

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_revenue_split_models` | Revenue split configs | solution_type, split_config (JSONB), is_default |
| `sh_payments` | Payment tracking | solution_id, amount, payment_type, status |
| `sh_earnings_ledger` | Earnings distribution | payment_id, recipient_type, recipient_id, amount, percentage |

#### Publications & Accreditation

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_publications` | Academic output | paper_type, journal_type (scopus/wos/ugc), nirf_category, naac_criterion |
| `sh_publication_contributors` | Author credits | publication_id, builder_id/cohort_member_id/learner_id |
| `sh_accreditation_metrics` | NIRF/NAAC scoring | metric_type, metric_code, max_score |

#### System

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sh_jicate_sessions` | Facilitation sessions | solution_id, session_date, jicate_facilitator, outcome |
| `sh_notifications` | User notifications | user_id, notification_type, is_read |
| `sh_audit_logs` | Audit trail | user_id, action, entity_type, entity_id, details (JSONB) |

### 4.3 RDIF Prerequisites (Seeded Data)

| # | Key | Label | Currently Met? | Evidence |
|---|-----|-------|----------------|----------|
| 1 | `registered_company` | Registered Company | YES | JICATE Solutions registered under Companies Act |
| 2 | `indian_control` | Indian Citizen Control (51%+) | YES | Same management as JKKN Institutions |
| 3 | `trl_4_plus` | Technology at TRL 4+ | NO | No products at TRL 4+ |
| 4 | `ip_portfolio` | IP Portfolio | NO | No patents filed |
| 5 | `co_investment` | Capital for 50% Co-investment | NO | No earmarked R&D capital |
| 6 | `rd_track_record` | R&D Track Record | NO | Zero publications |
| 7 | `slfm_relationships` | SLFM/VC Relationships | NO | No SLFM relationships |
| 8 | `dsir_recognition` | DSIR-SIRO Recognition | NO | No DSIR recognition |
| 9 | `research_output` | Research Publications | NO | Unknown count |

**Current Score: 2 of 9 (22%)**

### 4.4 Auto-Generated Codes

| Entity | Format | Example | Generation |
|--------|--------|---------|------------|
| Solutions | `JKKN-SOL-YYYY-NNN` | JKKN-SOL-2026-001 | Database trigger on INSERT |
| Products | `JKKN-PRD-YYYY-XXX` | JKKN-PRD-2026-001 | Service layer on create |

---

## 5. Service Layer

### 5.1 Solutions Services

All services extend `BaseService` and follow MyJKKN patterns.

| Service | File | Responsibility |
|---------|------|----------------|
| SolutionsService | `solutions-service.ts` | CRUD for solutions, phases, MOUs |
| ClientsService | `clients-service.ts` | Client management, referrals |
| BuildersService | `builders-service.ts` | Builder talent pool, skills, assignments |
| TrainingService | `training-service.ts` | Programs, sessions, cohort management |
| ContentService | `content-service.ts` | Orders, deliverables, production learners |
| PaymentsService | `payments-service.ts` | Payment tracking, processing |
| EarningsService | `earnings-service.ts` | Earnings ledger, revenue splits |
| DiscoveryService | `discovery-service.ts` | Client visits, communications |
| PublicationsService | `publications-service.ts` | Papers, accreditation metrics |

### 5.2 Products & TRL Services

#### ProductsService (`products-service.ts`)

| Method | Purpose |
|--------|---------|
| `getProducts(filters?)` | List products with filters, pagination, department join |
| `getProductById(id)` | Single product with validations and department |
| `createProduct(input)` | Create with auto-generated `JKKN-PRD-YYYY-XXX` code |
| `updateProduct(id, input)` | Update product fields |
| `deleteProduct(id)` | Hard delete |
| `archiveProduct(id)` | Soft delete (status = archived) |
| `updateTRL(productId, newTRL, assessedBy?)` | Update TRL level with timestamp |
| `getTRLHistory(productId)` | All validations ordered by TRL level |
| `getValidations(productId)` | Validations for a product |
| `addValidation(input)` | Add validation evidence |
| `getPrerequisites()` | All 9 RDIF prerequisites |
| `updatePrerequisite(key, input)` | Update single prerequisite |
| `getRDIFReadinessScore()` | Score + prerequisites breakdown |
| `getProductStats()` | Aggregate stats: total, byStatus, byDomain, averageTRL |
| `getRetainedIPSolutions()` | Products with originating_solution_ids |

#### RDIFService (`rdif-service.ts`)

| Method | Purpose |
|--------|---------|
| `calculateRDIFScore()` | Full breakdown: score, percentage, met/unmet lists |
| `getThreeYearBridgeStatus()` | Current year (1/2/3), next milestones, eligibility |
| `getNextMilestones()` | Unmet prerequisites sorted by priority |

### 5.3 Portal Services

| Service | File | Responsibility |
|---------|------|----------------|
| BuilderPortalService | `builder-portal-service.ts` | Builder's own assignments, earnings, available phases |
| CohortPortalService | (in use-cohort-portal.ts) | Cohort member's sessions, earnings |
| ProductionPortalService | (in use-production-portal.ts) | Production learner's queue, earnings |
| ClientPortalService | (in use-client-portal.ts) | Client's solutions, deliverables, invoices |

---

## 6. React Hooks

### 6.1 Products & TRL Hooks (`hooks/solutions/use-products.ts`)

#### Query Hooks

| Hook | Returns | Config |
|------|---------|--------|
| `useProducts(filters?)` | `BaseListResponse<ProductWithValidations>` | DYNAMIC_DATA |
| `useProduct(id)` | `ProductWithValidations` | SEMI_STABLE_DATA |
| `useProductStats()` | `ProductStats` | DASHBOARD_DATA |
| `useRetainedIPSolutions()` | `SHProduct[]` | SEMI_STABLE_DATA |
| `useTRLHistory(productId)` | `SHProductValidation[]` | SEMI_STABLE_DATA |
| `useProductValidations(productId)` | `SHProductValidation[]` | DYNAMIC_DATA |
| `useRDIFPrerequisites()` | `SHRDIFPrerequisite[]` | SEMI_STABLE_DATA |
| `useRDIFReadinessScore()` | `RDIFReadinessResult` | DASHBOARD_DATA |
| `useThreeYearBridgeStatus()` | `ThreeYearBridgeStatus` | DASHBOARD_DATA |
| `useNextRDIFMilestones()` | `RDIFMilestone[]` | SEMI_STABLE_DATA |

#### Mutation Hooks

| Hook | Invalidates |
|------|-------------|
| `useCreateProduct()` | products.all |
| `useUpdateProduct()` | products.all + detail cache |
| `useDeleteProduct()` | products.all |
| `useArchiveProduct()` | products.all + detail cache |
| `useUpdateTRL()` | products.all + detail + trlHistory |
| `useAddValidation()` | validations + detail + trlHistory + all |
| `useUpdatePrerequisite()` | rdifPrerequisites + rdifScore + bridgeStatus + nextMilestones |

### 6.2 Query Key Hierarchy

```
['solutions-hub']                                       # root
['solutions-hub', 'products']                           # products.all
['solutions-hub', 'products', 'list', filters]          # products.list(filters)
['solutions-hub', 'products', 'detail', id]             # products.detail(id)
['solutions-hub', 'products', 'stats']                  # products.stats()
['solutions-hub', 'products', 'retained-ip']            # products.retainedIP()
['solutions-hub', 'products', 'trl-history', id]        # products.trlHistory(id)
['solutions-hub', 'products', 'validations', id]        # products.validations(id)
['solutions-hub', 'products', 'rdif-prerequisites']     # products.rdifPrerequisites()
['solutions-hub', 'products', 'rdif-score']             # products.rdifScore()
['solutions-hub', 'products', 'bridge-status']          # products.bridgeStatus()
['solutions-hub', 'products', 'next-milestones']        # products.nextMilestones()
```

---

## 7. Pages & Routes

### 7.1 Admin Routes

| Route | Description | Status |
|-------|-------------|--------|
| `/solutions` | Solutions dashboard | Built |
| `/solutions/list` | All solutions | Built |
| `/solutions/new` | Create solution | Built |
| `/solutions/[id]` | Solution detail | Built |
| `/solutions/[id]/mou` | MOU management | Built |
| `/solutions/clients` | Client management | Built |
| `/solutions/software` | Software overview | Built |
| `/solutions/software/builders` | Builder talent pool | Built |
| `/solutions/software/phases` | Phase management | Built |
| `/solutions/training` | Training overview | Built |
| `/solutions/training/cohort` | Cohort management | Built |
| `/solutions/training/sessions` | Sessions | Built |
| `/solutions/content` | Content overview | Built |
| `/solutions/content/production` | Production learners | Built |
| `/solutions/content/queue` | Deliverable queue | Built |
| `/solutions/discovery` | Site visits | Built |
| `/solutions/payments` | Payments | Built |
| `/solutions/earnings` | Earnings ledger | Built |
| `/solutions/publications` | Publications | Built |
| `/solutions/products` | Products list with stats | Built (mock data) |
| `/solutions/products/new` | Create product form | Built (mock data) |
| `/solutions/products/[id]` | Product detail with 5 tabs | Built (mock data) |
| `/solutions/products/[id]/edit` | Edit product | Planned |
| `/solutions/products/rdif` | RDIF readiness dashboard | Planned |

### 7.2 Portal Routes

| Route | Role | Description | Status |
|-------|------|-------------|--------|
| `/talent/builder` | builder | Builder dashboard | Built |
| `/talent/builder/assignments` | builder | My assignments | Built |
| `/talent/builder/available` | builder | Available phases | Built |
| `/talent/builder/earnings` | builder | My earnings | Built |
| `/talent/cohort` | cohort_member | Cohort dashboard | Built |
| `/talent/cohort/sessions` | cohort_member | Available sessions | Built |
| `/talent/cohort/earnings` | cohort_member | My earnings | Built |
| `/talent/production` | production_learner | Production dashboard | Built |
| `/talent/production/queue` | production_learner | Work queue | Built |
| `/talent/production/earnings` | production_learner | My earnings | Built |
| `/portal/client` | client | Client dashboard | Built |
| `/portal/client/projects` | client | Their solutions | Built |
| `/portal/client/deliverables` | client | Their content | Built |
| `/portal/client/invoices` | client | Their invoices | Built |

---

## 8. Components

### 8.1 TRLBadge

Renders a colored badge showing the TRL level number with graduated color (red 1 -> blue 9).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `level` | number | -- | TRL level (1-9) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Badge size |
| `showName` | boolean | false | Show TRL name after number |

### 8.2 TRLProgress

Visual 9-step horizontal timeline with RDIF threshold marker at TRL 4.

| Prop | Type | Description |
|------|------|-------------|
| `currentTRL` | number | Current TRL level |
| `targetTRL` | number | Optional target TRL |

Visual states: Completed (green + checkmark), Current (blue + pulse), Future (gray), TRL 4 (JKKN green ring).

### 8.3 RDIFScorecard

Circular SVG progress chart + prerequisite checklist.

| Prop | Type | Description |
|------|------|-------------|
| `prerequisites` | RDIFPrerequisite[] | Array of prerequisites |
| `showDetails` | boolean | Full list or first-3 summary |

Color thresholds: Green (7+), Yellow (4-6), Red (<4).

---

## 9. Workflows

This section documents every workflow in the Solutions Hub, end to end.

### 9.1 Solution Lifecycle

The primary workflow -- a client engagement from first contact to completion.

```
[Client Contact]
      |
      v
  PROSPECTING ──> DISCOVERY ──> PRD_WRITING ──> PROTOTYPE_BUILDING
                                                      |
                                                      v
                                               CLIENT_DEMO ──> REVISIONS
                                                      |              |
                                                      v              v
                                                 APPROVED ──────> (loop)
                                                      |
                                                      v
                                               DEPLOYING ──> TRAINING ──> LIVE
                                                                           |
                                                                           v
                                                                     IN_AMC ──> COMPLETED
```

| Phase | Who | What Happens | Tables Affected |
|-------|-----|-------------|-----------------|
| Prospecting | Admin/HOD | Identify client need, create solution record | `sh_solutions`, `sh_clients` |
| Discovery | Admin/HOD + Client | Site visit, pain point analysis | `sh_discovery_visits` |
| PRD Writing | Admin | Write requirements document | `sh_solution_phases` |
| Prototype Building | Builders | Assign builders, build iterations | `sh_builder_assignments`, `sh_prototype_iterations` |
| Client Demo | Admin + Client | Present prototype, collect feedback | `sh_prototype_iterations` (feedback) |
| Revisions | Builders | Fix bugs, iterate on feedback | `sh_bug_reports`, `sh_prototype_iterations` |
| Approved | Admin + Client | Client signs off, MOU created | `sh_solution_mous` |
| Deploying | Builders | Deploy to production | `sh_phase_deployments` |
| Training | Cohort Members | Train end users | `sh_implementation_users`, `sh_training_sessions` |
| Live | -- | Solution in active use | `sh_solutions` (status = active) |
| In AMC | -- | Annual maintenance period | `sh_solutions` (status = in_amc) |
| Completed | -- | Engagement ends | `sh_solutions` (status = completed) |

**Parallel tracks at each phase:**
- Payments collected at milestones (`sh_payments`)
- Communications logged (`sh_client_communications`)
- JICATE facilitation sessions booked (`sh_jicate_sessions`)

---

### 9.2 Builder Assignment Workflow

How software talent gets assigned to solution phases.

```
REQUESTED ──> APPROVED ──> ACTIVE ──> COMPLETED
                                         |
                              WITHDRAWN <─┘ (if removed)
```

| Step | Actor | Action | Data Change |
|------|-------|--------|-------------|
| Request | HOD/Admin | Request builder for a phase | `sh_builder_assignments.status = 'requested'` |
| Approve | Admin | Approve the assignment | `status = 'approved'`, `approved_at = NOW()` |
| Activate | System | Builder starts work | `status = 'active'` |
| Complete | Admin/Builder | Work finished | `status = 'completed'`, `completed_at = NOW()` |
| Withdraw | Admin | Builder removed from phase | `status = 'withdrawn'` |

---

### 9.3 Content Deliverable Workflow

How content production orders flow from request to delivery.

```
PENDING ──> IN_PROGRESS ──> REVIEW ──> REVISION ──> APPROVED ──> DELIVERED
                              |                        ^
                              └── (if changes needed) ─┘
```

| Step | Actor | Action | Data Change |
|------|-------|--------|-------------|
| Order Created | Admin | Content order linked to solution | `sh_content_orders` created |
| Assign Learner | Admin | Assign production learner | `sh_production_assignments` created |
| In Progress | Learner | Working on deliverable | `sh_content_deliverables.status = 'in_progress'` |
| Submit for Review | Learner | Upload file, submit | `status = 'review'`, `file_url` set |
| Request Revision | Admin/Client | Changes needed | `status = 'revision'`, `revision_count++` |
| Approve | Admin/Client | Deliverable accepted | `status = 'approved'`, `approved_at = NOW()` |
| Deliver | Admin | Send to client | `status = 'delivered'` |

---

### 9.4 Training Session Workflow

How training programs are scheduled, staffed, and delivered.

```
PLANNED ──> SESSIONS_SCHEDULED ──> COHORT_ASSIGNED ──> IN_PROGRESS ──> COMPLETED
```

| Step | Actor | Action | Data Change |
|------|-------|--------|-------------|
| Program Created | Admin | Link training to solution | `sh_training_programs` created |
| Sessions Scheduled | Admin | Define session dates/times | `sh_training_sessions` created |
| Cohort Assigned | Admin | Assign cohort members to sessions | `sh_cohort_assignments` created |
| Session Delivered | Cohort Member | Deliver session, record attendance | `sh_training_sessions.status = 'completed'`, `attendance_count` set |
| Rate & Pay | Admin | Rate cohort member, record earnings | `sh_cohort_assignments.rating`, `earnings` set |

**Cohort Member Progression:**
```
OBSERVER (watch sessions) ──> CO_LEAD (assist) ──> LEAD (deliver solo) ──> MASTER
```

Progression is tracked via `sessions_observed`, `sessions_co_led`, `sessions_led` counters on `sh_cohort_members`.

---

### 9.5 Payment & Revenue Split Workflow

How money flows from client payment to individual earnings.

```
CLIENT PAYS ──> PAYMENT RECORDED ──> SPLIT MODEL APPLIED ──> EARNINGS DISTRIBUTED
```

| Step | Actor | Action | Data Change |
|------|-------|--------|-------------|
| Payment Received | Admin | Record client payment | `sh_payments` created (status = pending) |
| Processing | System/Admin | Verify payment | `sh_payments.status = 'processing'` |
| Completed | System/Admin | Payment confirmed | `sh_payments.status = 'completed'` |
| Apply Split | System | Revenue split model applied | `sh_earnings_ledger` entries created |
| Process Earnings | Admin | Approve individual payouts | `sh_earnings_ledger.status = 'processed'` |
| Paid | Admin | Money disbursed | `sh_earnings_ledger.status = 'paid'` |

**Revenue Split Example (Software):**

```json
{
  "builder": 40,
  "department": 30,
  "jicate": 15,
  "institution": 15
}
```

Recipients include: builder, cohort_member, production_learner, department, jicate, institution, council, infrastructure, referral_bonus.

---

### 9.6 Client Referral Workflow

How departments earn referral bonuses for bringing clients.

```
DEPARTMENT REFERS CLIENT ──> SOLUTION CREATED ──> DEAL CLOSES ──> BONUS CALCULATED ──> BONUS PAID
```

| Step | Data Change |
|------|-------------|
| Referral recorded | `sh_client_referrals` created with referring_dept_id |
| Solution created | `sh_solutions` linked to client |
| Deal closes | `sh_payments` marked completed |
| Bonus calculated | `sh_client_referrals.bonus_amount` computed (default 5%) |
| Bonus paid | `sh_client_referrals.bonus_paid = true`, `paid_at = NOW()` |

---

### 9.7 Publication Workflow

How academic outputs are tracked from draft to publication.

```
DRAFT ──> SUBMITTED ──> UNDER_REVIEW ──> ACCEPTED ──> PUBLISHED
                              |
                              └──> REJECTED
```

| Step | Data Change |
|------|-------------|
| Draft created | `sh_publications` created, contributors linked |
| Submitted to journal | `status = 'submitted'`, `submission_date` set |
| Under review | `status = 'under_review'` |
| Accepted | `status = 'accepted'`, `acceptance_date` set |
| Published | `status = 'published'`, `publication_date`, `doi` set |
| Rejected | `status = 'rejected'` (can resubmit to different journal) |

NIRF/NAAC metrics auto-calculated from publication records via `sh_accreditation_metrics`.

---

### 9.8 Product Lifecycle Workflow (IP Development)

How retained IP evolves from concept to deployed product.

```
CONCEPT ──> PROTOTYPE ──> LAB_VALIDATED ──> FIELD_VALIDATED ──> MARKET_READY ──> DEPLOYED
                                                                                    |
                                                                              ARCHIVED <─┘
```

| Status | TRL Range | What Happens |
|--------|-----------|-------------|
| Concept | TRL 1-2 | Basic principles observed, technology concept formulated |
| Prototype | TRL 3 | Experimental proof of concept, analytical/lab studies |
| Lab Validated | TRL 4-5 | Component validated in lab, integrated system demonstrated |
| Field Validated | TRL 6-7 | System demonstrated in relevant environment, prototype in operational environment |
| Market Ready | TRL 8 | System complete and qualified through testing |
| Deployed | TRL 9 | Actual system proven in operational environment |
| Archived | -- | No longer actively developed |

---

### 9.9 TRL Progression Workflow

How a product's Technology Readiness Level advances with evidence.

```
ASSESS CURRENT TRL ──> IDENTIFY NEXT LEVEL REQUIREMENTS ──> GATHER EVIDENCE
         ^                                                        |
         |                                                        v
         └────────────── UPDATE TRL <──── VALIDATE EVIDENCE ──────┘
```

| Step | Actor | Action | Data Change |
|------|-------|--------|-------------|
| Assess | Admin/HOD | Evaluate current readiness level | `sh_products.current_trl` reviewed |
| Set Target | Admin | Define target TRL for development cycle | `sh_products.target_trl` set |
| Gather Evidence | Team | Conduct tests, publish papers, get external review | Evidence collected offline |
| Add Validation | Admin/Staff | Record validation evidence | `sh_product_validations` created |
| Verify | Admin | Confirm validation is legitimate | `sh_product_validations.status = 'verified'` |
| Update TRL | Admin | Advance product TRL level | `sh_products.current_trl` updated, `trl_assessed_at = NOW()` |

**Validation Types:** internal_review, lab_test, field_test, external_review, user_validation, publication, patent

**Key Rule:** TRL can go up OR down. A reassessment might lower TRL if prior evidence is invalidated. No sequential enforcement.

---

### 9.10 RDIF Readiness Workflow

How JKKN tracks progress toward RDIF (Research Development and Innovation Fund) eligibility.

```
ASSESS PREREQUISITES ──> SCORE CALCULATED ──> BRIDGE YEAR DETERMINED ──> MILESTONES SET
         ^                                                                     |
         |                                                                     v
         └──────── UPDATE PREREQUISITES <──── WORK ON MILESTONES ─────────────┘
```

**Three-Year Bridge Plan:**

| Year | Score Range | Label | Focus |
|------|------------|-------|-------|
| Year 1 | 0-3 | Foundation | Company structure, initial IP, first TRL 4+ product |
| Year 2 | 4-6 | Growth | R&D publications, DSIR recognition, SLFM relationships |
| Year 3 | 7-9 | Readiness | VC connections, co-investment capital, complete portfolio |

**Eligibility:** Score >= 7 out of 9 prerequisites met.

**Year-End Gates:**
- Year 1: If < 8 deals close and < Rs 30L collected, all RDIF tracks pause
- Year 2: IP assets >= 3 with TRL 2+, >= 1 published paper, escalation ratio <= 40%
- Year 3: 7 of 9 prerequisites met = ready for RDIF application

**Important:** Bridge year is purely score-based, not time-based. If JKKN stays at score 2 for three calendar years, system still shows Year 1. Honest by design.

---

### 9.11 Licensing Pivot Workflow

The strategic workflow that connects client solutions to IP retention.

```
CLIENT DEAL ──> TEMPLATE B SELECTED ──> retained_ip = TRUE ──> REUSABLE TECH IDENTIFIED
                                                                        |
                                                                        v
                                                               PRODUCT CREATED ──> TRL TRACKED
                                                                        |
                                                                        v
                                                               PATENT FILED ──> PATENT GRANTED
```

| Step | Actor | Action | Data Change |
|------|-------|--------|-------------|
| Client deal created | Admin | Standard solution process | `sh_solutions` created |
| Template B selected | Admin | Licensing contract (not fee-for-service) | `sh_solutions.retained_ip = TRUE` |
| IP notes recorded | Admin | Document what IP is retained | `sh_solutions.ip_retention_notes` set |
| Reusable tech identified | Admin/Team | Technology worth developing further | Analysis and decision |
| Product created | Admin | Register as JKKN-owned product | `sh_products` created with `originating_solution_ids` |
| TRL tracking begins | Admin | Product starts at TRL 1 | `sh_products.current_trl = 1` |
| Patent lifecycle | Admin | Track patent application | `sh_products.patent_status` progression: none -> provisional_filed -> full_filed -> granted |

---

### 9.12 Prototype Iteration Workflow

How software prototypes evolve through client feedback.

```
VERSION 1 BUILT ──> CLIENT DEMO ──> FEEDBACK COLLECTED ──> BUGS FILED
                                                               |
                                                               v
                                                      BUGS RESOLVED ──> VERSION 2 BUILT
                                                                              |
                                                                              v
                                                                  (repeat until approved)
                                                                              |
                                                                              v
                                                                    CLIENT APPROVED
```

| Step | Data Change |
|------|-------------|
| Build prototype | `sh_prototype_iterations` created (version = N) |
| Demo to client | `sh_prototype_iterations.feedback` recorded |
| File bugs | `sh_bug_reports` created (status = open) |
| Resolve bugs | `sh_bug_reports.status = 'resolved'`, `resolution_notes` set |
| New version | `sh_prototype_iterations` created (version = N+1) |
| Client approves | `sh_prototype_iterations.client_approved = TRUE` |

---

### 9.13 Deployment Workflow

How approved software gets deployed to production.

```
DEVELOPMENT ──> STAGING ──> PRODUCTION
```

| Step | Data Change |
|------|-------------|
| Dev deployment | `sh_phase_deployments` created (environment = 'development') |
| Staging deployment | New record (environment = 'staging'), vercel_url set |
| Production deployment | New record (environment = 'production'), vercel_url + supabase_project_id set |
| User training | `sh_implementation_users` created for each end user |
| User active | `sh_implementation_users.usage_status = 'active'` |

---

### 9.14 Discovery Visit Workflow

How client site visits are conducted and followed up.

```
VISIT SCHEDULED ──> VISIT CONDUCTED ──> OBSERVATIONS RECORDED ──> FOLLOW-UP REQUIRED?
                                                                       |         |
                                                                      YES       NO
                                                                       |         |
                                                                       v         v
                                                              FOLLOW-UP DATE    DONE
                                                              SCHEDULED
```

| Step | Data Change |
|------|-------------|
| Schedule visit | Calendar event created |
| Conduct visit | `sh_discovery_visits` created with observations, pain_points, opportunities |
| Photos captured | `sh_discovery_visits.photos_urls[]` populated |
| Follow-up needed | `follow_up_required = TRUE`, `follow_up_date` set |
| Follow-up done | New `sh_client_communications` entry |

---

### 9.15 JICATE Facilitation Workflow

How JICATE facilitation sessions are booked and delivered.

```
SESSION REQUESTED ──> SESSION BOOKED ──> SESSION DELIVERED ──> OUTCOME RECORDED
```

| Step | Data Change |
|------|-------------|
| Department requests | `sh_jicate_sessions` created (booked_by_dept_id set) |
| Facilitator assigned | `jicate_facilitator` set |
| Session delivered | `session_date` confirmed |
| Outcome recorded | `outcome` set: successful, needs_followup, escalated, cancelled |

---

## 10. Business Rules

### 10.1 TRL Rules

1. TRL values: integers 1-9 (database CHECK constraint + service validation)
2. TRL can go up or down -- no sequential enforcement
3. `trl_assessed_at` auto-set when TRL updated via `updateTRL()`
4. TRL history reconstructed from `sh_product_validations` table
5. TRL 4 is the critical RDIF threshold (highlighted in UI)

### 10.2 RDIF Scoring

1. Score = count of prerequisites where `is_met = TRUE`
2. Always 0-9 (exactly 9 prerequisites)
3. Bridge year: 0-3 = Year 1, 4-6 = Year 2, 7-9 = Year 3
4. Eligibility requires score >= 7
5. Milestones sorted by priority: Critical > High > Medium > Low
6. `rdif_readiness_score` on `sh_products` is denormalized (manual sync needed)

### 10.3 Product Code Generation

1. Get current year
2. Query highest existing code with `JKKN-PRD-YYYY-` prefix
3. Increment sequence, zero-pad to 3 digits
4. Resets to 001 each calendar year

### 10.4 Solution Code Generation

Database trigger: `JKKN-SOL-YYYY-NNN` format, auto-generated on INSERT when code is NULL.

### 10.5 Revenue Split Rules

1. Default split models per solution type (software, training, content)
2. Custom split models can override defaults
3. Split config is JSONB: `{builder: 40, department: 30, jicate: 15, institution: 15}`
4. All percentages must sum to 100
5. Earnings entries created per recipient from each payment

### 10.6 Client Data Isolation

1. Clients see ONLY their own solutions, deliverables, payments (RLS enforced)
2. Client ID derived from user email matching `sh_clients.contact_email`
3. No cross-client data leakage possible at database level

---

## 11. MyJKKN Enhancement Integration

The Solutions Hub is one component of a broader MyJKKN enhancement that includes CRM, AI, and TQM features. Implementation status as of 2026-02-12:

### 11.1 Phase Summary

| Phase | Name | Priority | Status | Features |
|-------|------|----------|--------|----------|
| Phase 1 | CRM Activation | P0 | **Completed** | Scoring rules, Assignment rules, Templates, Workflows, Activity timeline |
| Phase 2 | Campaign Execution | P1 | **Completed** | Job processor, Drip executor, WhatsApp, SMS, Monitoring |
| Phase 3 | AI Features | P1 | **Completed** | Rule-based scoring, AI response generation, Daily briefing, Agentic queries |
| Phase 4 | Solutions Hub Completion | P1 | **Completed** | Builder portal, Cohort portal, Production portal, Client portal, Earnings |
| Phase 5 | TQM Modules | P2 | **Not Started** | NPS, Process Excellence, Grievance, Maturity Assessment, OKR extension, COPQ |

**Totals:** 34 features | 23 completed | 5 in progress (Products/TRL mock-to-real) | 6 not started (TQM)

### 11.2 CRM Workflows (Admission Module)

**Lead Lifecycle:**
```
NEW ──> CONTACTED ──> INTERESTED ──> APPLIED ──> ENROLLED
```

**Campaign Execution:**
```
CONFIGURE WORKFLOW ──> ENROLL LEADS ──> SCHEDULE STEPS ──> EXECUTE (WhatsApp/SMS/Email) ──> LOG DELIVERY ──> TRACK RESPONSES
```

**AI Scoring:**
```
LEAD EVENT ──> RULE EVALUATION ──> SCORE CALCULATED ──> FACTOR BREAKDOWN ──> DISPLAY ON LEAD CARD
```

**Daily Briefing:**
```
4-5 AM: DATA COLLECTION ──> GENERATION (role-specific) ──> 6 AM: DELIVERY ──> READ TRACKING
```

### 11.3 Database Additions for CRM/AI

| Table | Purpose |
|-------|---------|
| `admission_workflow_step_logs` | Campaign step execution tracking |
| `ai_daily_briefings` | Daily briefing storage |
| `ai_conversations` | AI conversation persistence |
| `admission_lead_scores` | AI scoring records |
| `admission_ai_insights` | AI-generated insights |

---

## 12. Implementation Roadmap

### 12.1 Completed Phases

| Week | What | Status |
|------|------|--------|
| Week 1 | Database migrations applied to staging | Done |
| Week 2 | Service layer + hooks created | Done |
| Week 3 | UI components migrated | Done |
| Week 4 | Portal routes created | Done |
| Week 5 | CRM + Campaign + AI features | Done |
| Week 6 | Products & TRL module (mock data) | Done |

### 12.2 Remaining Work

| Item | Priority | Status |
|------|----------|--------|
| Wire Products pages to real hooks (replace mock data) | HIGH | TODO |
| Product edit page (`/solutions/products/[id]/edit`) | HIGH | TODO |
| RDIF dashboard page (`/solutions/products/rdif`) | HIGH | TODO |
| Originating solutions multi-select on create form | MEDIUM | TODO |
| Dashboard integration (wire stats to real hooks) | MEDIUM | TODO |
| TQM: Stakeholder NPS | P2 | Not started |
| TQM: Process Excellence | P2 | Not started |
| TQM: Grievance Management | P2 | Not started |
| TQM: Maturity Assessment | P2 | Not started |
| TQM: OKR A/B/C/D Matrix | P2 | Not started |
| TQM: COPQ Tracking | P2 | Not started |

### 12.3 Data Migration (When Ready)

```bash
# Export from Solutions Hub Supabase
~/bin/supabase db dump --project-ref izrhjeopgphbsueulnck --data-only > solutions_hub_data.sql

# Transform: add sh_ prefix, update foreign keys to MyJKKN IDs
# Import to staging: hhprjbgknupaplivtoib
# Verify data integrity
# Link users by email matching
```

### 12.4 Success Criteria

| Metric | Target |
|--------|--------|
| All 8 roles can login | 100% |
| All portals accessible | 100% |
| Data integrity verified | 100% |
| No duplicate departments | 0 |
| Client portal RLS working | Clients see only their data |
| Build time | < 5 minutes |
| No regression in MyJKKN | All existing features work |

---

## 13. Future Enhancements

### 13.1 Planned

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| Auto-sync RDIF score | LOW | Recalculate when prerequisites change |
| TRL assessment workflow | LOW | Formal workflow requiring evidence before TRL update |
| Product timeline view | LOW | Visual TRL progression over time |
| ANRF grant tracker | LOW | Track grant applications linked to research_output |
| Essential Infrastructure tracker | LOW | Track partnerships with RDIF-funded companies |
| NIF startup integration | LOW | Link NIF startups to products sharing technology |

### 13.2 Explicitly Rejected

| Feature | Why Rejected |
|---------|-------------|
| Full RDIF application workflow | JKKN is 3+ years away. Premature. |
| SLFM CRM integration | Only 2 SLFMs active nationally. Not enough volume. |
| Co-investment calculator | Financial modeling meaningless at Rs 4.5L vs Rs 50 Cr scale. |
| Automated TRL assessment via AI | Requires domain expert judgment. AI cannot substitute. |

---

## 14. File Inventory

### 14.1 Products & TRL Files

| File | Purpose |
|------|---------|
| `types/products.ts` | Types, enums, constants, TRL definitions |
| `lib/services/solutions/products-service.ts` | ProductsService -- CRUD, TRL, validations, RDIF, stats |
| `lib/services/solutions/rdif-service.ts` | RDIFService -- readiness, bridge status, milestones |
| `hooks/solutions/use-products.ts` | React Query hooks for products/TRL/RDIF |
| `lib/query-keys.ts` | Query keys under `solutionsHubKeys.products` |
| `app/(routes)/solutions/products/page.tsx` | Products list page |
| `app/(routes)/solutions/products/new/page.tsx` | Create product page |
| `app/(routes)/solutions/products/[id]/page.tsx` | Product detail with 5 tabs |
| `app/(routes)/solutions/_components/trl-badge.tsx` | TRL badge component |
| `app/(routes)/solutions/_components/trl-progress.tsx` | TRL progress visualization |
| `app/(routes)/solutions/_components/rdif-scorecard.tsx` | RDIF scorecard component |
| `app/(routes)/solutions/_components/solutions-dashboard.tsx` | Dashboard with Products card |
| `supabase/migrations/20260210130001_create_trl_product_tables.sql` | Database migration |

### 14.2 Solutions Hub Core Files

| Directory | Purpose |
|-----------|---------|
| `lib/services/solutions/` | All solution hub services |
| `hooks/solutions/` | All solution hub hooks |
| `types/solutions.ts` | Solution hub types |
| `app/(routes)/solutions/` | All admin routes |
| `app/(routes)/portal/client/` | Client portal |
| `app/(routes)/talent/` | Talent portals (builder, cohort, production) |
| `components/solutions/` | Shared components |

### 14.3 Related Context Files

| File | Relationship |
|------|-------------|
| `lib/services/solutions/types.ts` | Existing solution types (includes `retained_ip` field) |
| `lib/sidebarMenuLink.ts` | Menu configuration for solutions routes |
| `supabase/setup/01_tables.sql` | Base table definitions |
| `supabase/setup/03_policies.sql` | RLS policy definitions |

---

## Appendix A: Rollback Plan

If issues arise:
1. **Database:** Keep Solutions Hub Supabase project active for 30 days post-migration
2. **Code:** Feature flag to disable Solutions Hub routes
3. **Data:** Nightly backups during transition
4. **Users:** Redirect URLs to old system if needed

## Appendix B: Open Questions

1. File storage: Move Solutions Hub files to MyJKKN storage bucket?
2. Notifications: Merge notification systems or keep separate?
3. Audit logs: Unified audit log or separate?
4. Demo accounts: Create new or migrate existing?

---

*Consolidated: 2026-02-12*
*Sources: SOLUTIONS-HUB-MERGER-SPEC.md (2026-02-03), MYJKKN-ENHANCEMENT-SPEC.md (2026-02-04), solutions-products-trl.md (2026-02-10)*
*Module Status: Service layer and hooks production-ready. Products pages use mock data. TQM modules not started.*
