-- =====================================================================
-- Loop Control Tower: bug-triage earns gates m + f and graduates
-- intake -> self_improving — on measured evidence (2026-07-18).
-- Hand-written by design: nothing auto-registers or auto-flips in the
-- tower; this migration IS the human act, taken on the evidence below.
--
-- Gate m (measure) — earned by loop increment #2, a REAL reporter answer:
--   the reporter of BUG-003881 (cluster fb6eacfe) answered the in-app
--   "is this fixed for you?" with 👍 at 2026-07-18 17:23Z. The outcome
--   ledger auto-filled reporter_confirmed='positive' via
--   fn_bug_fix_outcome_record (D5: >=1 answer, zero 👎). Never an AI
--   verdict — the AI re-check tally is stored separately and does not
--   feed this field.
--
-- Gate f (feed-forward) — earned by loop increment #3, behavioral
--   2-cycle ON THE REAL OUTCOME: bug-cluster-fix.mjs --print-prompt for
--   the same code area now injects "REPORTERS CONFIRMED FIXED (1x 👍)
--   ... Prefer the same pattern" built from that measured row.
--   Falsification (rolled-back txn, ledger untouched):
--   fn_bug_fix_outcomes_match('hooks/staff/use-staff.ts') -> 1 row;
--   row hidden by in-txn delete -> 0 rows; unrelated category -> 0 rows.
--   The next fix's inputs change BECAUSE the outcome was measured.
--
-- Class intake -> self_improving: both gates earned + falsification
--   passed, per docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md
--   (gate map: #2 earns m, #3 earns f, both + 2-cycle graduate the class).
-- =====================================================================

UPDATE public.loop_registry
SET gates      = gates || '{"m":"on","f":"on"}'::jsonb,
    loop_class = 'self_improving',
    description = 'Users report bugs -> nightly trigram scan clusters the open backlog into duplicate groups -> admin one-click confirm parks members under a canonical bug -> AI diagnoses, fixes, and re-checks on the zero-cost Max lane -> resolving the canonical cascades resolution + emails every reporter. Measure = reporter thumbs-up/down ground truth in bug_fix_outcomes (never AI verdicts). Feed-forward = the fix runner retrieves measured outcomes for its code area and adapts its next fix. Humans permanently own merge+deploy, send-to-reporters, and resolve.',
    updated_at  = now()
WHERE loop_key = 'bug-triage';
