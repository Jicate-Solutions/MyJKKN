# Loop-Portfolio Graph Audit — MyJKKN

**Date:** 2026-07-19 · **Mode:** READ-ONLY analysis, recommendation-only (nothing built, no migrations, no PRs)
**Lens:** the "single improvement loop → graph of loops + anchors" essay
**For:** the Director (non-coder) — plain English, gaps first, evidence pasted inline

---

## How to read this (the framework in one paragraph)

A single improvement loop (pick a number → set a target → measure the gap → act → repeat) reliably fails four ways: it **games its own metric** (Goodhart), it **can't ask if the target is right** (blindness upward), it **fights other loops** with no referee (loop conflict), and its **sensors quietly rot while the dashboard stays green** (measurement decay). The fix is not a better single loop — it is a **graph** of loops wired with four edge types: a **watching loop on a counter-metric** for every optimizer, a **slower loop that owns the faster loop's target**, an **arbiter** above loops that fight, and **independent audits** that re-touch reality. And the graph only holds if it is nailed to **anchors**: ground-truth numbers no one can argue with (real money, tests that ran, humans who stayed), **frozen rules** the optimizer can never tune, and **human judgment at the root** deciding what "better" means. Without anchors the graph becomes loops confirming loops confirming loops.

**Verdict up front:** JKKN's loop practice is genuinely anchors-first in its *mature* corners (the bug-fix loop has a real human-thumbs-up ground truth; every AI call is ₹0-ledgered; the Director merges). But the **governance registry itself is a hand-written description, not a live measurement**, three of the highest-activity loops **aren't in the registry at all**, **no loop has a named owner**, and the one place careers and salary are being optimized — faculty appraisal — is **completely ungoverned and unpaired**, exactly as ranking went institution-wide.

---

## 1. Loop inventory

### 1a. What's in the governance registry (`loop_registry`, 19 rows, all `is_active=true`)

Gates are a `jsonb` of four keys `{a, g, m, f}`, each `on` / `half` / `off`. Read against the data pattern (an `intake` loop has all four `off`; a `self_improving` loop has all four `on`; `#2` of the bug loop earned `m:on` and `#3` earned `f:on` per memory), the four gates track the essay's loop stages:

| Gate | Meaning (inferred, consistent across all 19 rows + memory) |
|---|---|
| **a** | has an intake/trigger and an aligned target — the loop is wired to something real |
| **g** | generates — actually produces the action/output on a cadence |
| **m** | measures — has a ground-truth counter-measurement of whether the action worked |
| **f** | feeds forward — the measured outcome changes the *next* action (the actual "improvement") |

> The exact letter glossary lives in `reference_loop_taxonomy_and_control_tower` (not opened this session); the reading above is inferred from the live gate values and is robust, but treat the letter names as descriptive, not canonical.

| loop_key | name | class | domain | gates a/g/m/f | owner |
|---|---|---|---|---|---|
| bug-triage | Bug Triage & Duplicate-Cluster Loop | self_improving | platform | on/on/**on**/**on** | **null** |
| capability-gap | AI Assistant Capability-Gap Loop | self_improving | platform | on/on/on/**off** | null |
| feeder | Feeder Momentum Loop | self_improving | schools-network | on/on/on/on | null |
| induction-playbook | Induction Playbook Loop | self_improving | induction | on/on/on/on | null |
| induction-session | Induction Session-Effectiveness Loop | self_improving | induction | on/on/on/on | null |
| mess | Mess "Choose Your Menu" Loop | self_improving | campus-living | on/on/on/on | null |
| scf | Session-Feedback Teaching Loop | self_improving | academic | on/on/on/on | null |
| arps | Accountability & pace (YoY grid) | accountability | governance | on/on/on/**half** | null |
| decisions | Director Decisions Verdict | accountability | governance | on/on/on/half | null |
| institutional-audit | Institutional Audit Loop (AAA) | accountability | accreditation | on/on/on/half | null |
| iqac-meeting | IQAC Meeting Loop (Loop Review) | accountability | accreditation | on/on/on/half | null |
| referral-desk | Induction Referral → Working Desk | accountability | induction | on/on/on/half | null |
| ai-pulse | AI Pulse | cadence | platform | on/on/**off**/**off** | null |
| mentor-checkins | Senior Peer Mentor Check-in | cadence | induction | on/on/off/off | null |
| pde-quest | PDE Quest → Demonstration | cadence | pde | on/on/off/off | null |
| director | Director's allocation loop | infrastructure | governance | on/on/on/half→**m:half** | null |
| metaloop | MetaLoop — the loop that makes loops | infrastructure | platform | on/half/half/half | null |
| feedback-spine | Feedback Spine & intake adapters | intake | platform | **off/off/off/off** | null |

**Finding F0 (registry-wide):** **all 19 `owner_email` values are `null`.** The registry that is supposed to hold loops accountable names no human accountable for any of them. "Human judgment at the root" is present in *practice* (the Director) but is not *encoded* anywhere — so it cannot be audited, delegated, or checked for a gap.

### 1b. Live loops that are NOT in the registry (the more important list)

These are running in production right now (job counts below are last 3 days), yet have **no `loop_registry` row**, so no gates, no counter-metric, no owner, no audit hook:

| Live loop | What it optimizes | Evidence (last 3 days) | Registry row? |
|---|---|---|---|
| **Faculty appraisal / work-signals** | faculty A++/A+/A grade → salary; now shown on every surface incl. daily card | 6 live `okr_metric_registry` rows (module=faculty_appraisal); ranking institution-wide | **MISSING** |
| **SCF note-safety judge** | shrink human-review workload on AI messages to struggling students | `scf.note_safety_judge`: 403 done + 16 pending; 369 judgements | **MISSING** (spec PR-3 would add it) |
| **SCF free-text carry-forward** | re-ask a learner's own concern next session; adoption/efficacy | `scf.freetext_carry`: 214 done | **MISSING** |
| curriculum lesson-spine generator | fill BoS syllabus lesson spines (loop-zero lane) | `curriculum.lesson_spine_generate`: 4 done | MISSING (generator, not a graded loop) |

**Finding F1:** the registry is not a census. The single highest-stakes optimizer in the estate (careers/salary) and the single most safety-sensitive one (AI messages to vulnerable students) are **both absent** from the governance table. You cannot pair, arbitrate, or audit a loop the registry doesn't know exists.

---

## 2. Per-loop graph audit

Legend: **CM** = counter-metric (the number that catches this loop's cheap way to win). **Anchor** = ground-truth the optimizer can't argue with. Deep dives for the top-stakes loops follow the table.

| Loop | Optimizes (its metric) | Counter-metric | Target owned & revision governed? | Measurement-pipe audit | Anchors (ground-truth vs self-reported) | Frozen rules |
|---|---|---|---|---|---|---|
| **appraisal / work-signals** | faculty understood-score, initiatives, mentees-met → grade→salary | **MISSING** — no gaming/integrity watcher | **No** — no owner; thresholds implicit; ranking-everywhere set by one decision (07-19) | **None** — M12 sensor decayed (see F2); no pipe watcher | **Weak** — grade is *derived*; `hr_performance_reviews`=**0 rows** so no human verdict closes it | none encoded |
| **scf note-safety judge** | ↓ human-review fraction on struggling-note approvals | precision floor + spot-check (in spec, **not yet live**) | **No** — owner "TBD" (spec §12); P_floor/T/K unset | **None** yet — and the label feed is dead (F3) | **Broken** — judge predicts, **0 human labels** exist → nothing grounds it | "auto-approve only, never auto-reject"; crisis→human (spec, pre-build) |
| **scf** (teaching loop) | students' understood-score per class → coach facilitator → next-class lift | feedback_improvement Δ (same sensor) | Partly — cadence fixed; target = "lift" but on a gameable sensor | partial — judge parse ok; no bridge-health check | **Medium** — student ratings (real humans) but self-reported & now career-linked | ₹0 lane; markers track-both |
| **bug-triage** | shrink open-bug backlog / resolve clusters | **reporter 👍/👎** in `bug_fix_outcomes` (independent, correct) | Partly — human owns merge/deploy/resolve; no owner_email | partial — verify tally; no pipe-health cron | **Strong** — real reporter thumbs, ₹0 ledger, signed human gates | forbidden-paths (auth/billing/migrations); human merge+resolve |
| **capability-gap** | ↓ AI-assistant refusal frequency | refusal-frequency next cycle (real, verified billing 1.0→0.0) | Partly — human-gated fix; no owner | partial | **Strong** — measured refusal drop is real usage | human-gated fix |
| **feeder** | school-visit momentum score → next visit allocation | **MISSING** — no coverage/equity counter | No owner; allocation self-reinforces winners | none | Medium — visit outcomes real but self-scored | none |
| **induction-playbook / -session** | cohort join-score / session-effectiveness → next design | join-score next cohort (delayed) | No owner; annual/however cadence | none | Medium — feedback real, self-reported | ₹0 lane |
| **mess** | menu votes → served → ratings → next menu | meal ratings (paired, real) | No owner; caterer-scoped | none | Medium-strong — ratings are diners (real humans) | caterer scope |
| **arps / decisions / institutional-audit / iqac-meeting / referral-desk** | accountability verdicts / findings closed | f:**half** — adapts only partly | Director-adjacent; not encoded | audit reads loop_audits (see §6) | Medium — signed attestations + Director verdicts are humans; some inputs self-reported | attestation-before-close; sign-then-find=fail |
| **ai-pulse / mentor-checkins / pde-quest** | cadence/engagement (agency score) | **none** (m:off by design) | No owner | none | Low — engagement is self-reported; no outcome | none |
| **director / metaloop** | allocation / loop-taxonomy review | m:half/half — the graph's own referee | The Director (not encoded) | metaloop reviews gates (self-referential, §6) | Root anchor = the Director (human), but **unencoded** | 4-gate taxonomy |
| **feedback-spine** | pure intake (all gates off) | n/a (not an optimizer) | n/a | n/a | n/a — raw intake | n/a |

### Deep dive — the three that matter most

**(A) Faculty appraisal / work-signals — the ungoverned career optimizer.**
Six metrics are live and computed (`faculty.feedback_understood`, `feedback_improvement`, `initiatives_total`, `innovations`, `patents`, `publications`), all `is_active=true`, applicable to faculty+hod. As of 2026-07-19 the "self-view never ranks" doctrine was dropped **institution-wide** — grades/ranks may now appear on every surface including the daily work-signals card. So faculty now see their own grade daily, and the grade drives salary bands (A++→salary per the SOP). Yet:
- **No counter-metric.** Nothing watches for the cheap win. The cheap win on `feedback_understood` is to lean on students for high ratings (the sensor is student self-report — see conflict C1). The `feedback_improvement` Δ is *not* an independent counter — it reads the **same** `session_feedback` sensor.
- **No owner, no governance row, no target revision process.** The "ranking everywhere" target was set by a single informed decision; nothing above it can ask "is grading faculty daily on a gameable sensor the right target?"
- **The human-judgment anchor is empty.** `hr_performance_reviews` = **0 rows** (`review_rows:0` below). The container that would carry self→supervisor→final human verdict is dormant, so today the displayed grade is a machine number no human appraisal has ratified. Blindness-upward and a missing root-anchor at the same time.

**(B) SCF note-safety judge — measurement without a label anchor.**
The judge is the essay's Goodhart-catcher done right in spirit: an independent watching loop the note-*writer* doesn't control. It's live (403 judged jobs in 3 days) and honest (0 auto_safe — it is refusing to bless anything). But:
- `human_reviewed = 0`, `agreement_pairs = 0` (query below). The loop's entire improvement signal is `agreed` = "judge prediction vs eventual human verdict." **No human verdict has been recorded**, so the loop has **zero labels** and literally cannot calibrate. It is a sensor with the readout wire cut.
- This is *correct for now* (Director decided 07-19 "fix the writer first," pause approvals) — but it means the loop must **not** be graduated to auto-approve until the label feed is restored, and nothing in the registry encodes that block because the loop isn't registered.

**(C) SCF teaching loop — the shared sensor everything leans on.**
`session_feedback` (student understood-ratings, 92,713 rows) is the input for the teaching loop, the appraisal M12 metric, the struggling-note writer, and the free-text carry loop. It is one sensor carrying four loops, one of which (appraisal) now applies career pressure to the people being rated on it. That is the structural fault line in §3.

---

## 3. Conflict map (loops that can fight; the missing referee)

**C1 — Appraisal pressure ⚔ the honesty of the student-feedback sensor (SHARPEST).**
Appraisal now grades faculty on `faculty.feedback_understood`, derived from students' `session_feedback` ratings. The teaching loop, the struggling-note safety loop, and the free-text carry loop **all read the same sensor** and assume it is honest. The moment faculty are optimized on it, the cheap win is to inflate it (pressure/curate ratings, teach-to-the-feedback), which corrupts the signal the three wellbeing/teaching loops depend on — and corrupts appraisal itself. **Missing arbiter:** no loop owns the trade-off "faculty career incentive vs. truthfulness of the student voice." The `feedback_improvement` Δ is not that arbiter — it's on the same wire.

**C2 — Speed-of-fix ⚔ safety (well-arbitrated already).**
Bug-triage cluster auto-fix + capability-gap optimize backlog-shrink; the brakes are human merge+deploy, forbidden-paths, and the reporter-👍 ground truth. **Arbiter exists and is real** (the Director's merge gate + independent reporter thumbs). This is the model the other conflicts should copy.

**C3 — Note-safety auto-approval ⚔ student safety.**
The judge optimizes "less human labour"; the counter-force is precision floor + spot-check + crisis carve-out + "never auto-reject." Design is sound, but the **arbiter/owner is literally "TBD"** (spec §12) and the parameters (P_floor, T, K) are unset. No owner = no one to hold the trade-off. Today it's inert (shadow), so latent.

**C4 — Feeder momentum ⚔ school-coverage equity (lower stakes).**
"Visit outcomes → momentum score → next allocation" concentrates visits on already-winning schools (Matthew effect); the cheap win is to abandon low-momentum schools. **No coverage/equity counter-metric**, no arbiter.

---

## 4. Top-3 unpaired loops by stakes

Ranked by what a Goodhart failure would cost — careers and vulnerable students first.

1. **Faculty appraisal / work-signals (CAREERS + SALARY).** Highest stakes, worst-governed: not registered, no counter-metric, no owner, sensor already decayed (F2), human-verdict container empty, ranking institution-wide, and career pressure now pushes on a student-self-report sensor (C1). A Goodhart failure here misallocates pay and pollutes the student-voice data four other loops trust. **This is the one to fix first.**
2. **SCF note-safety judge (VULNERABLE STUDENTS).** Safe *because* it's inert. The danger is graduation: 0 labels means if it were flipped to auto-approve it would be calibrated on nothing. The pairing (precision floor + spot-check) exists only in spec and its owner is TBD. Must not graduate until the label feed (F3) is alive.
3. **SCF teaching loop / the `session_feedback` sensor (SHARED SPINE).** Nominally paired (feedback_improvement Δ) but the pairing is on the **same wire**, so it's a weak pairing that can't catch sensor-level gaming. Because three other loops drink from this sensor, its corruption is a multi-loop failure, not a single-loop one.

---

## 5. Proposed edges — cheapest first (recommendation-only)

Every item **extends an existing mechanism** (`loop_registry`, `okr_metric_registry`, the existing `ai-tasks-sweep` cron). None invents a parallel system. Sizes: S = hours, M = a day, L = multi-day.

| # | Edge | What it is | Why | Size | Extends |
|---|---|---|---|---|---|
| 1 | **Register the 3 live-but-invisible loops** | add `loop_registry` rows for `faculty_appraisal`, `scf_note_safety`, `scf_freetext_carry` with honest gates (appraisal m:off/f:off; judge m:half/f:off; carry m:half) | you can't govern what the registry can't see (F1) | **S** | loop_registry (INSERT rows, same as bug-triage row) |
| 2 | **`owner_email` NOT NULL** | fill an owner for all 19 + the 3 new rows; make it required going forward | encodes the root human anchor that today exists only in practice (F0) | **S** | loop_registry (backfill + constraint) |
| 3 | **`counter_metric` column + gate rule** | add a `counter_metric text` column; a loop's `m` gate may not flip `on` unless it's non-null and names an *independent* number | forces the pairing edge at graduation; appraisal's = a population integrity check, not a same-sensor Δ | **S/M** | loop_registry (+ the existing gate-flip migration discipline) |
| 4 | **Weekly measurement-pipe audit** | one SQL run on the existing sweep cron that emails supers when a pipe is rotting: M12 email-bridge match rate, **judge human-label rate (fires today: 0)**, COE key validity, judge parse-failure rate | watches the watcher — catches quiet decay (F2/F3) before a green dashboard lies | **M** | `ai-tasks-sweep` tail (no new Vercel cron — same piggyback as PR #2115/#2152) |
| 5 | **Appraisal counter-metric, concretely** | register `faculty.feedback_integrity` in `okr_metric_registry` — a population-calibrated gaming check (per `feedback_integrity_metric_calibrate_on_population`: measure the whole population first, prefer an *earned* signal over a *withheld* one) and pair it to the appraisal loop | the #1 unpaired loop gets its Goodhart-catcher before more grades are shown | **M** | okr_metric_registry (the canonical metric engine, same recipe as M4/M12) |
| 6 | **`conflicts_with` note** | a column (or description convention) naming the paired loop + the human arbiter for the trade-off; seed C1 (appraisal ⚔ scf sensor → Director) and C3 (judge ⚔ safety → wellbeing owner) | gives the fighting pairs an encoded referee instead of an implicit one | **S** | loop_registry |

**Cheapest first move (do this one thing if nothing else):** **#1 + #2 together** — register the three invisible loops and give every loop a named owner. It's a few INSERTs/UPDATEs, changes no behavior, and immediately makes the career-grading loop and the vulnerable-student loop *visible and owned*. Everything else (counter-metrics, pipe-audit) can only be attached to loops the registry admits exist.

---

## 6. Circularity check (where the graph risks watching itself with no ground contact)

The estate has a genuine audit tier — `institutional-audit` reads a `LOOP_HEALTH` parameter off `loop_audits`, `iqac-meeting` reviews the loops, `metaloop` reviews the 4-gate taxonomy. This is loops-watching-loops, which is **fine only if it terminates in an anchor.** Where it does and doesn't:

- **Grounded (circle broken cleanly):** bug-triage (reporter 👍 = a real human who stayed), capability-gap (measured refusal drop = real usage), the ₹0 ledger (real cost, actually zero: `claude_code` 1,116 calls / **₹0.00**, groq free), signed audit attestations (a human signed). These touch reality.
- **At risk of circularity:** the **`loop_registry` gates are hand-set in migrations**, and the audit's `LOOP_HEALTH` check partly reads loop verdicts. If a gate says `m:on` but the measurement pipe is dead, the audit can confirm a green that isn't real. The gates describe *intent*, not *liveness* — nothing verifies that an `m:on` loop's sensor produced a fresh, correct reading this week. Edge #4 (pipe-audit) is precisely the ground-contact that closes this.
- **Closest to pure circularity (no anchor yet):**
  - **SCF note-safety judge** — the judge predicts, but `agreement_pairs = 0`: there is no human verdict for it to be measured against. Until a human label exists, it is a reading with nothing behind it.
  - **Faculty appraisal** — metrics compute → display as a grade, but `hr_performance_reviews = 0`: **no human appraisal verdict ratifies the grade.** The number is currently self-consistent and un-grounded. Showing it institution-wide before a human-judgment anchor exists is the circular-confirmation risk in its purest form.

---

## Evidence appendix (SQL run read-only against prod `kvizhngldtiuufknvehv`, 2026-07-19)

**Registry: all owners null, appraisal/judge/carry absent** — 19 rows returned, every `owner_email` null; loop_keys are ai-pulse, arps, bug-triage, capability-gap, decisions, director, feedback-spine, feeder, induction-playbook, induction-session, institutional-audit, iqac-meeting, mentor-checkins, mess, metaloop, pde-quest, referral-desk, scf. (No `faculty_appraisal`, `scf_note_safety`, or `scf_freetext_carry` row.)

**Faculty appraisal metrics live (okr_metric_registry, module=faculty_appraisal):**
```
faculty.feedback_improvement (db_function, number)   is_active=t
faculty.feedback_understood  (db_function, score)    is_active=t
faculty.initiatives_total    (db_function, count)    is_active=t
faculty.innovations          (db_function, count)    is_active=t
faculty.patents              (db_function, count)    is_active=t
faculty.publications         (db_function, count)    is_active=t
```

**F2 — M12 sensor decay (the pipe is on an email bridge because the FK is dead):**
```
session_feedback: total 92713, faculty_id populated 80295, distinct faculty_id 180
faculty_id → profiles.id join: distinct_fac 180, join_to_profiles 0   ← 0 of 180 join
```
The appraisal M12 metric must route profile→email→faculty_email; if an email changes or dedups, the metric silently goes NULL/wrong. No watcher today.

**F3 — judge has no label anchor (scf_note_judgements):**
```
judged_notes 369 | human_reviewed 0 | agreement_pairs 0 | first 2026-07-19 13:21Z | last 16:45Z
by verdict: needs_human 355 (avg_conf .632) · likely_unsafe 14 (avg_conf .756) · auto_safe 0
```

**Empty human-verdict container:**
```
hr_performance_reviews: exists, review_rows 0
```

**₹0 anchor holds (ai_model_usage, 3 days):**
```
claude_code: 1116 calls, total ₹0.00 (last 2026-07-19 16:58Z)
groq:        436 calls,  cost not metered (free tier)
— no paid provider in the window
```

**Live loop activity (ai_jobs, 3 days, all done unless noted):** scf.note_safety_judge 403 done +16 pending · scf.freetext_carry 214 · scf.learner_notes 150 · scf.judge_help_ask 55 · bug.reverify 16 · bug.suggest_fix 5 · curriculum.lesson_spine_generate 4 · ops.brief 4 · bug.triage 3 done / 3 error / 1 canceled · pde.case_author 1.

**Loop generation lanes (platform_policies, all `jobs` = observable ₹0 lane):** curriculum, induction_generate_playbook, induction_session_effectiveness, scf_generate_suggestions, scf_learner_notes, session_feedback_escalation. SCF free-text carry config live: `enabled=true`, `count_floor=3`, `max_concerns_per_text=3`.
