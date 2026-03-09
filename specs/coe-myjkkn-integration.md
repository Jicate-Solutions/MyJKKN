# MyJKKN CoE Integration Spec — Centre of Excellence Policy as Digital Workflow

**Date:** 2026-03-08 (Revised after deep interview)
**Status:** SPEC — Ready for Implementation
**Origin:** FST Analysis of JKKN CoE Policy ([vault link](obsidian://open?vault=Claude%20Setup&file=Capture%2FJKKNKB%2F26-03-08-8.46pm-CoE-Policy-Assessment-MyJKKN-Relevance.md))
**Approach:** Thin orchestration layer over existing Startup Studio + Solutions Hub + Facilitator modules
**Key Context:** This policy is being **launched for the first time** — not digitizing an existing process.

---

## Problem Statement

The JKKN Centre of Excellence (CoE) policy is an 8,000-word governance framework defining project lifecycle management, trajectory decisions (Solution/Startup/Research), milestone-based incentives, cross-batch handover, and committee review workflows. It currently exists as a static document with no digital enforcement. MyJKKN already has 90+ database tables across startup-studio and solutions-hub that serve ~80% of the policy's needs. The missing 20% is a coordination layer that connects policy stages to platform states.

**Critical difference from original spec:** This is a cold-start launch. Learners initiate proposals, committees approve them, and the system must guide users through a process they've never done before. Cold-start UX (empty states, onboarding prompts, guided flows) is essential.

## Core Principles

1. **Do not rebuild what exists.** Wire a thin `coe_` layer that orchestrates existing modules.
2. **Learner-initiated.** Projects start as proposals from learners, not admin-created records.
3. **Committee governance from Day 1.** Every proposal requires committee approval before entering the design thinking lifecycle.
4. **Full incentive automation.** Attendance relaxation auto-applied; CIA bonus computed from new minimal CIA tracker.
5. **Public within institution.** All CoE projects visible to peers for motivation — not just project owners.

---

## Architecture

```
                     ┌──────────────────────────────────┐
                     │    CoE Orchestration Layer        │
                     │    (10 coe_ tables)               │
                     │                                   │
                     │  coe_projects ── the spine        │
                     │    ├── coe_trajectory_*            │
                     │    ├── coe_incentive_ledger        │
                     │    ├── coe_mentor_ratings          │
                     │    ├── coe_committee_reviews       │
                     │    ├── coe_stage_history           │
                     │    ├── coe_committee_members       │
                     │    └── coe_committee_votes         │
                     │                                   │
                     │  CIA Subsystem (2 coe_ tables)     │
                     │    ├── coe_cia_configs             │
                     │    └── coe_cia_student_marks       │
                     └────────────┬──────────────────────┘
                                  │ links to (FKs)
           ┌──────────────────────┼──────────────────────┐
           │                      │                       │
  ┌────────▼───────┐    ┌────────▼────────┐    ┌────────▼────────┐
  │ Startup Studio │    │  Solutions Hub   │    │   Facilitator   │
  │ (40 ss_ tables)│    │ (50+ sh_ tables) │    │   Development   │
  │                │    │                  │    │                 │
  │ ss_cycles      │    │ sh_solutions     │    │ facilitator_    │
  │ ss_teams       │    │ sh_products      │    │ development     │
  │ ss_nif_cands   │    │ sh_publications  │    │                 │
  │ ss_problem_bank│    │ sh_product_valid │    │ facilitator_    │
  │ ss_research_*  │    │                  │    │ industry_imm    │
  │ ss_appathon_*  │    │                  │    │                 │
  └────────────────┘    └─────────────────┘    └─────────────────┘
           │
  ┌────────▼───────────┐
  │  Attendance System  │
  │ (student_attendance)│
  │  JSONB-based        │
  │  + leave/on-duty    │
  └────────────────────┘
```

---

## CoE Stage Lifecycle

The lifecycle has two phases: **pre-approval** (proposal → committee) and **post-approval** (design thinking → trajectory → handover).

### Stage Flow

```
proposal (learner submits)
  → committee_review (committee votes)
    ├→ rejected (terminal — archived, admin can reopen)
    ├→ proposal (revision_needed — loops back for editing)
    └→ orientation (approved — onboarding, policy intro, team formation)
        → empathize (interview users, discover pain points)
          → define (articulate problem statement)
            → ideate (classify solution approach, brainstorm)
              → prototype (build with tools)
                → test (user testing, measure outcomes)
                  → trajectory_assessment (5-criteria rubric)
                    → handover | completed
                      → completed (archived with full history)
```

### Stage <-> Cycle Step Mapping

| CoE Policy Stage | ss_cycle Step | What Happens |
|-----------------|---------------|--------------|
| `proposal` | (pre-cycle) | **Draft stage.** Learner creates and edits project idea freely. Not yet submitted for review. |
| `committee_review` | (pre-cycle) | **Submitted for review.** Learner clicked 'Submit for Review'. Committee votes approve/reject/revision_needed. |
| `orientation` | (pre-cycle) | CoE onboarding, policy intro, team formation |
| `empathize` | problem + context | Interview users, discover pain points |
| `define` | value_assessment | Articulate problem statement, assess value |
| `ideate` | workflow | Classify solution approach, brainstorm |
| `prototype` | prompt + build | Build with Lovable/AI tools |
| `test` | impact | User testing, measure outcomes |
| `trajectory_assessment` | (post-cycle) | 5-criteria rubric, final trajectory decision |
| `handover` | (post-cycle) | Document, version, transfer to next batch |
| `completed` | (terminal) | Project archived with full history |

---

## Database Schema

### Table 1: `coe_projects` — The Central Spine

Links a project to its CoE lifecycle, trajectory decision, and downstream entities. Supports **multiple entry points**: cycle-based, Appathon submission, or fresh proposal.

```sql
CREATE TABLE coe_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  -- Origin: MULTIPLE entry points (all nullable)
  origin_type TEXT NOT NULL DEFAULT 'fresh'
    CHECK (origin_type IN ('cycle', 'submission', 'fresh', 'handover')),
  origin_cycle_id UUID REFERENCES ss_cycles(id),          -- from a cycle
  origin_submission_id UUID REFERENCES ss_appathon_submissions(id), -- from Appathon
  -- 'fresh' = learner-initiated proposal with no prior cycle/submission

  -- Enforce origin_type <-> FK consistency
  -- Note: 'fresh' allows origin_cycle_id to be populated AFTER auto-cycle creation at orientation
  -- Note: 'handover' is set by createHandover for V(n+1) projects — preserves cross-batch provenance
  CONSTRAINT origin_fk_consistency CHECK (
    (origin_type = 'cycle' AND origin_cycle_id IS NOT NULL AND origin_submission_id IS NULL)
    OR (origin_type = 'submission' AND origin_submission_id IS NOT NULL AND origin_cycle_id IS NULL)
    OR (origin_type = 'fresh' AND origin_submission_id IS NULL)
    OR (origin_type = 'handover' AND parent_project_id IS NOT NULL AND origin_submission_id IS NULL)
  ),

  team_id UUID REFERENCES ss_teams(id),

  -- Proposer (the learner who initiated)
  proposed_by UUID NOT NULL REFERENCES profiles(id),

  -- CoE lifecycle stage (includes pre-approval stages)
  stage TEXT NOT NULL DEFAULT 'proposal'
    CHECK (stage IN (
      'proposal', 'committee_review',
      'orientation', 'empathize', 'define', 'ideate',
      'prototype', 'test', 'trajectory_assessment',
      'handover', 'completed', 'rejected'
    )),
  stage_entered_at TIMESTAMPTZ DEFAULT NOW(),

  -- Trajectory outcome (set after trajectory_assessment)
  trajectory TEXT CHECK (trajectory IN ('solution', 'startup', 'research')),
  -- NULL = not yet decided (no need for explicit 'undecided' value)
  trajectory_decided_at TIMESTAMPTZ,

  -- Downstream entity links (populated based on trajectory)
  sh_solution_id UUID REFERENCES sh_solutions(id) ON DELETE SET NULL,
  nif_candidate_id UUID REFERENCES ss_nif_candidates(id) ON DELETE SET NULL,
  research_topic_id UUID REFERENCES ss_research_topics(id) ON DELETE SET NULL,
  sh_product_id UUID REFERENCES sh_products(id) ON DELETE SET NULL,

  -- Cross-batch versioning
  version INTEGER NOT NULL DEFAULT 1,
  parent_project_id UUID REFERENCES coe_projects(id),
  CONSTRAINT no_self_reference CHECK (parent_project_id != id),
  academic_year TEXT CHECK (academic_year IS NULL OR academic_year ~ '^\d{4}-\d{4}$'),
  -- Format: 'YYYY-YYYY' e.g., '2025-2026'. Enforced by CHECK constraint.

  -- Mentor assignment
  mentor_id UUID REFERENCES profiles(id),
  mentor_assigned_at TIMESTAMPTZ,

  -- Proposal content (filled at proposal stage)
  title TEXT NOT NULL,
  summary TEXT,
  problem_statement TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Visibility & state
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,  -- visible within institution
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_coe_projects_institution ON coe_projects(institution_id);
CREATE INDEX idx_coe_projects_stage ON coe_projects(stage);
CREATE INDEX idx_coe_projects_trajectory ON coe_projects(trajectory);
CREATE INDEX idx_coe_projects_academic_year ON coe_projects(academic_year);
CREATE INDEX idx_coe_projects_mentor ON coe_projects(mentor_id);
CREATE INDEX idx_coe_projects_parent ON coe_projects(parent_project_id);
CREATE INDEX idx_coe_projects_origin_type ON coe_projects(origin_type);
CREATE INDEX idx_coe_projects_proposed_by ON coe_projects(proposed_by);
```

### Table 2: `coe_trajectory_assessments` — 5-Criteria Rubric

The CoE policy scoring rubric that determines project trajectory.

```sql
CREATE TABLE coe_trajectory_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES coe_projects(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id),

  -- 5 criteria from CoE policy (each 1-5)
  market_potential INTEGER CHECK (market_potential BETWEEN 1 AND 5),
  scalability INTEGER CHECK (scalability BETWEEN 1 AND 5),
  innovativeness INTEGER CHECK (innovativeness BETWEEN 1 AND 5),
  feasibility INTEGER CHECK (feasibility BETWEEN 1 AND 5),
  societal_impact INTEGER CHECK (societal_impact BETWEEN 1 AND 5),

  -- Auto-computed total (max 25)
  total_score INTEGER GENERATED ALWAYS AS (
    COALESCE(market_potential, 0) + COALESCE(scalability, 0) +
    COALESCE(innovativeness, 0) + COALESCE(feasibility, 0) +
    COALESCE(societal_impact, 0)
  ) STORED,

  -- Trajectory decision
  recommended_trajectory TEXT CHECK (recommended_trajectory IN ('solution', 'startup', 'research')),
  final_trajectory TEXT CHECK (final_trajectory IN ('solution', 'startup', 'research')),
  decision_rationale TEXT,

  -- Assessor
  assessed_by UUID REFERENCES profiles(id),
  assessed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Committee review link (FK added via ALTER TABLE after coe_committee_reviews is created)
  committee_review_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coe_trajectory_project ON coe_trajectory_assessments(project_id);

-- Add FK after coe_committee_reviews table exists
ALTER TABLE coe_trajectory_assessments
  ADD CONSTRAINT fk_trajectory_committee_review
  FOREIGN KEY (committee_review_id) REFERENCES coe_committee_reviews(id);
```

**Trajectory Decision Logic (from policy):**
- High feasibility + high societal_impact, lower scalability/innovativeness -> **Solution** (JICATE)
- High market_potential + high scalability + high innovativeness -> **Startup** (NLB)
- High innovativeness, lower feasibility/market_potential -> **Research** (Academic)

### Table 3: `coe_project_stage_history` — Audit Trail

```sql
CREATE TABLE coe_project_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES coe_projects(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id),  -- denormalized for direct RLS
  from_stage TEXT CHECK (from_stage IS NULL OR from_stage IN (
    'proposal', 'committee_review', 'orientation', 'empathize', 'define',
    'ideate', 'prototype', 'test', 'trajectory_assessment',
    'handover', 'completed', 'rejected'
  )),
  to_stage TEXT NOT NULL CHECK (to_stage IN (
    'proposal', 'committee_review', 'orientation', 'empathize', 'define',
    'ideate', 'prototype', 'test', 'trajectory_assessment',
    'handover', 'completed', 'rejected'
  )),
  changed_by UUID REFERENCES profiles(id),
  change_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coe_stage_history_project ON coe_project_stage_history(project_id);
CREATE INDEX idx_coe_stage_history_institution ON coe_project_stage_history(institution_id);
```

### Table 4: `coe_incentive_ledger` — Milestone-Based Incentives

Tracks all CoE policy incentives: attendance relaxation, CIA bonus, presentation sponsorship, recognition, IP rights, revenue sharing. Attendance and CIA incentives are **auto-generated** by the system when milestones are reached.

```sql
CREATE TABLE coe_incentive_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES coe_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  incentive_type TEXT NOT NULL CHECK (incentive_type IN (
    'attendance_relaxation',     -- 2-10% per policy milestone table
    'cia_bonus',                 -- 0-25% of CIA marks
    'presentation_sponsorship',  -- Conference registration/travel
    'recognition',               -- Certificates, website feature
    'ip_rights',                 -- 60/40 Learning Facilitator/Institution
    'revenue_share',             -- 60/40 on commercialization profits
    'subject_topper_contribution', -- 10-30% per milestone
    'best_outgoing_contribution',  -- 5-15% per milestone
    'other'
  )),

  -- Which milestone triggered this
  milestone_stage TEXT NOT NULL,
  -- e.g., 'proposal_submitted', 'prototype_developed', 'incubation_accepted',
  --       'publication_accepted', 'solution_implemented'

  -- Values
  value_numeric NUMERIC(10,2) CHECK (value_numeric IS NULL OR value_numeric >= 0),
  value_text TEXT,               -- e.g., "IEEE Conference 2026 — full sponsorship"

  -- Recipient type
  recipient_role TEXT NOT NULL DEFAULT 'learner'
    CHECK (recipient_role IN ('learner', 'facilitator')),

  -- Approval workflow
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'auto_approved', 'approved', 'granted', 'revoked')),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,

  -- Separation of duties: beneficiary cannot approve their own incentive
  CONSTRAINT no_self_approval CHECK (approved_by IS NULL OR approved_by != user_id),

  -- For auto-applied incentives
  auto_applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,

  -- Evidence
  evidence_url TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coe_incentive_project ON coe_incentive_ledger(project_id);
CREATE INDEX idx_coe_incentive_user ON coe_incentive_ledger(user_id);
CREATE INDEX idx_coe_incentive_status ON coe_incentive_ledger(status);
CREATE INDEX idx_coe_incentive_type ON coe_incentive_ledger(incentive_type);

-- Prevent duplicate incentives for the same milestone
CREATE UNIQUE INDEX idx_coe_incentive_unique_milestone
  ON coe_incentive_ledger(project_id, user_id, incentive_type, milestone_stage);
```

**Incentive Values from Policy:**

| Milestone | Attendance | CIA Bonus | Subject Topper | Best Outgoing |
|-----------|-----------|-----------|----------------|---------------|
| Proposal submitted | 2% | 0% | 10% | 5% |
| Prototype developed | 5% | 2% | 20% | 10% |
| Incubation accepted | 10% | 25% | 30% | 15% |
| Publication accepted | 10% | 5% | 20% | 10% |
| Solution implemented | 10% | 20% | 20% | 10% |

**Automation Logic:**
- **Attendance relaxation**: When a milestone stage is reached, auto-create a ledger entry with `auto_applied: true`, then update the `student_attendance` system's exemption data. The attendance system uses JSONB — relaxation is applied as an `OnDuty`-equivalent percentage modifier.
- **CIA bonus**: When a milestone is reached AND `coe_cia_student_marks` has data for the student, auto-compute the bonus percentage and create a ledger entry. **Cap formula:** `effective_marks = min(marks_obtained + bonus_marks, max_marks)` — bonus can never push marks above max_marks.

**Milestone Types — Stage-Triggered vs External:**

| Milestone | Trigger | Method |
|-----------|---------|--------|
| `proposal_submitted` | Stage: `proposal` -> `committee_review` | `advanceStage()` (auto) |
| `prototype_developed` | Stage: -> `prototype` | `advanceStage()` (auto) |
| `incubation_accepted` | External: NIF/NLB acceptance | `recordExternalMilestone()` (manual) |
| `publication_accepted` | External: Journal/conference acceptance | `recordExternalMilestone()` (manual) |
| `solution_implemented` | External: JICATE deployment | `recordExternalMilestone()` (manual) |

Stage-triggered milestones are auto-processed by `advanceStage()`. External milestones happen post-trajectory in downstream systems (NLB, JICATE, publications) and require explicit `recordExternalMilestone()` calls by an admin with evidence (URL/document).

### Table 5: `coe_mentor_ratings` — Entrepreneurship Development Rating

The policy's "Learning Facilitator Entrepreneurship Development Rating System" — 5 criteria, 4-point scale (1=Not Yet Present, 2=Developing, 3=Established, 4=Exemplary).

```sql
CREATE TABLE coe_mentor_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES coe_projects(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES profiles(id),
  rated_by UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  -- 5 criteria from policy (1-4 scale)
  entrepreneurial_activity INTEGER CHECK (entrepreneurial_activity BETWEEN 1 AND 4),
  mentorship_utilization INTEGER CHECK (mentorship_utilization BETWEEN 1 AND 4),
  training_attendance INTEGER CHECK (training_attendance BETWEEN 1 AND 4),
  ip_creation INTEGER CHECK (ip_creation BETWEEN 1 AND 4),
  institutional_recognition INTEGER CHECK (institutional_recognition BETWEEN 1 AND 4),

  -- Auto-computed
  total_score INTEGER GENERATED ALWAYS AS (
    COALESCE(entrepreneurial_activity, 0) + COALESCE(mentorship_utilization, 0) +
    COALESCE(training_attendance, 0) + COALESCE(ip_creation, 0) +
    COALESCE(institutional_recognition, 0)
  ) STORED,

  rating_period TEXT,  -- e.g., 'Semester-1-2025-2026'
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coe_mentor_rating_mentor ON coe_mentor_ratings(mentor_id);
CREATE INDEX idx_coe_mentor_rating_project ON coe_mentor_ratings(project_id);

-- Prevent duplicate ratings from same rater for same mentor/project/period
CREATE UNIQUE INDEX idx_coe_mentor_rating_unique
  ON coe_mentor_ratings(project_id, mentor_id, rated_by, rating_period);
```

**Scale Definitions (from policy):**

| Criteria | 1 = Not Yet Present | 2 = Developing | 3 = Established | 4 = Exemplary |
|----------|----|----|----|----|
| Entrepreneurial Activity | No engagement | Interest shown, trainings attended | Solution-based project developed | Startup launched or funding secured |
| Mentorship Utilization | No mentor engagement | Mentor identified, beginning engagement | Regular interaction, applying advice | Active engagement, shares knowledge |
| Training Attendance | No programs attended | A few attended | Regular attendance, applies learnings | Contributes to programs, leads sessions |
| IP Creation | No IP or revenue | IP with commercialization potential | Patent filed or initial revenue | Successfully commercialized, significant revenue |
| Institutional Recognition | No recognition | Internal recognition | Institution-wide recognition | External recognition (media, awards) |

### Table 6: `coe_committee_reviews` — Approval Workflow

Required from Day 1 for learner-initiated proposal approval. Also used for trajectory reviews, handover approvals, and incentive grants.

```sql
CREATE TABLE coe_committee_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES coe_projects(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id),

  review_type TEXT NOT NULL CHECK (review_type IN (
    'proposal_review',     -- Initial project proposal (Day 1 — required)
    'trajectory_review',   -- Trajectory assessment decision
    'handover_review',     -- Cross-batch handover approval
    'incentive_review',    -- Incentive grant approval
    'milestone_review'     -- Periodic milestone check
  )),

  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'under_review', 'approved', 'rejected', 'revision_needed'
  )),

  -- Decision
  decision_summary TEXT,
  conditions TEXT,           -- conditions for approval
  rejection_reason TEXT,
  revision_feedback TEXT,    -- feedback when revision_needed

  -- Quorum & Voting Rules
  min_members INTEGER NOT NULL DEFAULT 3,      -- minimum committee size
  review_deadline TIMESTAMPTZ,                 -- 7 days from submission by default

  -- Submitter tracking (who initiated this review)
  submitted_by UUID REFERENCES profiles(id),  -- proposer for proposal_review, admin for others

  -- Timelines
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  review_started_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES profiles(id),

  -- Attachments
  attachments JSONB DEFAULT '[]',
  -- [{url, title, type}]

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coe_review_project ON coe_committee_reviews(project_id);
CREATE INDEX idx_coe_review_status ON coe_committee_reviews(status);
CREATE INDEX idx_coe_review_type ON coe_committee_reviews(review_type);
CREATE INDEX idx_coe_review_deadline ON coe_committee_reviews(review_deadline)
  WHERE status IN ('submitted', 'under_review');
```

**Committee Quorum & Voting Rules:**
- **Minimum members:** 3 (enforced at review creation — service rejects if fewer than 3 `committee_member_ids` provided)
- **Voting eligibility:** Only `chair` and `reviewer` roles can cast votes. `observer` is read-only.
- **Decision rule:** Majority of eligible voters (chair + reviewers) decides. If votes are tied, the chair's vote breaks the tie.
- **Review deadline:** Default 7 days from submission (`review_deadline = submitted_at + INTERVAL '7 days'`). Service sets this automatically.
- **Auto-escalation:** When `review_deadline` passes without a decision, the system sends a notification to admins and the committee chair. Reviews are NOT auto-approved — human decision is always required.
- **Quorum for decision:** A decision can only be finalized when a majority of eligible voters have voted (e.g., 2 of 3, 3 of 5). The `decided_by` user must be the chair or an admin.

### Table 7: `coe_committee_members` — Committee Composition

Separate table (not JSONB) for proper querying and RLS.

```sql
CREATE TABLE coe_committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES coe_committee_reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  role TEXT NOT NULL DEFAULT 'reviewer'
    CHECK (role IN ('chair', 'reviewer', 'observer')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,

  UNIQUE(review_id, user_id)
);

CREATE INDEX idx_coe_committee_member_review ON coe_committee_members(review_id);
CREATE INDEX idx_coe_committee_member_user ON coe_committee_members(user_id);
```

### Table 8: `coe_committee_votes` — Individual Votes

```sql
CREATE TABLE coe_committee_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES coe_committee_reviews(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES coe_committee_members(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject', 'abstain', 'revision_needed')),
  notes TEXT,
  voted_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(review_id, user_id),  -- one vote per member per review

  -- Observers cannot vote — enforced via RLS + service validation
  -- Service must verify: member.role IN ('chair', 'reviewer') before accepting vote
);

CREATE INDEX idx_coe_vote_review ON coe_committee_votes(review_id);
```

### Table 9: `coe_cia_configs` — Configurable CIA Structure Per College

Different colleges have different CIA/exam splits. This table defines the assessment structure per institution (or per department/program).

```sql
CREATE TABLE coe_cia_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  -- Scope: institution-wide default, or narrowed to department/program
  department_id UUID,   -- NULL = institution-wide default
  program_id UUID,      -- NULL = applies to all programs in department

  -- CIA structure
  name TEXT NOT NULL,               -- e.g., 'CIA-1', 'CIA-2', 'CIA-3'
  max_marks NUMERIC(6,2) NOT NULL,  -- e.g., 25.0, 30.0
  weightage_percent NUMERIC(5,2),   -- e.g., 40.0 means 40% of internal marks
  assessment_type TEXT NOT NULL DEFAULT 'written'
    CHECK (assessment_type IN ('written', 'practical', 'assignment', 'presentation', 'project', 'other')),

  -- Ordering
  sequence INTEGER NOT NULL DEFAULT 1,

  -- Active
  is_active BOOLEAN DEFAULT true,
  academic_year TEXT CHECK (academic_year IS NULL OR academic_year ~ '^\d{4}-\d{4}$'),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_coe_cia_config_institution ON coe_cia_configs(institution_id);
CREATE INDEX idx_coe_cia_config_dept ON coe_cia_configs(department_id);
CREATE UNIQUE INDEX idx_coe_cia_config_unique ON coe_cia_configs(institution_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid), name, COALESCE(academic_year, ''));
```

### Table 10: `coe_cia_student_marks` — Student CIA Scores

Minimal CIA tracker. Stores per-student, per-course, per-assessment marks. Used by incentive automation to compute CIA bonus.

```sql
CREATE TABLE coe_cia_student_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  student_id UUID NOT NULL REFERENCES profiles(id),
  config_id UUID NOT NULL REFERENCES coe_cia_configs(id),

  -- Course context
  course_id UUID,          -- links to academic course if available
  course_name TEXT,         -- fallback if no course_id
  semester TEXT,
  academic_year TEXT CHECK (academic_year IS NULL OR academic_year ~ '^\d{4}-\d{4}$'),

  -- Marks
  marks_obtained NUMERIC(6,2) CHECK (marks_obtained IS NULL OR marks_obtained >= 0),
  max_marks NUMERIC(6,2) NOT NULL,  -- denormalized from config for history
  CONSTRAINT valid_marks CHECK (marks_obtained IS NULL OR marks_obtained <= max_marks),

  -- CoE bonus applied (if any)
  -- DENORMALIZED CACHE — coe_incentive_ledger is the canonical source of truth for bonuses.
  -- This field is always recomputed from the ledger by CoeService.applyBonus().
  coe_bonus_percent NUMERIC(5,2) DEFAULT 0
    CHECK (coe_bonus_percent >= 0 AND coe_bonus_percent <= 100),
  coe_project_id UUID REFERENCES coe_projects(id),  -- which project earned the bonus

  -- Metadata
  assessed_by UUID REFERENCES profiles(id),
  assessed_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coe_cia_marks_student ON coe_cia_student_marks(student_id);
CREATE INDEX idx_coe_cia_marks_institution ON coe_cia_student_marks(institution_id);
CREATE INDEX idx_coe_cia_marks_config ON coe_cia_student_marks(config_id);
CREATE INDEX idx_coe_cia_marks_project ON coe_cia_student_marks(coe_project_id);
```

---

## RLS Template (All 10 Tables)

All 10 `coe_*` tables now have `institution_id` and use the same standard RLS pattern:

```sql
ALTER TABLE coe_<table> ENABLE ROW LEVEL SECURITY;

-- SELECT: institution-scoped + super_admin bypass
CREATE POLICY "coe_<table>_select" ON coe_<table>
  FOR SELECT TO authenticated USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Service role: full access (used by API routes via withAuth)
CREATE POLICY "coe_<table>_service" ON coe_<table>
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Per-Table Write Policies

In addition to the SELECT + service_role template above, each table needs role-appropriate write policies. **All write policies include an explicit `OR super_admin` bypass** per CLAUDE.md requirement: "super_admin always has FULL ACCESS."

```sql
-- ═══════════════════════════════════════════
-- coe_projects: Learners create proposals, admins/mentors update
-- ═══════════════════════════════════════════
CREATE POLICY "coe_projects_insert" ON coe_projects
  FOR INSERT TO authenticated WITH CHECK (
    (institution_id = auth_institution_id() AND proposed_by = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- SECURITY: Proposer can ONLY edit in 'proposal' (draft) stage. Locked once in committee_review or later.
CREATE POLICY "coe_projects_update" ON coe_projects
  FOR UPDATE TO authenticated USING (
    (
      institution_id = auth_institution_id()
      AND (
        (proposed_by = auth.uid() AND stage = 'proposal')  -- proposer: draft only
        OR mentor_id = auth.uid()  -- mentor can update mentee project
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- DELETE: admin-only (soft-delete via is_active preferred)
CREATE POLICY "coe_projects_delete" ON coe_projects
  FOR DELETE TO authenticated USING (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ═══════════════════════════════════════════
-- coe_trajectory_assessments: Committee members, mentors, or admins only
-- SECURITY: Restricted to prevent any institution user from submitting assessments
-- ═══════════════════════════════════════════
CREATE POLICY "coe_trajectory_insert" ON coe_trajectory_assessments
  FOR INSERT TO authenticated WITH CHECK (
    (
      institution_id = auth_institution_id()
      AND assessed_by = auth.uid()
      AND (
        -- Must be: committee member for this project's review, OR mentor, OR admin
        EXISTS (SELECT 1 FROM coe_committee_members cm
          JOIN coe_committee_reviews cr ON cr.id = cm.review_id
          WHERE cr.project_id = coe_trajectory_assessments.project_id
          AND cm.user_id = auth.uid() AND cm.role IN ('chair', 'reviewer'))
        OR EXISTS (SELECT 1 FROM coe_projects WHERE id = coe_trajectory_assessments.project_id AND mentor_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ═══════════════════════════════════════════
-- coe_project_stage_history: SERVICE_ROLE ONLY (immutable audit trail)
-- SECURITY: No authenticated INSERT — prevents fake audit trail entries.
-- All stage history is created via advanceStage() service method (service_role).
-- ═══════════════════════════════════════════
-- No authenticated INSERT/UPDATE/DELETE policies. service_role handles all writes.

-- ═══════════════════════════════════════════
-- coe_incentive_ledger: Auto-applied by service, manual by admin
-- ═══════════════════════════════════════════
CREATE POLICY "coe_incentive_insert" ON coe_incentive_ledger
  FOR INSERT TO authenticated WITH CHECK (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
-- Note: auto_applied incentives are created via service_role, not authenticated

CREATE POLICY "coe_incentive_update" ON coe_incentive_ledger
  FOR UPDATE TO authenticated USING (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ═══════════════════════════════════════════
-- coe_mentor_ratings: Only team members or admins can rate
-- SECURITY: Prevents unrelated users from rating mentors they never worked with
-- ═══════════════════════════════════════════
CREATE POLICY "coe_mentor_ratings_insert" ON coe_mentor_ratings
  FOR INSERT TO authenticated WITH CHECK (
    (
      institution_id = auth_institution_id()
      AND rated_by = auth.uid()
      AND (
        -- Must be a team member of the project OR admin
        EXISTS (SELECT 1 FROM ss_team_members tm
          JOIN coe_projects p ON p.team_id = tm.team_id
          WHERE p.id = coe_mentor_ratings.project_id AND tm.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM coe_projects WHERE id = coe_mentor_ratings.project_id AND proposed_by = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ═══════════════════════════════════════════
-- coe_committee_reviews: Admin/staff creates; chair/admin finalizes
-- ═══════════════════════════════════════════
CREATE POLICY "coe_reviews_insert" ON coe_committee_reviews
  FOR INSERT TO authenticated WITH CHECK (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- SECURITY: decided_by is validated against actual role, NOT self-referencing.
-- Only the chair of this review OR an admin can finalize decisions.
CREATE POLICY "coe_reviews_update" ON coe_committee_reviews
  FOR UPDATE TO authenticated USING (
    (
      institution_id = auth_institution_id()
      AND (
        EXISTS (SELECT 1 FROM coe_committee_members
          WHERE review_id = coe_committee_reviews.id AND user_id = auth.uid() AND role = 'chair')
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ═══════════════════════════════════════════
-- coe_committee_members: Admin assigns; membership frozen once voting starts
-- ═══════════════════════════════════════════
CREATE POLICY "coe_members_insert" ON coe_committee_members
  FOR INSERT TO authenticated WITH CHECK (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
      -- SECURITY: Cannot add members after voting has started
      AND NOT EXISTS (SELECT 1 FROM coe_committee_votes WHERE review_id = coe_committee_members.review_id)
      -- SECURITY: Cannot add the project's proposer as a committee member
      AND NOT EXISTS (
        SELECT 1 FROM coe_committee_reviews cr
        JOIN coe_projects p ON p.id = cr.project_id
        WHERE cr.id = coe_committee_members.review_id AND p.proposed_by = coe_committee_members.user_id
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ═══════════════════════════════════════════
-- coe_committee_votes: Chair/reviewer can vote; proposer-voter separation enforced
-- ═══════════════════════════════════════════
CREATE POLICY "coe_votes_insert" ON coe_committee_votes
  FOR INSERT TO authenticated WITH CHECK (
    (
      institution_id = auth_institution_id()
      AND user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM coe_committee_members
        WHERE review_id = coe_committee_votes.review_id
          AND user_id = auth.uid()
          AND role IN ('chair', 'reviewer')  -- observers cannot vote
      )
      -- SECURITY: Proposer cannot vote on their own proposal
      AND NOT EXISTS (
        SELECT 1 FROM coe_committee_reviews cr
        JOIN coe_projects p ON p.id = cr.project_id
        WHERE cr.id = coe_committee_votes.review_id
        AND p.proposed_by = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- SECURITY: Votes can be updated ONLY before the review is finalized (allows correction).
-- Once review status is approved/rejected/revision_needed, votes are locked.
CREATE POLICY "coe_votes_update" ON coe_committee_votes
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM coe_committee_reviews
      WHERE id = coe_committee_votes.review_id
      AND status IN ('submitted', 'under_review')  -- not yet finalized
    )
  );

-- ═══════════════════════════════════════════
-- coe_cia_configs: Admin-only CRUD
-- ═══════════════════════════════════════════
CREATE POLICY "coe_cia_configs_insert" ON coe_cia_configs
  FOR INSERT TO authenticated WITH CHECK (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "coe_cia_configs_update" ON coe_cia_configs
  FOR UPDATE TO authenticated USING (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "coe_cia_configs_delete" ON coe_cia_configs
  FOR DELETE TO authenticated USING (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ═══════════════════════════════════════════
-- coe_cia_student_marks: Staff/admin records marks
-- ═══════════════════════════════════════════
CREATE POLICY "coe_cia_marks_insert" ON coe_cia_student_marks
  FOR INSERT TO authenticated WITH CHECK (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "coe_cia_marks_update" ON coe_cia_student_marks
  FOR UPDATE TO authenticated USING (
    (institution_id = auth_institution_id()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

**Immutable tables (service_role only for writes):**
- `coe_project_stage_history` — audit trail, no authenticated writes
- `coe_committee_votes` — no DELETE for any role (even service_role should avoid deletes)

**Service_role restrictions (recommended at implementation):**
- `coe_committee_votes`: restrict service_role to SELECT + INSERT only (no UPDATE/DELETE) to enforce vote immutability
- `coe_project_stage_history`: restrict service_role to SELECT + INSERT only

**All write policies include super_admin bypass via `OR EXISTS (... role = 'super_admin')`.** The `service_role` policy (from template) covers all automated operations (incentive auto-apply, stage history logging).

**Public visibility note:** All `coe_projects` with `is_public = true` are visible to any authenticated user within the same institution. The standard institution RLS handles this — no special policy needed. The `is_public` flag is for future use if project owners want to make a project private.

---

## Role-Based Views

Three roles use the system equally but see different things:

### Learner View
- **My Projects**: Projects I proposed or am a team member of
- **Explore**: All public CoE projects in my institution (peer motivation)
- **Propose**: Submit new project proposal (main CTA for learners)
- **My Incentives**: Attendance relaxation and CIA bonuses earned
- **Stage Progress**: Visual timeline of where my project is

### Facilitator (Mentor) View
- **My Mentees**: Projects assigned to me as mentor
- **Review Queue**: Committee reviews waiting for my vote
- **Rate**: Rate learner teams on entrepreneurship development criteria
- **All Projects**: Browse all institution CoE projects
- **My Ratings**: See ratings others have given me

### Admin View
- **Dashboard**: Projects by stage funnel, trajectory distribution, incentive totals
- **All Projects**: Full list with all filters (stage, trajectory, year, mentor)
- **Committee Management**: Create reviews, assign committee members, finalize decisions
- **Incentive Queue**: Pending incentives requiring manual approval
- **CIA Config**: Configure assessment structure per college/department
- **Handover**: Manage cross-batch version chains

---

## API Routes

All under `/api/startup-studio/coe/`, following existing pattern: `withAuth` + `CoeService` + `corsHeaders` + `OPTIONS`.

### Phase 1 Routes (9 files)

| Route | Methods | Purpose |
|-------|---------|---------|
| `coe/projects/route.ts` | GET, POST | List (filterable: stage, trajectory, year, mentor, origin_type) + Create proposal |
| `coe/projects/[id]/route.ts` | GET, PATCH, DELETE | Single project CRUD with joined cycle/team/assessments |
| `coe/projects/[id]/advance/route.ts` | POST | Advance stage (validates allowed transitions) |
| `coe/projects/[id]/trajectory/route.ts` | POST | Submit trajectory assessment with 5-criteria scores |
| `coe/projects/[id]/history/route.ts` | GET | Stage transition audit trail |
| `coe/projects/[id]/reviews/route.ts` | GET, POST | List + create committee reviews |
| `coe/projects/[id]/reviews/[reviewId]/route.ts` | PATCH | Update review decision (approve/reject/revision) |
| `coe/projects/[id]/reviews/[reviewId]/vote/route.ts` | POST | Submit individual committee vote |
| `coe/analytics/route.ts` | GET | Dashboard: projects by stage, trajectory distribution, incentive totals |

### Phase 2 Routes (5 files)

| Route | Methods | Purpose |
|-------|---------|---------|
| `coe/projects/[id]/incentives/route.ts` | GET, POST | List + create incentive entries |
| `coe/cia/configs/route.ts` | GET, POST | List + create CIA configs (admin only) |
| `coe/cia/configs/[id]/route.ts` | PATCH, DELETE | Update/delete CIA config |
| `coe/cia/marks/route.ts` | GET, POST | List + record student CIA marks |
| `coe/cia/marks/[id]/route.ts` | PATCH | Update mark entry |

### Phase 3 Routes (3 files)

| Route | Methods | Purpose |
|-------|---------|---------|
| `coe/projects/[id]/mentor-rating/route.ts` | GET, POST | List + create mentor ratings |
| `coe/projects/[id]/handover/route.ts` | POST | Create V(n+1) project linked to parent |
| `coe/handover/chains/route.ts` | GET | List all V1->V2->V3 chains |

**Total: 17 new route files.**

---

## Pages

All under `/startup-studio/coe/`.

### Phase 1 Pages (5)

| Route | Purpose | Primary Role |
|-------|---------|-------------|
| `/startup-studio/coe` | CoE Dashboard: project funnel, trajectory chart, mentor load, year filter | Admin |
| `/startup-studio/coe/projects` | Project list: table with stage/trajectory/year/mentor filters. Public within institution. | All |
| `/startup-studio/coe/projects/[id]` | Project detail: linked cycle data, stage timeline, trajectory assessment, downstream entity links | All |
| `/startup-studio/coe/projects/new` | Propose: submit project idea (title, summary, problem, origin selection, team) | Learner |
| `/startup-studio/coe/reviews` | Committee reviews: pending queue, review history, vote tracking | Facilitator/Admin |

### Phase 2 Pages (2)

| Route | Purpose | Primary Role |
|-------|---------|-------------|
| `/startup-studio/coe/incentives` | Incentive ledger: all incentives across projects, approval queue for admins | Admin/Learner |
| `/startup-studio/coe/cia` | CIA config + marks: configure assessments per college, enter/view student marks | Admin |

### Phase 3 Pages (2)

| Route | Purpose | Primary Role |
|-------|---------|-------------|
| `/startup-studio/coe/mentor-ratings` | Mentor rating dashboard: submit and view ratings | Facilitator/Learner |
| `/startup-studio/coe/handover` | Handover dashboard: V1->V2->V3 chains, upcoming handovers, year transitions | Admin |

**Total: 9 new pages.**

---

## Service & Hooks

### `lib/services/startup-studio/coe-service.ts`

Extends `BaseService`, follows `CyclesService` pattern exactly.

**Methods:**
- `getProjects(filters)` — paginated list with joins to cycles, teams, mentors, assessments. Respects `is_public` for institution-wide listing.
- `getProjectById(id)` — full detail with all nested data
- `createProject(input)` — creates proposal as draft with `stage: 'proposal'`. Does NOT create a committee review — the learner edits freely until they explicitly submit.
- `submitForReview(projectId)` — transitions from `proposal` to `committee_review`, auto-creates a `coe_committee_reviews` record of type `proposal_review` with `review_deadline` set to 7 days from now. Only the proposer can call this.
- `updateProject(id, data)` — update metadata/mentor/tags. Proposer can edit freely while in `proposal` (draft) stage. Locked once in `committee_review` or later.
- `advanceStage(id, toStage, reason)` — validates transition + creates history + triggers incentive automation
- `submitTrajectoryAssessment(projectId, scores)` — saves rubric, computes recommendation
- `createHandover(projectId, { new_proposed_by, new_team_id? })` — requires new proposer/team. Spawns V(n+1) after committee handover_review approval. See Handover Logic section for two-step flow.
- `getIncentives(projectId)` / `createIncentive(data)` — incentive CRUD
- `autoApplyIncentives(projectId, milestone)` — auto-generate attendance + CIA incentives (called internally by advanceStage)
- `recordExternalMilestone(projectId, milestone, evidence)` — for post-trajectory milestones that are NOT stage transitions (see table below). Creates incentive ledger entries for all team members. Requires admin role.
- `getReviews(projectId)` / `createReview(data)` / `updateReview(id, decision)` — review workflow
- `submitVote(reviewId, userId, vote)` — individual committee vote
- `rateMentor(data)` / `getMentorRatings(projectId)` — mentor assessment
- `getStageHistory(projectId)` — audit trail
- `getAnalytics(filters)` — dashboard aggregations

### `lib/services/startup-studio/coe-cia-service.ts`

Separate service for CIA operations.

**Methods:**
- `getConfigs(institutionId, departmentId?)` — list CIA configs
- `createConfig(data)` / `updateConfig(id, data)` / `deleteConfig(id)` — CRUD
- `getStudentMarks(filters)` — list marks with config joins
- `recordMarks(data)` — save student CIA marks
- `computeCoeBonus(studentId, projectId)` — calculate CIA bonus based on project milestone + student marks
- `applyBonus(markId, bonusPercent, projectId)` — apply bonus to marks entry. **Cap formula:** `effective_marks = min(marks_obtained + (max_marks * bonusPercent / 100), max_marks)`. Bonus can increase marks but never exceed max_marks.

### `hooks/startup-studio/use-coe.ts`

React Query hooks calling `apiClient` to `/api/startup-studio/coe/*`:

- `useCoeProjects(filters)` / `useCoeProject(id)` / `useCreateCoeProject()`
- `useSubmitForReview(projectId)` — mutation: transitions proposal to committee_review
- `useAdvanceCoeStage()` — mutation with optimistic update
- `useCoeTrajectoryAssessment(projectId)` / `useSubmitTrajectory()`
- `useCoeIncentives(projectId)` / `useCreateIncentive()`
- `useCoeReviews(projectId)` / `useCreateReview()` / `useUpdateReview()`
- `useSubmitVote()` — committee vote mutation
- `useCoeMentorRatings(projectId)` / `useRateMentor()`
- `useCoeHandover()` — mutation (requires `{ new_proposed_by, new_team_id? }` — no orphan V2 projects)
- `useCoeAnalytics(filters)`

### `hooks/startup-studio/use-coe-cia.ts`

- `useCiaConfigs(institutionId)` / `useCreateCiaConfig()` / `useUpdateCiaConfig()`
- `useCiaStudentMarks(filters)` / `useRecordCiaMarks()`

---

## TypeScript Types

Added to `types/startup-studio/index.ts`:

**PostgREST/Supabase gotcha:** `NUMERIC` columns (marks, percentages, value_numeric) are returned as **strings** by PostgREST. The service layer must `parseFloat()` these before returning to hooks. `INTEGER` columns (scores 1-5, 1-4) are returned as numbers natively — no conversion needed. The types below reflect the **post-conversion** shape (all numbers), but the service must handle the string-to-number conversion.

```typescript
// ═══════════════════════════════════════════
// CoE — Centre of Excellence Types
// ═══════════════════════════════════════════

// CoE Enums
export type CoeStage =
  | 'proposal' | 'committee_review'
  | 'orientation' | 'empathize' | 'define' | 'ideate'
  | 'prototype' | 'test' | 'trajectory_assessment'
  | 'handover' | 'completed' | 'rejected';

export type CoeOriginType = 'cycle' | 'submission' | 'fresh' | 'handover';

export type CoeTrajectory = 'solution' | 'startup' | 'research';
// NULL on coe_projects.trajectory means "not yet decided"
// No explicit 'undecided' value — NULL serves this purpose

export type CoeIncentiveType =
  | 'attendance_relaxation' | 'cia_bonus' | 'presentation_sponsorship'
  | 'recognition' | 'ip_rights' | 'revenue_share'
  | 'subject_topper_contribution' | 'best_outgoing_contribution' | 'other';

export type CoeIncentiveStatus = 'pending' | 'auto_approved' | 'approved' | 'granted' | 'revoked';

export type CoeReviewType =
  | 'proposal_review' | 'trajectory_review' | 'handover_review'
  | 'incentive_review' | 'milestone_review';

export type CoeReviewStatus =
  | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'revision_needed';

export type CoeVote = 'approve' | 'reject' | 'abstain' | 'revision_needed';

export type CoeMentorScale = 1 | 2 | 3 | 4;

export type CoeCommitteeRole = 'chair' | 'reviewer' | 'observer';

export type CiaConfigAssessmentType = 'written' | 'practical' | 'assignment' | 'presentation' | 'project' | 'other';

// CoE Interfaces
export interface CoeProject {
  id: string;
  institution_id: string;
  origin_type: CoeOriginType;
  origin_cycle_id: string | null;
  origin_submission_id: string | null;
  team_id: string | null;
  proposed_by: string;
  stage: CoeStage;
  stage_entered_at: string;
  trajectory: CoeTrajectory | null;
  trajectory_decided_at: string | null;
  sh_solution_id: string | null;
  nif_candidate_id: string | null;
  research_topic_id: string | null;
  sh_product_id: string | null;
  version: number;
  parent_project_id: string | null;
  academic_year: string | null;
  mentor_id: string | null;
  mentor_assigned_at: string | null;
  title: string;
  summary: string | null;
  problem_statement: string | null;
  tags: string[];
  is_active: boolean;
  is_public: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined
  cycle?: SSCycleWithSteps;
  team?: SSTeam;
  mentor?: { id: string; full_name: string };
  proposer?: { id: string; full_name: string };
  assessments?: CoeTrajectoryAssessment[];
  incentives?: CoeIncentive[];
  reviews?: CoeCommitteeReview[];
}

export interface CoeTrajectoryAssessment {
  id: string;
  project_id: string;
  institution_id: string;
  market_potential: number | null;
  scalability: number | null;
  innovativeness: number | null;
  feasibility: number | null;
  societal_impact: number | null;
  total_score: number;
  recommended_trajectory: CoeTrajectory | null;
  final_trajectory: CoeTrajectory | null;
  decision_rationale: string | null;
  assessed_by: string | null;
  assessed_at: string;
  committee_review_id: string | null;
  created_at: string;
}

export interface CoeIncentive {
  id: string;
  project_id: string;
  user_id: string;
  institution_id: string;
  incentive_type: CoeIncentiveType;
  milestone_stage: string;
  value_numeric: number | null;
  value_text: string | null;
  recipient_role: 'learner' | 'facilitator';
  status: CoeIncentiveStatus;
  approved_by: string | null;
  approved_at: string | null;
  auto_applied: boolean;
  applied_at: string | null;
  evidence_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoeMentorRating {
  id: string;
  project_id: string;
  mentor_id: string;
  rated_by: string;
  institution_id: string;
  entrepreneurial_activity: CoeMentorScale | null;
  mentorship_utilization: CoeMentorScale | null;
  training_attendance: CoeMentorScale | null;
  ip_creation: CoeMentorScale | null;
  institutional_recognition: CoeMentorScale | null;
  total_score: number;
  rating_period: string | null;
  comments: string | null;
  created_at: string;
}

export interface CoeCommitteeReview {
  id: string;
  project_id: string;
  institution_id: string;
  review_type: CoeReviewType;
  status: CoeReviewStatus;
  min_members: number;
  review_deadline: string | null;
  decision_summary: string | null;
  conditions: string | null;
  rejection_reason: string | null;
  revision_feedback: string | null;
  submitted_by: string | null;  // who initiated this review
  submitted_at: string;
  review_started_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  attachments: Array<{ url: string; title: string; type: string }>;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  members?: CoeCommitteeMember[];
  votes?: CoeCommitteeVoteRecord[];
  submitter?: { id: string; full_name: string };
  decider?: { id: string; full_name: string };
}

export interface CoeCommitteeMember {
  id: string;
  review_id: string;
  user_id: string;
  institution_id: string;
  role: CoeCommitteeRole;
  invited_at: string;
  responded_at: string | null;
  // Joined
  user?: { id: string; full_name: string; role: string };
}

export interface CoeCommitteeVoteRecord {
  id: string;
  review_id: string;
  member_id: string;
  user_id: string;
  institution_id: string;
  vote: CoeVote;
  notes: string | null;
  voted_at: string;
}

export interface CoeStageHistoryEntry {
  id: string;
  project_id: string;
  institution_id: string;
  from_stage: CoeStage | null;
  to_stage: CoeStage;
  changed_by: string | null;
  change_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// CIA Types
export interface CoeCiaConfig {
  id: string;
  institution_id: string;
  department_id: string | null;
  program_id: string | null;
  name: string;
  max_marks: number;
  weightage_percent: number | null;
  assessment_type: CiaConfigAssessmentType;
  sequence: number;
  is_active: boolean;
  academic_year: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CoeCiaStudentMark {
  id: string;
  institution_id: string;
  student_id: string;
  config_id: string;
  course_id: string | null;
  course_name: string | null;
  semester: string | null;
  academic_year: string | null;
  marks_obtained: number | null;
  max_marks: number;
  coe_bonus_percent: number;
  coe_project_id: string | null;
  assessed_by: string | null;
  assessed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  config?: CoeCiaConfig;
  project?: { id: string; title: string };
  student?: { id: string; full_name: string };
}

// Filter & Input types
export interface CoeProjectFilters extends PaginationParams {
  stage?: CoeStage;
  trajectory?: CoeTrajectory;
  academic_year?: string;
  mentor_id?: string;
  origin_type?: CoeOriginType;
  is_active?: boolean;
  search?: string;
}

// proposed_by and institution_id are injected by the service from auth context — not user-supplied
export interface CreateCoeProjectInput {
  title: string;
  summary?: string;
  problem_statement?: string;
  origin_type: CoeOriginType;
  origin_cycle_id?: string;
  origin_submission_id?: string;
  team_id?: string;
  mentor_id?: string;
  academic_year?: string;
  tags?: string[];
  parent_project_id?: string; // for versioning
}

export interface TrajectoryAssessmentInput {
  market_potential: number;
  scalability: number;
  innovativeness: number;
  feasibility: number;
  societal_impact: number;
  recommended_trajectory: CoeTrajectory;
  final_trajectory?: CoeTrajectory;
  decision_rationale?: string;
}

// institution_id injected by the service from auth context
export interface CreateCoeIncentiveInput {
  user_id: string;
  incentive_type: CoeIncentiveType;
  milestone_stage: string;
  value_numeric?: number;
  value_text?: string;
  recipient_role: 'learner' | 'facilitator';
  evidence_url?: string;
  notes?: string;
}

export interface CreateCoeReviewInput {
  review_type: CoeReviewType;
  committee_members: Array<{
    user_id: string;
    role: CoeCommitteeRole;  // 'chair' | 'reviewer' | 'observer'
  }>;  // at least one must be 'chair'
  notes?: string;
  attachments?: Array<{ url: string; title: string; type: string }>;
}

export interface CoeVoteInput {
  vote: CoeVote;
  notes?: string;
}

export interface CiaConfigInput {
  name: string;
  max_marks: number;
  weightage_percent?: number;
  assessment_type: CiaConfigAssessmentType;
  department_id?: string;
  program_id?: string;
  sequence?: number;
  academic_year?: string;
}

// max_marks is auto-populated from the referenced config_id by the service
// institution_id injected from auth context
export interface CiaMarkInput {
  student_id: string;
  config_id: string;
  course_id?: string;
  course_name?: string;
  semester?: string;
  academic_year?: string;
  marks_obtained: number;
}

// Input for recording post-trajectory external milestones (admin only)
export interface RecordExternalMilestoneInput {
  milestone: 'incubation_accepted' | 'publication_accepted' | 'solution_implemented';
  evidence: {
    url: string;
    title: string;
    description?: string;
  };
}

// Input for initiating handover (Step 2 of handover flow)
export interface CreateHandoverInput {
  new_proposed_by: string;  // user_id of V(n+1) proposer — required, no orphan projects
  new_team_id?: string;     // team_id for V(n+1) — optional, can be formed later
}

// Filters for incentive queries
export interface CoeIncentiveFilters extends PaginationParams {
  incentive_type?: CoeIncentiveType;
  status?: CoeIncentiveStatus;
  recipient_role?: 'learner' | 'facilitator';
  user_id?: string;
  project_id?: string;
}
```

---

## Stage Transition Rules

Valid transitions (enforced in `CoeService.advanceStage`):

```
proposal            -> committee_review
committee_review    -> orientation      (only if review approved)
committee_review    -> proposal         (if revision_needed — loops back)
committee_review    -> rejected         (if review rejected — terminal state)
orientation         -> empathize
empathize           -> define
define              -> ideate
ideate              -> prototype
prototype           -> test
test                -> trajectory_assessment
trajectory_assessment -> handover | completed
handover            -> completed
```

No other backward transitions. The `committee_review -> proposal` loop is the only exception — it allows learners to revise and resubmit. The `committee_review -> rejected` transition is terminal — the project is archived and cannot be reactivated.

**Incentive automation triggers:** When `advanceStage` moves a project to a new stage, check if that stage matches a milestone in the policy table. If yes, auto-create incentive ledger entries for all team members.

**Auto-cycle creation for fresh proposals:** When transitioning from `committee_review` to `orientation` for projects with `origin_type = 'fresh'`, the service auto-creates an `ss_cycle` record and links it via `origin_cycle_id`. The `origin_type` remains `'fresh'` (preserving provenance), but the cycle is created for tracking design thinking steps. This is why the `origin_fk_consistency` constraint allows `origin_type = 'fresh'` with a non-NULL `origin_cycle_id`.

---

## Handover Logic

Handover is a **two-step process** with a documentation/preparation window between steps:

### Step 1: Advance to Handover Stage
`CoeService.advanceStage(projectId, 'handover')` — called from `trajectory_assessment` stage. This:
1. Validates transition is allowed (`trajectory_assessment -> handover`)
2. Creates stage history entry
3. Triggers milestone incentives for the handover stage
4. The project is now in `handover` stage — a preparation window for documentation, knowledge transfer, and identifying the next batch's team

### Step 2: Execute Handover
`CoeService.createHandover(projectId, { new_proposed_by, new_team_id })` — called when ready to spawn V(n+1):

1. Validate current project is at `handover` stage (NOT trajectory_assessment — must have gone through Step 1)
2. Validate `new_proposed_by` is provided (no orphan V2 projects — a new proposer/team must be specified)
3. Create a committee review of type `handover_review`
4. After committee approval, create new `coe_projects` row with:
   - `parent_project_id` = current project ID
   - `version` = current.version + 1
   - `academic_year` = next academic year
   - `proposed_by` = `new_proposed_by` (new batch lead)
   - `team_id` = `new_team_id` (new batch team, if provided)
   - `stage` = 'orientation' (fresh start for new batch)
   - `origin_type` = 'fresh' (new batch starts fresh)
   - `origin_cycle_id` = NULL (new batch creates their own cycle at orientation)
   - Copies: title, summary, tags, trajectory, downstream links
5. Mark current project as `completed`
6. Log in `coe_project_stage_history` for both projects

---

## Attendance Integration

**How auto-relaxation works:**

1. When a CoE project reaches a milestone stage (e.g., `prototype`), the incentive automation creates an `attendance_relaxation` ledger entry with `auto_applied: true` and `value_numeric: 5.0` (5%).
2. The system does NOT modify `student_attendance` records directly (they're JSONB and complex).
3. Instead, the `coe_incentive_ledger` serves as the source of truth for relaxation percentages.
4. The attendance reporting/dashboard services read `coe_incentive_ledger` to adjust effective attendance percentages when computing compliance.
5. **Integration point:** `attendance-report-service.ts` will be modified to check `coe_incentive_ledger` for active `attendance_relaxation` entries and subtract them from the minimum attendance threshold (e.g., if policy requires 75% and student has 5% relaxation, threshold becomes 70%).

This is a **read-only integration** — CoE never writes to attendance tables, it only provides relaxation data that the attendance reporting layer consumes.

---

## What We Reuse (NOT Rebuild)

| Existing Module | How CoE Uses It |
|----------------|-----------------|
| `ss_cycles` (8 steps) | `coe_projects.origin_cycle_id` — cycle-sourced projects wrap a cycle |
| `ss_appathon_submissions` | `coe_projects.origin_submission_id` — Appathon winners can become CoE projects |
| `ss_teams` + `ss_team_members` | `coe_projects.team_id` — teams are shared |
| `ss_problem_bank` | Problems from CoE cycles feed the bank |
| `ss_nif_candidates` | Startup-track projects -> NIF pipeline |
| `ss_events` + Appathon | CoE events use existing event infra |
| `sh_solutions` + TRL | Solution-track projects -> Solutions Hub |
| `sh_products` + validations | Products from CoE get TRL-tracked |
| `sh_publications` | Research-track papers tracked for NAAC/NIRF |
| `facilitator_development` | Mentor assignment uses existing records |
| `ss_judge_scores` | Appathon scoring stays as-is |
| `student_attendance` | Attendance relaxation reads from incentive ledger |
| `profiles` | All user references (learners, mentors, admins) |

---

## Policy Section -> MyJKKN Feature Map

| # | Policy Section | MyJKKN Feature | Status |
|---|---------------|----------------|--------|
| 1 | Design Thinking lifecycle | `coe_projects.stage` mapping to `ss_cycles` | NEW wrapper |
| 2 | 3 trajectory paths | `coe_trajectory_assessments` + downstream FKs | NEW |
| 3 | 5-criteria rubric | `coe_trajectory_assessments` (1-5 x 5) | NEW |
| 4 | Attendance relaxation | `coe_incentive_ledger` + attendance integration | NEW + INTEGRATION |
| 5 | CIA bonus marks | `coe_incentive_ledger` + `coe_cia_*` tables | NEW |
| 6 | Presentation sponsorship | `coe_incentive_ledger` | NEW |
| 7 | IP rights (60/40) | `coe_incentive_ledger` | NEW |
| 8 | Cross-batch V1->V2->V3 | `coe_projects.parent_project_id` + `version` | NEW |
| 9 | Committee review | `coe_committee_reviews` + `_members` + `_votes` | NEW |
| 10 | Facilitator rating | `coe_mentor_ratings` | NEW |
| 11 | Learner proposals | `coe_projects` with `proposed_by` + proposal stages | NEW |
| 12 | CIA tracking | `coe_cia_configs` + `coe_cia_student_marks` | NEW |
| 13 | Team formation | `ss_teams` + `ss_team_members` | EXISTING |
| 14 | Problem discovery | `ss_problem_bank` + `ss_cycles` | EXISTING |
| 15 | Prototype building | `ss_builds` + Appathon | EXISTING |
| 16 | NLB incubation | `ss_nif_candidates` | EXISTING |
| 17 | JICATE commercialization | `sh_solutions` + `sh_products` | EXISTING |
| 18 | Academic research | `ss_research_topics` + `sh_publications` | EXISTING |
| 19 | Events (Appathon, Demo Days) | `ss_events` + venues + checklists | EXISTING |
| 20 | Facilitator development | `facilitator_development` + immersion | EXISTING |

**12 new + 8 existing = 20 total. 60% new code, 40% pure reuse.**

---

## Phasing

### Phase 1: Core Lifecycle + Committee Review + Proposals
- **Tables:** `coe_projects`, `coe_trajectory_assessments`, `coe_project_stage_history`, `coe_committee_reviews`, `coe_committee_members`, `coe_committee_votes` (6 tables)
- **API Routes:** 9 files
- **Pages:** 5 (dashboard, project list, project detail, new proposal, reviews)
- **Service:** `coe-service.ts`
- **Hooks:** `use-coe.ts`
- **Types:** All CoE types
- **Dependency:** None. Can start immediately.
- **Why committee in Phase 1:** Learner-initiated proposals REQUIRE committee approval before entering the lifecycle. Without this, no project can progress past `proposal` stage.

### Phase 2: CIA Subsystem + Incentive Automation
- **Tables:** `coe_cia_configs`, `coe_cia_student_marks`, `coe_incentive_ledger` (3 tables)
- **API Routes:** 5 files
- **Pages:** 2 (incentives, CIA config/marks)
- **Service:** `coe-cia-service.ts` + extend `coe-service.ts`
- **Hooks:** `use-coe-cia.ts` + extend `use-coe.ts`
- **Integration:** Modify `attendance-report-service.ts` to read relaxation data
- **Dependency:** Phase 1 (projects must exist). CIA configs can be set up independently.

### Phase 3: Mentor Rating + Handover
- **Tables:** `coe_mentor_ratings` (1 table)
- **API Routes:** 3 files
- **Pages:** 2 (mentor ratings, handover dashboard)
- **Service:** Extend `coe-service.ts`
- **Hooks:** Extend `use-coe.ts`
- **Dependency:** Phase 1 + Phase 2 (handover reviews need committee workflow).

---

## Reference Files for Implementation

| Purpose | File Path |
|---------|-----------|
| Service pattern | `lib/services/startup-studio/cycles-service.ts` |
| Hook pattern | `hooks/startup-studio/use-cycles.ts` |
| API route pattern | `app/api/startup-studio/cycles/route.ts` |
| Type definitions | `types/startup-studio/index.ts` |
| RLS pattern | CLAUDE.md (auth_institution_id + super_admin bypass) |
| Migration pattern | `supabase/migrations/20260227185501_create_startup_studio_tables.sql` |
| Base service | `lib/services/base-service.ts` |
| API client | `lib/api/client.ts` |
| Auth middleware | `lib/auth/with-auth.ts` |
| Attendance integration | `lib/services/academic/attendance-report-service.ts` |
| Attendance types | `types/attendance.ts` |

---

## Verification Plan

After each phase:
1. `bun run build` — zero new TypeScript errors
2. Apply migration to staging DB via Supabase MCP
3. Run `mcp__supabase__get_advisors` for security check (RLS coverage)
4. Browser test: navigate to `/startup-studio/coe`, create project, advance stages
5. Verify RLS: super_admin sees all institutions, regular user sees only their own
6. Test role-specific views: learner can propose but not approve, facilitator can vote, admin can manage
7. Phase 2 specific: configure CIA, record marks, verify bonus auto-computation
8. Phase 2 specific: advance project stage, verify attendance relaxation ledger entry auto-created
9. Phase 3 specific: test full handover flow V1->V2 with committee approval

---

## UX Specifications

### Onboarding Flow (Cold-Start)

This is a first-time launch — no learners have used the CoE system before. The onboarding flow must guide users through what CoE is and how to participate.

**First-time learner experience:**
1. Landing page shows a brief "What is Centre of Excellence?" explainer card with key benefits (incentives, mentorship, IP rights)
2. CTA: "Propose a Project" leads to the guided proposal form
3. Proposal form is a multi-step wizard: Title/Summary -> Problem Statement -> Origin Selection (fresh/from cycle/from Appathon) -> Team (optional) -> Tags -> Review & Submit Draft
4. After submission, show "Your proposal is saved as a draft. Click 'Submit for Review' when ready." with clear next-step guidance

**First-time facilitator experience:**
1. Landing shows "You've been added as a committee member" if applicable, or "Browse CoE projects" otherwise
2. Review Queue is prominently featured with pending count badge
3. First vote shows a tooltip explaining the voting process and rubric

**First-time admin experience:**
1. Dashboard shows "Getting Started" checklist: (a) Configure CIA assessment structure, (b) Invite committee members, (c) Set academic year
2. Each checklist item links to the relevant configuration page
3. Checklist auto-dismisses once all items are completed

### Empty States

Every list view must handle the zero-data state gracefully:

| Page | Empty State Message | CTA |
|------|-------------------|-----|
| CoE Dashboard (admin) | "No CoE projects yet. The Centre of Excellence program starts when learners submit proposals." | "Configure CIA Settings" + "Share Program Link" |
| Project List | "No projects match your filters." / "No CoE projects in your institution yet." | "Propose a Project" (learner) / "Invite Learners" (admin) |
| My Projects (learner) | "You haven't proposed any projects yet. Start your CoE journey!" | "Propose a Project" |
| Review Queue (facilitator) | "No reviews pending. You're all caught up!" | "Browse Projects" |
| Incentives | "No incentives earned yet. Incentives are automatically awarded as your project progresses." | "View My Projects" |
| CIA Marks | "No CIA marks recorded yet." | "Configure CIA Structure" (admin) |
| Mentor Ratings | "No ratings submitted yet." | "Rate a Mentor" (learner) / "View My Mentees" (facilitator) |
| Handover Dashboard | "No handover chains yet. Projects become eligible for handover after trajectory assessment." | — |

### Notification Triggers

The system sends notifications at these lifecycle events. Channel = in-app notification + optional email digest.

| Event | Recipients | Message Template |
|-------|-----------|-----------------|
| Proposal submitted for review | All committee members for the review | "[Learner] submitted '{title}' for committee review" |
| Committee vote cast | Other committee members + proposer | "[Member] voted on '{title}'" |
| Review decision made | Proposer + team members + mentor | "'{title}' has been {approved/rejected/revision needed}" |
| Revision needed | Proposer | "Your proposal '{title}' needs revision: {feedback}" |
| Stage advanced | Team members + mentor | "'{title}' moved to {stage}" |
| Incentive auto-applied | Recipient (learner/facilitator) | "You earned {incentive_type}: {value}" |
| Incentive pending approval | Admin users | "{count} incentive(s) pending approval" |
| Mentor assigned | Mentor + team members | "[Mentor] assigned as mentor for '{title}'" |
| Review deadline approaching (48h) | Committee members who haven't voted | "Review for '{title}' due in 48 hours" |
| Review deadline expired | Admin + chair | "Review for '{title}' has passed its 7-day deadline" |
| Handover initiated | New proposer + old team | "'{title}' V{n} is being handed over to V{n+1}" |
| CIA bonus applied | Student | "CoE bonus of {percent}% applied to {assessment_name}" |

### Revision Workflow

When a committee review results in `revision_needed`:

1. **Proposer sees:** "Revision Needed" badge on their project card with the committee's feedback displayed prominently
2. **Project returns to `proposal` stage** (via `committee_review -> proposal` transition)
3. **Proposer can edit:** Title, summary, problem statement, tags, team — all fields editable in draft mode
4. **Revision history:** Each resubmission creates a new `coe_committee_reviews` record. Previous reviews remain in history with their feedback visible.
5. **Resubmit action:** "Submit Revised Proposal" button creates new review and advances back to `committee_review`
6. **No limit on revisions** — but each cycle goes through the full committee review process
7. **Committee sees:** Previous review history when evaluating a revised proposal, with a "Revision #{n}" label

### Confirmation Dialogs

Critical actions require explicit confirmation to prevent accidental state changes:

| Action | Dialog Content | Confirm Button |
|--------|---------------|---------------|
| Submit proposal for review | "Once submitted, your proposal enters committee review. You won't be able to edit until the review is complete or revision is requested." | "Submit for Review" |
| Cast committee vote | "You are voting to **{vote}** the proposal '{title}'. This cannot be changed." | "Confirm Vote" |
| Advance stage | "Move '{title}' from **{from}** to **{to}**? This will be recorded in the project history." | "Advance Stage" |
| Reject proposal | "Rejecting '{title}' is permanent. The project will be archived and cannot be reactivated." | "Reject Proposal" (red) |
| Initiate handover | "This will create a new version (V{n+1}) of '{title}' and mark the current version as completed." | "Start Handover" |
| Delete CIA config | "Deleting this assessment configuration will affect all future mark entries. Existing marks are preserved." | "Delete Configuration" (red) |
| Apply incentive manually | "Grant {incentive_type} ({value}) to {recipient}? This will be logged in the incentive ledger." | "Grant Incentive" |

---

## Changes from Original Spec (Interview-Driven)

| # | What Changed | Why |
|---|-------------|-----|
| 1 | `origin_cycle_id` now NULLABLE + added `origin_type` + `origin_submission_id` | Projects come from cycles, Appathon submissions, OR fresh proposals |
| 2 | Added `proposal` and `committee_review` stages | Learner-initiated proposals need approval before entering lifecycle |
| 3 | Committee review moved from Phase 3 to Phase 1 | Required from Day 1 for proposal approval workflow |
| 4 | Added `coe_committee_members` + `coe_committee_votes` tables | Proper voting with individual vote records (not JSONB) |
| 5 | Added `coe_cia_configs` + `coe_cia_student_marks` tables | No CIA system exists; needs configurable per-college structure |
| 6 | Added `proposed_by`, `problem_statement`, `is_public` to projects | Learner self-service + peer visibility |
| 7 | Added `auto_applied`, `applied_at` to incentive ledger | Full automation of attendance relaxation + CIA bonus |
| 8 | Added role-based view section | Three roles (learner/facilitator/admin) use system equally |
| 9 | Added attendance integration design | Read-only integration via reporting layer |
| 10 | Table count: 5 → 10 | Original 5 (projects, trajectory, stage_history, incentive_ledger, mentor_ratings) + 3 committee tables + 2 CIA tables |
