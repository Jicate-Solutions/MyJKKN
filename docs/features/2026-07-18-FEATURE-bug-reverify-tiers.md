# AI Bug Re-Verification — Tier 2 & Tier 3 Spec

**Status:** Tier 2 = building (this PR). Tier 3 = design outline only.
**Date:** 2026-07-18
**Module:** `/admin/bug-reports` (Groups tab + bug detail)
**Depends on:** the duplicate-cluster machinery (#2136/#2140) and the `bug.triage` AI lane (#2137).

---

## Problem

The Groups tab clusters near-identical open bug reports (e.g. 27× "unable to mark attendance", 20× "please enable the feedback section"). Today a human must manually decide whether the underlying issue is *actually fixed* before confirming + resolving a cluster — and resolving emails **every** reporter. We want the AI to help answer "is this fixed now?" **by checking the same behaviour from the reporter's point of view**, not by guessing from the text.

## The non-negotiable safety rule (applies to every tier)

**The AI produces a RECOMMENDATION, never an action.** A verdict of `likely_fixed` surfaces a suggestion on the group; a human still clicks Confirm/Resolve. No tier is ever allowed to auto-resolve a bug or email a reporter on an AI verdict alone. Rationale: resolving a cluster tells N real learners "your issue is handled" — a false positive damages trust at scale. We measure the AI's hit-rate against human decisions before trusting it further.

## The core trap this design defends against

**"Works for me" false positives.** Bugs like "unable to mark attendance for third-year PharmD" are data-, role-, and time-specific (a section, a subject, an assignment, a date). Reproducing a *generic* success proves nothing about *this reporter's* slice. Two defenses run through the whole design:
1. **Impersonate the actual reporter** (`reporter_user_id`, present on 99.8% of open bugs) so every check runs at the reporter's real RLS scope — not an admin's, not a random user's.
2. **Reads only, never writes.** Re-checking a "not showing" symptom is a safe read. Re-checking a "can't submit" symptom would be a write and must never be executed against production data — those are `inconclusive` in Tier 2 and only reproducible in Tier 3 under a dry-run/rollback.

---

## Tier 2 — Impersonated read re-check (this PR)

### What it does
For one bug (or a cluster's seed bug), gather evidence **as the reporter** that the reported symptom is or isn't still present, then have the AI judge `likely_fixed | still_broken | inconclusive` with a confidence and its reasoning. Surfaces as a "Re-verify" action + verdict card on the bug detail and the Groups tab.

### Architecture (mirrors the proven `bug.triage` path)

```
POST /api/bug-reports/[id]/ai-reverify
  1. admin gate (super_admin | administrator | ceo)         ← same as ai-triage
  2. load bug: description, page_url, module_name, category,
       console_logs, reporter_user_id, institution_id, created_at, status
  3. GATHER EVIDENCE (route-side, deterministic — NO AI decisions):
       a. reporter reachability  — createImpersonatedClient(reporter_user_id):
            can the reporter still resolve their role/permission for this
            module, and read the module's primary surface under RLS?
            (catches permission/scope regressions = a large share of
             "I can't see / can't access X" bugs)
       b. error-signature recurrence — has the console error captured on this
            report reappeared on ANY report filed after created_at?
       c. symptom recurrence — count NEW reports in the same cluster (or same
            keyword shape) filed after created_at (still arriving = not fixed)
       d. data-presence probe (bounded, allowlisted) — IF page_url matches a
            registered ReverifyProbe, re-run that specific read AS THE REPORTER
            and record whether the expected entity now appears. Unmapped pages
            skip this with evidence = "no probe registered for this surface".
       → assemble an EVIDENCE BUNDLE (all fields fenced as untrusted data)
  4. enqueue `bug.reverify` (fn_ai_enqueue_system, dedupe `bug-reverify:<id>`)
  5. long-poll the job (reuse ai-triage's poll + orphan-recovery verbatim)
  6. persist verdict to bug_reports.metadata.ai_reverify
  7. return the verdict
```

### The `bug.reverify` recipe (registry row, `interactive=false`, `tool_set=none`, lane=max)
The AI **only judges** the evidence the route gathered — it does not pick actions or call tools (tool_set=none, same safety posture as bug.triage). Strict-JSON output:

```json
{"verdict":"likely_fixed|still_broken|inconclusive",
 "confidence":"low|medium|high",
 "reasoning":"<2-3 plain-English sentences citing the evidence>",
 "what_would_confirm":"<the one check a human should do to be sure>",
 "reproducible":"read|write|unknown"}
```

### The probe registry (`lib/bug-reports/reverify/probes.ts`)
Each probe is `{ id, match(bug), extract(bug), run(reporterClient, params), describe(observed) }`. v1 ships:
- **`reporter-scope`** (generic, always runs): re-evaluates the reporter's role + institution scope + a bounded read of the module's primary table under their RLS. Catches "I lost access" regressions.
- **ONE concrete data-presence probe** proven end-to-end on a real read bug (target: BUG-005009, "learner not appearing in Semester Search" — page_url carries institution/degree/department/program/semester ids; the probe re-runs the semester-search read as the reporter and checks whether the named learner now appears).

Adding a probe = one file entry. Unmapped surfaces degrade gracefully to reachability + recurrence evidence (never a false "fixed").

### Why `interactive=false`
Per the 2026-07-18 runner fix: `interactive=true` job types are only claimable by the chat drain, which refuses non-chat jobs. All new `bug.*` recipes run on the batch drain → `interactive=false`. (See `feedback_interactive_job_type_only_served_by_chat_drain`.)

### Persistence & UI
- `bug_reports.metadata.ai_reverify = { verdict, confidence, reasoning, what_would_confirm, reproducible, evidence_summary, generated_at, job_id }` (mirrors `ai_triage`).
- Bug detail: a "Re-verify (read-check)" button + a verdict card (green likely_fixed / amber inconclusive / red still_broken) showing the reasoning and the one human-confirm step.
- Groups tab: a "Re-verify group" action on a cluster runs the **seed** bug; the badge shows the verdict so a human can decide whether to Confirm+Resolve. **Never auto-resolves.**

### Explicit non-goals for Tier 2
- No write reproduction (attendance-marking, form-submit bugs → `inconclusive`, `reproducible:"write"`).
- No auto-resolve / no emails.
- No general "AI picks any RPC" — probes are an allowlist.

---

## Tier 3 — Full agentic UI re-drive (design outline, NOT built)

### What it would add
Reproduce **write** and multi-step symptoms by driving the actual UI as the impersonated reporter, then verdicting — the literal "check the same behaviour from the user's POV" for flows Tier 2 can't safely touch.

### Why it's hard (and gated behind Tier 2 proving out)
1. **Repro-step inference.** Reports are vague one-liners; the agent must infer the exact steps (which class, which date, which button). Low-confidence inference → confident-wrong verdicts.
2. **Write side-effects.** "Mark attendance" writes real records. Requires either a **dry-run** path (validate without commit) per flow, a **transaction rollback** harness, or a **staging clone** — none universal today.
3. **Pass/fail detection.** Deciding "did it work?" from a rendered UI is itself error-prone (partial loads, async, look-alike states — cf. the mid-hydration-reads-zeros lesson).

### Sketch
```
bug.reverify.deep (agentic recipe, tool_set = curated browser+dry-run tools)
  → persona-harness/impersonate mints the reporter session (scripts/persona-harness)
  → agent drives the inferred flow inside a rollback boundary (BEGIN..ROLLBACK
     for DB-write flows; no external side-effects; no email/notification tools)
  → captures step evidence + final state
  → verdict with MANDATORY human-confirm; auto-resolve remains prohibited
```

### Preconditions before building Tier 3
- Tier 2 hit-rate measured against human decisions on ≥50 verdicts (is the AI trustworthy?).
- A per-flow dry-run/rollback contract for the top write-bug shapes (attendance, feedback submit, billing).
- A confidence floor below which Tier 3 refuses to verdict (returns `inconclusive`).

---

## Rollout
1. Tier 2 v1 (this PR): recipe + route + evidence lib + probe registry (reporter-scope + one data-presence probe) + UI, proven on a real read bug. Dark-ish: the button is admin-only; no auto-anything.
2. Tier 2 v1.1: add probes for the top read-bug surfaces (attendance-visibility, billing-list, learner-list) one at a time.
3. Measure: log verdict-vs-human-decision to build the hit-rate needed to justify Tier 3.
