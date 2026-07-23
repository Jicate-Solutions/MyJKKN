# CARE Audit — PDE Demonstrations (for Learners)

**Framework:** JKKN CARE Audit Framework v1.0 (`docs/guides/2026-06-12-GUIDE-care-audit-framework.md`)
**Unit of audit:** The PDE demonstration loop — submit evidence → curriculum link → validation → score → attainment — as experienced by a **Learner**.
**Audit type:** Pre-scale-up (framework cadence rule for platforms), ahead of the Arts & Science (Self) pilot.
**Scorer:** Claude (initiative builder) — single-scorer; a participant-representative re-score during pilot week 3 is part of the corrective plan (variance rule applies then).
**Date:** 2026-06-12. **Evidence basis:** production code on `main`, live prod data (0 demonstrations), PR #1343 (connector + CARE fixes shipped 2026-06-12).

**Honest-scoring note:** with zero real submissions, no behavior item can score above 2–3 ("applied consistently" requires application; "measured" requires data someone reviews). That is the framework working as designed — this audit's output is the pilot's design requirements.

---

## Scores

### Pillar C — Clarity: **10/20** (Habit-dependent)

| # | Score | Evidence |
|---|---|---|
| C1 | 3 | Purpose copy is built into the product: form header, category hints, explainer footer ("Drafts stay private… a validator from your institution reviews…"). Systematic, not measured (no comprehension spot-check possible yet). |
| C2 | 2 | Rubric criteria + pass thresholds now render inline at submission (PR #1343 CARE-C) — but only 3 of 7 categories have seeded rubrics; the other 4 are "free-form, reviewer scores", i.e. success criteria absent before participation. |
| C3 | 2 | Roles stated in-product (learner submits / faculty-peer-AI validates / engine scores), but the learner cannot see *who* will validate or when; validator side is an unassigned FIFO inbox. |
| C4 | **1** | The form's stake line ("helps your college's attainment record") is the **college's** stake, not the learner's. The learner-stake chain (verified transcript → employer briefing → placement) exists in code but is never said to the learner at submission. |
| C5 | 2 | Status pills (submitted → under review → validated → scored) give what-happens-next state; no timelines, no SLA, no "expect a response by". |

### Pillar A — Appreciation: **5/20** (CRITICAL GAP — floor rule fires)

| # | Score | Evidence |
|---|---|---|
| A1 | 2 | Validator notes now reach the learner (PR #1343 CARE-A — was 0 references before). Per-milestone only; no cadence ritual. |
| A2 | 2 | Process-praise is systematically *nudged* (rewritten placeholder + "the learner sees this" notice). Zero actual feedback samples exist to verify behavior. |
| A3 | **1** | Nothing bounds time-to-first-acknowledgment. No SLA, no aging badge, no latency metric (all spec'd as connector PR 2, unbuilt). Depends entirely on validator habit. |
| A4 | **0** | No coverage check exists. Nobody can answer "what % of participants received any acknowledgment this cycle?" |
| A5 | **0** | No sanctioned learner→validator/facilitator appreciation channel anywhere in PDE (verified by code sweep). |

### Pillar R — Recognition: **8/20** (Habit-dependent, bottom edge)

| # | Score | Evidence |
|---|---|---|
| R1 | 2 | Surfaces exist and are live pages (skill transcript, certificates with public verify endpoint, badges/reputation tables) — but nothing has ever flowed through them, and there is no recognition calendar. |
| R2 | 2 | Agency Index levels (now "operating mode" copy) recognize progression by design; no streaks/most-improved; unused. |
| R3 | **0** | 0% of participants recognized (0 participants). No distribution tracking exists to ever answer the >25% target. |
| R4 | **1** | No public, peer-visible, person-naming recognition surface in PDE. Transcript is private; certificates are individually shareable only. |
| R5 | 3 | Strongest item by design: recognition feeds forward into accreditation evidence (PR #1343), employer-briefing service, certificate verification, placement-signals API, NIF/solutions-hub eligibility on quests. Pathways are built, not yet traversed. |

### Pillar E — Empowerment: **11/20** (Habit-dependent, near Established)

| # | Score | Evidence |
|---|---|---|
| E1 | 3 | Substantive, systematic choice: category (7), skill, evidence type, curriculum lane (BoS/VAC/none), CLO tags. |
| E2 | 3 | The demonstration IS a learner-owned artifact (their evidence, their name) persisting beyond the module via transcript/portfolio. |
| E3 | 3 | Real bounded delegation: learner proposes CLO tags (validator confirms — "learner tags, validator confirms" is delegation with stated bounds), submits without approval, can withdraw. |
| E4 | **1** | Within the demonstration loop there is no AI agent for the learner. (The Socratic coach + feedback panel exist in the adjacent *cases* lane — pattern available, not present here.) |
| E5 | **1** | No "you said, we changed" mechanism (verified). Feedback routes exist platform-wide (bug reports) but no in-module loop, no announced changes. |

---

## CARE Index: **34 / 80** → "Redesign the weak pillars before scaling"

| Pillar | Score | Rating |
|---|---|---|
| Clarity | 10/20 | Habit-dependent |
| **Appreciation** | **5/20** | **Critical gap** |
| Recognition | 8/20 | Habit-dependent |
| Empowerment | 11/20 | Habit-dependent |

**Gap rules triggered:**
1. **Floor rule** — Appreciation < 8 → corrective move mandatory.
2. **Median rule** — A4 = 0 and R3 = 0 → as designed today, the initiative would serve its top decile only. NIRF lens applies.
3. **System rule** — C4, A3, R4, E4, E5 all sit at 1 (habit-dependent): higher risk than the zeros, because they create the illusion of coverage.

**Reading the 34 honestly:** Empowerment and the R5 feed-forward chain are the build's strengths — the *architecture* respects Principals. The experience layer around acknowledgment (A) and visible recognition (R3/R4) is where the loop will die in week 2 of a pilot if uncorrected. This is exactly the failure mode the framework predicts: not a content failure, an invisibility failure.

---

## Corrective moves (one per flagged pillar)

> **Pillar A** · Lowest: A4/A5 (0) · **Move:** Every submitted demonstration receives a validator note within 7 days, and a weekly coverage query reports % of pilot learners acknowledged — plus a learner→validator "thanks" action on the demonstration card. · **Owner:** Claude (build: connector PR 2 — SLA policy + aging badge + coverage tile + thanks action) / pilot HOD (behavior). · **Mechanism:** MyJKKN. · **Re-audit:** pilot week 3.

> **Pillar R** · Lowest: R3 (0) · **Move:** Fortnightly "PDE spotlight" naming every learner with a *validated* (not just passed) demonstration, posted where peers see it. · **Owner:** pilot HOD. · **Mechanism:** Google Chat (dept space) + accreditation-evidence page as source. · **Re-audit:** pilot week 3.

> **Pillar C** · Lowest: C4 (1) · **Move:** One sentence added to the submission form: "Every validated demonstration becomes part of your verified skill transcript — the record employers and accreditors see." · **Owner:** Claude. · **Mechanism:** MyJKKN (one-string change, rides PR 2). · **Re-audit:** pilot week 3.

> **Pillar E** · Lowest: E5 (1) · **Move:** Week-3 pilot ritual: collect learner feedback, change one thing, announce it as "you said, we changed" in the dept space and log it in the module docs. · **Owner:** pilot HOD + Claude. · **Mechanism:** Google Chat + `docs/modules/pde/`. · **Re-audit:** pilot week 6.

---

## Re-audit plan

Week 3 of the Arts & Science (Self) pilot — two scorers this time (initiative owner + one pilot learner or facilitator), variance rule live. Target: Appreciation ≥ 8 (out of critical), CARE Index ≥ 48 by end of pilot cycle.

*Scored against behavior and code, not intentions — items capped where nothing is yet visible to a Learner, per the framework's honest-scoring notes.*
