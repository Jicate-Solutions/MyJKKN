# Startup Studio: Incubation Management Enhancement Spec

> **Module:** Startup Studio (Incubation Layer)
> **Source:** DST & MSH Incubation Management Training Program (57 pages, compiled by Saurabh Jain)
> **Created:** 2026-03-26
> **Status:** Spec Complete — Awaiting Prioritization
> **Driven By:** NIF (Nattraja Incubation Forum) capability gap analysis
> **Existing Tables:** 44 | **New Tables Proposed:** 23 | **Enriched Tables:** 3

---

## 1. Executive Summary

### The Two Worlds Problem

The Startup Studio module currently serves **one world well and one world not at all:**

| World | What It Is | Current Status |
|-------|-----------|----------------|
| **Innovation Lab** | Students run 8-step flywheel cycles, demo at appathons, get scored | Fully built (44 tables, 24 services) |
| **Incubation Management** | TBI manages startup portfolios, reports to funders, tracks multi-year impact | NIF pipeline exists as a thin shell — no depth |

The NIF pipeline (`ss_nif_candidates`) has 7 stages but no **operational depth** — no mentor matching, no TRL tracking, no financial management, no compliance tracking, no structured graduation, no alumni tracking, no government-mandated KPI reporting.

### The Vision

Transform Startup Studio from an **event-centric innovation lab** into a **full-stack incubation management system** that:

1. **Feeds** startups from student innovation (Layer 1) into structured incubation (Layer 2)
2. **Manages** the complete incubation lifecycle per DST/MSH/MoE frameworks
3. **Reports** impact metrics to government funders with zero manual data compilation
4. **Sustains** itself through tracked revenue models and grant utilization
5. **Graduates** startups with formal criteria and tracks them as alumni for years

### The Fundamental Architecture Shift

```
BEFORE:
  Student → Flywheel → Appathon → NIF Pipeline (thin) → ???

AFTER:
  ┌─────────────────────────────────────────────────────────────┐
  │ LAYER 1: Innovation Lab (EXISTS)                            │
  │   Student → Flywheel → Problem Bank → Appathon → Demo Day  │
  └────────────────────────────┬────────────────────────────────┘
                               │ Best innovations graduate into...
  ┌────────────────────────────▼────────────────────────────────┐
  │ LAYER 2: Incubation Management (NEW)                        │
  │                                                              │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
  │  │ Startup  │  │ Mentor   │  │ Finance  │  │ Governance│  │
  │  │ Portfolio│  │ Ecosystem│  │ & Grants │  │ & Comply  │  │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
  │       │              │             │               │         │
  │  ┌────▼──────────────▼─────────────▼───────────────▼─────┐  │
  │  │              KPI & Impact Dashboard                    │  │
  │  │         (DST / MSH / MoE / NIRF aligned)              │  │
  │  └───────────────────────┬───────────────────────────────┘  │
  │                          │                                   │
  │  ┌───────────────────────▼───────────────────────────────┐  │
  │  │            Graduation → Alumni Tracking                │  │
  │  └───────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘
```

---

## 2. Gap Analysis: Training Program vs Current System

### Comprehensive Mapping

| # | Training Program Domain | Current State | Gap Level | Enhancement Type |
|---|------------------------|---------------|-----------|------------------|
| 1 | Technology Readiness Level (TRL 1-9) | Not tracked on NIF candidates. Solutions Hub has TRL for products — no link | **Critical** | Cross-module integration + new field |
| 2 | Mentor Management (recruit, screen, match, monitor, assess) | Zero mentor tables. Teams have `mentor_id` on `ss_teams` only | **Critical** | 5 new tables + full service |
| 3 | Startup Risk Assessment (Magic, Market, Management, Money) | Not structured. Judge scores cover demo day only | **High** | 2 new tables |
| 4 | Graduation Criteria Engine | Stage exists (`graduated`) but no formal criteria | **High** | 2 new tables + workflow |
| 5 | Exit Procedures | No exit workflow | **High** | New table + process |
| 6 | Post-Graduation Alumni Tracking | Zero tracking after graduation | **High** | New table + annual survey |
| 7 | DST/MSH/MoE KPI Metrics | Generic analytics only. No funder-specific metrics | **High** | 3 new tables + dashboard |
| 8 | Financial Management (budgets, grants, audits) | Not tracked | **High** | 4 new tables |
| 9 | Compliance Tracking (legal, financial, HR, startup) | Not tracked | **Medium** | 2 new tables |
| 10 | Governance Structure (Board, Committees) | Not tracked | **Medium** | 2 new tables |
| 11 | Institutional Readiness Scorecard (5 pillars) | Not tracked | **Medium** | 2 new tables |
| 12 | Marketing & Outreach | Not tracked | **Medium** | 1 new table |
| 13 | Competitive Matrix per startup | Not tracked | **Low** | JSONB field on NIF candidates |
| 14 | Business Enthusiasm Curve position | Not tracked | **Low** | ENUM field on NIF candidates |
| 15 | Startup Master Data (DIPP, incorporation, KYC, pitch deck) | Partially covered by `ss_nif_candidates` | **Low** | Column additions |
| 16 | Stakeholder Reporting | Analytics exists but not stakeholder-specific | **Medium** | Config + views |
| 17 | Startup Capital Assessment (Creative, Innovation, Human, Financial) | Not tracked | **Low** | JSONB on risk assessment |
| 18 | Feasibility Study / DFR / DPR documents | Not tracked | **Low** | Document link fields |
| 19 | SOP Repository | Not in system | **Low** | Document management |
| 20 | Cross-module: Solutions Hub TRL ↔ NIF Pipeline | No link exists | **Medium** | FK + sync service |

---

## 3. Domain Enhancement Specifications

### 3A. Technology Readiness Level (TRL) Integration

#### Why This Matters

TRL is the universal language of technology commercialization. DST evaluates incubators partly on TRL progression of their portfolio. Without TRL tracking, NIF cannot:
- Report technology maturity to funders
- Identify startups stuck at "valley of death" (TRL 4-6)
- Measure commercialization velocity
- Connect to Solutions Hub products (which already have TRL)

#### What Exists

- Solutions Hub has `sh_products` with full TRL 1-9 tracking, validation evidence, and RDIF readiness
- NIF candidates have NO TRL field
- `ss_nif_candidates` has `startup_status` (ideation/mvp/launched/funded/acquired) but this is coarser than TRL

#### Design Decision: Integrate, Don't Duplicate

The Solutions Hub TRL system is production-ready. Rather than rebuilding TRL tracking, we:
1. Add `current_trl` (INTEGER 1-9) column to `ss_nif_candidates`
2. Add `sh_product_id` link (already exists but unused for TRL)
3. Create `ss_trl_assessments` for incubation-specific TRL history (different from Solutions Hub — this tracks the startup's technology, not JICATE's product)

#### Schema

```sql
-- New table: TRL progression tracking for incubated startups
CREATE TABLE ss_trl_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  trl_level INTEGER NOT NULL CHECK (trl_level BETWEEN 1 AND 9),
  previous_trl INTEGER CHECK (previous_trl BETWEEN 1 AND 9),
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessed_by UUID REFERENCES profiles(id),

  -- Evidence per TRL level (what proof supports this rating)
  evidence_description TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',

  -- TRL-specific validation fields
  lab_validated BOOLEAN DEFAULT false,          -- TRL 4+
  relevant_env_validated BOOLEAN DEFAULT false,  -- TRL 5+
  prototype_demonstrated BOOLEAN DEFAULT false,  -- TRL 7+
  system_qualified BOOLEAN DEFAULT false,        -- TRL 8+
  operational_proven BOOLEAN DEFAULT false,       -- TRL 9

  -- Blockers preventing advancement
  blockers TEXT[],
  next_steps TEXT,
  estimated_months_to_next INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add TRL fields to existing candidates table
ALTER TABLE ss_nif_candidates ADD COLUMN IF NOT EXISTS current_trl INTEGER CHECK (current_trl BETWEEN 1 AND 9);
ALTER TABLE ss_nif_candidates ADD COLUMN IF NOT EXISTS trl_assessed_at TIMESTAMPTZ;
ALTER TABLE ss_nif_candidates ADD COLUMN IF NOT EXISTS enthusiasm_curve TEXT CHECK (enthusiasm_curve IN (
  'uninformed_optimism', 'informed_pessimism', 'valley_of_despair', 'informed_optimism', 'success'
));
```

#### Cross-Module Link

When a NIF candidate's technology matures into a JKKN-owned product:
1. A `sh_products` record is created in Solutions Hub
2. `ss_nif_candidates.sh_product_id` links them
3. TRL updates can flow bidirectionally (startup TRL in SS, product TRL in SH)
4. This creates the pathway: Student Innovation → Incubated Startup → JKKN Product → RDIF Grant

#### Service Methods

```
TrlAssessmentService:
  assessTrl(candidateId, data) → creates assessment + updates candidate.current_trl
  getTrlHistory(candidateId) → ordered assessments
  getTrlDistribution() → { trl_1: count, trl_2: count, ... }
  getStuckStartups(monthsThreshold) → candidates with no TRL advancement
  linkToProduct(candidateId, productId) → creates SH link
```

#### UI Requirements

- **NIF Candidate Detail Page**: TRL progress bar (1-9), current level highlighted, assessment history timeline
- **NIF Pipeline Dashboard**: TRL distribution chart, "Valley of Death" alert (candidates stuck at TRL 4-6 for >6 months)
- **Assessment Form**: TRL level selector, evidence upload, blocker documentation

---

### 3B. Mentor Ecosystem Management

#### Why This Matters

The training program states: *"Incubators are about people development. A business is only as good as the people who initiate, run and grow it."*

Mentoring is the single highest-impact activity an incubator performs. Without structured mentor management:
- Mentor matching is ad-hoc (currently just `mentor_id` on teams)
- No tracking of session quality or frequency
- No mentor screening or onboarding
- No way to measure mentoring impact
- No mentor diversity metrics (domain, gender, geography)

#### Four People Development Methods (from training program)

| Method | Description | System Support Needed |
|--------|-------------|----------------------|
| Counseling | One-time guidance | Lightweight — session notes |
| Training | Structured learning | Workshop/event tracking |
| Coaching | Skill-focused improvement | Session series tracking |
| **Mentoring** | Long-term relationship | Full lifecycle management |

#### Schema

```sql
-- Mentor types enum
CREATE TYPE ss_mentor_type AS ENUM (
  'resident',        -- Full-time at incubator
  'visiting',        -- Periodic visits
  'industry_expert', -- Domain specialist from industry
  'academic',        -- University/research background
  'investor',        -- Angel/VC with mentoring capacity
  'alumni',          -- Graduated startup founder
  'functional'       -- Specialist (legal, accounting, HR, IP)
);

CREATE TYPE ss_mentor_status AS ENUM (
  'prospect',        -- Identified, not yet approached
  'screening',       -- In screening process
  'onboarded',       -- Active and available
  'inactive',        -- Temporarily unavailable
  'retired'          -- No longer mentoring
);

CREATE TYPE ss_match_status AS ENUM (
  'proposed',        -- Match suggested
  'active',          -- Currently mentoring
  'paused',          -- Temporarily paused
  'completed',       -- Successfully concluded
  'terminated'       -- Ended prematurely
);

-- Table 1: Mentor Profiles
CREATE TABLE ss_mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  user_id UUID REFERENCES profiles(id),  -- NULL if external mentor
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  photo_url TEXT,
  linkedin_url TEXT,

  -- Professional profile
  designation TEXT,
  organization TEXT,
  mentor_type ss_mentor_type NOT NULL DEFAULT 'visiting',
  status ss_mentor_status NOT NULL DEFAULT 'prospect',

  -- Expertise & sourcing
  domain_expertise TEXT[] NOT NULL DEFAULT '{}',  -- e.g. ['fintech', 'healthtech', 'marketing']
  functional_expertise TEXT[] DEFAULT '{}',       -- e.g. ['legal', 'accounting', 'fundraising']
  years_experience INTEGER,
  source TEXT,                                     -- How they were found (referral, event, linkedin, etc.)
  referred_by TEXT,

  -- Capacity
  max_mentees INTEGER DEFAULT 3,
  current_mentees INTEGER DEFAULT 0,
  preferred_session_frequency TEXT DEFAULT 'biweekly',  -- weekly, biweekly, monthly
  preferred_session_mode TEXT DEFAULT 'hybrid',          -- in_person, virtual, hybrid
  availability_notes TEXT,

  -- Screening
  screened_at TIMESTAMPTZ,
  screened_by UUID REFERENCES profiles(id),
  screening_score INTEGER CHECK (screening_score BETWEEN 1 AND 10),
  screening_notes TEXT,

  -- Onboarding
  onboarded_at TIMESTAMPTZ,
  orientation_completed BOOLEAN DEFAULT false,
  nda_signed BOOLEAN DEFAULT false,
  agreement_signed BOOLEAN DEFAULT false,

  -- Performance tracking
  total_sessions INTEGER DEFAULT 0,
  total_hours NUMERIC(8,1) DEFAULT 0,
  avg_mentee_rating NUMERIC(3,2),
  startups_mentored INTEGER DEFAULT 0,
  successful_exits INTEGER DEFAULT 0,

  -- Institutional
  institution_id UUID REFERENCES institutions(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 2: Mentor-Startup Matching
CREATE TABLE ss_mentor_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES ss_mentors(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,

  status ss_match_status NOT NULL DEFAULT 'proposed',

  -- Match context
  match_reason TEXT,              -- Why this mentor for this startup
  matched_by UUID REFERENCES profiles(id),
  matched_at TIMESTAMPTZ DEFAULT NOW(),

  -- Goals
  primary_goal TEXT,              -- What the mentoring should achieve
  expected_duration_months INTEGER,
  session_frequency TEXT DEFAULT 'biweekly',

  -- Progress tracking
  sessions_completed INTEGER DEFAULT 0,
  goals_met TEXT[],
  goals_pending TEXT[],

  -- Lifecycle
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,
  completed_at TIMESTAMPTZ,
  completion_reason TEXT,
  terminated_at TIMESTAMPTZ,
  termination_reason TEXT,

  -- Satisfaction
  mentor_satisfaction INTEGER CHECK (mentor_satisfaction BETWEEN 1 AND 10),
  mentee_satisfaction INTEGER CHECK (mentee_satisfaction BETWEEN 1 AND 10),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(mentor_id, candidate_id)
);

-- Table 3: Mentoring Sessions
CREATE TABLE ss_mentor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES ss_mentor_matches(id) ON DELETE CASCADE,

  -- Session details
  session_date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  mode TEXT DEFAULT 'virtual' CHECK (mode IN ('in_person', 'virtual', 'phone')),
  location TEXT,

  -- Content
  topics_discussed TEXT[] NOT NULL DEFAULT '{}',
  key_takeaways TEXT,
  action_items TEXT[],
  blockers_identified TEXT[],

  -- Focus areas (from training program: issues targeted for resolution)
  focus_area TEXT CHECK (focus_area IN (
    'sales_marketing', 'market_research', 'financing', 'business_law',
    'tax_ip_law', 'accounting', 'product_development', 'hr_recruiting',
    'leadership', 'communications', 'networking', 'technology',
    'go_to_market', 'fundraising', 'governance', 'other'
  )),

  -- Outcomes
  mentee_progress_notes TEXT,
  next_session_date TIMESTAMPTZ,

  -- Ratings
  mentor_rating_of_session INTEGER CHECK (mentor_rating_of_session BETWEEN 1 AND 5),
  mentee_rating_of_session INTEGER CHECK (mentee_rating_of_session BETWEEN 1 AND 5),

  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 4: Mentor Evaluations (periodic quality checks)
CREATE TABLE ss_mentor_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES ss_mentors(id) ON DELETE CASCADE,

  evaluation_period_start DATE NOT NULL,
  evaluation_period_end DATE NOT NULL,
  evaluated_by UUID REFERENCES profiles(id),

  -- Quantitative
  sessions_conducted INTEGER DEFAULT 0,
  total_hours NUMERIC(6,1) DEFAULT 0,
  mentees_served INTEGER DEFAULT 0,
  action_items_given INTEGER DEFAULT 0,
  action_items_completed INTEGER DEFAULT 0,

  -- Qualitative
  avg_mentee_satisfaction NUMERIC(3,2),
  domain_relevance_score INTEGER CHECK (domain_relevance_score BETWEEN 1 AND 10),
  communication_score INTEGER CHECK (communication_score BETWEEN 1 AND 10),
  availability_score INTEGER CHECK (availability_score BETWEEN 1 AND 10),
  impact_score INTEGER CHECK (impact_score BETWEEN 1 AND 10),

  -- Outcome
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 10),
  strengths TEXT,
  areas_for_improvement TEXT,
  recommendation TEXT CHECK (recommendation IN ('continue', 'reduce_load', 'retrain', 'retire')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Service Methods

```
MentorService:
  -- CRUD
  getMentors(filters: {type?, status?, domain?, search?}) → paginated list
  getMentorById(id) → mentor with match history
  createMentor(data) → mentor
  updateMentor(id, data) → mentor

  -- Matching
  suggestMentorsForCandidate(candidateId) → ranked mentor list (by domain match)
  createMatch(mentorId, candidateId, data) → match
  updateMatchStatus(matchId, status, reason?) → match
  getActiveMatches(mentorId | candidateId) → matches

  -- Sessions
  logSession(matchId, data) → session
  getSessionHistory(matchId) → sessions
  getUpcomingSessions(mentorId | candidateId) → sessions

  -- Analytics
  getMentorDashboard() → { total_mentors, active_matches, avg_sessions_per_month, top_domains }
  getMentorUtilization() → { mentor_id, capacity, current_load, utilization_pct }
  getMentoringImpact() → { startups_with_mentors_vs_without, trl_advancement_rate }
```

#### UI Requirements

- **Mentor Directory**: Searchable/filterable list with expertise tags, availability indicator, rating badge
- **Mentor Profile Page**: Bio, expertise, match history, session log, performance metrics
- **Match Management**: Drag-and-drop matching interface, match health indicators (session frequency, satisfaction)
- **Session Logger**: Quick-entry form for post-session notes, action items, next meeting
- **Mentor Dashboard**: Pool analytics, utilization heatmap, domain coverage gaps

---

### 3C. Startup Risk Assessment Framework

#### Why This Matters

The training program identifies **four major risks** every startup faces. Incubators that systematically assess and mitigate these risks have 3x higher success rates. Without structured risk assessment:
- Mentoring is unfocused (mentor doesn't know which risk is highest)
- Resources are misallocated (funding a startup with a team problem, not a money problem)
- Graduation decisions are subjective

#### The Four Risks

| Risk | What It Means | What to Assess | Mitigation Path |
|------|--------------|----------------|-----------------|
| **Magic (Technology/IP)** | Can the technology actually work at scale? | TRL level, IP protection, technical advisory board, prototype maturity | Tech advisory board, R&D partnerships, IP attorneys |
| **Market** | Do enough people want this badly enough to pay? | Customer validation count, willingness to pay, competitive position, market size | Customer validation sprints, competitive matrix, go-to-market workshops |
| **Management** | Can this team execute? | Domain experience, complementary skills, coachability, resilience | Team assessment, advisory board, hire recommendations, CV bank |
| **Money** | Can they fund the journey? | Burn rate, runway months, funding stage, investor interest, bootstrapping ability | Financial literacy workshops, angel network, grant applications |

#### Schema

```sql
-- Risk assessment per candidate (done periodically, e.g. quarterly)
CREATE TABLE ss_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessed_by UUID REFERENCES profiles(id),

  -- Magic (Technology/IP) Risk: 1 = extreme risk, 10 = fully de-risked
  magic_score INTEGER NOT NULL CHECK (magic_score BETWEEN 1 AND 10),
  magic_trl_level INTEGER CHECK (magic_trl_level BETWEEN 1 AND 9),
  magic_ip_status TEXT CHECK (magic_ip_status IN ('none', 'trade_secret', 'patent_filed', 'patent_granted')),
  magic_has_tech_advisory BOOLEAN DEFAULT false,
  magic_prototype_maturity TEXT CHECK (magic_prototype_maturity IN ('concept', 'proof_of_concept', 'alpha', 'beta', 'production')),
  magic_notes TEXT,
  magic_mitigation_plan TEXT,

  -- Market Risk
  market_score INTEGER NOT NULL CHECK (market_score BETWEEN 1 AND 10),
  market_customers_validated INTEGER DEFAULT 0,
  market_willingness_to_pay TEXT CHECK (market_willingness_to_pay IN ('unknown', 'interested', 'verbal_commit', 'paid', 'recurring')),
  market_tam_estimate NUMERIC(15,2),
  market_tam_currency TEXT DEFAULT 'INR',
  market_competition_level TEXT CHECK (market_competition_level IN ('blue_ocean', 'few_competitors', 'moderate', 'crowded', 'monopolized')),
  market_notes TEXT,
  market_mitigation_plan TEXT,

  -- Management (Team) Risk
  management_score INTEGER NOT NULL CHECK (management_score BETWEEN 1 AND 10),
  management_team_size INTEGER DEFAULT 1,
  management_has_domain_expert BOOLEAN DEFAULT false,
  management_has_tech_lead BOOLEAN DEFAULT false,
  management_has_business_lead BOOLEAN DEFAULT false,
  management_coachability TEXT CHECK (management_coachability IN ('resistant', 'passive', 'receptive', 'proactive')),
  management_has_advisory_board BOOLEAN DEFAULT false,
  management_notes TEXT,
  management_mitigation_plan TEXT,

  -- Money (Financial) Risk
  money_score INTEGER NOT NULL CHECK (money_score BETWEEN 1 AND 10),
  money_monthly_burn NUMERIC(12,2),
  money_runway_months INTEGER,
  money_funding_raised NUMERIC(15,2) DEFAULT 0,
  money_funding_currency TEXT DEFAULT 'INR',
  money_revenue_monthly NUMERIC(12,2) DEFAULT 0,
  money_has_financial_plan BOOLEAN DEFAULT false,
  money_investor_interest_level TEXT CHECK (money_investor_interest_level IN ('none', 'exploring', 'in_discussion', 'term_sheet', 'committed')),
  money_notes TEXT,
  money_mitigation_plan TEXT,

  -- Composite
  overall_risk_score NUMERIC(4,2) GENERATED ALWAYS AS (
    (magic_score + market_score + management_score + money_score) / 4.0
  ) STORED,
  overall_risk_level TEXT GENERATED ALWAYS AS (
    CASE
      WHEN (magic_score + market_score + management_score + money_score) / 4.0 >= 8 THEN 'low'
      WHEN (magic_score + market_score + management_score + money_score) / 4.0 >= 5 THEN 'moderate'
      WHEN (magic_score + market_score + management_score + money_score) / 4.0 >= 3 THEN 'high'
      ELSE 'critical'
    END
  ) STORED,

  -- Action items from this assessment
  priority_risk TEXT CHECK (priority_risk IN ('magic', 'market', 'management', 'money')),
  action_items JSONB DEFAULT '[]',  -- [{action, owner, due_date, status}]

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Competitive matrix per startup
CREATE TABLE ss_competitive_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,

  competitor_name TEXT NOT NULL,
  competitor_website TEXT,
  competitor_type TEXT DEFAULT 'direct',  -- direct, indirect, substitute

  -- Comparison attributes (JSONB for flexibility — attributes vary by industry)
  attributes JSONB NOT NULL DEFAULT '{}',
  -- Example: {"price": {"us": 4, "them": 3}, "features": {"us": 5, "them": 4}, "market_share": {"us": 1, "them": 8}}

  our_advantage TEXT,     -- Where we win
  their_advantage TEXT,   -- Where they win
  strategic_response TEXT, -- How we plan to compete

  last_updated DATE DEFAULT CURRENT_DATE,
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Service Methods

```
RiskAssessmentService:
  assessRisk(candidateId, data) → assessment
  getRiskHistory(candidateId) → ordered assessments
  getRiskHeatmap() → all candidates with latest risk scores (4-quadrant)
  getHighRiskStartups(threshold) → candidates with any risk score < threshold
  getRiskTrend(candidateId) → risk scores over time (improving/declining)

CompetitiveMatrixService:
  getMatrix(candidateId) → competitors with attributes
  addCompetitor(candidateId, data) → competitor entry
  updateCompetitor(id, data) → competitor entry
  removeCompetitor(id) → void
```

#### UI Requirements

- **Risk Radar Chart**: 4-axis spider chart per startup (Magic, Market, Management, Money)
- **Risk Heatmap**: All portfolio startups plotted by risk level — red/yellow/green zones
- **Risk Assessment Form**: Guided questionnaire for each risk dimension with evidence fields
- **Competitive Matrix View**: Side-by-side comparison table with color-coded advantage indicators
- **Risk Trend Line**: Historical risk scores showing de-risking velocity

---

### 3D. Graduation & Exit Management

#### Why This Matters

The training program states clear graduation criteria and exit procedures. Without formal graduation:
- Startups stay in the incubator indefinitely (zombie incubatees)
- No incentive to achieve milestones
- Funder metrics (graduation rate, time-to-graduation) cannot be reported
- No post-graduation relationship management

#### Graduation Criteria (from training program)

A startup is ready to graduate if **two of the following** are achieved:
1. Annual revenue exceeds ₹75,00,000 (₹75L, adapted from $1M for Indian context)
2. Acquired by a larger company
3. Completes equity raise > ₹3,75,00,000 (₹3.75Cr, adapted from $500K)
4. Exceeds physical capacity of the incubator
5. Has been incubated for 4 years (time limit)
6. No longer has an institutional/university connection

#### Schema

```sql
-- Configurable graduation criteria
CREATE TABLE ss_graduation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  description TEXT,
  criteria_type TEXT NOT NULL CHECK (criteria_type IN (
    'revenue_threshold', 'funding_threshold', 'acquisition',
    'capacity_exceeded', 'time_limit', 'institutional_disconnect',
    'jobs_created', 'market_presence', 'custom'
  )),

  -- Threshold values (interpreted based on criteria_type)
  threshold_value NUMERIC(15,2),
  threshold_unit TEXT,           -- 'INR', 'years', 'employees', etc.

  -- Config
  is_active BOOLEAN DEFAULT true,
  min_criteria_to_graduate INTEGER DEFAULT 2,  -- How many criteria must be met

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Graduation evaluation per candidate
CREATE TABLE ss_graduation_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  evaluated_by UUID REFERENCES profiles(id),

  -- Per-criteria assessment
  criteria_results JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"criteria_id": "...", "met": true, "evidence": "Revenue crossed 80L", "value": 8000000}]

  criteria_met_count INTEGER DEFAULT 0,
  is_graduation_ready BOOLEAN DEFAULT false,

  -- Decision
  decision TEXT CHECK (decision IN ('graduate', 'extend', 'exit_non_performance', 'defer')),
  decision_notes TEXT,
  decision_by UUID REFERENCES profiles(id),

  -- If extending
  extension_months INTEGER,
  extension_conditions TEXT,

  -- If graduating
  graduation_type TEXT CHECK (graduation_type IN ('successful', 'time_limit', 'capacity', 'acquisition')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exit procedure tracking
CREATE TABLE ss_exit_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,

  exit_type TEXT NOT NULL CHECK (exit_type IN ('graduation', 'voluntary', 'non_performance', 'acquisition', 'closure')),

  -- Process steps
  notice_given_at TIMESTAMPTZ,
  notice_period_days INTEGER DEFAULT 60,

  -- Reconciliation
  fees_outstanding NUMERIC(12,2) DEFAULT 0,
  fees_reconciled BOOLEAN DEFAULT false,
  deposit_returned BOOLEAN DEFAULT false,

  -- Documentation
  exit_interview_completed BOOLEAN DEFAULT false,
  exit_interview_notes TEXT,
  ip_agreements_settled BOOLEAN DEFAULT false,
  nda_status TEXT DEFAULT 'active',
  equipment_returned BOOLEAN DEFAULT false,

  -- Offboarding
  access_revoked BOOLEAN DEFAULT false,
  alumni_network_joined BOOLEAN DEFAULT false,
  testimonial_provided BOOLEAN DEFAULT false,

  -- Dates
  exit_initiated_at TIMESTAMPTZ DEFAULT NOW(),
  exit_completed_at TIMESTAMPTZ,

  processed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post-graduation alumni tracking (annual surveys)
CREATE TABLE ss_alumni_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,

  tracking_year INTEGER NOT NULL,
  tracking_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Status
  is_operational BOOLEAN DEFAULT true,
  pivot_description TEXT,           -- If they pivoted, what changed

  -- Financial metrics
  annual_revenue NUMERIC(15,2),
  revenue_currency TEXT DEFAULT 'INR',
  revenue_growth_pct NUMERIC(6,2),  -- YoY growth

  -- Funding
  total_funding_raised NUMERIC(15,2),
  latest_funding_round TEXT,
  latest_valuation NUMERIC(15,2),

  -- Impact
  employees_count INTEGER DEFAULT 0,
  jobs_created_this_year INTEGER DEFAULT 0,
  customers_count INTEGER DEFAULT 0,

  -- IP
  patents_filed INTEGER DEFAULT 0,
  patents_granted INTEGER DEFAULT 0,

  -- Recognition
  awards TEXT[],
  media_mentions INTEGER DEFAULT 0,

  -- Relationship with incubator
  is_mentor_back BOOLEAN DEFAULT false,   -- Giving back as mentor
  is_investor_back BOOLEAN DEFAULT false,  -- Investing in new startups
  referred_startups INTEGER DEFAULT 0,

  -- Satisfaction
  incubator_helpfulness_rating INTEGER CHECK (incubator_helpfulness_rating BETWEEN 1 AND 10),
  most_valuable_support TEXT,
  improvement_suggestion TEXT,

  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(candidate_id, tracking_year)
);
```

#### Service Methods

```
GraduationService:
  evaluateReadiness(candidateId) → { criteria_results, criteria_met, is_ready }
  getGraduationCriteria(institutionId?) → criteria list
  createEvaluation(candidateId, data) → evaluation
  initiateExit(candidateId, exitType) → exit_procedure
  updateExitProgress(exitId, data) → exit_procedure
  completeExit(exitId) → finalized + moves candidate to graduated/rejected

AlumniService:
  trackAlumni(candidateId, yearData) → tracking record
  getAlumniMetrics(year?) → { total_alumni, operational_pct, total_revenue, total_jobs, ... }
  getAlumniDirectory() → graduated candidates with latest metrics
  getGiveBackMetrics() → mentors/investors who are alumni
  sendAnnualSurvey(candidateIds) → triggers survey workflow
```

---

### 3E. Financial Management

#### Why This Matters

The training program is emphatic: *"Understanding the fundamental basics of financial management is critical for the success of a business incubator."*

Without financial tracking:
- Grant utilization cannot be reported to DST/MSH
- Budget overruns go undetected
- Self-sustainability ratio (target: 30-40% in 3 years) cannot be measured
- Audit preparation is manual and error-prone

#### Schema

```sql
-- Grant tracking
CREATE TABLE ss_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Grant identity
  name TEXT NOT NULL,
  funder TEXT NOT NULL,                      -- DST, MSH, MoE, State Govt, Corporate, etc.
  grant_number TEXT,

  -- Amounts
  sanctioned_amount NUMERIC(15,2) NOT NULL,
  received_amount NUMERIC(15,2) DEFAULT 0,
  utilized_amount NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'INR',

  -- Timeline
  sanction_date DATE,
  start_date DATE,
  end_date DATE,

  -- Utilization tracking
  utilization_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN received_amount > 0 THEN (utilized_amount / received_amount) * 100 ELSE 0 END
  ) STORED,

  -- Compliance
  uc_submitted BOOLEAN DEFAULT false,        -- Utilization Certificate
  uc_submitted_at TIMESTAMPTZ,
  audit_status TEXT DEFAULT 'pending' CHECK (audit_status IN ('pending', 'in_progress', 'completed', 'flagged')),

  -- Purpose
  purpose TEXT,
  allowed_heads TEXT[],                       -- Expense heads allowed under this grant

  -- Reporting
  reporting_frequency TEXT DEFAULT 'quarterly',
  last_report_date DATE,
  next_report_due DATE,

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Budget tracking (annual/quarterly)
CREATE TABLE ss_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  fiscal_year TEXT NOT NULL,                  -- '2025-26'
  quarter TEXT,                               -- 'Q1', 'Q2', etc. (NULL for annual)

  category TEXT NOT NULL,                     -- staff_salary, infrastructure, events, mentoring, travel, startup_support, admin, marketing
  subcategory TEXT,

  allocated_amount NUMERIC(15,2) NOT NULL,
  spent_amount NUMERIC(15,2) DEFAULT 0,
  committed_amount NUMERIC(15,2) DEFAULT 0,  -- Approved but not yet spent

  grant_id UUID REFERENCES ss_grants(id),    -- If funded by specific grant

  variance_pct NUMERIC(6,2) GENERATED ALWAYS AS (
    CASE WHEN allocated_amount > 0 THEN ((spent_amount - allocated_amount) / allocated_amount) * 100 ELSE 0 END
  ) STORED,

  notes TEXT,
  approved_by UUID REFERENCES profiles(id),

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(fiscal_year, quarter, category, subcategory, institution_id)
);

-- Revenue & sustainability tracking
CREATE TABLE ss_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  fiscal_year TEXT NOT NULL,
  month INTEGER CHECK (month BETWEEN 1 AND 12),

  source TEXT NOT NULL CHECK (source IN (
    'rental_income',       -- Space rental to startups
    'service_fees',        -- Mentoring, training, consulting
    'equity_returns',      -- Returns from startup equity
    'licensing_ip',        -- IP licensing revenue
    'event_sponsorship',   -- Event/demo day sponsorships
    'corporate_partnership', -- Corporate tie-ups
    'government_grant',    -- Grant income (distinct from grant tracking)
    'consulting',          -- External consulting
    'training_programs',   -- Paid training programs
    'other'
  )),

  amount NUMERIC(15,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  description TEXT,

  -- Self-sustainability metrics
  is_self_generated BOOLEAN DEFAULT false,  -- true for non-grant income

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit records
CREATE TABLE ss_audit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  audit_type TEXT NOT NULL CHECK (audit_type IN ('internal_quarterly', 'external_annual', 'grant_specific', 'special')),
  audit_period_start DATE NOT NULL,
  audit_period_end DATE NOT NULL,

  auditor_name TEXT,
  auditor_organization TEXT,

  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'findings_open')),

  -- Findings
  findings_count INTEGER DEFAULT 0,
  critical_findings INTEGER DEFAULT 0,
  findings_details JSONB DEFAULT '[]',

  -- Resolution
  management_response TEXT,
  action_plan JSONB DEFAULT '[]',
  all_findings_resolved BOOLEAN DEFAULT false,

  report_url TEXT,

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Key Metrics

| Metric | Formula | Target (Training Program) |
|--------|---------|--------------------------|
| Grant Utilization Rate | utilized / received * 100 | > 85% |
| Budget Variance | (spent - allocated) / allocated * 100 | < 10% |
| Self-Sustainability Ratio | self_generated_revenue / total_expenditure * 100 | 30-40% by Year 3 |
| Audit Compliance | audits_completed_on_time / audits_due | 100% |

---

### 3F. Governance & Compliance

#### Schema

```sql
-- Governance structure
CREATE TABLE ss_governance_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  designation TEXT,
  organization TEXT,
  email TEXT,
  phone TEXT,

  -- Role in governance
  body TEXT NOT NULL CHECK (body IN (
    'board_of_directors',
    'advisory_council',
    'finance_audit_committee',
    'startup_selection_committee',
    'hr_compliance_committee',
    'internal_complaints_committee'
  )),
  role TEXT NOT NULL CHECK (role IN ('chairperson', 'member', 'secretary', 'ex_officio', 'invitee')),

  -- Term
  term_start DATE,
  term_end DATE,
  is_active BOOLEAN DEFAULT true,

  -- Conflict of interest
  coi_declaration_filed BOOLEAN DEFAULT false,
  coi_details TEXT,

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compliance tracking
CREATE TABLE ss_compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  category TEXT NOT NULL CHECK (category IN ('legal', 'financial', 'hr', 'startup', 'reporting', 'safety')),
  requirement TEXT NOT NULL,
  description TEXT,

  frequency TEXT NOT NULL CHECK (frequency IN ('one_time', 'monthly', 'quarterly', 'annually', 'as_needed')),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'not_applicable')),
  due_date DATE,
  completed_date DATE,
  completed_by UUID REFERENCES profiles(id),

  -- Evidence
  evidence_url TEXT,
  notes TEXT,

  -- Alerts
  reminder_days_before INTEGER DEFAULT 30,
  is_critical BOOLEAN DEFAULT false,

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Compliance Checklist (from training program, seeded on setup)

| Category | Requirement | Frequency |
|----------|-------------|-----------|
| Legal | Company registration | One-time |
| Legal | GST registration | One-time |
| Legal | PAN/TAN registration | One-time |
| Legal | MoUs with partners | As needed |
| Financial | Statutory annual audit | Annually |
| Financial | Utilization certificates | Per grant |
| Financial | MCA annual returns | Annually |
| Financial | Income tax returns | Annually |
| HR | PF registration & compliance | Monthly |
| HR | ESIC compliance | Monthly |
| HR | POSH policy & committee | Annually |
| HR | Employment contracts | As needed |
| Startup | Onboarding documentation | Per startup |
| Startup | IP/NDA agreements | Per startup |
| Startup | Incubation agreements | Per startup |
| Reporting | Annual report to funders | Annually |
| Reporting | Quarterly progress reports | Quarterly |
| Reporting | MoE Innovation Cell data | Annually |
| Safety | Building safety certificate | Annually |
| Safety | Fire safety compliance | Annually |
| Safety | Insurance coverage | Annually |

---

### 3G. Institutional Readiness Scorecard

#### The Five Pillars (from training program)

```sql
CREATE TABLE ss_readiness_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessed_by UUID REFERENCES profiles(id),

  -- Pillar 1: Infrastructure & Technology (0-100)
  infra_score INTEGER CHECK (infra_score BETWEEN 0 AND 100),
  infra_physical_facilities INTEGER CHECK (infra_physical_facilities BETWEEN 0 AND 20),
  infra_it_systems INTEGER CHECK (infra_it_systems BETWEEN 0 AND 20),
  infra_lab_equipment INTEGER CHECK (infra_lab_equipment BETWEEN 0 AND 20),
  infra_connectivity INTEGER CHECK (infra_connectivity BETWEEN 0 AND 20),
  infra_co_working_space INTEGER CHECK (infra_co_working_space BETWEEN 0 AND 20),

  -- Pillar 2: Financial & Audit (0-100)
  finance_score INTEGER CHECK (finance_score BETWEEN 0 AND 100),
  finance_budget_process INTEGER CHECK (finance_budget_process BETWEEN 0 AND 25),
  finance_audit_compliance INTEGER CHECK (finance_audit_compliance BETWEEN 0 AND 25),
  finance_grant_management INTEGER CHECK (finance_grant_management BETWEEN 0 AND 25),
  finance_sustainability_plan INTEGER CHECK (finance_sustainability_plan BETWEEN 0 AND 25),

  -- Pillar 3: Board Readiness (0-100)
  board_score INTEGER CHECK (board_score BETWEEN 0 AND 100),
  board_governance_structure INTEGER CHECK (board_governance_structure BETWEEN 0 AND 25),
  board_meeting_regularity INTEGER CHECK (board_meeting_regularity BETWEEN 0 AND 25),
  board_committee_formation INTEGER CHECK (board_committee_formation BETWEEN 0 AND 25),
  board_strategic_planning INTEGER CHECK (board_strategic_planning BETWEEN 0 AND 25),

  -- Pillar 4: Human Resources & Training (0-100)
  hr_score INTEGER CHECK (hr_score BETWEEN 0 AND 100),
  hr_staff_capacity INTEGER CHECK (hr_staff_capacity BETWEEN 0 AND 25),
  hr_training_programs INTEGER CHECK (hr_training_programs BETWEEN 0 AND 25),
  hr_mentor_network INTEGER CHECK (hr_mentor_network BETWEEN 0 AND 25),
  hr_policies_in_place INTEGER CHECK (hr_policies_in_place BETWEEN 0 AND 25),

  -- Pillar 5: Legal Framework Compliance (0-100)
  legal_score INTEGER CHECK (legal_score BETWEEN 0 AND 100),
  legal_registration_complete INTEGER CHECK (legal_registration_complete BETWEEN 0 AND 25),
  legal_ip_policy INTEGER CHECK (legal_ip_policy BETWEEN 0 AND 25),
  legal_incubation_policy INTEGER CHECK (legal_incubation_policy BETWEEN 0 AND 25),
  legal_sop_documentation INTEGER CHECK (legal_sop_documentation BETWEEN 0 AND 25),

  -- Composite
  overall_score INTEGER GENERATED ALWAYS AS (
    COALESCE(infra_score, 0) + COALESCE(finance_score, 0) + COALESCE(board_score, 0) +
    COALESCE(hr_score, 0) + COALESCE(legal_score, 0)
  ) STORED,  -- Out of 500, target ≥ 400 (80%)

  overall_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    (COALESCE(infra_score, 0) + COALESCE(finance_score, 0) + COALESCE(board_score, 0) +
     COALESCE(hr_score, 0) + COALESCE(legal_score, 0)) / 5.0
  ) STORED,

  weakest_pillar TEXT,
  improvement_plan TEXT,

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Target: **≥ 80% readiness score** (from training program)

---

### 3H. KPI & Impact Framework (DST / MSH / MoE aligned)

#### Why This Matters

Government funders don't care about your internal metrics. They want **their** metrics. The training program specifies exact KPIs required by DST, DBT, MSH, and MoE's Innovation Cell. Without structured KPI tracking:
- Quarterly/annual reports to funders require manual data compilation
- Impact cannot be demonstrated to justify continued funding
- NIRF Innovation ranking data is unavailable
- Comparison with peer incubators is impossible

#### Schema

```sql
-- KPI definitions (seeded with DST/MSH/MoE requirements)
CREATE TABLE ss_kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,              -- e.g. 'DST_001', 'MOE_IC_003'
  description TEXT,

  -- Categorization
  framework TEXT NOT NULL CHECK (framework IN ('dst', 'msh', 'moe_innovation_cell', 'nirf', 'internal', 'custom')),
  category TEXT NOT NULL CHECK (category IN ('input', 'output', 'outcome', 'impact')),

  -- Measurement
  data_type TEXT NOT NULL CHECK (data_type IN ('integer', 'decimal', 'currency', 'percentage', 'boolean', 'text')),
  unit TEXT,                              -- 'count', 'INR', '%', 'hours', etc.
  measurement_method TEXT,

  -- Targets
  target_value NUMERIC(15,2),
  target_period TEXT,                     -- 'annual', 'quarterly', 'cumulative'

  -- Collection
  collection_frequency TEXT DEFAULT 'quarterly' CHECK (collection_frequency IN ('monthly', 'quarterly', 'annually', 'real_time')),
  source_table TEXT,                      -- Which DB table to query
  source_query TEXT,                      -- SQL or query hint for auto-calculation
  is_auto_calculated BOOLEAN DEFAULT false,

  -- Stakeholder relevance
  relevant_to TEXT[] DEFAULT '{}',        -- ['funders', 'board', 'startups', 'policymakers']

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KPI measurements (actual values over time)
CREATE TABLE ss_kpi_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES ss_kpi_definitions(id) ON DELETE CASCADE,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  value NUMERIC(15,2) NOT NULL,
  previous_value NUMERIC(15,2),

  -- Context
  notes TEXT,
  data_source TEXT,                       -- Where the number came from
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES profiles(id),

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(kpi_id, period_start, period_end, institution_id)
);

-- Impact reports (structured per stakeholder)
CREATE TABLE ss_impact_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  report_title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'annual_report', 'quarterly_report', 'funder_specific', 'nirf_submission', 'custom'
  )),

  target_audience TEXT NOT NULL CHECK (target_audience IN ('funders', 'board', 'startups', 'policymakers', 'public', 'custom')),

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Content sections
  executive_summary TEXT,
  startup_highlights JSONB DEFAULT '[]',  -- [{name, achievement, story}]

  -- Auto-populated from KPI measurements
  kpi_snapshot JSONB DEFAULT '{}',        -- Frozen snapshot of KPIs at report time

  -- Media
  report_url TEXT,                        -- Generated PDF/HTML report
  infographic_url TEXT,

  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published')),
  approved_by UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Pre-seeded KPIs (from training program)

**DST/MSH Metrics:**

| Code | KPI | Category | Type | Auto-Calculate |
|------|-----|----------|------|----------------|
| DST_001 | Number of startups supported | Output | integer | COUNT(ss_nif_candidates WHERE stage != 'rejected') |
| DST_002 | SC/ST entrepreneurs supported | Output | integer | COUNT with demographic filter |
| DST_003 | Women entrepreneurs supported | Output | integer | COUNT with gender filter |
| DST_004 | Follow-on funds raised by startups | Outcome | currency | SUM(ss_nif_candidates.funding_amount) |
| DST_005 | Patents filed by startups | Outcome | integer | SUM(ss_alumni_tracking.patents_filed) |
| DST_006 | Jobs created by startups | Impact | integer | SUM(ss_nif_candidates.jobs_created + alumni) |
| DST_007 | Revenue generated by startups | Impact | currency | SUM(ss_nif_candidates.revenue_generated + alumni) |
| DST_008 | Impact created (economic contribution) | Impact | currency | Computed composite |
| DST_009 | Grant utilization percentage | Input | percentage | From ss_grants |
| DST_010 | Startup graduation rate | Outcome | percentage | graduated / total * 100 |

**MoE Innovation Cell Metrics:**

| Code | KPI | Frequency |
|------|-----|-----------|
| MOE_001 | Number of innovation events conducted | Real-time |
| MOE_002 | Students trained in innovation/entrepreneurship | Monthly |
| MOE_003 | Faculty trained | Monthly |
| MOE_004 | Student innovations/startups | Quarterly |
| MOE_005 | Faculty innovations/startups | Quarterly |
| MOE_006 | Awards won | Annually |
| MOE_007 | MoUs signed | Annually |
| MOE_008 | I&E, IPR courses offered | Annually |
| MOE_009 | Industrial visits conducted | Annually |
| MOE_010 | Expenditure on innovation activities | Annually |

**Internal Incubator Health Metrics:**

| Code | KPI | Target |
|------|-----|--------|
| INT_001 | Self-sustainability ratio | 30-40% by Year 3 |
| INT_002 | Mentor utilization rate | > 70% |
| INT_003 | Average time-to-graduation (months) | < 36 |
| INT_004 | Startup survival rate (2-yr post-grad) | > 70% |
| INT_005 | Mentor-to-startup ratio | 1:3 to 1:5 |
| INT_006 | Compliance score | 100% |
| INT_007 | Institutional readiness score | ≥ 80% |
| INT_008 | Risk assessment coverage | 100% of active startups |

---

### 3I. Startup Portfolio Enrichment

#### Additional Fields on `ss_nif_candidates`

```sql
-- Enrich existing NIF candidates table with training program fields
ALTER TABLE ss_nif_candidates ADD COLUMN IF NOT EXISTS
  -- Technology readiness (covered in 3A)
  current_trl INTEGER CHECK (current_trl BETWEEN 1 AND 9),
  trl_assessed_at TIMESTAMPTZ,

  -- Business enthusiasm curve
  enthusiasm_curve TEXT CHECK (enthusiasm_curve IN (
    'uninformed_optimism', 'informed_pessimism', 'valley_of_despair', 'informed_optimism', 'success'
  )),

  -- Capital types assessment (JSONB for flexibility)
  capital_assessment JSONB DEFAULT '{}',
  -- {"creative": 7, "innovation": 5, "human": 6, "financial": 3}

  -- Government registration
  dipp_number TEXT,                        -- DPIIT Startup India recognition number
  incorporation_number TEXT,
  incorporation_date DATE,
  legal_structure TEXT CHECK (legal_structure IN (
    'proprietorship', 'partnership', 'llp', 'private_limited', 'section_8', 'opc'
  )),
  gst_number TEXT,
  pan_number TEXT,

  -- Documentation
  pitch_deck_url TEXT,
  elevator_pitch TEXT,
  business_plan_url TEXT,
  logo_url TEXT,

  -- Founder/team details (enriching existing team_members JSONB)
  founder_profiles JSONB DEFAULT '[]',
  -- [{"name": "...", "role": "CEO", "linkedin": "...", "experience_years": 5, "domain": "fintech"}]

  -- Market data
  customer_count INTEGER DEFAULT 0,
  market_sector TEXT,
  target_geography TEXT,

  -- IP
  patents_filed INTEGER DEFAULT 0,
  patents_granted INTEGER DEFAULT 0,
  trademarks INTEGER DEFAULT 0,

  -- Incubation specifics
  incubation_agreement_signed BOOLEAN DEFAULT false,
  incubation_agreement_date DATE,
  allocated_space TEXT,                    -- Lab/desk/room allocation
  equity_given_pct NUMERIC(5,2),          -- If incubator takes equity

  -- KYC
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'submitted', 'verified', 'rejected')),
  kyc_documents JSONB DEFAULT '[]';
```

---

### 3J. Marketing & Outreach

```sql
CREATE TABLE ss_marketing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'newsletter', 'social_media_post', 'speaking_engagement', 'media_placement',
    'demo_day', 'networking_event', 'workshop', 'webinar', 'press_release',
    'blog_post', 'podcast', 'outreach_campaign', 'other'
  )),

  channel TEXT CHECK (channel IN (
    'linkedin', 'twitter', 'instagram', 'facebook', 'youtube',
    'email', 'print', 'tv_radio', 'event', 'website', 'other'
  )),

  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,

  -- Audience
  target_audience TEXT,                    -- e.g. 'prospective startups', 'investors', 'media'
  reach_count INTEGER DEFAULT 0,          -- How many people reached

  -- Results (from training program LinkedIn case study)
  startup_walkins INTEGER DEFAULT 0,
  new_applications INTEGER DEFAULT 0,
  investor_connections INTEGER DEFAULT 0,
  mentor_connections INTEGER DEFAULT 0,
  service_provider_connections INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  media_impressions INTEGER DEFAULT 0,

  -- Cost
  cost NUMERIC(12,2) DEFAULT 0,

  -- Links
  content_url TEXT,
  analytics_url TEXT,

  recorded_by UUID REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Integration Points

### Cross-Module Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  STARTUP STUDIO │     │  SOLUTIONS HUB   │     │   ORGANIZATION  │
│  (Innovation +  │────▶│  (Products +     │     │   (Institutions │
│   Incubation)   │     │   TRL + RDIF)    │     │    + People)    │
│                 │◀────│                  │     │                 │
│  ss_nif_cand.   │     │  sh_products     │     │  institutions   │
│  .sh_product_id │────▶│  .id             │     │  profiles       │
│                 │     │  .trl_level      │     │  departments    │
│  ss_mentors     │     │                  │     │                 │
│  .user_id       │────▶│                  │     │  .id            │
└────────┬────────┘     └──────────────────┘     └────────┬────────┘
         │                                                 │
         │              ┌──────────────────┐              │
         │              │   BILLING        │              │
         └─────────────▶│   (If startup    │◀─────────────┘
                        │    pays rent/    │
                        │    fees)         │
                        └──────────────────┘
```

### Key Integration Rules

1. **NIF → Solutions Hub**: When a startup's technology becomes a JKKN-owned product, link via `sh_product_id`. TRL tracking flows from Solutions Hub for products, from SS for startup technologies.

2. **Mentors → Profiles**: Internal mentors (JKKN staff/faculty) link to `profiles.id`. External mentors have `user_id = NULL` and store contact info directly.

3. **Grants → Billing**: If startups pay rental/service fees, this connects to the Billing module. Grant disbursements to startups could flow through Billing for audit trail.

4. **KPIs → Analytics**: Auto-calculated KPIs should query existing tables (ss_nif_candidates, ss_events, ss_alumni_tracking) rather than storing duplicate data.

5. **Compliance → Organization**: Compliance items may reference organization-level policies. Institution scoping applies to all incubation tables.

---

## 5. Implementation Priority

### Phase 1: Portfolio Intelligence (Weeks 1-2)
**Why first:** Directly enriches every NIF candidate view. Highest visibility, moderate effort.

| Item | Tables | Services | Priority |
|------|--------|----------|----------|
| TRL Integration | `ss_trl_assessments` + ALTER nif_candidates | TrlAssessmentService | P0 |
| Risk Assessment | `ss_risk_assessments`, `ss_competitive_matrices` | RiskAssessmentService | P0 |
| NIF Candidate Enrichment | ALTER nif_candidates (20+ new columns) | Update NifPipelineService | P0 |

### Phase 2: Mentor Ecosystem (Weeks 3-4)
**Why second:** Mentoring is the highest-impact incubation activity. Enables structured support.

| Item | Tables | Services | Priority |
|------|--------|----------|----------|
| Mentor Management | `ss_mentors`, `ss_mentor_matches`, `ss_mentor_sessions`, `ss_mentor_evaluations` | MentorService | P1 |

### Phase 3: Graduation & Alumni (Weeks 5-6)
**Why third:** Completes the lifecycle. Enables reporting on outcomes.

| Item | Tables | Services | Priority |
|------|--------|----------|----------|
| Graduation Engine | `ss_graduation_criteria`, `ss_graduation_evaluations` | GraduationService | P1 |
| Exit Management | `ss_exit_procedures` | ExitService | P1 |
| Alumni Tracking | `ss_alumni_tracking` | AlumniService | P1 |

### Phase 4: KPI & Reporting (Weeks 7-8)
**Why fourth:** Requires data from Phases 1-3 to be meaningful.

| Item | Tables | Services | Priority |
|------|--------|----------|----------|
| KPI Framework | `ss_kpi_definitions`, `ss_kpi_measurements` | KpiService | P2 |
| Impact Reports | `ss_impact_reports` | ImpactReportService | P2 |
| Stakeholder Dashboards | Views + config | Dashboard views | P2 |

### Phase 5: Operations & Governance (Weeks 9-10)
**Why fifth:** Important for compliance but not blocking other features.

| Item | Tables | Services | Priority |
|------|--------|----------|----------|
| Financial Management | `ss_grants`, `ss_budgets`, `ss_revenue`, `ss_audit_records` | FinanceService | P2 |
| Governance | `ss_governance_members` | GovernanceService | P3 |
| Compliance | `ss_compliance_items` | ComplianceService | P2 |
| Readiness Scorecard | `ss_readiness_assessments` | ReadinessService | P3 |

### Phase 6: Marketing & Ecosystem (Week 11)
**Why last:** Nice-to-have for tracking outreach effectiveness.

| Item | Tables | Services | Priority |
|------|--------|----------|----------|
| Marketing Activities | `ss_marketing_activities` | MarketingService | P3 |

---

## 6. New Table Summary

| # | Table Name | Domain | Columns | Priority |
|---|-----------|--------|---------|----------|
| 1 | `ss_trl_assessments` | TRL Tracking | 16 | P0 |
| 2 | `ss_mentors` | Mentor Management | 32 | P1 |
| 3 | `ss_mentor_matches` | Mentor-Startup Matching | 22 | P1 |
| 4 | `ss_mentor_sessions` | Mentoring Sessions | 17 | P1 |
| 5 | `ss_mentor_evaluations` | Mentor Performance | 17 | P1 |
| 6 | `ss_risk_assessments` | Startup Risk | 35 | P0 |
| 7 | `ss_competitive_matrices` | Competitive Analysis | 12 | P0 |
| 8 | `ss_graduation_criteria` | Graduation Rules | 10 | P1 |
| 9 | `ss_graduation_evaluations` | Graduation Assessment | 14 | P1 |
| 10 | `ss_exit_procedures` | Exit Workflow | 18 | P1 |
| 11 | `ss_alumni_tracking` | Post-Graduation | 22 | P1 |
| 12 | `ss_grants` | Grant Management | 20 | P2 |
| 13 | `ss_budgets` | Budget Tracking | 14 | P2 |
| 14 | `ss_revenue` | Revenue & Sustainability | 10 | P2 |
| 15 | `ss_audit_records` | Audit Trail | 14 | P2 |
| 16 | `ss_governance_members` | Governance Structure | 14 | P3 |
| 17 | `ss_compliance_items` | Compliance Tracking | 16 | P2 |
| 18 | `ss_readiness_assessments` | Institutional Readiness | 30 | P3 |
| 19 | `ss_kpi_definitions` | KPI Catalog | 16 | P2 |
| 20 | `ss_kpi_measurements` | KPI Values | 10 | P2 |
| 21 | `ss_impact_reports` | Impact Reporting | 16 | P2 |
| 22 | `ss_marketing_activities` | Marketing & Outreach | 20 | P3 |
| 23 | ALTER `ss_nif_candidates` | Portfolio Enrichment | +25 columns | P0 |

**Total: 22 new tables + 1 major table enrichment**

---

## 7. Dashboard Vision

### Incubation Command Center (New Dashboard Tab)

```
┌────────────────────────────────────────────────────────────────────┐
│  NIF INCUBATION DASHBOARD                                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │ Active  │  │ TRL Avg │  │ Mentor  │  │ Grant   │  │ Readiness│ │
│  │   12    │  │   4.2   │  │  1:4    │  │  78%    │  │   82%   │ │
│  │startups │  │ (of 9)  │  │ ratio   │  │utilized │  │ score   │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │
│                                                                     │
│  ┌─── Pipeline ──────────────────────────────────────────────────┐ │
│  │ Identified(5) → Screened(3) → Shortlisted(2) → Incubating(12)│ │
│  │                                            → Graduated(8)     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─── Risk Heatmap ───────┐  ┌─── TRL Distribution ───────────┐  │
│  │  🟢 Low: 4             │  │  TRL 1-3: ████░░░░░ 4          │  │
│  │  🟡 Moderate: 5        │  │  TRL 4-6: ████████░ 5 (valley) │  │
│  │  🔴 High: 2            │  │  TRL 7-9: ██████░░░ 3          │  │
│  │  ⚫ Critical: 1         │  │                                 │  │
│  └─────────────────────────┘  └─────────────────────────────────┘ │
│                                                                     │
│  ┌─── Financial Health ────┐  ┌─── Mentor Activity ────────────┐  │
│  │  Revenue:    ₹24L       │  │  Sessions this month: 18       │  │
│  │  Self-gen:   ₹8.5L (35%)│  │  Active matches: 15           │  │
│  │  Grants:     ₹15.5L     │  │  Avg satisfaction: 8.2/10     │  │
│  │  Budget var: +3%        │  │  Domains covered: 8/12        │  │
│  └─────────────────────────┘  └─────────────────────────────────┘ │
│                                                                     │
│  ┌─── DST Impact KPIs (auto-calculated) ───────────────────────┐  │
│  │  Jobs Created: 47  │  Revenue: ₹2.3Cr  │  Patents: 3       │  │
│  │  Women: 4 (33%)    │  SC/ST: 2 (17%)   │  Funds Raised:₹8Cr│  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8. What Makes This Spec Different

### Systems Thinking Applied

Most incubation management specs list features. This spec models **causal loops:**

1. **Innovation → Incubation → Products → Revenue → Sustainability**
   - Student innovations (Layer 1) feed the NIF pipeline
   - NIF candidates mature via mentoring and risk mitigation
   - Successful ones become products (Solutions Hub TRL)
   - Products generate revenue (licensing, RDIF grants)
   - Revenue reduces grant dependency (sustainability ratio)

2. **Measurement → Funding → Capacity → More Startups → More Impact**
   - Structured KPI tracking proves impact
   - Proven impact secures continued/increased funding
   - More funding enables more mentors, space, support
   - More support serves more startups
   - More startups create more impact

3. **Alumni → Mentors → Current Startups → Future Alumni**
   - Graduated startups become mentors and investors
   - Their experience benefits current startups
   - Current startups graduate and give back
   - This creates a self-reinforcing ecosystem

### The "Valley of Death" Monitor

The most critical insight from the training program: **Over 92% of startups fail not because the technology is bad, but because of market, team, or funding failures.** The risk assessment framework specifically monitors these four dimensions to catch failures early. Combined with TRL tracking, this creates an early warning system for startups entering the "Valley of Despair" (TRL 4-6, informed pessimism phase).

### Compliance as Competitive Advantage

Most incubators treat compliance as a burden. This spec treats it as **proof of operational excellence.** When every compliance item is tracked, every audit is clean, and every report is auto-generated from real data:
- Funders increase grants (they trust your numbers)
- New funders approach you (reputation spreads)
- Startups prefer you over competitors (professional operation)

---

## 9. Open Questions for Decision

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Should external mentors get MyJKKN accounts? | Yes (with limited role) / No (contact-only) | No — keep them in `ss_mentors` with `user_id = NULL`. Create accounts only for internal mentors. |
| 2 | Should financial data be in Startup Studio or a shared Finance module? | SS-only / Shared | SS-only initially. Billing module handles student fees; incubator finances are different. |
| 3 | Should KPIs auto-calculate or be manually entered? | Auto / Manual / Hybrid | Hybrid — auto-calculate from DB where possible, manual entry for external data (e.g., patents filed externally). |
| 4 | How often should risk assessments be done? | Monthly / Quarterly / On-demand | Quarterly mandatory + on-demand for milestones. |
| 5 | Should alumni tracking be voluntary survey or mandatory? | Voluntary / Mandatory / Incentivized | Incentivized — alumni who respond get featured on incubator website + invited to events. |
| 6 | Should graduation criteria be institution-configurable? | Fixed / Configurable | Configurable — different institutions may have different thresholds. |

---

*Spec authored: 2026-03-26*
*Source: DST & MSH Incubation Management Training Program + existing MyJKKN Startup Studio architecture analysis*
*Tables analyzed: 44 existing + 22 new proposed + 1 enriched = 67 total*
*Services proposed: 10 new services across 6 domains*
