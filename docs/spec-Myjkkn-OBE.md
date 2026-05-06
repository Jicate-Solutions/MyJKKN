# OBE Module Implementation Spec

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a full Outcome-Based Education (OBE) calculation engine for autonomous colleges in India, supporting both Bloom's Taxonomy (UGC/University regulations) and Fink's Taxonomy (Management regulations), with configurable attainment targets and NBA/NAAC-ready exports aligned with Indian regulatory standards (NBA, NAAC, UGC, AICTE).

**Architecture:** 5-layer pattern (Types → Services → Hooks → Components → Pages). Taxonomy type is locked at regulation level. All weightages and attainment thresholds are configurable. Calculation engine computes CO → PO → PSO attainment in sequence.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), React Query, Shadcn UI, Tailwind CSS

---

## Indian Regulatory Framework

### Applicable Bodies

| Body | Full Name | Role in OBE |
|---|---|---|
| **NBA** | National Board of Accreditation | Accredits engineering / technical programs; mandates OBE in SAR Criterion 3 |
| **NAAC** | National Assessment and Accreditation Council | Accredits all HEIs; OBE contributes to Criterion 1 (Curriculum) and 2 (Teaching-Learning) |
| **UGC** | University Grants Commission | Governs universities; recommends Bloom's Taxonomy in learning outcomes framework |
| **AICTE** | All India Council for Technical Education | Regulates technical education; defines model curriculum with POs |
| **IQAC** | Internal Quality Assurance Cell | Mandatory cell in every NAAC-accredited college; coordinates OBE record-keeping |

### Institution Type → Regulatory Path

| Institution Type | Regulatory Body | Accreditation | Taxonomy | PO Framework |
|---|---|---|---|---|
| Engineering College | NBA + UGC + AICTE | NBA Tier-1/2 + NAAC | Bloom's | AICTE 12 POs |
| Arts & Science College | UGC + NAAC | NAAC | Bloom's | UGC graduate attributes |
| Management College (MBA) | AICTE + NAAC | NBA (Management) + NAAC | Fink's | AICTE MBA POs |
| Polytechnic | AICTE | NBA (Diploma) | Bloom's | AICTE Diploma POs |

### NBA Standard Program Outcomes (Engineering — AICTE/NBA Defined)

These 12 POs are standardized for all NBA-accredited engineering programs. The system provides these as a seed / default set when creating a new engineering program.

| Code | Program Outcome | Description |
|---|---|---|
| PO1 | Engineering Knowledge | Apply knowledge of mathematics, science, engineering fundamentals |
| PO2 | Problem Analysis | Identify, formulate, review research literature, and analyze complex engineering problems |
| PO3 | Design/Development of Solutions | Design solutions for complex engineering problems |
| PO4 | Conduct Investigations | Use research-based knowledge and research methods |
| PO5 | Modern Tool Usage | Create, select, and apply appropriate techniques, resources, and modern engineering and IT tools |
| PO6 | The Engineer and Society | Apply reasoning informed by the contextual knowledge to assess societal, health, safety, legal and cultural issues |
| PO7 | Environment and Sustainability | Understand the impact of the professional engineering solutions in societal and environmental contexts |
| PO8 | Ethics | Apply ethical principles and commit to professional ethics and responsibilities |
| PO9 | Individual and Team Work | Function effectively as an individual, and as a member or leader in diverse teams |
| PO10 | Communication | Communicate effectively on complex engineering activities |
| PO11 | Project Management and Finance | Demonstrate knowledge and understanding of the engineering and management principles |
| PO12 | Life-long Learning | Recognize the need for, and have the preparation and ability to engage in independent and life-long learning |

### AICTE Standard Program Outcomes (MBA — Management Programs)

| Code | Program Outcome | Fink's Dimension Alignment |
|---|---|---|
| PO1 | Functional Competence | FK (Foundational Knowledge), AP (Application) |
| PO2 | Analytical & Critical Thinking | AP (Application), IN (Integration) |
| PO3 | Communication Skills | HD (Human Dimension), CA (Caring) |
| PO4 | Leadership & Teamwork | HD, CA |
| PO5 | Ethical Reasoning | CA, LL |
| PO6 | Global Business Perspective | IN, LL |
| PO7 | Entrepreneurship & Innovation | AP, IN |
| PO8 | Life-long Learning | LL |

### Indian OBE Attainment Targets (Common Practice)

NBA/NAAC do not mandate fixed thresholds — they require institutions to define and justify their own targets. The following are industry-standard defaults used by most autonomous colleges:

| Achievement Rate | Attainment Level | Interpretation |
|---|---|---|
| ≥ 70% learners scored ≥ target% | **Level 3** | Highly Attained |
| 60–69% learners scored ≥ target% | **Level 2** | Attained |
| 50–59% learners scored ≥ target% | **Level 1** | Partially Attained |
| < 50% | **Level 0** | Not Attained |

**Target % per CO** (common defaults):
- Theory CO (L1–L3 Bloom's): target = 50% marks
- Higher-order CO (L4–L6 Bloom's): target = 40% marks (lower bar for harder COs)
- Lab/Practical CO: target = 60% marks

### Gap Analysis Threshold (Indian Standard)

NBA SAR Criterion 3 requires action if:
- CO Attainment < **Level 2** (i.e., < 1.5 on 3-point scale) → Minor gap
- CO Attainment = **Level 0** → Critical gap (mandatory action taken report)
- PO Attainment < **1.5** on 3-point scale → Program-level corrective action required

### Academic Year Format (Indian Standard)

- Format: `2024-25`, `2025-26` (financial year style)
- Semesters: Odd (July–November), Even (December–April)
- Annual programs: Full year tracking

---

## Terminology (JKKN Standard)

| Traditional | JKKN Term Used in This Module |
|---|---|
| students | learners |
| teachers / faculty | learning facilitators |
| syllabus | learning pathway |
| curriculum | learning framework |
| grades / marks | learning assessments |
| classroom | learning studio |

All code, UI labels, database columns, and API endpoints must use JKKN terminology.

---

## Domain Overview

### What is OBE?

Outcome-Based Education measures whether learners achieve defined learning outcomes. For autonomous colleges, this involves:

1. **Course Outcomes (COs)** — specific learning objectives per course, tagged with taxonomy level/dimension
2. **Program Outcomes (POs)** — graduate-level competencies (NBA-defined for engineering; UGC-defined for arts & science)
3. **Program Specific Outcomes (PSOs)** — competencies specific to each degree program
4. **CO–PO–PSO Mapping** — correlation matrix linking each CO to POs and PSOs (1=Low, 2=Medium, 3=High)
5. **Attainment Calculation** — direct (assessments) + indirect (surveys) → final CO attainment → PO/PSO attainment

---

## Taxonomy Support

### Bloom's Taxonomy (UGC / University Regulations)

Used when `regulation.taxonomy_type = 'blooms'`

| Level | Code | Verb Examples |
|---|---|---|
| Remember | L1 | define, list, recall, name, identify |
| Understand | L2 | explain, describe, classify, summarize |
| Apply | L3 | use, solve, demonstrate, execute, implement |
| Analyze | L4 | differentiate, compare, examine, break down |
| Evaluate | L5 | justify, critique, judge, argue, assess |
| Create | L6 | design, construct, develop, formulate, produce |

**Rules:**
- All 6 levels enabled by default
- Regulation admin can restrict allowed levels per regulation
- Each CO must be tagged with exactly one Bloom's level
- Question bank items are tagged with CO + Bloom's level for mapping

### Fink's Taxonomy (Management Regulations)

Used when `regulation.taxonomy_type = 'finks'`

| Dimension | Code | Description |
|---|---|---|
| Foundational Knowledge | FK | Understanding key information and ideas |
| Application | AP | Skills, critical thinking, managing projects |
| Integration | IN | Connecting ideas, people, realms of life |
| Human Dimension | HD | Learning about oneself and others |
| Caring | CA | Developing new feelings, interests, values |
| Learning How to Learn | LL | Self-direction, inquiry, becoming a better learner |

**Rules:**
- All 6 dimensions enabled by default; regulation admin selects active dimensions
- Fink's is **non-hierarchical** — dimensions are independent (no pyramid)
- Each CO maps to one primary dimension (multi-dimension allowed as secondary)
- Attainment is calculated per dimension, then averaged

---

## Database Schema

### Table: `obe_regulation_config`

Extends the existing regulations table with OBE configuration.

```sql
CREATE TABLE obe_regulation_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  regulation_id         UUID NOT NULL REFERENCES regulations(id) UNIQUE,
  taxonomy_type         TEXT NOT NULL CHECK (taxonomy_type IN ('blooms', 'finks')),

  -- Bloom's config (used when taxonomy_type = 'blooms')
  blooms_active_levels  TEXT[] DEFAULT ARRAY['L1','L2','L3','L4','L5','L6'],

  -- Fink's config (used when taxonomy_type = 'finks')
  finks_active_dimensions TEXT[] DEFAULT ARRAY['FK','AP','IN','HD','CA','LL'],

  -- Weightage
  direct_weightage      NUMERIC(4,2) NOT NULL DEFAULT 80.00,  -- e.g., 80.00
  indirect_weightage    NUMERIC(4,2) NOT NULL DEFAULT 20.00,  -- e.g., 20.00

  -- Indirect assessment scale
  indirect_scale_max    INTEGER NOT NULL DEFAULT 5,
  attainment_scale_max  INTEGER NOT NULL DEFAULT 3,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT weightage_sum_check CHECK (direct_weightage + indirect_weightage = 100)
);
```

### Table: `obe_program_outcomes`

```sql
CREATE TABLE obe_program_outcomes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id),
  program_id        UUID NOT NULL REFERENCES programs(id),
  po_code           TEXT NOT NULL,        -- e.g., "PO1", "PO2"
  po_description    TEXT NOT NULL,
  po_category       TEXT,                 -- NBA-defined category (optional)
  sort_order        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(program_id, po_code)
);
```

### Table: `obe_program_specific_outcomes`

```sql
CREATE TABLE obe_program_specific_outcomes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id),
  program_id        UUID NOT NULL REFERENCES programs(id),
  pso_code          TEXT NOT NULL,        -- e.g., "PSO1", "PSO2"
  pso_description   TEXT NOT NULL,
  sort_order        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(program_id, pso_code)
);
```

### Table: `obe_course_outcomes`

```sql
CREATE TABLE obe_course_outcomes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id),
  course_id         UUID NOT NULL REFERENCES courses(id),
  co_code           TEXT NOT NULL,        -- e.g., "CO1", "CO2"
  co_description    TEXT NOT NULL,

  -- Taxonomy tagging
  taxonomy_level    TEXT,    -- Bloom's: 'L1'|'L2'|'L3'|'L4'|'L5'|'L6'
  taxonomy_dimension TEXT,   -- Fink's: 'FK'|'AP'|'IN'|'HD'|'CA'|'LL'
  secondary_dimensions TEXT[], -- Fink's secondary dimensions (optional)

  -- Attainment target — configurable per CO
  target_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00,  -- e.g., 50% of learners
  attainment_level_3_threshold NUMERIC(5,2) DEFAULT 70.00, -- ≥70% → Level 3
  attainment_level_2_threshold NUMERIC(5,2) DEFAULT 60.00, -- 60-69% → Level 2
  attainment_level_1_threshold NUMERIC(5,2) DEFAULT 50.00, -- 50-59% → Level 1
  -- Below level_1_threshold → Level 0

  sort_order        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(course_id, co_code)
);
```

### Table: `obe_co_po_mapping`

```sql
CREATE TABLE obe_co_po_mapping (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id),
  co_id             UUID NOT NULL REFERENCES obe_course_outcomes(id),
  po_id             UUID NOT NULL REFERENCES obe_program_outcomes(id),
  correlation_level INTEGER NOT NULL CHECK (correlation_level IN (0, 1, 2, 3)),
  -- 0 = No mapping, 1 = Low, 2 = Medium, 3 = High
  created_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(co_id, po_id)
);
```

### Table: `obe_co_pso_mapping`

```sql
CREATE TABLE obe_co_pso_mapping (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id),
  co_id             UUID NOT NULL REFERENCES obe_course_outcomes(id),
  pso_id            UUID NOT NULL REFERENCES obe_program_specific_outcomes(id),
  correlation_level INTEGER NOT NULL CHECK (correlation_level IN (0, 1, 2, 3)),
  created_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(co_id, pso_id)
);
```

### Table: `obe_assessment_components`

```sql
CREATE TABLE obe_assessment_components (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id),
  course_id         UUID NOT NULL REFERENCES courses(id),
  component_name    TEXT NOT NULL,   -- e.g., "CIA-1", "ESE", "Assignment-1", "Lab"
  component_type    TEXT NOT NULL CHECK (component_type IN (
    'cia', 'ese', 'assignment', 'lab', 'seminar', 'project', 'other'
  )),
  max_marks         NUMERIC(6,2) NOT NULL,
  weightage         NUMERIC(5,2),    -- % contribution to direct attainment
  academic_year     TEXT,
  semester_id       UUID,
  batch_id          UUID,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

### Table: `obe_assessment_co_marks`

Links each assessment component to COs with allocated marks.

```sql
CREATE TABLE obe_assessment_co_marks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id),
  assessment_id       UUID NOT NULL REFERENCES obe_assessment_components(id),
  co_id               UUID NOT NULL REFERENCES obe_course_outcomes(id),
  max_marks_for_co    NUMERIC(6,2) NOT NULL,  -- marks allocated to this CO in this assessment
  created_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(assessment_id, co_id)
);
```

### Table: `obe_learner_co_marks`

Actual marks scored by each learner per CO per assessment.

```sql
CREATE TABLE obe_learner_co_marks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id),
  learner_id          UUID NOT NULL REFERENCES learners(id),
  assessment_id       UUID NOT NULL REFERENCES obe_assessment_components(id),
  co_id               UUID NOT NULL REFERENCES obe_course_outcomes(id),
  marks_obtained      NUMERIC(6,2) NOT NULL,
  is_absent           BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(learner_id, assessment_id, co_id)
);
```

### Table: `obe_indirect_assessments`

Course exit surveys and indirect feedback.

```sql
CREATE TABLE obe_indirect_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id),
  course_id         UUID NOT NULL REFERENCES courses(id),
  co_id             UUID NOT NULL REFERENCES obe_course_outcomes(id),
  assessment_source TEXT NOT NULL CHECK (assessment_source IN (
    'course_exit_survey', 'alumni_survey', 'employer_feedback', 'parent_feedback'
  )),
  learner_id        UUID REFERENCES learners(id),  -- null for alumni/employer
  score             NUMERIC(3,1) NOT NULL,         -- e.g., 3.5 out of 5
  academic_year     TEXT,
  semester_id       UUID,
  batch_id          UUID,
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### Table: `obe_co_attainment` (Calculated Results Cache)

```sql
CREATE TABLE obe_co_attainment (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            UUID NOT NULL REFERENCES institutions(id),
  course_id                 UUID NOT NULL REFERENCES courses(id),
  co_id                     UUID NOT NULL REFERENCES obe_course_outcomes(id),
  batch_id                  UUID,
  semester_id               UUID,
  academic_year             TEXT,

  -- Direct attainment
  direct_attainment_level   NUMERIC(4,2),   -- 0 to 3
  direct_attainment_value   NUMERIC(5,2),   -- percentage of learners achieving target
  learner_count             INTEGER,
  learners_achieving_target INTEGER,

  -- Indirect attainment
  indirect_attainment_level NUMERIC(4,2),   -- 0 to 3
  indirect_average_score    NUMERIC(4,2),   -- average survey score
  indirect_response_count   INTEGER,

  -- Final attainment
  final_attainment          NUMERIC(4,2),   -- (0.8 × direct) + (0.2 × indirect)

  -- Bloom's specific
  blooms_level              TEXT,           -- CO's Bloom's level at time of calculation

  -- Fink's specific
  finks_dimension           TEXT,           -- CO's Fink's dimension at time of calculation

  calculated_at             TIMESTAMPTZ DEFAULT now(),
  calculation_version       INTEGER DEFAULT 1,

  UNIQUE(co_id, batch_id, semester_id, academic_year)
);
```

### Table: `obe_po_attainment` (Calculated Results Cache)

```sql
CREATE TABLE obe_po_attainment (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id),
  program_id          UUID NOT NULL REFERENCES programs(id),
  po_id               UUID NOT NULL REFERENCES obe_program_outcomes(id),
  batch_id            UUID,
  academic_year       TEXT,

  po_attainment       NUMERIC(4,2),   -- 0 to 3
  contributing_cos    INTEGER,        -- number of COs that mapped to this PO

  calculated_at       TIMESTAMPTZ DEFAULT now(),

  UNIQUE(po_id, batch_id, academic_year)
);
```

### Table: `obe_pso_attainment` (Calculated Results Cache)

```sql
CREATE TABLE obe_pso_attainment (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id),
  program_id          UUID NOT NULL REFERENCES programs(id),
  pso_id              UUID NOT NULL REFERENCES obe_program_specific_outcomes(id),
  batch_id            UUID,
  academic_year       TEXT,

  pso_attainment      NUMERIC(4,2),
  contributing_cos    INTEGER,

  calculated_at       TIMESTAMPTZ DEFAULT now(),

  UNIQUE(pso_id, batch_id, academic_year)
);
```

---

## Calculation Engine Logic

### Step 1: Direct CO Attainment (per learner, per CO, per assessment)

```
For each learner:
  CO_percentage = (marks_obtained_for_CO / max_marks_for_CO) × 100

For each CO in course:
  learners_achieving = COUNT of learners where CO_percentage ≥ target_percentage
  class_achievement_rate = (learners_achieving / total_learners) × 100

Direct Attainment Level:
  IF class_achievement_rate >= attainment_level_3_threshold → Level 3
  ELSE IF >= attainment_level_2_threshold → Level 2
  ELSE IF >= attainment_level_1_threshold → Level 1
  ELSE → Level 0
```

**Note for Bloom's Taxonomy:** Higher cognitive levels (L5, L6) may have lower target_percentage configured, acknowledging the difficulty of higher-order tasks.

**Note for Fink's Taxonomy:** All dimension-tagged COs use the same calculation formula — there is no hierarchy between dimensions. Attainment per dimension = average of attainment levels of all COs tagged with that dimension.

### Step 2: Indirect CO Attainment

```
For each CO:
  average_survey_score = AVG(score) from obe_indirect_assessments
  indirect_attainment = (average_survey_score / indirect_scale_max) × attainment_scale_max
  -- e.g., (3.8 / 5) × 3 = 2.28
```

### Step 3: Final CO Attainment

```
final_CO = (direct_weightage/100 × direct_attainment_level)
         + (indirect_weightage/100 × indirect_attainment_level)

-- Default: (0.80 × direct) + (0.20 × indirect)
-- Configurable per regulation via obe_regulation_config
```

### Step 4: PO Attainment

```
For each PO:
  numerator = SUM(final_CO_attainment × co_po_correlation_level)
              for all COs where correlation_level > 0
  denominator = SUM(co_po_correlation_level)
              for all COs where correlation_level > 0

  PO_attainment = numerator / denominator
  -- Returns value in 0–3 scale
```

### Step 5: PSO Attainment

Same formula as PO, using `obe_co_pso_mapping`.

### Bloom's Specific: Level-wise Summary

For Bloom's regulations, the system additionally produces:
```
Bloom's Attainment by Level:
  L1 COs: average final attainment of all COs tagged L1
  L2 COs: ...
  ...
  L6 COs: average final attainment of all COs tagged L6
```

### Fink's Specific: Dimension-wise Summary

For Fink's regulations:
```
Fink's Attainment by Dimension:
  FK (Foundational Knowledge): average final attainment of all COs tagged FK
  AP (Application): ...
  ...
  LL (Learning How to Learn): ...
```

---

## Module Structure (Actual MyJKKN Folder Conventions)

> **Verified against actual project structure.** OBE is an academic sub-module.
> The project uses `_components/` folders co-located inside route directories for page-specific components.
> Shared/reusable components go in `components/academic/obe/`.

```
MyJKKN/
│
├── types/
│   └── obe.ts                              # All OBE TypeScript interfaces (single file per module)
│
├── lib/services/obe/                        # Service layer (follows lib/services/academic/ pattern)
│   ├── obe-regulation-config-service.ts
│   ├── obe-course-outcome-service.ts
│   ├── obe-po-pso-service.ts
│   ├── obe-co-po-mapping-service.ts
│   ├── obe-assessment-service.ts
│   ├── obe-marks-service.ts
│   ├── obe-indirect-service.ts
│   ├── obe-attainment-engine.ts            # Pure calculation logic (no DB calls)
│   └── obe-report-service.ts               # NBA/NAAC export generation
│
├── hooks/obe/                               # React hooks (follows hooks/academic/ pattern)
│   ├── use-obe-regulation-config.ts
│   ├── use-course-outcomes.ts
│   ├── use-po-pso.ts
│   ├── use-co-po-mapping.ts
│   ├── use-obe-assessments.ts
│   ├── use-obe-marks.ts
│   ├── use-indirect-assessments.ts
│   └── use-obe-attainment.ts
│
├── components/academic/obe/                 # Shared OBE UI components
│   ├── taxonomy-level-badge.tsx            # Bloom's L1–L6 or Fink's FK/AP/... badge
│   ├── attainment-level-indicator.tsx      # Level 0/1/2/3 color chip
│   ├── co-po-matrix.tsx                    # CO×PO/PSO mapping grid
│   └── attainment-heatmap.tsx              # CO attainment heatmap table
│
├── app/(routes)/academic/obe/              # OBE under academic module
│   │
│   ├── layout.tsx                          # OBE sub-navigation layout
│   ├── page.tsx                            # OBE Dashboard
│   │
│   ├── regulation-config/
│   │   ├── page.tsx
│   │   └── _components/                    # Page-specific components
│   │       ├── regulation-config-form.tsx
│   │       └── taxonomy-config-panel.tsx
│   │
│   ├── course-outcomes/
│   │   ├── page.tsx
│   │   └── _components/
│   │       ├── co-table.tsx
│   │       ├── co-form.tsx                 # Sheet drawer for create/edit CO
│   │       ├── taxonomy-verb-helper.tsx    # Bloom's verb suggestion popup
│   │       └── co-thresholds-panel.tsx     # Attainment threshold config per CO
│   │
│   ├── po-pso/
│   │   ├── page.tsx                        # PO/PSO list management
│   │   ├── _components/
│   │   │   ├── po-table.tsx
│   │   │   ├── pso-table.tsx
│   │   │   └── po-form.tsx
│   │   └── mapping/
│   │       ├── page.tsx                    # CO–PO–PSO matrix
│   │       └── _components/
│   │           └── mapping-matrix.tsx
│   │
│   ├── assessments/
│   │   ├── page.tsx                        # Assessment component list
│   │   ├── _components/
│   │   │   ├── assessment-table.tsx
│   │   │   └── assessment-form.tsx
│   │   └── [assessmentId]/
│   │       └── marks/
│   │           ├── page.tsx                # Learner marks entry
│   │           └── _components/
│   │               ├── marks-entry-table.tsx
│   │               └── absent-toggle.tsx
│   │
│   ├── indirect/
│   │   ├── page.tsx                        # Survey / indirect assessment entry
│   │   └── _components/
│   │       └── indirect-survey-table.tsx
│   │
│   ├── attainment/
│   │   ├── page.tsx                        # Trigger calculation + overview
│   │   ├── _components/
│   │   │   ├── calculate-button.tsx        # Triggers attainment engine
│   │   │   └── attainment-summary-cards.tsx
│   │   ├── co/
│   │   │   ├── page.tsx                    # CO attainment heatmap + details
│   │   │   └── _components/
│   │   │       ├── co-attainment-table.tsx
│   │   │       └── blooms-or-finks-summary.tsx  # Conditional on taxonomy_type
│   │   ├── po/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── po-attainment-chart.tsx
│   │   │       └── po-co-contribution-table.tsx
│   │   └── pso/
│   │       ├── page.tsx
│   │       └── _components/
│   │           └── pso-attainment-chart.tsx
│   │
│   └── reports/
│       ├── page.tsx                        # NBA / NAAC export page
│       └── _components/
│           ├── nba-export-panel.tsx
│           ├── gap-analysis-table.tsx
│           └── action-taken-form.tsx
│
└── app/api/obe/                            # API routes (follows app/api/ pattern)
    ├── regulation-config/route.ts
    ├── course-outcomes/
    │   ├── route.ts
    │   └── [id]/route.ts
    ├── program-outcomes/
    │   ├── route.ts
    │   └── [id]/route.ts
    ├── co-po-mapping/
    │   ├── route.ts
    │   └── bulk/route.ts
    ├── assessments/
    │   ├── route.ts
    │   ├── [id]/route.ts
    │   └── [id]/marks/
    │       ├── route.ts
    │       └── bulk/route.ts
    ├── indirect/
    │   ├── route.ts
    │   └── bulk/route.ts
    ├── attainment/
    │   ├── calculate/route.ts
    │   ├── co/route.ts
    │   ├── po/route.ts
    │   └── pso/route.ts
    └── reports/
        ├── nba/route.ts
        ├── co-attainment/export/route.ts
        └── gap-analysis/route.ts
```

---

## TypeScript Interfaces

```typescript
// types/obe.ts

export type TaxonomyType = 'blooms' | 'finks';

export type BloomsLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export type FinksDimension = 'FK' | 'AP' | 'IN' | 'HD' | 'CA' | 'LL';

export const BLOOMS_LEVEL_LABELS: Record<BloomsLevel, string> = {
  L1: 'Remember',
  L2: 'Understand',
  L3: 'Apply',
  L4: 'Analyze',
  L5: 'Evaluate',
  L6: 'Create',
};

export const FINKS_DIMENSION_LABELS: Record<FinksDimension, string> = {
  FK: 'Foundational Knowledge',
  AP: 'Application',
  IN: 'Integration',
  HD: 'Human Dimension',
  CA: 'Caring',
  LL: 'Learning How to Learn',
};

export interface ObeRegulationConfig {
  id: string;
  institutionId: string;
  regulationId: string;
  taxonomyType: TaxonomyType;
  bloomsActiveLevels: BloomsLevel[];
  finksActiveDimensions: FinksDimension[];
  directWeightage: number;        // e.g., 80
  indirectWeightage: number;      // e.g., 20
  indirectScaleMax: number;       // e.g., 5
  attainmentScaleMax: number;     // e.g., 3
}

export interface CourseOutcome {
  id: string;
  institutionId: string;
  courseId: string;
  coCode: string;
  coDescription: string;
  taxonomyLevel?: BloomsLevel;      // Bloom's
  taxonomyDimension?: FinksDimension; // Fink's primary
  secondaryDimensions?: FinksDimension[]; // Fink's secondary (optional)
  targetPercentage: number;
  attainmentLevel3Threshold: number;
  attainmentLevel2Threshold: number;
  attainmentLevel1Threshold: number;
  sortOrder: number;
  isActive: boolean;
}

export interface ProgramOutcome {
  id: string;
  institutionId: string;
  programId: string;
  poCode: string;
  poDescription: string;
  poCategory?: string;
  sortOrder: number;
}

export interface CoPo Mapping {
  id: string;
  coId: string;
  poId: string;
  correlationLevel: 0 | 1 | 2 | 3;
}

export interface AttainmentLevel {
  level: 0 | 1 | 2 | 3;
  percentage?: number;    // class achievement rate
  label: 'Not Attained' | 'Attained (Low)' | 'Attained (Medium)' | 'Attained (High)';
}

export interface CoAttainmentResult {
  coId: string;
  coCode: string;
  coDescription: string;
  taxonomyLevel?: BloomsLevel;
  taxonomyDimension?: FinksDimension;
  directAttainmentLevel: number;
  directAttainmentValue: number;
  learnerCount: number;
  learnersAchievingTarget: number;
  indirectAttainmentLevel: number;
  indirectAverageScore: number;
  finalAttainment: number;
}

export interface PoAttainmentResult {
  poId: string;
  poCode: string;
  poDescription: string;
  poAttainment: number;
  contributingCos: number;
}

export interface ObeAttainmentReport {
  courseId: string;
  courseName: string;
  regulationId: string;
  taxonomyType: TaxonomyType;
  academicYear: string;
  semesterId: string;
  batchId: string;
  coAttainments: CoAttainmentResult[];
  poAttainments: PoAttainmentResult[];
  psoAttainments: PsoAttainmentResult[];

  // Bloom's summary (only when taxonomyType = 'blooms')
  bloomsLevelSummary?: Record<BloomsLevel, number>;

  // Fink's summary (only when taxonomyType = 'finks')
  finksDimensionSummary?: Record<FinksDimension, number>;

  calculatedAt: string;
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/obe/regulation-config` | Get regulation OBE config |
| POST | `/api/obe/regulation-config` | Create/update regulation config |
| GET | `/api/obe/course-outcomes?courseId=` | List COs for a course |
| POST | `/api/obe/course-outcomes` | Create CO |
| PUT | `/api/obe/course-outcomes/:id` | Update CO |
| DELETE | `/api/obe/course-outcomes/:id` | Delete CO |
| GET | `/api/obe/program-outcomes?programId=` | List POs |
| POST | `/api/obe/program-outcomes` | Create PO |
| GET | `/api/obe/co-po-mapping?courseId=` | Get CO-PO matrix |
| POST | `/api/obe/co-po-mapping/bulk` | Save CO-PO matrix (bulk upsert) |
| GET | `/api/obe/assessments?courseId=` | List assessment components |
| POST | `/api/obe/assessments` | Create assessment component |
| GET | `/api/obe/assessments/:id/marks` | Get learner marks for assessment |
| POST | `/api/obe/assessments/:id/marks/bulk` | Bulk save learner marks |
| GET | `/api/obe/indirect?courseId=` | Get indirect assessment data |
| POST | `/api/obe/indirect/bulk` | Bulk save survey scores |
| POST | `/api/obe/attainment/calculate` | Trigger attainment calculation |
| GET | `/api/obe/attainment/co?courseId=&batchId=` | Get CO attainment results |
| GET | `/api/obe/attainment/po?programId=&batchId=` | Get PO attainment results |
| GET | `/api/obe/attainment/pso?programId=&batchId=` | Get PSO attainment results |
| GET | `/api/obe/reports/nba?programId=&batchId=` | NBA full package export |
| GET | `/api/obe/reports/co-attainment/export` | CO attainment Excel/PDF |
| GET | `/api/obe/reports/gap-analysis?programId=` | Gap analysis report |

---

## Key UI Screens

### 1. OBE Dashboard
- Summary cards: CO count, POs configured, last calculated, attainment status
- Quick actions: Enter marks, calculate, export
- Filter by: academic year, semester, batch, program

### 2. Regulation OBE Config
- Taxonomy type selector (Bloom's / Fink's) — locked after first CO is created
- Bloom's: checkbox list of active levels (L1–L6)
- Fink's: checkbox list of active dimensions
- Weightage sliders: direct + indirect must total 100%
- Attainment scale max setting

### 3. Course Outcome Entry
- Table of COs with code, description, taxonomy tag
- Taxonomy badge: color-coded (Bloom's shows L1–L6 in purple gradient; Fink's shows dimension in teal)
- Attainment thresholds per CO (expandable row)
- Add/Edit CO in Sheet drawer
- CO verb helper: click a Bloom's level → shows suggested action verbs

### 4. CO–PO–PSO Mapping Matrix
- Grid: COs (rows) × POs + PSOs (columns)
- Cell: dropdown 0/1/2/3 or color-coded squares
- Bulk fill row/column
- Validation: warn if CO has no PO mapping

### 5. Marks Entry
- Assessment component selector
- Table: learner roll number, name, CO-wise marks columns
- Absent toggle per learner
- Auto-calculate CO total per learner
- Import via Excel template

### 6. Attainment Results
- CO Attainment table with direct / indirect / final columns
- Bloom's view: grouped by level (L1 COs, L2 COs, ...)
- Fink's view: grouped by dimension
- Heatmap: color-coded attainment levels (red=0, amber=1, yellow=2, green=3)
- Drill-down per CO: learner-wise marks distribution

### 7. PO / PSO Attainment
- PO attainment bar chart
- CO–PO contribution table (which COs drove PO attainment)
- Attainment vs Target comparison

### 8. NBA Reports Export
- CO Attainment Report (per course, per semester)
- PO Attainment Summary (program-level)
- PSO Attainment Summary
- Gap Analysis (POs below target)
- Action Taken Report template
- Export formats: Excel (.xlsx), PDF

---

## Validation Rules

| Rule | Details |
|---|---|
| CO taxonomy tag required | Cannot save CO without taxonomy_level (Bloom's) or taxonomy_dimension (Fink's) |
| Weightage sum | direct_weightage + indirect_weightage must = 100 |
| Marks within range | learner marks ≤ max_marks_for_co |
| Thresholds order | level_3 > level_2 > level_1 > 0 |
| CO-PO mapping completeness | Warn if any PO has 0 COs mapped |
| Marks entry before calculation | Cannot calculate attainment if no marks entered |
| Taxonomy locked after use | Cannot change taxonomy_type if COs already exist for that regulation |

---

## RLS Policies

All tables require:
1. `institution_id` check — learners can only see their institution's data
2. Role-based access:
   - `learning_facilitator` — can enter marks, view results for their courses
   - `exam_coordinator` — can configure COs, POs, mapping; run calculations
   - `hod` — can view all attainment reports for their department
   - `principal` / `management` — full read access to all reports
   - `super_admin` — full access

---

## NBA/NAAC Compliance Notes

1. **SAR Criterion 3 (NBA)**: CO attainment, PO attainment, PSO attainment required per batch per academic year
2. **Gap Analysis**: Required where PO attainment < 60% (Level < 1.8)
3. **Action Taken Report**: Template provided — captures gap, cause, action, timeline, responsible person
4. **Continuous Improvement Record**: System stores all calculation versions with `calculated_at` and `calculation_version`
5. **Indirect Assessment Minimum**: At least 60% of enrolled learners should submit course exit survey (validation warning)

---

## Bloom's vs Fink's: Key Differences Summary

| Aspect | Bloom's Taxonomy | Fink's Taxonomy |
|---|---|---|
| Structure | Hierarchical pyramid (L1 → L6) | Relational web (all equal) |
| Used for | UGC/University regulations | Management programs |
| CO tagging | One level per CO | One primary + optional secondary dimensions |
| Attainment summary | Grouped by level (L1 avg, L2 avg...) | Grouped by dimension (FK avg, AP avg...) |
| Report label | "Cognitive Level Attainment" | "Learning Dimension Attainment" |
| Verb guidance | Level-specific verbs (recall, apply, design...) | Dimension-specific outcomes |

---

---

## 5-Layer Development Spec

This section provides the exact code templates for each layer following the project's established conventions.

> **Convention rules observed from codebase:**
> - Services: `export class XxxService { private static supabase = createClientSupabaseClient() }`
> - Hooks: `useState + useCallback + useRef + useEffect` — no React Query (project uses manual fetch)
> - Error handling: `logger.error('module/submodule', 'message', error)` then rethrow
> - Toast: `toast.success()` / `toast.error()` in hook (not in service)
> - Filters: Always reset `page: 1` when non-page filters change
> - Access control: All queries check `institution_id` via `usePermissions()` hook

---

### Layer 1: Types (`types/obe.ts`)

**File:** `types/obe.ts`

```typescript
// types/obe.ts

export type TaxonomyType = 'blooms' | 'finks';

export type BloomsLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export type FinksDimension = 'FK' | 'AP' | 'IN' | 'HD' | 'CA' | 'LL';
export type CorrelationLevel = 0 | 1 | 2 | 3;
export type AttainmentLevel = 0 | 1 | 2 | 3;
export type AssessmentComponentType = 'cia' | 'ese' | 'assignment' | 'lab' | 'seminar' | 'project' | 'other';
export type IndirectAssessmentSource = 'course_exit_survey' | 'alumni_survey' | 'employer_feedback' | 'parent_feedback';

// ── Regulation Config ────────────────────────────────────────────────

export interface ObeRegulationConfig {
  id: string;
  institution_id: string;
  regulation_id: string;
  taxonomy_type: TaxonomyType;
  blooms_active_levels: BloomsLevel[];
  finks_active_dimensions: FinksDimension[];
  direct_weightage: number;
  indirect_weightage: number;
  indirect_scale_max: number;
  attainment_scale_max: number;
  created_at: string;
  updated_at: string;
}

export type CreateObeRegulationConfigDto = Omit<ObeRegulationConfig, 'id' | 'created_at' | 'updated_at'>;
export type UpdateObeRegulationConfigDto = Partial<CreateObeRegulationConfigDto>;

// ── Course Outcome ────────────────────────────────────────────────────

export interface CourseOutcome {
  id: string;
  institution_id: string;
  course_id: string;
  co_code: string;
  co_description: string;
  taxonomy_level?: BloomsLevel;
  taxonomy_dimension?: FinksDimension;
  secondary_dimensions?: FinksDimension[];
  target_percentage: number;
  attainment_level_3_threshold: number;
  attainment_level_2_threshold: number;
  attainment_level_1_threshold: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateCourseOutcomeDto = Omit<CourseOutcome, 'id' | 'created_at' | 'updated_at'>;
export type UpdateCourseOutcomeDto = Partial<CreateCourseOutcomeDto>;

export interface CourseOutcomeFilters {
  course_id?: string;
  institution_id?: string;
  is_active?: boolean;
  taxonomy_level?: BloomsLevel;
  taxonomy_dimension?: FinksDimension;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface CourseOutcomeListResponse {
  data: CourseOutcome[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── Program Outcome ───────────────────────────────────────────────────

export interface ProgramOutcome {
  id: string;
  institution_id: string;
  program_id: string;
  po_code: string;
  po_description: string;
  po_category?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateProgramOutcomeDto = Omit<ProgramOutcome, 'id' | 'created_at' | 'updated_at'>;
export type UpdateProgramOutcomeDto = Partial<CreateProgramOutcomeDto>;

// ── Program Specific Outcome ──────────────────────────────────────────

export interface ProgramSpecificOutcome {
  id: string;
  institution_id: string;
  program_id: string;
  pso_code: string;
  pso_description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateProgramSpecificOutcomeDto = Omit<ProgramSpecificOutcome, 'id' | 'created_at' | 'updated_at'>;

// ── CO-PO Mapping ─────────────────────────────────────────────────────

export interface CoPoMapping {
  id: string;
  institution_id: string;
  co_id: string;
  po_id: string;
  correlation_level: CorrelationLevel;
  created_at: string;
}

export interface CoPsoMapping {
  id: string;
  institution_id: string;
  co_id: string;
  pso_id: string;
  correlation_level: CorrelationLevel;
  created_at: string;
}

// Bulk upsert DTO for matrix save
export interface CoPoMappingBulkDto {
  co_id: string;
  po_id: string;
  correlation_level: CorrelationLevel;
}

// ── Assessment ────────────────────────────────────────────────────────

export interface AssessmentComponent {
  id: string;
  institution_id: string;
  course_id: string;
  component_name: string;
  component_type: AssessmentComponentType;
  max_marks: number;
  weightage?: number;
  academic_year?: string;
  semester_id?: string;
  batch_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateAssessmentComponentDto = Omit<AssessmentComponent, 'id' | 'created_at' | 'updated_at'>;

export interface AssessmentCoMarks {
  id: string;
  institution_id: string;
  assessment_id: string;
  co_id: string;
  max_marks_for_co: number;
  created_at: string;
}

export interface LearnerCoMarks {
  id: string;
  institution_id: string;
  learner_id: string;
  assessment_id: string;
  co_id: string;
  marks_obtained: number;
  is_absent: boolean;
  created_at: string;
  updated_at: string;
}

// ── Indirect Assessment ───────────────────────────────────────────────

export interface IndirectAssessment {
  id: string;
  institution_id: string;
  course_id: string;
  co_id: string;
  assessment_source: IndirectAssessmentSource;
  learner_id?: string;
  score: number;
  academic_year?: string;
  semester_id?: string;
  batch_id?: string;
  created_at: string;
}

// ── Attainment Results ────────────────────────────────────────────────

export interface CoAttainmentResult {
  id: string;
  institution_id: string;
  course_id: string;
  co_id: string;
  batch_id?: string;
  semester_id?: string;
  academic_year?: string;
  direct_attainment_level: number;
  direct_attainment_value: number;
  learner_count: number;
  learners_achieving_target: number;
  indirect_attainment_level: number;
  indirect_average_score: number;
  indirect_response_count: number;
  final_attainment: number;
  blooms_level?: BloomsLevel;
  finks_dimension?: FinksDimension;
  calculated_at: string;
  calculation_version: number;
  // Joined fields
  co?: CourseOutcome;
}

export interface PoAttainmentResult {
  id: string;
  institution_id: string;
  program_id: string;
  po_id: string;
  batch_id?: string;
  academic_year?: string;
  po_attainment: number;
  contributing_cos: number;
  calculated_at: string;
  po?: ProgramOutcome;
}

export interface PsoAttainmentResult {
  id: string;
  institution_id: string;
  program_id: string;
  pso_id: string;
  batch_id?: string;
  academic_year?: string;
  pso_attainment: number;
  contributing_cos: number;
  calculated_at: string;
  pso?: ProgramSpecificOutcome;
}

// ── Report ────────────────────────────────────────────────────────────

export interface ObeAttainmentReport {
  courseId: string;
  courseName: string;
  regulationId: string;
  taxonomyType: TaxonomyType;
  academicYear: string;
  semesterId: string;
  batchId: string;
  coAttainments: CoAttainmentResult[];
  poAttainments: PoAttainmentResult[];
  psoAttainments: PsoAttainmentResult[];
  bloomsLevelSummary?: Partial<Record<BloomsLevel, number>>;
  finksDimensionSummary?: Partial<Record<FinksDimension, number>>;
  calculatedAt: string;
}

export interface ObeGapAnalysisItem {
  poId: string;
  poCode: string;
  poDescription: string;
  attainment: number;
  target: number;
  gap: number;
  severity: 'critical' | 'minor' | 'none';
  contributingCos: string[];
}

// ── Filters for pages ─────────────────────────────────────────────────

export interface ObeFilters {
  institution_id?: string;
  program_id?: string;
  course_id?: string;
  batch_id?: string;
  semester_id?: string;
  academic_year?: string;
}
```

---

### Layer 2: Services (`lib/services/obe/`)

**Files to create:**
- `lib/services/obe/obe-regulation-config-service.ts`
- `lib/services/obe/obe-course-outcome-service.ts`
- `lib/services/obe/obe-po-pso-service.ts`
- `lib/services/obe/obe-assessment-service.ts`
- `lib/services/obe/obe-marks-service.ts`
- `lib/services/obe/obe-indirect-service.ts`
- `lib/services/obe/obe-attainment-engine.ts`
- `lib/services/obe/obe-report-service.ts`

**Pattern to follow** (from `regulation-service.ts`):

```typescript
// lib/services/obe/obe-course-outcome-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  CourseOutcome,
  CreateCourseOutcomeDto,
  UpdateCourseOutcomeDto,
  CourseOutcomeFilters,
  CourseOutcomeListResponse
} from '@/types/obe';

export class ObeCourseOutcomeService {
  private static supabase = createClientSupabaseClient();

  static async getCourseOutcomes(
    filters: CourseOutcomeFilters = {}
  ): Promise<CourseOutcomeListResponse> {
    try {
      let query = (this.supabase as any)
        .from('obe_course_outcomes')
        .select('*', { count: 'exact' });

      if (filters.course_id) query = query.eq('course_id', filters.course_id);
      if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
      if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
      if (filters.search) {
        query = query.or(
          `co_code.ilike.%${filters.search}%,co_description.ilike.%${filters.search}%`
        );
      }

      query = query.order('sort_order', { ascending: true });

      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      logger.error('obe/course-outcomes', 'Error fetching course outcomes', error);
      throw error;
    }
  }

  static async createCourseOutcome(data: CreateCourseOutcomeDto): Promise<CourseOutcome> {
    try {
      const { data: co, error } = await (this.supabase as any)
        .from('obe_course_outcomes')
        .insert([data])
        .select()
        .single();

      if (error) {
        logger.error('obe/course-outcomes', 'Database error creating CO', error);
        const enhanced: any = new Error(error.message || 'Failed to create course outcome');
        enhanced.code = error.code;
        throw enhanced;
      }

      return co;
    } catch (error) {
      logger.error('obe/course-outcomes', 'Error creating course outcome', error);
      throw error;
    }
  }

  static async updateCourseOutcome(
    id: string,
    data: UpdateCourseOutcomeDto
  ): Promise<CourseOutcome> {
    try {
      const { data: co, error } = await (this.supabase as any)
        .from('obe_course_outcomes')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return co;
    } catch (error) {
      logger.error('obe/course-outcomes', 'Error updating course outcome', error);
      throw error;
    }
  }

  static async deleteCourseOutcome(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('obe_course_outcomes' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      logger.error('obe/course-outcomes', 'Error deleting course outcome', error);
      throw error;
    }
  }

  static async bulkUpdateSortOrder(
    updates: { id: string; sort_order: number }[]
  ): Promise<void> {
    try {
      for (const update of updates) {
        await this.updateCourseOutcome(update.id, { sort_order: update.sort_order });
      }
    } catch (error) {
      logger.error('obe/course-outcomes', 'Error updating sort order', error);
      throw error;
    }
  }
}
```

**Attainment Engine** (`lib/services/obe/obe-attainment-engine.ts`):

```typescript
// lib/services/obe/obe-attainment-engine.ts
// Pure calculation functions — no Supabase calls here

import type {
  CourseOutcome,
  LearnerCoMarks,
  AssessmentCoMarks,
  IndirectAssessment,
  ObeRegulationConfig,
  CoAttainmentResult,
} from '@/types/obe';

export class ObeAttainmentEngine {

  /**
   * Step 1: Calculate what % of learners achieved the CO target
   */
  static calculateDirectAttainment(
    co: CourseOutcome,
    learnerMarks: LearnerCoMarks[],
    assessmentCoMarks: AssessmentCoMarks[]
  ): {
    achievementRate: number;
    learnersAchieving: number;
    totalLearners: number;
    attainmentLevel: number;
  } {
    const presentLearners = learnerMarks.filter(m => !m.is_absent);
    const totalLearners = presentLearners.length;

    if (totalLearners === 0) {
      return { achievementRate: 0, learnersAchieving: 0, totalLearners: 0, attainmentLevel: 0 };
    }

    // Group marks by learner
    const learnerGroups = new Map<string, { obtained: number; max: number }>();
    for (const mark of presentLearners) {
      const coMaxMarks = assessmentCoMarks.find(
        a => a.assessment_id === mark.assessment_id && a.co_id === mark.co_id
      )?.max_marks_for_co ?? 0;

      const existing = learnerGroups.get(mark.learner_id) ?? { obtained: 0, max: 0 };
      learnerGroups.set(mark.learner_id, {
        obtained: existing.obtained + mark.marks_obtained,
        max: existing.max + coMaxMarks
      });
    }

    let learnersAchieving = 0;
    for (const [, { obtained, max }] of learnerGroups) {
      if (max === 0) continue;
      const pct = (obtained / max) * 100;
      if (pct >= co.target_percentage) learnersAchieving++;
    }

    const achievementRate = (learnersAchieving / totalLearners) * 100;
    const attainmentLevel = ObeAttainmentEngine.rateToLevel(co, achievementRate);

    return { achievementRate, learnersAchieving, totalLearners, attainmentLevel };
  }

  /**
   * Step 2: Calculate indirect attainment from survey scores
   */
  static calculateIndirectAttainment(
    surveys: IndirectAssessment[],
    config: ObeRegulationConfig
  ): { averageScore: number; attainmentLevel: number; responseCount: number } {
    if (surveys.length === 0) {
      return { averageScore: 0, attainmentLevel: 0, responseCount: 0 };
    }

    const avg = surveys.reduce((sum, s) => sum + s.score, 0) / surveys.length;
    const attainmentLevel = (avg / config.indirect_scale_max) * config.attainment_scale_max;

    return {
      averageScore: parseFloat(avg.toFixed(2)),
      attainmentLevel: parseFloat(attainmentLevel.toFixed(2)),
      responseCount: surveys.length
    };
  }

  /**
   * Step 3: Combine direct + indirect into final CO attainment
   */
  static calculateFinalAttainment(
    directLevel: number,
    indirectLevel: number,
    config: ObeRegulationConfig
  ): number {
    const direct = (config.direct_weightage / 100) * directLevel;
    const indirect = (config.indirect_weightage / 100) * indirectLevel;
    return parseFloat((direct + indirect).toFixed(2));
  }

  /**
   * Step 4: Calculate PO attainment from CO attainments + CO-PO mapping
   */
  static calculatePoAttainment(
    coAttainments: { co_id: string; final_attainment: number }[],
    coPoMappings: { co_id: string; po_id: string; correlation_level: number }[]
  ): Map<string, number> {
    const poMap = new Map<string, { numerator: number; denominator: number }>();

    for (const mapping of coPoMappings) {
      if (mapping.correlation_level === 0) continue;

      const co = coAttainments.find(c => c.co_id === mapping.co_id);
      if (!co) continue;

      const existing = poMap.get(mapping.po_id) ?? { numerator: 0, denominator: 0 };
      poMap.set(mapping.po_id, {
        numerator: existing.numerator + co.final_attainment * mapping.correlation_level,
        denominator: existing.denominator + mapping.correlation_level
      });
    }

    const result = new Map<string, number>();
    for (const [poId, { numerator, denominator }] of poMap) {
      result.set(poId, denominator > 0 ? parseFloat((numerator / denominator).toFixed(2)) : 0);
    }
    return result;
  }

  /**
   * Helper: achievement rate → attainment level using CO thresholds
   */
  private static rateToLevel(co: CourseOutcome, rate: number): number {
    if (rate >= co.attainment_level_3_threshold) return 3;
    if (rate >= co.attainment_level_2_threshold) return 2;
    if (rate >= co.attainment_level_1_threshold) return 1;
    return 0;
  }

  /**
   * Bloom's: group CO attainments by level
   */
  static bloomsLevelSummary(
    coAttainments: CoAttainmentResult[]
  ): Partial<Record<string, number>> {
    const groups: Record<string, { sum: number; count: number }> = {};
    for (const co of coAttainments) {
      if (!co.blooms_level) continue;
      const g = groups[co.blooms_level] ?? { sum: 0, count: 0 };
      groups[co.blooms_level] = { sum: g.sum + co.final_attainment, count: g.count + 1 };
    }
    const result: Record<string, number> = {};
    for (const [level, { sum, count }] of Object.entries(groups)) {
      result[level] = parseFloat((sum / count).toFixed(2));
    }
    return result;
  }

  /**
   * Fink's: group CO attainments by dimension
   */
  static finksDimensionSummary(
    coAttainments: CoAttainmentResult[]
  ): Partial<Record<string, number>> {
    const groups: Record<string, { sum: number; count: number }> = {};
    for (const co of coAttainments) {
      if (!co.finks_dimension) continue;
      const g = groups[co.finks_dimension] ?? { sum: 0, count: 0 };
      groups[co.finks_dimension] = { sum: g.sum + co.final_attainment, count: g.count + 1 };
    }
    const result: Record<string, number> = {};
    for (const [dim, { sum, count }] of Object.entries(groups)) {
      result[dim] = parseFloat((sum / count).toFixed(2));
    }
    return result;
  }
}
```

---

### Layer 3: Hooks (`hooks/obe/`)

**Files to create:**
- `hooks/obe/use-course-outcomes.ts`
- `hooks/obe/use-obe-regulation-config.ts`
- `hooks/obe/use-po-pso.ts`
- `hooks/obe/use-co-po-mapping.ts`
- `hooks/obe/use-obe-assessments.ts`
- `hooks/obe/use-obe-attainment.ts`

**Pattern** (follows `use-regulations.ts` exactly):

```typescript
// hooks/obe/use-course-outcomes.ts

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { ObeCourseOutcomeService } from '@/lib/services/obe/obe-course-outcome-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  CourseOutcome,
  CourseOutcomeFilters,
  CreateCourseOutcomeDto,
  UpdateCourseOutcomeDto
} from '@/types/obe';

export function useCourseOutcomes(initialFilters: CourseOutcomeFilters = {}) {
  const { userProfile } = usePermissions();
  const [courseOutcomes, setCourseOutcomes] = useState<CourseOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CourseOutcomeFilters>(initialFilters);
  const [metadata, setMetadata] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchCourseOutcomes = useCallback(
    async (newFilters?: CourseOutcomeFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filtersRef.current;

        // Always scope to user's institution
        const scopedFilters: CourseOutcomeFilters = {
          ...currentFilters,
          institution_id: userProfile?.institution_id ?? currentFilters.institution_id
        };

        const result = await ObeCourseOutcomeService.getCourseOutcomes(scopedFilters);
        setCourseOutcomes(result.data);
        setMetadata(result.metadata);

        if (newFilters) setFilters(newFilters);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<CourseOutcomeFilters>) => {
      setFilters(current => {
        const updated = { ...current, ...newFilters, page: 1 };
        setTimeout(() => fetchCourseOutcomes(updated), 0);
        return updated;
      });
    },
    [fetchCourseOutcomes]
  );

  const createCourseOutcome = useCallback(
    async (data: CreateCourseOutcomeDto) => {
      try {
        setLoading(true);
        await ObeCourseOutcomeService.createCourseOutcome(data);
        toast.success('Course outcome created successfully');
        fetchCourseOutcomes();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create course outcome';
        toast.error(msg);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchCourseOutcomes]
  );

  const updateCourseOutcome = useCallback(
    async (id: string, data: UpdateCourseOutcomeDto) => {
      try {
        setLoading(true);
        await ObeCourseOutcomeService.updateCourseOutcome(id, data);
        toast.success('Course outcome updated successfully');
        fetchCourseOutcomes();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update course outcome';
        toast.error(msg);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchCourseOutcomes]
  );

  const deleteCourseOutcome = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        await ObeCourseOutcomeService.deleteCourseOutcome(id);
        toast.success('Course outcome deleted');
        fetchCourseOutcomes();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete course outcome';
        toast.error(msg);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchCourseOutcomes]
  );

  useEffect(() => {
    fetchCourseOutcomes(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    courseOutcomes,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    fetchCourseOutcomes,
    createCourseOutcome,
    updateCourseOutcome,
    deleteCourseOutcome
  };
}
```

---

### Layer 4: Components (`components/obe/`)

**Files to create:**

| File | Purpose |
|---|---|
| `components/obe/taxonomy-level-badge.tsx` | Color-coded badge: Bloom's L1–L6 or Fink's FK/AP/IN/HD/CA/LL |
| `components/obe/attainment-level-indicator.tsx` | Visual 0/1/2/3 level chips with color (red/amber/yellow/green) |
| `components/obe/co-po-matrix.tsx` | CO × PO grid with 0–3 dropdowns, bulk-fill, validation |
| `components/obe/marks-entry-table.tsx` | Learner rows × CO columns marks table with absent toggle |
| `components/obe/attainment-heatmap.tsx` | CO attainment table with heatmap color per final attainment |
| `components/obe/po-attainment-chart.tsx` | Bar chart of PO attainment (using recharts or visx) |
| `components/obe/co-form.tsx` | Sheet drawer form for creating/editing a CO |
| `components/obe/taxonomy-verb-helper.tsx` | Bloom's level → suggested action verbs popup |
| `components/obe/indirect-survey-table.tsx` | Course exit survey score entry table |

**Key component: `taxonomy-level-badge.tsx`**

```tsx
// components/obe/taxonomy-level-badge.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { BLOOMS_LEVEL_LABELS, FINKS_DIMENSION_LABELS } from '@/types/obe';
import type { BloomsLevel, FinksDimension, TaxonomyType } from '@/types/obe';

// Bloom's: purple gradient L1 (light) → L6 (deep)
const BLOOMS_COLORS: Record<BloomsLevel, string> = {
  L1: 'bg-purple-100 text-purple-700 border-purple-200',
  L2: 'bg-purple-200 text-purple-800 border-purple-300',
  L3: 'bg-purple-300 text-purple-900 border-purple-400',
  L4: 'bg-violet-400 text-white border-violet-500',
  L5: 'bg-violet-600 text-white border-violet-700',
  L6: 'bg-purple-800 text-white border-purple-900',
};

// Fink's: teal palette per dimension
const FINKS_COLORS: Record<FinksDimension, string> = {
  FK: 'bg-teal-100 text-teal-700 border-teal-200',
  AP: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  IN: 'bg-sky-100 text-sky-700 border-sky-200',
  HD: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CA: 'bg-green-100 text-green-700 border-green-200',
  LL: 'bg-teal-200 text-teal-800 border-teal-300',
};

interface TaxonomyLevelBadgeProps {
  taxonomyType: TaxonomyType;
  level?: BloomsLevel;
  dimension?: FinksDimension;
  showLabel?: boolean;
}

export function TaxonomyLevelBadge({
  taxonomyType,
  level,
  dimension,
  showLabel = true
}: TaxonomyLevelBadgeProps) {
  if (taxonomyType === 'blooms' && level) {
    return (
      <Badge
        variant="outline"
        className={`text-xs font-medium ${BLOOMS_COLORS[level]}`}
      >
        {level}{showLabel && ` – ${BLOOMS_LEVEL_LABELS[level]}`}
      </Badge>
    );
  }

  if (taxonomyType === 'finks' && dimension) {
    return (
      <Badge
        variant="outline"
        className={`text-xs font-medium ${FINKS_COLORS[dimension]}`}
      >
        {dimension}{showLabel && ` – ${FINKS_DIMENSION_LABELS[dimension]}`}
      </Badge>
    );
  }

  return <Badge variant="outline" className="text-xs text-gray-500">Not tagged</Badge>;
}
```

**Key component: `attainment-level-indicator.tsx`**

```tsx
// components/obe/attainment-level-indicator.tsx
'use client';

import { cn } from '@/lib/utils';

interface AttainmentLevelIndicatorProps {
  level: number;  // 0–3 (can be decimal, e.g. 2.56)
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const LEVEL_CONFIG = {
  0: { label: 'Not Attained', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  1: { label: 'Low', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  2: { label: 'Medium', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  3: { label: 'High', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
};

export function AttainmentLevelIndicator({
  level,
  showValue = true,
  size = 'md'
}: AttainmentLevelIndicatorProps) {
  const discreteLevel = Math.floor(level) as 0 | 1 | 2 | 3;
  const config = LEVEL_CONFIG[Math.min(discreteLevel, 3) as 0 | 1 | 2 | 3];

  const sizeClass = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5'
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        config.bg, config.text, config.border, sizeClass
      )}
    >
      {showValue && <span className="font-bold">{level.toFixed(2)}</span>}
      <span>Level {discreteLevel} – {config.label}</span>
    </span>
  );
}
```

---

### Layer 5: Pages (`app/(routes)/obe/`)

**Page structure** (under `app/(routes)/academic/obe/` — verified against actual project):

```
app/(routes)/academic/obe/
├── layout.tsx                     — OBE sub-navigation (tabs: CO | PO/PSO | Assessments | Attainment | Reports)
├── page.tsx                       — OBE Dashboard (summary cards, quick actions)
├── regulation-config/
│   ├── page.tsx                   — Taxonomy + weightage config (exam_coordinator role)
│   └── _components/
│       ├── regulation-config-form.tsx
│       └── taxonomy-config-panel.tsx
├── course-outcomes/
│   ├── page.tsx                   — CO list with taxonomy filter tabs
│   └── _components/
│       ├── co-table.tsx
│       ├── co-form.tsx            — Sheet drawer
│       └── taxonomy-verb-helper.tsx
├── po-pso/
│   ├── page.tsx                   — PO/PSO list management
│   ├── _components/
│   │   ├── po-table.tsx
│   │   └── pso-table.tsx
│   └── mapping/
│       ├── page.tsx               — CO×PO+PSO matrix
│       └── _components/
│           └── mapping-matrix.tsx
├── assessments/
│   ├── page.tsx                   — Assessment component list
│   ├── _components/
│   │   └── assessment-table.tsx
│   └── [assessmentId]/
│       └── marks/
│           ├── page.tsx           — Learner marks entry
│           └── _components/
│               └── marks-entry-table.tsx
├── indirect/
│   ├── page.tsx                   — Survey score entry
│   └── _components/
│       └── indirect-survey-table.tsx
├── attainment/
│   ├── page.tsx                   — Trigger + overview
│   ├── _components/
│   │   └── calculate-button.tsx
│   ├── co/
│   │   ├── page.tsx               — CO heatmap + Bloom's/Fink's summary
│   │   └── _components/
│   │       └── co-attainment-table.tsx
│   ├── po/
│   │   ├── page.tsx               — PO bar chart
│   │   └── _components/
│   │       └── po-attainment-chart.tsx
│   └── pso/
│       └── page.tsx
└── reports/
    ├── page.tsx                   — NBA full package export
    └── _components/
        ├── nba-export-panel.tsx
        └── gap-analysis-table.tsx
```

**Page template** (`app/(routes)/obe/course-outcomes/page.tsx`):

```tsx
// app/(routes)/obe/course-outcomes/page.tsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { useCourseOutcomes } from '@/hooks/obe/use-course-outcomes';
import { TaxonomyLevelBadge } from '@/components/obe/taxonomy-level-badge';
import { AttainmentLevelIndicator } from '@/components/obe/attainment-level-indicator';
import { CoForm } from '@/components/obe/co-form';
import { ProtectedRoute } from '@/components/auth/protected-route';
import type { CourseOutcome } from '@/types/obe';

export default function CourseOutcomesPage() {
  const [selectedCourse, setSelectedCourse] = useState<string | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCo, setEditingCo] = useState<CourseOutcome | null>(null);

  const {
    courseOutcomes,
    loading,
    error,
    createCourseOutcome,
    updateCourseOutcome,
    deleteCourseOutcome,
    updateFilters
  } = useCourseOutcomes({ course_id: selectedCourse });

  // ... table columns, handlers, render
}
```

---

### API Routes (`app/api/obe/`)

**Files to create:**

```
app/api/obe/
├── regulation-config/
│   └── route.ts          — GET, POST
├── course-outcomes/
│   ├── route.ts           — GET, POST
│   └── [id]/
│       └── route.ts       — PUT, DELETE
├── program-outcomes/
│   ├── route.ts
│   └── [id]/route.ts
├── co-po-mapping/
│   ├── route.ts           — GET
│   └── bulk/route.ts      — POST (bulk upsert)
├── assessments/
│   ├── route.ts
│   ├── [id]/route.ts
│   └── [id]/marks/
│       ├── route.ts       — GET
│       └── bulk/route.ts  — POST
├── indirect/
│   ├── route.ts
│   └── bulk/route.ts
├── attainment/
│   ├── calculate/route.ts — POST (trigger engine)
│   ├── co/route.ts
│   ├── po/route.ts
│   └── pso/route.ts
└── reports/
    ├── nba/route.ts
    ├── co-attainment/export/route.ts
    └── gap-analysis/route.ts
```

**Route pattern** (`app/api/obe/course-outcomes/route.ts`):

```typescript
// app/api/obe/course-outcomes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ObeCourseOutcomeService } from '@/lib/services/obe/obe-course-outcome-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const filters = {
      course_id: searchParams.get('courseId') ?? undefined,
      institution_id: searchParams.get('institutionId') ?? undefined,
      is_active: searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 50,
    };

    const result = await ObeCourseOutcomeService.getCourseOutcomes(filters);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('obe/course-outcomes', 'GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const co = await ObeCourseOutcomeService.createCourseOutcome(body);
    return NextResponse.json(co, { status: 201 });
  } catch (error) {
    logger.error('obe/course-outcomes', 'POST error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

### Supabase SQL Files

> **CRITICAL:** Per CLAUDE.md policy — update ONLY `supabase/setup/01_tables.sql`, `03_policies.sql`. NEVER create new SQL files.

**Add to `supabase/setup/01_tables.sql`:**
```sql
-- ── OBE Module Tables ────────────────────────────────────────────────
-- Added: 2026-03-03 — OBE calculation engine for autonomous colleges
-- Supports Bloom's Taxonomy (UGC) and Fink's Taxonomy (Management)

-- [paste all CREATE TABLE statements from Database Schema section above]
```

**Add to `supabase/setup/03_policies.sql`:**
```sql
-- ── OBE Module RLS Policies ──────────────────────────────────────────
-- Added: 2026-03-03

-- Example policy for obe_course_outcomes:
ALTER TABLE obe_course_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obe_course_outcomes_select"
  ON obe_course_outcomes FOR SELECT
  USING (institution_id = (
    SELECT institution_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "obe_course_outcomes_insert"
  ON obe_course_outcomes FOR INSERT
  WITH CHECK (institution_id = (
    SELECT institution_id FROM profiles WHERE id = auth.uid()
  ));

-- Repeat for all OBE tables
```

---

## Implementation Phases

### Phase 1: Foundation (Database + Types + Services)
1. Create all Supabase tables (migration file)
2. Create RLS policies
3. Generate TypeScript types
4. Build base services (CRUD for CO, PO, PSO, mapping)

### Phase 2: Setup Screens (Config + CO + PO + Mapping)
1. OBE Regulation Config page
2. Course Outcome entry page (with taxonomy tagging)
3. PO/PSO management page
4. CO–PO–PSO mapping matrix page

### Phase 3: Marks Entry
1. Assessment component setup page
2. CO-wise marks entry table
3. Excel import for bulk marks
4. Indirect assessment / survey entry

### Phase 4: Calculation Engine
1. `obe-attainment-engine.ts` — direct attainment, indirect attainment, final CO attainment
2. PO/PSO attainment calculation
3. Bloom's level-wise summary
4. Fink's dimension-wise summary
5. Trigger calculation API
6. Results display with heatmap

### Phase 5: Reports & Export
1. CO Attainment Report (Excel + PDF)
2. PO/PSO Attainment Report
3. Gap Analysis report
4. Action Taken Report template
5. NBA full package export

---

## Questions Still Open (Clarify Before Implementation)

- [ ] Does your existing `courses` table have a `regulation_id` FK? If not, the OBE config lookup needs a join path.
- [ ] What is your existing `regulations` table schema? (Need to confirm FK relationship)
- [ ] Do you have a `batches` table? OBE results are stored per batch + academic year.
- [ ] For Fink's: should CO attainment be reported per-dimension or as an overall course average?
- [ ] Gap analysis target: is "attainment < 1.8 on 3-point scale" the standard, or does each regulation define its own gap threshold?
- [ ] Should learning facilitators be able to see other facilitators' CO attainment for the same program (useful for PO calculation context)?

---

*Spec version: 1.0 | Created: 2026-03-03 | Author: Claude (JKKN COE Project)*
