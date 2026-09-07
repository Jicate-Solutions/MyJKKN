-- =============================================================================
-- 20260816020000_work_signal_marked_same_day.sql
-- HOW MANY CLASSES WERE MARKED THE SAME DAY — the one instrument that can tell
-- whether a change to the marking screen makes marking LATER.
--
-- ⚠️ APPLIED TO PRODUCTION 2026-08-08. This header previously read "FILE ONLY /
-- NOT APPLIED — Director-gated" and that stopped being true when an earlier
-- version of this same file was applied shortly after #2924 merged. The version
-- that went live is the one whose timestamp guard is corrected below, so
-- RE-APPLYING this file is the intended remedy — the §0 guard makes that a safe
-- no-op-or-upgrade rather than a blind overwrite.
--
-- Shipped DELIBERATELY BEFORE the lesson gate it is meant to measure: a
-- before/after reading needs the BEFORE.
--
-- THE PROBLEM. `fn_work_signals_for` derives every marking number from
-- `sa.attendance_date` alone, so a class marked twenty-one days late is
-- indistinguishable from one marked in the room while it was happening. Nothing
-- anywhere in the estate currently measures the LAG between the class and the
-- act of marking it, which means a gate that quietly pushes marking to the
-- weekend would land, take effect, and leave no trace.
--
-- WHY NOT created_at (this is the trap, and it is a convincing one):
--   `student_attendance` holds one ROW PER DAY PER SECTION and packs the day's
--   periods into the `attendance_data` jsonb — measured 2026-08-08, ~2.74
--   periods per row. `created_at` is stamped when the FIRST period of that day
--   was inserted; every later period arrives by UPDATE and inherits it. A period
--   marked three weeks late therefore carries the punctual timestamp of period
--   one. `updated_at` is no better: it is client-supplied, and a live row was
--   observed where `updated_at` PRECEDES `created_at`.
--   The repo already knew this — 20260722160000_att_reconcile_v2 line 30 says
--   the marking timestamp is `marked_at` "(NOT the row created_at)".
--
-- THE CORRECT SOURCE is per-period: `marked_by_details.marked_at`, the natural
-- partner of `marked_by_details.marker_id` that this function ALREADY reads to
-- compute v_personal_marked. Same object, same period, same write.
--
-- WHAT THIS FILE CHANGES — four parts, all four load-bearing:
--   1. DECLARE v_personal_same_day.
--   2. The existing v_personal_marked SELECT gains a second aggregate over the
--      SAME scan: `count(*) FILTER (WHERE <marked on the day>)`. Both counters
--      now come out of ONE pass with ONE predicate, so they cannot drift apart
--      and the subset relation is structural — a FILTER count can never exceed
--      the count it filters.
--   3. One row in the inline VALUES list.
--   4. One row in the work_signal_types registry.
--   Parts 3 and 4 MUST land together — see the emitter note below.
--   Plus one helper, fn_try_ist_date — see the cast note below.
--
-- 🔴 THE EMITTER IS AN INNER JOIN, AND IT IS ALREADY BITING. Signals are
--    emitted by joining work_signal_types against the inline VALUES list, so a
--    key registered WITHOUT a VALUES row is silently dropped — no error, no log,
--    no chip. `marks_coverage` has been active in the registry since
--    20260717170852 and has never appeared in VALUES: it has been dark its whole
--    life, and the existing battery could not see it because that battery
--    asserts a hardcoded key list. Verified live 2026-08-08: 14 active registry
--    rows, 13 VALUES rows. This file adds BOTH halves for its own key, and
--    __tests__/work-signals/registry-values-parity.test.ts now fails on any key
--    registered without an emitter — with marks_coverage pinned as the one
--    known, documented gap so a future fix must shrink that list deliberately.
--
-- BODY PROVENANCE. DDL reaches this database through the Management API and the
-- migration ledger does not always carry it, so six files define this function
-- and the newest file is not automatically what is running. The body below was
-- taken VERBATIM from `pg_get_functiondef` on production 2026-08-08 and was
-- verified byte-identical (whitespace-normalised, 7027 chars both sides) to
-- 20260731190000. Only the four parts above differ.
--
-- 🕐 `AT TIME ZONE 'Asia/Kolkata'` IS LOAD-BEARING, NOT DECORATION. Measured on
--    production 2026-08-08 over the trailing 30 days: IST reads 6,651 same-day
--    periods, UTC reads 6,673 — they DISAGREE on 22 periods. (An earlier reading
--    found them equal; that was a coincidence of marking hours, and it has
--    already stopped being true.) `attendance_date` is a calendar date in IST;
--    comparing it against a UTC-truncated instant credits a class marked at
--    02:30 IST to the previous day.
--
-- 🛡️ THE CAST CANNOT RAISE, AND A REGEX WOULD NOT HAVE BEEN ENOUGH.
--    `marked_at` is client-written text inside a jsonb blob. Across ALL 31,037
--    attributable periods on production (2026-08-08) there are zero empty
--    strings and zero non-ISO values, so none of this changes a number today —
--    but 1,028 of those periods carry a marker_id with NO marked_at at all,
--    which proves the field is not written by every path.
--    A single malformed value would make a bare `::timestamptz` RAISE. The
--    exception leaves this function, WorkSignalsService resolves any error to
--    null, and the card renders nothing on null — so ONE poisoned string would
--    silently blank My Pulse, with no error shown to anyone.
--    Two earlier drafts got this wrong the SAME way — by enumerating.
--    Draft 1 guarded with `~ '^\d{4}-\d{2}-\d{2}'` and claimed that made a
--    raise impossible. A prefix regex tests SHAPE, not VALIDITY: '2026-13-40',
--    '2026-02-30' and '2026-08-08junk' all pass it and raise anyway, and no
--    regex can exclude 31 February.
--    Draft 2 — THE VERSION THAT MERGED AND WAS APPLIED TO PRODUCTION — trapped
--    22007 and 22008 by name. Review then found '+99:00' raises 22009 and a
--    misspelt zone 'Asia/Kolkatta' raises 22023, both escaping. Verified.
--    A list that needed extending twice is the wrong shape of rule, so the
--    cast now goes through fn_try_ist_date, which swallows class 22 and
--    re-raises everything else. A NULL simply fails the day comparison, so a
--    malformed value is not counted and is not called late either.
--    Scope is settled by the query shape, not by the planner: the marker test
--    lives in the WHERE and the day test in an aggregate FILTER, and FILTER is
--    applied only to rows the WHERE already admitted. Another marker's poisoned
--    row can therefore never be parsed on this caller's behalf. (The earlier
--    draft put both in the WHERE, where Postgres may evaluate conjuncts in any
--    order — the same reordering freedom that made a bare AND unsafe would have
--    let one bad row anywhere in the window blank the card for everyone.)
--
-- 🔢 WHAT THE NUMBER DOES NOT SAY. 526 of 8,896 periods in the trailing 30 days
--    (5.9%) carry no `marked_by_details` at all, spanning 2025-07-09 to
--    2026-08-07 — an ACTIVE second write path, not legacy residue. Those periods
--    are already excluded from v_personal_marked, so the two counters stay
--    internally consistent, but they are UNKNOWN, not late. The label counts a
--    positive act and makes no claim about the remainder; the description says
--    so in as many words. Nothing here may be read as an accusation.
--
-- ⚠️ TWO LIVE DEFINITIONS OF "ON TIME" NOW EXIST. `fn_att_reconcile_propose`
--    counts on-time as within 15 minutes of period start; this counts the
--    calendar day. A person can be green here and late there. Flagged for a
--    deliberate decision — NOT resolved in this file.
--
-- ⚠️ READ THE NEW CHIP AGAINST "you: N", NOT AGAINST THE BIG NUMBER.
--    `sessions_marked`'s headline is the ASSIGNED count (your classes, marked by
--    anyone); this new chip counts what the caller PERSONALLY marked. Side by
--    side the new number will look smaller for reasons that have nothing to do
--    with timeliness. Its true partner is the small "you:" number underneath.
--
-- SELF-SCOPED, NEVER RANKED. Like every signal in this engine: the caller's own
-- number only, no comparison, no score. It is an instrument, not an evaluation.
-- =============================================================================

-- ⚠️ THIS FILE IS ONE TRANSACTION, AND THAT IS WHAT MAKES §0 A GUARD.
-- A RAISE inside a standalone DO block aborts that block — it does NOT stop the
-- next statement from being pasted and executed, and this file reaches the
-- database out-of-band, statement by statement. Without the BEGIN/COMMIT below,
-- §0 could refuse and the CREATE OR REPLACE could still overwrite a drifted
-- engine one statement later, which is the exact hazard §0 exists to prevent.
-- The check and the write have to be structurally indivisible, not merely
-- adjacent. If your apply path already opens a transaction, strip these two
-- lines — do not leave the file un-wrapped in one that does not.
BEGIN;

-- ---------------------------------------------------------------------------
-- §0 DRIFT GUARD — refuse to apply on top of a body this file did not read.
--
-- The CREATE OR REPLACE below rewrites the WHOLE ~7,027-char engine from a
-- snapshot taken 2026-08-08. Application is Director-gated to an unknown later
-- date, six files define this function, and DDL reaches this database
-- out-of-band through the Management API without always landing in the ledger.
-- Applying a stale body weeks later would silently revert whatever shipped in
-- between, with no error and no signal — the exact hazard this file's header
-- warns about, which would be an odd thing to then walk into.
--
-- So: proceed only if the live body is one this file KNOWS — either the
-- 2026-08-08 snapshot, or the body that an earlier version of this file already
-- installed, or this exact revision (making a re-run a no-op). Anything else
-- aborts, and whoever applies it re-reads the live body first.
--
-- ⚠️ THE IDEMPOTENCY TEST IS A REVISION TAG, NOT A FEATURE SUBSTRING, and that
-- distinction is the whole guard. A first version asked
-- `position('v_personal_same_day' in v_def) = 0` — but once this feature is
-- applied that substring is present FOREVER, so the guard would pass for every
-- future body containing it and silently overwrite whatever shipped next. A
-- guard that disarms itself the first time it succeeds is worse than none: it
-- tells whoever re-applies that the overwrite is safe. The tag below changes
-- whenever this file's body changes, so a genuinely different engine fails it.
--
-- KEEP THE TAG AND THE BODY IN LOCKSTEP: if you edit the function, bump the tag
-- in BOTH places (the DECLARE below and the marker inside the body).
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_def text;
  v_n   int;
  -- Must match the marker inside the function body below, exactly.
  v_rev constant text := 'work-signals engine rev: same-day-2026-08-08-r3';
BEGIN
  -- Schema-qualified and counted. An unqualified `WHERE proname = …` would also
  -- match a same-named function in ANOTHER schema, and plpgsql SELECT INTO takes
  -- the first row of a multi-row result WITHOUT complaining — so the guard could
  -- silently compare the wrong body and wave a genuinely drifted engine through.
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_work_signals_for';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: expected exactly one public.fn_work_signals_for, found %. An overload changes which body this file is replacing; resolve that first.', v_n;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_work_signals_for';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: public.fn_work_signals_for does not exist — this file REPLACES an engine, it does not create one from nothing.';
  END IF;

  IF md5(v_def) <> '09432834a331932fbae2d5a90d607d12'          -- the snapshot
     AND md5(v_def) <> '96dff97bb405f2448c88b23dd6e760ad'      -- what r1 installed
     AND position(v_rev in v_def) = 0 THEN                     -- this exact revision
    RAISE EXCEPTION
      'REFUSING TO APPLY: the live fn_work_signals_for body is none of the three this file knows — the 2026-08-08 snapshot (md5 09432834a331932fbae2d5a90d607d12), the body an earlier version of this file installed (md5 96dff97bb405f2448c88b23dd6e760ad), or revision %. It has md5 % and length %. Something shipped in between; re-read pg_get_functiondef and rebase this migration onto it rather than overwriting it.',
      v_rev, md5(v_def), length(v_def);
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- Helper: turn a client-written timestamp into the IST CALENDAR DATE it fell
-- on, and NEVER raise while doing it.
--
-- It returns a date, not a timestamptz, on purpose. An earlier draft returned
-- the instant and left the caller to do `… AT TIME ZONE 'Asia/Kolkata')::date`
-- — which put datetime arithmetic on client-supplied text OUTSIDE the trap, so
-- a value near the type ceiling ('294276-12-31T23:59:59Z') parsed fine inside
-- and then overflowed on the +05:30 shift, raising 22008 in the engine. Every
-- step that can fail now happens in here, behind the handler.
--
-- WHAT IT SWALLOWS: class 22 (data exception) ONLY, and it re-raises everything
-- else. Enumerating datetime SQLSTATEs by name does not work — verified on
-- production 2026-08-08, the cast raises 22007 (invalid_datetime_format),
-- 22008 (datetime_field_overflow), 22009 (invalid_time_zone_displacement_value,
-- e.g. '+99:00') and 22023 (invalid_parameter_value, e.g. a misspelt zone name
-- 'Asia/Kolkatta'). Two review rounds each found a member the previous list had
-- missed, which is the signature of a rule that should not be a list. Class 22
-- is the SQL standard's "the data is bad" class and covers all of them.
-- The re-raise is the other half. NOTE, corrected after review and verified on
-- production 2026-08-08: plpgsql's OTHERS already excludes QUERY_CANCELED and
-- ASSERT_FAILURE, so a statement timeout propagates on its own — an earlier
-- version of this comment claimed the re-raise was what protected 57014, and
-- that was simply wrong. What the re-raise actually covers is everything else
-- OTHERS does catch: class 53 (out of memory, disk full, connection limits),
-- class 40 (serialization failure, deadlock), classes 58/XX (system and
-- internal errors) and class 42 should this function ever be changed to touch
-- an object it may not. Swallowing any of those would turn a real failure into
-- "not marked that day" — a silently wrong count, which is worse than an error.
--
-- ZONE HANDLING. The naive branch is taken ONLY for a strictly zone-free form.
-- Anything else goes through ::timestamptz, which understands 'Z', '+05',
-- '+05:30', '+0530' and named zones alike. The earlier draft asked "does this
-- look like it has an offset?" with a narrow regex and fell back to ::timestamp
-- otherwise — and ::timestamp SILENTLY DISCARDS a zone it was not asked about.
-- Verified on production: '…T20:00:00z' (lowercase), '…T23:50:00+05' (two-digit
-- offset) and '2026-08-07 23:00:00 UTC' all missed that detector, lost their
-- zone, and were re-anchored as IST wall-clock — a 5.5-hour shift that moves
-- the calendar day at exactly the late-evening boundary this branch exists to
-- get right. Now the doubtful cases go the SAFE way, not the lossy way.
-- A genuinely zone-free value is treated as local campus time, because the
-- engine sets search_path and statement_timeout but never timezone, so the
-- session default (UTC) would push a 23:30 IST mark onto the next day.
--
-- STABLE, not IMMUTABLE: parsing depends on session state, and mislabelling it
-- IMMUTABLE would license the planner to fold or cache it wrongly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_try_ist_date(p_text text)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  -- btrim/1 strips ONLY spaces. A tab, CR, LF, form-feed or vertical tab would
  -- otherwise survive, miss the zone-free pattern, and take the zoned branch —
  -- the same "unrecognised silently means assume UTC" day-late bug this helper
  -- exists to close, left half-open. The character set is explicit.
  v_t text := btrim(p_text, E' \t\r\n\f\v');
BEGIN
  IF v_t IS NULL OR v_t = '' THEN
    RETURN NULL;
  END IF;
  -- Zone-free ⇒ the writer meant local campus time.
  -- btrim, and 1-2 digits for month/day/hour, are BOTH load-bearing. A first
  -- version of this test was exact-width and untrimmed, which made it REJECT
  -- genuinely zone-free values it merely failed to recognise — '2026-08-08
  -- 23:30:00 ' (trailing space) and '2026-8-8 23:30:00' fell through to the
  -- zoned branch and were read in the session zone (UTC), landing on the 9th.
  -- Verified on production: that is a day out, and it was a REGRESSION against
  -- the version already running. Being unrecognised must not silently mean
  -- "assume UTC".
  -- [Tt] because the separator is case-insensitive in practice and a lowercase
  -- 't' would otherwise fall to the zoned branch and land a day late.
  IF v_t ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}([Tt ][0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?)?$' THEN
    RETURN (v_t::timestamp)::date;
  END IF;
  -- Everything else carries (or claims) a zone — let Postgres read it.
  RETURN ((v_t::timestamptz) AT TIME ZONE 'Asia/Kolkata')::date;
EXCEPTION
  WHEN others THEN
    -- Bad DATA is not counted. Anything else is a real failure and must travel.
    IF left(SQLSTATE, 2) <> '22' THEN
      RAISE;
    END IF;
    RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_try_ist_date(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_try_ist_date(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_work_signals_for(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_email text;
  v_uid   uuid := auth.uid();
  v_to    date := COALESCE(p_to,   (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_from  date := COALESCE(p_from, (now() AT TIME ZONE 'Asia/Kolkata')::date - 30);
  v_assigned_marked   int := 0;
  v_personal_marked   int := 0;
  v_personal_same_day int := 0;
  v_witnessed         int := 0;
  v_pulses            int := 0;
  v_lessons           int := 0;
  v_notes             int := 0;
  v_verdicts          int := 0;
  v_votes             int := 0;
  v_last              timestamptz;
  v_od_handled        int := 0;
  v_od_waiting        int := 0;
  v_correctives_open  int := 0;
  v_carre_scored      int := 0;
  v_clarifications_open int := 0;
  v_acts_recorded     int := 0;
BEGIN
  -- work-signals engine rev: same-day-2026-08-08-r3
  -- ^ Read by the §0 drift guard in 20260816020000 to recognise its own output.
  --   Bump it whenever this body changes, and bump v_rev in that guard to match,
  --   or the guard stops being able to tell this engine from a later one.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_work_signals_for: not authenticated';
  END IF;
  IF v_from > v_to THEN
    RAISE EXCEPTION 'fn_work_signals_for: p_from (%) is after p_to (%)', v_from, v_to;
  END IF;

  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object(
      'window', jsonb_build_object('from', v_from, 'to', v_to),
      'subject_matched', false,
      'signals', '[]'::jsonb
    );
  END IF;

  WITH sess AS (
    SELECT sa.attendance_date AS ad, period.key AS pid, period.value AS pv
    FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN v_from AND v_to
  ),
  fac_sess AS (
    SELECT s.ad, s.pid
    FROM sess s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'array'  THEN s.pv -> 'assigned_faculty'
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'object' THEN jsonb_build_array(s.pv -> 'assigned_faculty')
        ELSE '[]'::jsonb
      END) AS af(el)
    WHERE lower(COALESCE(af.el ->> 'faculty_email', '')) = v_email
  )
  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE (SELECT count(*) FROM public.session_feedback f
             WHERE f.attendance_date = fs.ad AND f.period_id = fs.pid
               AND lower(f.faculty_email) = v_email) >= 3
    )::int,
    max(fs.ad)::timestamptz
  INTO v_assigned_marked, v_witnessed, v_last
  FROM fac_sess fs;

  -- "Track both": sessions this caller PERSONALLY marked (marker attribution),
  -- and — of exactly those — how many were marked ON THE DAY OF THE CLASS
  -- (2026-08-08). ONE scan, ONE predicate, TWO aggregates.
  --
  -- The shape is the guarantee. The marker test is in the WHERE, so only this
  -- caller's periods are ever examined; the day test is an aggregate FILTER,
  -- which Postgres applies only to rows the WHERE already admitted. So the
  -- same-day number is a subset of the personally-marked number BY
  -- CONSTRUCTION — not by two predicates being kept in step by hand — and no
  -- other marker's row can be parsed on this caller's behalf whatever the
  -- planner chooses to do.
  --
  -- The day comparison is per-period, which is the whole point:
  -- `marked_by_details.marked_at` is stamped for each period individually,
  -- unlike the row's created_at, which belongs to whichever period of that day
  -- happened to be inserted first and is therefore punctual for all of them.
  --
  -- fn_try_ist_date returns NULL rather than raising on a malformed value, and
  -- does the zone shift internally so no datetime arithmetic on client text
  -- happens out here. NULL fails the comparison, so such a period is not
  -- counted — and is not called late either. It is simply unknown.
  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE public.fn_try_ist_date(period.value->'marked_by_details'->>'marked_at')
              = sa.attendance_date
    )::int
  INTO v_personal_marked, v_personal_same_day
  FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date BETWEEN v_from AND v_to
    AND period.value->'marked_by_details'->>'marker_id' = v_uid::text;

  SELECT count(*)::int INTO v_pulses FROM public.scf_live_pulse lp
    WHERE lower(lp.faculty_email) = v_email AND lp.attendance_date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_lessons FROM public.class_session_lesson csl
    JOIN public.profiles lb ON lb.id = csl.linked_by
    WHERE lower(lb.email) = v_email AND csl.attendance_date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_notes FROM public.scf_ai_suggestions sg
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND sg.generated_at::date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_verdicts FROM public.scf_ai_suggestions sg
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND sg.human_verdict_at IS NOT NULL AND sg.human_verdict_at::date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_votes FROM public.scf_note_resolution_votes rv
    JOIN public.scf_ai_suggestions sg ON sg.id = rv.suggestion_id
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND rv.created_at::date BETWEEN v_from AND v_to;

  -- CARRE / compliance practice signals (2026-07-25). Deterministic ACTS only,
  -- self-scoped like everything above — never a score, never ranked, and the
  -- Respect pillar is deliberately NOT represented here (human-observed only).
  SELECT count(*)::int INTO v_od_handled
  FROM public.leave_onduty_approvals a
  WHERE a.approver_id = v_uid
    AND a.status::text IN ('approved','rejected')
    AND a.action_taken_at IS NOT NULL
    AND (a.action_taken_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to;

  -- "Waiting on you" is a NOW-state (queue depth), independent of the window.
  SELECT count(*)::int INTO v_od_waiting
  FROM public.leave_onduty_approvals a
  WHERE a.approver_id = v_uid AND a.status::text = 'pending';

  SELECT count(*)::int INTO v_correctives_open
  FROM public.tracker_items i
  JOIN public.tracker_item_assignees ta ON ta.item_id = i.id
  WHERE ta.assignee_id = v_uid AND i.is_active
    AND i.compliance_status NOT IN ('compliant','na');

  SELECT count(DISTINCT s.cycle_id)::int INTO v_carre_scored
  FROM public.care_audit_scores s
  JOIN public.audit_cycles c ON c.id = s.cycle_id
  WHERE s.scorer_id = v_uid
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND s.created_at::date BETWEEN v_from AND v_to;

  -- Re-explanation asks still open. A NOW-state queue depth like
  -- od_requests_waiting on a FIXED 14 IST days, deliberately NOT the caller's
  -- window: an open loop does not stop being open because someone narrowed a
  -- date filter. 'pending' = the learner has not reported back yet; it is never
  -- evidence that anyone refused or ignored the ask.
  -- Attribution comes from the SHARED view, which is the same one the card
  -- reads — the two can no longer disagree (hardening, 2026-07-30).
  SELECT count(*)::int INTO v_clarifications_open
  FROM public.v_clarification_ask_attribution a
  WHERE a.lead_email = v_email
    AND a.outcome    = 'pending'
    AND a.asked_on_ist >= ((now() AT TIME ZONE 'Asia/Kolkata')::date - 14);

  -- Acts recorded on re-explanation asks (two-sided close, 2026-07-31). An
  -- ACT, not a score: counts the caller's own "I acted on this" records in the
  -- window. CONTEXT, NEVER EVIDENCE — this number feeds no evaluation.
  SELECT count(*)::int INTO v_acts_recorded
  FROM public.clarification_acts ca
  WHERE ca.lead_email = v_email
    AND (ca.acted_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to;

  v_last := GREATEST(
    v_last,
    (SELECT max(lp.issued_at) FROM public.scf_live_pulse lp WHERE lower(lp.faculty_email) = v_email),
    (SELECT max(sg.human_verdict_at) FROM public.scf_ai_suggestions sg WHERE lower(sg.faculty_email) = v_email)
  );

  RETURN jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to),
    'subject_matched', true,
    'last_signal_at', v_last,
    'signals', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', t.signal_key, 'label', t.label, 'category', t.category,
          'unit', t.unit, 'attribution', t.attribution_mode,
          'value', v.value,
          'value_personal', v.value_personal,
          'action_route', t.action_route,
          'action_label', t.action_label
        ) ORDER BY t.sort_order
      )
      FROM public.work_signal_types t
      JOIN (VALUES
        ('sessions_marked',    v_assigned_marked, v_personal_marked),
        ('sessions_marked_same_day', v_personal_same_day, NULL::int),
        ('sessions_witnessed', v_witnessed,       NULL::int),
        ('pulses_run',         v_pulses,          NULL::int),
        ('lessons_linked',     v_lessons,         NULL::int),
        ('notes_received',     v_notes,           NULL::int),
        ('verdicts_given',     v_verdicts,        NULL::int),
        ('votes_received',     v_votes,           NULL::int),
        ('od_requests_handled',  v_od_handled,       NULL::int),
        ('od_requests_waiting',  v_od_waiting,       NULL::int),
        ('correctives_open',     v_correctives_open, NULL::int),
        ('carre_audits_scored',  v_carre_scored,     NULL::int),
        ('clarifications_open',  v_clarifications_open, NULL::int),
        ('clarification_acts_recorded', v_acts_recorded, NULL::int)
      ) AS v(key, value, value_personal) ON v.key = t.signal_key
      WHERE t.is_active
    )
  );
END;
$function$;

-- ci:allow-secdef-authenticated fn_work_signals_for is self-scoped: it takes no user id, reads
--   v_uid := auth.uid() and returns ONLY the caller's own work signals (the My Pulse card,
--   work-signals-card.tsx via WorkSignalsService, called as the signed-in user). A caller cannot
--   name anyone else, so there is nothing for an authz check to gate. Granted to authenticated
--   since 20260717170852; this file only rewrites the body. Same shape as
--   fn_scf_my_confirmed_attendance (20260921053000). Marker added 2026-09-06 because the
--   authz-guard assertion (#3136) landed on main after this PR was opened.
REVOKE EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Registry row. MUST land with the VALUES row above — a registered key with no
-- VALUES row is dropped by the emitter's inner join and goes dark (see the
-- marks_coverage note in the header).
--
-- sort_order 11 places this chip immediately after sessions_marked (10) so it is
-- read next to the "you: N" number it is a subset of, never next to the larger
-- assigned count. attribution_mode 'single' because there is no assigned
-- equivalent — nobody is assigned to mark something punctually on someone
-- else's behalf.
-- ---------------------------------------------------------------------------
INSERT INTO public.work_signal_types
  (signal_key, label, description, category, attribution_mode, unit, provider,
   sort_order, action_route, action_label, is_active)
VALUES
  ('sessions_marked_same_day', 'Marked same day',
   'Of the sessions you personally marked in this window, how many you marked on the day of the class itself (IST). It counts a positive act and says NOTHING about the rest: a session marked without a recorded marking time is UNKNOWN, not late, and is simply not counted here. Self-scoped, never ranked, never compared — this exists so the effect of changes to the marking screen on how promptly marking happens can be seen at all.',
   'presence', 'single', 'count', 'scf', 11,
   '/academic/attendance/mark', 'Mark a session', true)
ON CONFLICT (signal_key) DO UPDATE SET
  label=EXCLUDED.label, description=EXCLUDED.description, category=EXCLUDED.category,
  attribution_mode=EXCLUDED.attribution_mode, unit=EXCLUDED.unit, provider=EXCLUDED.provider,
  sort_order=EXCLUDED.sort_order, action_route=EXCLUDED.action_route,
  action_label=EXCLUDED.action_label, is_active=true, updated_at=now();

-- ---------------------------------------------------------------------------
-- Retire the superseded helper.
--
-- An earlier version of THIS FILE shipped `fn_try_timestamptz_ist` and was
-- applied to production on 2026-08-08 before its corrections had merged. Once
-- the engine above is replaced, nothing calls it — verified on production the
-- same day: `fn_work_signals_for` was its ONLY caller in the whole catalog, and
-- the repository mentions it nowhere outside this file's own history.
--
-- It is dropped rather than left lying around because it is not merely
-- redundant, it is WRONG: it raises on '+99:00' and on a misspelt zone name,
-- and it silently discards a lowercase 'z' or a two-digit offset. A retired
-- function that still parses timestamps is an invitation to call it.
--
-- ⚠️ IT REFUSES TO DROP WHILE ANYTHING STILL CALLS IT. A plpgsql body is stored
-- as TEXT, so Postgres records no dependency and a bare DROP would succeed even
-- while the live engine still called it — the engine would then fail at runtime,
-- WorkSignalsService would resolve the error to null, and My Pulse would go
-- blank for everyone. That is not hypothetical here: this file reaches the
-- database out-of-band, statement by statement, so "the replace above already
-- ran" is an assumption, not a fact. The check makes the DROP conditional on
-- the engine actually having been replaced.
--
-- IF EXISTS so this is a no-op on any database that never had the earlier
-- version, and so re-running the file is idempotent.
-- ---------------------------------------------------------------------------
DO $retire$
DECLARE
  v_refs int;
BEGIN
  SELECT count(*) INTO v_refs
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    -- prokind IS LOAD-BEARING: pg_get_functiondef raises 42809 on aggregates
    -- and window functions, so scanning every pg_proc row in `public` would
    -- abort this block the day anyone installs an extension that adds one —
    -- AFTER the engine was replaced, leaving a half-applied migration with a
    -- misleading unrelated error. Only plain functions and procedures have a
    -- body that could call anything. (Verified 2026-08-08: `public` currently
    -- holds prokind 'f' only, so this changes nothing today and prevents a
    -- future abort.)
    AND p.prokind IN ('f', 'p')
    AND p.proname <> 'fn_try_timestamptz_ist'
    AND pg_get_functiondef(p.oid) LIKE '%fn_try_timestamptz_ist%';

  IF v_refs > 0 THEN
    RAISE EXCEPTION
      'REFUSING TO DROP public.fn_try_timestamptz_ist: % function(s) still call it. Dropping now would break them at runtime and blank My Pulse. Apply the engine replacement above first, then re-run.', v_refs;
  END IF;

  EXECUTE 'DROP FUNCTION IF EXISTS public.fn_try_timestamptz_ist(text)';
END
$retire$;

NOTIFY pgrst, 'reload schema';

COMMIT;
