-- ============================================================================
-- Improvement Board — give the rupee value a way to be written
-- File: 20261111000000_improvement_record_verified_value.sql
-- Date: 2026-09-06
--
-- WHY THIS EXISTS
--   improvement_ideas has carried four value columns since 20260723090000:
--
--       estimated_value_inr numeric,
--       verified_value_inr  numeric,
--       value_verified_at   timestamptz,
--       value_holds         boolean
--
--   Measured on production 2026-09-06:
--       improvement_ideas                                      55 rows
--       verified_value_inr IS NOT NULL                          0
--       estimated_value_inr IS NOT NULL                         0
--       value_holds IS NOT NULL                                 0
--       value_verified_at IS NOT NULL                           0
--       status = 'verified'                                     0
--       status = 'applied'                                      0
--       sh_builders                                             0
--       improvement_idea_activity WHERE action='value_verified' 0
--
--   Zero is not "nobody has got round to it". There is NO WRITE PATH. Asked on
--   production the same day, "which function in this database so much as
--   mentions those columns":
--
--     SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public'
--        AND pg_get_functiondef(p.oid) ~* '(verified_value_inr|value_holds|value_verified_at)';
--     -> fn_case_study_start   (one row, and it only READS them, as a gate)
--
--   And in the application, those three names appear in lib/ and app/ only as a
--   type declaration or a read. ImprovementService has exactly two writers —
--   updateIdea(), whose Pick<> excludes every value column, and scoreIdea(),
--   which writes `score`. create-idea-dialog collects no value; idea-detail-dialog
--   offers no value input.
--
--   So the columns are decorative. This migration is the missing writer.
--
-- WHAT DEPENDS ON IT (why decorative is expensive)
--   Two finished, merged, live features are dead behind this gap:
--
--   1. lib/services/solutions/resident-promotion-service.ts promotes a resident
--      into sh_builders off verified ideas and sums verified_value_inr to report
--      what they are worth. It can never fire: 0 ideas are verified and 0 carry
--      a value.
--   2. fn_case_study_start — LIVE in production, verified in pg_proc on
--      2026-09-06 — refuses unless `status='verified' AND value_holds IS TRUE`.
--      value_holds has no writer, so no learner can ever write up their own fix.
--
--   The chain the Board was built for is
--       idea -> applied -> verified -> valued -> builder -> paid work
--   and it is severed at "valued".
--
-- ---------------------------------------------------------------------------
-- DECISION 1 — WHICH STATUSES MAY CARRY A VALUE: 'applied' AND 'verified'.
--   I decided this; it was not specified. The brief asked whether to permit only
--   'verified'. Only 'verified' is wrong, and the module already says so in its
--   own words. fn_case_study_start's refusal message (20260809011500) enumerates
--   this case explicitly:
--
--     "The two halves are independent - improvement_idea_status carries 'applied'
--      as a state of its own, so an idea can sit at status='applied' with
--      value_holds already true."
--
--   That is not an accident of wording — it is a live error branch, and one that
--   would be unreachable dead code if a value could only ever be recorded at
--   'verified'. It is also the honest sequence: verifying an improvement MEANS
--   going and measuring what the applied fix was worth. Requiring status='verified'
--   before the measurement may be recorded forces a manager to declare an idea
--   verified before they have measured anything, which inverts the meaning of the
--   word and makes 'verified' unfalsifiable.
--
--   So: measure at 'applied', then move to 'verified'. Recording again at
--   'verified' (a correction) stays legal. 'closed' is refused even though a
--   closed idea may have been verified once — it is terminal, and rewriting its
--   figure would silently move promotion and case-study arithmetic after the
--   fact. Every other status is refused, and the refusal names the status the
--   idea is actually in.
--
-- DECISION 2 — THIS RPC DOES NOT MOVE STATUS.
--   fn_improvement_set_status is the single owner of improvement_idea_status, and
--   20260727030000 states that rule for the sibling RPC: "moving approved -> applied
--   stays the exclusive job of fn_improvement_set_status". A second function that
--   moved applied -> verified would be a second copy of the transition guard, and
--   __tests__/lib/improvement-board/manager-transitions.test.ts exists precisely
--   because two copies of that rule already drifted once, silently, from July to
--   September. Recording a value and closing the loop are two acts; the caller
--   performs them in that order.
--
-- DECISION 3 — value_holds = FALSE FORCES verified_value_inr = NULL,
--              AND A CHECK CONSTRAINT MAKES THAT ROW UNREPRESENTABLE.
--   resident-promotion-service.ts sums verified_value_inr for every 'verified'
--   idea WITHOUT consulting value_holds:
--
--     if (idea.verified_value_inr != null) cur.value = (cur.value ?? 0) + Number(...)
--
--   So a row with value_holds=false AND a non-null verified_value_inr would be
--   counted, by name, toward what a learner is owed — a figure a manager has just
--   said does not hold.
--
--   Guarding that in the RPC alone would not be enough, and it is worth being
--   exact about why. improvement_ideas_update grants a board.manage holder
--   USING/WITH CHECK true with NO column restriction (verified in pg_policies on
--   production), so a manager can PATCH verified_value_inr straight through
--   PostgREST today, bypassing any function. Only a table constraint closes that.
--   Hence improvement_ideas_value_holds_figure_chk below. It is deliberately
--   narrow — exactly the money-poisoning combination, nothing more — so it
--   cannot refuse a row some other lane legitimately needs.
--
--   The three states of value_holds keep the meanings fn_case_study_start relies on:
--     NULL  = not yet checked   (never written by this RPC)
--     TRUE  = checked, it holds (verified_value_inr NOT NULL, not NaN, >= 0)
--     FALSE = checked, it does not hold (verified_value_inr NULL)
--
-- DECISION 4 — LAST WRITE WINS, and every call is audited.
--   fn_improvement_set_resolution is first-writer-wins because it assigns CREDIT
--   and a peer must not be able to steal it. A value is a MEASUREMENT, not a claim
--   on another person: re-measuring must be allowed, or a mistyped figure is
--   permanent on a row that feeds a stipend. Correction is therefore a plain
--   re-call, and each call writes an improvement_idea_activity row, so the
--   sequence of figures stays recoverable even though only the latest is stored.
--
-- DECISION 5 — REUSES THE EXISTING ACTIVITY VERB 'value_verified'.
--   Already in the documented vocabulary at 20260723090000:80
--   ("created|edited|status_change|commented|escalated|scored|value_verified")
--   and unused on production (0 rows). No new string is minted. Confirmed on
--   production that improvement_idea_activity.action carries no CHECK constraint,
--   so the verb is writable.
--
-- WHY SECURITY DEFINER
--   Two reasons, and NOT the false one. The false one: it is not true that a
--   manager cannot otherwise reach these columns — see the PATCH hole above.
--   The real reasons are (a) improvement_idea_activity has ONLY a SELECT policy
--   on production (verified in pg_policies) and therefore no INSERT policy at
--   all, so the audit trail cannot be written any other way, and (b) the rules
--   above need to live somewhere with a voice, able to explain a refusal.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * does not write estimated_value_inr — that is the author's claim, collected
--     on the create/edit path, not the manager's measurement;
--   * does not stamp verified_by / verified_at — those belong to the status move
--     and fn_improvement_set_status already sets them;
--   * does not clear a value back to "not yet checked" (value_holds NULL). No
--     caller needs it: a wrong figure is corrected by recording the right one;
--   * adds no UI. The board components are owned elsewhere.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- The invariant, at the table, where a direct PATCH cannot go round it.
-- Narrow on purpose: it refuses ONLY "checked, does not hold, but here is a
-- number anyway". value_holds NULL (not yet checked) and value_holds TRUE are
-- both left entirely alone.
-- 0 of 55 production rows violate it, so it validates immediately.
-- ---------------------------------------------------------------------------
ALTER TABLE public.improvement_ideas
  DROP CONSTRAINT IF EXISTS improvement_ideas_value_holds_figure_chk;

ALTER TABLE public.improvement_ideas
  ADD CONSTRAINT improvement_ideas_value_holds_figure_chk
  CHECK (value_holds IS DISTINCT FROM false OR verified_value_inr IS NULL);

COMMENT ON CONSTRAINT improvement_ideas_value_holds_figure_chk ON public.improvement_ideas IS
  'A value a manager has said does NOT hold cannot also carry a rupee figure. lib/services/solutions/resident-promotion-service.ts sums verified_value_inr for every verified idea without consulting value_holds, so such a row would credit a learner with a number that was explicitly rejected. Enforced at the table because improvement_ideas_update lets a board.manage holder PATCH these columns directly, bypassing fn_improvement_set_verified_value.';


CREATE OR REPLACE FUNCTION public.fn_improvement_set_verified_value(
  p_idea_id            uuid,
  p_verified_value_inr numeric,
  p_value_holds        boolean,
  p_note               text DEFAULT NULL
)
RETURNS public.improvement_ideas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_idea   public.improvement_ideas;
  v_status public.improvement_idea_status;
  v_prev   numeric;
  v_note   text;
BEGIN
  -- ---- Who is asking ------------------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record a verified value.'
      USING ERRCODE = '42501';
  END IF;

  -- The manager test fn_improvement_set_status uses, wrapped in COALESCE so a
  -- NULL from any probe fails CLOSED. (fn_improvement_set_status writes the
  -- same three calls bare into a boolean and then tests `IF NOT v_is_manager`,
  -- where a NULL takes neither branch and falls through as though the caller
  -- were a manager. Not this lane's function to fix, but not one to copy either.)
  IF NOT (COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('improvement.board.manage'), false)) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can record a verified value.'
      USING ERRCODE = '42501';
  END IF;

  -- ---- The idea -----------------------------------------------------------
  SELECT * INTO v_idea FROM public.improvement_ideas WHERE id = p_idea_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Improvement idea % not found.', p_idea_id
      USING ERRCODE = '22023';
  END IF;
  v_status := v_idea.status;
  v_prev   := v_idea.verified_value_inr;

  -- ---- Decision 1: only a fix that has actually been made can be valued ----
  IF v_status NOT IN ('applied'::public.improvement_idea_status,
                      'verified'::public.improvement_idea_status) THEN
    RAISE EXCEPTION
      'A verified value can only be recorded once the fix has been applied. This idea is "%", not "applied" or "verified".',
      v_status
      USING ERRCODE = '22023';
  END IF;

  -- ---- Decision 3: the figure and the verdict must agree ------------------
  IF p_value_holds IS NULL THEN
    RAISE EXCEPTION
      'Say whether the value holds: true (and give the figure) or false (and give no figure). NULL means "not yet checked" and is not something this can record.'
      USING ERRCODE = '22023';
  END IF;

  IF p_value_holds THEN
    IF p_verified_value_inr IS NULL THEN
      RAISE EXCEPTION 'A value that holds needs a figure. Give the verified rupee amount, or pass value_holds = false.'
        USING ERRCODE = '22023';
    END IF;
    -- numeric accepts 'NaN', and in Postgres NaN sorts ABOVE every number
    -- ('NaN' < 0 is false, 'NaN' > 999999 is true — checked on production), so
    -- a bare `< 0` test lets it straight through into a stipend figure.
    IF p_verified_value_inr = 'NaN'::numeric THEN
      RAISE EXCEPTION 'The verified value is not a number.'
        USING ERRCODE = '22023';
    END IF;
    IF p_verified_value_inr < 0 THEN
      RAISE EXCEPTION 'The verified value cannot be negative (got %).', p_verified_value_inr
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_verified_value_inr IS NOT NULL THEN
      RAISE EXCEPTION
        'An idea whose value does not hold cannot carry a figure (got %). Downstream promotion sums verified_value_inr without reading value_holds, so that row would credit a learner with a number you have just said is wrong. Record the real figure with value_holds = true instead.',
        p_verified_value_inr
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ---- The write: three columns, nothing else -----------------------------
  UPDATE public.improvement_ideas SET
    verified_value_inr = p_verified_value_inr,
    value_holds        = p_value_holds,
    value_verified_at  = now()
  WHERE id = p_idea_id
  RETURNING * INTO v_idea;

  -- ---- Audit row ----------------------------------------------------------
  --   to_status is NULL by design: this RPC never moves status. from_status
  --   records the (unchanged) status the value was measured against, which is
  --   what tells a later reader whether it was measured at 'applied' or
  --   re-recorded at 'verified'.
  v_note := CASE WHEN p_value_holds
                 THEN 'verified value ' || p_verified_value_inr::text || ' INR'
                 ELSE 'value checked and does not hold'
            END
            || CASE WHEN v_prev IS NOT NULL
                    THEN ' (was ' || v_prev::text || ' INR)'
                    ELSE '' END
            || COALESCE('; ' || NULLIF(btrim(p_note), ''), '');

  INSERT INTO public.improvement_idea_activity
    (idea_id, actor_id, action, from_status, to_status, note)
  VALUES (p_idea_id, v_uid, 'value_verified', v_status, NULL, v_note);

  RETURN v_idea;
END
$fn$;

COMMENT ON FUNCTION public.fn_improvement_set_verified_value(uuid, numeric, boolean, text) IS
  'The ONLY function-level write path for improvement_ideas.verified_value_inr / value_holds / value_verified_at, which had no writer at all before 2026-09-06 (0 of 55 production ideas carried any of them). Board managers only. Permitted while the idea is "applied" or "verified", because verifying an improvement means measuring the applied fix — fn_case_study_start already documents, in a live error branch, that an idea may sit at status=applied with value_holds true. Refuses a figure when value_holds is false, because resident-promotion-service sums verified_value_inr without consulting value_holds and would otherwise credit a learner with a number a manager has just rejected; improvement_ideas_value_holds_figure_chk enforces the same rule at the table, where a direct PostgREST PATCH cannot go round it. Last write wins (a measurement may be re-measured) and every call writes an improvement_idea_activity row with action = value_verified. Does NOT move status (fn_improvement_set_status owns that), does NOT stamp verified_by/verified_at, and does NOT touch estimated_value_inr.';

-- ACLs. The argument list is part of the function identity — repeat it exactly.
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function,
-- separately from PUBLIC, so REVOKE FROM PUBLIC alone would leave this callable
-- by any unauthenticated holder of the bundled anon key.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_verified_value(uuid, numeric, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_verified_value(uuid, numeric, boolean, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- APPLY-TIME ASSERTS — house style for this module (20260816050000:327).
-- A migration that applies but leaves the grant wrong is worse than one that fails.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF has_function_privilege('anon',
       'public.fn_improvement_set_verified_value(uuid, numeric, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE fn_improvement_set_verified_value — the anon revoke failed';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.fn_improvement_set_verified_value(uuid, numeric, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE fn_improvement_set_verified_value — no manager could ever call it';
  END IF;

  -- The constraint that makes the money-poisoning row unrepresentable.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.improvement_ideas'::regclass
       AND conname  = 'improvement_ideas_value_holds_figure_chk'
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'improvement_ideas_value_holds_figure_chk is missing or unvalidated';
  END IF;

  -- The three columns this function exists to write must all still be there.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='improvement_ideas'
         AND column_name IN ('verified_value_inr','value_holds','value_verified_at')) <> 3 THEN
    RAISE EXCEPTION 'improvement_ideas is missing one of verified_value_inr / value_holds / value_verified_at';
  END IF;

  -- The audit column the RPC writes must still exist, or every call fails at run time.
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = 'public.improvement_idea_activity'::regclass
       AND a.attname = 'action' AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'improvement_idea_activity.action is gone — the audit row would fail at run time';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
