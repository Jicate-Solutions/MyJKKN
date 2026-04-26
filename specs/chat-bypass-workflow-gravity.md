# Chat-Bypass as Workflow-Gravity — Spec & Build Plan

> **Status:** Draft v1 (2026-04-26, 00:27 IST)
> **Audience:** Director Omm + next-session implementer
> **Origin:** 365-day Google Chat audit (`.claude/decision-requests-google-chat-365d.md`) — 577 confirmed decision-requests bypassing existing approval surfaces, **growing quarter-over-quarter**.

---

## 0. The honest framing

This document was triggered by a hand-wave I almost shipped: building a `chat_decision_routing_queue` table to import 247 chat asks. Director's pushback was correct — that solves data retention, not the actual problem.

The real problem is **workflow gravity**. Chat is winning over the modules because, at the moment of asking:

- (a) Chat is lower friction (1 field — the message body — vs. modules' 10–30 fields)
- (b) Chat has higher response confidence ("I know Director sees Chat")
- (c) Modules are invisible at the moment of intent (buried 3 sidebar levels deep)
- (d) Module submission gives weaker feedback to the asker than a chat reply

The 577 chat-bypass asks across 365 days are **leaked output** of missing or mis-designed in-module intake. Importing them into Supabase only retains the leak; it doesn't plug it.

The cross-paradigmatic move (frame-shift, Einstein-style): **stop treating chat as the source of decisions. Treat chat as evidence that intake forms haven't won at the moment of asking.** The fix is to make each module's intake the lower-friction option for the people who currently bypass it.

---

## 1. The empirical case

### 1.1 Evidence (365-day Google Chat scan)

| Metric | Value |
|---|---|
| Audit window | 2025-04-26 → 2026-04-26 (365 days) |
| Confirmed decision-requests in chat | **577** |
| Stale (>7d, no Omm reply) | 335 (58%) |
| Decided in chat | 92 (15%) |
| Delegated by tagging others | 107 (18%) |
| Replied without clear call | 43 (8%) |

### 1.2 Module bucket breakdown (the routing signal)

| Module | Type | 365d Count | Stale fraction | Implication |
|---|---|---:|---:|---|
| **events** | EXISTING ✅ | **81** | ~58% | `/events/propose` exists (PR #455, 9 days old) — **bypass continues despite module presence**. The form isn't winning. |
| **marketing_collateral_approvals** | NEW 🆕 | **59** | ~58% | Largest unbuilt module. 4× growth between 90d and 365d windows = compounding gap. |
| admission_leads | EXISTING ✅ | 40 | ~58% | Existing flow can absorb. |
| billing_invoices | EXISTING ✅ | 31 | — | Existing flow ✓ |
| service_requests | EXISTING ✅ | 28 | — | Existing flow ✓ |
| bug_reports | EXISTING ✅ | 21 | — | Existing flow ✓ |
| **capital_purchase_approvals** | NEW 🆕 | **19** | — | New gap, 6× growth. |
| hr_recruitment_candidates | EXISTING ✅ | 18 | — | Smaller than 90d (52) — better classifier reclassified. |
| hr_leave_applications | EXISTING ✅ | 16 | — | Existing flow ✓ |
| infrastructure / curriculum / contract / travel / research / iqac | NEW 🆕 | 17 combined | — | Long tail. |
| grievances | EXISTING ✅ | 1 | — | Edge case. |
| **unclassified** | GAP ⚠️ | **246** | ~43% stale | Heuristic miss. Need LLM-reclassification pass. |

### 1.3 Trend (the "growing not shrinking" finding)

| Quarter | Chat decision-requests |
|---|---:|
| Q2-2025 (partial) | 100 |
| Q3-2025 | 143 |
| Q4-2025 | 150 |
| Q1-2026 | 138 |
| Q2-2026 (partial) | 46 |

**Direction: GROWING.** 100 → 138 from earliest full quarter to most recent full quarter. The chat-bypass problem doesn't self-correct as more modules ship. Modules ship and chat-bypass continues, because the modules don't change WHERE staff type the next ask.

### 1.4 Top askers (where the pressure originates)

| Sender | 365d Count | Role context |
|---|---:|---|
| Dr. Krishna Veni A | 111 | Cross-college coordination, Principal-level asks |
| Narayan Rao COO JKKN | (volume from 90d) | Recruitment + ops |
| Dr. PERLI KRANTI KUMAR | (volume from 90d) | IQAC compliance |
| Mohanraj V | (volume from 90d) | Bug reports + dev coord |

Director-time pressure clusters from a small number of senders. Any intake redesign should test against THEIR specific patterns, not generic abstractions.

---

## 2. The hypothesis to test

> If a module's intake form lets the asker submit in **<30 seconds** and gives them **the same response confidence as a chat @-mention**, chat-bypass for that module trends to zero within 30 days.

This is falsifiable. We pick ONE module that already exists, redesign the intake to win against chat, then **measure chat-bypass for that module 30 days later**. If chat asks for that bucket trend toward zero, the hypothesis holds and we replicate. If they don't, the design is wrong and we redesign before replicating across the other 6 existing modules.

---

## 3. Why events is the right test case (not recruitment)

I previously proposed `hr_recruitment_candidates` as the first build. The 365-day data overrides:

- **Events bypass volume is 81 vs recruitment's 18** — 4.5× larger signal.
- **`/events/propose` already exists** (PR #455 merged 2026-04-17). The empirical question is: *why isn't it winning?*
- **Recruitment intake exists too**, but the volume is small enough that we can't reliably attribute changes to redesign vs. ambient variation.
- **Events is the cleanest A/B**: same module, before/after redesign, 81 baseline asks to measure trend against.

If redesigning `/events/propose` halves chat-bypass for events in 30 days, the hypothesis is validated and we know what to replicate. If it doesn't, the workflow-gravity hypothesis itself needs revision before we touch the other 6 modules.

---

## 4. Sprint 0 — `/events/propose` audit (next session, ~30 min, no code changes)

### 4.1 Audit checklist

For each criterion below, score the current `/events/propose` form against the 81 chat asks:

- [ ] **Field count**: How many fields does the form ask for vs. the median chat ask provides? Each unnecessary field = friction.
- [ ] **Mobile-first**: Does the form work in <30 seconds on a phone? (Most chat asks come from phones.)
- [ ] **Time-to-submit median**: Time a real submission with realistic data. <30 sec passes; >60 sec fails.
- [ ] **Director-side notification quality**: Does Director get a push when an event is proposed? Or only sees it via PR #492's daily digest?
- [ ] **Asker-side feedback**: After submit, does the asker see a status timeline (Submitted → Reviewing → Decided) with timestamps? Can they re-find their submission later?
- [ ] **Discoverability**: How many clicks from `/dashboard` to `/events/propose`? Sidebar? Top-nav? Hidden behind /events?
- [ ] **Pre-fill**: Are sender-derivable fields (institution, role, contact) auto-populated from `auth.uid()`?
- [ ] **Error recovery**: What happens if a required field is missing? Does the form lose state on error?

### 4.2 Audit deliverable

A single markdown doc at `.claude/events-propose-audit.md` answering each checklist item with verbatim findings. Include screenshots of the form on mobile + desktop.

### 4.3 Audit gate

If the form already meets all 8 criteria → the workflow-gravity hypothesis is wrong, OR the form exists but staff don't know about it (discoverability problem, separate spec). Stop and rethink.

If the form fails ≥3 criteria → the form needs Build 1 redesign per Sprint 1 below.

---

## 5. Sprint 1 — `/events/propose` redesign (next session, ~3-4 hours)

### 5.1 Target form spec

**Page**: `/events/propose` (existing route, redesigned content)
**Layout**: single screen, mobile-first, no sidebar/nav at submit time (full-bleed)
**Fields (3 visible, max 5 with progressive disclosure):**

1. **What's the event?** — single text field, 80-char limit, autocompletes against recent event types
2. **When + Where?** — combined date + venue picker, defaults to "next available weekday" + asker's institution
3. **Who's it for?** — multi-select chip picker (Learners / Staff / Parents / External / Mixed)

**Progressive disclosure** (only if asker taps "Add details"):
- Expected attendance (number)
- Budget required (₹ range chips: 0 / <10K / 10K-50K / 50K-1L / >1L)

**Pre-filled from `auth.uid()`:**
- proposer_id, institution_id, sender_role, sender_email, contact_phone

### 5.2 Submission flow

1. Asker taps Submit.
2. Server creates `events.event_proposals` row with `status='submitted'`, `source='form_intake'`.
3. **Push notification to Director immediately** (not waiting for daily digest). Title: "Event proposal: <title> from <asker> at <institution>". Action: open `/events/propose/<id>`.
4. **Asker sees a status page** at `/events/propose/<id>/status` with:
   - Timeline: Submitted → Reviewing → Decision
   - Director's response (when given) shown inline
   - "Add a comment" thread visible
   - Shareable URL the asker can paste back to Chat (replacing the chat-bypass behavior)

### 5.3 Director-side queue surface

- PR #492's existing event generator already surfaces this in Director's queue. **No queue infra changes required.**
- Director can decide via the existing decision-queue card → action_config carries `event_proposal_id` → routes to detail page.

### 5.4 Tests

1. **Time-to-submit**: real submission with phone, real data → must complete in ≤30s.
2. **Director receives push**: verify push notification fires within 60s of submit.
3. **Asker re-finds submission**: navigate away, come back, find the status page within 2 taps.
4. **Status update visibility**: Director marks decided → asker sees status update without refreshing.
5. **Mobile keyboard quirks**: form doesn't lose state when keyboard opens/closes.

### 5.5 Done definition

PR Ready against jicate/main. Browser-verified on iOS Safari + Chrome Android. After merge:

- **Day 0 measurement**: count chat asks classified as `events` in last 7 days (baseline).
- **Day 30 measurement**: count chat asks classified as `events` in days 23–30 post-merge.
- **Verdict**: if Day 30 count is <50% of Day 0, hypothesis validated; replicate to next module. If ≥50%, redesign required before replicating.

---

## 6. Sprint 2+ — Replication plan (sequential, NOT parallel)

If Sprint 1 validates the hypothesis, replicate the SAME fast-intake design to the 6 other existing modules in priority order by 365d chat volume:

| Order | Module | 365d chat asks | Module status |
|---:|---|---:|---|
| 1 | events | 81 | EXISTING — Sprint 1 above |
| 2 | admission_leads | 40 | EXISTING — `/admission/leads/new` redesign |
| 3 | billing_invoices | 31 | EXISTING — `/billing/intake` (may need new route) |
| 4 | service_requests | 28 | EXISTING — `/services/requests/new` audit + redesign |
| 5 | bug_reports | 21 | EXISTING — already has SDK widget; verify discoverability |
| 6 | hr_recruitment_candidates | 18 | EXISTING — `/hr/recruitment/intake` redesign |
| 7 | hr_leave_applications | 16 | EXISTING — `/hr/leave/apply` redesign |

Each replication is its own PR with the same Day 0 / Day 30 measurement protocol. **Do not skip the measurement.** If any module fails the 50% bypass-reduction bar, the redesign is wrong and we stop the replication chain to investigate.

---

## 7. Sprint 3 — New modules (priority by chat evidence)

After existing modules are validated, build the 6 NEW modules in this order:

| Order | Module | 365d asks | Why this priority |
|---:|---|---:|---|
| 1 | marketing_collateral_approvals | 59 | Largest gap. 4× growth. Designer Jicate + Ramesh + comms team. |
| 2 | capital_purchase_approvals | 19 | 6× growth. Inventory + procurement asks. |
| 3 | infrastructure_approvals | 6 | Hostel/lab/classroom repair asks. |
| 4 | curriculum_approvals | 5 | Syllabus + course design asks. |
| 5 | iqac_compliance_approvals | (small in 365d but governance-critical) | NAAC/NIRF/NBA evidence approvals. Subset already in unification program spec. |
| 6 | contract_approvals + travel_approvals + research_approvals | 5 combined | Build as ONE generic `governance_approvals` module with type field, not three separate modules. Long tail doesn't justify separate substrate. |

Each new module follows the same fast-intake design from Sprint 1. Substrate: dedicated table + RLS + intake form + approval flow + generator (mirroring `hr_recruitment_candidates` pattern from PR #187).

---

## 8. The unclassified 246 (LLM-reclassification pass)

The heuristic classifier hit 246 of 577 (43%) as `unclassified`. Sample inspection shows three sub-buckets:

1. **MyJKKN ops issues** (~80 estimated): "I can't login", "Gemini API key needed", "edit permission missing". These belong in `bug_reports` or a new `myjkkn_admin_requests` bucket.
2. **Academic governance one-offs** (~60 estimated): department renames, scholarship approvals, ad-hoc clarifications. Some belong in `iqac_compliance_approvals`, some in a new `academic_governance` bucket.
3. **Mixed-context messages** (~106 estimated): two or more topics in one message; can't classify atomically.

**Recommended approach**: a one-off LLM-classification pass on the 246 messages. Single Claude API call per message with the 18-bucket taxonomy + a `multi_topic` overflow class. Output goes back into the 365d JSON sidecar with a `predicted_module_v2` field. Don't build infra for this — it's a one-time enrichment.

This work is **not gating Sprint 1**. Sprint 1 ships with the heuristic classification; the LLM pass enriches the report later.

---

## 9. What this spec deliberately rejects

| Rejected approach | Why it was wrong |
|---|---|
| `chat_decision_routing_queue` staging table | Treats chat as a legitimate intake source. Legitimizes the bypass instead of fixing it. |
| Adding `'chat_ingest'` to module `source` CHECK constraints | Same as above — pipes informal asks into structured tables without changing where the next ask gets typed. |
| LLM-reclassify FIRST, then build | Inverts priorities. The 81 events asks are clearly events; we don't need LLM to start. Sprint 1 ships against the heuristic data. |
| Build all 7 redesigns in parallel | Untested hypothesis. If the design is wrong, we'd ship 7 wrong forms. Sequential test → validate → replicate. |
| Build the 6 NEW modules first | Existing modules bypass at higher volume (154 asks across 7 vs 109 across 6 NEW). Plus, NEW modules have no baseline to compare; we can't measure bypass-reduction. |
| Build a UI to "triage" the 577 imported asks | Same antipattern as the staging queue. Director shouldn't be doing manual one-by-one triage of historical chat asks; he should be NOT receiving NEW chat asks. |

---

## 10. Open questions (honest, not papered over)

1. **Does the events-redesign hypothesis generalize?** Sprint 1 tests one module. If it works, we have N=1 evidence. Sprint 2 (admission_leads) is the first replication. Two consecutive validates = pattern; one validate + one fail = need to identify what's different. Honest framing: don't claim victory after Sprint 1.

2. **What if discoverability is the binding constraint, not form speed?** If the audit (Sprint 0) shows the form is already 3 fields and 30 seconds but staff still bypass, the problem is "they don't know about /events/propose." That's a sidebar / nav / education problem, NOT a form-redesign problem. The audit gates this fork.

3. **Push notification reliability across roles**: Currently web push works for Director (verified in HR Sprint 6). Verify it works for Principal/Coordinator senders BEFORE Sprint 1 ships, since the asker's confidence in receiving updates is part of the design.

4. **What about asks where the asker IS the person who would have to do the form?** Director sometimes types asks himself in chat ("Krishna Veni, please get this approved by ..."). The intake form pattern doesn't help him — he's not the asker submitting through a form. This is a separate workflow (delegation, not intake) and out of scope here.

5. **The 577 historical asks themselves** — what happens to them? Honest answer: nothing. They stay archived in `.claude/decision-requests-google-chat-365d.md` and `.claude/decision-requests-365d.json`. We do NOT retroactively triage them. The metric that matters is forward-flow, not backlog cleanup.

6. **What's the Day 0 / Day 30 measurement infrastructure?** Currently: rerun the gws-cli scan with a 7-day window post-merge. That's manual. A proper measurement would automate this as a weekly cron writing to a `chat_bypass_metrics` table. Out of scope for Sprint 1; in scope after Sprint 2 validates.

---

## 11. Self-test (the noble-laureate bar)

This spec earns its place ONLY if:

- ✅ It refuses to legitimize the bypass — no `chat_ingest` source, no staging queue
- ✅ It refuses to replicate before testing — Sprint 1 must validate before Sprint 2 starts
- ✅ It declares its hypothesis falsifiably — <50% bypass at Day 30 is the bar
- ✅ It picks the right test case for empirical reasons — events (81 asks, existing module) not recruitment (18, my prior preference)
- ✅ It declares the trend openly — bypass is GROWING, not self-correcting
- ✅ It declares 5+ open questions honestly, not 0
- ✅ It separates discoverability from form-design as distinct hypotheses (audit gates this fork)
- ✅ It does NOT promise solving Director's chat-load — only redirecting NEW asks. The 577 historical stay archived.

If any of these flip back during build, this spec failed to constrain the work. Re-read §0, decide whether to ship anyway.

---

## 12. Implementation handoff for next session

The next-session implementer should:

1. **Read this spec fully** (~30 min).
2. **Read `.claude/decision-requests-google-chat-365d.md`** for the empirical context (~15 min).
3. **Read `decisions-spec.md`** §0 (the "honest framing" pattern that informs this spec).
4. **Run Sprint 0 audit** on `/events/propose` per §4.1 — output `.claude/events-propose-audit.md`.
5. **Decide based on audit**:
   - If form fails ≥3 criteria → proceed to Sprint 1 redesign (~3-4 hours).
   - If form already passes ≥6 criteria → discoverability is the bug, NOT form design. Stop and re-spec.
6. **Sprint 1 build** per §5. PR Ready, do not merge.
7. **After 30 days post-merge**: rerun gws scan with 7-day window, compare to baseline. Validates or invalidates the hypothesis.
8. **If validated**: replicate Sprint 1 to admission_leads next (§6 order).
9. **If invalidated**: write `.claude/sprint-1-failure-analysis.md`, halt replication, re-design.

**Do NOT**:
- Build all 7 modules in parallel.
- Skip the Day 0 / Day 30 measurement.
- Add `'chat_ingest'` to any source CHECK constraint.
- Create a `chat_decision_routing_queue` table.
- Bulk-load the 577 historical asks anywhere.
- Treat Sprint 1 success as proof for Sprint 3 (new modules) — those have no baseline; they need a different validation protocol.

---

## 13. Memory + reference companions

When implementing, check these existing artifacts:

- `.claude/decision-requests-google-chat-365d.md` — full 1,120-line empirical report
- `.claude/decision-requests-365d.json` — 577-row structured dataset
- `/tmp/decision-scan-365d/` — working artifacts (raw per-space JSON dumps, classifier source, sender lookup)
- `specs/decisions-spec.md` — the §0 framing pattern (decision-quality instrument)
- `feedback_build_the_pattern_not_the_instance.md` — noble-laureate principle
- `feedback_read_config_primitives_before_per_file_fixes.md` — read-before-fix rule that informed Section 9
- PR #492 — chat-bypass surfacing layer (what feeds Director's queue when modules ARE used)
- PR #493 — decisions-spec substrate (Director's deliberate-choice portfolio)
- PR #455 — `/events/propose` v1 (the form Sprint 0 will audit)

---

*Drafted 2026-04-26 00:27 IST after Director's "noble-laureate" pushback that surfaced the workflow-gravity reframe. Document earns its place only if Sprint 1 validates the hypothesis empirically. If validated, this spec becomes the canonical workflow-gravity playbook for MyJKKN. If invalidated, this spec is the artifact of a failed hypothesis — and that's fine; failed hypotheses with measurable verdicts are the system working.*
