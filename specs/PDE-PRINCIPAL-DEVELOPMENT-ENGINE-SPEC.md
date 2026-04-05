# MyJKKN Principal Development Engine (PDE) — Specification

> **Version:** 2.0 | **Date:** 2026-04-05
> **Supersedes:** LMS Module Spec v1.0
> **Status:** DRAFT — Awaiting approval before build
> **Philosophy:** "Humans are Principals, AI are Agents" — the system DEVELOPS Principals, not consumers.

---

## Why Not an LMS

An LMS assumes: Faculty creates → Learner consumes → Quiz proves "learning." This makes Learners into passengers, not Principals. JKKN's philosophy demands the opposite: Learners direct their own growth, choose real problems to solve, build real things, and demonstrate capability — not memorize content.

**The PDE is what happens when you take "Humans are Principals" seriously in the learning system itself.**

| LMS (What We're NOT Building) | PDE (What We ARE Building) |
|-------------------------------|---------------------------|
| Course Catalog → browse, enroll | **Quest Board** → choose a real problem to solve |
| Linear Lessons (1→2→3→...→30) | **Capability Tree** → visual skill map, learn what your quest needs |
| Exercises at end of lesson | **Build Arena** → workspace where you BUILD from Day 1 |
| Multiple-choice quizzes | **Demonstration Gates** → prove capability through action |
| Grades (78%, 85%, 92%) | **Reputation + Portfolio** → what you built and who it helped |
| Discussion forums | **Community Channels** → real-time, per-quest collaboration |
| AI Tutor (gives answers) | **AI Coach** → asks questions, challenges assumptions, tracks agency |
| Faculty analytics (completion %) | **Impact Dashboard** → builds shipped, capabilities demonstrated, lives affected |

---

## 1. True Goal

### The Problem
JKKN has 93 courses with 2,746 richly enriched lessons (Fink's taxonomy, bilingual faculty scripts, tiered exercises, Gemini prompts). But:
- Only 7 users registered (0.07% of 10,000+ potential)
- Zero assessments exist — no way to verify learning happened
- Zero social features — every Learner is isolated
- The content delivery model is passive consumption, contradicting JKKN's own philosophy

### The Solution
A Principal Development Engine that:
1. Puts REAL PROBLEMS from 44 Solutions Departments at the center
2. Lets Learners CHOOSE what to build and pull skills as needed
3. Tracks CAPABILITY demonstrated, not content consumed
4. Measures AGENCY — how independently Learners direct their AI tools
5. Generates PORTFOLIOS that prove what Learners can DO, not what they scored

### Success Metrics

| Metric | Current | 6-Month Target | 12-Month Target |
|--------|---------|----------------|-----------------|
| Enrolled Learners | 7 | 2,000+ | 5,000+ |
| Active weekly users | ~0 | 500+ | 2,000+ |
| Quests completed | 0 | 500+ | 3,000+ |
| Real solutions deployed | 0 | 20+ | 100+ |
| Average Agency Index | 0 | 40+ | 60+ |
| Portfolio entries per Learner | 0 | 3+ | 8+ |
| Peer reviews given | 0 | 2,000+ | 10,000+ |

---

## 2. Users & Roles

| Role | Count | Primary Experience |
|------|-------|--------------------|
| **Learner** | 10,000+ | Quest Board → Choose problem → Build solution → Demonstrate capability → Earn reputation |
| **Senior Learner** | 200+ | Coach Learners, validate demonstrations, curate quests, intervene for at-risk |
| **CASE Coordinator** | 6-10 | Track graduation requirements, manage quest quality, batch operations |
| **HOD / Admin** | 50+ | Impact dashboards, NAAC evidence, institutional analytics |

### Learner Journey (The Core Loop)

```
┌─────────────────────────────────────────────────────┐
│                    QUEST BOARD                        │
│  Real problems from Solutions Departments, JICATE,    │
│  NIF, industry partners, community needs              │
└──────────────────────┬──────────────────────────────┘
                       │ Learner CHOOSES a quest
                       ▼
┌─────────────────────────────────────────────────────┐
│               CAPABILITY CHECK                        │
│  "To complete this quest, you need:"                  │
│  ✅ Data Literacy L2    🔴 Prompt Engineering L3      │
│  ✅ Domain Knowledge    🔴 Testing Strategy L1        │
│  [Unlock missing capabilities via micro-lessons]      │
└──────────────────────┬──────────────────────────────┘
                       │ Learns what's needed
                       ▼
┌─────────────────────────────────────────────────────┐
│                  BUILD ARENA                           │
│  Workspace: Build your solution                       │
│  AI Coach monitors, challenges, tracks agency         │
│  Peers collaborate, review each other's work          │
│  Version history: see your progress over time         │
└──────────────────────┬──────────────────────────────┘
                       │ Solution ready
                       ▼
┌─────────────────────────────────────────────────────┐
│             DEMONSTRATION GATE                        │
│  Prove capability through ACTION:                     │
│  • Peer evaluation (2 peers score via rubric)         │
│  • AI evaluation (technical checks)                   │
│  • Senior Learner validation (domain accuracy)        │
│  All three must agree → Capability DEMONSTRATED       │
└──────────────────────┬──────────────────────────────┘
                       │ Passes gate
                       ▼
┌─────────────────────────────────────────────────────┐
│           PORTFOLIO + REPUTATION                      │
│  Quest → auto-added to portfolio                      │
│  Capabilities → verified badges on profile            │
│  Reputation points → leaderboard position             │
│  Agency Index → Principal readiness score             │
│  If solution is excellent → Solutions Hub → NIF       │
└─────────────────────────────────────────────────────┘
```

---

## 3. Current Foundation (What EXISTS)

### Content (The Ferrari Engine — Already Built)

| Asset | Count | Quality |
|-------|-------|---------|
| Courses | 93 | Rich metadata, Fink's profiles, NSQF/NHEQF/NCrF mapping |
| Lessons | 2,746 | 150 CASE lessons deeply enriched, 2,596 MATLAB lessons |
| Exercises | 2,746 × 3 tiers | Foundation / Standard / Advanced per lesson |
| Faculty Scripts | 2,746 | Bilingual Tamil+English facilitation guides |
| Gemini Prompts | ~2,000 | Curated AI prompts with verification instructions |
| Self-Checks | 2,746 × 5-7 | Specific, measurable self-assessment items |

### Codebase (43 files — Solid Foundation)

| Layer | Status |
|-------|--------|
| Types (`types/vac.ts`, 253 lines) | Complete |
| Service (`vac-service.ts`, 1,054 lines, 30+ methods) | Complete |
| Hooks (`use-vac.ts`, 917 lines) | Complete |
| Admin Pages (15) | Working |
| Learner Pages (8) | Working |
| Components (19) | Working |

### Database (Supabase staging: hhprjbgknupaplivtoib)

| Table | Records | Status |
|-------|---------|--------|
| `vac_courses` | 93 | Production-ready content |
| `vac_lessons` | 2,746 | 150 deeply enriched, rest solid |
| `vac_enrollments` | 7 | Schema works, needs real users |
| `vac_learner_progress` | 69 | Schema works, needs real data |
| `case_tracks` | 6 | Working |
| `case_graduation_requirements` | 94 | Working |
| `competency_catalog` | 9 | Needs expansion to 100+ |

---

## 4. Feature Specification

### Phase 1: Plumbing (Weeks 1-4) — Build the Infrastructure

> Phase 1 is traditional LMS infrastructure. This is the PLUMBING that Phase 2 transforms into a PDE.

#### F1.1: Assessment Engine

The assessment engine serves both traditional quizzes (Phase 1) AND demonstration gates (Phase 2). Design it flexible.

```sql
CREATE TABLE pde_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES vac_lessons(id),
  course_id UUID REFERENCES vac_courses(id),
  quest_id UUID REFERENCES pde_quests(id),          -- NULL in Phase 1
  title TEXT NOT NULL,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN (
    'quiz',              -- Traditional auto-graded (Phase 1)
    'demonstration',     -- Capability demonstration (Phase 2)
    'peer_review',       -- Peer-evaluated submission (Phase 2)
    'portfolio_entry'    -- Self-documented evidence (Phase 3)
  )),
  rubric JSONB,          -- Evaluation criteria [{criterion, weight, levels: [{label, description, points}]}]
  time_limit_minutes INTEGER,
  max_attempts INTEGER DEFAULT 3,
  pass_threshold DECIMAL DEFAULT 70.0,
  requires_peer_count INTEGER DEFAULT 0,  -- 0 = no peer review needed
  requires_faculty BOOLEAN DEFAULT false,
  auto_grade_config JSONB,  -- For quiz type: grading rules
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pde_assessment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES pde_assessments(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN (
    'multiple_choice', 'true_false', 'short_answer', 'fill_blank',
    'matching', 'ordering',
    'demonstration_prompt',  -- "Show that you can..." (Phase 2)
    'reflection'             -- Fink's Human Dimension + Caring (Phase 2)
  )),
  question_text TEXT NOT NULL,
  question_media_url TEXT,
  options JSONB,             -- MCQ options: [{text, is_correct, feedback}]
  correct_answer TEXT,
  points INTEGER DEFAULT 1,
  explanation TEXT,
  finks_dimension TEXT CHECK (finks_dimension IN (
    'foundational_knowledge', 'application', 'integration',
    'human_dimension', 'caring', 'learning_how_to_learn'
  )),
  difficulty TEXT CHECK (difficulty IN ('foundation', 'standard', 'advanced')),
  capability_id UUID,        -- Links to capability tree (Phase 2)
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pde_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES pde_assessments(id),
  learner_id UUID REFERENCES profiles(id),
  attempt_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- Quiz answers (Phase 1)
  answers JSONB,             -- [{question_id, selected_answer, is_correct, points_earned}]
  auto_score DECIMAL,
  -- Demonstration evidence (Phase 2)
  evidence_urls JSONB,       -- [{type: 'screenshot'|'video'|'code'|'document', url, description}]
  reflection TEXT,           -- Learner's self-reflection on the demonstration
  -- Peer evaluation (Phase 2)
  peer_scores JSONB,         -- [{reviewer_id, rubric_scores, feedback, timestamp}]
  peer_avg_score DECIMAL,
  -- Faculty evaluation (Phase 2)
  faculty_score DECIMAL,
  faculty_feedback TEXT,
  faculty_reviewer_id UUID,
  -- Final
  final_score DECIMAL,       -- Weighted: auto (40%) + peer (30%) + faculty (30%)
  passed BOOLEAN,
  time_spent_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_assess_lesson ON pde_assessments(lesson_id);
CREATE INDEX idx_assess_course ON pde_assessments(course_id);
CREATE INDEX idx_assess_quest ON pde_assessments(quest_id);
CREATE INDEX idx_sub_learner ON pde_submissions(learner_id);
CREATE INDEX idx_sub_assess ON pde_submissions(assessment_id);
```

##### Auto-Generation from Existing Content

Every lesson already has `exercises` (3 tiers) and `self_check` items. Auto-generate assessments:

```
For each of 2,746 lessons:
  1. self_check items → true/false questions (auto-gradeable)
  2. exercise.foundation → short-answer question
  3. Key concepts from student_content → MCQ (Gemini API generates)
  4. Pass threshold:
     - ltl_phase='learn': 60% (building understanding)
     - ltl_phase='leverage': 80% (applying knowledge)
```

This gives us assessments for ALL 2,746 lessons on day one.

##### API Routes (Phase 1)

```
POST   /api/pde/assessments                    -- Create assessment
GET    /api/pde/assessments/:id                -- Get with questions
POST   /api/pde/assessments/:id/start          -- Start attempt
POST   /api/pde/assessments/:id/submit         -- Submit + auto-grade
GET    /api/pde/assessments/:id/results         -- Get results
GET    /api/pde/assessments/lesson/:lessonId    -- Assessment for lesson
GET    /api/pde/assessments/course/:courseId    -- All for course
POST   /api/pde/assessments/auto-generate      -- Generate from content
```

##### UI Pages (Phase 1)

| Page | Role | Description |
|------|------|-------------|
| `/admin/pde/assessments/create` | Admin | Assessment builder (drag-drop questions) |
| `/admin/pde/assessments/[id]` | Admin | Edit, view submission stats |
| `/learn/assess/[id]` | Learner | Take assessment (timer, progress, submit) |
| `/learn/assess/[id]/results` | Learner | Score, explanations, retry |

---

#### F1.2: Engagement Tracking

Track what Learners DO — not just what they "complete."

```sql
CREATE TABLE pde_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'lesson_view', 'lesson_complete',
    'exercise_start', 'exercise_submit',
    'assessment_start', 'assessment_submit',
    'quest_start', 'quest_complete',           -- Phase 2
    'build_session_start', 'build_session_end', -- Phase 2
    'discussion_post', 'discussion_reply',
    'peer_review_given', 'peer_review_received',
    'ai_prompt_used', 'ai_output_modified',     -- Agency signal
    'ai_output_accepted_blindly',               -- Negative agency signal
    'capability_demonstrated',                  -- Phase 2
    'certificate_earned',
    'video_play', 'video_complete',
    'resource_download'
  )),
  course_id UUID REFERENCES vac_courses(id),
  lesson_id UUID REFERENCES vac_lessons(id),
  quest_id UUID,                               -- Phase 2
  metadata JSONB,  -- {time_spent_seconds, score, prompt_text, etc.}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pde_engagement_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  course_id UUID REFERENCES vac_courses(id),
  date DATE NOT NULL,
  lessons_viewed INTEGER DEFAULT 0,
  lessons_completed INTEGER DEFAULT 0,
  exercises_attempted INTEGER DEFAULT 0,
  assessments_taken INTEGER DEFAULT 0,
  assessment_avg_score DECIMAL,
  time_spent_minutes INTEGER DEFAULT 0,
  discussion_posts INTEGER DEFAULT 0,
  ai_prompts_used INTEGER DEFAULT 0,
  ai_outputs_modified INTEGER DEFAULT 0,      -- Agency positive signal
  ai_outputs_accepted_blind INTEGER DEFAULT 0, -- Agency negative signal
  streak_days INTEGER DEFAULT 0,
  UNIQUE(learner_id, course_id, date)
);

-- At-risk detection view
CREATE VIEW pde_at_risk_learners AS
SELECT
  e.learner_id, e.course_id, p.full_name,
  MAX(e.date) as last_active_date,
  CURRENT_DATE - MAX(e.date) as days_inactive,
  AVG(e.assessment_avg_score) as avg_score,
  SUM(e.time_spent_minutes) as total_time,
  CASE
    WHEN CURRENT_DATE - MAX(e.date) > 7 THEN 'critical'
    WHEN CURRENT_DATE - MAX(e.date) > 3 THEN 'warning'
    WHEN AVG(e.assessment_avg_score) < 50 THEN 'struggling'
    ELSE 'on_track'
  END as risk_level
FROM pde_engagement_daily e
JOIN profiles p ON e.learner_id = p.id
GROUP BY e.learner_id, e.course_id, p.full_name;

-- Indexes
CREATE INDEX idx_events_learner ON pde_engagement_events(learner_id, created_at);
CREATE INDEX idx_events_course ON pde_engagement_events(course_id);
CREATE INDEX idx_daily_learner ON pde_engagement_daily(learner_id, date);
```

##### Engagement Score Formula

```
engagement_score = (
  capability_progress * 0.25 +     -- Capabilities demonstrated / total required
  build_quality * 0.25 +           -- Average demonstration gate score
  consistency * 0.20 +             -- Streak days / 7
  social_contribution * 0.15 +     -- Peer reviews + discussion help
  agency_ratio * 0.15              -- Modified outputs / total AI interactions
) * 100
```

---

#### F1.3: Progress Wiring

Connect existing `markLessonComplete` / `startLesson` to lesson viewer UI.

| File | Change |
|------|--------|
| Lesson viewer page | "Mark Complete" button calls `markLessonComplete` |
| Lesson viewer page | `startLesson` called on page load (logs engagement event) |
| Course detail page | Real progress bar from `vac_learner_progress` |
| My Courses page | Completion % per enrolled course |

---

#### F1.4: Certificate System

```sql
CREATE TABLE pde_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  course_id UUID REFERENCES vac_courses(id),
  quest_id UUID,                              -- Phase 2: quest completion certificate
  certificate_number TEXT UNIQUE NOT NULL,     -- JKKN-PDE-2026-XXXXX
  certificate_type TEXT CHECK (certificate_type IN (
    'course_completion',    -- Finished all lessons + final assessment
    'quest_completion',     -- Completed a quest (Phase 2)
    'capability_mastery',   -- Demonstrated advanced capability (Phase 2)
    'principal_readiness'   -- Agency Index >= 60 + all CASE requirements (Phase 3)
  )),
  issued_at TIMESTAMPTZ DEFAULT now(),
  final_score DECIMAL,
  completion_hours INTEGER,
  finks_profile JSONB,          -- Fink's 6 dimensions at completion
  agency_index DECIMAL,         -- Agency Index at completion
  capabilities_demonstrated JSONB, -- List of verified capabilities
  verification_url TEXT,
  pdf_url TEXT,
  metadata JSONB
);
```

Features:
- PDF with JKKN branding, QR code, Fink's radar chart
- Public verification at `/verify/[certificate_number]` (no auth)
- Shareable link for LinkedIn / resumes
- Batch generation for all completers

---

### Phase 2: The Paradigm Shift (Weeks 5-10) — From LMS to PDE

> This is where the system transforms from "consume content" to "build solutions."

#### F2.1: Quest Board

The center of the PDE. Real problems from JKKN's ecosystem.

```sql
CREATE TABLE pde_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  problem_statement TEXT NOT NULL,  -- The real-world problem to solve
  quest_type TEXT NOT NULL CHECK (quest_type IN (
    'solo',           -- Individual quest
    'team',           -- Requires 2-5 Learners
    'cross_dept',     -- Requires Learners from different departments
    'community',      -- Serves an external community need
    'industry'        -- From industry partner / JICATE client
  )),
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')),
  -- Source
  source_type TEXT CHECK (source_type IN (
    'solutions_dept',  -- From one of 44 Solutions Departments
    'jicate_client',   -- From JICATE Solutions client pipeline
    'nif',             -- From Nattraja Incubation Forum
    'industry',        -- From industry partner
    'community',       -- From community need
    'faculty',         -- Senior Learner-designed
    'learner'          -- Learner-proposed (validated by faculty)
  )),
  source_department TEXT,
  source_contact TEXT,
  -- Requirements
  required_capabilities JSONB, -- [{capability_id, min_level}]
  estimated_hours INTEGER,
  max_team_size INTEGER DEFAULT 1,
  -- Rewards
  reputation_points INTEGER DEFAULT 100,
  badges JSONB,                -- Badges earned on completion
  solutions_hub_eligible BOOLEAN DEFAULT false,
  nif_eligible BOOLEAN DEFAULT false,
  -- Expected deliverable
  deliverable_description TEXT NOT NULL,
  deliverable_rubric JSONB,   -- How the deliverable is evaluated
  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN (
    'draft', 'open', 'in_progress', 'completed', 'archived'
  )),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pde_quest_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID REFERENCES pde_quests(id),
  learner_id UUID REFERENCES profiles(id),
  team_id UUID,                -- NULL for solo quests
  role TEXT,                   -- 'lead', 'member', 'reviewer'
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'abandoned', 'paused'
  )),
  UNIQUE(quest_id, learner_id)
);

CREATE TABLE pde_quest_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID REFERENCES pde_quests(id),
  learner_id UUID REFERENCES profiles(id),
  team_id UUID,
  submission_type TEXT CHECK (submission_type IN (
    'milestone',    -- Intermediate checkpoint
    'final'         -- Quest completion submission
  )),
  title TEXT NOT NULL,
  description TEXT,
  evidence_urls JSONB,        -- Screenshots, code repos, demos, videos
  reflection TEXT,            -- What I learned, what was hard, what I'd do differently
  -- Evaluation
  peer_scores JSONB,
  faculty_score DECIMAL,
  auto_score DECIMAL,         -- Technical checks
  final_score DECIMAL,
  passed BOOLEAN,
  feedback JSONB,             -- [{reviewer, feedback, timestamp}]
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_quest_status ON pde_quests(status);
CREATE INDEX idx_quest_type ON pde_quests(quest_type);
CREATE INDEX idx_quest_diff ON pde_quests(difficulty);
CREATE INDEX idx_qenroll_learner ON pde_quest_enrollments(learner_id);
CREATE INDEX idx_qenroll_quest ON pde_quest_enrollments(quest_id);
```

##### Seeding the Quest Board

Auto-generate initial quests from existing content:

| Source | Quest Count | Example |
|--------|-------------|---------|
| 86 MATLAB course projects | 86 | "Build a radiograph quality scorer for JKKN Dental" |
| 150 CASE lesson capstones | 5 | "Deploy an AI solution that serves real users" |
| Solutions Hub backlog | 20+ | Problems from 44 departments |
| JICATE client pipeline | 5-10 | Real client needs |
| Community needs | 10+ | Komarapalayam-area problems |

##### Quest Board UI

```
┌─────────────────────────────────────────────┐
│ 🎯 QUEST BOARD              [Filter] [Sort] │
├─────────────────────────────────────────────┤
│                                              │
│ 🔥 NEW  Drug Interaction Alert System        │
│ Pharmacy + CS · Team (3-5) · Advanced        │
│ "Build a system that alerts pharmacists       │
│  when prescribed drugs interact dangerously"  │
│ Capabilities: Data Modeling L3, AI L2, UX L1 │
│ 🏆 200 pts · Solutions Hub eligible           │
│ [3 teams working] [Start Quest →]            │
│                                              │
│ ⚡ HOT  Crop Disease Identifier              │
│ Agriculture + Vision AI · Solo · Intermediate │
│ "Photograph a crop leaf, identify disease,    │
│  recommend treatment — for Tamil Nadu farms"  │
│ Capabilities: Image Processing L2, Gemini L2 │
│ 🏆 150 pts · NIF eligible                    │
│ [7 Learners working] [Start Quest →]         │
│                                              │
│ 🆕 NEW  Patient No-Show Predictor            │
│ Health + Data · Solo · Beginner              │
│ "Help JKKN Dental Clinic reduce missed        │
│  appointments using historical data"          │
│ Capabilities: Data Literacy L1, Gemini L1    │
│ 🏆 100 pts                                   │
│ [Start Quest →]                              │
│                                              │
└─────────────────────────────────────────────┘
```

---

#### F2.2: Capability Tree

Non-linear skill map. Learners unlock capabilities in any order based on what their quest needs.

```sql
CREATE TABLE pde_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'ai_fluency',       -- Sem 1 capabilities
    'domain_ai',        -- Sem 2 capabilities
    'cross_functional', -- Sem 3 capabilities
    'production',       -- Sem 4 capabilities
    'human_presence',   -- H-1 capabilities
    'principal',        -- H-2 capabilities
    'technical',        -- General tech skills
    'professional'      -- Soft skills
  )),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  -- Content links
  lesson_ids JSONB,          -- Lessons that teach this capability (micro-content)
  prerequisite_ids JSONB,    -- Capabilities that must be demonstrated first
  -- Demonstration
  demonstration_rubric JSONB, -- How to prove you have this capability
  evidence_types JSONB,       -- What counts as evidence: ['code', 'presentation', 'reflection', 'peer_testimony']
  -- Metadata
  finks_dimension TEXT,
  estimated_hours DECIMAL,
  is_core BOOLEAN DEFAULT false, -- Required for CASE graduation
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pde_learner_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  capability_id UUID REFERENCES pde_capabilities(id),
  status TEXT DEFAULT 'locked' CHECK (status IN (
    'locked',        -- Prerequisites not met
    'available',     -- Can start learning
    'in_progress',   -- Learning / practicing
    'demonstrated',  -- Passed demonstration gate
    'mastered'       -- Demonstrated + applied in quest
  )),
  demonstrated_at TIMESTAMPTZ,
  demonstration_evidence JSONB,
  demonstration_score DECIMAL,
  mastered_at TIMESTAMPTZ,
  mastery_quest_id UUID,      -- Quest where this was applied
  UNIQUE(learner_id, capability_id)
);
```

##### Seeding from Existing Content

Map 2,746 lessons to ~120 capabilities:

| Category | Capabilities | Derived From |
|----------|-------------|--------------|
| AI Fluency | 20 | AI-FLUENCY-30H lessons |
| Cross-Functional | 15 | AI-CROSSFUNC-30H lessons |
| Production | 15 | AI-CAPSTONE-30H lessons |
| Human Presence | 15 | HUMAN-PRESENCE-30H lessons |
| Principal Leadership | 15 | HUMAN-PRINCIPAL-30H lessons |
| MATLAB Domain | 30 | 86 MATLAB course key skills |
| Technical General | 10 | Cross-cutting technical skills |

Each capability links to 2-5 lessons as micro-content. Non-linear: learn in any order.

##### Capability Tree UI

```
┌─────────────────────────────────────────────────┐
│ 🌳 MY CAPABILITY TREE         [AI Fluency ▼]    │
├─────────────────────────────────────────────────┤
│                                                  │
│  ✅ What is AI (L1)                              │
│    └─✅ How AI Works (L1)                        │
│       ├─✅ First AI Conversation (L1)            │
│       │  └─🔵 Prompt Engineering (L2)  ← YOU    │
│       │     ├─🔒 Advanced Prompting (L3)         │
│       │     └─🔒 Prompt Chains (L3)              │
│       └─✅ AI Discovery (L1)                     │
│          └─🔵 Research with AI (L2)              │
│             └─🔒 Evidence Synthesis (L3)         │
│                                                  │
│  Legend: ✅ Demonstrated  🔵 In Progress          │
│          🔒 Locked  ⭐ Mastered (applied in quest)│
│                                                  │
│  Progress: 8/20 capabilities demonstrated        │
│  Agency Index: 42 (Level 2: Directed Learner)    │
└─────────────────────────────────────────────────┘
```

---

#### F2.3: Build Arena

Where Learners actually BUILD their quest solutions.

```sql
CREATE TABLE pde_build_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  quest_id UUID REFERENCES pde_quests(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  -- AI interaction tracking (for Agency Index)
  ai_interactions JSONB,    -- [{prompt, response, modified: bool, accepted_blind: bool, timestamp}]
  ai_prompts_count INTEGER DEFAULT 0,
  ai_outputs_modified INTEGER DEFAULT 0,
  ai_outputs_blind INTEGER DEFAULT 0,
  -- Build artifacts
  artifacts JSONB,          -- [{type, url, description, version}]
  notes TEXT,               -- Learner's build notes
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Build Arena is primarily a UI concept — a workspace page where:
- Left panel: Quest requirements + capability checklist
- Center: Build workspace (code editor, document editor, or upload area)
- Right panel: AI Coach chat
- Bottom: Build history timeline

---

#### F2.4: Demonstration Gates

Replace quizzes with capability demonstrations for Phase 2+ content.

```
Traditional Quiz:
  "Which of these is the Principal-Agent framework?"
  A) Humans direct AI  B) AI directs humans  C) Both equal  D) Neither

Demonstration Gate:
  "Show that you can direct an AI as a Principal:
   1. Choose a real problem from your department
   2. Write a prompt strategy (3+ prompts in sequence)
   3. Execute the strategy with Gemini
   4. Document: what worked, what you corrected, what Gemini got wrong
   5. Explain your verification process

   Evaluated by:
   - 2 peers (using rubric: clarity, verification quality, critical thinking)
   - AI system (checks: prompts exist, corrections documented, output not copy-pasted)
   - Senior Learner (validates: real problem, genuine understanding, not performed)"
```

---

#### F2.5: Discussion Channels (Real-Time)

```sql
CREATE TABLE pde_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'quest',      -- Per-quest team channel
    'capability', -- Per-capability help channel
    'course',     -- Per-course general channel
    'showcase',   -- Show-and-tell: share builds
    'help'        -- Cross-cutting help requests
  )),
  reference_id UUID,          -- quest_id, capability_id, or course_id
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pde_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES pde_channels(id),
  author_id UUID REFERENCES profiles(id),
  parent_id UUID REFERENCES pde_messages(id),  -- Thread replies
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN (
    'text', 'code', 'image', 'link', 'achievement', 'help_request'
  )),
  reactions JSONB DEFAULT '{}',   -- {emoji: [user_ids]}
  is_pinned BOOLEAN DEFAULT false,
  is_answer BOOLEAN DEFAULT false, -- Faculty-marked best answer
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_msg_channel ON pde_messages(channel_id, created_at);
```

---

#### F2.6: Reputation System

```sql
CREATE TABLE pde_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  total_points INTEGER DEFAULT 0,
  level TEXT DEFAULT 'apprentice' CHECK (level IN (
    'apprentice',    -- 0-99 points
    'practitioner',  -- 100-499 points
    'expert',        -- 500-1499 points
    'principal',     -- 1500-4999 points
    'mentor'         -- 5000+ points
  )),
  -- Breakdown
  quest_points INTEGER DEFAULT 0,
  capability_points INTEGER DEFAULT 0,
  social_points INTEGER DEFAULT 0,
  consistency_points INTEGER DEFAULT 0,
  -- Stats
  quests_completed INTEGER DEFAULT 0,
  capabilities_demonstrated INTEGER DEFAULT 0,
  peer_reviews_given INTEGER DEFAULT 0,
  peer_reviews_helpful INTEGER DEFAULT 0,
  help_given_count INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(learner_id)
);

CREATE TABLE pde_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,
  category TEXT CHECK (category IN (
    'capability', 'quest', 'social', 'streak', 'special'
  )),
  points INTEGER DEFAULT 0,
  criteria JSONB  -- Auto-award conditions
);

CREATE TABLE pde_learner_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  badge_id UUID REFERENCES pde_badges(id),
  earned_at TIMESTAMPTZ DEFAULT now(),
  evidence TEXT,
  UNIQUE(learner_id, badge_id)
);
```

##### Point System

| Action | Points | Why |
|--------|--------|-----|
| Complete a quest (beginner) | 50 | Reward building |
| Complete a quest (advanced) | 200 | Harder = more reward |
| Demonstrate a capability | 30 | Skill verified |
| Give a helpful peer review | 20 | Social contribution |
| Answer a help request | 15 | Helping others |
| 7-day streak | 25 | Consistency |
| Solution accepted to Solutions Hub | 500 | Real-world impact |
| Solution enters NIF incubation | 1000 | Entrepreneurship |

##### Badges (Seed Set)

| Badge | Criteria | Category |
|-------|----------|----------|
| First Build | Complete first quest | quest |
| Peer Mentor | 10 helpful peer reviews | social |
| Principal | Agency Index >= 60 | capability |
| Streak Master | 30-day streak | streak |
| Cross-Pollinator | Complete cross-department quest | quest |
| Solutions Builder | Solution in Solutions Hub | special |
| NIF Founder | Solution in NIF incubation | special |
| Voice of Reason | 50 discussion posts marked helpful | social |

---

### Phase 3: Intelligence Layer (Weeks 11-16)

#### F3.1: AI Coach (Not Tutor)

The AI Coach asks questions and challenges — it doesn't give answers.

```sql
CREATE TABLE pde_coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  context_type TEXT CHECK (context_type IN ('lesson', 'quest', 'build', 'reflection')),
  context_id UUID,           -- lesson_id, quest_id, etc.
  messages JSONB,            -- [{role: 'learner'|'coach', content, timestamp}]
  coaching_style TEXT,       -- Adapted based on Agency Index level
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

##### Coaching Styles (Adapt to Agency Level)

| Agency Level | Style | Example Response |
|-------------|-------|-----------------|
| 1 (Dependent) | Scaffolding | "Let's break this into 3 steps. What do you think Step 1 should be?" |
| 2 (Directed) | Guided | "You've got the right idea. What would happen if the input data is empty?" |
| 3 (Independent) | Challenging | "Your solution works. But would you trust it with a real patient's data? What's missing?" |
| 4 (Self-Directed) | Socratic | "Interesting approach. What would someone who disagrees with your design say?" |
| 5 (Principal) | Peer | "I'd push back on one thing — your error handling assumes the network is always available." |

##### Guardrails

| Rule | Implementation |
|------|----------------|
| Never give quest answers | System prompt: "Guide thinking, never solve" |
| Challenge blind AI acceptance | If Learner pastes Gemini output: "What did you change? What did you verify?" |
| Escalate to faculty | Same question 3+ times → flag for human intervention |
| Track agency signals | Every interaction scored: initiative, modification, verification |
| Tamil support | Respond in same language as question |
| Token budget | 2,000 tokens/response, 50 messages/lesson/Learner |

---

#### F3.2: Agency Index

The defining metric of the PDE — measures how independently Learners direct AI.

```sql
CREATE TABLE pde_agency_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES profiles(id),
  course_id UUID REFERENCES vac_courses(id),
  assessment_date DATE,
  -- 5 Dimensions (each 0-100)
  initiative DECIMAL,          -- Self-starts AI interactions vs waits to be told
  self_direction DECIMAL,      -- Modifies AI outputs vs copy-pastes
  tool_mastery DECIMAL,        -- Prompt sophistication improvement over time
  critical_evaluation DECIMAL, -- Verifies AI output vs accepts blindly
  ethical_judgment DECIMAL,    -- Flags AI bias/errors vs ignores them
  -- Composite
  overall DECIMAL,             -- Weighted average
  level TEXT CHECK (level IN (
    'dependent',       -- 0-19: Needs hand-holding
    'directed',        -- 20-39: Follows instructions well
    'independent',     -- 40-59: Works alone competently
    'self_directed',   -- 60-79: Directs AI effectively
    'principal'        -- 80-100: Teaches others to direct AI
  )),
  evidence JSONB,              -- Links to interactions that contributed
  created_at TIMESTAMPTZ DEFAULT now()
);
```

##### Data Sources

```
initiative:
  Count self-started AI interactions / total interactions
  Signal: Learner opens AI Coach before being prompted

self_direction:
  Ratio: AI outputs modified / total AI outputs used
  Signal: Learner edits Gemini response before using it

tool_mastery:
  Prompt complexity trend (word count, constraints, specificity)
  Signal: Prompts get more sophisticated over time

critical_evaluation:
  Count "I verified this by..." in submissions / total submissions
  Signal: Learner documents verification process

ethical_judgment:
  Count AI limitation/bias flags / total AI interactions
  Signal: Learner identifies when AI is wrong or biased
```

##### CASE Graduation Requirement

- AI Mastery Track: Agency Index >= 60 (Self-Directed)
- Human Excellence Track: N/A (screen-free, no AI tools)
- Cross-graduation: Agency Index shown on certificate, visible to recruiters

---

#### F3.3: Faculty Dashboard (Impact-Focused)

Not "who completed Lesson 7" but "who is building real things."

| Section | Data |
|---------|------|
| **Quest Progress** | Active quests, completion rate, stuck teams |
| **Capability Map** | Heat map: Learners × capabilities (✅ demonstrated, 🔵 in progress, 🔒 locked) |
| **Agency Trends** | Agency Index distribution + trend over time |
| **At-Risk Alerts** | Learners inactive >3 days, failing demonstrations, low agency |
| **Impact Board** | Solutions deployed, communities served, NIF submissions |
| **Fink's Balance** | Radar chart: class average across 6 dimensions |
| **Peer Health** | Are peer reviews happening? Are they helpful? |

---

#### F3.4: MATLAB Grader LTI

Connect MATLAB Grader (already enabled on license) via LTI 1.3 for code auto-grading. Existing `lti_tools`, `lti_launches`, `lti_grades` tables support this.

---

#### F3.5: Notification System

| Type | Trigger | Channel |
|------|---------|---------|
| `quest_available` | New quest matching Learner's capabilities | Push |
| `capability_unlocked` | Prerequisite demonstrated | Push |
| `demonstration_result` | Gate evaluation complete | Push |
| `peer_review_assigned` | Assigned to review someone's work | Push + Email |
| `coach_nudge` | Inactive >3 days on active quest | Push |
| `streak_milestone` | 7, 14, 30, 60 day streaks | Push |
| `badge_earned` | New badge criteria met | Push |
| `reputation_level_up` | Hit new reputation level | Push |
| `solutions_hub_accepted` | Quest solution accepted to Hub | Push + Email |
| `at_risk_alert` | (Faculty) Learner flagged | Email |

---

## 5. Database Schema Summary

### New Tables

| Table | Phase | Purpose |
|-------|-------|---------|
| `pde_assessments` | 1 | Assessment/quiz/demonstration definitions |
| `pde_assessment_questions` | 1 | Questions within assessments |
| `pde_submissions` | 1 | Learner submissions (quiz answers + demonstration evidence) |
| `pde_engagement_events` | 1 | Raw activity log |
| `pde_engagement_daily` | 1 | Daily aggregated stats |
| `pde_certificates` | 1 | Verified certificates |
| `pde_quests` | 2 | Real-world problem quests |
| `pde_quest_enrollments` | 2 | Learner-quest assignments |
| `pde_quest_submissions` | 2 | Quest milestone + final submissions |
| `pde_capabilities` | 2 | Skill tree nodes |
| `pde_learner_capabilities` | 2 | Per-learner capability status |
| `pde_build_sessions` | 2 | Build workspace sessions + AI tracking |
| `pde_channels` | 2 | Discussion channels |
| `pde_messages` | 2 | Channel messages |
| `pde_reputation` | 2 | Learner reputation scores |
| `pde_badges` | 2 | Badge definitions |
| `pde_learner_badges` | 2 | Earned badges |
| `pde_coach_conversations` | 3 | AI Coach chat history |
| `pde_agency_index` | 3 | Agency Index scores |

**Total: 19 new tables** (prefixed `pde_` for clarity)

### Views

| View | Phase | Purpose |
|------|-------|---------|
| `pde_at_risk_learners` | 1 | Flag struggling Learners |
| `pde_quest_leaderboard` | 2 | Reputation rankings |
| `pde_finks_competency` | 3 | Fink's dimension scores per Learner |

---

## 6. API Routes (All Phases)

### Phase 1 (Plumbing)

```
POST   /api/pde/assessments                    Create assessment
GET    /api/pde/assessments/:id                Get with questions
POST   /api/pde/assessments/:id/start          Start attempt
POST   /api/pde/assessments/:id/submit         Submit + grade
GET    /api/pde/assessments/:id/results         Results
GET    /api/pde/assessments/lesson/:id          For specific lesson
POST   /api/pde/assessments/auto-generate      Generate from content
POST   /api/pde/engagement/event               Log event
GET    /api/pde/engagement/summary/:learnerId  Engagement summary
POST   /api/pde/certificates/:courseId         Generate certificate
GET    /api/pde/verify/:number                 Public verification (no auth)
```

### Phase 2 (PDE Core)

```
GET    /api/pde/quests                         Quest board (filtered)
POST   /api/pde/quests                         Create quest (admin/faculty)
GET    /api/pde/quests/:id                     Quest detail
POST   /api/pde/quests/:id/enroll              Join quest
POST   /api/pde/quests/:id/submit              Submit milestone/final
GET    /api/pde/capabilities                   Capability tree
GET    /api/pde/capabilities/me                My capability status
POST   /api/pde/capabilities/:id/demonstrate   Submit demonstration
POST   /api/pde/build/session                  Start build session
POST   /api/pde/build/session/:id/end          End build session
GET    /api/pde/channels/:id/messages          Channel messages
POST   /api/pde/channels/:id/messages          Post message
GET    /api/pde/reputation/me                  My reputation
GET    /api/pde/reputation/leaderboard         Leaderboard
GET    /api/pde/badges                         All badges
GET    /api/pde/badges/me                      My badges
```

### Phase 3 (Intelligence)

```
POST   /api/pde/coach/chat                     AI Coach message
GET    /api/pde/coach/history/:contextId       Chat history
GET    /api/pde/agency/:learnerId              Agency Index
GET    /api/pde/analytics/faculty              Faculty dashboard
GET    /api/pde/analytics/at-risk              At-risk list
GET    /api/pde/analytics/impact               Impact dashboard
POST   /api/pde/lti/launch                     MATLAB Grader LTI
POST   /api/pde/lti/grade-passback             Receive grades
```

---

## 7. UI Pages

### Learner Pages

| Page | Phase | Description |
|------|-------|-------------|
| `/learn/assess/[id]` | 1 | Take assessment |
| `/learn/assess/[id]/results` | 1 | Results + explanations |
| `/learn/certificate/[id]` | 1 | View + download certificate |
| `/learn/quests` | 2 | **Quest Board** — browse, filter, enroll |
| `/learn/quests/[id]` | 2 | Quest detail + team + progress |
| `/learn/capabilities` | 2 | **Capability Tree** — visual skill map |
| `/learn/build/[questId]` | 2 | **Build Arena** — workspace |
| `/learn/channels` | 2 | Discussion channels |
| `/learn/profile` | 2 | Reputation, badges, portfolio |
| `/learn/portfolio` | 3 | Auto-generated from quests + demonstrations |

### Faculty Pages

| Page | Phase | Description |
|------|-------|-------------|
| `/faculty/dashboard` | 1 | Overview: enrollments, progress, at-risk |
| `/faculty/assessments` | 1 | Create/edit, view submissions |
| `/faculty/quests` | 2 | Create/manage quests, evaluate submissions |
| `/faculty/demonstrations` | 2 | Review pending demonstration gates |
| `/faculty/analytics` | 3 | Impact dashboard, agency trends, Fink's radar |

### Admin Pages

| Page | Phase | Description |
|------|-------|-------------|
| `/admin/pde/assessments` | 1 | Manage all assessments |
| `/admin/pde/certificates` | 1 | Batch generation |
| `/admin/pde/quests` | 2 | Institution-wide quest management |
| `/admin/pde/capabilities` | 2 | Capability tree configuration |
| `/admin/pde/analytics` | 3 | Institution-wide PDE metrics |

### Public Pages

| Page | Phase | Description |
|------|-------|-------------|
| `/verify/[number]` | 1 | Certificate verification (no auth) |
| `/portfolio/[learnerId]` | 3 | Public portfolio page (shareable) |

---

## 8. Performance & Storage

| Data Type | Size (10K users, 1 year) | Where |
|-----------|-------------------------|-------|
| Lesson content (text/JSON) | ~50 MB | Supabase Postgres |
| Assessment questions | ~15 MB | Supabase Postgres |
| Submissions + answers | ~300 MB | Supabase Postgres |
| Engagement events | ~500 MB | Supabase Postgres |
| Quest submissions + evidence | ~200 MB | Supabase Postgres |
| Build session data | ~400 MB | Supabase Postgres |
| Coach conversations | ~200 MB | Supabase Postgres |
| Certificate PDFs | ~2 GB | Supabase Storage |
| Build artifacts (uploads) | ~5 GB | Supabase Storage |
| Videos | 0 | External (YouTube/Cloudflare) |
| **Total** | **~9 GB** | Within Supabase Pro limits |

### Performance Safeguards

| Concern | Solution |
|---------|----------|
| Concurrent lesson loads | Vercel Edge caching (content rarely changes) |
| Assessment submission spikes | Async grading queue |
| Engagement event volume | Batch insert (buffer 10, flush every 30s) |
| Analytics queries | Materialized views refreshed hourly |
| Real-time channels | Supabase Realtime (built-in) |
| AI Coach responses | Rate limit: 3 req/min per Learner |

---

## 9. Security (RLS Policies)

```sql
-- Learners see only their own submissions
CREATE POLICY "own_submissions" ON pde_submissions
  FOR SELECT USING (learner_id = auth.uid());

-- Learners submit only for themselves
CREATE POLICY "submit_own" ON pde_submissions
  FOR INSERT WITH CHECK (learner_id = auth.uid());

-- Quest board visible to all enrolled Learners
CREATE POLICY "enrolled_see_quests" ON pde_quests
  FOR SELECT USING (status IN ('open', 'in_progress'));

-- Channel messages visible to quest/course participants
CREATE POLICY "channel_participants" ON pde_messages
  FOR SELECT USING (
    channel_id IN (
      SELECT c.id FROM pde_channels c
      LEFT JOIN pde_quest_enrollments qe ON qe.quest_id = c.reference_id
      LEFT JOIN vac_enrollments ve ON ve.course_id = c.reference_id
      WHERE qe.learner_id = auth.uid() OR ve.learner_id = auth.uid()
    )
  );

-- Certificates publicly verifiable
CREATE POLICY "public_verify" ON pde_certificates
  FOR SELECT USING (true);

-- Reputation publicly visible
CREATE POLICY "public_reputation" ON pde_reputation
  FOR SELECT USING (true);
```

---

## 10. What Makes This Uniquely JKKN

| Feature | Why Only JKKN |
|---------|---------------|
| **Quest Board with REAL problems** | 44 Solutions Departments + JICATE clients generate real problems. Not simulations. |
| **Agency Index** | "Humans are Principals" measured, tracked, required for graduation. No other institution does this. |
| **Fink's Demonstration Gates** | 6 dimensions including Caring and Human Dimension — not just MCQ knowledge tests |
| **Solutions Hub → NIF pipeline** | Quest outputs can become real products. School project → startup. |
| **Cross-department quests** | 9 institutions, bioconvergence. Pharmacy + Engineering + AI on same quest. |
| **AI Coach (not tutor)** | Develops the HUMAN, not the skill. Adapts coaching style to Agency level. |
| **Bilingual Tamil + English** | Faculty scripts, coach, channels — all support Tamil |
| **Learn-Then-Leverage baked in** | Capability tree enforces: understand first, then use AI |

---

## 11. Build Order

```
PHASE 1: Plumbing (Weeks 1-4)
  Week 1: DB migrations (pde_assessments, pde_submissions, pde_engagement_*)
         + types + service layer
  Week 2: Assessment UI (builder + taker + results)
         + auto-generate from existing 2,746 lessons
  Week 3: Engagement tracking + progress wiring + at-risk view
  Week 4: Certificate system (PDF + QR + verification page)

PHASE 2: The Paradigm Shift (Weeks 5-10)
  Week 5:  Quest Board DB + service + seed from existing content
  Week 6:  Quest Board UI + quest enrollment + team formation
  Week 7:  Capability Tree DB + seed 120 capabilities from lessons
  Week 8:  Capability Tree UI + demonstration gates
  Week 9:  Channels (real-time) + Build Arena workspace
  Week 10: Reputation system + badges + leaderboard + notifications

PHASE 3: Intelligence (Weeks 11-16)
  Week 11: AI Coach (Gemini integration + coaching prompts)
  Week 12: Agency Index tracking + visualization
  Week 13: Faculty impact dashboard + NAAC evidence reports
  Week 14: MATLAB Grader LTI integration
  Week 15: Public portfolio page + shareable credentials
  Week 16: Load testing + polish + institution-wide launch
```

---

## 12. Non-Goals (Out of Scope)

| Not Building | Why |
|-------------|-----|
| Video hosting | External embeds (YouTube/Cloudflare Stream) |
| Proctored exams | Demonstration gates with peer+faculty+AI review are stronger |
| Native mobile app | PWA sufficient. Reassess after 6 months. |
| SCORM/xAPI import | No existing SCORM content. Native content is richer. |
| AR/VR | Phase 5+, needs hardware investment |
| Content marketplace | Future, after proving PDE with JKKN content |
| Plagiarism detection | Demonstration gates + peer review catch this naturally |

---

## 13. Migration from Current VAC

| Current VAC | Becomes in PDE | Migration |
|-------------|---------------|-----------|
| `vac_courses` (93) | Still used — courses are content containers | No change |
| `vac_lessons` (2,746) | Micro-content for Capability Tree | Add `capability_ids` column |
| `vac_enrollments` (7) | Still used for course-level tracking | No change |
| `vac_learner_progress` (69) | Feeds into `pde_engagement_daily` | Dual-write during transition |
| `case_tracks` (6) | Quest categories | Map tracks to quest types |
| `case_graduation_requirements` | PDE graduation = capabilities + agency + quests | Extend, don't replace |

**Zero breaking changes.** PDE tables are all NEW (`pde_*` prefix). Existing VAC continues working. PDE wraps around it.

---

*MyJKKN Principal Development Engine — Not what they learn. What they BUILD.*
*"Humans are Principals, AI are Agents"*
*JKKN Institutions — India's First Human-AI AGI Collab Campus*
