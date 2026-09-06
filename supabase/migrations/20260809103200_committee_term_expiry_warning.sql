-- ============================================================================
-- Warn a committee before its Chair's / Coordinator's term runs out
-- File: 20260809103200_committee_term_expiry_warning.sql
-- Date: 2026-08-05
--
-- DIRECTOR DECISION 8 (2026-08-05 interview)
--   The Chairman and the Coordinator are cut off on their term end date like
--   everyone else, BUT a warning must go out ahead of the date so a successor
--   can be appointed. In the Director's own framing: a committee must not be
--   left leaderless overnight, and THE PERSON WHO COULD FIX IT MAY BE THE ONE
--   WHO JUST LOST ACCESS.
--
--   That last clause is the whole design. A warning delivered only to the
--   outgoing leader is the failure, not the fix.
--
-- ---------------------------------------------------------------------------
-- WHAT IS TRUE TODAY (read off production 2026-08-05, service-role SELECT only)
-- ---------------------------------------------------------------------------
--   3 committees, all NAAC / committee_type='main' (IQAC), all is_active:
--     · JKKN College of Arts and Science (Self)  — committees.term_end IS NULL
--     · JKKN College of Nursing and Research     — committees.term_end 2027-03-31
--     · JKKN College of Allied Health Sciences   — committees.term_end 2027-03-31
--   3 roster rows, all is_active, all is_external=false, all member.term_end
--   2027-03-31:
--     · Ommsharravana S          role 'chair'       (is_super_admin)
--     · Mrs VIMALA V             role 'coordinator'
--     · Dr Dhanasekar Balakrishnan role 'coordinator'
--
--   Two corrections to the brief this file was written from, both verified:
--     1. Only ONE of the three is role='chair'. The other two are
--        'coordinator'. They are not all Chairs.
--     2. accreditation_committees.chair_user_id points at the coordinator for
--        Nursing and for Allied Health — the committee's declared chair and the
--        roster's chair ROLE disagree for 2 of 3 committees. This function
--        therefore reads the ROSTER (accreditation_committee_members.role),
--        never chair_user_id: the roster is what fn_user_is_committee_member
--        gates access on, so the roster is what a term ending actually affects.
--
--   The date arithmetic is therefore NOT provable by running this today —
--   every term is ~604 days out and a naive "does it fire?" test returns zero,
--   which is indistinguishable from a broken query. It was proved instead
--   against synthetic near-expiry rows inside BEGIN … ROLLBACK (§4).
--
-- 🔴 THE CUT-OFF HALF OF DECISION 8 DOES NOT EXIST YET, and this file does not
--   add it. Verified live: no function in the database references BOTH
--   accreditation_committee_members AND term_end (pg_proc scan, 0 hits), and
--   fn_user_is_committee_member gates on `m.is_active = true` alone —
--   20260809102300_committee_roster_access.sql says so in terms and explains
--   why. A term_end sliding past today revokes nothing; a human must flip
--   is_active. That makes this warning MORE load-bearing, not less: it is
--   currently the only thing that would tell anybody the date is coming. The
--   notification copy below is worded accordingly — it says the term ends and
--   a successor is needed. It does NOT promise an automatic cut-off that would
--   not happen.
--
-- ---------------------------------------------------------------------------
-- WHO IS TOLD — and why not the Principal
-- ---------------------------------------------------------------------------
--   TWO notices per warning, deliberately separate rows with separate wording:
--
--   1. THE OUTGOING LEADER. They are the one person guaranteed to care, and
--      they are the one person who cannot be the only recipient.
--
--   2. A STEWARD WHO CAN ACTUALLY ACT — resolved as the holders of
--      `accreditation.naac.committees.edit`, through user_roles (the supported
--      multi-role model) AND legacy profiles.role, exactly as
--      fn_health_tournament_notify_college does. Holding the edit permission
--      is not a proxy for "can appoint a successor", it IS the thing: that key
--      is what members_insert / members_update require.
--
--      Live today that resolves to 4 people — RANGARAJAN R (ceo), a ceo test
--      account, Ommsharravana S (via a user_roles grant), Narayan Rao (coo,
--      holding accreditation_officer). All three granting roles carry
--      institution_scope='all', so all four can act on any of the 3 committees.
--
--   🚫 NOT the Principal, though the brief suggested it. `principal` has 12
--      holders and holds NEITHER accreditation.naac.committees.edit NOR .view
--      (checked by VALUE with ->>::boolean, not `?` — a key present-and-false
--      reads as true under the existence operator). A bell item pointing a
--      Principal at /accreditation/naac/committees/<id> would land them on a
--      page RLS refuses, and in this repo RLS denial is ALWAYS silent (0 rows,
--      error = null) — so they would see an empty screen and conclude there was
--      nothing to do. Notifying somebody who cannot act is worse than not
--      notifying them: it converts a real deadline into a screen that looks
--      fine. If the Director wants Principals told, the fix is to grant them
--      the permission in Role Management first, and then they appear here
--      automatically with no change to this function.
--
--   THE LEADER IS EXCLUDED FROM THEIR OWN STEWARD NOTICE, and that is the
--   Director's clause made executable. If removing them empties the steward
--   set — i.e. the only person who could appoint a successor is the person
--   whose term is ending — the notice ESCALATES to the super admins (14 live)
--   and the run reports steward_fallback_super_admin = true. If even that is
--   empty the run reports unreachable > 0 rather than quietly sending nothing.
--
-- ---------------------------------------------------------------------------
-- WHEN IT FIRES — 30 days, then 7
-- ---------------------------------------------------------------------------
--   Two thresholds, both RANGES not exact days (`<= 30 AND > 7`, `<= 7 AND
--   >= 0`), so a cron that misses a night — or a week — still fires on the next
--   run instead of stepping over the only day that mattered.
--
--   30 days is not an arbitrary pick: it is the first threshold the platform's
--   own sibling reminder already uses (/api/cron/hr/document-expiry-reminders
--   fires at 30/14/7), so "30 days out" is a deadline shape this staff body has
--   already been trained on. 7 days is the last-chance escalation and is the
--   only one that raises priority to 'high'.
--
--   A 60- or 90-day first warning was considered and rejected: appointing an
--   IQAC chair plausibly needs a meeting cycle, but only 2 committee meetings
--   exist in production, which is not enough to establish a cadence. Choosing
--   60 would have been inventing precision this estate cannot support.
--
--   Day 0 (the term_end date itself) still warns. A term already PAST does not:
--   that is a lapse, not a warning, and Decision 8 asks for a warning ahead of
--   the date. Announcing lapses that already happened is a separate change and
--   is deliberately not smuggled in here.
--
--   Only role IN ('chair','coordinator'). Decision 8 names exactly those two,
--   and they are the two whose absence leaves a committee LEADERLESS — the
--   harm the Director described. An ordinary member's term ending does not.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCY — no new column, no new table
-- ---------------------------------------------------------------------------
--   public.notifications holds 244,798 rows on this project today. A sweep that
--   re-warns every night is not untidy, it is harm: it buries the bell and
--   trains people to swipe past it. The guard is notifications.idempotency_key,
--   which carries a UNIQUE partial index (idx_notifications_idempotency,
--   verified live: `... ON public.notifications USING btree (idempotency_key)
--   WHERE (idempotency_key IS NOT NULL)`). Key shape:
--
--     committee_term:<member_id>:<term_end>:<threshold>d:self
--     committee_term:<member_id>:<term_end>:<threshold>d:steward
--
--   Each (member, term, threshold, audience) is announced EXACTLY ONCE, ever —
--   not once per day, which is what a date-stamped key would give. Nothing new
--   is created to hold this: no `last_warned_at` column on the roster, no
--   ledger table. The unique index already in production IS the marker.
--
--   term_end is IN the key on purpose. If a term is EXTENDED, the new term_end
--   produces new keys and the new term gets its own warnings — the same reason
--   gemba_official_lapse_notices keys on (artifact_id, lapsed_at) rather than
--   setting a boolean flag that somebody would then have to clear.
--
-- ---------------------------------------------------------------------------
-- SECURITY — cron-only, service_role only
-- ---------------------------------------------------------------------------
--   This function reads every committee's roster and WRITES notification rows
--   addressed to other people. It takes no caller-supplied identity, makes no
--   authorisation decision on behalf of a signed-in user, and has no meaning
--   outside the nightly sweep. Revoked from anon, authenticated and PUBLIC;
--   granted to service_role alone — the same shape as its two closest
--   siblings, fn_accreditation_narrative_reminders and
--   fn_gemba_official_lapse_notify. Supabase's ALTER DEFAULT PRIVILEGES grants
--   anon EXECUTE on every new function INDEPENDENTLY of PUBLIC, so both revokes
--   are present and both are load-bearing.
--
-- ---------------------------------------------------------------------------
-- NOT APPLIED. Director-gated per CLAUDE.md. Rehearsed against production
-- inside a single Mgmt-API BEGIN … ROLLBACK batch (§4) and carries no COMMIT of
-- its own, so that rehearsal stays a genuine dry run. Until it is applied the
-- route added in this PR returns a 500 naming the missing function — loudly,
-- not as an empty 200.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_accreditation_committee_term_warnings(
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- IST, because term_end is a DATE and a UTC "today" flips five and a half
  -- hours early for the people reading the bell.
  v_today       date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_sys         uuid;
  r             record;
  v_threshold   int;
  v_days        int;
  v_stewards    uuid[];
  v_key         text;
  v_note        uuid;
  v_fallback    boolean := false;

  -- Counters. Named so the AI-routine dispatcher's summariser picks them up
  -- (its SUMMARY_KEYS allowlist includes candidates / sent / skipped /
  -- recipients), which is what makes "last run" say what the sweep DID.
  v_examined    int := 0;   -- active leadership seats carrying a term_end
  v_candidates  int := 0;   -- ...of those, inside a threshold window
  v_sent        int := 0;   -- notification rows written (or would be)
  v_skipped     int := 0;   -- already announced for this (member, term, threshold)
  v_recipients  int := 0;   -- user_notifications rows written (or would be)
  v_external    int := 0;   -- outgoing leader has no in-app profile to tell
  v_unreachable int := 0;   -- NOBODY could be told to act — the loud case
  v_t30         int := 0;
  v_t7          int := 0;
BEGIN
  -- notifications.created_by is NOT NULL and there is no signed-in user on the
  -- cron path, so a stable system identity is required before anything is
  -- written. Same resolution as fn_accreditation_narrative_reminders.
  SELECT id INTO v_sys
    FROM public.profiles
   WHERE is_super_admin = true
   ORDER BY created_at NULLS LAST
   LIMIT 1;
  IF v_sys IS NULL THEN
    RAISE EXCEPTION 'no system identity available for notifications.created_by';
  END IF;

  FOR r IN
    SELECT m.id            AS member_id,
           m.user_id       AS leader_id,
           m.role          AS seat,
           m.term_end      AS term_end,
           m.is_external   AS is_external,
           c.id            AS committee_id,
           c.committee_name AS committee_name,
           c.institution_id AS institution_id,
           COALESCE(i.name, 'this college')                          AS college,
           COALESCE(p.full_name, m.external_name, 'A committee leader') AS leader_name
      FROM public.accreditation_committee_members m
      JOIN public.accreditation_committees c
        ON c.id = m.committee_id
       AND c.is_active = true
      LEFT JOIN public.institutions i ON i.id = c.institution_id
      LEFT JOIN public.profiles     p ON p.id = m.user_id
     WHERE m.is_active = true
       -- Decision 8 names the Chairman and the Coordinator, and those are the
       -- two seats whose vacancy leaves a committee leaderless.
       AND m.role IN ('chair', 'coordinator')
       AND m.term_end IS NOT NULL
  LOOP
    v_examined := v_examined + 1;
    v_days := r.term_end - v_today;

    -- Ranges, not exact days: a missed night must not step over the warning.
    IF    v_days <= 7  AND v_days >= 0 THEN v_threshold := 7;
    ELSIF v_days <= 30 AND v_days >  7 THEN v_threshold := 30;
    ELSE  CONTINUE;                       -- too far out, or already past
    END IF;

    v_candidates := v_candidates + 1;
    IF v_threshold = 7 THEN v_t7 := v_t7 + 1; ELSE v_t30 := v_t30 + 1; END IF;

    -- ---------------------------------------------------------------------
    -- NOTICE 1 of 2 — the outgoing leader.
    -- ---------------------------------------------------------------------
    -- An external member (industry expert, alumnus) has no profiles row and so
    -- no bell. They are counted, not silently dropped, and the steward notice
    -- below still goes out — which is the notice that gets a successor named.
    IF r.leader_id IS NULL OR r.is_external THEN
      v_external := v_external + 1;
    ELSE
      v_key := 'committee_term:' || r.member_id::text || ':' ||
               r.term_end::text  || ':' || v_threshold::text || 'd:self';

      IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.idempotency_key = v_key) THEN
        v_skipped := v_skipped + 1;
      ELSE
        IF NOT p_dry_run THEN
          INSERT INTO public.notifications (
            title, body, url, icon, priority, category, kind,
            idempotency_key, targeting, expires_at, created_by, created_at, updated_at
          ) VALUES (
            format('Your %s term on the %s ends on %s',
                   r.seat, r.committee_name, to_char(r.term_end, 'DD Mon YYYY')),
            format('Your term as %s of the %s at %s ends on %s — %s day%s from today. '
                   'A successor needs to be appointed before then so the committee is not '
                   'left without a %s.',
                   r.seat, r.committee_name, r.college,
                   to_char(r.term_end, 'DD Mon YYYY'), v_days,
                   CASE WHEN v_days = 1 THEN '' ELSE 's' END, r.seat),
            '/accreditation/naac/committees/' || r.committee_id::text,
            'AlertTriangle',
            CASE WHEN v_threshold = 7 THEN 'high' ELSE 'normal' END,
            'accreditation',
            'work_item',
            v_key,
            jsonb_build_object('type', 'user',
                               'user_ids', jsonb_build_array(r.leader_id)),
            -- Once the term has ended the warning is moot; let it age out of
            -- the bell rather than accumulate (layer-0.ts drops an expired row).
            (r.term_end + 1)::timestamptz,
            v_sys, now(), now()
          )
          RETURNING id INTO v_note;

          -- THE WRITE THAT ACTUALLY DELIVERS. A notifications row on its own
          -- reaches nobody — nothing fans out `targeting` after the fact.
          INSERT INTO public.user_notifications (notification_id, user_id, created_at)
          VALUES (v_note, r.leader_id, now())
          ON CONFLICT (notification_id, user_id) DO NOTHING;
        END IF;

        v_sent       := v_sent + 1;
        v_recipients := v_recipients + 1;
      END IF;
    END IF;

    -- ---------------------------------------------------------------------
    -- NOTICE 2 of 2 — somebody who can actually appoint a successor.
    -- ---------------------------------------------------------------------
    -- Holders of accreditation.naac.committees.edit, via user_roles OR the
    -- legacy profiles.role, scoped the way role_has_institution_access scopes:
    -- a cluster-wide role reaches every committee, an own-institution role
    -- reaches its own, and an explicit user_institution_access grant counts.
    -- Read the VALUE (->> then ::boolean) — `permissions ? 'key'` would report
    -- true for a key explicitly set to false.
    SELECT array_agg(DISTINCT p.id) INTO v_stewards
      FROM public.profiles p
      JOIN public.custom_roles cr
        ON cr.is_active = true
       AND COALESCE((cr.permissions ->> 'accreditation.naac.committees.edit')::boolean, false) = true
       AND ( EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = p.id AND ur.role_id = cr.id)
             OR p.role = cr.role_key )
     WHERE
       -- ...and NEVER the person whose term is ending. This exclusion is the
       -- Director's clause: "the person who could fix it may be the one who
       -- just lost access."
       (r.leader_id IS NULL OR p.id <> r.leader_id)
       AND ( cr.institution_scope = 'all'
             OR p.institution_id = r.institution_id
             OR EXISTS (SELECT 1 FROM public.user_institution_access uia
                         WHERE uia.user_id = p.id
                           AND uia.institution_id = r.institution_id
                           AND uia.is_active = true) );

    -- Escalate rather than go quiet: if the outgoing leader was the only
    -- steward, the super admins are the resolvable backstop.
    IF v_stewards IS NULL OR array_length(v_stewards, 1) IS NULL THEN
      SELECT array_agg(p.id) INTO v_stewards
        FROM public.profiles p
       WHERE p.is_super_admin = true
         AND (r.leader_id IS NULL OR p.id <> r.leader_id);
      IF v_stewards IS NOT NULL AND array_length(v_stewards, 1) IS NOT NULL THEN
        v_fallback := true;
      END IF;
    END IF;

    IF v_stewards IS NULL OR array_length(v_stewards, 1) IS NULL THEN
      -- Nobody at all could be told to act. Count it so the run REPORTS the
      -- hole instead of returning a cheerful 200 having sent nothing.
      v_unreachable := v_unreachable + 1;
      CONTINUE;
    END IF;

    v_key := 'committee_term:' || r.member_id::text || ':' ||
             r.term_end::text  || ':' || v_threshold::text || 'd:steward';

    IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.idempotency_key = v_key) THEN
      v_skipped := v_skipped + 1;
    ELSE
      IF NOT p_dry_run THEN
        INSERT INTO public.notifications (
          title, body, url, icon, priority, category, kind,
          idempotency_key, targeting, expires_at, created_by, created_at, updated_at
        ) VALUES (
          format('%s term ending — %s', initcap(r.seat), r.college),
          format('%s is %s of the %s at %s, and their term ends on %s — %s day%s from '
                 'today. Appoint a successor before that date so the committee is not '
                 'left without a %s.',
                 r.leader_name, r.seat, r.committee_name, r.college,
                 to_char(r.term_end, 'DD Mon YYYY'), v_days,
                 CASE WHEN v_days = 1 THEN '' ELSE 's' END, r.seat),
          '/accreditation/naac/committees/' || r.committee_id::text,
          'AlertTriangle',
          CASE WHEN v_threshold = 7 THEN 'high' ELSE 'normal' END,
          'accreditation',
          'work_item',
          v_key,
          jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_stewards)),
          (r.term_end + 1)::timestamptz,
          v_sys, now(), now()
        )
        RETURNING id INTO v_note;

        INSERT INTO public.user_notifications (notification_id, user_id, created_at)
        SELECT v_note, s, now() FROM unnest(v_stewards) AS s
        ON CONFLICT (notification_id, user_id) DO NOTHING;
      END IF;

      v_sent       := v_sent + 1;
      v_recipients := v_recipients + array_length(v_stewards, 1);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',                      p_dry_run,
    'as_of',                        v_today,
    'examined',                     v_examined,
    'candidates',                   v_candidates,
    'sent',                         v_sent,
    'skipped',                      v_skipped,
    'recipients',                   v_recipients,
    'external_leaders_no_inapp',    v_external,
    'unreachable',                  v_unreachable,
    'steward_fallback_super_admin', v_fallback,
    'by_threshold',                 jsonb_build_object('d30', v_t30, 'd7', v_t7)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_accreditation_committee_term_warnings(boolean) IS
  'Director decision 8: warn a committee 30 days and again 7 days before its Chair''s '
  'or Coordinator''s roster term_end, so a successor can be appointed. Writes TWO '
  'notifications per warning — one to the outgoing leader, one to the holders of '
  'accreditation.naac.committees.edit with the outgoing leader EXCLUDED (escalating to '
  'super admins if that empties the set), because the person who could fix it may be '
  'the one whose term is ending. Idempotent on notifications.idempotency_key keyed by '
  '(member, term_end, threshold, audience), so each warning is sent exactly once ever, '
  'not once per day; an extended term produces new keys and is warned again. '
  'p_dry_run=true counts what would be sent and writes nothing. Returns counts for '
  'every branch, including unreachable > 0 when nobody could be told — a quiet zero '
  'must never be indistinguishable from a quiet failure. Does NOT revoke anybody''s '
  'access: no cut-off on term_end exists in this database yet.';

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- independently of PUBLIC, so revoking PUBLIC alone would leave this callable
-- with the anon key that ships in every browser bundle. Both revokes are
-- deliberate. authenticated is revoked too: this writes notifications addressed
-- to other people and has no signed-in caller.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_committee_term_warnings(boolean)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_committee_term_warnings(boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- SCHEDULING — the dispatcher, not vercel.json.
-- ---------------------------------------------------------------------------
-- vercel.json already holds EXACTLY 100 cron entries, which is the plan cap; a
-- 101st fails the build for every deploy, not just this feature (see the same
-- note in app/api/cron/cac-attendance-rollup/route.ts and
-- app/api/cron/gemba-official-lapse/route.ts). New crons are therefore
-- scheduled through /api/cron/ai-routine-dispatcher, which reads this table
-- every 15 minutes and fires the route with the CRON_SECRET Bearer token.
--
-- 09:07 IST (minute_of_day 547) — inside working hours, so the warning lands
-- when the people who must act on it are at a desk, and off the :00/:30 marks
-- everything else crowds onto. Daily; the idempotency key, not the schedule,
-- is what stops repeat sends.
--
-- `managed = true` lets a super admin change the day/time from
-- /admin/ai-routines without a redeploy. ON CONFLICT DO NOTHING so re-applying
-- never resets a time somebody has since edited.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('committee-term-reminders', true, ARRAY[0,1,2,3,4,5,6], 547, true)
ON CONFLICT (routine_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- §4. VERIFICATION — how this was proved, and what to re-run after apply.
-- ---------------------------------------------------------------------------
-- 4a. WHY THE OBVIOUS TEST IS WORTHLESS HERE. Every term in production ends
--     2027-03-31, ~604 days out. Running the function today returns
--     candidates 0, sent 0 — which is EXACTLY what a broken date predicate, a
--     mis-typed role filter or a silently-empty steward query would also
--     return. "It ran and sent nothing" is not evidence of anything.
--
-- 4b. WHAT WAS ACTUALLY RUN — 2026-08-05, against PRODUCTION, as one
--     Mgmt-API batch (the API wraps a batch in a single transaction) opened
--     with BEGIN and closed with ROLLBACK. Every number below is OBSERVED
--     OUTPUT, not an expectation. This whole file, its REVOKE/GRANT and its
--     ai_routine_schedules INSERT were created inside that transaction, then
--     rolled back.
--
--       BEGIN;
--       <this entire file>
--       -- baseline
--       SELECT count(*) FROM notifications WHERE idempotency_key LIKE 'committee_term:%';
--       -- CONTROL first, with NO synthetic rows
--       SELECT fn_accreditation_committee_term_warnings(true);
--       -- then move the real Nursing coordinator's term to 5 days out and the
--       -- Allied Health coordinator's to 20 days out
--       UPDATE accreditation_committee_members SET term_end = CURRENT_DATE + 5
--        WHERE id = 'f4aa0faf-d2ff-4b4b-b6df-51c9c697e96b';
--       UPDATE accreditation_committee_members SET term_end = CURRENT_DATE + 20
--        WHERE id = 'a2e6f8b1-a9b9-4f85-8508-9d42b4aac99f';
--       SELECT fn_accreditation_committee_term_warnings(true);   -- dry run
--       SELECT fn_accreditation_committee_term_warnings(false);  -- real write
--       SELECT fn_accreditation_committee_term_warnings(false);  -- re-run
--       ROLLBACK;
--
--     OBSERVED:
--       baseline                → 0 committee_term:% notifications
--       CONTROL (no synth)      → examined 3, candidates 0, sent 0,
--                                 by_threshold {d30:0, d7:0}
--       dry run  (with synth)   → examined 3, candidates 2, sent 4,
--                                 recipients 10, by_threshold {d30:1, d7:1},
--                                 unreachable 0, steward_fallback false
--                                 ...and notifications count STILL 0 — the dry
--                                 run wrote nothing, measured, not assumed.
--       first write             → sent 4, recipients 10, unreachable 0
--       re-run, same day        → sent 0, SKIPPED 4.  ← THE IDEMPOTENCY PROOF.
--                                 A date-stamped key would have returned sent 4
--                                 again tomorrow; these keys never will.
--       rows actually written   → 4 notifications, 10 user_notifications
--                                 (1 self + 4 stewards, twice), keys exactly:
--         committee_term:a2e6f8b1-…:2026-08-25:30d:self
--         committee_term:a2e6f8b1-…:2026-08-25:30d:steward
--         committee_term:f4aa0faf-…:2026-08-10:7d:self
--         committee_term:f4aa0faf-…:2026-08-10:7d:steward
--       STEWARD EXCLUSION       → the 7-day steward notice for Mrs VIMALA V
--                                 targeted 4 user_ids and her own id
--                                 (17f4d7e3-…) was NOT among them; her SELF
--                                 notice targeted exactly [17f4d7e3-…].
--                                 This is Director decision 8 made executable.
--       untouched third member  → Ommsharravana, term still 2027-03-31, drew
--                                 no notice at all. The window is a window.
--       ACL                     → anon false, authenticated false,
--                                 service_role true.
--       schedule row            → one row, enabled, managed, minute_of_day 547,
--                                 days_of_week {0,1,2,3,4,5,6}.
--
-- 4c. NON-VACUITY. The control above is the same call in the same transaction
--     with only the two UPDATEs missing, and it returns candidates 0 / sent 0.
--     The 2 / 4 / 10 are produced by the near-expiry rows and by nothing else.
--     Note `examined` is 3 in BOTH: the sweep looked at every leadership seat
--     either way, which is precisely why examined and candidates are reported
--     separately — "looked at nothing" and "found nothing" must not read alike.
--
-- 4d. RESIDUE, checked in a SEPARATE call after the rollback (a rehearsal that
--     verifies itself inside its own transaction proves nothing):
--       fn_accreditation_committee_term_warnings present  → 0
--       committee_term:% notifications                    → 0
--       ai_routine_schedules row                          → 0
--       all three member.term_end                         → 2027-03-31
--     Production is untouched.
--
-- 4e. RE-RUN AFTER APPLY (structural + ACL):
--
--     SELECT has_function_privilege('anon',
--              'public.fn_accreditation_committee_term_warnings(boolean)','EXECUTE') AS anon_can,
--            has_function_privilege('authenticated',
--              'public.fn_accreditation_committee_term_warnings(boolean)','EXECUTE') AS auth_can,
--            has_function_privilege('service_role',
--              'public.fn_accreditation_committee_term_warnings(boolean)','EXECUTE') AS svc_can;
--     -- expect false, false, true
--
--     SELECT routine_id, enabled, minute_of_day, managed
--       FROM ai_routine_schedules WHERE routine_id = 'committee-term-reminders';
--     -- expect one enabled, managed row
--
-- 4f. THE BEHAVIOURAL CHECK THAT MATTERS, the first time a term genuinely
--     comes within 30 days: open the bell AS one of the steward accounts and
--     confirm the item is visible and its link opens the committee. Counts in
--     a JSON body are not proof that a human was told — user_notifications is
--     the delivery, and only a real read proves it arrived.
