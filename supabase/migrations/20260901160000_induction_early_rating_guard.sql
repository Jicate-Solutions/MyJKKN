-- Induction integrity gate: a sitting that has not happened yet cannot be rated.
--
-- Why this exists. event_session_feedback carries no relationship at all between
-- WHEN a rating was captured and WHEN the sitting it rates was scheduled to
-- begin. Three SECURITY DEFINER writers reach the table --
--   fn_induction_submit_feedback           (fresher, own login)
--   fn_induction_submit_feedback_proxy     (volunteer kiosk, shared device)
--   fn_induction_volunteer_submit_feedback (volunteer, own login)
-- -- and not one of them looks at event_sessions.start_at. The lifecycle gate
-- added 2026-08-21 (fn_induction_assert_live) asks only whether the EVENT is
-- Live; a Live induction's sitting three months out is still Live, so a rating
-- against it passes cleanly.
--
-- Measured on production 2026-09-01, BEFORE this migration:
--   4,080 rows across all events have created_at < start_at -- a rating
--   recorded before the sitting it rates had started.
--   By college: Pharmacy 61% of its rows early, Arts & Science 24.7%,
--   Engineering 16.5%.
-- Those rows are left in place. This guard is about new writes, and deleting
-- captured feedback is not a migration's call -- the same line the live gate
-- drew, for the same reason.
--
-- TWO DISTINCT CAUSES SIT INSIDE THAT ONE NUMBER, and they do not want the same
-- answer:
--   (a) Arts & Science runs a year-long peer-mentor track. Its sittings are
--       scheduled months ahead and are being rated now. These are not early
--       captures -- they are ratings of something that has not occurred, and
--       there is no defensible reading under which they are measurements.
--   (b) Pharmacy's are genuinely-early captures: a volunteer works the kiosk as
--       the cohort arrives, minutes-to-hours ahead of the sitting proper. That
--       is a real operating mode on a shared device and refusing it would stop
--       an induction that is running today.
-- Nothing in the row distinguishes (a) from (b) by intent -- only by DISTANCE
-- from start_at. So the rule is a tolerance, and because the honest value of
-- that tolerance is an operational decision rather than an engineering one, it
-- is a platform_policies row and not a constant in this file.
--
-- WHY A TRIGGER AND NOT A CHECK IN EACH RPC. The same argument the live gate
-- made and it has not weakened: editing three bodies means three chances for the
-- predicate to drift, and the fourth writer added next month arrives ungated.
-- The table is the real boundary, so the guard belongs on the table.
--
-- WHY now() AND NOT NEW.created_at. Every writer leaves created_at to its
-- DEFAULT now() -- verified across all three migrations above, none assigns it.
-- So created_at IS the wall-clock capture time and the measurement is sound.
-- But all three writers upsert via ON CONFLICT ... DO UPDATE, and that arm does
-- NOT touch created_at: a re-rating keeps the FIRST capture's timestamp.
-- Guarding on NEW.created_at would therefore refuse a coordinator correcting one
-- of the 4,080 rows already on the table WHILE THE SITTING IS IN PROGRESS -- the
-- exact repair the guard should welcome. now() is the only defensible clock.
--
-- THE DEFAULT TOLERANCE IS DELIBERATELY LOOSE: 10080 minutes (7 days).
-- It is a deploy-safety bound, NOT the intended operational rule, and it is set
-- this wide on purpose:
--   * Pharmacy's induction is running RIGHT NOW. The distribution of how early
--     its captures actually land was not measured for this PR (production reads
--     were out of scope), so any tighter number would be a guess that could
--     refuse live writes on the day it deploys.
--   * 7 days is the length of an induction programme. At this setting no capture
--     made ANYWHERE INSIDE the running programme can be refused, which is the
--     only bound justifiable without the distribution in hand.
--   * It still refuses cause (a) by a factor of roughly fifty: a year-long
--     mentor track's sittings are months out, not days.
--   * The asymmetry decides it. Too tight breaks a live induction -- freshers
--     and volunteers meet a refusal mid-programme. Too loose catches only the
--     absurd case on day one and is tightened by an UPDATE to one row, with no
--     deploy and no code change. Loose-at-deploy is the cheap mistake.
-- The operationally correct value is probably in the 30-120 minute range. That
-- is the Director's call once the distribution is on the table, and it needs
-- nothing from engineering to apply.
--
-- NULL AND NOT-FOUND, stated explicitly because the two look alike and want
-- opposite answers:
--   * session row not found -> REFUSE (fail closed). event_session_feedback
--     .session_id is NOT NULL REFERENCES event_sessions(id), so this is
--     unreachable while the FK stands; if it ever is reached, a rating against a
--     sitting that cannot be located is the least verifiable row the table can
--     hold, and passing it would defeat the guard silently.
--   * session found but its event is not an induction -> RETURN (no-op). These
--     event_* tables carry induction rows only today, but a marathon or a
--     tournament writing them later must not inherit an induction's rule. Same
--     scoping join the live gate uses.
--   * start_at IS NULL -> REFUSE (fail closed). event_sessions.start_at is
--     TIMESTAMPTZ NOT NULL, so this is unreachable through the column; the
--     branch exists so that a future schema relaxation cannot turn the guard off
--     by accident. A guard that meets a NULL and shrugs is not a guard.
--
-- WHAT THIS DELIBERATELY DOES NOT COVER:
--   * event_day_feedback and event_program_feedback -- a whole-day or
--     whole-programme rating has no single start_at to measure against, and
--     inventing one would be this migration making a policy call it was not
--     asked to make.
--   * event_session_attendance -- marking a fresher present before a sitting
--     begins is a different question with a different answer (a kiosk legitimately
--     registers arrivals early) and belongs in its own ruling.
--   * Ratings captured long AFTER a sitting ends. A rating recalled a month late
--     is also weak evidence, but it is a separate defect with a separate fix.

-- ---------------------------------------------------------------------------
-- The tolerance, as a config row. Idempotent (INSERT ... WHERE NOT EXISTS),
-- per the platform_policies substrate convention.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  enum_options,
  is_system
)
SELECT
  'induction.feedback.early_capture_minutes',
  'global',
  NULL,
  '10080'::jsonb,
  'How many minutes BEFORE an induction sitting starts a rating may still be captured. Above this distance the write is refused. Default 10080 (7 days) is a deploy-safety bound sized to the length of an induction programme, not the intended rule -- it exists so the guard cannot refuse a capture inside a running induction on the day it ships. Tighten via this row (30-120 minutes is the likely operational answer); no deploy needed. 0 refuses every capture before start_at. Negative values are clamped to 0.',
  'number',
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'induction.feedback.early_capture_minutes'
    AND scope_type  = 'global'
    AND scope_id    IS NULL
);

-- ---------------------------------------------------------------------------
-- The predicate, in one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assert_session_started(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start_at     timestamptz;
  v_is_induction boolean;
  v_tolerance    integer;
  v_earliest     timestamptz;
BEGIN
  -- SECURITY DEFINER is load-bearing for the same reason the live gate needs it:
  -- this runs inside a learner's INSERT, and a learner cannot necessarily SELECT
  -- event_sessions. Reading as the caller would return NOT FOUND on a row that
  -- exists, and the guard would refuse a legitimate write -- or, worse, if the
  -- NOT FOUND branch were ever softened to a RETURN, pass every write silently.
  --
  -- One query, both facts. Resolving the sitting and its induction-ness together
  -- keeps "no such session" distinguishable from "not an induction"; a single
  -- join to induction_programs would collapse them into one NOT FOUND and force
  -- the guard to answer both with the same verdict.
  SELECT s.start_at,
         EXISTS (SELECT 1 FROM public.induction_programs ip WHERE ip.event_id = s.event_id)
    INTO v_start_at, v_is_induction
    FROM public.event_sessions s
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'This rating points at a sitting that no longer exists. Refresh the schedule and try again.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_is_induction THEN
    RETURN;  -- not an induction; not this guard's business
  END IF;

  IF v_start_at IS NULL THEN
    RAISE EXCEPTION
      'This sitting has no start time, so there is no way to tell whether it has happened yet. Set its schedule before collecting ratings.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- GREATEST(..., 0) is not defensive clutter. This row is Director-editable
  -- through the platform_policies UI with no review step and no deploy, and a
  -- stray minus sign on a large number would turn the guard into a platform-wide
  -- refusal of all induction feedback. Clamping caps the blast radius of a typo
  -- at "the guard behaves as though the tolerance were zero".
  v_tolerance := GREATEST(
    fn_get_policy_int('induction.feedback.early_capture_minutes', 10080, NULL),
    0
  );

  v_earliest := v_start_at - make_interval(mins => v_tolerance);

  -- now(), not NEW.created_at -- see the header. On the ON CONFLICT DO UPDATE
  -- arm created_at still holds the first capture, and testing it would refuse a
  -- correction made during the sitting itself.
  IF now() < v_earliest THEN
    RAISE EXCEPTION
      'This sitting starts %. It cannot be rated yet -- %.',
      to_char(v_start_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY at HH12:MI AM'),
      CASE
        WHEN v_tolerance = 0    THEN 'ratings open when it begins'
        WHEN v_tolerance < 60   THEN 'ratings open ' || v_tolerance || ' minutes before it begins'
        WHEN v_tolerance < 1440 THEN 'ratings open ' || round(v_tolerance / 60.0) || ' hours before it begins'
        ELSE 'ratings open ' || round(v_tolerance / 1440.0) || ' days before it begins'
      END
      USING ERRCODE = 'check_violation';
  END IF;
END
$function$;

COMMENT ON FUNCTION public.fn_induction_assert_session_started(uuid) IS
  'Raises unless the given induction sitting has started, or is within the induction.feedback.early_capture_minutes tolerance of starting. No-op for non-induction sessions; fails closed on a missing session or a null start_at.';

-- No signed-in user needs to reach this directly. Its only caller is
-- trg_induction_require_session_started(), which is itself SECURITY DEFINER and
-- therefore executes as its OWNER -- the owner's EXECUTE privilege is what the
-- inner call is checked against, not the learner's. So granting `authenticated`
-- would add reachability and buy nothing, and scripts/ci/check-secdef-anon-revoke.mjs
-- refuses that shape on sight: a SECURITY DEFINER function every signed-in user
-- can call must show an authorization check in its body, and a guard whose whole
-- job is to RAISE has none to show. Narrowing the grant is the honest answer
-- rather than bolting on a check the function does not need.
-- anon AND authenticated AND PUBLIC all named: Supabase's default privileges
-- grant anon and authenticated EXECUTE directly, separately from PUBLIC, so
-- revoking one does not undo the other. service_role keeps its own direct grant,
-- which is untouched here.
REVOKE EXECUTE ON FUNCTION public.fn_induction_assert_session_started(uuid) FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- Trigger adapter. event_session_feedback carries session_id directly, so
-- unlike the live gate's by-event adapter this one needs no lookup of its own.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_induction_require_session_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_induction_assert_session_started(NEW.session_id);
  RETURN NEW;
END
$function$;

-- ---------------------------------------------------------------------------
-- The trigger.
--
-- Named trg_b_* on purpose, and the letter is the whole point. Postgres fires
-- row triggers in ALPHABETICAL name order, so trg_b_ sorts AFTER the live gate's
-- trg_a_induction_require_live and BEFORE trg_induction_completion_* and
-- trg_touch_updated_at. That ordering is the one that produces the right message:
-- if an induction is still in Draft, "activate it first" is the useful refusal,
-- not "this sitting has not started". The live gate is untouched by this
-- migration -- this trigger is added alongside it, never in place of it.
--
-- BEFORE INSERT OR UPDATE, not INSERT alone: all three writers use
-- ON CONFLICT ... DO UPDATE, so the UPDATE arm is the re-rating path and is just
-- as much a rating of a sitting that has not happened as the first one was.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_b_induction_require_session_started ON public.event_session_feedback;
CREATE TRIGGER trg_b_induction_require_session_started
  BEFORE INSERT OR UPDATE ON public.event_session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_session_started();

NOTIFY pgrst, 'reload schema';
