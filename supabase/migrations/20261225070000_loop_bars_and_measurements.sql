-- ============================================================================
-- 20261225070000_loop_bars_and_measurements.sql
-- ----------------------------------------------------------------------------
-- EVERY LOOP CARRIES ONE CONCRETE BAR (Director rulings 2026-09-16, Gauntlet-
-- Loop borrowings G3).
--
-- The rule, in his words: every operational loop's verdict is judged against
-- ONE concrete bar. The MACHINE proposes that bar per loop; the Director
-- approves it by tap. A loop that misses its bar FOUR runs in a row does not
-- go silently red and does not auto-pause — it raises "bar may be wrong" as a
-- Director decision, because after four misses the bar is as likely to be the
-- broken thing as the loop.
--
-- WHY IT REUSES WHAT IS ALREADY HERE (production sweep, 2026-09-17):
--   * loop_charter_proposals (20260825030000) is already the house
--     machine-proposes-human-decides surface for loops, already has the
--     honest-abstention status 'insufficient' (20260927030000), and already
--     has a UI at /admin/loops/charters. A bar proposal is the same shape as
--     a charter proposal, so it becomes a `kind` on that table — NOT a
--     parallel proposals mechanism.
--   * loop_registry (20260710233000) already carries the charter legs
--     outcome_metric / counter_metric / baseline_window / remeasure_window;
--     the bar is derived FROM those legs, so it lives on the same row.
--   * loop_measurements is genuinely new: the per-loop measurement tables
--     (consultant_conversion_measurements, counselor_briefing_effects,
--     attendance_intervention_effects, ops_cycletime_measurements,
--     ss_kpi_measurements) each hold a DIFFERENT domain shape. None of them
--     can answer "did this loop clear its bar this run?" in one place. This
--     table holds exactly that one sentence per run, and nothing else.
--
-- WHAT DOES *NOT* HAPPEN HERE:
--   * No loop_registry rows are seeded or edited by this file (owner_email is
--     NOT NULL on production; seeding registry rows is another lane's job).
--   * Nothing auto-pauses, auto-alerts or auto-notifies. A missed bar writes a
--     row; a fourth consecutive miss writes ONE proposal a human decides.
--   * A bar is never set by the machine. fn_loop_bar_proposals_generate only
--     PROPOSES; only fn_loop_bar_decide (super-admin-asserted) writes
--     loop_registry.bar.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file, so a BEGIN..ROLLBACK rehearsal stays a
--    rehearsal (ref feedback_inner_commit_defeats_your_rollback_wrapper).
-- ============================================================================

-- ── 1. loop_registry: the bar the loop is judged against ────────────────────
-- ADD COLUMN only — no existing column is touched, no row is rewritten.
-- bar_miss_streak defaults to 0 so the 42 live loops start the counter clean.

ALTER TABLE public.loop_registry
  ADD COLUMN IF NOT EXISTS bar             text,
  ADD COLUMN IF NOT EXISTS bar_kind        text,
  ADD COLUMN IF NOT EXISTS bar_set_at      timestamptz,
  ADD COLUMN IF NOT EXISTS bar_set_by      text,
  ADD COLUMN IF NOT EXISTS bar_miss_streak integer NOT NULL DEFAULT 0;

-- NULL stays legal (a loop with no approved bar yet). A CHECK is not violated
-- by NULL in Postgres, but spell it out so the intent survives a later reader.
ALTER TABLE public.loop_registry
  DROP CONSTRAINT IF EXISTS loop_registry_bar_kind_chk;
ALTER TABLE public.loop_registry
  ADD CONSTRAINT loop_registry_bar_kind_chk
  CHECK (bar_kind IS NULL OR bar_kind IN ('comparison','threshold','reference'));

COMMENT ON COLUMN public.loop_registry.bar IS
  'The ONE concrete bar this loop''s verdict is judged against, in the Director''s own words (e.g. "named-lead forward-move rate vs own trailing 8 weeks"). Machine-proposed via fn_loop_bar_proposals_generate, written ONLY by fn_loop_bar_decide on a super-admin approval. NULL = no bar approved yet; measurements still record, with met NULL.';
COMMENT ON COLUMN public.loop_registry.bar_kind IS
  'comparison = this loop against its own past · threshold = against a fixed number · reference = against an outside benchmark. Shapes how the bar is read, never how it is enforced.';
COMMENT ON COLUMN public.loop_registry.bar_miss_streak IS
  'Consecutive FINAL measurements with met=false. met=true resets it to 0; met=NULL (no numeric bar to compare against) leaves it untouched — neither a hit nor a miss. Reaching 4 raises ONE kind=''bar-review'' proposal ("the bar may be wrong"); it never pauses the loop and never alerts anyone.';

-- ── 2. loop_charter_proposals: one table, three kinds of proposal ───────────

ALTER TABLE public.loop_charter_proposals
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'charter';

ALTER TABLE public.loop_charter_proposals
  DROP CONSTRAINT IF EXISTS loop_charter_proposals_kind_chk;
ALTER TABLE public.loop_charter_proposals
  ADD CONSTRAINT loop_charter_proposals_kind_chk
  CHECK (kind IN ('charter','bar','bar-review'));

COMMENT ON COLUMN public.loop_charter_proposals.kind IS
  'charter = the 5 charter legs (the original MetaLoop draft; every pre-existing row) · bar = a proposed bar for a loop that has none · bar-review = "this loop missed its bar 4 runs in a row, the bar may be wrong". All three are decided by a human; charter goes through fn_loop_apply_charter_proposal, the two bar kinds through fn_loop_bar_decide.';

-- The one-undecided-proposal-per-loop rule must now hold PER KIND: a loop with
-- a charter draft awaiting signature must still be able to raise a bar
-- proposal, and vice versa. Widening (loop_key) → (loop_key, kind) cannot
-- reject any row the old index accepted: every pre-existing row is
-- kind='charter', so for them the new index is the old index.
DROP INDEX IF EXISTS public.loop_charter_proposals_one_proposed_idx;
CREATE UNIQUE INDEX IF NOT EXISTS loop_charter_proposals_one_proposed_per_kind_idx
  ON public.loop_charter_proposals (loop_key, kind)
  WHERE status = 'proposed';

CREATE INDEX IF NOT EXISTS idx_loop_charter_proposals_kind_status
  ON public.loop_charter_proposals (kind, status, created_at DESC);

-- ── 3. loop_measurements: one row per loop run, judged against its bar ──────

CREATE TABLE IF NOT EXISTS public.loop_measurements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_key    text NOT NULL REFERENCES public.loop_registry(loop_key) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  value       numeric,
  bar_value   numeric,
  met         boolean,
  gap         text,
  run_id      text,
  status      text NOT NULL DEFAULT 'final',
  CONSTRAINT loop_measurements_status_chk CHECK (status IN ('in_progress','final'))
);

CREATE INDEX IF NOT EXISTS idx_loop_measurements_key_time
  ON public.loop_measurements (loop_key, measured_at DESC);

COMMENT ON TABLE public.loop_measurements IS
  'One row per loop run: the loop''s headline number, the bar it was judged against, and whether it cleared. The per-loop measurement tables (consultant_conversion_measurements, counselor_briefing_effects, attendance_intervention_effects, …) keep their domain detail; this table answers only "did this loop clear its bar this run?", in one place, for all loops. Written ONLY by fn_loop_record_measurement.';
COMMENT ON COLUMN public.loop_measurements.met IS
  'true = cleared the bar · false = missed it · NULL = not comparable (no approved bar yet, or the bar is prose rather than a number). NULL is the honest state and is NEVER counted as a miss — see gap for the reason.';
COMMENT ON COLUMN public.loop_measurements.gap IS
  'Plain-English distance from the bar, or the reason there is no verdict (e.g. "no numeric bar yet").';
COMMENT ON COLUMN public.loop_measurements.status IS
  'final = a settled measurement (the only kind fn_loop_record_measurement writes today) · in_progress = a partial reading a longer measurement may refresh. Only FINAL rows move bar_miss_streak.';

-- RLS mirrors loop_audits' LIVE policy exactly (20260710233000 as rewrapped by
-- rls_initplan_wrap_sweep.sql): super/admin SELECT only, no INSERT/UPDATE/
-- DELETE policy at all — writes come from service_role (which bypasses RLS) or
-- from the SECURITY DEFINER fn below, never from a browser client.
ALTER TABLE public.loop_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loop_measurements_select_admin ON public.loop_measurements;
CREATE POLICY loop_measurements_select_admin ON public.loop_measurements
  FOR SELECT TO authenticated
  USING ((select is_super_admin()) OR (select is_admin()));

-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on every new table to anon AND
-- authenticated. Name both explicitly, then hand back SELECT only — so the
-- grant surface says what the policies mean: reads for admins, writes for
-- nobody but service_role.
REVOKE ALL ON public.loop_measurements FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.loop_measurements TO authenticated;

-- ── 4. fn_loop_record_measurement — the only writer of loop_measurements ────
-- Called by each loop's own run (service_role) after it computes its headline
-- number. Records the row, then moves the miss streak:
--   met = true  → streak 0
--   met = false → streak + 1; at exactly 4 it raises ONE 'bar-review'
--   met = NULL  → streak untouched (Director, 2026-09-17: neither hit nor miss)

CREATE OR REPLACE FUNCTION public.fn_loop_record_measurement(
  p_loop_key  text,
  p_value     numeric DEFAULT NULL,
  p_bar_value numeric DEFAULT NULL,
  p_met       boolean DEFAULT NULL,
  p_gap       text    DEFAULT NULL,
  p_run_id    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_reg          public.loop_registry%ROWTYPE;
  v_measurement  uuid;
  v_streak       integer;
  v_raised       boolean := false;
  v_last4        jsonb;
BEGIN
  -- service_role (auth.uid() IS NULL) or a super admin. Everyone else is
  -- refused loudly — never a silent no-op (rule #27).
  IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- FOUND-safe existence check on a whole-row variable: `SELECT col, true INTO
  -- a, b` nulls BOTH on no-row, so an `IF NOT b` sentinel never fires
  -- (ref feedback_null_sentinels_and_cross_statement_state). FOUND is the
  -- only honest reading.
  SELECT * INTO v_reg FROM public.loop_registry WHERE loop_key = p_loop_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no loop_registry row for loop_key %', p_loop_key;
  END IF;

  INSERT INTO public.loop_measurements (loop_key, value, bar_value, met, gap, run_id, status)
  VALUES (p_loop_key, p_value, p_bar_value, p_met, p_gap, p_run_id, 'final')
  RETURNING id INTO v_measurement;

  v_streak := COALESCE(v_reg.bar_miss_streak, 0);

  IF p_met IS TRUE THEN
    v_streak := 0;
  ELSIF p_met IS FALSE THEN
    v_streak := v_streak + 1;
  END IF;
  -- p_met IS NULL: v_streak is carried over untouched.

  IF v_streak IS DISTINCT FROM COALESCE(v_reg.bar_miss_streak, 0) THEN
    UPDATE public.loop_registry
       SET bar_miss_streak = v_streak,
           updated_at      = now()
     WHERE loop_key = p_loop_key;
  END IF;

  -- REACHES 4 — exactly, not "4 or more": the proposal is raised once, and the
  -- streak keeps climbing behind it until a human decides. The idempotency
  -- guard below makes a re-entry harmless either way.
  IF p_met IS FALSE AND v_streak = 4 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.loop_charter_proposals
       WHERE loop_key = p_loop_key AND kind = 'bar-review' AND status = 'proposed'
    ) THEN
      -- The four MISSES the card is about, newest first. Runs recorded with
      -- met=NULL are not misses and would only be noise on a card headed
      -- "missed its bar 4 runs in a row".
      SELECT jsonb_agg(t.value ORDER BY t.measured_at DESC)
        INTO v_last4
        FROM (
          SELECT m.value, m.measured_at
            FROM public.loop_measurements m
           WHERE m.loop_key = p_loop_key AND m.status = 'final' AND m.met IS FALSE
           ORDER BY m.measured_at DESC
           LIMIT 4
        ) t;

      INSERT INTO public.loop_charter_proposals (loop_key, kind, proposed, rationale, status)
      VALUES (
        p_loop_key,
        'bar-review',
        jsonb_build_object(
          'current_bar',    v_reg.bar,
          'last_4_values',  COALESCE(v_last4, '[]'::jsonb)
        ),
        'missed its bar 4 runs in a row — the bar may be wrong; re-set or confirm it',
        'proposed'
      );
      v_raised := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'measurement_id',    v_measurement,
    'bar_miss_streak',   v_streak,
    'bar_review_raised', v_raised
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_loop_record_measurement(text, numeric, numeric, boolean, text, text) IS
  'Record one FINAL loop measurement and move the loop''s miss streak: met=true resets it to 0, met=false increments it, met=NULL leaves it alone (not comparable is neither a hit nor a miss). Reaching a streak of 4 raises ONE kind=''bar-review'' loop_charter_proposals row ("the bar may be wrong") — idempotent while one is already proposed. Never pauses a loop, never notifies anyone. service_role or super-admin only.';

REVOKE EXECUTE ON FUNCTION public.fn_loop_record_measurement(text, numeric, numeric, boolean, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_record_measurement(text, numeric, numeric, boolean, text, text) TO authenticated;

-- ── 5. fn_loop_bar_proposals_generate — the machine proposes, once per loop ──
-- For every ACTIVE loop with no bar and no open bar proposal:
--   outcome_metric AND baseline_window → a comparison bar (the loop against
--     its own past — the shape the charter already describes)
--   else counter_metric               → a threshold bar on the safety gauge
--   else                              → an 'insufficient' row saying so, in
--     the open. Exactly the MetaLoop's honest-abstention shape: the reason a
--     loop cannot be barred is a human's next action, not a silent skip.
-- An 'insufficient' bar row is written ONCE per loop (Director, 2026-09-17) —
-- it is a standing note, not a daily re-write.

CREATE OR REPLACE FUNCTION public.fn_loop_bar_proposals_generate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_loop         public.loop_registry%ROWTYPE;
  v_proposed     integer := 0;
  v_insufficient integer := 0;
  v_skipped      integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR v_loop IN
    SELECT * FROM public.loop_registry
     WHERE is_active IS TRUE AND bar IS NULL
     ORDER BY loop_key
  LOOP
    -- Already asked about, either way: an undecided bar proposal, or a
    -- standing "can't bar this yet" note. Both mean don't ask again.
    IF EXISTS (
      SELECT 1 FROM public.loop_charter_proposals
       WHERE loop_key = v_loop.loop_key
         AND kind = 'bar'
         AND status IN ('proposed','insufficient')
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF NULLIF(btrim(v_loop.outcome_metric), '') IS NOT NULL
       AND NULLIF(btrim(v_loop.baseline_window), '') IS NOT NULL THEN
      INSERT INTO public.loop_charter_proposals (loop_key, kind, proposed, rationale, status)
      VALUES (
        v_loop.loop_key,
        'bar',
        jsonb_build_object(
          -- The house phrasing is "<outcome metric> vs own <baseline window>".
          -- Several charters already write the baseline as "own trailing 8
          -- weeks", which would read "vs own own trailing 8 weeks" — strip the
          -- leading "own " rather than ship a stutter for a human to fix.
          'bar',      btrim(v_loop.outcome_metric) || ' vs own '
                        || regexp_replace(btrim(v_loop.baseline_window), '^own\s+', '', 'i'),
          'bar_kind', 'comparison'
        ),
        'this loop already measures "' || btrim(v_loop.outcome_metric)
          || '" and its charter names "' || btrim(v_loop.baseline_window)
          || '" as the baseline — judging it against its own past needs no new number',
        'proposed'
      );
      v_proposed := v_proposed + 1;

    ELSIF NULLIF(btrim(v_loop.counter_metric), '') IS NOT NULL THEN
      INSERT INTO public.loop_charter_proposals (loop_key, kind, proposed, rationale, status)
      VALUES (
        v_loop.loop_key,
        'bar',
        jsonb_build_object(
          'bar',      btrim(v_loop.counter_metric) || ' stays at or below its agreed limit',
          'bar_kind', 'threshold'
        ),
        'no outcome metric with a baseline window on record, but the charter names the safety gauge "'
          || btrim(v_loop.counter_metric)
          || '" — a threshold on it is a real bar; set the number when you approve',
        'proposed'
      );
      v_proposed := v_proposed + 1;

    ELSE
      INSERT INTO public.loop_charter_proposals (loop_key, kind, proposed, rationale, status)
      VALUES (
        v_loop.loop_key,
        'bar',
        jsonb_build_object('insufficient', true),
        'no metric on record — needs an owner interview',
        'insufficient'
      );
      v_insufficient := v_insufficient + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'proposed',     v_proposed,
    'insufficient', v_insufficient,
    'skipped',      v_skipped
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_loop_bar_proposals_generate() IS
  'Propose ONE bar per active loop that has none: a comparison bar when outcome_metric + baseline_window are on record, else a threshold bar from counter_metric, else an honest ''insufficient'' row ("no metric on record — needs an owner interview") written once per loop. Proposes only — loop_registry.bar is written solely by fn_loop_bar_decide on a super-admin approval. Returns {proposed, insufficient, skipped}. service_role or super-admin only.';

REVOKE EXECUTE ON FUNCTION public.fn_loop_bar_proposals_generate() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_bar_proposals_generate() TO authenticated;

-- ── 6. fn_loop_bar_decide — the only door onto loop_registry.bar ────────────
-- Super-admin asserted in its own body (the page gate is UI-only), mirroring
-- fn_loop_apply_charter_proposal. Refuses kind='charter' outright — those keep
-- going through fn_loop_apply_charter_proposal.
--
-- APPROVE on kind='bar'        → the proposed bar becomes the loop's bar.
-- APPROVE on kind='bar-review' → "yes, the bar was wrong": the bar is CLEARED
--   (proposed carries no replacement bar) so the next generate pass proposes a
--   fresh one, and the streak resets.
-- REJECT on kind='bar-review'  → "the bar is fine": registry bar untouched,
--   streak reset to 0 (Director, 2026-09-17) so the next four runs are judged
--   from a clean count.
-- REJECT on kind='bar'         → the proposal simply closes; the loop stays
--   barless and is proposed again next run.

CREATE OR REPLACE FUNCTION public.fn_loop_bar_decide(
  p_proposal_id uuid,
  p_decision    text,
  p_note        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_prop      public.loop_charter_proposals%ROWTYPE;
  v_email     text;
  v_bar       text;
  v_bar_kind  text;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected (got %)', p_decision;
  END IF;

  SELECT * INTO v_prop
    FROM public.loop_charter_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no proposal %', p_proposal_id;
  END IF;

  IF v_prop.kind NOT IN ('bar','bar-review') THEN
    RAISE EXCEPTION 'proposal % is a % proposal — decide it on the charters path', p_proposal_id, v_prop.kind;
  END IF;

  IF v_prop.status <> 'proposed' THEN
    RAISE EXCEPTION 'proposal already decided (status=%)', v_prop.status;
  END IF;

  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();

  IF p_decision = 'approved' THEN
    v_bar      := NULLIF(btrim(v_prop.proposed->>'bar'), '');
    v_bar_kind := NULLIF(btrim(v_prop.proposed->>'bar_kind'), '');

    UPDATE public.loop_registry
       SET bar             = v_bar,
           bar_kind        = v_bar_kind,
           bar_set_at      = now(),
           bar_set_by      = v_email,
           -- Approving a bar-review means "the bar was wrong" — the count that
           -- raised it must not survive the decision.
           bar_miss_streak = CASE WHEN v_prop.kind = 'bar-review' THEN 0 ELSE bar_miss_streak END,
           updated_at      = now()
     WHERE loop_key = v_prop.loop_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no loop_registry row for loop_key %', v_prop.loop_key;
    END IF;

  ELSIF v_prop.kind = 'bar-review' THEN
    -- Rejecting a bar-review is the Director saying the bar is FINE. The bar
    -- stays; the streak that raised the card is cleared, or the very next miss
    -- would raise it again.
    UPDATE public.loop_registry
       SET bar_miss_streak = 0,
           updated_at      = now()
     WHERE loop_key = v_prop.loop_key;
  END IF;

  UPDATE public.loop_charter_proposals
     SET status        = p_decision,
         decision_note = NULLIF(btrim(p_note), ''),
         decided_by    = auth.uid(),
         decided_at    = now(),
         updated_at    = now()
   WHERE id = p_proposal_id;

  RETURN jsonb_build_object(
    'ok',       true,
    'loop_key', v_prop.loop_key,
    'kind',     v_prop.kind,
    'decision', p_decision,
    'bar',      CASE WHEN p_decision = 'approved' THEN v_bar ELSE NULL END
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_loop_bar_decide(uuid, text, text) IS
  'Decide a kind=''bar'' or ''bar-review'' loop_charter_proposals row (super-admin asserted; charter proposals are refused and keep going through fn_loop_apply_charter_proposal). Approve writes proposed.bar/bar_kind onto loop_registry with bar_set_at/bar_set_by — on a bar-review that means clearing the bar (no replacement is carried) and resetting bar_miss_streak so a fresh bar is proposed next run. Reject on a bar-review leaves the bar alone and resets bar_miss_streak to 0 (the Director confirming the bar is fine). Returns {ok, loop_key, kind, decision, bar}.';

REVOKE EXECUTE ON FUNCTION public.fn_loop_bar_decide(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_bar_decide(uuid, text, text) TO authenticated;

-- ── 7. Guards — RAISE EXCEPTION, never RAISE NOTICE ─────────────────────────
-- (ref feedback_a_raise_notice_guard_reads_as_success)

DO $guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c.col, ', ') INTO v_missing
    FROM (VALUES ('bar'),('bar_kind'),('bar_set_at'),('bar_set_by'),('bar_miss_streak')) AS c(col)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'loop_registry' AND column_name = c.col
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'loop_registry is missing bar columns after this migration: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'loop_charter_proposals' AND column_name = 'kind'
  ) THEN
    RAISE EXCEPTION 'loop_charter_proposals.kind missing after this migration';
  END IF;

  -- Every row that existed before this file must have taken the 'charter'
  -- default; a row wearing a bar kind here would mean the backfill went wrong.
  IF EXISTS (
    SELECT 1 FROM public.loop_charter_proposals
     WHERE kind NOT IN ('charter','bar','bar-review')
  ) THEN
    RAISE EXCEPTION 'loop_charter_proposals holds a row with an out-of-contract kind';
  END IF;

  IF to_regclass('public.loop_measurements') IS NULL THEN
    RAISE EXCEPTION 'loop_measurements table missing after this migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'loop_charter_proposals_one_proposed_per_kind_idx'
  ) THEN
    RAISE EXCEPTION 'the per-kind one-proposed index was not created';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'loop_charter_proposals_one_proposed_idx'
  ) THEN
    RAISE EXCEPTION 'the old loop_key-only one-proposed index still exists — a bar proposal would collide with a pending charter';
  END IF;
END
$guard$;

NOTIFY pgrst, 'reload schema';
