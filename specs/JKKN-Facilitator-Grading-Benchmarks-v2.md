# JKKN Learning Facilitator Grading Benchmarks v2.0
## Updated April 2026 — MyJKKN-Native Measurement

**Previous version:** v1.0 (2023-2024, partially implemented, paper-based)
**This version:** v2.0 (2026, MyJKKN auto-measurement, 16 metrics)
**Status:** Approved via interview (24 decisions documented)

---

## Philosophy Change

| v1.0 (2023) | v2.0 (2026) |
|---|---|
| Paper-based self-assessment | MyJKKN auto-measures from real data |
| 13 metrics | 16 metrics |
| Max 39 points | Max 48 points |
| CAMU + Quizizz (external) | MyJKKN native |
| Count-based (e.g., "5+ AI tools") | Impact-based where possible |
| Manual salary calculation | System-calculated projections |

**Core principle:** What MyJKKN can measure, the system grades automatically. Facilitators review, supplement, and declare accuracy.

---

## Scoring Scale (unchanged)

| Grade | Points | Meaning |
|---|---|---|
| **A++** | 3 | Exceptional / Exemplary |
| **A+** | 2 | Proficient / Significant |
| **A** | 1 | Developing / Participation |
| **B** | 0 | Inadequate / None |

---

## The 16 Metrics

### ORIGINAL METRICS (1-13) — Updated for MyJKKN

---

### M01 — CoE Leadership & Solutions ✅ UNCHANGED
**Team Metric:** Yes (Metrics 1, 2, 5, 6, 10)

Taking proactive leadership roles in Centers of Excellence aligned with the institution's vision. Conducting add-on programs for Learners/Facilitators/Industry in alignment with COE.

| Grade | Threshold |
|---|---|
| A++ (3) | 3+ solutions/add-on programs (cumulative in calendar year) |
| A+ (2) | 2 solutions/programs |
| A (1) | 1 solution/program |
| B (0) | None |

**MyJKKN Data Source:** `sh_solutions` (created_by), `sh_builder_assignments` (builder_id), `sh_training_programs` (facilitator)

---

### M02 — Interdisciplinary COE Collaborations ✅ UNCHANGED
**Team Metric:** Yes

Fostering cross-COE knowledge exchange, resource sharing, and joint innovative projects under JKKN Institutions.

| Grade | Threshold |
|---|---|
| A++ (3) | 3+ collaborations |
| A+ (2) | 2 collaborations |
| A (1) | 1 collaboration |
| B (0) | None |

**MyJKKN Data Source:** `sh_solutions` + `sh_solution_departments` (solutions involving 2+ departments where facilitator is a contributor)

---

### M03 — Global/International Engagements ✅ UPDATED (includes virtual)

Actively participating in global engagements — international events, initiatives, collaborations. **Virtual participation counts equally** (webinars, online conferences, remote collaborations with foreign universities).

| Grade | Threshold |
|---|---|
| A++ (3) | 3+ international engagements |
| A+ (2) | 2 engagements |
| A (1) | 1 engagement |
| B (0) | None |

**MyJKKN Data Source:** NEW table `sams_international_engagements` (manual entry until auto-tracking built)
**Change from v1:** Virtual engagements now count. Added `engagement_mode` field (in-person/virtual/hybrid).

---

### M04 — Innovation/Patents/Publications ✅ UNCHANGED

Developing innovations leading to practical solutions, patents, or publications.

| Grade | Threshold |
|---|---|
| A++ (3) | 3+ innovations/patents/publications |
| A+ (2) | 2 |
| A (1) | 1 |
| B (0) | None |

**MyJKKN Data Source:** `sh_publications` (42-column table), `sh_publication_contributors` (staff_id), `sh_product_validations`, `sh_prototype_iterations`

---

### M05 — Industry/University/Community Partnerships ✅ UNCHANGED
**Team Metric:** Yes

Strategic partnerships with industry, universities, institutions of national importance.

| Grade | Threshold |
|---|---|
| A++ (3) | 3+ partnerships/engagements |
| A+ (2) | 2 |
| A (1) | 1 |
| B (0) | None |

**MyJKKN Data Source:** `industry_partners`, `industry_projects` (mentor_id), `sh_solution_mous`, `facilitator_industry_immersion`

---

### M06 — Mentorship & Leadership ✅ UNCHANGED
**Team Metric:** Yes

Guiding mentees, junior Learning Facilitators, Learners — placements, internships, higher education, government exam training, sports, cultural events.

| Grade | Threshold |
|---|---|
| A++ (3) | 15+ mentees guided |
| A+ (2) | 10 mentees |
| A (1) | 5 mentees |
| B (0) | Limited/None |

**MyJKKN Data Source:** `ss_mentor_matches` (mentor_id, status, sessions_completed, goals_met), `ss_mentor_sessions`

---

### M07 — AI Impact on Learning Outcomes 🔄 REDESIGNED

**v1 (old):** Count of AI tools used (5+/3-4/1-2)
**v2 (new):** Measure student outcome improvement after AI tool adoption

Leveraging AI tools to enhance teaching, research, or admin — measured by **demonstrable impact on student outcomes**, not tool count.

| Grade | Threshold |
|---|---|
| A++ (3) | Measurable improvement in student pass rates OR learning outcomes in AI-integrated courses (>10% improvement vs. baseline) |
| A+ (2) | Moderate improvement (5-10% vs. baseline) OR AI-assisted publications/curriculum materials with documented adoption |
| A (1) | AI tools integrated into course delivery with evidence of usage (but no outcome measurement yet) |
| B (0) | Minimal/No AI integration |

**MyJKKN Data Source:**
- Compare `student_attendance` + pass rates before/after AI integration per course
- `pde_engagement_events` for AI-related learning events
- Facilitator supplement: describes AI integration with evidence

**Scoring logic:** System compares current quarter outcomes vs. previous year's baseline for same courses taught by same facilitator. If improvement correlates with AI adoption timeline, auto-scores. HoD validates.

---

### M08 — Fink's Taxonomy Implementation (OBE) 🔄 REDESIGNED

**v1 (old):** 8 sub-rubrics referencing CAMU and Quizizz (external platforms)
**v2 (new):** Auto-calculated from MyJKKN's `pde_finks_competency` data — measures coverage and depth across Fink's 6 dimensions

**Fink's 6 Dimensions:**
1. Foundational Knowledge
2. Application
3. Integration
4. Human Dimension
5. Caring
6. Learning How to Learn

| Grade | Threshold |
|---|---|
| A++ (3) | All 6 dimensions at ≥80% competency |
| A+ (2) | 4-5 dimensions at ≥60% competency |
| A (1) | 2-3 dimensions with any competency tracked |
| B (0) | 0-1 dimensions tracked |

**MyJKKN Data Source:** `pde_finks_competency` — has `finks_dimension`, `competency_pct` per learner per course. Aggregate by facilitator: across all courses taught, what % of Fink's dimensions are covered at what competency level.

**Change from v1:** Eliminated 8 manual sub-rubrics. Now fully auto-calculated from actual platform data. No self-assessment needed for this metric.

---

### M09 — Qualifications & Certifications ✅ UNCHANGED

Pursuing SWAYAM NPTEL certifications, advanced degrees, professional development.

| Grade | Threshold |
|---|---|
| A++ (3) | Multiple advanced degrees/certs OR NPTEL Topper certificate |
| A+ (2) | 2 courses/certs OR NPTEL Elite+Gold |
| A (1) | 1 course/participation OR NPTEL Elite |
| B (0) | Limited/None |

**MyJKKN Data Source:** `facilitator_development` (certifications JSONB, workshops_attended, workshops_facilitated, competencies_acquired)

---

### M10 — Committee Working Groups ✅ UNCHANGED (either/or rule)
**Team Metric:** Yes

Achievement in institutional committees, decision-making, project execution.

| Grade | Threshold (EITHER condition qualifies) |
|---|---|
| A++ (3) | ≥90% OKR achievement OR leadership in 3+ committees |
| A+ (2) | 70-89% achievement OR leadership in 2 committees |
| A (1) | 50-69% achievement OR contribution to 1 committee |
| B (0) | <49% achievement |

**MyJKKN Data Source:** `okr_objectives` (overall_progress), `okr_key_results` (progress_percentage), `marathon_committees`
**Scoring:** Grade = MAX(grade_from_achievement_%, grade_from_committee_count)

---

### M11 — Impactful Initiatives ✅ UNCHANGED (percentile ranking)

Initiatives aligned with vision/mission, measured by impact analysis surveys. **Relative ranking** within institution.

| Grade | Threshold |
|---|---|
| A++ (3) | Top 10% impact score |
| A+ (2) | Top 20% impact score |
| A (1) | Top 50% impact score |
| B (0) | Low/No impact |

**MyJKKN Data Source:** `nps_surveys` + `nps_responses` — IQAC creates M11-specific impact survey per cycle. Facilitator's percentile rank determines grade.

---

### M12 — Student Feedback & Outcomes 🔄 ENHANCED

**v1 (old):** Student ratings only
**v2 (new):** Student ratings + learner attendance + pass rates — a composite score

| Grade | Threshold |
|---|---|
| A++ (3) | ≥90% positive feedback AND strong learner outcomes (attendance >85%, pass rate >80%) |
| A+ (2) | 75-89% positive feedback AND decent outcomes (attendance >75%, pass rate >70%) |
| A (1) | 50-74% mixed feedback OR mixed outcomes |
| B (0) | <49% low feedback OR poor outcomes |

**MyJKKN Data Source:**
- `facilitator_development.student_feedback_average` — existing feedback score
- `student_attendance` — attendance rates for facilitator's classes
- Pass rates from academic results data (when available)
- Fallback: HoD-generated feedback token (48hr, 5 Likert questions, anonymous)

**Change from v1:** No longer just student opinion. Combines subjective feedback with objective outcomes (attendance, pass rates).

---

### M13 — Scholarly Impact (Scopus H-index) ✅ UNCHANGED

| Grade | Threshold |
|---|---|
| A++ (3) | H-index ≥ 15 |
| A+ (2) | H-index 10-14 |
| A (1) | H-index 7-9 |
| B (0) | H-index < 7 |

**MyJKKN Data Source:** `sh_publications` (h_index_contribution, scopus_indexed, citation_count). Auto-calculate approximate H-index from publication data. Faculty can enter official Scopus H-index as supplement.

---

### NEW METRICS (14-16) — MyJKKN-Native

---

### M14 — Work Pulse (Daily Engagement) 🆕 NEW

Consistent daily engagement with institutional work, tracked via MyJKKN's Work Pulse module.

| Grade | Threshold |
|---|---|
| A++ (3) | **Data-driven** — top quartile of engagement frequency + depth |
| A+ (2) | Above median engagement |
| A (1) | Regular but minimal engagement |
| B (0) | Sporadic or no engagement |

**MyJKKN Data Source:** `wp_pulse_entries` (daily work logs), `wp_agent_impact` (impact assessment), `wp_patterns` (work patterns)

**Threshold calibration:** After first quarter, analyze distribution of `wp_pulse_entries` across all facilitators. Set A++/A+/A/B cutoffs at 75th/50th/25th percentile. Recalibrate quarterly.

---

### M15 — MyJKKN Platform Adoption 🆕 NEW

How effectively the facilitator uses MyJKKN for their daily work — measuring digital transformation at the individual level.

| Grade | Threshold |
|---|---|
| A++ (3) | **Data-driven** — uses 5+ MyJKKN modules actively, daily logins, contributes data across modules |
| A+ (2) | Uses 3-4 modules regularly |
| A (1) | Uses 1-2 modules, occasional login |
| B (0) | Rarely uses MyJKKN |

**MyJKKN Data Source:** `user_activity_logs` (login frequency, pages visited, actions taken), cross-reference with module-specific tables to count active modules

**Threshold calibration:** Data-driven from actual usage analytics after first quarter.

---

### M16 — Process Excellence Contributions 🆕 NEW

Contributions to institutional process improvement — designing, implementing, or improving processes that increase efficiency.

| Grade | Threshold |
|---|---|
| A++ (3) | **Data-driven** — multiple processes designed or significantly improved with measurable impact |
| A+ (2) | Active contribution to process improvement |
| A (1) | Participation in process initiatives |
| B (0) | No process contributions |

**MyJKKN Data Source:** `process_definitions` (created_by), `process_instances` (participation), `process_audits` (audit involvement)

**Threshold calibration:** Data-driven from actual process module usage after first quarter.

---

## Cumulative Calendar Year Rule (unchanged)

Achievements cumulate within Jan–Dec:
- Q1 = Q1 entries only
- Q2 = Q1 + Q2 entries
- Q3 = Q1 + Q2 + Q3
- Q4 = full year total

> "Whatever is achieved by the Learning Facilitator is cumulated for the entire year starting the first quarter of the calendar year."

---

## Team Performance Evaluation (unchanged)

**Team metrics:** M01, M02, M05, M06, M10

For team projects under these metrics:
- Anonymous peer ratings (5 criteria, 1-5 scale)
- Estimated % contribution (must total 100%)
- Evaluator identity stored but hidden from evaluated person

**5 Criteria:** Alignment with Metric Goals, Quality of Work, Initiative, Communication, Collaboration

---

## Overall Grade Bands (updated for 48 points)

| Total Points | Grade | Salary Cap |
|---|---|---|
| 38-48 | **A++** | Up to 15% |
| 25-37 | **A+** | Up to 10% |
| 13-24 | **A** | Standard increment |
| 0-12 | **B** | No increment |

**Minimum 2 points for any increment. No maximum limit.**

---

## Benefits Matrix (all 8 categories tracked)

| Category | A++ | A+ | A | B |
|---|---|---|---|---|
| **Salary** | Up to 15% increase | Up to 10% | Standard increment | No increment |
| **Prof Development** | Global programs, all expenses | National programs, costs covered | Standard programs | Base level only |
| **Recognition** | Top performer awards | Institutional acknowledgment | Dept-level recognition | None |
| **Promotion** | Priority consideration | Strong consideration | Normal review | Not considered |
| **Research Funding** | Privileged access, +20% | Priority access | Standard access | Not eligible |
| **Leadership** | Major institutional roles | Department leadership | Small team leads | Not assigned |
| **Resources** | Premium tools, admin support | Upgraded software/databases | Standard | Basic only |
| **Flexibility** | Remote work, flexible schedule | Standard | Standard | Standard |

---

## Self-Assessment Report (updated)

Faculty still writes a narrative self-assessment per metric each quarter, but:
1. **Auto-scores are pre-populated** from MyJKKN data
2. Faculty **reviews** auto-scores and **supplements** anything the system missed
3. Faculty writes **narrative justification** per metric
4. Faculty checks **declaration** ("I declare this information is true and accurate") with timestamp
5. Submission deadline: **7 working days** after quarter end

---

## SOP Updates from v1

| SOP Element | v1 (2023) | v2 (2026) |
|---|---|---|
| Data collection | Manual self-assessment forms | Auto from MyJKKN + supplement |
| Verification | IE team manually checks | System-verified + HoD validates |
| AI tools prompt | "Use ChatGPT to generate examples" | System auto-calculates AI impact |
| OBE assessment | 8 CAMU/Quizizz sub-rubrics | Auto from Fink's taxonomy data |
| Impact measurement | Ideas@JKKN platform | NPS surveys within MyJKKN |
| Salary calculation | Manual | System-calculated projection |
| Benefits tracking | Not tracked | All 8 categories displayed |
| Platform references | CAMU, Quizizz, Ideas@JKKN | MyJKKN native |

---

## Metric Auto-Measurement Summary

| Metric | Auto from MyJKKN? | Data Source |
|---|---|---|
| M01 CoE Leadership | ✅ Full | sh_solutions, sh_builder_assignments, sh_training_programs |
| M02 Collaborations | ✅ Full | sh_solutions + sh_solution_departments (2+ depts) |
| M03 International | ❌ Manual | New table: sams_international_engagements |
| M04 Innovation | ✅ Full | sh_publications, sh_publication_contributors, sh_product_validations |
| M05 Partnerships | ✅ Full | industry_partners, industry_projects, sh_solution_mous, facilitator_industry_immersion |
| M06 Mentorship | ✅ Full | ss_mentor_matches, ss_mentor_sessions |
| M07 AI Impact | 🔄 Partial | student_attendance + pass rates before/after AI adoption. Supplement: manual evidence |
| M08 Fink's OBE | ✅ Full | pde_finks_competency (auto-calculated from 6 dimensions) |
| M09 Qualifications | ✅ Full | facilitator_development (certifications, workshops) |
| M10 Committees | ✅ Full | okr_objectives (progress %), marathon_committees |
| M11 Initiatives | 🔄 Partial | nps_surveys + nps_responses (IQAC creates survey) |
| M12 Feedback+Outcomes | ✅ Full | facilitator_development.student_feedback_average + student_attendance |
| M13 H-index | ✅ Full | sh_publications (h_index_contribution, scopus_indexed) |
| M14 Work Pulse | ✅ Full | wp_pulse_entries, wp_agent_impact, wp_patterns |
| M15 Platform Adoption | ✅ Full | user_activity_logs + cross-module usage |
| M16 Process Excellence | ✅ Full | process_definitions, process_instances, process_audits |

**Auto-measurable: 12/16 (75%) | Partial: 2/16 | Manual: 1/16 | Survey-based: 1/16**

---

## Changes from v1 → v2 Summary

| Change | Detail |
|---|---|
| +3 new metrics | M14 Work Pulse, M15 Platform Adoption, M16 Process Excellence |
| M07 redesigned | Tool count → student outcome improvement |
| M08 redesigned | 8 CAMU sub-rubrics → auto Fink's taxonomy from MyJKKN |
| M12 enhanced | Feedback only → feedback + attendance + pass rates |
| M03 updated | Physical only → includes virtual engagements |
| Max score | 39 → 48 |
| Grade bands | Proportional scaling to 48 |
| Platform refs | CAMU/Quizizz/Ideas@JKKN → MyJKKN native |
| Bloom's → Fink's | Taxonomy updated throughout |
| Measurement model | Self-report → auto-measure + supplement |

---

*v2.0 — Updated based on 24 interview decisions. Original v1.0 preserved at specs/JKKN-Facilitator-Grading-Benchmarks.md*
