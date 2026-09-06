-- One-off data migration: fold three Draft inductions into the Live Pharmacy
-- induction, then delete the drafts.  Authorised by the module owner 2026-08-21.
--
-- TARGET (kept):
--   91c0d6e9-d832-4fb6-b424-c45e27fb625e  "Fresher Induction - 2026 - Pharmacy"  [live]
-- SOURCES (merged then deleted):
--   0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2  "Cultural Events of pharmacy…"        [draft]
--   b181e9e4-697e-484c-8e43-a894712a010d  "INDUCTION PROGRAMME B.PHARM/PHARM.D" [draft]
--   817ff3fc-d030-4b99-b67a-1f6191d2f05e  "cultural events FRUITS CARVING…"     [draft]
--
-- All four belong to JKKN College of Pharmacy (5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334)
-- and share one creator, so nothing crosses a tenant boundary. Verified before
-- writing: none of the three drafts has any induction_batches row, which is why
-- no batch remapping appears below — sessions carry batch_id = NULL throughout.
--
-- WHY EACH TABLE IS HANDLED THE WAY IT IS
--
--   Session-scoped rows travel for free. event_session_attendance and
--   event_session_feedback are UNIQUE (session_id, learner_id), so re-parenting a
--   SESSION carries its marks and ratings with it and cannot collide.
--
--   Event-scoped rows collide. induction_enrollment / _completion / the volunteer
--   tables are UNIQUE (event_id, learner_id) and 112 learners sit on both sides,
--   so those are insert-the-difference, never bulk re-parent.
--
--   induction_completion is NOT transferred. It is derived state (attendance %,
--   value score, participation flag) and is rebuilt at the end of this file from
--   source rows. Moving 138 stale rows would only fight that rebuild.
--
-- THE DUPLICATE-SESSION DECISION (owner-confirmed)
--   b181e9e4's three sessions are same-date (2026-08-24), same-title copies of the
--   Live induction's Day 2. The Live copies carry zero ratings; the draft copies
--   carry all 18. So the RATINGS are re-pointed onto the existing Live sessions and
--   the duplicate draft sessions die with their event — rather than re-parenting
--   them and leaving Live with six sessions on one day, three of them empty.
--
--   0bb550a1's two sessions (2026-08-18) have no Live counterpart — the Live
--   inauguration is 2026-08-20 — so they move across intact as real sessions.

-- (transaction supplied by the migration runner)

-- ===========================================================================
-- 0. BACKUP. Everything the three drafts own, before a single row changes.
--    Own schema, not public: PostgREST only exposes listed schemas, so this is
--    unreachable from the API. Revoked anyway — belt and braces.
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS backup_induction_merge_20260821;
REVOKE ALL ON SCHEMA backup_induction_merge_20260821 FROM anon, authenticated;

CREATE TABLE backup_induction_merge_20260821.events AS
  SELECT * FROM public.events WHERE id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.induction_programs AS
  SELECT * FROM public.induction_programs WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.induction_enrollment AS
  SELECT * FROM public.induction_enrollment WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.induction_completion AS
  SELECT * FROM public.induction_completion WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.event_sessions AS
  SELECT * FROM public.event_sessions WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.event_session_attendance AS
  SELECT a.* FROM public.event_session_attendance a
  JOIN public.event_sessions s ON s.id = a.session_id
  WHERE s.event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.event_session_feedback AS
  SELECT * FROM public.event_session_feedback WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.induction_feedback_volunteers AS
  SELECT * FROM public.induction_feedback_volunteers WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.induction_feedback_volunteer_group AS
  SELECT * FROM public.induction_feedback_volunteer_group WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.induction_event_coordinators AS
  SELECT * FROM public.induction_event_coordinators WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

CREATE TABLE backup_induction_merge_20260821.induction_session_effectiveness AS
  SELECT * FROM public.induction_session_effectiveness WHERE event_id IN
    ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

-- ===========================================================================
-- 1. PRE-FLIGHT. Refuse to run against a shape other than the one surveyed.
--    A silent no-op on a drifted database is worse than a hard stop.
-- ===========================================================================
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.events
   WHERE id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e' AND status = 'live';
  IF v_n <> 1 THEN RAISE EXCEPTION 'pre-flight: target induction is missing or not Live'; END IF;

  SELECT count(*) INTO v_n FROM public.events
   WHERE id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e')
     AND status = 'draft';
  IF v_n <> 3 THEN RAISE EXCEPTION 'pre-flight: expected exactly 3 Draft sources, found %', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.induction_batches
   WHERE event_id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');
  IF v_n <> 0 THEN RAISE EXCEPTION 'pre-flight: drafts now have % batch(es); batch remapping is not implemented', v_n; END IF;

  -- The three Live Day-2 sessions must still be rating-free, or the remap below
  -- could hit the UNIQUE (session_id, learner_id) constraint.
  SELECT count(*) INTO v_n FROM public.event_session_feedback
   WHERE session_id IN ('4db9c7be-10de-42bc-95c9-89084a05a4c5','0d15232b-89c8-441c-87c3-9405b233c49e','e9bdd5a6-3cb1-4495-9272-305e8ea1b7dc');
  IF v_n <> 0 THEN RAISE EXCEPTION 'pre-flight: Live Day-2 sessions already hold % rating(s); remap would collide', v_n; END IF;
END $$;

-- Capture the BEFORE picture so step 8 can assert on deltas rather than on
-- literals. This induction is being marked on right now — its attendance count
-- moved by 50 rows during the survey that produced this file — so any hardcoded
-- post-count would fail for a reason that has nothing to do with the merge.
CREATE TEMP TABLE _merge_pre ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.induction_enrollment WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e') AS live_enrol,
  (SELECT count(DISTINCT ie.learner_id) FROM public.induction_enrollment ie
     WHERE ie.event_id IN ('91c0d6e9-d832-4fb6-b424-c45e27fb625e','0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2',
                           'b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e')) AS union_learners,
  (SELECT count(*) FROM public.event_sessions WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e') AS live_sessions,
  (SELECT count(*) FROM public.event_session_attendance a JOIN public.event_sessions s ON s.id=a.session_id
     WHERE s.event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e') AS live_att,
  (SELECT count(*) FROM public.event_session_attendance a JOIN public.event_sessions s ON s.id=a.session_id
     WHERE s.event_id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e')) AS draft_att,
  (SELECT count(*) FROM public.event_session_attendance a
     WHERE a.session_id IN ('78335837-d3ec-405f-8199-12d7c3998a6d','d61f09cd-9389-46fa-93b4-cb0704d30295')) AS moved_session_att,
  (SELECT count(*) FROM public.event_session_feedback WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e') AS live_fb,
  (SELECT count(*) FROM public.event_session_feedback
     WHERE session_id IN ('1259c39c-8e00-4a78-be43-3157ba5fd906','24d2e99a-e06f-4186-9520-c39e97c7c24f',
                          '832677fe-cae5-4faa-884e-a188bd0b2020','78335837-d3ec-405f-8199-12d7c3998a6d',
                          'd61f09cd-9389-46fa-93b4-cb0704d30295')) AS transferable_fb,
  (SELECT count(*) FROM public.induction_feedback_volunteers WHERE event_id='0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2') AS draft_vol,
  (SELECT count(*) FROM public.induction_feedback_volunteers WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e') AS live_vol,
  (SELECT count(*) FROM public.induction_feedback_volunteer_group WHERE event_id='0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2') AS draft_grp,
  (SELECT count(*) FROM public.induction_feedback_volunteer_group WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e') AS live_grp;

-- Any attendance on the drafts that is NOT on one of the two sessions being
-- moved would be silently destroyed by the cascade. Surveyed as zero; assert it.
DO $$
DECLARE v_stranded int;
BEGIN
  SELECT draft_att - moved_session_att INTO v_stranded FROM _merge_pre;
  IF v_stranded <> 0 THEN
    RAISE EXCEPTION 'pre-flight: % draft attendance row(s) sit on sessions that are NOT being moved and would be destroyed', v_stranded;
  END IF;
END $$;

-- ===========================================================================
-- 2. ENROLMENT. Add the 22 learners who appear only in the drafts.
--    ON CONFLICT DO NOTHING covers the 112 already on the Live roster.
--    batch_id stays NULL — the target has no batches either.
-- ===========================================================================
INSERT INTO public.induction_enrollment (event_id, learner_id, batch_id, institution_id, source, enrolled_at)
SELECT DISTINCT ON (ie.learner_id)
       '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid,
       ie.learner_id, NULL::uuid, ie.institution_id, ie.source, ie.enrolled_at
FROM public.induction_enrollment ie
WHERE ie.event_id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e')
ORDER BY ie.learner_id, ie.enrolled_at
ON CONFLICT (event_id, learner_id) DO NOTHING;

-- ===========================================================================
-- 3. RE-POINT the 18 ratings from b181e9e4's duplicate sessions onto the
--    matching Live Day-2 sessions. event_id moves with them; the guard trigger
--    added in 20260821120000 sees NEW.event_id = the Live event and passes.
-- ===========================================================================
UPDATE public.event_session_feedback f
   SET session_id = m.live_session,
       event_id   = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid,
       updated_at = now()
FROM (VALUES
  ('1259c39c-8e00-4a78-be43-3157ba5fd906'::uuid, '4db9c7be-10de-42bc-95c9-89084a05a4c5'::uuid), -- Familiarization with JKKN System…
  ('24d2e99a-e06f-4186-9520-c39e97c7c24f'::uuid, '0d15232b-89c8-441c-87c3-9405b233c49e'::uuid), -- Training and SPM orientation
  ('832677fe-cae5-4faa-884e-a188bd0b2020'::uuid, 'e9bdd5a6-3cb1-4495-9272-305e8ea1b7dc'::uuid)  -- MYJKKN APPS INTRO → myjkkn apps introduction
) AS m(draft_session, live_session)
WHERE f.session_id = m.draft_session;

-- ===========================================================================
-- 4. RE-PARENT 0bb550a1's two real sessions (2026-08-18) onto the Live event.
--    day_number = 1 puts them in the Live induction's Day-1 cultural block; the
--    schedule orders by (day_number, start_at), so 08-18 sorts ahead of the
--    08-19/20/21/22 sessions already there.
--    Their 83 attendance marks key on session_id and need no update at all.
-- ===========================================================================
UPDATE public.event_sessions
   SET event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid,
       day_number = 1,
       updated_at = now()
 WHERE id IN ('78335837-d3ec-405f-8199-12d7c3998a6d',   -- Inagural function of pharmacy
              'd61f09cd-9389-46fa-93b4-cb0704d30295');  -- Registration

-- the 1 rating on the inaugural session carries its own event_id column
UPDATE public.event_session_feedback
   SET event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid, updated_at = now()
 WHERE session_id IN ('78335837-d3ec-405f-8199-12d7c3998a6d','d61f09cd-9389-46fa-93b4-cb0704d30295');

-- ===========================================================================
-- 5. VOLUNTEERS + COORDINATORS. All 16 peer mentors, their 130 assigned
--    freshers and 2 coordinators belong to 0bb550a1; the Live induction has
--    none of any, so these re-parent wholesale with no possible conflict.
--    (volunteer_group.volunteer_id keeps pointing at the same rows — ids are
--    untouched — so the mentor→fresher assignments survive intact.)
-- ===========================================================================
UPDATE public.induction_feedback_volunteers
   SET event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid, updated_at = now()
 WHERE event_id = '0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2';

UPDATE public.induction_feedback_volunteer_group
   SET event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid, updated_at = now()
 WHERE event_id = '0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2';

UPDATE public.induction_event_coordinators
   SET event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid
 WHERE event_id = '0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2'
   AND NOT EXISTS (
     SELECT 1 FROM public.induction_event_coordinators x
      WHERE x.event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'
        AND x.user_id = induction_event_coordinators.user_id);

-- ===========================================================================
-- 6. DELETE the drafts.
--    trg_events_block_delete_with_dependents refuses while induction_enrollment
--    rows remain — by design, and it is NOT being disabled. Clearing the source
--    enrolments explicitly is the sanctioned path the guard's own message names
--    ("Remove the enrolment first"). Completion rows go with them; they are
--    derived and are rebuilt in step 7.
-- ===========================================================================
DELETE FROM public.induction_completion
 WHERE event_id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

DELETE FROM public.induction_enrollment
 WHERE event_id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

DELETE FROM public.events
 WHERE id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');

-- ===========================================================================
-- 7. REBUILD induction_completion for the Live induction.
--    The body is fn_induction_recompute_completion's, inlined: that function
--    gates on is_super_admin()/is_admin()/induction.manage, all of which are
--    false in a migration (no auth.uid()), so calling it here would raise
--    'not authorized'. Same SQL, no session-identity dependency.
-- ===========================================================================
DO $$
DECLARE v_inst uuid; v_thr integer; v_fbpct integer;
BEGIN
  SELECT institution_id, completion_attendance_pct, completion_feedback_pct
    INTO v_inst, v_thr, v_fbpct
    FROM public.induction_programs
   WHERE event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e';

  WITH att AS (
    SELECT e.learner_id, e.institution_id,
           count(DISTINCT s.id) AS total,
           count(DISTINCT s.id) FILTER (WHERE a.status IN ('present','od')) AS attended,
           count(DISTINCT s.id) FILTER (WHERE f.id IS NOT NULL) AS rated
    FROM public.induction_enrollment e
    LEFT JOIN public.event_sessions s
      ON s.event_id = e.event_id AND (s.batch_id IS NULL OR s.batch_id = e.batch_id)
    LEFT JOIN public.event_session_attendance a
      ON a.session_id = s.id AND a.learner_id = e.learner_id
    LEFT JOIN public.event_session_feedback f
      ON f.session_id = s.id AND f.learner_id = e.learner_id
    WHERE e.event_id = '91c0d6e9-d832-4fb6-b424-c45e27fb625e'
    GROUP BY e.learner_id, e.institution_id
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, sessions_total, sessions_attended,
     attendance_pct, participation_complete, outcome_complete, completed_at, updated_at)
  SELECT '91c0d6e9-d832-4fb6-b424-c45e27fb625e'::uuid, att.learner_id, att.institution_id,
         att.total, att.attended,
         CASE WHEN att.total = 0 THEN 0 ELSE round(100.0 * att.attended / att.total, 2) END,
         (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr),
         (   (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr)
          OR (att.total > 0 AND (100.0 * att.rated    / att.total) >= v_fbpct) ),
         CASE WHEN (   (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr)
                    OR (att.total > 0 AND (100.0 * att.rated    / att.total) >= v_fbpct) )
              THEN now() ELSE NULL END,
         now()
  FROM att
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    sessions_total = EXCLUDED.sessions_total,
    sessions_attended = EXCLUDED.sessions_attended,
    attendance_pct = EXCLUDED.attendance_pct,
    participation_complete = EXCLUDED.participation_complete,
    outcome_complete = (EXCLUDED.outcome_complete OR induction_completion.referrals_submitted >= 1),
    completed_at = CASE
      WHEN (EXCLUDED.outcome_complete OR induction_completion.referrals_submitted >= 1)
        THEN COALESCE(induction_completion.completed_at, now())
      ELSE NULL END,
    updated_at = now();
END $$;

-- ===========================================================================
-- 8. POST-FLIGHT. Assert the merge landed, or roll the whole thing back.
-- ===========================================================================
DO $$
DECLARE p _merge_pre%ROWTYPE;
        v_enrol int; v_sess int; v_att int; v_fb int; v_vol int; v_grp int; v_drafts int;
BEGIN
  SELECT * INTO p FROM _merge_pre;

  SELECT count(*) INTO v_drafts FROM public.events
   WHERE id IN ('0bb550a1-95c1-4cc1-9c0e-c3d14620f0c2','b181e9e4-697e-484c-8e43-a894712a010d','817ff3fc-d030-4b99-b67a-1f6191d2f05e');
  IF v_drafts <> 0 THEN RAISE EXCEPTION 'post-flight: % draft(s) survived the delete', v_drafts; END IF;

  -- every learner from any of the four events, exactly once
  SELECT count(*) INTO v_enrol FROM public.induction_enrollment WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e';
  IF v_enrol <> p.union_learners THEN
    RAISE EXCEPTION 'post-flight: enrolled = %, expected % (union of all four rosters)', v_enrol, p.union_learners; END IF;

  SELECT count(*) INTO v_sess FROM public.event_sessions WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e';
  IF v_sess <> p.live_sessions + 2 THEN
    RAISE EXCEPTION 'post-flight: sessions = %, expected % (+2 moved)', v_sess, p.live_sessions + 2; END IF;

  -- no attendance may be lost: every draft mark sat on a moved session
  SELECT count(*) INTO v_att FROM public.event_session_attendance a
    JOIN public.event_sessions s ON s.id=a.session_id WHERE s.event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e';
  IF v_att <> p.live_att + p.draft_att THEN
    RAISE EXCEPTION 'post-flight: attendance = %, expected % (% live + % transferred)',
      v_att, p.live_att + p.draft_att, p.live_att, p.draft_att; END IF;

  -- no rating may be lost: 18 remapped + 1 carried on a moved session
  SELECT count(*) INTO v_fb FROM public.event_session_feedback WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e';
  IF v_fb <> p.live_fb + p.transferable_fb THEN
    RAISE EXCEPTION 'post-flight: ratings = %, expected % (% live + % transferred)',
      v_fb, p.live_fb + p.transferable_fb, p.live_fb, p.transferable_fb; END IF;

  SELECT count(*) INTO v_vol FROM public.induction_feedback_volunteers WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e';
  IF v_vol <> p.live_vol + p.draft_vol THEN
    RAISE EXCEPTION 'post-flight: volunteers = %, expected %', v_vol, p.live_vol + p.draft_vol; END IF;

  SELECT count(*) INTO v_grp FROM public.induction_feedback_volunteer_group WHERE event_id='91c0d6e9-d832-4fb6-b424-c45e27fb625e';
  IF v_grp <> p.live_grp + p.draft_grp THEN
    RAISE EXCEPTION 'post-flight: volunteer-group rows = %, expected %', v_grp, p.live_grp + p.draft_grp; END IF;

  -- nothing may be left pointing at a deleted event
  IF EXISTS (SELECT 1 FROM public.event_session_feedback f
              WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = f.event_id)) THEN
    RAISE EXCEPTION 'post-flight: orphaned event_session_feedback rows remain'; END IF;

  RAISE NOTICE 'induction merge OK: % enrolled (was %), % sessions, % attendance, % ratings, % volunteers, % group rows',
    v_enrol, p.live_enrol, v_sess, v_att, v_fb, v_vol, v_grp;
END $$;

-- (commit supplied by the migration runner)

-- The backup schema is left in place deliberately. Drop it only once the merged
-- induction has been reviewed in the UI:
--   DROP SCHEMA backup_induction_merge_20260821 CASCADE;
