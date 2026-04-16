---
title: Workshop Transformation Master Plan
version: 0.4
status: Approved (supersedes v0.3)
author: Director Office + Claude (planning agent)
date: 2026-04-16
framework: NAAC Binary + MBGL (Feb 2025 effective) — DCF 2025
target: NAAC 2027 submission window
validity: 3 years post-accreditation
supersedes: v0.3 (old NAAC terms, single-institution assumptions)
references:
  - /Users/omm/Vaults/JKKNKB/NIRF/NAAC-Reforms-2024-Binary-Accreditation-Framework.md
  - /Users/omm/Vaults/JKKNKB/.claude/worktrees/agent-a0544f48/NIRF/NAAC-MyJKKN-Gap-Analysis-2026.md
  - /Users/omm/Vaults/JKKNKB/NIRF/2026-04-16-CLIP-NAAC-Reforms-Strategic-Guide-Divaakaran.md
---

# Workshop Transformation Master Plan — v0.4

## 0. Executive Summary

JKKN operates **6 colleges — 2 Autonomous (Engineering, Arts & Science) + 4 Affiliated (Dental, Pharmacy, Nursing, Education)**. Under the NAAC Binary + MBGL framework (effective Feb 2025, AI-assessed via DCF 2025), **each college submits its own binary accreditation** (Accredited / Not Accredited) scored out of **900 points across 10 Attributes** on Input / Process / Outcome layers. Scoring weights differ between Autonomous and Affiliated — e.g., Attribute 1 Curriculum scores 75 for Auto vs 50 for Aff; Attribute 2 Faculty Resources scores 50 for Auto vs **100 for Aff**; several Attribute 1 metrics shift into Attribute 5 for Aff colleges.

The vault Gap Analysis (2026-03-07) estimates **current readiness at ~45% (~405/900 per college) with ~495 points at risk**. Of the 11 abandoned "Workshop Transformation" modules (Feb-Mar 2026 suite) whose migrations hit production but whose code never shipped, **8 are compliance-adjacent** and belong under a new `/iqac` umbrella. OKR and Parent Portal remain standalone; Learning Paths folds into `/academic`. A **12th module — Solutions→Research Bridge (NEW)** — is added to address the single largest strategic gap (Attribute 9, 35-85 pts per college). A 13th workstream — **Sustainability (fresh build)** — addresses Attribute 10 (75 pts across every college, untracked today).

This plan sequences delivery by **point-recovery ROI** (vault's top quick wins first), not by architectural cleanliness. The single highest-value metric — **8.4 Learning Experience Survey (60 pts per college = 360 pts across cluster)** — ships in Phase 1. A college switcher (Engineering / Arts & Science / Dental / Pharmacy / Nursing / Education / Cluster rollup) anchors the `/iqac` UX so each college's IQAC Coordinator sees only their numbers while the Director sees all seven views.

IQAC uses the LinkedIn article's **6-step methodology** (predictive analytics; international comparative; regulatory review; stakeholder engagement; academic/industry impact; mixed-methods synthesis) as the lens for SSR preparation — not as the framework of truth. Source of truth is the NAAC July 2024 Binary Framework digest in the vault.

**Budget:** 8 phases, session-paced (2-session phases for quick wins, up to 6-session phases for new builds). Target first Phase 1 draft PR in session +1; Phase 8 complete 12-16 working sessions out.

---

## 1. Locked Decisions (Do Not Re-Litigate)

1. **Framework:** NAAC Binary + MBGL, effective Feb 2025. 10 Attributes × Input/Process/Outcome. 900 pts per college. Binary outcome. AI-assessed via DCF 2025.
2. **Cluster structure:** 6 colleges — 2 Auto (Engineering, A&S) + 4 Aff (Dental, Pharmacy, Nursing, Education). Each submits own SSR.
3. **Architecture:** `/iqac` umbrella absorbs 8 compliance-adjacent modules. OKR and Parent Portal remain top-level. Learning Paths folds into `/academic`. NEW: Sustainability module, Solutions→Research Bridge.
4. **Phase ordering:** Point-recovery ROI, not architectural cleanliness.
5. **UX:** College switcher in `/iqac` header — dropdown with 6 colleges + Cluster rollup.
6. **Intent ≠ Schema:** Grievance ≠ bug_reports (different users, regulators, workflows, SLAs). Keep both.
7. **Phase count:** 8 phases (Phase 8 = Solutions→Research Bridge, newly added).
8. **Terminology:** "learners" not "students". JKKN brand terms throughout.

---

## 2. Module Inventory (12 modules, 6 colleges)

| # | Module | Origin | Files¹ | Tables¹ | Home after v0.4 | Attr Covered |
|---|--------|--------|-------:|--------:|-----------------|--------------|
| 1 | OKR | Abandoned (clean-ss-deploy) | 93 | 18 | `/okr` (standalone) | 7.1, 7.2 |
| 2 | Competency | Abandoned | 39 | 4 | `/iqac/competency` | 1.1, 8.2 |
| 3 | Learning Paths | Abandoned | 8 | 2 | Fold → `/academic` | 5.2 |
| 4 | Industry Integration | Abandoned | 6 | 4 | `/iqac/industry` | 5.3, 7.9, 1.4 |
| 5 | Facilitator Development | Abandoned | 20 | 2 | `/iqac/facilitator` | 2.2, 7.10 |
| 6 | Alumni Outcomes | Abandoned | 2 | 2 | `/iqac/alumni` | 8.2, 8.4 |
| 7 | Parent Portal | Abandoned | 64 | 7 | `/parents` (standalone) | 1.2, 6.3, 7.5 |
| 8 | NPS / Stakeholder Feedback | Abandoned | 41 | 3 | `/iqac/feedback` | 1.2, 8.4 |
| 9 | Grievance | Abandoned | 48 | 4 | `/iqac/grievance` | 7.7, 5.6 (Auto) |
| 10 | Maturity Assessment | Abandoned | 46 | 4 | `/iqac/maturity` | 7.3 |
| 11 | Process Excellence | Abandoned | 47 | 4 | `/iqac/process` | 7.3, 4.4 |
| 12 | **Sustainability (NEW)** | Fresh build | TBD | ~6 | `/iqac/sustainability` | Attr 10 (all) |
| 13 | **Solutions→Research Bridge (NEW)** | New | TBD | 6 | `/iqac/research` (bridges Solutions Hub) | Attr 9 |

¹ Counts for items 1-11 are from `reference_abandoned_modules_inventory.md` — what sits on `clean-ss-deploy` and has matching production schema. Counts for items 12-13 are projected.

**Intent-vs-schema reminder:** Grievance (`grievance_tickets`) serves learner/parent/staff complaints under UGC regulation; `bug_reports` serves platform defect triage. Schema overlap is ~80% but audience, regulator, SLA, and evidence standard differ — keep both.

---

## 3. NAAC Attribute × Data Source Matrix

| Attr | Name | Auto pts | Aff pts | Primary Data Source(s) After v0.4 | Phases Touching |
|-----:|------|---------:|--------:|-----------------------------------|-----------------|
| 1 | Curriculum | 75 | 50 | `/academic` (courses, curriculum_versions, PO/CO/PEO), `/iqac/feedback` | 4, 7 |
| 2 | Faculty Resources | 50 | **100** | `/hr` (staff with cadre + has_doctoral_degree), `/iqac/facilitator` | 4 |
| 3 | Infrastructure | 50 | 75 | Facility registry (new, in Phase 5) | 5 |
| 4 | Financial | 50 | 50 | `/billing` + `/iqac/process` (audit archive) | 5 |
| 5 | Learning & Teaching | 150 | 150 | `/academic` (pedagogy, LMS, assessment), `/iqac/industry`, `/iqac/grievance` | 4, 5, 7 |
| 6 | Extended Curricular | 125 | 125 | `/learners-council`, club registry (Phase 5), sports (Phase 5) | 5 |
| 7 | Governance | 100 | 125 | `/iqac/maturity`, `/iqac/process`, `/okr`, `/iqac/grievance`, MoU registry | 1, 3, 5 |
| 8 | Student Outcomes | 125 | 100 | `/iqac/alumni`, `/iqac/feedback`, survey export (Phase 1) | 1, 4 |
| 9 | Research & Innovation | **100** | 50 | `/iqac/research` (Bridge to Solutions Hub) | 8 |
| 10 | Sustainability | 75 | 75 | `/iqac/sustainability` (fresh build) | 2 |

**Affiliated metric shift table (CRITICAL):**

| Original (Auto) | Shifts to (Aff) | Topic | Aff Pts |
|-----------------|-----------------|-------|--------:|
| 1.4 | **5.4** | Practical & Industry Focus | 20 |
| 1.6 | **5.5** | Indian Knowledge System | part of 25 |
| 1.7 | **5.3** | Online & Blended (SWAYAM) | 20 |

Implication: for Aff colleges, Attribute 5 becomes a mega-block of 150 pts absorbing these shifts. Pedagogy + LMS + diversity + IKS + SWAYAM + internships all score here. Phase 4 and Phase 7 must tag evidence against both the original (Auto) metric number and the shifted (Aff) metric number.

---

## 4. Eight-Phase Plan (Sequenced by Point-Recovery ROI)

Each phase lists: deliverables, file/table counts, session target, attribute mapping (Auto + Aff), per-college success metric, risks.

### Phase 1 — Metric 8.4 LES + IQAC Shell + Grievance (Quick Win Cluster)

**Strategic rationale:** Metric 8.4 (Learning Experience Survey) is 60 pts per college — the single highest-weighted metric. All 6 colleges × 60 = 360 pts on the table. Data already exists in MyJKKN (learners, alumni). What's missing is the NAAC-format export mechanism plus consent collection. We pair it with IQAC shell (to register all subsequent work against an IQAC workflow) and Grievance resurrection (UGC-mandated, low-effort digitize).

| Item | Files | Tables | Attr Auto | Attr Aff | Pts Auto | Pts Aff |
|------|------:|-------:|-----------|----------|---------:|--------:|
| 1a. NAAC Survey Export (DCF 2025 learner + alumni CSV + DPDPA 2023 consent) | ~8 | 1 (`naac_survey_consents`) | 8.4 | 8.4 | 60 | 60 |
| 1b. IQAC Shell (`/iqac` route, college switcher, coordinator role, dashboard stub) | ~12 | 2 (`iqac_coordinators`, `iqac_meetings`) | 7.3 | 7.3 | 10 | 20 |
| 1c. Grievance resurrection (48 files from clean-ss-deploy, RLS remediation, seed categories) | 48 | 4 (existing) | 7.7, 5.6 | 7.7 | 15 | 10 |

**Session target:** 2 sessions. **Build effort:** LOW-MEDIUM.
**Per-college success metric:** (a) 100% of active learners + alumni emails validated and consented for NAAC share within 6 weeks; (b) IQAC Coordinator can log into `/iqac`, switch college, view the attribute scoreboard; (c) Grievance tickets flowable end-to-end (submit → committee → resolve → SLA tracked) in every college.
**Cluster points addressable:** 60×6 + 20×6 (IQAC) + avg 12×6 (Grievance) = 552 pts across cluster.
**Risks:** R1 (low consent rate → survey gap), R2 (college switcher scoping bug leaks data), R6 (RLS drift on resurrected grievance tables).

### Phase 2 — Sustainability (Attribute 10, Fresh Build)

**Strategic rationale:** 75 pts per college untracked today — 450 pts across cluster. JKKN campuses likely have solar panels, rainwater harvesting, bio-medical waste systems (regulatory at Dental + Nursing), but nothing is documented in MyJKKN. This is documentation-first: facilities + geo-tagged photos + audit archive.

| Item | Files | Tables | Attr | Pts/college |
|------|------:|-------:|------|------------:|
| 2a. Sustainability registry (water, energy, waste) | ~25 | 4 (`sus_facilities`, `sus_energy_sources`, `sus_waste_streams`, `sus_audits`) | 10.1-10.4 | up to 75 |
| 2b. Green audit upload flow + geo-tag verifier | ~6 | reuses `sus_audits` | 10.4 | 10 |

**Session target:** 2 sessions.
**Per-college success:** (a) every facility geo-tagged with photo + purchase bill; (b) one recognized green audit (GRIHA / IGBC) uploaded or scheduled; (c) bio-medical waste evidence uploaded for Dental + Nursing by session +5.
**Cluster points addressable:** up to 450. Realistic 65 × 6 = 390 once audits land.
**Risks:** R3 (no recognized audit exists yet → schedule blocker), R4 (facilities exist but photos/bills scattered).

### Phase 3 — OKR Standalone (Resume Paused Worktree)

**Strategic rationale:** OKR worktree is paused mid-resurrection (cluster council decision 2026-04-16 locked OKR as the single source for directives + check-ins). Council objectives → Tier-1 OKRs → fortnightly check-ins → NAAC criteria tags. Feeds Attr 7.1 (IDP) and 7.2 (Leadership).

| Item | Files | Tables | Attr Auto | Attr Aff | Pts |
|------|------:|-------:|-----------|----------|----:|
| 3. OKR resurrection (93 files cherry-picked, triaged per "question before cherry-pick" rule — 3 essential + 4 optional tables, 10 deferred) | 93 (trimmed) | 7 (from 18) | 7.1, 7.2 | 7.1, 7.2 | 20 / 25 |

**Session target:** 2 sessions (resume existing worktree, not greenfield).
**Per-college success:** each college has ≥1 Tier-1 OKR published + 2 check-ins logged in the first fortnight after deploy.
**Cluster points addressable:** 120 pts (20 Auto × 2 + 25 Aff × 4).
**Risks:** R5 (council adoption), R7 (worktree drift since pause — needs rebase on jicate/main).

### Phase 4 — IQAC Academic Evidence Cluster (Attr 1, 2, 5, 8)

**Strategic rationale:** Groups three abandoned modules whose evidence feeds academic attributes. Facilitator Development (faculty training → Attr 2.2, 7.10), Alumni Outcomes (graduate tracking → Attr 8.2), Competency (PO/CO/PEO mapping → Attr 1.1, 8.2). Cost-efficient to resurrect together because they share staff, learner, alumni joins.

| Item | Files | Tables | Attr Auto | Attr Aff | Pts Auto | Pts Aff |
|------|------:|-------:|-----------|----------|---------:|--------:|
| 4a. Facilitator Development (20 files from clean-ss-deploy + HR staff cadre/doctoral flags) | 20+2 schema | 2 + staff patch | 2.2, 7.10 | 2.2, 7.10 | 15 | **50** (2.2.2+2.2.3) |
| 4b. Alumni Outcomes (2 files + outreach workflow) | 2+6 | 2 | 8.2a | 8.2a, 8.2b | 30 | 25 |
| 4c. Competency (39 files — PO/CO/PEO mapping + rubric engine) | 39 | 4 | 1.1, 8.2 | 1.1 (NA for Aff), shifts to 5.x | 15 | n/a shifts |

**Session target:** 3 sessions.
**Per-college success (Auto):** ≥80% courses PO-CO-PEO mapped; faculty cadre + PhD% computable; alumni outcome survey response ≥25%.
**Per-college success (Aff):** `has_doctoral_degree` flag populated for every faculty (this alone unlocks up to 30 pts at Aff via Metric 2.2.2); alumni pass % auto-importable from university result sheets.
**Cluster points addressable:** ~350 pts (Aff faculty PhD is the big lever).
**Risks:** R8 (faculty PhD % is institutional not code — needs HR commitment), R9 (alumni contactability).

### Phase 5 — IQAC Institutional Evidence Cluster (Attr 3, 4, 6, 7, 9 partial)

**Strategic rationale:** Groups Industry Integration + Maturity Assessment + Process Excellence. Adds facility / infrastructure registry (Attr 3 is 50-75 pts, completely untracked) and club/sports registries (Attr 6, 125 pts/college, largely untagged). Process Excellence + Maturity feed IQAC (Attr 7.3) with meeting minutes, audit reports, AQAR prep.

| Item | Files | Tables | Attr Auto | Attr Aff | Pts Auto | Pts Aff |
|------|------:|-------:|-----------|----------|---------:|--------:|
| 5a. Industry Integration resurrection (6 files, MoU registry) | 6+4 | 4 | 5.3, 7.9, 1.4 | 5.3 (via shift 1.7), 5.4 (via shift 1.4) | 35 | 40 |
| 5b. Maturity Assessment (46 files — IQAC minutes + AQAR workflow) | 46 | 4 | 7.3 | 7.3 | 10 | 20 |
| 5c. Process Excellence (47 files — audit archive, COPQ, risk register) | 47 | 4 | 4.4, 7.3 | 4.4, 7.3 | 20 | 30 |
| 5d. Infrastructure registry + Club/Sports registry (NEW, no abandoned predecessor) | ~30 | 5 (`fac_registry`, `fac_photos`, `club_types`, `sports_participation`, `mou_registry`) | 3.1-3.5, 6.1-6.5 | 3.1-3.5, 6.1-6.5 | 75 | 95 |

**Session target:** 4 sessions (this is the heaviest phase).
**Per-college success:** every classroom, lab, hostel, sports facility geo-tagged; library expenditure % computed from `/billing`; faculty retention % auto-calculated; ≥3 MoUs documented per college.
**Cluster points addressable:** ~900+ pts cumulative.
**Risks:** R10 (geo-tagging scale — thousands of photos), R11 (MoU originals in physical files — digitization workflow).

### Phase 6 — Parent Portal Standalone + Non-Code Prep

**Strategic rationale:** 64 files from clean-ss-deploy is the largest resurrection. Unlike compliance modules it faces external users (parents), so UX + DPDPA 2023 consent + notification rails all need re-verification. Light NAAC direct score impact but material for 1.2 stakeholder feedback (all 6 colleges), 6.3 mental well-being (communication), 7.5 welfare (transparency).

| Item | Files | Tables | Attr | Pts |
|------|------:|-------:|------|----:|
| 6. Parent Portal resurrection (64 files, parent auth via mobile OTP, child view restriction, fee + attendance + grievance visibility) | 64 | 7 | 1.2, 6.3, 7.5 | 10+15+15 per college = 40 |

**Non-code prep (parallel to code):** consent policy draft, SMS/WhatsApp template approval with Director, parent onboarding FAQ.
**Session target:** 3 sessions.
**Per-college success:** ≥40% parent sign-up within 8 weeks; ≥1 fortnightly digest delivered.
**Cluster points addressable:** ~240 pts.
**Risks:** R12 (DPDPA 2023 consent capture for minors' data), R13 (SMS/WhatsApp deliverability).

### Phase 7 — Learning Paths Fold + DCF 2025 Export Finalization

**Strategic rationale:** Learning Paths (8 files, 2 tables) is too thin to stand alone — it folds into `/academic` as a first-class feature there. In parallel, finalize DCF 2025 export format across all 10 Attributes: the SSR auto-generator that pre-fills from `regulatory_submissions` + live metric data. Also wraps up Attr 5 pedagogy tagging (35-55 pts) and Metric 5.5 catering to diversity (15-25 pts).

| Item | Files | Tables | Attr | Pts |
|------|------:|-------:|------|----:|
| 7a. Learning Paths fold into `/academic` (8 files merged, 2 tables joined to `courses`) | 8 | 2 | 5.2, 1.7/5.3 | 20 + 5-20 |
| 7b. DCF 2025 SSR auto-generator (all 10 Attributes, per-college + cluster view) | ~18 | 1 (`ssr_exports`) | cross-cutting | indirect |
| 7c. Pedagogy + Assessment tagging (tag every course with method + assessment type) | ~10 | 1 (`pedagogy_tags`) | 5.1, 5.4 | 55+25 |
| 7d. Mentoring + Value Education tagging | ~8 | 2 (`mentoring_logs`, `value_ed_events`) | 6.3, 6.4 | 15+15 |

**Session target:** 3 sessions.
**Per-college success:** SSR export PDF generates per college; ≥70% courses tagged with pedagogy; mentor-mentee logs for every cohort.
**Cluster points addressable:** ~700 pts cumulative (includes previously unaddressable tagging).
**Risks:** R14 (DCF 2025 format drift — monitor NAAC notifications weekly until submission).

### Phase 8 — Solutions→Research Bridge (NEW — Attr 9, Highest Strategic Value)

**Strategic rationale:** JKKN's philosophy — *"Solutions first. Research emerges from solutions work"* — is already operationalized via Solutions Hub (`sh_solutions`, `sh_products` with TRL, `sh_training_programs`). The missing layer is the **conversion** — every completed solution should emit linked publication / IP / consultancy / grant records. This bridge turns Solutions Hub outputs into Attribute 9 evidence automatically.

| Item | Files | Tables | Attr Auto | Attr Aff | Pts Auto | Pts Aff |
|------|------:|-------:|-----------|----------|---------:|--------:|
| 8a. Research module core (publications, grants, IP, consultancy, PhD scholars, citations — all linked to `sh_solutions.solution_id`) | ~45 | 6 (`research_publications`, `research_grants`, `research_ip`, `research_phd_scholars`, `research_consultancy`, `research_citations`) | 9.1-9.7 | 9.1-9.4 | 85 | 35 |
| 8b. SCOPUS API integration (h-index, citation auto-pull) | ~8 | reuses | 9.2, 9.3 | 9.2 | 40 | 20 |
| 8c. "Publish from Solutions" workflow + Solutions Hub UI hook | ~12 | reuses | 9.1-9.7 | 9.1, 9.2, 9.4 | feeds all | feeds all |

**Session target:** 4 sessions. **Build effort:** HIGH (culture + platform change).
**Per-college success (Auto):** ≥5 publications linked per active solution/semester; h-index computed for every PhD-holding faculty; ≥1 patent filing per academic year per autonomous college.
**Per-college success (Aff):** ≥20 publications per year; ≥2 non-government grants (threshold ₹50k for Aff vs ₹5 lakh for Auto).
**Cluster points addressable:** Auto 85×2 + Aff 35×4 = 310 pts. Plus Solutions Hub existence credit under e-Governance (Attr 7.8).
**Risks:** R15 (SCOPUS API key management — per CLAUDE.md store in Edge Function secrets), R16 (culture shift — writing publications from solutions is new habit).

---

## 5. Dependency Map

```
Phase 1 (8.4 + IQAC shell + Grievance) ──► Phase 2 (Sustainability) ──► Phase 4 (Academic Cluster)
        │                                                                         │
        └─► Phase 3 (OKR — standalone path) ──────────────────────────────────────┤
                                                                                  ▼
                                                                        Phase 5 (Institutional Cluster)
                                                                                  │
                                                                                  ▼
                                                                        Phase 6 (Parent Portal — parallel, light dep on Phase 1 switcher)
                                                                                  │
                                                                                  ▼
                                                                        Phase 7 (LP fold + DCF export)
                                                                                  │
                                                                                  ▼
                                                                        Phase 8 (Solutions→Research Bridge)
```

**Critical path:** Phase 1 must land first. Phase 7 DCF export cannot run until Phases 4+5 seed at least one evidence row per metric. Phase 8 can begin in parallel with Phase 5 once research_publications schema is approved.

---

## 6. Risk Register

| ID | Risk | Severity | Phase | Mitigation |
|----|------|----------|-------|------------|
| R1 | Survey consent rate < 60% → 8.4 gap | High | 1 | Start DPDPA 2023 consent collection now; SMS+email+in-app triple-prompt |
| R2 | College switcher scoping bug leaks data | Critical | 1 | RLS `role_has_institution_access(institution_id)` on every `/iqac` route; fresh-eyes audit before PR |
| R3 | No recognized green audit on file | High | 2 | Commission GRIHA/IGBC audit session-2; document interim self-audit |
| R4 | Facility photos/bills scattered across admin offices | Medium | 2, 5 | Geo-tag upload flow + one-per-college infrastructure drive |
| R5 | OKR council adoption lags | Medium | 3 | Tie fortnightly council meetings to OKR check-in UI; director nudges |
| R6 | RLS drift on resurrected grievance tables | High | 1 | Reuse campus-living remediation migration pattern (`20260302000001`) |
| R7 | OKR worktree rebase conflicts | Medium | 3 | Rebase on jicate/main; reset branch if >100 conflict files |
| R8 | Faculty PhD % institutional not code | High | 4 | HR-led incentive program; platform unlocks measurement, not outcome |
| R9 | Alumni contactability for 8.4 | Medium | 1, 4 | Outreach drive via Placement Cell parallel to Phase 1 |
| R10 | Geo-tagging at scale (thousands of photos) | Medium | 5 | Bulk upload tool + mobile capture flow |
| R11 | MoU physical originals | Low | 5 | Scan-upload workflow; track compliance digitally thereafter |
| R12 | DPDPA 2023 consent for minor data (Parent Portal) | Critical | 6 | Legal review before launch; consent captured from custodial parent |
| R13 | SMS/WhatsApp deliverability drop | Medium | 6 | Exotel + Meta WhatsApp dual-rail (per memory) |
| R14 | DCF 2025 format drift until submission | High | 7 | Monitor NAAC notifications weekly; `ssr_exports` schema versioned |
| R15 | SCOPUS API key leakage | Critical | 8 | Edge Function secrets only; never in code/docs/logs |
| R16 | "Publish from Solutions" culture shift | High | 8 | Director-level KPI on every solution outputting ≥1 publication |
| R17 | Affiliated metric shift misapplied (1.4→5.4 etc.) | High | 4, 7 | Lookup table enforced in code; test matrix covers both representations |
| R18 | 3-year binary validity — mid-cycle reassessment | Medium | post-submission | Continuous evidence capture, not burst-mode |

---

## 7. Session Cadence (projected from 2026-04-16 toward NAAC 2027)

Assumes 1-2 working sessions per week on this track in parallel with other MyJKKN work. Dates are indicative.

| Session | Phase | Deliverable |
|--------:|-------|-------------|
| S+1 | 1a | Survey export CSV spec + consent table migration |
| S+2 | 1b, 1c | IQAC shell + college switcher + grievance resurrection PR |
| S+3 | 2a | Sustainability registry + facility upload flow |
| S+4 | 2b | Green audit workflow + geo-tag verifier |
| S+5 | 3 | OKR worktree rebase + deploy |
| S+6 | 4a | Facilitator Development + HR staff cadre/PhD patch |
| S+7 | 4b, 4c | Alumni Outcomes + Competency/PO-CO-PEO mapping |
| S+8 | 4 wrap | Academic cluster integration + SSR evidence feed |
| S+9 | 5a | Industry Integration + MoU registry |
| S+10 | 5b, 5c | Maturity + Process Excellence resurrection |
| S+11 | 5d | Infrastructure + Clubs/Sports registries |
| S+12 | 5 wrap | Institutional cluster integration |
| S+13 | 6 | Parent Portal resurrection |
| S+14 | 6 wrap | Parent onboarding launch |
| S+15 | 7a, 7b | Learning Paths fold + DCF 2025 exporter |
| S+16 | 7c, 7d | Pedagogy tagging + Mentoring |
| S+17 | 8a | Research module core + SCOPUS sandbox |
| S+18 | 8b | h-index / citation auto-pull |
| S+19 | 8c | Solutions→Research UI hooks + Director KPI wiring |
| S+20 | Dress rehearsal | Full SSR export per college + cluster rollup |
| S+21 | Governance gate | Director signoff, submit DCF 2025 form |
| S+22+ | Continuous | Evidence capture + mid-cycle re-audit preparation |

**Buffer:** Reserve ≥4 sessions for NAAC Peer Team rebuttal + evidence requests post-submission.

---

## 8. Governance Gates

Every phase must clear these gates before the next starts:

1. **Code gate:** Build passes (`npm run build`), zero silent-failure flags from `silent-failure-auditor`, `fresh-eyes` audit on critical RLS.
2. **Data gate:** Every table has RLS + super_admin bypass + `role_has_institution_access()`; no new `profiles.role = 'admin'` hardcoding.
3. **Evidence gate:** At least 1 row of real data per college per metric that the phase unlocks.
4. **UX gate:** College switcher works; IQAC Coordinator role can view only their college; Director sees all 6 + rollup.
5. **Compliance gate:** DPDPA 2023 consent where learner/parent/alumni data leaves the platform.
6. **Director sign-off:** Review the phase deliverable in-browser, confirm before PR merge.

---

## 9. Method Reference — IQAC Strategic Preparation

For IQAC's own SSR narrative work (the non-code side that pairs with this platform plan), reference Dr Deepessh Divaakaran's 6-step research methodology (LinkedIn, Apr 2024):

1. **Predictive Analytics & Big Data** — forecast reform impact from historical/current trends
2. **International Comparative Study** — benchmark against US/Europe/Asia-Pacific accreditation
3. **Regulatory Review** — UGC/AICTE/MoE/NIRF/NBA notifications
4. **Stakeholder Engagement** — admin/faculty/learners/policymakers/industry
5. **Academic & Industry Impact Analysis** — global comparative
6. **Mixed-Methods Synthesis** — qualitative interviews + quantitative surveys

Use as lens, not as source of truth. Source of truth: NAAC July 2024 Binary Framework (vault digest).

---

## 10. Appendices

### Appendix A — Intent-vs-Schema Audit Rule (applied throughout)

When evaluating whether two tables/modules are redundant, compare USER INTENT not schema columns. Answer: (1) who enters the data, (2) what are they trying to accomplish, (3) who is the regulator, (4) what is the workflow, (5) what is the SLA, (6) what evidence standard applies. If any differ meaningfully, they are NOT redundant. Ref: `feedback_intent_vs_schema.md`.

### Appendix B — Leverage Matrix (what already exists vs what must be built)

| Strong (keep/extend) | Partial (fill gap) | Missing (build) |
|----------------------|--------------------|-----------------| 
| Regulatory framework engine (NAAC 2024 seeded) | Stakeholder feedback collection | Research module (Phase 8) |
| Solutions Hub (research pipeline source) | Faculty staff table (needs cadre + PhD flags) | Sustainability registry (Phase 2) |
| e-Governance (MyJKKN existence = 10 pts/college) | Grievance (tables exist; RLS drift) | Infrastructure registry (Phase 5) |
| Grievance module schema | Alumni tracking (2 tables, empty) | Club/Sports registry (Phase 5) |
| Learners + alumni database | Pedagogy tagging | IQAC meeting/AQAR workflow |
| Learners Council (Attr 6 partial) | SWAYAM course credit tracking | MoU registry |

### Appendix C — Per-College Priority One-Liners

- **Engineering (Auto):** Research conversion via Solutions→Research Bridge is #1. Green campus documentation pulls 65 pts.
- **Arts & Science (Auto):** IKS integration is natural; scope Attribute 5.5 aggressively. Publications thinner than Engineering — document early.
- **Dental (Aff):** Faculty PhD % push (50 pts via 2.2.2+2.2.3). Bio-medical waste documentation is free 5-10 pts under 10.2.
- **Pharmacy (Aff):** Publication velocity is naturally highest of Aff set — capture it via Phase 8. PhD push matters most here.
- **Nursing (Aff):** Community service / health camps → Attr 6.6 (25 pts) + 10.1 (25 pts). Systematize via club registry (Phase 5).
- **Education (Aff):** Pedagogy is domain expertise — lead Attr 5.1 tagging; value education (6.4) natural strength.

### Appendix D — v0.4 Director Signoff

> I approve this Master Plan v0.4 for the Workshop Transformation Resurrection track. Phase sequencing is locked; interim adjustments within a phase may be made by the planning agent provided no locked decision (section 1) is re-litigated. First phase kickoff target: session +1.
>
> — Director, JKKN Institutions · 2026-04-16

---

## 11. Version History

| Version | Date | Author | Delta |
|---------|------|--------|-------|
| 0.1 | 2026-04-16 (morning) | Claude + Director | Initial cherry-pick of 11 abandoned modules; all under `/iqac`; single-institution assumption. |
| 0.2 | 2026-04-16 (mid-day) | Claude + Director | Applied "question before cherry-pick" rule; OKR triage trimmed 93→7 tables; phases restructured by module category (compliance / governance / stakeholder). Still single-institution. |
| 0.3 | 2026-04-16 (afternoon) | Claude + Director | Director-approved sequencing based on OLD NAAC terms. 7 phases. Added OKR standalone, Parent Portal standalone, Learning Paths fold. Missing: vault Gap Analysis insights, per-college scoring, Solutions→Research Bridge, affiliated metric shifts. |
| **0.4** | **2026-04-16 (evening)** | **Claude + Director** | **Merged authoritative vault intelligence (NAAC Binary + MBGL, 2 Auto + 4 Aff structure, per-attribute per-type scoring, affiliated metric shifts). Resequenced by point-recovery ROI. Added Phase 2 Sustainability (fresh build) and Phase 8 Solutions→Research Bridge (NEW). 12-module inventory. Per-college success metrics. DCF 2025 export. Dr Divaakaran methodology for IQAC SSR. 18-entry risk register. 22-session cadence toward NAAC 2027.** |
