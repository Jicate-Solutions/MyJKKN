-- Senior Peer Mentor — incremental auto-balance + bulk cover/permanent reassign
-- ============================================================================
--
-- Three things this migration changes, all on the SPM assignment layer
-- (induction_feedback_volunteer_group):
--
-- 1. AUTO-BALANCE IS NO LONGER DESTRUCTIVE BY DEFAULT.
--    The shipped fn_induction_autobalance_feedback_volunteers opened with
--    `DELETE FROM induction_feedback_volunteer_group WHERE event_id = ...` and
--    re-dealt the WHOLE cohort. Pressing the button a second time therefore
--    reshuffled mentor↔fresher pairs that mentors had already walked, and a
--    fresher who joined on a later admission date could not be added without
--    tearing up everyone else's group.
--    New default mode 'incremental': existing assignments are KEPT, and only
--    freshers who have no mentor are dealt into the mentors' REMAINING capacity,
--    lightest-loaded mentor first. The old behaviour survives as an explicit
--    p_mode => 'rebalance' for the rare "start over" case.
--
-- 2. BULK REASSIGN ONE MENTOR'S FRESHERS TO ANOTHER — TEMPORARY OR PERMANENT.
--    When an SPM is absent, a coordinator/lead/admin moves their whole group (or
--    a chosen subset) to a stand-in. A temporary move records the ORIGINAL owner
--    and a cover_until date; the freshers hand themselves back automatically once
--    that date has passed. A permanent move simply re-owns them.
--
-- 3. THE SESSION ROSTER CARRIES ITS MENTOR.
--    fn_induction_session_roster now returns mentor_learner_id / mentor_name so
--    the attendance screen can filter a 225-name roster down to one SPM's group
--    the same way it already filters by programme.
--
-- Idempotent: safe to re-run.

-- ── 1. Cover columns on the assignment row ──────────────────────────────────
--
-- covering_for_volunteer_id is the mentor the fresher REALLY belongs to while a
-- stand-in is walking them. NULL means the current volunteer_id is the true
-- owner (a permanent assignment). ON DELETE SET NULL: if the original mentor is
-- removed from the induction outright there is nobody to hand back to, so the
-- cover quietly becomes permanent rather than leaving a dangling pointer.
ALTER TABLE public.induction_feedback_volunteer_group
  ADD COLUMN IF NOT EXISTS covering_for_volunteer_id uuid
    REFERENCES public.induction_feedback_volunteers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_until       date,
  ADD COLUMN IF NOT EXISTS cover_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cover_note        text,
  ADD COLUMN IF NOT EXISTS cover_set_by      uuid;

COMMENT ON COLUMN public.induction_feedback_volunteer_group.covering_for_volunteer_id IS
  'While a stand-in walks this fresher, the mentor they revert to. NULL = volunteer_id is the true owner.';
COMMENT ON COLUMN public.induction_feedback_volunteer_group.cover_until IS
  'Last date (inclusive) the stand-in owns this fresher. The nightly sweep hands them back after it passes.';

-- The nightly sweep only ever looks at rows that are actually under cover.
CREATE INDEX IF NOT EXISTS ifvg_cover_until_idx
  ON public.induction_feedback_volunteer_group (cover_until)
  WHERE cover_until IS NOT NULL;

-- The incremental deal counts each mentor's current load; the reassign reads a
-- whole group at once. Both are volunteer_id lookups.
CREATE INDEX IF NOT EXISTS ifvg_volunteer_idx
  ON public.induction_feedback_volunteer_group (volunteer_id);

-- ── 2. Cover expiry sweep ───────────────────────────────────────────────────
--
-- Hands every expired cover back to its original mentor. Two callers, and the
-- authorization rule differs between them, which is why the gate is written the
-- way it is:
--   • pg_cron / another SECURITY DEFINER function — no auth.uid(), trusted.
--     Safe ONLY because EXECUTE is revoked from anon and authenticated below,
--     so an unauthenticated web request can never reach this function at all.
--   • a signed-in coordinator sweeping their own event — must pass the same
--     can_manage_training gate as every other management RPC.
CREATE OR REPLACE FUNCTION public.fn_induction_expire_mentor_covers(p_event_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_event_id IS NULL THEN
      RAISE EXCEPTION 'fn_induction_expire_mentor_covers: an event is required';
    END IF;
    IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
      RAISE EXCEPTION 'fn_induction_expire_mentor_covers: not authorized';
    END IF;
  END IF;

  -- (a) Cover has run out AND the original mentor is still active → hand back.
  UPDATE public.induction_feedback_volunteer_group g
     SET volunteer_id             = g.covering_for_volunteer_id,
         covering_for_volunteer_id = NULL,
         cover_until               = NULL,
         cover_started_at          = NULL,
         cover_note                = NULL,
         cover_set_by              = NULL,
         updated_at                = now()
   WHERE g.cover_until IS NOT NULL
     AND g.cover_until < CURRENT_DATE
     AND (p_event_id IS NULL OR g.event_id = p_event_id)
     AND g.covering_for_volunteer_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.induction_feedback_volunteers v
                  WHERE v.id = g.covering_for_volunteer_id
                    AND v.is_active AND v.ended_at IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- (b) Cover has run out but there is nobody to hand back to (the original
  --     mentor was removed or their assignment ended). Keeping cover_until set
  --     would make the sweep retry this row every night forever, and the UI
  --     would keep showing an expired cover that can never resolve — so the
  --     stand-in simply becomes the owner.
  UPDATE public.induction_feedback_volunteer_group g
     SET covering_for_volunteer_id = NULL,
         cover_until               = NULL,
         cover_started_at          = NULL,
         cover_note                = NULL,
         cover_set_by              = NULL,
         updated_at                = now()
   WHERE g.cover_until IS NOT NULL
     AND g.cover_until < CURRENT_DATE
     AND (p_event_id IS NULL OR g.event_id = p_event_id)
     AND (g.covering_for_volunteer_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteers v
                          WHERE v.id = g.covering_for_volunteer_id
                            AND v.is_active AND v.ended_at IS NULL));

  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_expire_mentor_covers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_expire_mentor_covers(uuid) FROM anon;
-- Coordinators reach the sweep through the management RPCs below, never directly.
REVOKE ALL ON FUNCTION public.fn_induction_expire_mentor_covers(uuid) FROM authenticated;

-- Nightly at 00:20 UTC. Re-runnable: drop any previous registration first.
-- Wrapped in its own exception block on purpose — the cron job is a convenience,
-- not a correctness requirement (fn_induction_admin_mentor_mentees and the
-- auto-balance both sweep before they read), so a project without pg_cron
-- privileges must still get the rest of this migration.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('induction-expire-mentor-covers')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'induction-expire-mentor-covers');
      PERFORM cron.schedule(
        'induction-expire-mentor-covers',
        '20 0 * * *',
        $job$SELECT public.fn_induction_expire_mentor_covers();$job$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'induction cover expiry cron not scheduled: %', SQLERRM;
    END;
  END IF;
END $cron$;

-- ── 3. Auto-balance: incremental by default, full rebalance on request ───────
--
-- Return type gains newly_assigned / kept / released, so DROP first.
DROP FUNCTION IF EXISTS public.fn_induction_autobalance_feedback_volunteers(uuid, integer);
DROP FUNCTION IF EXISTS public.fn_induction_autobalance_feedback_volunteers(uuid, integer, text);

CREATE FUNCTION public.fn_induction_autobalance_feedback_volunteers(
  p_event_id uuid,
  p_capacity integer DEFAULT NULL,
  p_mode     text    DEFAULT 'incremental'
)
RETURNS TABLE(enrolled integer, assigned integer, unassigned integer,
              newly_assigned integer, kept integer, released integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst      UUID;
  v_nvol      INTEGER;
  v_enrolled  INTEGER;
  v_assigned  INTEGER;
  v_new       INTEGER := 0;
  v_kept      INTEGER := 0;
  v_released  INTEGER := 0;
  v_mode      TEXT;
BEGIN
  v_mode := lower(coalesce(p_mode, 'incremental'));
  IF v_mode NOT IN ('incremental', 'rebalance') THEN
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: p_mode must be incremental or rebalance';
  END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not authorized';
  END IF;

  SELECT count(*) INTO v_nvol
  FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND is_active AND ended_at IS NULL;
  IF v_nvol = 0 THEN
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: no active Senior Peer Mentors — appoint at least one first';
  END IF;

  -- A cover that has already run out must be handed back BEFORE we count loads,
  -- otherwise the stand-in looks full and the real mentor looks empty.
  PERFORM public.fn_induction_expire_mentor_covers(p_event_id);

  IF v_mode = 'rebalance' THEN
    -- Explicit "start over": everyone is re-dealt, covers included. This is the
    -- pre-existing behaviour, now reachable only on purpose.
    DELETE FROM public.induction_feedback_volunteer_group WHERE event_id = p_event_id;
  ELSE
    -- Self-heal before dealing: an assignment whose mentor is no longer active,
    -- or whose fresher is no longer enrolled, is not a real assignment. Leaving
    -- it would both understate the mentor's free capacity and hide the fresher
    -- from the unassigned pool (fn_induction_admin_unassigned_freshers already
    -- ignores inactive mentors, so the two views would disagree).
    DELETE FROM public.induction_feedback_volunteer_group g
     WHERE g.event_id = p_event_id
       AND (NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteers v
                         WHERE v.id = g.volunteer_id AND v.is_active AND v.ended_at IS NULL)
            OR NOT EXISTS (SELECT 1 FROM public.induction_enrollment ie
                            WHERE ie.event_id = p_event_id AND ie.learner_id = g.learner_id));
    GET DIAGNOSTICS v_released = ROW_COUNT;

    SELECT count(*)::int INTO v_kept
    FROM public.induction_feedback_volunteer_group WHERE event_id = p_event_id;
  END IF;

  WITH active_vols AS (
    -- Effective per-mentor cap, clamped to [1,200] to bound slot generation: a
    -- direct RPC call with a huge p_capacity would otherwise materialize
    -- billions of slots → self-DoS. p_capacity, WHEN PROVIDED, overrides per-run
    -- WITHOUT persisting; WHEN NULL, each mentor's own stored capacity drives it.
    SELECT v.id,
           LEAST(GREATEST(COALESCE(p_capacity, v.capacity), 1), 200) AS capacity,
           (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g
             WHERE g.volunteer_id = v.id) AS load,
           (row_number() OVER (ORDER BY v.created_at, v.id) - 1) AS vord
    FROM public.induction_feedback_volunteers v
    WHERE v.event_id = p_event_id AND v.is_active AND v.ended_at IS NULL
  ),
  -- Each mentor contributes only their REMAINING slots. `projected` is the
  -- headcount that slot would take the mentor to, so ordering by it deals to the
  -- lightest-loaded mentor first and converges the group sizes — instead of
  -- restarting the round-robin at mentor #1 and re-loading whoever was already
  -- full. In rebalance mode every load is 0, so this degrades exactly to the
  -- original round-robin.
  free_slots AS (
    SELECT v.id AS volunteer_id,
           v.load + gs.n AS projected,
           v.vord
    FROM active_vols v
    CROSS JOIN LATERAL generate_series(1, GREATEST(v.capacity - v.load, 0)) AS gs(n)
  ),
  ordered_slots AS (
    SELECT volunteer_id,
           (row_number() OVER (ORDER BY projected, vord) - 1) AS slot_idx
    FROM free_slots
  ),
  pending AS (
    SELECT ie.learner_id,
           (row_number() OVER (
              ORDER BY
                -- no-account FIRST (institution-scoped: a profile in ANOTHER
                -- college does NOT count as "has account" here)
                (EXISTS (SELECT 1 FROM public.profiles p
                          WHERE p.learner_id = ie.learner_id AND p.institution_id = v_inst)),
                ie.batch_id NULLS FIRST,
                lp.first_name, lp.last_name, ie.learner_id
            ) - 1) AS rn
    FROM public.induction_enrollment ie
    JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
      -- The whole point of incremental mode: a fresher who already has a mentor
      -- is not a candidate. In rebalance mode the DELETE above emptied the table,
      -- so this excludes nobody.
      AND NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteer_group g
                       WHERE g.event_id = p_event_id AND g.learner_id = ie.learner_id)
  ),
  assign AS (
    -- pending rn → free slot rn; freshers beyond the last free slot stay
    -- UNASSIGNED and are surfaced in the result rather than silently dropped.
    SELECT p.learner_id, s.volunteer_id
    FROM pending p
    JOIN ordered_slots s ON s.slot_idx = p.rn
  )
  INSERT INTO public.induction_feedback_volunteer_group (volunteer_id, event_id, learner_id)
  SELECT a.volunteer_id, p_event_id, a.learner_id FROM assign a
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    volunteer_id = EXCLUDED.volunteer_id, updated_at = now();
  GET DIAGNOSTICS v_new = ROW_COUNT;

  SELECT count(*) INTO v_enrolled
  FROM public.induction_enrollment WHERE event_id = p_event_id;

  SELECT count(*)::int INTO v_assigned
  FROM public.induction_feedback_volunteer_group WHERE event_id = p_event_id;

  enrolled       := v_enrolled;
  assigned       := v_assigned;          -- total owned after this run
  unassigned     := v_enrolled - v_assigned;
  newly_assigned := v_new;
  kept           := v_kept;
  released       := v_released;
  RETURN NEXT;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_autobalance_feedback_volunteers(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_autobalance_feedback_volunteers(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_autobalance_feedback_volunteers(uuid, integer, text) TO authenticated;

-- ── 4. Bulk reassign one mentor's freshers to another ────────────────────────
--
-- p_cover_until NULL  → permanent handover (the target becomes the true owner).
-- p_cover_until DATE  → the target stands in until that date, inclusive.
-- p_learner_ids NULL  → the whole group; otherwise only those freshers.
--
-- Capacity is REPORTED, not enforced: an absent mentor's whole group will often
-- overflow the stand-in's cap, and refusing the move would leave those freshers
-- with nobody at all. The caller gets over_capacity so the UI can say so.
CREATE OR REPLACE FUNCTION public.fn_induction_admin_bulk_reassign_mentees(
  p_event_id        uuid,
  p_from_learner_id uuid,
  p_to_learner_id   uuid,
  p_cover_until     date    DEFAULT NULL,
  p_learner_ids     uuid[]  DEFAULT NULL,
  p_note            text    DEFAULT NULL
)
RETURNS TABLE(moved integer, target_group_size integer, target_capacity integer, over_capacity boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst  uuid;
  v_from  uuid;
  v_to    uuid;
  v_n     integer := 0;
  v_size  integer;
  v_cap   integer;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_admin_bulk_reassign_mentees: not an induction event'; END IF;
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_bulk_reassign_mentees: not authorized';
  END IF;
  IF p_from_learner_id = p_to_learner_id THEN
    RAISE EXCEPTION 'fn_induction_admin_bulk_reassign_mentees: pick a different Senior Peer Mentor to move to';
  END IF;
  IF p_cover_until IS NOT NULL AND p_cover_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'fn_induction_admin_bulk_reassign_mentees: the cover end date is already past';
  END IF;

  -- Source may be INACTIVE — moving an absent or stood-down mentor's freshers
  -- somewhere safe is precisely the emergency this exists for.
  SELECT id INTO v_from FROM public.induction_feedback_volunteers
   WHERE event_id = p_event_id AND learner_id = p_from_learner_id;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'fn_induction_admin_bulk_reassign_mentees: source is not a Senior Peer Mentor on this induction';
  END IF;

  -- Target must be able to actually walk them.
  SELECT id, capacity INTO v_to, v_cap FROM public.induction_feedback_volunteers
   WHERE event_id = p_event_id AND learner_id = p_to_learner_id AND is_active AND ended_at IS NULL;
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'fn_induction_admin_bulk_reassign_mentees: target is not an active Senior Peer Mentor on this induction';
  END IF;

  UPDATE public.induction_feedback_volunteer_group g
     SET volunteer_id = v_to,
         -- Chained covers still revert to the TRUE owner: if this row is already
         -- under cover, keep its original mentor rather than recording the
         -- previous stand-in. And if we are handing back TO the original owner,
         -- that is a revert, not a new cover.
         covering_for_volunteer_id = CASE
           WHEN p_cover_until IS NULL THEN NULL
           WHEN COALESCE(g.covering_for_volunteer_id, v_from) = v_to THEN NULL
           ELSE COALESCE(g.covering_for_volunteer_id, v_from)
         END,
         cover_until = CASE
           WHEN p_cover_until IS NULL THEN NULL
           WHEN COALESCE(g.covering_for_volunteer_id, v_from) = v_to THEN NULL
           ELSE p_cover_until
         END,
         cover_started_at = CASE
           WHEN p_cover_until IS NULL THEN NULL
           WHEN COALESCE(g.covering_for_volunteer_id, v_from) = v_to THEN NULL
           ELSE COALESCE(g.cover_started_at, now())
         END,
         cover_note   = CASE WHEN p_cover_until IS NULL THEN NULL ELSE p_note END,
         cover_set_by = CASE WHEN p_cover_until IS NULL THEN NULL ELSE auth.uid() END,
         updated_at   = now()
   WHERE g.event_id = p_event_id
     AND g.volunteer_id = v_from
     AND (p_learner_ids IS NULL OR g.learner_id = ANY (p_learner_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT count(*)::int INTO v_size
  FROM public.induction_feedback_volunteer_group WHERE volunteer_id = v_to;

  moved             := v_n;
  target_group_size := v_size;
  target_capacity   := v_cap;
  over_capacity     := v_size > v_cap;
  RETURN NEXT;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_admin_bulk_reassign_mentees(uuid, uuid, uuid, date, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_admin_bulk_reassign_mentees(uuid, uuid, uuid, date, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_admin_bulk_reassign_mentees(uuid, uuid, uuid, date, uuid[], text) TO authenticated;

-- ── 5. End a cover early / list who is currently covering ────────────────────
--
-- p_original_learner_id NULL → hand back every active cover on the event.
CREATE OR REPLACE FUNCTION public.fn_induction_admin_end_mentor_cover(
  p_event_id            uuid,
  p_original_learner_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_n integer := 0;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_admin_end_mentor_cover: not an induction event'; END IF;
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_end_mentor_cover: not authorized';
  END IF;

  UPDATE public.induction_feedback_volunteer_group g
     SET volunteer_id              = g.covering_for_volunteer_id,
         covering_for_volunteer_id = NULL,
         cover_until               = NULL,
         cover_started_at          = NULL,
         cover_note                = NULL,
         cover_set_by              = NULL,
         updated_at                = now()
   WHERE g.event_id = p_event_id
     AND g.covering_for_volunteer_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.induction_feedback_volunteers v
                  WHERE v.id = g.covering_for_volunteer_id
                    AND v.is_active AND v.ended_at IS NULL
                    AND (p_original_learner_id IS NULL OR v.learner_id = p_original_learner_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_admin_end_mentor_cover(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_admin_end_mentor_cover(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_admin_end_mentor_cover(uuid, uuid) TO authenticated;

-- One row per (stand-in, original mentor) pair currently in force.
CREATE OR REPLACE FUNCTION public.fn_induction_admin_mentor_covers(p_event_id uuid)
RETURNS TABLE(covering_learner_id uuid, covering_name text,
              original_learner_id uuid, original_name text,
              fresher_count integer, cover_until date, cover_note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_admin_mentor_covers: not an induction event'; END IF;
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_mentor_covers: not authorized';
  END IF;

  PERFORM public.fn_induction_expire_mentor_covers(p_event_id);

  RETURN QUERY
  SELECT cv.learner_id,
         btrim(coalesce(clp.first_name,'') || ' ' || coalesce(clp.last_name,''))::text,
         ov.learner_id,
         btrim(coalesce(olp.first_name,'') || ' ' || coalesce(olp.last_name,''))::text,
         count(*)::int,
         max(g.cover_until),
         max(g.cover_note)
  FROM public.induction_feedback_volunteer_group g
  JOIN public.induction_feedback_volunteers cv ON cv.id = g.volunteer_id
  JOIN public.learners_profiles clp ON clp.id = cv.learner_id
  JOIN public.induction_feedback_volunteers ov ON ov.id = g.covering_for_volunteer_id
  JOIN public.learners_profiles olp ON olp.id = ov.learner_id
  WHERE g.event_id = p_event_id
    AND g.covering_for_volunteer_id IS NOT NULL
  GROUP BY cv.learner_id, clp.first_name, clp.last_name, ov.learner_id, olp.first_name, olp.last_name
  ORDER BY 2, 4;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_covers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_covers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_admin_mentor_covers(uuid) TO authenticated;

-- ── 6. Mentee list carries its cover state ──────────────────────────────────
--
-- Return type gains the cover columns, so DROP first. Now VOLATILE: it sweeps
-- expired covers before reading, so the admin console can never show a cover
-- that ended yesterday as though it were still running.
DROP FUNCTION IF EXISTS public.fn_induction_admin_mentor_mentees(uuid);

CREATE FUNCTION public.fn_induction_admin_mentor_mentees(p_event_id uuid)
RETURNS TABLE(mentor_learner_id uuid, fresher_learner_id uuid, fresher_name text,
              fresher_register text, has_feedback boolean,
              is_cover boolean, cover_until date,
              original_mentor_learner_id uuid, original_mentor_name text,
              -- Identity aids, for the same reason the attendance roster carries
              -- them: register_number is still NULL for most freshers at
              -- induction time, so a mentee row is otherwise just a name. The
              -- programme is what a fresher means by "my department" (every
              -- engineering fresher's department_id resolves to the shared
              -- first-year Science & Humanities row, so department cannot tell
              -- EEE from CSE), and the mobile is how a mentor actually reaches
              -- them.
              program_name text, student_mobile text, father_mobile text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_admin_mentor_mentees: not an induction event'; END IF;
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_mentor_mentees: not authorized';
  END IF;

  PERFORM public.fn_induction_expire_mentor_covers(p_event_id);

  RETURN QUERY
  SELECT v.learner_id,
         g.learner_id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         EXISTS (SELECT 1 FROM public.event_session_feedback f
                 WHERE f.event_id = v.event_id AND f.learner_id = g.learner_id),
         (g.covering_for_volunteer_id IS NOT NULL),
         g.cover_until,
         ov.learner_id,
         btrim(coalesce(olp.first_name,'') || ' ' || coalesce(olp.last_name,''))::text,
         pr.program_name::text,
         lp.student_mobile::text,
         lp.father_mobile::text
  FROM public.induction_feedback_volunteers v
  JOIN public.induction_feedback_volunteer_group g ON g.volunteer_id = v.id
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.induction_feedback_volunteers ov ON ov.id = g.covering_for_volunteer_id
  LEFT JOIN public.learners_profiles olp ON olp.id = ov.learner_id
  WHERE v.event_id = p_event_id AND v.is_active
  ORDER BY 3;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) TO authenticated;

-- ── 7. Session roster carries its Senior Peer Mentor ────────────────────────
--
-- Return type gains mentor_learner_id / mentor_name, so DROP first. The join is
-- through induction_feedback_volunteer_group, which is UNIQUE (event_id,
-- learner_id) — one mentor per fresher, so the roster cannot fan out.
DROP FUNCTION IF EXISTS public.fn_induction_session_roster(uuid);

CREATE FUNCTION public.fn_induction_session_roster(p_session_id uuid)
RETURNS TABLE(learner_id uuid, name text, register_number text, batch_label text, status text,
              program_name text, father_mobile text,
              mentor_learner_id uuid, mentor_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_batch UUID; v_inst UUID; v_kind TEXT;
BEGIN
  SELECT s.event_id, s.batch_id, s.kind INTO v_event, v_batch, v_kind
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid())
          -- registration desk — an ACTIVE Senior Peer Mentor of this event reads
          -- the whole roster (that is the point of a desk). Untrained is fine for
          -- reading; the write RPC applies its own registration rules.
          OR (v_kind = 'registration' AND EXISTS (
                SELECT 1 FROM public.induction_feedback_volunteers v
                WHERE v.event_id = v_event
                  AND v.learner_id = get_my_learner_id()
                  AND v.is_active
                  AND v.ended_at IS NULL))) THEN
    RAISE EXCEPTION 'fn_induction_session_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         a.status::text,
         pr.program_name::text,
         lp.father_mobile::text,
         -- The mentor who is walking this fresher RIGHT NOW. Under a temporary
         -- cover that is the stand-in, which is what an attendance-taker needs:
         -- filtering by mentor should surface whoever is actually on the floor.
         mv.learner_id::uuid,
         btrim(coalesce(mlp.first_name,'') || ' ' || coalesce(mlp.last_name,''))::text
  FROM public.induction_enrollment e
  JOIN public.learners_profiles lp ON lp.id = e.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.induction_batches b ON b.id = e.batch_id
  LEFT JOIN public.event_session_attendance a ON a.session_id = p_session_id AND a.learner_id = e.learner_id
  LEFT JOIN public.induction_feedback_volunteer_group g
         ON g.event_id = v_event AND g.learner_id = e.learner_id
  LEFT JOIN public.induction_feedback_volunteers mv ON mv.id = g.volunteer_id AND mv.is_active
  LEFT JOIN public.learners_profiles mlp ON mlp.id = mv.learner_id
  WHERE e.event_id = v_event
    AND (v_batch IS NULL OR e.batch_id = v_batch)
  ORDER BY 2;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_session_roster(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_session_roster(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_session_roster(uuid) TO authenticated;

-- ── 8. A mentor's own group carries programme + mobile ──────────────────────
--
-- The mentor's phone view (My Induction Feedback → Attendance) listed each
-- fresher as a bare name: register_number is NULL for the whole cohort at
-- induction time, so the identity line rendered an em-dash on every row. The
-- programme was already returned here; the MOBILE was not, and a mentor whose
-- job is to walk 11 freshers needs to be able to reach them.
--
-- Return type gains two columns, so DROP first. Deliberate exposure note: this
-- hands a fresher's contact number to a senior STUDENT. It is scoped hard — the
-- function returns only the caller's OWN assigned group (g.volunteer_id = v_vol),
-- so a mentor can never enumerate the cohort, and an ended/inactive mentor gets
-- nothing at all.
DROP FUNCTION IF EXISTS public.fn_induction_my_feedback_group(uuid);

CREATE FUNCTION public.fn_induction_my_feedback_group(p_session_id uuid)
RETURNS TABLE(learner_id uuid, name text, register_number text, batch_label text,
              has_account boolean, captured boolean, capture_method text,
              program_name text, student_mobile text, father_mobile text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_sbatch UUID; v_my_learner UUID; v_vol UUID; v_inst UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not authenticated'; END IF;
  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  -- Guard NULL like the sibling RPCs. Without it, has_account's
  -- institution-scoped EXISTS is false for everyone, mislabeling every fresher
  -- as 'no account'. Fail closed on a missing-program session.
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not an induction session'; END IF;

  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not a learner'; END IF;
  SELECT v.id INTO v_vol
  FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not an assigned feedback volunteer'; END IF;

  RETURN QUERY
  SELECT lp.id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         -- has_account institution-scoped via EXISTS (no profiles JOIN -> no
         -- duplicate rows, and a profile in ANOTHER college doesn't count).
         EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = lp.id AND p.institution_id = v_inst) AS has_account,
         (f.id IS NOT NULL) AS captured,
         f.capture_method::text,
         pr.program_name::text,
         lp.student_mobile::text,
         lp.father_mobile::text
  FROM public.induction_feedback_volunteer_group g
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = v_event AND ie.learner_id = g.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN public.event_session_feedback f ON f.session_id = p_session_id AND f.learner_id = g.learner_id
  WHERE g.volunteer_id = v_vol
    AND (v_sbatch IS NULL OR ie.batch_id = v_sbatch)   -- batch-specific session -> only its batch
  ORDER BY 5, 6, 2;  -- no-account first, then uncaptured, then name
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_my_feedback_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_my_feedback_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_my_feedback_group(uuid) TO authenticated;
