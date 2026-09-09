-- ============================================================================
-- 20260821030000_attendance_activates_learner.sql
--
-- Being marked PRESENT for the first time is what makes a learner active.
--
-- DIRECTOR'S RULE (2026-08-11): a learner becomes `active` by ATTENDING — not
-- at admission, not by a manual flip. The trigger condition is the FIRST time
-- the learner is marked PRESENT. Not two or more days; not any-mark-including-
-- absent.
--
-- ── 🔴 APPLY-ORDER REQUIREMENT — THIS FILE MUST NOT REACH PRODUCTION FIRST ──
--
--   PR #2936 (`feat/provisional-freshers-roster`) is UNMERGED. Until it ships,
--   `fn_attendance_roster` filters `lifecycle_status = 'active'`, so a
--   `reserved` / `admitted` learner is not on any marking screen at all —
--   they are not marked absent, they are ABSENT FROM THE SCREEN.
--
--   Applied on its own, this file is therefore not merely inert: it is a
--   PERMANENT LOCK. Those learners cannot be marked, so they can never attend,
--   so they can never become active — and the only automatic route out of
--   `reserved` (the fee gate) is not the route this rule describes. The
--   population is not small: 795 `reserved` + 124 `admitted` = 919 learners,
--   measured read-only on production 2026-08-11.
--
--   Apply order: #2936 (+ the attendance dashboard lane) FIRST, proven live,
--   and only then this file, and only then the switch below.
--
-- ── ⚠️ THIS REVERSES A PREVIOUSLY LOCKED DECISION ────────────────────────────
--
--   PR #2936 ships under locked decision 4, "No auto-activation trigger", and
--   says of itself: "Nothing here writes lifecycle_status. No trigger is added
--   and no new route to `active` exists, so the fee gate is untouched
--   structurally." This file adds exactly the trigger that decision forbade.
--   The 2026-08-11 Director ruling is later and explicit, so it is built — but
--   it is NOT a detail, and it is not resolved silently. See the PR body.
--
-- ── ⚠️ AND IT OPENS A THIRD ROUTE TO `active`, BYPASSING THE FEE GATE ────────
--
--   Live today (`admission_statuses`, read 2026-08-11) the ladder is:
--       account --(all universal bills paid)--> reserved
--       reserved --(paid_pct >= 30%)---------> admitted
--       admitted --(manual, notional 60%)----> active
--   `evaluate_learner_status_after_payment` carries the first two;
--   `fn_activate_learner_from_onboarding` carries the third and admits ONLY
--   `admitted`. Its own source comment reads: "only evaluate_learner_status_
--   after_payment may produce 'admitted'; only this function may then produce
--   'active'."
--
--   This trigger is the third producer of `active`, and because the Director's
--   rule names `reserved` as eligible, a learner who has paid NOTHING beyond
--   the universal bills becomes `active` by being marked present once. That is
--   what "a learner becomes active by attending" means, stated in money terms
--   so it can be confirmed rather than discovered.
--
-- ── DESIGN: DATABASE TRIGGER, NOT A SERVICE-LAYER CALL ───────────────────────
--
--   `student_attendance` is written from at least nine call sites across five
--   service files (attendance-core-service ×4, attendance-faculty-sync,
--   attendance-service, daily-session-attendance-service, leave-onduty-service
--   ×2), plus MCP tools, plus API routes, plus SQL functions
--   (`leave_onduty_attendance_updates`, the CDC training sync), plus direct
--   Management-API writes. A hook in the marking service would have to be added
--   to every one of them and would still miss the SQL and admin paths. A
--   trigger on the table cannot be bypassed by any writer. That is the whole
--   reason it is a trigger.
--
-- ── SHAPE OF `attendance_data` (measured, not assumed — production 2026-08-11)
--
--   Always a JSONB object; all 33,585 period entries are objects:
--     { "<period-key>": { "students": [ { "status": "Present",
--                                         "student_id": "<uuid>", ... } ] } }
--   Status tokens ever written: 'Present' 923,762 · 'Absent' 279,938 ·
--   'absent' 1. Because a lowercase token already exists in real data, the
--   match below is case-insensitive; an exact 'Present' compare would silently
--   miss a future lowercase writer.
--
--   🔑 `students[].student_id` IS `learners_profiles.id`, NOT `profiles.id`.
--   Measured over all 4,986 distinct ids ever written: 4,270 resolve in
--   `learners_profiles`, ZERO resolve in `profiles`. Joining the wrong identity
--   space here returns a confident, silent zero — nothing would ever activate
--   and no error would say so.
--
-- ── AUDIT ───────────────────────────────────────────────────────────────────
--
--   Every activation writes `learners_profile_status_history` — the table the
--   two existing activation paths already write — with a new reason_code
--   `first_present_attendance` and metadata naming the exact attendance row
--   that caused it. No learner record is mutated without a trace.
--
-- ── NOT COVERED HERE, ON PURPOSE ────────────────────────────────────────────
--
--   A learner with no `section_id` can never appear on a section-keyed roster,
--   so can never be marked, so can never activate. That is a data-readiness
--   backlog (PR #2936 measures 465), NOT something to work around in this file.
--
-- Idempotent and safe to re-apply. Deliberately carries NO `BEGIN;`/`COMMIT;`
-- so a reviewer's `BEGIN … ROLLBACK` rehearsal against production actually
-- rolls back.
--
-- MIGRATION IS FILE ONLY — NOT APPLIED. Director-gated.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Master switch — THE MECHANISM SHIPS OFF.
--
--    Config row + `fn_get_policy_bool`, the repo's standing config-table
--    pattern, so enabling it after #2936 is live is one super-admin toggle and
--    not a second migration. It defaults FALSE and `ON CONFLICT DO NOTHING`
--    means re-applying this file can never switch OFF a switch someone
--    deliberately turned ON.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_category)
VALUES
('learners.activate_on_first_present.enabled', 'global', NULL,
  'false'::jsonb,
  'MASTER SWITCH. While false NOTHING happens: attendance never changes a '
  'learner''s lifecycle status. While true, a learner sitting at `reserved` or '
  '`admitted` is moved to `active` the first time they are marked PRESENT. '
  'DO NOT ENABLE until PR #2936 (provisional freshers on the marking roster) '
  'is merged and proven live — before that, those learners cannot be marked at '
  'all, so this rule can only freeze them where they are. Enabling also means '
  'a `reserved` learner reaches `active` WITHOUT clearing the 30%% / 60%% fee '
  'thresholds in admission_statuses.',
  'boolean', true, true, 'major', 'published',
  'Learners — Lifecycle')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;


-- ----------------------------------------------------------------------------
-- 2. The trigger function.
--
--    SECURITY DEFINER because the person marking attendance is a faculty
--    member or Senior Learner who has no UPDATE right on `learners_profiles`
--    and no INSERT right on the status-history table. Activation must not
--    require handing every marker learner-edit permission.
--
--    Owner is `postgres`, which owns both target tables, and neither has
--    FORCE ROW LEVEL SECURITY — so the writes below bypass RLS exactly the way
--    `fn_activate_learner_from_onboarding` already does. Verified in the live
--    catalog 2026-08-11.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activate_learner_on_first_present()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_present_ids uuid[];
BEGIN
  -- (a) Master switch. Ships OFF; read before any parsing so the disabled cost
  --     is one policy lookup per attendance write and nothing else.
  IF NOT COALESCE(
       public.fn_get_policy_bool('learners.activate_on_first_present.enabled', false, NULL),
       false) THEN
    RETURN NULL;
  END IF;

  -- (b) Re-saving an unchanged payload must not thrash any learner row.
  IF TG_OP = 'UPDATE'
     AND OLD.attendance_data IS NOT DISTINCT FROM NEW.attendance_data THEN
    RETURN NULL;
  END IF;

  -- (c) Everyone marked PRESENT anywhere in this row, across every period.
  --     `jsonb_typeof(...) = 'array'` guards the period entries that carry no
  --     `students` key at all rather than letting the expansion raise.
  SELECT array_agg(DISTINCT (s.rec ->> 'student_id')::uuid)
    INTO v_present_ids
  FROM jsonb_each(NEW.attendance_data) AS per(period_key, period_val),
       jsonb_array_elements(
         CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
              THEN per.period_val -> 'students'
              ELSE '[]'::jsonb END) AS s(rec)
  WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
    AND COALESCE(s.rec ->> 'student_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF v_present_ids IS NULL OR cardinality(v_present_ids) = 0 THEN
    RETURN NULL;
  END IF;

  -- (d) Promote, and audit exactly what was promoted.
  --
  --     ELIGIBILITY IS AN ALLOWLIST OF TWO. `rejected`, `waitlisted`,
  --     `enquiry`, `enquiry_submitted` and `account` are never auto-activated,
  --     and neither is anything else — a blocklist would fail open the day a
  --     sixteenth enum label is added.
  --
  --     IDEMPOTENT BY CONSTRUCTION: a learner already `active` fails the status
  --     predicate, so the UPDATE matches no row, so RETURNING yields nothing,
  --     so no audit row is written. Marking the same learner present every day
  --     for a year produces exactly one activation and exactly one history row.
  --
  --     The status predicate is repeated inside the UPDATE, not only in the
  --     CTE: under READ COMMITTED the UPDATE re-evaluates its own WHERE after
  --     taking the row lock, so a concurrent activation from another session
  --     loses the race cleanly instead of producing a second history row.
  WITH eligible AS (
    SELECT lp.id, lp.lifecycle_status AS from_status
    FROM public.learners_profiles lp
    WHERE lp.id = ANY(v_present_ids)
      AND lp.lifecycle_status::text IN ('reserved', 'admitted')
  ),
  promoted AS (
    UPDATE public.learners_profiles lp
       SET lifecycle_status = 'active'::lifecycle_status,
           updated_at       = now()
      FROM eligible e
     WHERE lp.id = e.id
       AND lp.lifecycle_status::text IN ('reserved', 'admitted')
    RETURNING lp.id AS learner_id, e.from_status
  )
  INSERT INTO public.learners_profile_status_history
    (learner_id, from_status, to_status, reason_code, changed_by, metadata)
  SELECT
    p.learner_id,
    p.from_status,
    'active'::lifecycle_status,
    'first_present_attendance',
    auth.uid(),
    jsonb_build_object(
      'source',                'fn_activate_learner_on_first_present',
      'trigger_op',            TG_OP,
      'from_status',           p.from_status::text,
      'student_attendance_id', NEW.id,
      'attendance_date',       NEW.attendance_date,
      'section_id',            NEW.section_id,
      'timetable_id',          NEW.timetable_id,
      'institution_id',        NEW.institution_id,
      -- Recorded so the money consequence is visible in the audit trail
      -- itself, not only in this file's header.
      'fee_thresholds_bypassed', true)
  FROM promoted p;

  RETURN NULL;
END;
$function$;

-- Trigger functions are exempt from the repo's anon-lock CI guard (PostgreSQL
-- does not check EXECUTE when a trigger fires, and a `RETURNS trigger` function
-- cannot be called over PostgREST). The revoke is asserted anyway, in the same
-- file as the definition, because "exempt from the checker" is not the same as
-- "safe to leave granted".
REVOKE EXECUTE ON FUNCTION public.fn_activate_learner_on_first_present() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_activate_learner_on_first_present() IS
  'Moves a reserved/admitted learner to active on their FIRST Present mark '
  '(Director ruling 2026-08-11). Gated OFF by platform policy '
  'learners.activate_on_first_present.enabled. Audits every activation to '
  'learners_profile_status_history with reason_code first_present_attendance. '
  'DO NOT ENABLE before PR #2936 is live — provisional learners cannot be '
  'marked until then, so this rule would freeze them permanently.';


-- ----------------------------------------------------------------------------
-- 3. The trigger.
--
--    AFTER, not BEFORE: the attendance write is the fact, and activation is a
--    consequence of it. AFTER also means a failure here cannot silently
--    swallow a teaching session's attendance.
--
--    `UPDATE OF attendance_data` narrows firing to statements that actually
--    touch the payload — the semester_id / period backfill updates elsewhere in
--    the services do not wake this function at all.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_activate_learner_on_first_present ON public.student_attendance;

CREATE TRIGGER trg_activate_learner_on_first_present
AFTER INSERT OR UPDATE OF attendance_data ON public.student_attendance
FOR EACH ROW
EXECUTE FUNCTION public.fn_activate_learner_on_first_present();


-- ----------------------------------------------------------------------------
-- 4. Apply-time assertions.
--
--    RAISE EXCEPTION, never RAISE NOTICE: a guard whose miss path is a notice
--    stamps zero rows and reads as a successful apply.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  v_enabled boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'student_attendance'
      AND t.tgname  = 'trg_activate_learner_on_first_present'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_activate_learner_on_first_present is not installed on public.student_attendance';
  END IF;

  IF has_function_privilege('anon', 'public.fn_activate_learner_on_first_present()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on fn_activate_learner_on_first_present()';
  END IF;

  -- The switch must land OFF. If a rebuilt environment replays this file after
  -- someone enabled it, DO NOTHING preserved their value — that is deliberate,
  -- so only a MISSING row is an error here.
  SELECT (value #>> '{}')::boolean INTO v_enabled
  FROM public.platform_policies
  WHERE policy_key = 'learners.activate_on_first_present.enabled'
    AND scope_type = 'global' AND scope_id IS NULL;

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'policy row learners.activate_on_first_present.enabled is missing after apply';
  END IF;

  RAISE LOG 'attendance-activates-learner installed; master switch is %', v_enabled;
END
$do$;
