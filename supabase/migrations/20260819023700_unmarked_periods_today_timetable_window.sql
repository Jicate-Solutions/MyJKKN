-- ================================================================================
-- The unmarked-periods badge starts counting RETIRED timetables on 2026-08-15.
-- Give fn_aqs_attendance_unmarked_periods_today the validity-window predicate its
-- own date-ranged sibling already carries.
--
-- Created: 2026-08-11
-- FILE ONLY / NOT APPLIED. Applying is Director-gated.
--
-- Body captured VERBATIM from production `pg_get_functiondef`
--   (project kvizhngldtiuufknvehv, 2026-08-11, 9,252 chars,
--    md5 913fa4a23631b8cee794d90be149ac0e)
-- The md5 above is the hash of the body AS CAPTURED, i.e. the PRE-state this file
-- expects to find and the value the drift guard below checks. It is deliberately
-- NOT the hash of the SQL in this file, which differs from it by two predicate
-- pairs and two explanatory comments — one `ADDED 2026-08-11` marker beside each
-- pair, plus a paragraph above the query. No executable statement other than those
-- two predicate pairs was added, moved or removed; the grants, the scope clamp,
-- the identity guard and the whitespace are byte-for-byte the captured body.
--
-- One consequence of that verbatimness is worth flagging before it misleads
-- somebody: the copied security-clamp comment below says "The re-grain in this
-- migration WIDENS what that exposes". "This migration" there means
-- 20260816030000, where the sentence was written. THIS file contains no re-grain.
-- The prose is left untouched precisely so the body stays byte-comparable with
-- production; correcting it would trade a checkable property for a nicer comment.
--
-- --------------------------------------------------------------------------------
-- THE BUG, AND WHY IT HAS A DATE ON IT
-- --------------------------------------------------------------------------------
-- `timetables` carries `start_date` / `end_date`: the window during which that
-- timetable is actually teaching. The today function never reads either column.
-- Confirmed by catalog read on production 2026-08-11:
--
--   fn_aqs_attendance_unmarked_periods_today   start_date: NO    end_date: NO
--   fn_aqs_attendance_unmarked_periods_range   start_date: YES   end_date: YES
--
-- Today that costs nothing, and that is the entire trap. Every active timetable
-- currently sits inside its own window — the latest active `start_date` is
-- 2026-08-10 (already passed) and the earliest active `end_date` is 2026-08-14
-- (not yet reached) — so the predicate removes zero rows and the badge is right
-- by luck, not by construction. Measured cluster-wide, read-only, 2026-08-11:
--
--   without the window : 176      with the window : 176      difference: 0
--
-- On 2026-08-15 the luck runs out. Three active non-template timetables end on
-- 2026-08-14; all three last recorded attendance on 2026-08-10 and all three are
-- scheduled Monday-to-Friday or Monday-to-Saturday, so the old body keeps
-- rostering them for teaching days that no longer exist. Simulated per day,
-- read-only, against the live estate:
--
--   2026-08-11 TUE   old 176   new 176   phantom 0
--   2026-08-12 WED   old 177   new 177   phantom 0
--   2026-08-13 THU   old 177   new 177   phantom 0
--   2026-08-14 FRI   old 177   new 177   phantom 0
--   2026-08-15 SAT   old 121   new 120   phantom 1     <- divergence begins
--   2026-08-16 SUN   old   0   new   0   phantom 0
--   2026-08-17 MON   old 176   new 173   phantom 3
--   2026-08-18 TUE   old 176   new 173   phantom 3
--   … and 3 per teaching day thereafter. Over 2026-08-15..2026-11-12 the old body
--   scores 12,875 timetable-days where the windowed one scores 11,923 — 952
--   phantom sessions in the first quarter alone.
--
-- The same defect measured backwards over a month that has already happened,
-- which is the number the range migration published and this run reproduces
-- exactly (2026-07-01..2026-07-31, cluster scope):
--
--   without the window : 2,045    with the window : 1,933    phantom: 112
--
-- --------------------------------------------------------------------------------
-- IT IS ALSO A VISIBLE SELF-CONTRADICTION, NOT ONLY AN INFLATED NUMBER
-- --------------------------------------------------------------------------------
-- `fn_aqs_attendance_unmarked_periods_range` (20260817043700) already carries the
-- window. Its header says so in plain words and predicts the exact date this
-- becomes visible: "the earliest `end_date` on the active estate is 2026-08-14.
-- On 2026-08-15 the today function will report a session for a timetable that
-- stopped teaching on the 14th and this one will not … the honest reading is that
-- the today function is the one that is wrong — it is missing a predicate, not
-- this file carrying a spare."
--
-- That is this migration. From 2026-08-15 the badge and the history screen would
-- otherwise render two different counts from the same learner data on the same
-- page. Verified read-only on 2026-08-11 that they agree today and still agree
-- after this change:
--
--   today() predicate                          -> 176
--   range() predicate over [today, today]      -> 176
--   today() predicate WITH this window          -> 176
--
-- --------------------------------------------------------------------------------
-- WHAT CHANGED, AND WHAT DELIBERATELY DID NOT
-- --------------------------------------------------------------------------------
-- ADDED, in BOTH places, worded byte-for-byte as the range function words it:
--
--   AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE)
--   AND (t.end_date   IS NULL OR t.end_date   >= CURRENT_DATE)
--
-- BOTH PLACES IS LOAD-BEARING. This function computes its count in the outer
-- query and its `sample_period_ids` in a separate ARRAY subquery over the same
-- table. Adding the predicate to only one of them makes the badge disagree with
-- the list it deep-links to — a count of 173 whose "show me which" names 176,
-- including a timetable that stopped teaching. The two predicates were already
-- kept identical for exactly this reason; they stay identical here.
--
-- NULL-TOLERANT ON PURPOSE. 3 active non-template timetables have a NULL
-- `start_date` and 3 have a NULL `end_date` (measured 2026-08-11). `IS NULL OR`
-- keeps every one of them counted. A bare `start_date <= CURRENT_DATE` would
-- evaluate to NULL and silently drop them — under-reporting unmarked attendance,
-- which is the failure direction that hides work rather than inventing it, and
-- therefore the one nobody would notice.
--
-- THE GRAIN IS UNTOUCHED. Counting key stays `COUNT(DISTINCT t.id)`, clearing key
-- stays `sa.timetable_id = t.id`, templates stay excluded via
-- `NOT COALESCE(is_template, false)`, scheduling stays
-- `selected_days ? v_today_dow`. 20260816030000 explains at length why each of
-- those is load-bearing — in particular that keying the NOT EXISTS on `section_id`
-- makes a semester-level timetable read unmarked forever, including after it has
-- been marked. None of that is reopened here. The proof that it is untouched is
-- that today's number does not move: a grain change could not leave 176 = 176.
--
-- NEITHER SHIPPED MIGRATION IS EDITED. 20260816030000 and 20260817043700 are
-- already carried by production. This repository corrects a migration with a new
-- migration rather than rewriting a file that has run.
--
-- `CURRENT_DATE` IS THE UTC DATE, AND THAT IS DELIBERATE HERE. Verified on
-- production 2026-08-11: the database `TimeZone` is `UTC`, so between 00:00 and
-- 05:30 IST `CURRENT_DATE` is still the previous Indian day. The window predicate
-- inherits that. It is not corrected in this file because the function is ALREADY
-- built on the UTC day everywhere else — `v_today_dow` is derived from
-- `CURRENT_DATE`, and the clearing test compares `sa.attendance_date =
-- CURRENT_DATE`. Pinning only the new predicate to `Asia/Kolkata` would make the
-- validity window disagree with the day-of-week and with the attendance lookup
-- inside one query, which is strictly worse than a consistent 5.5-hour skew.
-- Moving the whole function (and its siblings, and `attendance_date`'s own
-- semantics) onto the institution's local day is a real question and a separate
-- one; it is recorded here so the next reader does not have to rediscover it.
--
-- `SET search_path` KEPT AT ITS LIVE VALUE, `public, pg_catalog`. The range
-- function's header argues that bare `public` is strictly stronger (an unlisted
-- pg_catalog is searched first and cannot be shadowed), and that argument is
-- correct — but changing it here would be a second, unmeasured change riding
-- along inside a one-predicate fix. It belongs in the sweep that fixes it
-- everywhere, not in this diff.
--
-- --------------------------------------------------------------------------------
-- KNOWN, MEASURED, DELIBERATELY OUT OF SCOPE: THE SIBLING ON THE SAME SCREEN
-- --------------------------------------------------------------------------------
-- `fn_aqs_attendance_faculty_compliance_today` has the SAME missing predicate
-- (catalog read 2026-08-11: end_date NO). It feeds the HOD compliance badge on
-- /academic/attendance/dashboard — the same screen. Measured for Monday
-- 2026-08-17, cluster-wide: 176 timetables without the window, 173 with it, so it
-- will over-report by the same 3 from the same date.
--
-- It is NOT fixed here, and the honest statement of the cost is that this file
-- CREATES a same-screen divergence rather than merely declining to close one.
-- Today the two agree, because neither reads the window and nothing is outside
-- it. From 2026-08-15 the pending badge will exclude the three retired timetables
-- and the compliance badge will still include them. An earlier draft of this
-- header claimed "correcting one does not make the other newly inconsistent" —
-- that claim is false and has been removed rather than softened.
--
-- What is true is that the divergence this file removes is the worse of the two.
-- `_today` and `_range` are the SAME measurement — unmarked teaching sessions —
-- rendered on the same screen, one as a badge and one as its own history; two
-- numbers there are self-contradictory on their face. `_today` and
-- `_faculty_compliance_today` are different measurements at different scopes
-- (cluster pending count vs one department's compliance), so a reader is not
-- comparing them digit for digit.
--
-- That is a reason to sequence, not a reason to skip. **The compliance follow-up
-- should land before or together with this file**; both are Director-gated and
-- therefore apply by hand, so they can be applied in one sitting. It is kept out
-- of this migration because it is a second function with its own before/after
-- numbers (176 → 173 for 2026-08-17) that deserve their own review, not because
-- it is optional.
--
-- --------------------------------------------------------------------------------
-- NO `BEGIN` / `COMMIT` IN THIS FILE — ON PURPOSE
-- --------------------------------------------------------------------------------
-- A migration carrying its own COMMIT defeats a reviewer's
-- `BEGIN; \i file; ROLLBACK;` rehearsal: the inner COMMIT lands before the
-- ROLLBACK is reached and the change is live while the reviewer believes they
-- rehearsed it. That has already happened once in this repository. There is one
-- logical change here and `supabase db push` wraps each migration in its own
-- transaction, so the explicit block buys nothing and costs that.
--
-- --------------------------------------------------------------------------------
-- COST
-- --------------------------------------------------------------------------------
-- Two extra column comparisons on a set of ~178 rows, both against columns already
-- fetched. The missing composite index on
-- student_attendance(timetable_id, attendance_date) that both sibling functions
-- note is unaffected and still belongs in the dedicated attendance index PR —
-- CREATE INDEX CONCURRENTLY cannot run inside a migration's transaction anyway.
-- ================================================================================

-- ────────────────────────────────────────────────────────────────────────────────
-- DRIFT GUARD — refuse to apply over a body that is no longer the one we edited.
--
-- This file re-ships a COMPLETE 9,252-character SECURITY DEFINER body captured on
-- 2026-08-11, and it is applied later, by hand, under a Director gate. That delay
-- is the hazard: `CREATE OR REPLACE` overwrites whatever is there, so anything
-- changed on the live function between capture and apply is silently REVERTED and
-- nothing in the diff would show it. This is not theoretical for this particular
-- function — it gained its identity guard and its `p_institution_id` security
-- clamp only on 2026-08-08, and reverting those re-opens a cross-institution scope
-- override on a function GRANTed to `authenticated`.
--
-- RAISE EXCEPTION, never RAISE NOTICE: a guard whose miss path only notices stamps
-- zero rows and reads as success, and Supabase Studio hides NOTICE entirely.
--
-- TWO EXACT HASHES, NO SUBSTRING FALLBACK. An earlier draft accepted "the body
-- already mentions start_date and end_date" as proof that this migration had run.
-- That is an escape hatch, not an idempotency check: ANY later body that happens to
-- name those columns — this window plus a timezone fix, a re-hardened clamp, a
-- scope correction — would satisfy it and then be silently reverted by the DDL
-- below, which is the exact hazard the guard exists to stop. (`_` is a LIKE
-- wildcard too, so the pattern was looser still.) Only two definitions are
-- acceptable now: the captured pre-state, and this file's own post-state.
--
-- THE DDL IS INSIDE THE GUARD, ON PURPOSE — this is the load-bearing part.
-- A standalone `DO` block followed by a bare `CREATE OR REPLACE` protects nothing
-- under the apply path this file actually advertises. `psql -f` runs in autocommit
-- with `ON_ERROR_STOP` OFF by default: the RAISE aborts only its own statement, one
-- red line scrolls past, and the `CREATE OR REPLACE` then runs anyway and
-- overwrites the drifted body. A test driver that sends the file as one implicit
-- transaction hides this completely — the guard looks proven while being inert
-- where it matters. Wrapping the DDL in `EXECUTE` inside the same `DO` makes guard
-- and DDL ONE statement, so the abort is atomic under every apply path without
-- reintroducing a `BEGIN`/`COMMIT` that would defeat a reviewer's ROLLBACK
-- rehearsal. Belt and braces: apply with `psql -v ON_ERROR_STOP=1 -f <file>`.
--
-- Three outcomes, all explicit:
--   md5 = pre-state   -> replace the body, then re-assert privileges
--   md5 = post-state  -> body already correct; STILL re-assert privileges
--   anything else     -> abort, naming the hash actually found
--
-- The idempotent path re-asserts privileges rather than returning early, because
-- pg_get_functiondef does not render the ACL: a hash that says "already applied"
-- is blind to `anon` having been re-granted since. See the block below the DDL.
-- ────────────────────────────────────────────────────────────────────────────────
DO $guard$
DECLARE
    -- Hash of the body AS CAPTURED from production 2026-08-11 (9,252 chars).
    v_pre  CONSTANT TEXT := '913fa4a23631b8cee794d90be149ac0e';
    -- Hash of the body this file INSTALLS (10,181 chars). Both were reproduced
    -- byte-for-byte on a local PostgreSQL 16 from these same migration sources.
    v_post CONSTANT TEXT := 'd315ad4e56648263694bd0727b45d9e8';
    v_def  TEXT;
    v_md5  TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.fn_aqs_attendance_unmarked_periods_today(uuid,uuid)');

    IF v_def IS NULL THEN
        RAISE EXCEPTION
            'DRIFT GUARD: public.fn_aqs_attendance_unmarked_periods_today(uuid,uuid) does not exist. '
            'This migration REPLACES a shipped body (20260816030000); it must never be the file that '
            'creates one, because then these 9,252 characters are not a correction of anything that '
            'was reviewed.';
    END IF;

    v_md5 := md5(v_def);

    IF v_md5 <> v_pre AND v_md5 <> v_post THEN
        RAISE EXCEPTION
            'DRIFT GUARD: the live body of fn_aqs_attendance_unmarked_periods_today is neither the '
            'body captured on 2026-08-11 (md5 %) nor the body this migration installs (md5 %). Found '
            '%. Applying would silently REVERT whatever changed — including, if it touched them, the '
            'identity guard and the p_institution_id security clamp added 2026-08-08, whose loss '
            're-opens a cross-institution scope override on a function GRANTed to authenticated. '
            'Re-capture the live body with pg_get_functiondef, re-apply the two window predicates to '
            'it, re-measure, and update both hashes. NOTE: a PostgreSQL MAJOR VERSION change is also '
            'a legitimate cause — pg_get_functiondef rendering is not guaranteed stable across '
            'majors — so compare the definitions before assuming somebody edited the function.',
            v_pre, v_post, v_md5;
    END IF;

    -- ── The change itself. Same statement as the guard, so it cannot outlive it. ──
    -- Skipped when the body is already at post-state; the ACL block below is NOT.
    IF v_md5 = v_pre THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_unmarked_periods_today(
    p_user_id        UUID,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_institution_id  UUID;
    v_department_id   UUID;
    v_role            TEXT;
    v_cluster_scoped  BOOLEAN := false;
    v_count           INT := 0;
    v_sample_ids      UUID[];
    v_today_dow       TEXT;
BEGIN
    -- IDENTITY GUARD — must come before anything reads p_user_id.
    --
    -- Every scope decision below is derived from `profiles WHERE id = p_user_id`,
    -- and p_user_id is an ARGUMENT. The function is SECURITY DEFINER and GRANTed
    -- to `authenticated`, so without this guard any signed-in caller could pass a
    -- known super-admin's UUID through PostgREST and walk straight past the clamp
    -- below — the clamp would faithfully evaluate someone else's privileges.
    --
    -- auth.uid() is present for every request that arrives with a user JWT, which
    -- is how the app calls this: lib/attention-bar/state-queries.ts builds its
    -- client with createServerSupabaseClient() (the cookie-backed session client),
    -- not the service-role one. When auth.uid() IS NULL the caller is service_role
    -- or an internal server context that already holds full trust, and p_user_id
    -- is honoured as before so those paths keep working.
    IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('count', 0, 'sample_period_ids', '[]'::jsonb);
    END IF;

    -- Resolve caller role + institution from profiles
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    -- Is this caller's role cluster-scoped? ASK THE ROLE REGISTRY, never a
    -- hardcoded name list. Role scope is configuration in this platform —
    -- custom_roles.institution_scope is what Role Management writes and what
    -- role_has_institution_access() reads — so a literal list here would be a
    -- second, silently-drifting copy of that decision.
    --
    -- Measured on production 2026-08-08, which is exactly why the list form is
    -- wrong: custom_roles holds NO row named 'admin' at all. It holds
    -- 'administrator' and 'super_admin', both institution_scope='all'. Yet ONE
    -- live profile still carries the legacy value role='admin', WITH an
    -- institution_id and WITHOUT the is_super_admin flag — a single-tenant user
    -- that a name list mentioning 'admin' would hand the whole cluster to.
    -- Conversely the 2 real 'administrator' users are cluster-scoped and have
    -- NO institution_id, so clamping them by name would empty their screen.
    -- Reading the registry gets both cases right without naming either.
    SELECT COALESCE(bool_or(cr.institution_scope = 'all'), false)
    INTO v_cluster_scoped
    FROM public.custom_roles cr
    WHERE cr.role_key = v_role
      AND cr.is_active;

    -- p_institution_id override — SECURITY CLAMP (added 2026-08-08)
    --
    -- This function is GRANTed to `authenticated`, so any signed-in user can call
    -- it directly through PostgREST with arguments of their choosing. Before this
    -- clamp the override was unconditional: passing another college's UUID as
    -- p_institution_id simply replaced the caller's own institution and returned
    -- that college's unmarked count plus up to ten of its timetable UUIDs.
    -- The re-grain in this migration WIDENS what that exposes, from
    -- COUNT(DISTINCT section_id) to COUNT(DISTINCT timetables.id) including the
    -- semester-level rows this migration un-hides, so it is closed here rather
    -- than re-shipped.
    --
    -- Only a genuinely cluster-scoped caller may redirect the scope. Everyone
    -- else keeps the institution from their own profile, whatever they pass.
    IF COALESCE(v_is_super_admin, false) OR v_cluster_scoped THEN
        v_institution_id := p_institution_id;
    ELSIF p_institution_id IS NOT NULL THEN
        NULL; -- keep v_institution_id from profiles (security clamp)
    END IF;

    -- A cluster-scoped caller naming no institution sees all of them.
    IF (COALESCE(v_is_super_admin, false) OR v_cluster_scoped)
       AND p_institution_id IS NULL THEN
        v_institution_id := NULL;
    END IF;

    -- FAIL CLOSED. The scope predicate below reads
    -- `(v_institution_id IS NULL OR t.institution_id = v_institution_id)`, so a
    -- NULL institution means CLUSTER-WIDE, not "none". A caller who is NOT
    -- cluster-scoped and whose institution cannot be resolved — an unknown
    -- p_user_id, or a profile with a NULL institution_id — would otherwise fall
    -- through that predicate into every college's data. Return empty instead.
    IF NOT COALESCE(v_is_super_admin, false)
       AND NOT v_cluster_scoped
       AND v_institution_id IS NULL THEN
        RETURN jsonb_build_object('count', 0, 'sample_period_ids', '[]'::jsonb);
    END IF;

    -- Resolve the department for a HOD (via profile_id or institution_email).
    --
    -- Skipped for cluster-scoped callers. The predicate below reads
    -- `(v_department_id IS NULL OR t.department_id = v_department_id)`, so ANY
    -- resolved department narrows the result — and a super administrator who also
    -- happens to hold an active staff row would silently have their cluster-wide
    -- view collapsed to that one department. It under-reports rather than
    -- over-reports, so it fails safe, but it is still the wrong number.
    IF NOT (COALESCE(v_is_super_admin, false) OR v_cluster_scoped) THEN
        SELECT s.department_id
        INTO v_department_id
        FROM public.staff s
        WHERE (s.profile_id = p_user_id
           OR s.institution_email = (SELECT email FROM public.profiles WHERE id = p_user_id))
          AND s.is_active = true
        ORDER BY CASE WHEN s.profile_id = p_user_id THEN 0 ELSE 1 END
        LIMIT 1;
    END IF;

    -- Today's day-of-week in uppercase (matches timetable selected_days format)
    -- e.g. 'monday' -> 'MONDAY'
    v_today_dow := UPPER(TO_CHAR(CURRENT_DATE, 'DAY'));
    -- TO_CHAR pads with spaces; trim them
    v_today_dow := TRIM(v_today_dow);

    -- NOTE: Missing index on student_attendance(timetable_id, attendance_date).
    -- Add in a dedicated attendance index PR.

    -- Timetables scheduled today with no attendance record for today.
    --
    -- GRAIN IS THE TIMETABLE, NOT THE SECTION. Do not reintroduce
    -- `section_id IS NOT NULL`, and do not key the NOT EXISTS on `section_id`:
    -- a semester-level timetable carries a NULL section, so
    -- `sa.section_id = t.section_id` evaluates to NULL rather than TRUE and
    -- NOT EXISTS never stops being true — the row would read unmarked forever,
    -- including after it has been marked. `student_attendance.timetable_id` is
    -- NOT NULL, which is what makes it a safe existence key.
    --
    -- THE EXISTENCE TEST CARRIES NO INSTITUTION PREDICATE, DELIBERATELY. The old
    -- shape filtered timetables on `t.institution_id` but tested attendance on
    -- `sa.institution_id`, and those are different columns: an attendance row whose
    -- denormalised institution drifts from its timetable's satisfies the count side
    -- and fails the NOT EXISTS, so the row reads unmarked forever after being
    -- marked — mechanism 3 reopened through a second column. Production already has
    -- one such row (measured 2026-08-08). The predicate was also redundant:
    -- `sa.timetable_id = t.id` pins exactly one timetable and `t` is already
    -- institution-scoped above, so the clause could only ever wrongly EXCLUDE a
    -- match, never admit an extra one. Do not add it back.
    --
    -- THE TIMETABLE'S OWN VALIDITY WINDOW (ADDED 2026-08-11). A timetable that
    -- stopped teaching on its end_date is not scheduled today, however its
    -- selected_days read. Worded identically to
    -- fn_aqs_attendance_unmarked_periods_range so the badge and the history screen
    -- cannot disagree, and applied to BOTH the count and the sample list below so
    -- the badge cannot disagree with the list it links to. NULL-tolerant: a NULL
    -- start_date or end_date means "no bound", never "excluded".
    SELECT
        COUNT(DISTINCT t.id)::INT,
        ARRAY(
            SELECT DISTINCT t2.id
            FROM public.timetables t2
            WHERE t2.is_active = true
              AND NOT COALESCE(t2.is_template, false)
              AND (v_institution_id IS NULL OR t2.institution_id = v_institution_id)
              AND (v_department_id IS NULL OR t2.department_id = v_department_id)
              AND t2.selected_days ? v_today_dow
              -- ADDED 2026-08-11 — validity window (see header)
              AND (t2.start_date IS NULL OR t2.start_date <= CURRENT_DATE)
              AND (t2.end_date   IS NULL OR t2.end_date   >= CURRENT_DATE)
              AND NOT EXISTS (
                  SELECT 1 FROM public.student_attendance sa2
                  WHERE sa2.timetable_id    = t2.id
                    AND sa2.attendance_date = CURRENT_DATE
              )
            ORDER BY t2.id
            LIMIT 10
        )
    INTO v_count, v_sample_ids
    FROM public.timetables t
    WHERE t.is_active = true
      AND NOT COALESCE(t.is_template, false)
      AND (v_institution_id IS NULL OR t.institution_id = v_institution_id)
      AND (v_department_id IS NULL OR t.department_id = v_department_id)
      AND t.selected_days ? v_today_dow
      -- ADDED 2026-08-11 — validity window (see header)
      AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE)
      AND (t.end_date   IS NULL OR t.end_date   >= CURRENT_DATE)
      AND NOT EXISTS (
          SELECT 1 FROM public.student_attendance sa
          WHERE sa.timetable_id    = t.id
            AND sa.attendance_date = CURRENT_DATE
      );

    RETURN jsonb_build_object(
        'count',             COALESCE(v_count, 0),
        'sample_period_ids', COALESCE(to_jsonb(v_sample_ids), '[]'::jsonb)
    );
END;
$function$;
$ddl$;
    END IF;

    -- ── PRIVILEGES — RE-ASSERTED ON EVERY PATH, INCLUDING THE IDEMPOTENT ONE ────
    -- Deliberately OUTSIDE the IF above. `pg_get_functiondef` does not render the
    -- ACL, so the hash that decides "already applied" is blind to privileges: a
    -- body already at post-state whose `anon` grant has since been restored — by
    -- Supabase's ALTER DEFAULT PRIVILEGES, or by re-running the 155-name grant
    -- loop in 20260605191101, which this index already flags as re-opening holes —
    -- would otherwise be waved straight through by a guard whose own header
    -- promises it re-asserts the revoke.
    --
    -- The cost of getting that wrong is not theoretical for THIS function. Reached
    -- as `anon`, `auth.uid()` is NULL, and the identity guard reads a NULL
    -- auth.uid() as "service_role or internal caller, already fully trusted" and
    -- then honours whatever `p_user_id` it was handed. So an anon caller holding
    -- the public key that ships in every browser bundle could pass a known
    -- super-admin UUID and read cluster-wide unmarked counts and timetable UUIDs.
    -- Re-asserting is also strictly better than merely checking: it repairs the
    -- ACL rather than reporting it.
    EXECUTE $acl$
-- Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
-- so anon holds a direct grant SEPARATE from PUBLIC. Revoking PUBLIC alone leaves
-- the function callable by any unauthenticated client holding the public anon key,
-- which is embedded in every browser bundle. Both must be named, and they must be
-- re-asserted here because CREATE OR REPLACE on a function whose privileges were
-- already correct is not what re-grants them — a future environment that creates
-- this function fresh would inherit the default anon grant otherwise.
--
-- NOT WIDENED. This is the grant set production already holds, read from
-- pg_proc.proacl on 2026-08-11:
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) IS
    'AQS Layer-2 state query. Counts timetables that are active, not a template, scheduled for '
    'today via selected_days, INSIDE their own start_date/end_date validity window, and still '
    'have no student_attendance row for today. Counted per TIMETABLE, not per section — '
    'semester-level timetables carry a NULL section and were invisible until 2026-08-08. The '
    'existence key is student_attendance.timetable_id (NOT NULL), so the counting key and the '
    'clearing key share one grain and a marked timetable always disappears from the result. The '
    'validity window was added 2026-08-11 to match fn_aqs_attendance_unmarked_periods_range: '
    'without it the count would have started including timetables that stopped teaching on '
    '2026-08-14, and the badge and the history screen would have rendered different numbers from '
    'the same data. A NULL start_date or end_date means unbounded, not excluded. '
    'sample_period_ids holds up to 10 TIMETABLE UUIDs and carries the same window predicate as '
    'the count. Senior Learner and HOD scope: their department. super_admin: institution or all.';
$acl$;
END
$guard$;
