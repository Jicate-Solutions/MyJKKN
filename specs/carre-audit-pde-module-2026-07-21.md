# CARRE v2.0 Audit — PDE module (as Learners experience it)

**Unit of audit:** PDE module — for BDS Learners — `ACAD`
**Audit date:** 2026-07-21 · **Scorer:** owner-proposed (Claude, from live-system evidence) · **Status: PROPOSED — awaiting Director confirmation**
**Re-audit date:** 2026-10-19 (+90 days)

---

## The dominant finding, stated first

**No learner has ever used this module.** Verified against production:

| Signal | Value |
|---|---|
| `pde_submissions` (case attempts) | **0** |
| `pde_coach_conversations` | **0** |
| `pde_engagement_events` / `pde_engagement_daily` | **0** / **0** |
| `pde_quest_enrollments` / `pde_quest_submissions` | **0** / **0** |
| `pde_learner_badges` / `pde_badges` defined | **0** / **0** |
| `pde_certificates` | **0** |
| `pde_reputation` / `pde_agency_index` | **0** / **0** |
| `pde_messages` / `pde_channels` | **0** / **0** |

The one table with rows — `pde_demonstrations` (222 rows, 204 distinct learner_ids) — **does not represent lived participation**:
- `submitted_at` is NULL on every row (no submission flow was walked)
- `created_by` is NULL on every row (no author recorded)
- `validator_ids` is NULL on every row (no human ever validated one)
- 182 of 222 created on a single day (2026-07-16) — a bulk write
- 100% marked `passed` despite `raw_score` spanning 0–100 (avg 52.4) — pass is not tied to score

**Consequence for scoring:** under CARRE's "score behavior, not documents" rule, items measuring *observed occurrence* score **0**, and items measuring *deployed-but-unexercised design* cap at **2** with `unverified — needs observation`. This audit is therefore best read as a **pre-launch baseline**, not a verdict on the build quality.

---

## The 25-item score sheet

### Pillar C — Clarity (9/20)

| Item | Score | Verified? | Evidence |
|---|---|---|---|
| C1 | 2 | unverified | Guide content exists (`lib/pde/guide/*`) and `/pde/guide` renders. But `/pde/learn` redirects to demonstrations, not to a purpose statement — a first-timer does not meet one. Doc-only → cap 2. |
| C2 | 2 | unverified | Criteria exist in config (`clinical_reasoning.scoring.passing_threshold_pct`, `evidence_threshold_pct`; per-question points; 3 rubric sets). Rubrics live on **admin** pages, not learner-facing. No proof any learner saw criteria pre-participation. |
| C3 | 2 | unverified | Role separation is real and systematic (learn/faculty/admin routes, permission system, validator concept, `pde.rollout.hod_blocking_escalation`). But never exercised — 0 validator_ids recorded. |
| C4 | 2 | unverified | Structural stake-mapping exists (`pde.obe.clo_tag_cap`, `po_weight_map`, `clo_refs` on demonstrations, `/pde/learn/transcript`, accreditation-evidence pages). Zero learners have a populated transcript (`pde_learner_capabilities` = 0), so it is not visible to participants. |
| C5 | **1** | unverified | No schedule/timeline surface for learners found; cases carry no dates or next-action. Any "what's next" would ride on an individual telling them → habit. |

### Pillar A — Appreciation (5/20)

| Item | Score | Verified? | Evidence |
|---|---|---|---|
| A1 | **0** | verified | No acknowledgment cadence is defined anywhere, and zero acknowledgments have occurred (0 coach conversations, 0 engagement events, 0 messages). |
| A2 | 2 | unverified | Design is genuinely strong: each question carries `ground_truth` + `key_concepts`, which scaffold behavior-specific Socratic feedback. Never once delivered. |
| A3 | 2 | unverified | Design gives *immediate* in-attempt feedback (best-in-class loop). 0 instances. |
| A4 | **0** | verified | **Median rule.** 0% of participants acknowledged this cycle — there are no participants. |
| A5 | **1** | unverified | `pde-appreciation-service.ts` exists in the codebase; no learner-facing appreciation channel confirmed and 0 usage. |

### Pillar R — Recognition (5/20)

| Item | Score | Verified? | Evidence |
|---|---|---|---|
| R1 | **1** | verified | Surfaces are *built* but essentially undefined: **0 badges**, **0 certificates** defined; 1 quest, 1 capability. Leaderboard exists in nav only. |
| R2 | **1** | unverified | Progress machinery designed (agency index, capability tiers) — `pde_agency_index` = 0, `pde_reputation` = 0. |
| R3 | **0** | verified | **Median rule.** 0% recognised — 0 badges awarded, 0 certificates, 0 reputation rows. |
| R4 | **1** | unverified | No public attributable recognition has occurred; leaderboard surface exists with no data. |
| R5 | 2 | unverified | Genuine forward pathway is designed: `/my-proof` Verified Skills Record, transcript, certificates, accreditation evidence, `placement_signals`, `reciprocal_credits`. Never exercised; VSR sharing is disabled platform-wide. |

### Pillar RS — Respect (9/20)  — *scored by the least-powerful participant*

| Item | Score | Verified? | Evidence |
|---|---|---|---|
| RS1 | 2 | **unverified — needs observation** | Architecture is dignity-protective by construction: attempts are private to the learner, the coach is Socratic by design (guides, does not shame). **But no stated correction norm exists** in any PDE policy, and zero corrections have ever occurred. Cannot be verified without learners. **This is the single most important item to observe once the module is used** — it carries the scale-up override. |
| RS2 | 2 | unverified | Format explicitly invites admitting uncertainty ("write your reasoning — the coach won't give you the answer"). 5-attempt lifetime cap may cut against risk-taking. 0 observations. |
| RS3 | 2 | **unverified — needs observation** | AI tone is centrally governed (`clinical_reasoning.ai.system_prompt_template`) — systematic, not habit. Institution-wide terminology discipline is CI-enforced (zero-tolerance gate). No human↔learner interaction has occurred. Also carries the override. |
| RS4 | 2 | unverified | Fully self-paced; no imposed schedule, no queue, no waiting — structurally respectful of learner time. Nothing observed. |
| RS5 | **1** | verified | **No PDE-specific channel for disrespect identified.** `/pde/admin/feedback-moderation` moderates content, it is not a grievance route. Institution channels (Learners Council/grievance) are not demonstrably wired to PDE. 0 resolved cases. |

### Pillar E — Empowerment (7/20)

| Item | Score | Verified? | Evidence |
|---|---|---|---|
| E1 | 2 | unverified | Pacing choice is genuine and systematic (self-paced, learner-chosen timing); free-text answers give real latitude in *how* to reason. **Case selection is NOT available** — no learner-facing case list exists. |
| E2 | 2 | unverified | `/my-proof` (Verified Skills Record) shipped — a real learner-owned artifact that outlives the module. But sharing is off platform-wide and 0 certificates issued. |
| E3 | **1** | unverified | No delegated decision authority for learners found; no decision a learner makes stands in the system beyond their own answers. |
| E4 | 2 | unverified | **The module's strongest design**: a live, centrally-governed AI Socratic coach as a thinking partner, running at ₹0. Deployed and reachable — but 0 conversations ever. |
| E5 | **0** | verified | Zero learner feedback exists in PDE; no "you said, we changed" log; nothing has been altered by participant voice. |

---

## Engine output (verbatim)

```
CARRE v2.0 audit — setting: ACAD
Owner items scored: 25/25

Pillars (max 20 each):
  Clarity         9/20  [Habit-dependent] (5/5 scored)
  Appreciation    5/20  [Critical gap] (5/5 scored)
  Recognition     5/20  [Critical gap] (5/5 scored)
  Respect         9/20  [Habit-dependent] (5/5 scored)
  Empowerment     7/20  [Critical gap] (5/5 scored)

CARRE Index: 35/100
Verdict:     Do not scale; rebuild the experience layer
Operative verdict: Do not scale; rebuild the experience layer

Gap-rule findings (12):
  🔴 [floor] Floor rule: Appreciation at 5/20 (critical gap)
  🔴 [floor] Floor rule: Recognition at 5/20 (critical gap)
  🔴 [floor] Floor rule: Empowerment at 7/20 (critical gap)
  🔴 [median] Median rule: A4 at 0 — top-decile-only risk
  🔴 [median] Median rule: R3 at 0 — top-decile-only risk
  🟡 [system] System rule: C5 is habit-dependent (score 1)
  🟡 [system] System rule: A5 is habit-dependent (score 1)
  🟡 [system] System rule: R1 is habit-dependent (score 1)
  🟡 [system] System rule: R2 is habit-dependent (score 1)
  🟡 [system] System rule: R4 is habit-dependent (score 1)
  🟡 [system] System rule: RS5 is habit-dependent (score 1)
  🟡 [system] System rule: E3 is habit-dependent (score 1)
```

**The Respect override did NOT fire** (RS1 = 2, RS3 = 2) — but both are `unverified`, so the override is *undetermined*, not *cleared*. It must be re-tested the moment real learners use the module.

---

## Corrective-move sheet

**Move 0 — the precondition that governs every other move.** The module cannot be audited honestly, or improve on any pillar, until learners can *reach* it. Today a published case is reachable **only by someone pasting a UUID link** — `/pde/learn/cases` has no list UI (it redirects away) and no assign-to-cohort mechanism exists in code or schema.
> **Move:** Build the learner case list at `/pde/learn/cases` + an "assign to cohort/section" action for facilitators · **Owner:** Director / PDE coordinator · **Mechanism:** MyJKKN (`cohort_memberships` already exists to key it on) · **Re-audit:** 2026-10-19

| Pillar | Lowest item | Move (one sentence) | Owner | Mechanism | Re-audit |
|---|---|---|---|---|---|
| **Clarity** 9/20 | C5 (1) | Replace the `/pde/learn` redirect with a real learner home stating the module's purpose, the current case list, and the single next action. | PDE coordinator | MyJKKN (`nav.learn.pde.default_landing` policy + new landing page) | 2026-10-19 |
| **Appreciation** 5/20 | A1 (0), A4 (0) | Define an acknowledgment cadence — the coach names one specific thing each learner reasoned well at end-of-attempt — and measure % of attempting learners acknowledged per cycle. | PDE academic lead | MyJKKN (`clinical_reasoning.ai.system_prompt_template` + `pde_engagement_events`) | 2026-10-19 |
| **Recognition** 5/20 | R3 (0) | Define and issue at least one attainable, non-peak recognition tier (per-case completion badge), and report % of participating learners recognised against a >25% target. | PDE coordinator | MyJKKN (`pde_badges` seed → learner transcript) | 2026-10-19 |
| **Respect** 9/20 | RS5 (1) | Name a working channel for disrespect inside PDE, route it to the Learners Council with a stated response time, and publish it in the guide. | HOD + Learners Council convener | Learners Council (linked from `/pde/guide` and the learner landing) | 2026-10-19 |
| **Empowerment** 7/20 | E5 (0) | Run a "you said, we changed" log for PDE — one visible, announced change per cycle driven by learner feedback. | PDE coordinator | MyJKKN (guide changelog block) + Google Chat announcement | 2026-10-19 |

**Also recommended (not a pillar move):** state an explicit correction-dignity norm in the PDE charter so RS1 has something to verify against — currently the protection is architectural (private attempts) but unstated, which makes it invisible to the people it protects.

---

## Honest limits of this audit

1. **Every RS item is unverified.** Respect is scored by the least-powerful participant's experience; with zero participants, that experience does not yet exist. The 9/20 is a floor estimate from architecture, not an observation.
2. **A doc-rich, behavior-poor system scores low by design.** 30+ active policies, extensive admin tooling, OBE mapping and a live AI coach exist. CARRE deliberately does not credit any of it until someone experiences it. The 35/100 measures *reach*, not *craft*.
3. **The 222 demonstrations were excluded as evidence** (backfill signature, above). Had they been counted naively, A4/R3 would have looked healthy and the median rule would have been silently missed — the exact false-precision this framework exists to prevent.

---

## Persistence status

The CARRE v2 tier **is live** in production (`fn_carre_create_audit` present; 25 `CARRE-*` catalog rows seeded). This record was **not** written to the `care_audits` module because the RPC requires an authenticated staff session (`auth.uid()`), and this audit was produced from a service-level connection which returns `not_authenticated`.

To make it a durable, trend-tracking record: open the audit as the initiative owner in MyJKKN (or have Claude drive the audit UI in an authenticated browser session), create the cycle with `p_setting_code := 'ACAD'`, `p_re_audit_date := '2026-10-19'`, then write the 25 owner scores with the evidence notes above — carrying `unverified — needs observation` at the front of every note so flagged.
