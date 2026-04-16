---
title: NAAC Metric Coverage Map — Workshop Transformation
version: 0.4
status: Approved (supersedes v0.3 university-type assumptions)
parent: MASTER-PLAN.md v0.4
date: 2026-04-16
framework: NAAC Binary + MBGL (Feb 2025 effective)
cluster: 2 Autonomous (Engineering, Arts & Science) + 4 Affiliated (Dental, Pharmacy, Nursing, Education)
upstream_reference: /Users/omm/Vaults/JKKNKB/.claude/worktrees/agent-a0544f48/NIRF/NAAC-MyJKKN-Gap-Analysis-2026.md
---

# NAAC Metric Coverage Map — v0.4

This map shows where each of the 68 NAAC metrics is covered (or gapped) across JKKN's 6 colleges. It replaces v0.3 which assumed a university-type scoring column. JKKN has ZERO university-type institutions; use only the **Auto** and **Aff** columns.

**Authoritative detail lives in the vault Gap Analysis** (649 lines, per-metric narrative, per-college recommendations). This map is the operational bridge between the vault and the Master Plan phases — consult the vault for depth; consult this map to see which phase delivers which metric.

---

## Legend

| Symbol | Meaning |
|:------:|---------|
| ✅ | MyJKKN tracks this AND institution likely meets threshold |
| ⚠️ | Partial coverage — platform tracks but data thin, or institution partially meets |
| ❌ | Gap — platform does not track; institution has no systematic evidence |
| 🔌 | Framework engine exists (regulatory seed) but no live data connector yet |
| ➖ | Not Applicable for this institution type |
| →X.Y | Metric shifts to Attribute 5 slot X.Y for Affiliated colleges |
| 🆕 | Covered by a phase in v0.4 (column shows phase number) |

**College codes:** E = Engineering (Auto), A = Arts & Science (Auto), D = Dental (Aff), P = Pharmacy (Aff), N = Nursing (Aff), Ed = Education (Aff).

---

## Attribute 1 — Curriculum (Auto 75 · Aff 50)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 1.1 Outcome-Based Curriculum | 15 | ➖ | ⚠️ | ⚠️ | ➖ | ➖ | ➖ | ➖ | 4 | `courses` + `po_co_peo_mapping` (Competency module) |
| 1.2 Stakeholder Feedback | 10 | 10 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 1, 4 | `/iqac/feedback` (NPS resurrection) |
| 1.3 Curriculum Flexibility | 10 | ➖ | ⚠️ | ⚠️ | ➖ | ➖ | ➖ | ➖ | 4 | `programs` with CBCS/ABC/MEME flags |
| 1.4 Practical & Industry Focus | 10 | →5.4 (20) | ✅ | ⚠️ | →5.4 | →5.4 | →5.4 | →5.4 | 5 | Solutions Hub + `learner_industry_engagements` |
| 1.5 Skill Orientation (NCrF) | 10 | ➖ | ❌ | ❌ | ➖ | ➖ | ➖ | ➖ | 4 | `programs.ncrf_alignment` (to build) |
| 1.6 Indian Knowledge System | 5 | →5.5 | ❌ | ❌ | →5.5 | →5.5 | →5.5 | →5.5 | 7 | `iks_initiatives` table (new in Phase 7) |
| 1.7 Online & Blended (SWAYAM) | 5 | →5.3 (20) | ⚠️ | ⚠️ | →5.3 | →5.3 | →5.3 | →5.3 | 7 | `/academic` Learning Paths fold + SWAYAM enrollment |
| 1.8 Curriculum Revision | 10 | ➖ | ⚠️ | ⚠️ | ➖ | ➖ | ➖ | ➖ | 4 | `curriculum_versions` (exists) with revision % computation |

---

## Attribute 2 — Faculty Resources (Auto 50 · Aff 100 — mega for Aff)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 2.1 Faculty-Learner Ratio | 10 | 20 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | auto | `staff` + `learners_profiles` join (computed) |
| 2.2.1 Cadre-wise (Prof/Assoc/Asst) | 10 | ➖ | ⚠️ | ⚠️ | ➖ | ➖ | ➖ | ➖ | 4 | `staff.cadre` field (Phase 4 schema patch) |
| 2.2.2 Doctoral Degree % | 10 | **30** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 4 | `staff.has_doctoral_degree` + type (Phase 4) |
| 2.2.3 Average Experience | 5 | 20 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | auto | `staff.years_of_experience` computed |

> **Aff 30-pt lever (2.2.2):** Dental/Pharmacy/Nursing/Education PhD % is 30-60% today — pushing to NAAC threshold is primarily an institutional HR effort. Platform unlocks measurement; Phase 4a patch makes this attributable. See vault Gap Analysis §Attribute 2 for per-college current estimates.

---

## Attribute 3 — Infrastructure (Auto 50 · Aff 75)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 3.1 Physical Infrastructure | 10 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5d | `fac_registry` + `fac_photos` (new Phase 5) |
| 3.2 Learning Resources (Library) | 10 | 25 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 5d | `library_expenditure_annual` (new) |
| 3.3 Research Resources | 15 | ➖ | ❌ | ❌ | ➖ | ➖ | ➖ | ➖ | 8 | Subscription registry (in research module) |
| 3.4 IT Infrastructure | 10 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5d | `it_bandwidth`, learner-computer ratio |
| 3.5 Divyangjan Facilities | 5 | 10 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 5d | `accessibility_audit` (new) |
| 3.6 Innovation Resources | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | — | University-only metric |

> **Aff Infrastructure is 75 pts** — 3rd largest attribute for Aff colleges. Affiliated item-list swaps Museum Artifacts + Guest House out, adds Faculty Common Room. Phase 5d must use institution-type-conditional checklists.

---

## Attribute 4 — Financial Resources & Management (Auto 50 · Aff 50)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 4.1 Capital Income vs Expenditure | 15 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5c | `/billing` + capex grants (Process Excellence) |
| 4.2 Revenue Income vs Expenditure | 15 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5c | `/billing` multi-source revenue view |
| 4.3 Financial Sustainability (Corpus) | 10 | ➖ | ❌ | ❌ | ➖ | ➖ | ➖ | ➖ | 5c | `corpus_fund_tracker` (new) |
| 4.4 Financial Controls / Audit | 10 | 10 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5c | `/iqac/process` audit archive |

---

## Attribute 5 — Learning & Teaching (Auto 150 · Aff 150 — mega for both)

> For Aff, metrics 1.4/1.6/1.7 SHIFT here. The table below uses the Aff post-shift numbering per vault framework doc.

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 5.1 Pedagogical Approaches | 35 | 40 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 7c | `pedagogy_tags` per course (new) |
| 5.2 LMS Usage | 20 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 7a | Learning Paths fold → `/academic` LMS feature usage |
| 5.3 Industry-Academia (Auto) / 5.3-shift SWAYAM (Aff) | 25 | 20 | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5a, 7a | Solutions Hub (Auto) / SWAYAM credit (Aff) |
| 5.4 Assessment (Auto) / 5.4-shift Practical+Industry (Aff) | 25 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5a, 7c | `assessment_methods` per course + shifted 1.4 |
| 5.5 Catering to Diversity | 15 | 25 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 7d | `remedial_courses`, `bridge_courses`, IKS (Aff shift) |
| 5.6 Academic Grievance Redressal | 15 | ➖ | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | 1c | `/iqac/grievance` (Grievance resurrection) |
| 5.7 Academic Calendar Adherence | 15 | ➖ | ⚠️ | ⚠️ | ➖ | ➖ | ➖ | ➖ | 7a | `academic_calendar` + attendance-derived teaching days |

---

## Attribute 6 — Extended Curricular Engagements (Auto 125 · Aff 125)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 6.1 Domain Clubs | 25 | 25 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5d | `club_types` + `club_memberships` (new) |
| 6.2 Cultural Clubs | 25 | 25 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5d | Same registry, category='cultural' |
| 6.3 Mental Well-being + Mentoring | 15 | 15 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 7d | `mentoring_logs` + mental-health event tagging |
| 6.4 Value Education | 15 | 15 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 7d | `value_ed_events` table (new) |
| 6.5 Sports Clubs / Teams | 20 | 20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 5d | `sports_participation` (state/national/intl levels) |
| 6.6 Community Activities | 25 | 25 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5d | Learners Council events + UBA + community hours log |

---

## Attribute 7 — Governance and Administration (Auto 100 · Aff 125)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 7.1 Institutional Development Plan | 10 | 10 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 3 | OKR (Tier 1 objectives = IDP evidence) |
| 7.2 Effective Leadership | 10 | 15 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 3 | OKR + Learners Council governance artifacts |
| 7.3 Quality Assurance (IQAC) | 10 | 20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 1b, 5b | `/iqac/maturity` (Maturity Assessment) + AQAR workflow |
| 7.4 Statutory Compliance | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | — | University-only |
| 7.5 Learner & Employee Welfare | 15 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 5c, 6 | `/billing` scholarships + hostel + Parent Portal |
| 7.6 Employability Efforts | 15 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 4 | Placement prep + Solutions Hub training programs |
| 7.7 Grievance Handling | 5 | 10 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 1c | `/iqac/grievance` (all categories: anti-ragging, ICC, SC/ST/OBC, etc.) |
| 7.8 e-Governance | 10 | 10 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | auto | MyJKKN existence IS the evidence (9-item checklist for Auto, 5-item for Aff) |
| 7.9 National/International Collaborations | 10 | ➖ | ❌ | ❌ | ➖ | ➖ | ➖ | ➖ | 5a | `mou_registry` (new Phase 5) |
| 7.10 Faculty Retention | 15 | 20 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 4a | `staff` join/leave dates → retention % computation |

---

## Attribute 8 — Student Outcomes (Auto 125 · Aff 100)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 8.1 Learner Enrolment | 20 | 10 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | auto | Admissions auto-calculable |
| 8.2a Graduate Progression | 30 | 15 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 4b | `alumni_outcomes` (Alumni Outcomes resurrection) |
| 8.2b Pass Percentage | ➖ | 10 | ➖ | ➖ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 4b | University result sheet import (Aff only) |
| 8.3 Awards / Recognitions | 15 | 5 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 5d | `learner_awards` (in club/sports registry) |
| 8.4 Learning Experience Survey | **60** | **60** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | **1a** | Learner + Alumni survey export in NAAC format |

> **8.4 is the single highest-weighted metric in the entire framework (60 pts × 6 colleges = 360 pts).** Phase 1a is the top ROI shot in the whole plan.

---

## Attribute 9 — Research and Innovation (Auto 100 · Aff 50)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 9.1 External Research Grants | 20 | 20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 8a | `research_grants` (Solutions→Research Bridge) |
| 9.2 Research Publications | 25 | 20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 8a, 8b | `research_publications` SCOPUS/WoS/UGC-CARE |
| 9.3 Research Quality (h-index) | 20 | ➖ | ❌ | ❌ | ➖ | ➖ | ➖ | ➖ | 8b | SCOPUS API auto-pull |
| 9.4 PhDs Awarded | 20 | 10 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 8a | `research_phd_scholars` (guide + scholar + thesis) |
| 9.5 Research Fellowships | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | — | University-only |
| 9.6 Intellectual Property | 5 | ➖ | ⚠️ | ⚠️ | ➖ | ➖ | ➖ | ➖ | 8a | `research_ip` (patents/copyrights/trademarks) |
| 9.7 Consultancy & Training | 10 | ➖ | ⚠️ | ⚠️ | ➖ | ➖ | ➖ | ➖ | 8a | `research_consultancy` linked to Solutions Hub |

> **Aff Research is 50 pts total (6 metrics Not Applicable).** For Aff, Phase 8 addresses only 9.1, 9.2, 9.4 — but collectively that's 50 pts per Aff college = 200 pts cluster impact.

---

## Attribute 10 — Sustainability & Green Initiatives (Auto 75 · Aff 75 — identical)

| Metric | Auto pts | Aff pts | E | A | D | P | N | Ed | Phase | Data source |
|--------|---------:|--------:|:-:|:-:|:-:|:-:|:-:|:--:|:-----:|-------------|
| 10.1 Community Activities | 25 | 25 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 2a, 5d | Learners Council + `community_hours_log` |
| 10.2 Water & Waste Management | 20 | 20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 2a | `sus_waste_streams` (includes bio-medical for D + N) |
| 10.3 Net Zero Progress (Energy) | 20 | 20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 2a | `sus_energy_sources` (solar, biogas, grid-wheeling, LED) |
| 10.4 Green Audits | 10 | 10 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 2b | `sus_audits` — GRIHA / IGBC / energy / air / water audit uploads |

> **Dental + Nursing already operate bio-medical waste management (regulatory).** Documenting it is free points. Phase 2a should prioritize these two colleges' existing evidence capture first.

---

## Summary — 12 Biggest Gaps (vault-identified, phase-assigned)

| Rank | Gap | Cluster points | Phase | Effort |
|-----:|-----|---------------:|:-----:|:------:|
| 1 | No NAAC 8.4 survey export mechanism | 360 | 1a | LOW |
| 2 | No Sustainability module at all (Attr 10 untracked) | 450 | 2 | MED |
| 3 | No Research module (Attr 9 untracked) | 310 | 8 | HIGH |
| 4 | No IQAC module (meetings, AQAR, initiatives) | 90 | 1b, 5b | LOW |
| 5 | No structured stakeholder feedback (1.2 across 6 colleges) | 60 | 1, 4 | LOW |
| 6 | No infrastructure registry (Attr 3) | 225 | 5d | MED |
| 7 | No club / sports / community service registry (Attr 6) | 400 | 5d | MED |
| 8 | Faculty staff table missing cadre + PhD flags (Aff Attr 2) | 180 | 4a | LOW (schema) + HIGH (institutional) |
| 9 | No pedagogy tagging per course (Attr 5.1) | 225 | 7c | MED |
| 10 | No MoU registry (7.9, Auto only) | 20 | 5a | LOW |
| 11 | No accessibility audit (Divyangjan, 3.5) | 50 | 5d | MED |
| 12 | No DCF 2025 SSR auto-generator | indirect (enables submission) | 7b | MED |

---

## Cross-Reference to Vault Gap Analysis

This map is intentionally thin — for narrative, per-college current readiness estimates, and strategic rationale, read the vault document:

**Primary:** `/Users/omm/Vaults/JKKNKB/.claude/worktrees/agent-a0544f48/NIRF/NAAC-MyJKKN-Gap-Analysis-2026.md` (649 lines)

**Secondary (framework-of-truth):** `/Users/omm/Vaults/JKKNKB/NIRF/NAAC-Reforms-2024-Binary-Accreditation-Framework.md` (1533 lines — full official digest)

**Strategic lens (methodology reference only, not truth):** `/Users/omm/Vaults/JKKNKB/NIRF/2026-04-16-CLIP-NAAC-Reforms-Strategic-Guide-Divaakaran.md` — use Dr Divaakaran's 6-step methodology for IQAC's SSR narrative preparation.

Do not duplicate the vault Gap Analysis into this repo — when it is updated, this map references the canonical source.

---

## Version History

| Version | Date | Delta |
|---------|------|-------|
| 0.1 | 2026-04-16 | Initial draft — all 68 metrics listed, no college split, university assumptions. |
| 0.2 | 2026-04-16 | Split by institution type (U / A / Aff) — still treated JKKN as single entity. |
| 0.3 | 2026-04-16 | Added pass-percentage (8.2b for Aff); cleaned shift notation; STILL carried university column inappropriately for JKKN. |
| **0.4** | **2026-04-16** | **Removed University column (JKKN has none). Added 6-college grid (E, A, D, P, N, Ed). Applied affiliated metric shifts (1.4→5.4, 1.6→5.5, 1.7→5.3). Mapped every metric to its v0.4 phase. Cross-referenced vault canonical source. 12-gap summary aligned to MASTER-PLAN v0.4 phases.** |
