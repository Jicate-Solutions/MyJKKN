# SAMS — Staff Appraisal Management System
## MyJKKN Integration Specification v4.0

**Date:** 2026-04-07
**Status:** Final — Ready for Build
**Module Code:** `sams`
**Table Prefix:** `sams_`
**Source of Truth:** `specs/JKKN-Facilitator-Grading-Benchmarks-v2.md` (16 metrics, MyJKKN-native)

---

## 1. Core Architecture

### The Hybrid Auto-Measurement Model
```
MyJKKN auto-calculates scores from real platform activity
    → Facilitator reviews + supplements gaps + writes narrative
        → HoD validates combined score
            → Principal approves
                → IQAC (IE team) compiles reports
```

For each of 16 metrics:
1. **Auto-score** — queried from existing MyJKKN tables (12 of 16 metrics)
2. **Supplement** — facilitator adds entries the system missed + narrative justification
3. **Combined score** — auto + supplement applied against thresholds → 0-3 points
4. **Validation** — HoD reviews, can approve or flag

Facilitators see their live score dashboard update in real-time as they work in MyJKKN. The quarterly "submission" is a review + declare step, not data entry.

---

## 2. Scoring

| Grade | Points | Meaning |
|---|---|---|
| **A++** | 3 | Exceptional |
| **A+** | 2 | Proficient |
| **A** | 1 | Developing |
| **B** | 0 | Inadequate |

**16 metrics × 3 points = 48 max. Minimum 2 points for salary increment.**

### Overall Grade Bands

| Points | Grade | Salary Cap |
|---|---|---|
| 38-48 | A++ | Up to 15% |
| 25-37 | A+ | Up to 10% |
| 13-24 | A | Standard increment |
| 0-12 | B | No increment |

---

## 3. The 16 Metrics

### M01 — CoE Leadership & Solutions ✅
**Team metric.** 3+ solutions/programs = A++ (3), 2 = A+ (2), 1 = A (1), 0 = B (0).
**Auto-source:** `sh_solutions`, `sh_builder_assignments`, `sh_training_programs`

### M02 — Interdisciplinary COE Collaborations ✅
**Team metric.** 3+ cross-dept collaborations = A++ (3/2/1/0).
**Auto-source:** `sh_solutions` + `sh_solution_departments` (2+ distinct departments)

### M03 — Global/International Engagements (includes virtual) 📝
3+ engagements = A++ (3/2/1/0). Virtual counts equally.
**Source:** NEW table `sams_international_engagements` (manual entry)

### M04 — Innovation/Patents/Publications ✅
3+ innovations = A++ (3/2/1/0).
**Auto-source:** `sh_publications`, `sh_publication_contributors`, `sh_product_validations`

### M05 — Industry/University/Community Partnerships ✅
**Team metric.** 3+ partnerships = A++ (3/2/1/0).
**Auto-source:** `industry_partners`, `industry_projects`, `sh_solution_mous`, `facilitator_industry_immersion`

### M06 — Mentorship & Leadership ✅
**Team metric.** 15+ mentees = A++ (3), 10 = A+ (2), 5 = A (1).
**Auto-source:** `ss_mentor_matches`, `ss_mentor_sessions`

### M07 — AI Impact on Learning Outcomes 🔄 REDESIGNED
**v1:** Count AI tools. **v2:** Measure student outcome improvement.

| Grade | Threshold |
|---|---|
| A++ (3) | >10% improvement in pass rates / learning outcomes in AI-integrated courses vs. baseline |
| A+ (2) | 5-10% improvement OR AI-assisted publications/materials with documented adoption |
| A (1) | AI tools integrated into delivery with evidence (no outcome measurement yet) |
| B (0) | Minimal/No AI integration |

**Auto-source:** Compare `student_attendance` + pass rates before/after per course per facilitator. Supplement: manual evidence of AI integration.

### M08 — Fink's Taxonomy Implementation (OBE) 🔄 REDESIGNED
**v1:** 8 CAMU/Quizizz sub-rubrics. **v2:** Auto-calculated from `pde_finks_competency`.

| Grade | Threshold |
|---|---|
| A++ (3) | All 6 Fink's dimensions at ≥80% competency |
| A+ (2) | 4-5 dimensions at ≥60% competency |
| A (1) | 2-3 dimensions with any competency tracked |
| B (0) | 0-1 dimensions tracked |

**Auto-source:** `pde_finks_competency` — `finks_dimension`, `competency_pct`. Aggregated per facilitator across all courses taught.

### M09 — Qualifications & Certifications ✅
Multiple certs/NPTEL Topper = A++ (3), 2 certs/Elite+Gold = A+ (2), 1/Elite = A (1).
**Auto-source:** `facilitator_development` (certifications JSONB, workshops)

### M10 — Committee Working Groups ✅
**Team metric.** Either/or rule: ≥90% OKR achievement OR 3+ committees = A++.
**Auto-source:** `okr_objectives` (overall_progress), `marathon_committees`

### M11 — Impactful Initiatives (Percentile Ranking) 📊
Top 10% impact = A++ (3), Top 20% = A+ (2), Top 50% = A (1).
**Source:** `nps_surveys` + `nps_responses` — IQAC creates M11-specific survey per cycle.

### M12 — Student Feedback & Outcomes 🔄 ENHANCED
**v1:** Ratings only. **v2:** Ratings + attendance + pass rates.

| Grade | Threshold |
|---|---|
| A++ (3) | ≥90% positive feedback AND attendance >85% AND pass rate >80% |
| A+ (2) | 75-89% feedback AND attendance >75% AND pass rate >70% |
| A (1) | 50-74% mixed feedback OR mixed outcomes |
| B (0) | <49% feedback OR poor outcomes |

**Auto-source:** `facilitator_development.student_feedback_average`, `student_attendance`. Fallback: HoD-generated feedback token (48hr, anonymous).

### M13 — Scholarly Impact (Scopus H-index) ✅
H-index ≥15 = A++ (3), 10-14 = A+ (2), 7-9 = A (1), <7 = B (0).
**Auto-source:** `sh_publications` (h_index_contribution, scopus_indexed, citation_count)

### M14 — Work Pulse (Daily Engagement) 🆕
**Data-driven thresholds** — set from actual MyJKKN usage distribution after Q1.
Top quartile = A++ (3), above median = A+ (2), regular = A (1), sporadic = B (0).
**Auto-source:** `wp_pulse_entries`, `wp_agent_impact`, `wp_patterns`

### M15 — MyJKKN Platform Adoption 🆕
**Data-driven thresholds** — 5+ modules active = A++, 3-4 = A+, 1-2 = A, rare = B.
**Auto-source:** `user_activity_logs` + cross-module usage counting

### M16 — Process Excellence Contributions 🆕
**Data-driven thresholds** — multiple processes designed/improved = A++, active contribution = A+, participation = A, none = B.
**Auto-source:** `process_definitions` (created_by), `process_instances`, `process_audits`

---

## 4. Auto-Measurement Summary

| Status | Count | Metrics |
|---|---|---|
| Fully auto | 12 | M01, M02, M04, M05, M06, M08, M09, M10, M12, M13, M14, M15 |
| Partial auto | 2 | M07 (needs before/after comparison), M16 (process module maturity) |
| Survey-based | 1 | M11 (IQAC creates impact survey) |
| Manual entry | 1 | M03 (new tracking table) |

---

## 5. Cumulative Calendar Year Rule

Q1 = Q1 entries. Q2 = Q1+Q2. Q3 = Q1+Q2+Q3. Q4 = full year.
Each entry has `quarter_added` + `calendar_year`. Auto-carry-forward on new quarter.

---

## 6. Team Performance Evaluation (M01, M02, M05, M06, M10)

- Anonymous peer ratings: 5 criteria × 1-5 scale + % contribution
- Evaluator identity stored, hidden from evaluated (HoD/IQAC can see)
- Criteria: Alignment, Quality, Initiative, Communication, Collaboration

---

## 7. Benefits Matrix (all 8 categories tracked and displayed)

| Category | A++ | A+ | A | B |
|---|---|---|---|---|
| Salary | Up to 15% | Up to 10% | Standard | None |
| Prof Dev | Global, all expenses | National, covered | Standard | Base only |
| Recognition | Top performer awards | Institutional | Dept-level | None |
| Promotion | Priority | Strong consideration | Normal | Not considered |
| Research Funding | Privileged +20% | Priority | Standard | Not eligible |
| Leadership | Major institutional | Department | Small teams | Not assigned |
| Resources | Premium tools | Upgraded | Standard | Basic |
| Flexibility | Remote + flexible | Standard | Standard | Standard |

---

## 8. Workflow

```
LIVE DASHBOARD (scores update real-time as facilitator works in MyJKKN)
         │
         │ Cycle opens → auto-populate from MyJKKN data + carry-forward
         │
    ┌────▼────┐
    │ REVIEW  │ Review 16 auto-scores, add supplements, write narratives
    └────┬────┘
         │ Declaration checkbox + timestamp → Submit
    ┌────▼────┐
    │SUBMITTED│ → AI alignment runs (Claude API, non-blocking)
    └────┬────┘
         │ HoD is the faculty? → skip to Principal
         │ No HoD assigned? → escalate to Principal
    ┌────▼────────┐
    │ HoD REVIEW  │ Validate auto + supplement entries
    └────┬────────┘
         │ Approve or Return (flags specific metric, red highlight)
    ┌────▼──────────────┐
    │ PRINCIPAL REVIEW  │
    └────┬──────────────┘
         │
    ┌────▼────┐
    │APPROVED │ → Salary + benefits projection calculated
    └─────────┘
```

**Key rules:**
- 7 working days after quarter end to submit
- Auto-save on every field change
- One active cycle per institution (partial unique index)
- IQAC = IE team (advisory, no blocking power)
- Return flags specific metric → form unlocks → faculty fixes → resubmit

---

## 9. Appeals

| Rule | Detail |
|---|---|
| Who | Faculty only |
| To | HoD only (cannot bypass) |
| SLA | 7 working days |
| Mechanism | Additional evidence or clarification |
| Overdue | MD gets read-only alert |
| Re-appeal | Not allowed on same metric in same cycle |

---

## 10. Database Schema (23 tables)

### Core Tables

| # | Table | Purpose |
|---|---|---|
| 1 | `sams_appraisal_cycles` | Quarterly windows, one open per institution, 7-day submission window |
| 2 | `sams_appraisals` | One per facilitator per cycle. Status, total_points (max 48), overall_grade, calendar_year |
| 3 | `sams_metric_scores` | **16 per appraisal** — metric_code (M01-M16), auto_score, supplement_score, final_score (0-3), grade |
| 4 | `sams_supplement_entries` | Faculty-added entries not captured by auto. entry_type, data_json, evidence_url, quarter_added |
| 5 | `sams_narratives` | Self-assessment text per metric per appraisal |
| 6 | `sams_declarations` | Digital declaration: checkbox + timestamp + user_id |

### New Trackers

| # | Table | Purpose |
|---|---|---|
| 7 | `sams_international_engagements` | M03 tracker: event_name, country, type, mode (in-person/virtual/hybrid), evidence_url |
| 8 | `sams_ai_impact_records` | M07 tracker: course_id, baseline_pass_rate, current_pass_rate, ai_tools_used, evidence |
| 9 | `sams_platform_usage_snapshots` | M15 periodic snapshots: user_id, login_count, modules_used, actions_taken, snapshot_date |

### Team Evaluation

| # | Table | Purpose |
|---|---|---|
| 10 | `sams_team_projects` | Team projects for M01, M02, M05, M06, M10 |
| 11 | `sams_team_members` | Members per project + contribution_pct |
| 12 | `sams_peer_evaluations` | 5-criteria ratings (evaluator stored, hidden from evaluated) |

### Review & Appeals

| # | Table | Purpose |
|---|---|---|
| 13 | `sams_approvals` | Approval/return audit trail: reviewer_id, role, action, comments, flagged_metric |
| 14 | `sams_appeals` | Dispute tracking: metric_code, faculty_reason, hod_remarks, sla_deadline, is_overdue |

### Feedback (M12 fallback)

| # | Table | Purpose |
|---|---|---|
| 15 | `sams_feedback_tokens` | HoD-generated tokens: token_string, expires_at (48hr), class_section |
| 16 | `sams_student_feedback` | Anonymized responses: q1-q5 scores (Likert 1-5), average_score |

### AI & Salary

| # | Table | Purpose |
|---|---|---|
| 17 | `sams_ai_evaluation_log` | Claude API audit: parsed_scores, raw_response, justification, prompt_snapshot |
| 18 | `sams_salary_config` | Per-institution: grade → increment cap, min_points_for_increment |
| 19 | `sams_salary_projections` | Per-appraisal: base_salary, total_points, grade, projected_salary, all 8 benefit unlocks |
| 20 | `sams_benefits_config` | Per-institution: 8 benefit categories × 4 grade levels (configurable text/policy) |

### System

| # | Table | Purpose |
|---|---|---|
| 21 | `sams_documents` | Evidence files: storage_path, file_hash, mime_type, scan_result |
| 22 | `sams_comments` | Threaded comments on appraisals: author_id, section_tag, parent_id |
| 23 | `sams_audit_log` | All state changes: action_type, user_id, meta_json |

### Key Constraints
- `UNIQUE(cycle_id, user_id)` — one appraisal per facilitator per cycle
- `UNIQUE(appraisal_id, metric_code)` — one score per metric
- Partial unique index: one `open` cycle per institution
- `CHECK(total_points BETWEEN 0 AND 48)`
- `CHECK(final_score BETWEEN 0 AND 3)` per metric
- All tables: `institution_id` + RLS policies

---

## 11. Auto-Measurement Queries

| Metric | Query Logic |
|---|---|
| M01 | Count from `sh_solutions` (created_by) + `sh_builder_assignments` (builder_id) + `sh_training_programs` WHERE created_at in calendar year up to current quarter |
| M02 | Count distinct solutions from `sh_solutions` JOIN `sh_solution_departments` WHERE 2+ departments AND staff is builder |
| M03 | Count from `sams_international_engagements` WHERE staff_id AND calendar year |
| M04 | Count from `sh_publications` JOIN `sh_publication_contributors` WHERE staff_id AND status='published' + `sh_product_validations` |
| M05 | Count from `industry_partners` (created_by) + `industry_projects` (mentor_id) + `sh_solution_mous` + `facilitator_industry_immersion` |
| M06 | Count distinct mentees from `ss_mentor_matches` WHERE mentor_id AND status IN ('active','completed') |
| M07 | Compare current vs baseline pass rates from `student_attendance` + academic results per course per facilitator. Cross-ref with `sams_ai_impact_records` |
| M08 | From `pde_finks_competency`: count dimensions with competency_pct ≥ threshold, aggregated per facilitator across all courses |
| M09 | Parse `facilitator_development.certifications` JSONB + count workshops_attended + workshops_facilitated |
| M10 | AVG(`okr_objectives.overall_progress`) WHERE owner_id = staff + count from `marathon_committees`. Grade = MAX(achievement_grade, committee_grade) |
| M11 | Percentile rank from `nps_responses` on M11-specific survey per cycle |
| M12 | `facilitator_development.student_feedback_average` + AVG attendance from `student_attendance` for facilitator's courses |
| M13 | SUM(`sh_publications.h_index_contribution`) WHERE scopus_indexed=true AND staff is contributor |
| M14 | Count + frequency from `wp_pulse_entries` WHERE user_id = staff. Percentile vs. institution |
| M15 | Login count + distinct modules from `user_activity_logs` WHERE user_id = staff |
| M16 | Count from `process_definitions` (created_by) + `process_instances` (participant) + `process_audits` |

---

## 12. Pages & Routes

```
app/(routes)/staff-appraisal/
├── page.tsx                          — Live Performance Dashboard (16 metrics, role-aware)
├── appraisal/
│   ├── page.tsx                      — Review & Supplement form (16 metrics)
│   └── [id]/page.tsx                 — View specific appraisal
├── review/
│   ├── page.tsx                      — HoD review queue
│   └── [id]/page.tsx                 — Validate specific facilitator
├── team-evaluation/
│   ├── page.tsx                      — Team projects overview
│   └── [projectId]/page.tsx          — Peer evaluation form
├── cycles/page.tsx                   — IQAC: cycle management
├── staff-mapping/page.tsx            — HoD: department status grid
├── appeals/page.tsx                  — Appeals management
├── feedback/
│   ├── page.tsx                      — HoD: token generation (M12 fallback)
│   └── [token]/page.tsx              — PUBLIC: student feedback form
├── salary/page.tsx                   — Salary + benefits projections (all 8 categories)
├── reports/page.tsx                  — IQAC: compliance + export (PDF/Excel)
├── executive/page.tsx                — Unified executive dashboard
├── international/page.tsx            — M03: International engagements tracker
├── ai-impact/page.tsx                — M07: AI impact on learning outcomes
└── _components/
    ├── MetricScoreCard.tsx            — Shows auto-score + supplement + final per metric
    ├── MetricSidebar.tsx              — 16-metric navigation with live scores
    ├── NarrativeEditor.tsx            — Self-assessment text per metric
    ├── SupplementEntryForm.tsx         — Add entries system missed
    ├── PeerEvaluationForm.tsx          — 5-criteria anonymous rating
    ├── AppraisalStatusStepper.tsx      — Visual workflow progress
    ├── AIAlignmentPanel.tsx            — Claude API results display
    ├── SalaryProjectionCard.tsx        — Grade → salary + 8 benefits
    ├── ReturnForRevisionModal.tsx      — HoD return with flagged metric
    ├── FeedbackTokenCard.tsx           — M12 token status
    ├── DeclarationCheckbox.tsx         — "I declare..." with timestamp
    └── ScoreBreakdown.tsx              — 16-metric score breakdown grid
```

---

## 13. Services (13 files)

| Service | Purpose |
|---|---|
| `sams-cycle-service.ts` | CRUD cycles, 7-day window, one-open constraint |
| `sams-auto-measure-service.ts` | **Core engine:** runs 16 auto-measurement queries |
| `sams-appraisal-service.ts` | Create, submit, auto-save, carry-forward, declaration |
| `sams-supplement-service.ts` | Faculty supplement entries CRUD |
| `sams-narrative-service.ts` | Self-assessment narratives per metric |
| `sams-team-service.ts` | Team projects, peer evaluations |
| `sams-review-service.ts` | Approval workflow (approve/return/flag) |
| `sams-appeal-service.ts` | Appeals CRUD + SLA tracking |
| `sams-feedback-service.ts` | M12 tokens, student responses |
| `sams-salary-service.ts` | Salary projections + 8 benefit categories |
| `sams-ai-service.ts` | AI alignment scoring (Claude API) |
| `sams-report-service.ts` | Analytics, PDF/Excel export |
| `sams-tracker-service.ts` | M03 international + M07 AI impact CRUD |

---

## 14. Hooks (13 files)

| Hook | Purpose |
|---|---|
| `use-sams-cycles.ts` | Cycles list, create, update state |
| `use-sams-appraisal.ts` | Own appraisal CRUD, submit, auto-save |
| `use-sams-auto-scores.ts` | Fetch live auto-calculated scores for 16 metrics |
| `use-sams-supplements.ts` | Supplement entries CRUD |
| `use-sams-narratives.ts` | Narrative text per metric |
| `use-sams-teams.ts` | Team projects + peer evaluations |
| `use-sams-review.ts` | Review queue, approve, return |
| `use-sams-appeals.ts` | Appeals list, file, resolve |
| `use-sams-feedback.ts` | Token gen, student responses |
| `use-sams-salary.ts` | Salary + benefits projections |
| `use-sams-dashboard.ts` | Role-aware dashboard stats |
| `use-sams-reports.ts` | Analytics, export |
| `use-sams-trackers.ts` | M03 + M07 tracker CRUD |

---

## 15. Edge Functions (Supabase)

| Function | Trigger | Purpose |
|---|---|---|
| `sams-evaluate-submission` | After submit | Claude API alignment scoring |
| `sams-auto-populate` | On cycle open | Run auto-measurement queries, populate metric_scores |
| `sams-carry-forward` | On cycle open | Carry Q(n-1) entries into Q(n) |
| `sams-deadline-reminders` | Cron (daily) | Notify approaching 7-day deadline |
| `sams-appeal-sla-check` | Cron (daily) | Flag overdue appeals, notify MD |
| `sams-snapshot-usage` | Cron (weekly) | Snapshot M15 platform usage metrics |

---

## 16. Sidebar Menu Group

```typescript
{
  groupLabel: 'Staff Appraisal',
  menus: [
    { href: '/staff-appraisal', label: 'Dashboard', icon: ClipboardCheck },
    { href: '/staff-appraisal/appraisal', label: 'My Appraisal', icon: FileText },
    { href: '/staff-appraisal/review', label: 'Review Queue', icon: CheckSquare },
    { href: '/staff-appraisal/staff-mapping', label: 'Staff Mapping', icon: Users },
    { href: '/staff-appraisal/team-evaluation', label: 'Team Evaluation', icon: UserCheck },
    { href: '/staff-appraisal/appeals', label: 'Appeals', icon: Scale },
    { href: '/staff-appraisal/feedback', label: 'Student Feedback', icon: MessageSquare },
    { href: '/staff-appraisal/cycles', label: 'Appraisal Cycles', icon: Calendar },
    { href: '/staff-appraisal/salary', label: 'Salary & Benefits', icon: IndianRupee },
    { href: '/staff-appraisal/reports', label: 'Reports', icon: BarChart3 },
    { href: '/staff-appraisal/executive', label: 'Executive View', icon: Briefcase },
    { href: '/staff-appraisal/international', label: 'International', icon: Globe },
    { href: '/staff-appraisal/ai-impact', label: 'AI Impact', icon: Brain },
  ]
}
```

---

## 17. Permissions

```
sams.dashboard.view          — View live performance dashboard
sams.appraisal.submit        — Submit own appraisal (facilitator)
sams.appraisal.view_own      — View own scores/status
sams.appraisal.review        — Review department appraisals (HoD)
sams.appraisal.validate      — IQAC advisory validation
sams.appraisal.approve       — Final approval (Principal)
sams.appraisal.return        — Return for revision (HoD, Principal)
sams.appeal.file             — File an appeal (facilitator)
sams.appeal.resolve          — Resolve appeals (HoD)
sams.feedback.generate_token — Generate student feedback token (HoD)
sams.coe.approve             — Approve CoE contribution (HoD, Principal)
sams.cycle.manage            — Create/manage cycles (IQAC, COO)
sams.reports.export          — Export PDF/Excel (IQAC)
sams.executive.view          — Read-only executive dashboard (COO/CEO/MD)
sams.staff_mapping.view      — View staff status grid (HoD, Principal)
sams.salary.view             — View salary/benefits projections
sams.team.evaluate           — Submit peer evaluations
sams.tracker.manage          — Manage M03/M07 trackers
```

### Existing Roles to Update

| Role | Permissions to Add |
|---|---|
| faculty | dashboard.view, appraisal.submit, appraisal.view_own, appeal.file, team.evaluate, tracker.manage |
| hod | +review, +return, +feedback.generate_token, +coe.approve, +staff_mapping.view, +appeal.resolve |
| principal | +approve, +return, +coe.approve, +staff_mapping.view, +executive.view |
| super_admin | All (auto-bypass) |

### New Roles to Create

| Role | Permissions |
|---|---|
| iqac_coordinator | dashboard.view, validate, cycle.manage, reports.export, staff_mapping.view |
| iqac_chairman | Same as coordinator |
| vice_principal | Same as principal |

---

## 18. Build Phases (9 phases)

### Phase 1: Foundation
- Migration: 23 tables with RLS + indexes + partial unique index
- Add `sams.*` permissions to hod, principal, faculty roles
- Create iqac_coordinator, iqac_chairman, vice_principal roles
- Storage bucket `sams-evidence`
- Types file: `types/sams.ts`
- Sidebar menu entries in `sidebarMenuLink.ts`

### Phase 2: Auto-Measurement Engine
- `sams-auto-measure-service.ts` — queries 12+ existing tables
- Live score calculation for all 16 metrics
- Dashboard page showing real-time scores per metric

### Phase 3: Faculty Review & Supplement
- 16-metric review form with auto-scores pre-populated
- Supplement entry forms per metric
- Narrative text editor per metric
- Evidence upload
- Declaration checkbox + timestamp
- Submit gate (all 16 reviewed)
- Auto-save on every change

### Phase 4: New Trackers
- M03 International Engagements page + CRUD
- M07 AI Impact Records page + before/after comparison

### Phase 5: Team Evaluation
- Team project creation (M01, M02, M05, M06, M10)
- Anonymous peer evaluation forms (5 criteria + % contribution)
- Score aggregation

### Phase 6: Review Flow
- HoD review queue (HoD self → Principal directly)
- Principal review queue
- Approve/Return actions
- Return for revision modal (flag metric)
- Staff mapping grid
- No HoD → escalate to Principal

### Phase 7: Feedback + Appeals
- M12 feedback token generation (HoD, 48hr expiry)
- Public student feedback form (5 Likert, anonymous)
- Appeals filing (facilitator → HoD only)
- Appeals resolution + SLA tracking

### Phase 8: AI + Salary + Reports
- AI alignment engine (Claude API, every submission)
- Salary projection calculator (grade-based cap)
- All 8 benefits categories display
- IQAC compliance dashboard
- Unified executive dashboard
- PDF/Excel export

### Phase 9: Automation
- Auto-populate on cycle open
- Carry-forward on new quarter
- Deadline reminders (7 working days)
- Appeal SLA checker
- Weekly platform usage snapshots (M15)

---

## 19. Interview Decisions (50 decisions across 2 interview rounds)

### Round 1 — Architecture & Workflow (26 decisions)

| # | Question | Decision |
|---|---|---|
| D1 | Current process | Replacing paper forms |
| D2 | Vision/Mission entry | Intentional knowledge test (manual) |
| D3 | Scale | 100-500 faculty |
| D4 | Review chain | HoD → Principal (every appraisal) |
| D5 | HoD self-appraisal | → Principal directly |
| D6 | No HoD assigned | Escalate to Principal |
| D7 | Auto-save | Every field change |
| D8 | Scoring method | Auto-calculated from entries |
| D9 | AI scoring | Every submission, Claude API |
| D10 | Executive dashboards | One unified |
| D11 | Rubric source | Real JKKN Benchmarks |
| D12 | Team evaluation | Full peer rating (5 criteria) |
| D13 | Salary | Built-in, grade-based cap |
| D14 | Cumulative scoring | Auto-carry-forward |
| D15 | M08 OBE | Fink's Taxonomy (replacing Bloom's) |
| D16 | Salary model | Grade-based cap (A++=15%, A+=10%) |
| D17 | Overall grade bands (v1) | 30-39/20-29/10-19/0-9 (updated in Round 2) |
| D18 | C grade | No — A++/A+/A/B only |
| D19 | Submission window | 7 working days per SOP |
| D20 | Core architecture | Hybrid: auto-calculate + self-report |
| D21 | Gap metrics | Build new tracking |
| D22 | Peer anonymity | Store but hide from evaluated |
| D23 | Declaration | Checkbox + timestamp |
| D24 | M10 scoring | Either/or (achievement OR committees) |
| D25 | IE team | = IQAC |
| D26 | External platforms | Manual for V1 |

### Round 2 — Benchmarks Review (24 decisions)

| # | Question | Decision |
|---|---|---|
| D27 | Document status | Written 2023-24, partially used |
| D28 | What's outdated | Everything — metrics, thresholds, framework |
| D29 | Core philosophy | Keep 13 categories, redesign measurement |
| D30 | M01 CoE Leadership | Keep as-is (3/2/1/0) |
| D31 | M02 Collaborations | Keep as-is |
| D32 | M03 International | Keep — includes virtual |
| D33 | M04 Innovation | Keep as-is |
| D34 | M05 Partnerships | Keep as-is |
| D35 | M06 Mentorship | Keep as-is (15/10/5) |
| D36 | M07 AI Tools | Redesign: measure student outcome improvement |
| D37 | M08 OBE | Redesign: auto from pde_finks_competency (6 dimensions) |
| D38 | M09 Qualifications | Keep as-is |
| D39 | M10 Committees | Keep as-is (either/or) |
| D40 | M11 Initiatives | Keep percentile ranking |
| D41 | M12 Feedback | Enhanced: + attendance + pass rates |
| D42 | M13 H-index | Keep as-is (≥15/10-14/7-9/<7) |
| D43 | NEW M14 | Work Pulse (daily engagement) |
| D44 | NEW M15 | Platform Adoption (MyJKKN usage) |
| D45 | NEW M16 | Process Excellence |
| D46 | Total metrics | 16 (max 48 points) |
| D47 | Grade bands (updated) | A++=38-48, A+=25-37, A=13-24, B=0-12 |
| D48 | New metric thresholds | Data-driven from MyJKKN analytics |
| D49 | Benefits tracking | All 8 categories |
| D50 | Learner outcomes | Feed into M12 (feedback + outcomes) |

---

## 20. Existing MyJKKN Infrastructure (Reuse)

| Infrastructure | Status | SAMS Action |
|---|---|---|
| `institutions` (11) | ✅ | FK reference |
| `departments` (81) | ✅ | FK reference |
| `staff` (32 cols, auth_user_id, profile_id) | ✅ | Link appraisals |
| `custom_roles` (hod, principal, faculty exist) | ✅ | Add sams.* permissions |
| `academic_years` | ✅ | FK for cycles |
| `notifications` (category column) | ✅ | Use category='sams' |
| `user_roles` (multi-role) | ✅ | No changes |
| `profiles` | ✅ | FK reference |
| Storage buckets (3 exist) | ✅ | Create `sams-evidence` |
| `sh_solutions`, `sh_publications`, etc. | ✅ | Auto-measurement source |
| `pde_finks_competency` | ✅ | M08 auto-measurement |
| `okr_objectives`, `okr_key_results` | ✅ | M10 auto-measurement |
| `wp_pulse_entries` | ✅ | M14 auto-measurement |
| `user_activity_logs` | ✅ | M15 auto-measurement |
| `process_definitions`, `process_instances` | ✅ | M16 auto-measurement |
| `nps_surveys`, `nps_responses` | ✅ | M11 + M12 |
| `facilitator_development` | ✅ | M09 + M12 |
| `ss_mentor_matches`, `ss_mentor_sessions` | ✅ | M06 |
| `industry_partners`, `industry_projects` | ✅ | M05 |

---

*Spec v4.0 — Final. 16 metrics, 48 points, 23 tables, 12/16 auto-measured, 50 interview decisions. Ready for build.*
