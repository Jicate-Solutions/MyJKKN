# Solution Department Tracker - Specification

## Overview
Track whether the 44 designated JKKN Solution Departments are actually providing solutions and generating revenue. Provides automated department lifecycle management, performance dashboards, and accountability tracking.

## Core Concept
Academic departments across 6 JKKN institutions are designated as "Solution Departments" - units that provide monetizable solutions (software, training, consulting, lab services, workshops, etc.) to external clients. The tracker measures their performance and automatically manages their active/dormant status.

---

## Designated Solution Departments (44 Total)

### JKKN College of Engineering and Technology (6)
1. Computer Science and Engineering (CET-2)
2. Electrical and Electronics Engineering (CET-3)
3. Electronics and Communication Engineering (CET-4)
4. Mechanical Engineering (CET-5)
5. MBA (CET-6)
6. Information Technology (CET-8)

### JKKN College of Arts and Science - Self Finance (9)
1. Computer Science (CAS-SF-1)
2. Commerce (CAS-SF-2)
3. English (CAS-SF-3)
4. Textile Fashion Designing (CAS-SF-4)
5. Visual Communication (CAS-SF-5)
6. Mathematics (CAS-SF-6)
7. Microbiology (CAS-SF-7)
8. Physics (CAS-SF-8)
9. Tamil (CAS-SF-13)

### JKKN Dental College and Hospital (9)
1. Oral Pathology and Dental Anatomy (DCH-2)
2. Oral and Maxillofacial Surgery (DCH-3)
3. Oral Medicine and Radiology (DCH-4)
4. Orthodontics (DCH-5)
5. Pediatrics (DCH-6)
6. Periodontics (DCH-7)
7. Public Health Dentistry (DCH-8)
8. Prosthodontics (DCH-9)
9. Conservative and Endodontics (DCH-10)

### JKKN College of Pharmacy (6)
1. Pharmaceutical Analysis (COP-2)
2. Pharmaceutical Chemistry (COP-3)
3. Pharmaceutics (COP-4)
4. Pharmacognosy (COP-5)
5. Pharmacology (COP-6)
6. Pharmacy Practice (COP-7)

### JKKN College of Nursing and Research (5)
1. Child Health Nursing (CNR-2)
2. Community Health Nursing (CNR-3)
3. Medical Surgical Nursing (CNR-4)
4. Mental Health Nursing (CNR-5)
5. Obstetrics and Gynaecological Nursing (CNR-6)

### JKKN College of Allied Health Sciences (9)
1. Medical Record Science (AHS-2)
2. Radiography and Imaging Technology (AHS-3)
3. Respiratory Therapy (AHS-4)
4. Physician Assistant (AHS-5)
5. Critical Care Technology (AHS-6)
6. Dialysis Technology (AHS-7)
7. Cardiac Technology (AHS-8)
8. Operation Theatre and Anesthesia Technology (AHS-9)
9. Accident and Emergency Care Technology (AHS-10)

---

## Department Lifecycle

### Status States
| Status | Meaning | Trigger |
|--------|---------|---------|
| `pending_approval` | HOD nominated, waiting Director approval | HOD submits nomination |
| `active` | Revenue generated within last 3 months | Revenue logged OR approval granted |
| `at_risk` | 1-2 months without revenue | Auto-calculated |
| `dormant` | 3+ months without any revenue | Auto-triggered, no exceptions |

### Rules
- **No grace period**: Even newly activated departments must generate revenue within 3 months
- **No pipeline exceptions**: Active projects without revenue do NOT prevent dormancy
- **Auto-reactivation**: Any revenue entry automatically moves dormant → active
- **Full history**: Every status transition is logged with timestamp and reason

### Tiered Alerts
| Months Without Revenue | Action |
|----------------------|--------|
| 1 month | Subtle "at risk" indicator on dashboard |
| 2 months | Alert notification to HOD |
| 3 months | Auto-dormant + alert to Director AND HOD |

---

## Solution Types (Fully Flexible)

### Architecture
- Replace fixed `sh_solution_type` enum ('software', 'training', 'content') with a CRUD table
- Departments can create their own solution type labels
- Existing types (Software, Training, Content) seeded as defaults
- New types: Consulting, Lab Services, Workshops, Research, IP Licensing, etc.
- Each type has: name, slug, description, icon, color

### Backward Compatibility
- Existing solutions retain their type association
- Software/Training/Content specific sub-workflows (builders, cohorts, production) remain functional
- Custom types get generic solution workflow (phases → payments)

---

## Revenue Model

### How Revenue is Tracked
- Every revenue-generating activity = a Solution in `sh_solutions`
- Goes through full solution lifecycle: create → phases → payments
- Revenue = sum of payments received (from `sh_payments`)
- Linked to department via `lead_department_id`

### Revenue Attribution
- Revenue attributed to the department set as `lead_department_id` on the solution
- A solution can only have one lead department
- Multiple departments can contribute (via phase `owner_department_id`) but revenue counts for lead

---

## Dashboard (Main /solutions page)

### Summary Section (4 Elements)

1. **Status Counts** (Traffic Light)
   - Big numbers: "32 Active / 8 At Risk / 4 Dormant"
   - Color-coded cards (green/amber/red)
   - Click to filter department list

2. **Revenue Leaderboard**
   - Top 5 departments by revenue this quarter
   - Shows absolute revenue + growth rate vs previous quarter
   - "View All" links to full departments page

3. **Health Grid**
   - Visual grid/heatmap showing ALL 44 departments
   - Color-coded: green (active), amber (at risk), red (dormant)
   - Grouped by institution
   - Click any department to drill down

4. **Trend Chart**
   - Line chart: quarterly revenue over last 4 quarters
   - Total active department count overlay
   - Optional: institution-wise breakdown

### Default Period: Current Quarter
- Time period selector: Month / Quarter / Year / Custom
- Defaults to current quarter

---

## Department Detail Page (/solutions/departments)

### List View
- All 44 departments in a sortable, filterable table
- Columns: Department, Institution, Status, Revenue (Quarter), Target, Achievement %, Growth Rate, Active Solutions
- Filters: Status, Institution, Revenue Range
- Sort by any column

### Individual Department View (/solutions/departments/[id])

**Full 360-Degree View:**

1. **Header**: Department name, institution, status badge, days since last revenue
2. **Revenue Section**: This month / quarter / year / all-time with trend sparkline
3. **Target vs Actual**: Progress bar showing quarterly target achievement
4. **Pipeline**: Active solutions with their current status (discovery, building, live, etc.)
5. **Team**: Staff assigned to solutions (from builder assignments, phase owners)
6. **Client List**: All clients served by this department
7. **Historical Performance**: Revenue trend over past quarters
8. **Comparison**: Rank among all departments, growth rate percentile
9. **Status History Timeline**: Visual timeline showing all status transitions

---

## Targets

### Structure
- HODs set their own quarterly revenue targets
- Target = expected revenue for the quarter (INR)
- Achievement calculated as: (actual_revenue / target_revenue) * 100
- Visible on dashboard and department detail page

### Workflow
1. HOD logs into solutions module
2. Navigates to their department settings
3. Sets target for current/next quarter
4. Target appears on dashboard with progress tracking

---

## Permissions

### Who Can Do What
| Action | Who |
|--------|-----|
| Activate new department | HOD nominates → Director approves |
| Create solutions for department | HOD + designated staff |
| Set quarterly targets | HOD |
| View department dashboard | Anyone with solutions.view |
| View all departments | Director, Admin |
| Manage solution types | Director, Admin |
| Approve nominations | Director |

---

## Database Schema

### New Tables

#### sh_solution_departments
Tracks which departments are activated as solution departments.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| department_id | UUID FK → departments | UNIQUE - one entry per dept |
| institution_id | UUID FK → institutions | |
| status | TEXT | pending_approval, active, at_risk, dormant |
| activated_at | TIMESTAMPTZ | When first activated |
| dormant_at | TIMESTAMPTZ | When last went dormant |
| last_revenue_at | TIMESTAMPTZ | Last revenue timestamp |
| nominated_by | UUID FK → profiles | HOD |
| approved_by | UUID FK → profiles | Director |
| capabilities | TEXT[] | Free-form capability tags |
| metadata | JSONB | |

#### sh_department_status_history
Audit trail of all status changes.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| solution_department_id | UUID FK | |
| previous_status | TEXT | null for initial |
| new_status | TEXT | |
| reason | TEXT | Human or system reason |
| changed_by | UUID FK → profiles | null for auto |
| changed_at | TIMESTAMPTZ | |

#### sh_solution_types
Replaces the fixed enum with CRUD-managed types.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | "Software Development" |
| slug | TEXT UNIQUE | "software" |
| description | TEXT | |
| icon | TEXT | Lucide icon name |
| color | TEXT | Hex color |
| is_default | BOOLEAN | true for seeded types |
| is_active | BOOLEAN | Soft delete |
| created_by | UUID FK → profiles | |

#### sh_department_targets
Quarterly revenue targets set by HODs.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| solution_department_id | UUID FK | |
| quarter | TEXT | "2026-Q1" |
| target_revenue | NUMERIC | INR |
| notes | TEXT | |
| set_by | UUID FK → profiles | |
| UNIQUE | (solution_department_id, quarter) | |

### Modified Tables

#### sh_solutions
- ADD `solution_type_id UUID FK → sh_solution_types` (nullable for backward compat)
- KEEP `solution_type` enum column during migration period
- New solutions use `solution_type_id`, old solutions retain enum value

---

## Success Criteria

1. All 44 departments visible on dashboard with correct status
2. Revenue correctly calculated from existing sh_payments data
3. Auto-dormancy triggers after 3 months of zero revenue
4. Auto-reactivation when revenue is logged
5. Full status history visible on department detail page
6. Leaderboard shows top performers with growth rate
7. Health grid provides instant visual overview
8. HODs can set quarterly targets
9. Tiered alert system functional
10. Custom solution types can be created/managed

---

## Technical Notes

- All 44 departments need to be seeded into sh_solution_departments on migration
- The departments exist in production DB but need to be synced to staging first
- Revenue calculation: SUM of sh_payments.amount WHERE solution.lead_department_id matches
- Dormancy check can be a database function called periodically or on dashboard load
- Status changes should be atomic with history recording (use transaction)

---

*Created: 2026-02-09*
*Decisions made during interview with Director*
