-- ============================================================================
-- 3924-catchup-apply.sql          ROLLS BACK BY DEFAULT. Nothing persists.
--
-- 🛑 NOT RUN by the lane. The desk runs the preview
--    (scripts/rehearsals/3924-catchup-preview.sql), the Director reads the
--    names, and only then, on his word, this file — and only then with the
--    final line changed from ROLLBACK to COMMIT.
--
-- WHAT IT DOES. The ONE-TIME catch-up the Director ruled for on 2026-09-19
-- 04:58: every reserved/admitted learner who already carries a Present mark is
-- moved to `active`, once. Nothing recurring, nothing automatic, nothing in a
-- migration.
--
-- ── 🔒 IT ACTIVATES ONLY THE NAMES HE READ (repair round 2) ─────────────────
--
--   His ruling is that he sees the list of names FIRST. A script that
--   recomputes its own set at run time does not honour that: Present marks land
--   every day, so between the preview he approved and the apply he authorised,
--   learners he never saw can walk into the set. That is not a race worth
--   arguing about — it is the ordinary behaviour of the product.
--
--   So the preview ends with an APPROVED-SET TOKEN — the ids, the count and an
--   md5 of the sorted ids — and this file takes that token at the top. It then:
--     · REFUSES to run while the token is still the placeholder, or empty
--     · REFUSES if the pasted ids do not match the pasted count
--     · REFUSES if the pasted ids do not hash to the pasted md5
--     · computes the live eligible set with the SAME CTE the preview used
--     · activates exactly (approved ∩ still-eligible) — an id the Director did
--       not read cannot be activated by this run, whatever the live query says
--     · REPORTS, without touching, the two differences:
--         — eligible now but NOT on his list  → left for the ordinary
--           first-present rule, or for a later catch-up he approves separately
--         — on his list but no longer eligible → already active, withdrawn,
--           status moved; skipped, and named so he can see who
--
--   The md5 is taken over the ids SORTED and comma-joined, so reformatting or
--   reordering the paste is harmless while adding, removing or altering one id
--   is caught.
--
-- IT GOES THROUGH THE SAME ACTIVATION PATH AS THE TRIGGER.
--   `fn_activate_learner_on_first_present()` RETURNS trigger and reads NEW.*,
--   so it cannot be called for a mark recorded in the past. Repair round 1
--   therefore lifted the promote-and-audit step into
--   `fn_activate_learners_for_first_present(...)` — one body, called by the
--   trigger and by this file. THIS FILE CONTAINS NO STATUS UPDATE OF ITS OWN.
--   That is deliberate: a second hand-rolled UPDATE is how two routes to
--   `active` drift apart, and how an audit row ends up shaped differently
--   depending on which route wrote it.
--
--   So every learner activated here gets exactly the history row the trigger
--   writes: reason_code `first_present_attendance`, the attendance record id,
--   the marker, the from-status, and `fee_thresholds_bypassed: true`. The only
--   difference is `metadata.source`, which reads
--   `first_present_catchup_2026_09_19` instead of the trigger's own name, and
--   `metadata.trigger_op`, which reads `CATCHUP`. That is the field an office
--   user needs to tell "activated by the one-time catch-up" from "activated by
--   a mark taken since", and it costs nothing.
--
-- A FAILURE ON ONE LEARNER DOES NOT ABORT THE REST. Each activation runs in its
-- own exception block and a failure is written to
-- `public.learner_activation_failures`, exactly as the trigger does it, so the
-- run reports rather than half-finishing silently.
--
-- THE SET IS DEFINED ONCE. The `present_marks` / `first_present` /
-- `catchup_set` CTE below is character-for-character identical to the one in
-- the preview file, so the set the preview described is the set this file
-- compares against. If you edit one, edit the other — a `diff` of the two CTEs
-- must come back empty.
--
-- IDEMPOTENT. A learner already `active` fails the allowlist inside the shared
-- function, so the UPDATE matches nothing and no history row is written.
-- Running this twice activates the same people once.
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE APPROVED LIST — PASTE THE PREVIEW'S TOKEN HERE
--
--    `3924-catchup-preview.sql` ends with one result labelled
--    "PASTE THIS INTO THE APPLY SCRIPT", carrying three values:
--    `approved_count`, `approved_md5` and `approved_ids`. Copy all three into
--    the marked slots below, exactly as printed.
--
--    WHY THIS EXISTS. Present marks land every day. Without a frozen list this
--    script would recompute its own set at run time and could activate learners
--    the Director never saw — and his ruling is that he sees the list of names
--    FIRST. The list below is the list. Ids outside it are never activated by
--    this run, whatever the live query says.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE catchup_frozen_input (
  approved_ids   text,
  approved_count integer,
  approved_md5   text
) ON COMMIT DROP;

INSERT INTO catchup_frozen_input (approved_ids, approved_count, approved_md5) VALUES (

-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼ PASTE FROM THE PREVIEW — BEGIN ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

  'PASTE_approved_ids_HERE',   -- approved_ids   — the comma-separated uuid list
  0,                           -- approved_count — the number of names he read
  'PASTE_approved_md5_HERE'    -- approved_md5   — the checksum of that list

-- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ PASTE FROM THE PREVIEW — END ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE LIVE ELIGIBLE SET, computed fresh at run time.
--
--    This is NOT what gets activated. It is one half of a comparison: what is
--    activated is (frozen ∩ live). The live set is needed to answer three
--    questions the desk must be able to answer before committing —
--      · which approved names are still eligible          → ACTIVATE
--      · which are eligible now but were not on his list  → REPORT ONLY
--      · which were on his list and are no longer eligible → REPORT ONLY
-- ════════════════════════════════════════════════════════════════════════════
--
-- ↓↓↓ THE SET DEFINITION. Byte-identical to the CTE in
--     3924-catchup-preview.sql — a literal `diff` of the two comes back empty.
--     That is why it starts at column 0. Do not re-indent it, and if you edit
--     one, edit the other. ↓↓↓
CREATE TEMP TABLE catchup_live ON COMMIT DROP AS
WITH present_marks AS (
  SELECT
    (s.rec ->> 'student_id')::uuid AS learner_id,
    sa.id                          AS student_attendance_id,
    sa.attendance_date             AS attendance_date,
    sa.section_id                  AS section_id,
    sa.timetable_id                AS timetable_id,
    sa.institution_id              AS institution_id,
    sa.marked_by                   AS marked_by,
    sa.created_at                  AS marked_at
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
              THEN sa.attendance_data ELSE '{}'::jsonb END) AS per(period_key, period_val)
  CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
              THEN per.period_val -> 'students' ELSE '[]'::jsonb END) AS s(rec)
  WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
    AND COALESCE(s.rec ->> 'student_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
first_present AS (
  SELECT DISTINCT ON (pm.learner_id)
         pm.learner_id, pm.student_attendance_id, pm.attendance_date,
         pm.section_id, pm.timetable_id, pm.institution_id, pm.marked_by, pm.marked_at
  FROM present_marks pm
  ORDER BY pm.learner_id, pm.attendance_date ASC, pm.marked_at ASC, pm.student_attendance_id ASC
),
catchup_set AS (
  SELECT fp.learner_id, fp.student_attendance_id, fp.attendance_date,
         fp.section_id, fp.timetable_id, fp.institution_id, fp.marked_by,
         lp.lifecycle_status::text AS current_status
  FROM first_present fp
  JOIN public.learners_profiles lp ON lp.id = fp.learner_id
  WHERE lp.lifecycle_status::text IN ('reserved', 'admitted')
)
SELECT * FROM catchup_set;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. VERIFY THE LIST, THEN ACTIVATE ONLY WHAT IS IN BOTH SETS.
-- ════════════════════════════════════════════════════════════════════════════
DO $catchup$
DECLARE
  r            record;
  v_raw        text;
  v_exp_count  integer;
  v_exp_md5    text;
  v_frozen     uuid[];
  v_canonical  text;
  v_actual_md5 text;
  v_live       integer := 0;
  v_seen       integer := 0;
  v_moved      integer := 0;
  v_failed     integer := 0;
  v_new_ids    uuid[];
  v_gone_ids   uuid[];
  v_err_state  text;
  v_err_msg    text;
BEGIN
  IF to_regprocedure('public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'migration 20260919005000_harden_first_present_activation.sql is not applied here — this file refuses to hand-roll the activation';
  END IF;

  SELECT f.approved_ids, f.approved_count, f.approved_md5
    INTO v_raw, v_exp_count, v_exp_md5
    FROM catchup_frozen_input f;

  -- ── 3a. The list must actually have been pasted ──────────────────────────
  -- An unedited file must REFUSE, never quietly activate zero people and report
  -- success — "it ran and nothing happened" reads exactly like "there was
  -- nobody to activate".
  IF v_raw IS NULL OR btrim(v_raw, E' \t\r\n') = ''
     OR v_raw LIKE '%PASTE%'
     OR v_exp_md5 IS NULL OR v_exp_md5 LIKE '%PASTE%' THEN
    RAISE EXCEPTION
      'the approved list has not been pasted in. Run scripts/rehearsals/3924-catchup-preview.sql, let the Director read the names, then paste its approved_ids / approved_count / approved_md5 into the marked block at the top of this file'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_exp_count IS NULL OR v_exp_count <= 0 THEN
    RAISE EXCEPTION
      'approved_count is % — paste the count the preview printed', coalesce(v_exp_count::text, 'NULL')
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── 3b. Parse, canonicalise, and check the list is the one he approved ───
  -- The md5 is taken over the SORTED, comma-joined ids, so reformatting or
  -- reordering the paste is harmless while adding, removing or altering an id
  -- is not. Whitespace and newlines inside the paste are tolerated.
  SELECT array_agg(DISTINCT t.x ORDER BY t.x)
    INTO v_frozen
    FROM (
      SELECT btrim(e, E' \t\r\n')::uuid AS x
      FROM unnest(string_to_array(v_raw, ',')) AS e
      WHERE btrim(e, E' \t\r\n') <> ''
    ) t;

  IF v_frozen IS NULL OR cardinality(v_frozen) = 0 THEN
    RAISE EXCEPTION 'the pasted approved_ids parsed to no learner at all'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT string_agg(x::text, ',' ORDER BY x) INTO v_canonical FROM unnest(v_frozen) AS x;
  v_actual_md5 := md5(v_canonical);

  IF cardinality(v_frozen) <> v_exp_count THEN
    RAISE EXCEPTION
      'approved list COUNT MISMATCH: the pasted ids hold % learner(s), approved_count says %. Nothing has been activated',
      cardinality(v_frozen), v_exp_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_actual_md5 <> lower(btrim(v_exp_md5, E' \t\r\n')) THEN
    RAISE EXCEPTION
      'approved list CHECKSUM MISMATCH: the pasted ids hash to %, approved_md5 says %. The list is not the one the preview produced. Nothing has been activated',
      v_actual_md5, lower(btrim(v_exp_md5, E' \t\r\n'))
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_live FROM catchup_live;

  -- ── 3c. The two differences. REPORTED, never acted on. ───────────────────
  SELECT array_agg(cl.learner_id ORDER BY cl.learner_id) INTO v_new_ids
    FROM catchup_live cl
   WHERE NOT (cl.learner_id = ANY(v_frozen));

  SELECT array_agg(f ORDER BY f) INTO v_gone_ids
    FROM unnest(v_frozen) AS f
   WHERE NOT EXISTS (SELECT 1 FROM catchup_live cl WHERE cl.learner_id = f);

  IF v_new_ids IS NOT NULL THEN
    RAISE NOTICE
      'catch-up: % learner(s) are eligible NOW but were NOT on the approved list — NOT activated, left for the ordinary first-present rule or a later catch-up: %',
      cardinality(v_new_ids), v_new_ids;
  END IF;

  IF v_gone_ids IS NOT NULL THEN
    RAISE NOTICE
      'catch-up: % approved learner(s) are no longer eligible (already active, withdrawn, status changed) — NOT activated: %',
      cardinality(v_gone_ids), v_gone_ids;
  END IF;

  -- ── 3d. Activate the intersection, and nothing else ──────────────────────
  -- `cl.learner_id = ANY(v_frozen)` is the whole guarantee: an id the Director
  -- did not read cannot enter this loop.
  FOR r IN
    SELECT cl.* FROM catchup_live cl
     WHERE cl.learner_id = ANY(v_frozen)
     ORDER BY cl.learner_id
  LOOP
    v_seen := v_seen + 1;
    BEGIN
      v_moved := v_moved + public.fn_activate_learners_for_first_present(
        ARRAY[r.learner_id],
        r.student_attendance_id,
        r.attendance_date,
        r.section_id,
        r.timetable_id,
        r.institution_id,
        r.marked_by,
        NULL::uuid,                       -- changed_by: an operator session has no auth.uid()
        'CATCHUP',
        'first_present_catchup_2026_09_19');
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
      BEGIN
        INSERT INTO public.learner_activation_failures
          (student_attendance_id, attendance_date, section_id, timetable_id,
           institution_id, trigger_op, learner_ids, marked_by, attempted_by,
           sqlstate, error_message)
        VALUES
          (r.student_attendance_id, r.attendance_date, r.section_id, r.timetable_id,
           r.institution_id, 'CATCHUP', ARRAY[r.learner_id], r.marked_by, NULL,
           v_err_state, COALESCE(v_err_msg, 'unknown error'));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catch-up: learner % failed AND the failure could not be recorded: % %',
          r.learner_id, SQLSTATE, SQLERRM;
      END;
      RAISE WARNING 'catch-up: learner % NOT activated (%): %', r.learner_id, v_err_state, v_err_msg;
    END;
  END LOOP;

  RAISE NOTICE
    'one-time first-present catch-up: % approved, % still eligible, % activated, % failed, % eligible-but-not-approved left alone, % approved-but-no-longer-eligible skipped (live eligible set was %)',
    cardinality(v_frozen), v_seen, v_moved, v_failed,
    COALESCE(cardinality(v_new_ids), 0), COALESCE(cardinality(v_gone_ids), 0), v_live;

  -- ── 3e. The count checks ─────────────────────────────────────────────────
  IF v_moved + v_failed <> v_seen THEN
    RAISE EXCEPTION
      'catch-up count check FAILED: % processed, % activated, % failed — the numbers do not close, nothing is being committed',
      v_seen, v_moved, v_failed;
  END IF;

  IF v_seen + COALESCE(cardinality(v_gone_ids), 0) <> cardinality(v_frozen) THEN
    RAISE EXCEPTION
      'catch-up set check FAILED: % processed + % skipped <> % approved — nothing is being committed',
      v_seen, COALESCE(cardinality(v_gone_ids), 0), cardinality(v_frozen);
  END IF;
END
$catchup$;


-- ── The proof the desk reads back before deciding to commit ─────────────────
-- Run inside the same transaction, so it reflects what the block above did.
SELECT
  (SELECT count(*) FROM public.learners_profile_status_history
    WHERE reason_code = 'first_present_attendance'
      AND metadata ->> 'source' = 'first_present_catchup_2026_09_19')  AS history_rows_written,
  (SELECT count(*) FROM public.learners_profiles
    WHERE lifecycle_status::text = 'active')                           AS active_learners_now,
  (SELECT count(*) FROM public.learners_profiles
    WHERE lifecycle_status::text IN ('reserved','admitted'))           AS still_provisional,
  (SELECT count(*) FROM public.learner_activation_failures
    WHERE trigger_op = 'CATCHUP')                                      AS catchup_failures;

-- Named, so the two differences are read rather than counted. Both are
-- REPORTS: nobody listed here was touched by this run.
WITH frozen_ids AS (
  SELECT DISTINCT btrim(e, E' \t\r\n')::uuid AS learner_id
  FROM catchup_frozen_input f,
       unnest(string_to_array(f.approved_ids, ',')) AS e
  WHERE btrim(e, E' \t\r\n') <> ''
)
SELECT
  'ELIGIBLE NOW BUT NOT ON THE APPROVED LIST — left alone'              AS finding,
  btrim(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')) AS learner_name,
  COALESCE(lp.register_number, lp.roll_number, lp.application_id, '—')  AS register_or_roll,
  cl.current_status                                                     AS status_at_run,
  cl.attendance_date                                                    AS first_present_on,
  cl.learner_id
FROM catchup_live cl
JOIN public.learners_profiles lp ON lp.id = cl.learner_id
WHERE NOT EXISTS (SELECT 1 FROM frozen_ids fi WHERE fi.learner_id = cl.learner_id)
UNION ALL
SELECT
  'ON THE APPROVED LIST BUT NO LONGER ELIGIBLE — skipped'               AS finding,
  btrim(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')) AS learner_name,
  COALESCE(lp.register_number, lp.roll_number, lp.application_id, '—')  AS register_or_roll,
  lp.lifecycle_status::text                                             AS status_at_run,
  NULL::date                                                            AS first_present_on,
  lp.id                                                                 AS learner_id
FROM frozen_ids fi
JOIN public.learners_profiles lp ON lp.id = fi.learner_id
WHERE NOT EXISTS (SELECT 1 FROM catchup_live cl WHERE cl.learner_id = fi.learner_id)
ORDER BY finding, learner_name;


-- ════════════════════════════════════════════════════════════════════════════
-- ⬇⬇⬇  THE ONE LINE TO CHANGE.  ROLLBACK = rehearsal. COMMIT = it happens.  ⬇⬇⬇
-- Change to COMMIT; only on the Director's word, after he has read the preview.
ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════
