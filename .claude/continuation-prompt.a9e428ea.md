━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CONTINUATION BRIEF (from /cnext at 2026-05-07 00:36 IST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK: Verify, sequence, and merge the 14-PR AI Pulse stack drafted overnight.
The user's explicit Q1 answer to /cnext was "ALL three" — meaning do all of:
(1) verify+merge stack, (2) fix substrate concerns surfaced by agents, AND
(3) run a falsifiable test before any substrate merges.

PROJECT: /Users/omm/PROJECTS/MyJKKN (Jicate-Solutions/MyJKKN on GitHub)
DATABASE: Supabase project ref kvizhngldtiuufknvehv (production). MCP connected.
SPEC: /Users/omm/PROJECTS/MyJKKN/specs/myjkkn-ai-pulse-spec.md (v3 on main, PR #641 merged)

CURRENT STATE (as of session-end 2026-05-07 00:36 IST):

14 AI Pulse PRs in flight, ~10,646 LOC total. None ready to merge yet:

  | #   | Title                                          | LOC   | State           |
  |-----|------------------------------------------------|-------|-----------------|
  | 644 | wave-a1(v3) substrate migration               | 193   | Draft           |
  | 715 | wave-a1.1 RLS hardening (stacked on #644)     | 156   | Draft           |
  | 716 | 22 AI Pulse permission keys                    | 43    | Open / Ready    |
  | 717 | Wave B.6 Policy Admin UI                       | 402   | Draft           |
  | 718 | Wave A.2 cycle-generation cron                 | 243   | Draft           |
  | 728 | Glue (sidebar + redirects + cron schedule)     | 172   | Open / Ready    |
  | 729 | Wave B.1 Learner My Pulse                      | 839   | Draft           |
  | 730 | Wave B.5 Anomaly Review                        | 661   | Draft           |
  | 731 | Wave A.3 Director digest extension SQL         | 500   | Draft           |
  | 732 | Champion Console (cycle management)            | 1,541 | Draft           |
  | 733 | Wave B.3 Section Rotation                      | 1,349 | Draft           |
  | 739 | Wave B.2 Live Session UI + Meet webhook        | 1,798 | Draft           |
  | 740 | Wave B.7 Quiz Authoring Console                | 1,605 | Draft           |
  | 741 | NAAC Evidence Export                           | 1,144 | Draft           |

Wave A.0 — fully closed:
  ✅ Champion = Krishnaveni (locked 2026-04-29)
  ✅ Co-Champion = Ranjith (Ranjith@jkkn.ac.in, locked 2026-05-02)
  ✅ Section-attendance role = REUSE class_incharges (locked 2026-05-02)
  ✅ Events table choice = startup_events with config.kind='ai_pulse' (locked 2026-05-02)

Outcome metric Q0 LOCKED: engaged_attendance_rate ≥95% across 44 depts × 12 cycles
by day-90; kill_criterion = archive substrate if <70% at day-90.

WHAT NEEDS TO HAPPEN NEXT SESSION (in this order):

PHASE 1 — Substrate concerns (resolve BEFORE any merge):

  Concern A: event_team_attendance is team-grained, not per-learner.
            Agent B.3 (#733) had to store per-learner status in
            engagement_signals.per_member JSONB array. Decide: is that
            acceptable, or does the table shape need fixing?

  Concern B: event_team_attendance.venue_assignment_id is NOT NULL.
            AI Pulse cycles have no physical venue. Migration #644 will
            FAIL on first insert until either NOT NULL is dropped or a
            sentinel "virtual venue" row is seeded.

  Concern C: ai_pulse_polls / ai_pulse_quizzes tables don't exist.
            Agents B.2 (#739) and B.7 (#740) reference them with
            graceful degradation. Decide: ship more substrate tables
            for polls/quizzes OR commit to JSONB-on-startup_events.config
            permanently.

  Action: review #644 in detail. If A/B/C surface as real bugs when
  applying to Supabase branch DB, draft small follow-up substrate PR(s)
  on wave-a1/ai-pulse-events-extension branch. Apply migration via
  Supabase MCP to verify.

PHASE 2 — Falsifiable test (per May-1 standing rule, user Q1 #3):

  Pick ONE representative class (e.g., one engineering section ~25
  learners) for the upcoming Thursday May 14, 2026, 6:55 PM. Run all
  5 phases on Google Sheets only — NO MyJKKN code:
    - Briefing attendance roster
    - Domain-Sync submission tracker
    - Lab presentation scoring
    - Gold Standard selection
    - Publication tracking

  Measure baseline engaged-attendance rate after 4 cycles. Verdict
  trigger:
    - <50% engaged → KILL program before any code merges
    - 50–70% → revise architecture before scaling
    - ≥70% → green-light substrate, proceed to PHASE 3

PHASE 3 — Sequenced merge (only if PHASE 1 + PHASE 2 pass):

  Merge order:
    1. #716 (permission keys, build-skipped, Ready)
    2. #728 (glue, build-skipped, Ready)
    3. #644 (substrate after concerns A/B/C resolved)
    4. #715 (RLS, auto-rebases off #644)
    5. #717 (Policy Admin UI, build-required)
    6. #718 (cycle cron, build-required)
    7. #731 (Director digest SQL, build-skipped)
    8. #729, #730, #732, #733 (Wave B UI surfaces, build-required each)
    9. #739, #740, #741 (later Wave B + NAAC, build-required)

  For each Draft PR before flipping Ready:
    - Pull branch into main repo (NOT /tmp/agent-* worktree — those
      lack node_modules and produce false-positive TS errors)
    - npm install if needed
    - npx tsc --noEmit
    - npm run build (for UI/route PRs per build-depth-gate)
    - browse-test localhost via scripts/local-auth.sh (for UI PRs)
    - flip Draft → Ready in dependency order

KEY FILES TO READ FIRST (per user Q3 "all the above"):

  1. specs/myjkkn-ai-pulse-spec.md (v3 events-extension, on main) —
     end-to-end before any merge work
  2. All 14 PR bodies on Jicate-Solutions/MyJKKN — each documents its
     stack dependencies + test plan. Easiest filter:
     https://github.com/Jicate-Solutions/MyJKKN/pulls?q=is%3Apr+ai-pulse
  3. Apply #644 migration to a Supabase branch DB FIRST as empirical
     verification — concerns A/B/C surface as real errors not
     hypotheticals.

CONSTRAINTS & RULES:

  - PRs are NOT ready to merge — user explicitly stated this twice.
  - Falsifiable test must run before any substrate merges (May-1 rule
    + user explicit Q1).
  - Each Wave B PR must be re-typecheckchecked from the canonical repo
    path, NOT from the agent's /tmp worktree (where missing node_modules
    produces false TS errors).
  - Champion = Krishnaveni; Co-Champion = Ranjith. Default host_user_id
    seed for any new ai_pulse cycles in startup_events.config.host_user_id.
  - Class Incharge attendance marking REUSES existing class_incharges
    table — do NOT introduce a new "class_rep" role.

DO NOT:

  - Merge any Draft PR without verifying its branch compiles in the main
    repo (not /tmp/agent-* worktrees).
  - Skip the falsifiable test if Director's intent was to run it (Q1
    answer was "all three" including this).
  - Touch /academic/* routes or existing HR / events module files
    outside the AI Pulse module's owned paths.
  - Drop the spec or close any of the 14 PRs without explicit Director
    direction (user Q2 answer was "keep all 14 in flight").

VERIFY BY:

  - Substrate verified: `\dt ai_pulse_*` returns 3 tables on Supabase
    branch DB; 22 policy rows + 9 featured_tools rows seed cleanly;
    event_team_attendance.day_type CHECK accepts 'live_session' and
    'async_makeup'; engagement_signals JSONB column exists with default '{}'
  - Falsifiable test green: ≥70% engaged-attendance after 4 manual
    cycles (Apr 14 → May 5)
  - Each Wave B PR's branch compiles cleanly via `npx tsc --noEmit`
    when checked out into main repo

OPEN QUESTIONS FOR TOMORROW:

  1. Are concerns A + B + C substrate-PR-fixable OR spec-amendment-required?
  2. Should #739 and #740 ship despite referencing non-existent
     ai_pulse_polls / ai_pulse_quizzes tables (degrade gracefully)?
  3. Will Director actually run the Sheets-baseline falsifiable test,
     or is it ceremonial? (Q1 answer suggests yes, but Tuesday-Thursday
     gap is 7 days minimum.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☝️  Auto-loaded from: continuation-prompt.a9e428ea.md (per-pane scoped)
    Reply 'go' to execute, or redirect to a different task.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
