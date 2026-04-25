# Director's Decision Portfolio — `decisions.md` Spec

> **v2 NOTE:** v1 of this spec (sections 0–10 below) covered only **decisions Director makes**. Pushback round 2026-04-25 21:30 IST surfaced 3 missing territories: avoided decisions (silent costs), system-proposed entries (signals → decision moments), alternative-generation help, and escalation health (decisions Principals/HODs should but don't surface). v2 extensions in §11–§14. The instrument is no longer "Director's decision journal" — it is a **complete decision-quality system at institutional level**, with v1 as the foundation and §11–§14 as required extensions, not optional.

**Status:** Draft v2 (2026-04-25, extended after pushback round)
**Audience:** Just Director (fully private). Not shareable. No leadership view yet.
**Surface:** In-app dashboard card, always-visible on `/dashboard` for super_admin.
**Author:** Drafted via 5-round interview between Omm + agent on 2026-04-25.

---

## 0. The honest framing

This document was triggered by a specific failure: the agent shipped 5 PRs in 24 hours that solved notification-page UX but never asked whether Director's actual decision quality improved. Omm's pushback was the right one — *"why can't you be more intelligent and practically implementable, and if you're hand-waving, name it."*

`decisions.md` is **not** a TODO list, dashboard, brief, or executive summary. Those exist elsewhere. This document is the spec for an instrument that does exactly one thing:

> Make Director a measurably better decider over time, where "better" is defined as 90-day-validated prediction accuracy across 4–6 decision categories, computed automatically from MyJKKN signals (not from self-report).

**It does not change what's on Director's plate. It changes how decisions on his plate get framed, predicted, and graded.**

The 11 active build streams (HR Sprint 6, Audit, Events, OKR, Compliance Unification, Cockpit, Solutions Hub, Campus Living, Bug Reports, Notifications, Lead Assignment) **continue unchanged**. Director chose this in Round 4 — *all are needed*. The instrument operates on top of them; it does not gate them.

---

## 1. Theoretical lineage (declared, not implicit)

| Influence | What it brings | Where to push back |
|---|---|---|
| **Ronald Howard / decision analysis** | A "decision" is the irrevocable allocation of resources between alternatives. Quality is judged by framing, alternatives, information, values, logic. | Self-rated values are weak; outcome data is the only honest verdict. We use MyJKKN signals, not Director's retrospective sense-making. |
| **Stafford Beer / cybernetics** | A manager's tools must amplify their variety to match the complexity of what they manage (Ashby's Law). | Beer assumes the manager knows what to attend to. We don't — we let the 90-day verdict surface where intuition is calibrated vs. dull. |
| **Eli Goldratt / Theory of Constraints** | At any moment, an institution has ONE binding constraint. Director's attention should concentrate there. | Identifying the constraint is itself a decision worth tracking — and it can shift quarter to quarter. We track which constraint Director thinks is binding, and validate at 90 days. |
| **Daniel Kahneman / dual process** | System 1 (intuitive, fast) handles routine; System 2 (deliberate, slow) handles novel/high-stakes. Bad decisions happen when System 1 is used where System 2 is needed. | Not all System 1 decisions are bad — calibrated experts use System 1 reliably. The 90-day validation is how we tell which is which for Director. |
| **Clayton Christensen / Jobs-to-be-Done** | Tools succeed when they do a specific job better than alternatives. | Director "hired" decisions.md to do this job: *make me a better decider, prove it with 90-day truth.* Not "show me a dashboard." |

**Cross-paradigmatic synthesis:** Howard provides the structure (alternatives + prediction); Beer provides the surface (always-visible amplifier); Goldratt provides the focus (binding constraint of the quarter); Kahneman provides the discipline (forces System 2 framing on a System 1 default); Christensen provides the test (does the tool actually do the job, or just exist).

---

## 2. The bar — entry criterion

A call belongs on `decisions.md` when it meets **all four** tests:

1. **Two real alternatives.** A chosen path AND a not-chosen path must be articulable. Default actions ("respond to that email") do not qualify. Single-option questions ("should I do X?") are not decisions — they're action prompts.
2. **Director-level.** Cannot be delegated to a Principal/HOD without losing material information. Director's specific judgment, network, or political weight is part of the input.
3. **Resource allocation has a 90-day visible consequence.** The chosen path leads to an outcome that MyJKKN signals can detect (conversion shift, headcount change, NAAC submission state, cash position, employee retention).
4. **Outside personal/family/health scope.** Institutional only.

**Entry criterion test against the 4 seed decisions:**

| Seed decision | 2 alts? | Director-level? | 90-day visible? | Institutional? | Verdict |
|---|---|---|---|---|---|
| Counselor capacity: hire 5 vs. invest in lead-quality scoring | ✓ Hire OR Score | ✓ Capital + headcount | ✓ Conversion rate at 90d | ✓ | **In** |
| Education_fair 6,537 leads: triage as low-intent vs. sweep call campaign | ✓ Discard OR Mine | ✓ Campaign budget + risk | ✓ Conversion from this cohort at 90d | ✓ | **In** |
| Q3 AI/tech investment commit (₹X scale) | ✓ Commit OR Defer / OR Alt vendor | ✓ Capital | △ Visible at 90d only if specific KPI defined | ✓ | **In** (must define the 90-day KPI when entering) |
| Recent hire/fire/promotion follow-up: reverse or hold | ✓ Hold OR Reverse | ✓ People decision | ✓ Output-trail at 90d on the affected role | ✓ | **In** |

All four pass. Bar is correctly tuned for Director's portfolio.

---

## 3. Out of scope

| Category | Why out |
|---|---|
| Calendar / meeting scheduling | No alternatives weighed; no 90-day outcome. |
| Operational micro-approvals (leave, expense, schedule) | Delegated to Principals/HODs. |
| Personal / family / health | Director chose this explicitly in Round 4. |
| Reversible-within-a-week-at-zero-cost calls | They violate the "90-day visible consequence" bar. |
| Decisions Principals SHOULD escalate but don't | Important systemic gap, but it's a separate diagnostic problem (escalation-rule design), not an entry on Director's portfolio. |

---

## 4. Data model

```sql
CREATE TABLE director_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director_user_id UUID NOT NULL REFERENCES profiles(id),
  -- Framing
  title TEXT NOT NULL,
  context TEXT NOT NULL,                    -- 1-3 sentences: what's the situation
  alternatives JSONB NOT NULL,              -- [{label, summary, predicted_outcome_if_chosen}]
  chosen_alternative_idx INT NOT NULL,
  rejected_summary TEXT,                    -- why the others were rejected
  -- Prediction
  predicted_outcome TEXT NOT NULL,          -- "I expect cluster conversion to lift 8-12% by 2026-07-25"
  outcome_metric_query JSONB NOT NULL,      -- structured: {table, filter, agg, target_value, comparison}
  outcome_due_at TIMESTAMPTZ NOT NULL,      -- decision_made_at + INTERVAL '90 days'
  -- State
  status TEXT NOT NULL CHECK (status IN ('pending_outcome','outcome_recorded','reversed','superseded')),
  decision_made_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Verdict (filled at 90d by fn_decision_outcome_check)
  actual_outcome_value NUMERIC,
  actual_outcome_recorded_at TIMESTAMPTZ,
  prediction_correct BOOLEAN,               -- system-computed verdict
  verdict_notes TEXT,                       -- system explanation of the verdict math
  -- Privacy
  visibility TEXT NOT NULL DEFAULT 'private_to_director'
    CHECK (visibility IN ('private_to_director'))
);

CREATE INDEX idx_director_decisions_pending
  ON director_decisions(outcome_due_at)
  WHERE status = 'pending_outcome';
```

**RLS:** SELECT/INSERT/UPDATE only when `auth.uid() = director_user_id`. No grant to anyone else, ever, until Director explicitly opens visibility (which the schema currently forbids). Per Round 5 — *"sharing would change what I'd put on it."*

---

## 5. The 90-day outcome verdict — system-computed (no self-report)

This is the load-bearing decision in this design. Round 5 chose **"system computes automatically from MyJKKN signals"** over self-assessment / hybrid / external reviewer. Removes motivated reasoning at the cost of requiring measurable predictions.

**Implementation:**
- `outcome_metric_query` JSONB defines exactly what the system measures at 90d.
  Example for "hire 5 counselors → expect 15% conversion lift":
  ```json
  {
    "metric": "admission_funnel_conversion_rate",
    "scope": "institution",
    "institution_id": "5736d86f-...",
    "window": "30_days_ending_at_outcome_due_at",
    "baseline_window": "30_days_preceding_decision_made_at",
    "target_delta_pct": 15,
    "comparison": "delta_pct_gte"
  }
  ```
- `fn_decision_outcome_check()` runs nightly. When `outcome_due_at <= NOW()` and `status = 'pending_outcome'`:
  1. Resolve `outcome_metric_query` against current MyJKKN data.
  2. Compute `actual_outcome_value` and `prediction_correct` (boolean).
  3. Update row to `outcome_recorded`.
  4. Emit a notification (work_item kind) to Director: *"90-day verdict in: Decision X — predicted Y, actual Z. Verdict: correct / wrong / partial."*

**What if the metric isn't computable?** Decision is INADMISSIBLE — the system blocks entry until Director defines a measurable predicted outcome. This is a feature, not a bug. It forces precision in framing.

**Categories of measurable predictions (proven against current MyJKKN signals):**

| Category | Signal | Source |
|---|---|---|
| Admission funnel | conversion %, leads-per-counselor, time-per-stage | `admission_leads`, `admission_lead_activities` |
| Counselor productivity | enrolments-per-counselor, avg time-to-first-touch | `admission_leads.counselor_id`, `admission_lead_activities` |
| Cash position | collection % vs. plan, overdue ageing | `billing_invoices`, `billing_receipts` |
| Faculty/staff retention | exits-by-role-by-college, leave patterns | `hr_employees.date_of_exit`, `hr_leave_applications` |
| Student experience | grievance counts, attendance %, cluster OHS | `grievances`, `student_attendance`, `fn_dashboard_metrics` |
| Accreditation readiness | evidence-coverage %, days-to-deadline | `quality_evidence_mappings`, `accreditation_*` |

If a predicted outcome doesn't map to one of these — Director must define a custom query at entry time, or downgrade the prediction to something measurable, or accept that this isn't a `decisions.md` candidate.

---

## 6. UI surface

**Card on `/dashboard` for super_admin** (always-visible per Round 3):

```
DIRECTOR'S DECISIONS                                     [Add new]
─────────────────────────────────────────────────────────────────
Active (12)        Pending verdict (8)        Recent verdicts (3)

▸ Counselor capacity: hire 5 vs. lead-quality scoring
   Made 2026-04-22 → verdict due 2026-07-21 (87 days)
   Predicted: cluster conversion +12%

▸ Education_fair 6,537 leads: discard vs. sweep campaign
   Made 2026-04-25 → verdict due 2026-07-24 (90 days)
   Predicted: ≥3% of cohort enrols

▸ ... [10 more]

VERDICTS THIS WEEK
✗ HOD reshuffle at Pharmacy: predicted 20% admin-load drop, actual 4%. Wrong.
✓ Counselor SLA tightening: predicted 8% conv lift, actual 11%. Right.
─ Mid-year compliance audit timing: partial — N/A signals incomplete.

CALIBRATION (last 90 days, 11 verdicts)
People decisions: 2/4 right (50%) — flag, deeper framing needed
Capital decisions: 4/5 right (80%) — keep current pattern
Process decisions: 1/2 right (50%) — small N, watch
```

**Friction targets:**
- Adding a new entry: <90 seconds (title + alternatives + chosen + predicted outcome from a measurable-metric picker).
- Reading the card: <30 seconds for the active queue.
- Reviewing a verdict: 1 click to expand explanation.

**Non-features (deliberately):**
- No comments. No collaboration. No assignment. No tags. No search.
- No cross-decision linking. No "related decisions." No portfolios within portfolios.
- No external sharing in v1. Schema constraint enforces this.

The UI is a journal, not a project management tool. Per Round 3, this is Director's first formal decision log. Friction must stay near zero or it dies.

---

## 7. Failure modes and what we'd do

**Round 4's chosen failure mode: *"the 90-day outcome checks revealed I'm not actually learning — same mistakes repeat."*** This is the deepest failure mode and the one we have to design against.

| Failure | How it shows up | Response |
|---|---|---|
| **No learning over 90 days** (chosen failure mode) | Calibration data shows accuracy not improving across categories after 6+ verdicts in any category. | The instrument itself surfaces this: a "calibration is flat" banner appears. Then we ask the harder question — is the constraint Director's framing? Or is the underlying institutional reality genuinely non-learnable (high noise)? Either way, surfacing flat calibration IS the system working. |
| **Wrong predictions clustered in one category** | Calibration shows 1/5 right on people decisions but 4/5 on capital. | Surface as a "blind-spot in people decisions" insight. Director can choose: change framing (consult HOD output trails before deciding), bring in independent reviewer for that category, or accept the bias. |
| **Decision never gets a verdict** | `outcome_metric_query` was wrong / signals unavailable / institution data shifted. | System flags as "verdict-impossible." This is a methodology lesson, not a data failure — record it as a category of decision we can't currently grade and surface to Director as "expand instrumentation here." |
| **Director stops opening the card** | UI engagement drops to zero. | Engagement metric on the card itself. If <1 open per week for 2 weeks → push notification once, then degrade gracefully. The card is a tool, not a guilt-tripper. |
| **Decision portfolio bloats to >25 active** | Volume overwhelms Director. | Force-prune: any decision with `outcome_due_at` >120 days AND no movement gets archived to "deferred." Director can manually retrieve. |

**What we deliberately AREN'T defending against:**

- **Capture by other people** (Round 4 option C). Schema enforces private-to-Director — no one else can write or read. Capture is impossible by construction.
- **Becoming a lagging audit log** (Round 4 option B). Entry criterion (two real alternatives) prevents this — you can't add an entry after the call without articulating the path you didn't take.
- **Friction-induced neglect** (Round 4 option A). UI friction targets above.

---

## 8. Open questions (honest)

1. **What about Director's intuition that BEAT the data?** The system grades predictions against MyJKKN signals. If Director made a call against the signals and was right (or vice versa), how does that show up? Currently it doesn't — the verdict is binary right/wrong. Possible v2: track "signals predicted X, Director predicted Y, actual was Z" — surface where Director's intuition adds value vs. where signals do. Worth waiting until v1 produces 30+ verdicts before adding this complexity.

2. **The 4 seed decisions don't have measurable predicted outcomes yet.** Spec assumes Director will define them at entry time. Need to test entry friction with the actual seed entries — if it's too hard to articulate, the bar is too high.

3. **Quarterly constraint shift.** Goldratt frame says the binding constraint shifts quarter to quarter. Currently the system is signal-agnostic about which decisions are highest-leverage. v2 could surface: "of your 12 active decisions, which 3 sit on the current institutional constraint?" Requires explicit modeling of the constraint, which is itself a decision worth tracking — recursive. Defer.

4. **The "what specific hire/fire" decision in Round 1.** Director didn't share which one. Without that, I can't validate the spec against the most painful real case. Will need that input at entry time when seeding the system.

5. **Migration from "all in head" to formal log.** Round 3 — *"it's all in my head until something fails."* We're asking Director to change a 30+ year habit. If he doesn't enter the 4 seed decisions in the first week, the spec succeeded as a design exercise but failed as a tool. Need a behavioral commitment, not just a build commitment.

---

## 9. Implementation sequence (if approved)

**Sprint 0 (1 day) — instrument the seed**
- Director writes the 4 seed decisions in this markdown spec, manually. Each gets:
  - title, context, 2 alternatives, chosen path, predicted outcome (with a measurable signal mapped from §5)
- Agent creates the `director_decisions` table on prod via Supabase MCP.
- Insert 4 seed rows.

**Sprint 1 (2 days) — outcome verdict engine**
- `fn_decision_outcome_check()` SQL function.
- Cron: nightly run via existing `/api/dashboard/cron/*` pattern (Bearer auth, mirrors super-admin-digest).
- Verify on the seed rows by setting their `outcome_due_at` to NOW() in a staging copy and confirming the engine produces verdicts.

**Sprint 2 (2 days) — the card**
- `components/dashboard/director-decisions-card.tsx`
- API route `/api/dashboard/director-decisions` (GET list + POST entry).
- Wire into `/dashboard` super_admin hero only — invisible to all other roles.
- Friction-test entry flow against the 4 seeds. Iterate until <90s/entry.

**Sprint 3 (1 day) — calibration view**
- Aggregate verdict data by category, render the calibration block on the card.
- Surface "no learning" flag if accuracy doesn't improve across category over 6+ verdicts.

**Total: 6 days of agent work, sequential. Does not pause any of the 11 active streams — runs alongside.**

---

## 10. Self-test (the noble-laureate bar)

This spec earns its place ONLY if:

- ✅ It refuses self-report — outcomes computed from data
- ✅ It refuses single-option "decisions" — alternatives required
- ✅ It refuses leadership-pleaser surface — private-to-Director only
- ✅ It refuses passive logging — predictions required at entry, otherwise no entry
- ✅ It refuses to grow features in v1 — UI is journal, not PM tool
- ✅ It refuses to claim universality — categories outside §5 metric inventory are explicitly inadmissible
- ✅ It declares its theoretical lineage — Howard, Beer, Goldratt, Kahneman, Christensen
- ✅ It declares 5 open questions honestly, not 0

If any of these flip back during build, the spec failed to constrain the work. Pull this document up, re-read §0, decide whether to ship anyway.

---

*Drafted in 5 interview rounds, 2026-04-25 21:30 IST. Next decision: does this spec deserve a build slot in the next sprint, or does it stay as a thinking artifact until Director decides he wants the instrument?*

---

# v2 Extensions — required, not optional

The pushback was that v1 covered too narrow a slice of decision-quality. The four extensions below close that gap. Each follows the same shape as v1: theoretical anchor → mechanism → schema → 90-day analog → failure mode.

---

## §11. Avoided / Deferred Decisions (Real-Options layer)

**Why this exists.** Round 2 surfaced "what decision are you AVOIDING because the data isn't good enough." Avoided decisions have outcomes too — the cost of inaction is real but invisible. v1 only graded decisions you made; it under-counted the portfolio by ignoring the held-options.

**Theoretical anchor.** Real options theory (Black-Scholes-Merton applied to management): every avoidable decision is a held option. It has a value, a decay curve, and an expiration. The cost of avoidance = the cost of holding the option × time. Sometimes deferral is correct (waiting for new information). Sometimes it's avoidance dressed as patience. The system should grade both, the same way.

**Entry criterion (extends §2).** A decision belongs in the deferred queue when:
1. It meets all 4 v1 entry tests, AND
2. Director has consciously chosen NOT to choose yet, AND
3. Director can articulate the **information signal** that would unblock the call (e.g. "I'll decide on counselor sizing once I see two more weeks of conversion data").

If the unblock signal isn't articulable → it's not deferred, it's avoided. The system distinguishes these. Avoided gets surfaced more aggressively.

**Schema addition.**

```sql
ALTER TABLE director_decisions ADD COLUMN deferred_reason TEXT;
ALTER TABLE director_decisions ADD COLUMN deferral_unblock_signal JSONB;
-- e.g. {"type":"data_signal","query":{...}, "trigger":"value_crosses_threshold"}
ALTER TABLE director_decisions ADD COLUMN deferred_until TIMESTAMPTZ;
ALTER TABLE director_decisions ADD COLUMN cost_of_inaction_metric_query JSONB;
-- Same shape as outcome_metric_query but measures the cost of NOT deciding
ALTER TABLE director_decisions DROP CONSTRAINT director_decisions_status_check;
ALTER TABLE director_decisions ADD CONSTRAINT director_decisions_status_check
  CHECK (status IN ('pending_outcome','outcome_recorded','reversed','superseded',
                    'deferred','deferred_unblock_fired','avoided'));
```

**Mechanism.**
- Director enters a decision but selects "Defer" instead of choosing an alternative.
- System asks: "What signal would unblock this?" Required field. Same JSONB metric-query shape as v1 §5.
- Nightly: `fn_deferred_decision_check()` evaluates each deferred entry's `deferral_unblock_signal`. If the signal fires (value crosses threshold, deadline approaches), status flips to `deferred_unblock_fired` and Director gets a work_item notification: *"Counselor capacity decision unblocked: conversion data crossed your threshold."*
- Separately: `cost_of_inaction_metric_query` runs at the standard 90d window. The "outcome" graded is **the predicted cost of NOT deciding**. If Director predicted "leads/counselor will exceed 80 if I don't hire" — at 90d the system measures actual leads/counselor at Pharmacy. If prediction was right, that proves the deferral was costly.

**90-day analog.** Same as v1 — but the question is *"was your prediction about the cost of inaction correct?"* not *"did your chosen path produce the predicted outcome?"* This catches the failure mode where Director says "I'll wait for more data" and waits forever.

**The avoidance-vs-deferral distinction.** Entries with no `deferral_unblock_signal` after 14 days are auto-flagged as `avoided` (not `deferred`). The card shows them in a separate stack: *"3 decisions you've held without a clear unblock signal — this looks like avoidance, not patience."* This is the system calling Director on his own pattern. The instrument's hardest job.

**Failure mode.** Director marks everything "deferred" with vague unblock signals (`{"trigger":"more_data_needed"}` — uncomputable). System should reject vague signals at entry: unblock signal must be a measurable query against MyJKKN tables, same constraint as v1 §5.

---

## §12. System-Proposed Entries (Signal → Decision-Moment pipeline)

**Why this exists.** v1 + §11 are passive — they record what Director enters. But Director is busy and may miss signals that mark decision moments. MyJKKN already has the data; the system should propose entries when patterns suggest a decision is due.

**Theoretical anchor.** Cybernetics — Beer's variety amplification. The institutional system has more variety than Director's attention can track unaided. The proposal layer is the variety amplifier: signals translate into candidate decision moments, Director triages.

**Trigger taxonomy (each must be a SQL query against existing MyJKKN signals):**

| Trigger class | Example | Computed from |
|---|---|---|
| **KPI shift exceeding threshold** | "Pharmacy conversion dropped >10% week-over-week for 3 consecutive weeks" | `admission_leads` aggregations |
| **Capacity saturation** | "Active leads per counselor at Pharmacy exceeds 60 for 7+ days" | `admission_leads.counselor_id` count |
| **Deadline approach** | "NAAC/NIRF/NBA submission window closes in 30 days, evidence coverage <60%" | `quality_evidence_mappings` |
| **Anomaly cluster** | "≥3 grievances of same category at one college in 14 days" | `grievances` |
| **Peer divergence** | "≥2 colleges' OHS dropped >5 points while ≥1 rose >5 points in same week (portfolio reshuffle signal)" | `fn_cluster_rank_public` |
| **Personnel signal** | "Faculty/HOD leave-spike at one college (>2σ vs trailing 90d)" | `hr_leave_applications` |
| **Cash-flow signal** | "Collection % vs. weekly plan <85% for 3 consecutive weeks" | `billing_invoices` + `billing_receipts` |

**Schema addition.**

```sql
CREATE TABLE decision_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director_user_id UUID NOT NULL REFERENCES profiles(id),
  trigger_class TEXT NOT NULL,            -- one of the 7 above
  trigger_query JSONB NOT NULL,           -- the SQL/metric definition that fired
  trigger_evidence JSONB NOT NULL,        -- snapshot of the data that fired the trigger
  proposed_title TEXT NOT NULL,
  proposed_alternatives JSONB NOT NULL,   -- [{label, summary}] — system's suggested alternatives
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','snoozed')),
  director_response TEXT,                 -- "rejected: not actually a decision moment for me"
  accepted_decision_id UUID REFERENCES director_decisions(id), -- FK if Director accepted → became a real entry
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ
);
```

**Mechanism.**
- `fn_propose_decisions()` runs nightly. For each trigger class, queries are evaluated against current data. If a trigger fires, a proposal row is inserted (idempotency by `trigger_query` hash + window — won't propose same thing twice in same week).
- UI: proposals show on the dashboard card in a separate "🔔 System sees a decision moment" stack above the active queue.
- Director can: **Accept** → opens the v1 entry form with `proposed_title` + `proposed_alternatives` pre-filled. Director still picks an alternative + writes predicted outcome. **Reject** → proposal closed with required reason ("not a decision," "already handled," "wrong trigger"). **Snooze** → proposal hides for N days. Each rejection becomes feedback to refine the trigger.
- Calibration loop: % of proposals accepted vs. rejected, per trigger class. If a trigger class has <20% accept rate over 30+ proposals, system auto-disables it and flags Director: *"This trigger class isn't producing decision moments for you. Disabled."*

**90-day analog.** Two metrics:
1. **Proposal-precision:** % of accepted proposals that reached `outcome_recorded` with `prediction_correct=true`. Tests whether system-suggested moments are real.
2. **Coverage gap:** % of decisions Director enters MANUALLY that the system COULD have proposed. Annotated post-hoc — for each manual entry, system checks if any trigger query would have fired in the prior 14 days. Surfaces blind spots in the trigger taxonomy.

**Failure mode.** Proposal noise overwhelms Director (>5 proposals/week). Auto-throttle: max 3 proposals visible at any time, oldest auto-snoozes when 4th arrives.

---

## §13. Alternative-Generation Helper (Framing Aid)

**Why this exists.** Round 6 (the pushback) — *"sometimes the hardest part isn't choosing — it's seeing that there ARE alternatives."* v1's bar requires "two real alternatives" but doesn't help generate them. The helper closes that gap.

**Theoretical anchor.** Munger's mental-model latticework. Alternative generation is failed when Director is anchored on one frame. The helper offers parallel frames so the choice tree expands.

**Mechanism.**
- When Director enters a decision and clicks "I see the problem but don't know the alternatives" instead of typing them:
  - System asks: "Which category fits best?" (capital allocation, headcount, vendor, accreditation, personnel-judgment, process-redesign, strategic-positioning, conflict-resolution).
  - System presents a **playbook** for that category — 3–5 generic alternative pairs that have been used at JKKN historically OR are documented in the category's playbook library:
    - **Capital allocation:** [Spend now / Stage with milestones / Partner-fund / Defer]
    - **Headcount:** [Hire / Reallocate from elsewhere / Automate / Outsource / Accept under-capacity]
    - **Vendor:** [Build / Buy / Partner / Status quo]
    - **Accreditation:** [Push for early submission / Standard cycle / Defer to next cycle]
    - **Personnel judgment:** [Coach / Reassign / Reduce scope / Exit]
    - **Process redesign:** [Pilot at one college / Pilot at one team / All-at-once / Defer]
    - **Strategic positioning:** [Lead market / Fast-follow / Differentiate / Withdraw]
    - **Conflict resolution:** [Mediate / Escalate / Reassign one party / Accept and contain]
  - Director picks 2 from the playbook OR writes custom — system requires at least 2 distinct alternatives before entry submits.

**Schema addition.** No new tables. Existing `director_decisions.alternatives` JSONB carries the picked options + an optional `framing_source` field: `'manual' | 'playbook:<category>' | 'system_proposed'`.

**Calibration loop.** Track per-category: % of decisions framed via playbook that produced correct predictions vs. % framed manually. If playbook framing has higher accuracy, the playbook is doing its job. If manual is higher, the playbook is over-constraining and should be revisited.

**90-day analog.** Same as v1 — outcome verdict against predicted outcome. But adds a meta-metric: *"In categories where you used the playbook, did your prediction accuracy improve over not using it?"* This is whether alternative-generation help actually helps.

**Failure mode.** Director picks playbook options without engaging with whether they fit his actual situation — playbook becomes a fill-in-the-blank that hides genuine framing failures. Mitigation: require Director to write a 1-sentence "why these 2 alternatives, not the others" rationale at entry.

---

## §14. Escalation Health (Layer below Director's queue)

**Why this exists.** Round 4 — *"what decisions SHOULD Principals/HODs escalate to you that they currently don't?"* These are decisions happening below Director's visibility that should have been on his queue. v1 doesn't see them.

**Theoretical anchor.** Conway's Law (organizational structure shapes what gets escalated) + Beer's Viable System Model (each layer of management has its own decision authority; failures of escalation are layer-design failures). The instrument needs to model authority thresholds and detect violations.

**This is the hardest extension. It depends on data MyJKKN doesn't fully have today and on organizational rules that aren't formally documented. Defer to v3.0; capture the design here so it's not forgotten.**

**Mechanism (sketch).**
- Define authority thresholds per decision category per role:
  - Capital allocation: HOD ≤ ₹50K, Principal ≤ ₹5L, Director > ₹5L (numbers Director-defined per institution).
  - Headcount: HOD can request, Principal can sign off ≤ junior staff, Director for HOD/Principal/director-reports.
  - Vendor contracts: ditto.
  - HR action: complaints involving director-reports, gross-misconduct, or affecting >10 students automatically Director-level.
- Watcher: nightly query against `billing_invoices` (approval signature + amount), `hr_employees` (role changes + dates), `vendor_contracts` (sign-offs), `grievances` (severity + actor). Identify rows where the action was taken at a layer below where the threshold would normally require Director sign-off.
- Output: a "💡 What I missed" stack on the dashboard card — *"Pharmacy approved a ₹6.2L lab equipment order on 2026-04-23. Authority threshold suggests this was Director-level. Did you know? [Yes/No]."*

**90-day analog.** Two metrics:
1. **Below-threshold catch rate:** when system flags a below-layer action, did Director say "yes I knew"? If usually yes, threshold is calibrated correctly. If usually no, threshold is too tight (system noise) OR genuine escalation gaps.
2. **Above-threshold miss rate:** at 90d, periodic audit picks 20 random Principal/HOD decisions and asks Director "should this have been on your queue?" Discovers escalation gaps the watcher missed.

**Schema addition.** Defer to v3. Requires `authority_thresholds` table + `escalation_watchers` table + audit-trail enrichment across multiple operational tables.

**Failure mode.** False-positive flooding (system flags actions that look below-layer but weren't). Without good authority threshold data, the watcher is just noise. Hence v3 deferral.

---

## §15. Updated Implementation Sequence (versioned)

| Version | Scope | Effort (agent-days) | Ships when |
|---|---|---:|---|
| **v1.0** | §0–§10 (original spec): manual entry, system-computed verdicts, calibration view | 6 | Sprint 0–3 — can start today |
| **v1.5** | §11 Avoided/Deferred — deferral schema + unblock-signal triggers + cost-of-inaction grading | +3 | Sprint 4 |
| **v2.0** | §12 System-Proposed Entries — 7 trigger classes + proposal review UI + accept/reject/snooze | +5 | Sprint 5–6 |
| **v2.5** | §13 Alternative-Generation Helper — playbooks + 1-sentence rationale enforcement | +3 | Sprint 7 |
| **v3.0** | §14 Escalation Health — authority thresholds + watcher engine + below-threshold flagging | +5 | Sprint 8–10 (requires authority threshold workshop with Director first) |
| **TOTAL** | Full instrument | **~22 agent-days** sequential | ~5 weeks elapsed |

**Critical path:** v1.0 ships first because it can stand alone. Director uses it for 2 weeks, generates 8–12 entries. Real friction data informs v1.5 design. Skipping straight to v2.0 without v1.0 + v1.5 is a mistake — the proposal layer needs accurate calibration of what Director ACTUALLY puts on his portfolio before it can propose well.

**Pause-the-other-streams question:** Director chose "all are needed" in Round 4. The 22 agent-days for full instrument run **alongside** the 11 streams, not instead. If contention emerges, v2.0+ can stage out further; v1.0 is non-negotiable.

---

## §16. Updated Self-Test (the v2 noble-laureate bar)

The v1 self-test in §10 stands. Adding v2-specific tests:

- ✅ It refuses one-sided portfolio — avoided/deferred decisions get the same grading rigor as made decisions (§11)
- ✅ It refuses passive system — proposes entries from signals (§12), doesn't just wait
- ✅ It refuses framing-poverty — provides alternative-generation help when Director can't see the choice tree (§13)
- ✅ It refuses Director-only scope — recognizes that decisions made one layer below should sometimes have been on his queue (§14)
- ✅ It declares the instrument is **not finished** at v1 — extensions are required, not optional, and §15 sequence is honest about the work
- ✅ It defers v3 (§14 escalation health) explicitly because the data infrastructure isn't ready, rather than handwaving it as "future work"

If any of these flip back during build → re-read this section, decide whether to ship anyway and accept the technical debt as conscious, or block.

---

## §17. Updated Open Questions

Adding to §8:

6. **Does Director want to see the 7 trigger-class queries explicitly before v2.0 ships?** Some triggers (e.g. "≥2σ leave-spike at one college") encode opinions about what a decision moment looks like. Director should sign off on each before they fire.
7. **Authority thresholds for §14 require a workshop.** No way around it. We can't build the watcher without Director articulating: at what ₹ threshold does Principal authority end? At what HR-action class does it escalate? These aren't in any current MyJKKN data. v3.0 starts with a half-day interview, not code.
8. **What about decisions Director shouldn't be making but is?** Reverse failure mode of §14 — Director making calls that should have been delegated. Currently invisible to the instrument. Possible v4: peer review where chief-of-staff or co-founder can mark "you shouldn't have decided this — it should have been Principal-level." But Round 5 ruled out shared visibility. Tabled.

---

*v2 drafted 2026-04-25 21:50 IST in response to "not exhaustive" pushback. v1 sections 0–10 unchanged (above this banner). v2 extensions are §11–§17. Total spec ~7,700 words. Next decision: Sprint 0 today (build v1.0) or further interview round before any code?*
