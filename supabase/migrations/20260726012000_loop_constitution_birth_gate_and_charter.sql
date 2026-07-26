-- =============================================================================
-- LOOP CONSTITUTION — birth-gate + per-loop charter (2026-07-26)
-- =============================================================================
-- Director-adopted constitution wire 1. Doctrine: docs/architecture/loop-constitution.md
-- (same PR). NOT applied at PR time — prod apply is Director-gated.
--
-- Receipts driving this migration:
--   • carre-audit was born 2026-07-25 WITHOUT an owner — the registry held an
--     owner-less loop for a day and convention alone did not object (the exact
--     decay the 07-25 coda predicted: conventions need gates in the steel).
--   • mess self-reported gates a/f/g/m all "on" while its measure leg had never
--     produced a number (mess_meal_ratings = 0 rows; routine last_status
--     literally "generated 16, measured 0"; RateMealDialog mounted nowhere).
--     A registry claim nothing checks is a confident liar one level above the
--     fabricated-metric bug class that loops-regress exists to catch.
--
-- 1) BIRTH-GATE: owner_email NOT NULL + non-empty CHECK. No app/lib code path
--    inserts into loop_registry (verified 2026-07-26: migrations only), so the
--    gate is steel — an owner-less birth now fails loudly at INSERT time.
-- 2) CHARTER (config, not code — one row per loop): the five legs a row must
--    carry before any surface may call it a loop:
--      outcome_metric · baseline_window · intervention · verdict_owner ·
--      remeasure_window
--    RECEIPTS RULE: a leg is written ONLY when it demonstrably runs in
--    production data. Definitions without receipts stay NULL, and any NULL leg
--    relabels the row a METER on the Loop Control Tower — honestly.
-- 3) Backfill: carre-audit gets its owner; the four loops whose legs run today
--    (scf, bug-triage, feeder, induction-session) get charters.
--    Honest starting state: 4 chartered loops, 18 meters.

-- (a) Backfill FIRST so the NOT NULL can land. Only carre-audit is NULL at
--     migration time; the general WHERE keeps the backfill safe if another
--     owner-less row appears between validation and apply.
UPDATE public.loop_registry
   SET owner_email = 'aieee@jkkn.ac.in', updated_at = now()
 WHERE owner_email IS NULL;

-- (b) Birth-gate
ALTER TABLE public.loop_registry
  ALTER COLUMN owner_email SET NOT NULL;
ALTER TABLE public.loop_registry
  ADD CONSTRAINT loop_registry_owner_nonempty CHECK (btrim(owner_email) <> '');

-- (c) Charter legs
ALTER TABLE public.loop_registry
  ADD COLUMN IF NOT EXISTS outcome_metric   text,
  ADD COLUMN IF NOT EXISTS baseline_window  text,
  ADD COLUMN IF NOT EXISTS intervention     text,
  ADD COLUMN IF NOT EXISTS verdict_owner    text,
  ADD COLUMN IF NOT EXISTS remeasure_window text;

COMMENT ON COLUMN public.loop_registry.outcome_metric   IS 'Charter leg 1/5: the number that defines "better". RECEIPTS RULE: written only when the measurement demonstrably runs in prod data; NULL = missing leg = the row is a meter, not a loop.';
COMMENT ON COLUMN public.loop_registry.baseline_window  IS 'Charter leg 2/5: the loop''s OWN pre-intervention baseline window (never a cross-population comparison).';
COMMENT ON COLUMN public.loop_registry.intervention     IS 'Charter leg 3/5: the action the loop takes on the world.';
COMMENT ON COLUMN public.loop_registry.verdict_owner    IS 'Charter leg 4/5: the human who owns the better/worse verdict. Loops never grade themselves.';
COMMENT ON COLUMN public.loop_registry.remeasure_window IS 'Charter leg 5/5: when the outcome is re-measured after the intervention.';

-- (d) Charter seeds — receipts cited inline. Every other row stays NULL = meter.
-- scf: ~4 slots measured (counter_metric receipt, 07-25); regress-verified weekly.
UPDATE public.loop_registry SET
  outcome_metric   = 'session_feedback avg rating delta vs the faculty''s own pre-suggestion baseline (rating lift; ~4 slots measured as of 2026-07-25; known-delta regress-verified weekly)',
  baseline_window  = 'same course + faculty sessions before the suggestion issued',
  intervention     = 'AI teaching suggestion issued to the faculty member (scf-generate-suggestions)',
  verdict_owner    = 'aieee@jkkn.ac.in',
  remeasure_window = 'post-suggestion sessions; confound check due at 10 measured',
  updated_at = now()
WHERE loop_key = 'scf';

-- bug-triage: outcome ledger live (reporter thumbs on resolution emails).
UPDATE public.loop_registry SET
  outcome_metric   = 'reporter thumbs up/down on resolution emails (outcome ledger)',
  baseline_window  = 'open state of the bug cluster before the fix PR',
  intervention     = 'clustered auto-fix PR (bug-cluster-scan routine + max-lane fixer)',
  verdict_owner    = 'aieee@jkkn.ac.in',
  remeasure_window = 'reporter response window after the resolution email',
  updated_at = now()
WHERE loop_key = 'bug-triage';

-- feeder: cycle_delta measurer known-delta regress-verified (LOOP_FNS since 2026-07-13).
UPDATE public.loop_registry SET
  outcome_metric   = 'cycle_delta per engagement cycle (known-delta regress-verified weekly since 2026-07-13)',
  baseline_window  = 'prior engagement cycle',
  intervention     = 'feeder-school engagement actions from the loop''s recommendations',
  verdict_owner    = 'aieee@jkkn.ac.in',
  remeasure_window = 'next engagement cycle',
  updated_at = now()
WHERE loop_key = 'feeder';

-- induction-session: batch-B rating measured against a regression-to-the-mean
-- baseline (induction-session-effectiveness routine, live and firing).
UPDATE public.loop_registry SET
  outcome_metric   = 'batch-B session rating vs a regression-to-the-mean baseline (only real lift counts)',
  baseline_window  = 'batch-A rating distribution for the same topic',
  intervention     = 'AI tip to the batch-B facilitator (induction-session-effectiveness)',
  verdict_owner    = 'aieee@jkkn.ac.in',
  remeasure_window = 'batch-B run of the same topic',
  updated_at = now()
WHERE loop_key = 'induction-session';
