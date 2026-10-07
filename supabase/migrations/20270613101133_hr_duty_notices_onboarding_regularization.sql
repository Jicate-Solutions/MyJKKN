-- ============================================================================
-- 20270613101133_hr_duty_notices_onboarding_regularization.sql
-- ----------------------------------------------------------------------------
-- HR STAFF HARNESS, lane C — duties R9 (onboarding checklist) and A3
-- (attendance regularisation requests). Design:
-- artifacts/hr-staff-harness-design-2026-10-01.html, build step 0 "send the
-- missing notifications".
--
-- WHAT WAS WRONG
--   R9  Only onboarding START sent anything, and it went to the joiner, not to
--       whoever owned step 1. Completing a step told nobody that the next step
--       was now theirs, and nothing ever chased a step that sat still.
--   A3  hr_attendance_regularizations sent no notice at all — not to the
--       approvers on submit, not to the requester on a decision.
--
-- WHAT THIS MIGRATION ADDS (the app code in the same PR does the sending)
--   1. hr_duty_notices — the ledger. One row per (duty, subject, key, kind),
--      ever, enforced by a UNIQUE constraint. The sender CLAIMS the row first
--      (INSERT ... ON CONFLICT DO NOTHING) and only then dispatches, so the
--      daily run, a manual re-run and the event hooks can never send the same
--      notice twice, and every notice sent is recorded with its recipients.
--   2. fn_hr_role_holder_ids(role_keys, institution) — profile ids holding a
--      role, optionally inside one institution. Used for onboarding steps that
--      are assigned to a role, and for "the HR head".
--   3. fn_hr_permission_holder_ids(keys) — profile ids whose roles grant any
--      of the keys. Used for regularisation approvers: the approvals screen is
--      gated on these keys and its RLS (hr_attendance_regs_select) is NOT
--      institution-scoped, so every holder sees every request — the notice
--      goes to exactly that set.
--   4. Four config rows (config-table pattern) for the reminder windows.
--   5. The go-live cutoff (Director, 7 Oct 2026: reminders stay ON, but only
--      about items that arrive from go-live onward). A fifth config row,
--      'hr.duty_notices.go_live_at', holds the moment this migration applied.
--      The daily run never chases an onboarding or a regularisation request
--      whose wait started before it, so the first run does not flood people
--      with old items. Seeded only when absent (a re-run keeps the original
--      moment). If the row is missing or unreadable, the run uses its own
--      time instead — nothing old is ever chased.
--
-- BOTH FUNCTIONS ARE SERVICE-ROLE ONLY. They enumerate people by role; nothing
-- in the browser needs that. EXECUTE revoked from anon, PUBLIC AND
-- authenticated; granted to service_role.
--
-- NOT APPLIED by merging — prod apply is a separate step. No BEGIN/COMMIT.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_notices (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Duty code from the harness design page: 'R9' onboarding, 'A3' regularisation.
  duty_code          text        NOT NULL CHECK (char_length(duty_code) BETWEEN 1 AND 16),
  -- Which table subject_id points into, for a human reading the ledger.
  subject_table      text        NOT NULL,
  subject_id         uuid        NOT NULL,
  -- Narrows the subject: the onboarding step position, '' when not needed.
  subject_key        text        NOT NULL DEFAULT '',
  -- step_turn | step_reminder | joining_passed | submitted | reminder | hr_head | decided
  reminder_kind      text        NOT NULL,
  recipient_user_ids uuid[]      NOT NULL DEFAULT ARRAY[]::uuid[],
  notified_count     integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_duty_notices_once UNIQUE (duty_code, subject_id, subject_key, reminder_kind)
);

COMMENT ON TABLE public.hr_duty_notices IS
  'HR staff harness notice ledger (2026-10-01). One row per notice ever sent for a duty subject; the UNIQUE key is what makes every reminder fire at most once. Written by the service role only.';

CREATE INDEX IF NOT EXISTS hr_duty_notices_subject_idx
  ON public.hr_duty_notices (duty_code, subject_id);

ALTER TABLE public.hr_duty_notices ENABLE ROW LEVEL SECURITY;

-- The anon key ships in every page; Supabase's default privileges grant it ALL on
-- new tables. RLS already denies it, but the grant itself is removed so the table
-- is closed at both layers. Signed-in users keep SELECT only (the policy below
-- narrows it to their own rows); writes are the service role's alone.
REVOKE ALL ON public.hr_duty_notices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hr_duty_notices FROM authenticated;

-- Read-only for people: admins see the whole ledger, anyone sees the rows that
-- were addressed to them. No INSERT/UPDATE/DELETE policy — the service role
-- (which bypasses RLS) is the only writer.
DROP POLICY IF EXISTS hr_duty_notices_select ON public.hr_duty_notices;
CREATE POLICY hr_duty_notices_select ON public.hr_duty_notices
  FOR SELECT TO authenticated USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT auth.uid()) = ANY (recipient_user_ids)
  );

-- ---------------------------------------------------------------------------
-- 2) Role holders, optionally inside one institution
-- ---------------------------------------------------------------------------
-- Mirrors how the onboarding complete-step route authorises a role-assigned
-- step (user_roles -> custom_roles.role_key, plus the legacy profiles.role),
-- so the person told "this step is yours" is someone who can tick it.
-- With p_institution_id: people whose profile or staff row sits in that
-- institution, holders of an institution_scope='all' role, and explicit
-- user_institution_access grantees. NULL = every holder.
-- Deactivated or login-disabled profiles are never returned.
CREATE OR REPLACE FUNCTION public.fn_hr_role_holder_ids(
  p_role_keys      text[],
  p_institution_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH holders AS (
    SELECT ur.user_id AS uid, cr.institution_scope
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.is_active
      AND cr.role_key = ANY (p_role_keys)
    UNION ALL
    SELECT p.id, cr.institution_scope
    FROM public.profiles p
    LEFT JOIN public.custom_roles cr ON cr.role_key = p.role
    WHERE p.role = ANY (p_role_keys)
  )
  SELECT COALESCE(array_agg(DISTINCT h.uid), ARRAY[]::uuid[])
  FROM holders h
  JOIN public.profiles p ON p.id = h.uid
  WHERE COALESCE(p.is_active, true)
    AND NOT COALESCE(p.is_login_disabled, false)
    AND (
      p_institution_id IS NULL
      OR h.institution_scope = 'all'
      OR p.institution_id = p_institution_id
      OR EXISTS (SELECT 1 FROM public.staff s
                  WHERE s.profile_id = p.id
                    AND s.institution_id = p_institution_id
                    AND COALESCE(s.is_active, true))
      OR EXISTS (SELECT 1 FROM public.user_institution_access uia
                  WHERE uia.user_id = p.id
                    AND uia.institution_id = p_institution_id
                    AND uia.is_active)
    );
$function$;

COMMENT ON FUNCTION public.fn_hr_role_holder_ids(text[], uuid) IS
  'HR staff harness (2026-10-01). Active profile ids holding any of the role keys (user_roles or legacy profiles.role), optionally scoped to one institution. Service role only.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_role_holder_ids(text[], uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_role_holder_ids(text[], uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Permission holders
-- ---------------------------------------------------------------------------
-- The same two arms user_has_permission() walks for a signed-in user (every
-- user_roles role, then the legacy profiles.role), turned around to list the
-- people. The super-admin bypass is deliberately NOT an arm: a super admin can
-- open every screen, and paging all of them about every request is noise. A
-- super admin whose role explicitly grants the key is still included.
CREATE OR REPLACE FUNCTION public.fn_hr_permission_holder_ids(p_keys text[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH granting_roles AS (
    SELECT cr.id, cr.role_key
    FROM public.custom_roles cr
    WHERE EXISTS (
      SELECT 1 FROM unnest(p_keys) k
       WHERE cr.permissions ->> k = 'true'
    )
  ),
  holders AS (
    SELECT ur.user_id AS uid
    FROM public.user_roles ur
    JOIN granting_roles g ON g.id = ur.role_id
    UNION
    SELECT p.id
    FROM public.profiles p
    JOIN granting_roles g ON g.role_key = p.role
  )
  SELECT COALESCE(array_agg(DISTINCT h.uid), ARRAY[]::uuid[])
  FROM holders h
  JOIN public.profiles p ON p.id = h.uid
  WHERE COALESCE(p.is_active, true)
    AND NOT COALESCE(p.is_login_disabled, false);
$function$;

COMMENT ON FUNCTION public.fn_hr_permission_holder_ids(text[]) IS
  'HR staff harness (2026-10-01). Active profile ids whose roles grant any of the permission keys (same arms as user_has_permission, without the super-admin bypass). Service role only.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_permission_holder_ids(text[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_permission_holder_ids(text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) The reminder windows, as config rows (editable on Platform Policies)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT v.policy_key, 'global', NULL, v.value, v.description, 'number', true, true
FROM (VALUES
  ('hr.onboarding.step_reminder_after_working_days', to_jsonb(2),
   'Onboarding checklist: remind a step''s owner once, after they have held the step for MORE than this many working days (Sunday is not counted). The daily HR duty-notices run reads it.'),
  ('hr.onboarding.joining_soon_days', to_jsonb(3),
   'Onboarding checklist: when the joiner''s expected joining date is this many days away or closer and steps are still open, each open step''s owner gets one reminder. Once the date has passed, the HR head gets one notice instead.'),
  ('hr.regularization.reminder_after_hours', to_jsonb(48),
   'Attendance regularisation: remind the approvers once when a request has waited MORE than this many hours.'),
  ('hr.regularization.hr_head_notice_after_days', to_jsonb(4),
   'Attendance regularisation: tell the HR head once when a request has waited MORE than this many days. A request left undecided when its month is closed cannot be approved until the month is reopened, and the month-close date is not stored, so this age stands in for "about to hold up the month".')
) AS v(policy_key, value, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies pp
   WHERE pp.policy_key = v.policy_key
     AND pp.scope_type = 'global' AND pp.scope_id IS NULL
);

-- The go-live cutoff (see header, item 5). A JSON timestamp string.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'hr.duty_notices.go_live_at', 'global', NULL, to_jsonb(now()),
       'HR duty notices (onboarding checklist, attendance regularisation): the moment the daily reminders went live. Nothing whose wait started before this is ever chased, so switching the reminders on does not send notices about old items. Set once by migration 20270613101133.',
       'string', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.duty_notices.go_live_at'
     AND pp.scope_type = 'global' AND pp.scope_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 5) The schedule — daily 10:07 IST, Monday to Saturday
-- ---------------------------------------------------------------------------
-- Daytime and never on Sunday: the harness guardrail is that no chase reaches
-- anyone at night or on the weekly holiday. The route also skips people on
-- approved leave today. minute_of_day 607 = 10:07 IST (off-grid).
-- ON CONFLICT DO NOTHING so a re-run never clobbers a retuned row.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('hr-duty-notices', true, true, ARRAY[1,2,3,4,5,6]::smallint[], 607, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE.
DO $$
DECLARE
  v_sched  int;
  v_policy int;
BEGIN
  SELECT count(*) INTO v_sched FROM public.ai_routine_schedules WHERE routine_id = 'hr-duty-notices';
  IF v_sched <> 1 THEN
    RAISE EXCEPTION 'hr-duty-notices schedule row missing after seed (count=%)', v_sched;
  END IF;
  SELECT count(*) INTO v_policy FROM public.platform_policies
   WHERE scope_type = 'global' AND scope_id IS NULL
     AND policy_key IN ('hr.onboarding.step_reminder_after_working_days',
                        'hr.onboarding.joining_soon_days',
                        'hr.regularization.reminder_after_hours',
                        'hr.regularization.hr_head_notice_after_days');
  IF v_policy <> 4 THEN
    RAISE EXCEPTION 'expected 4 HR duty-notice policy rows, found %', v_policy;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_policies
     WHERE policy_key = 'hr.duty_notices.go_live_at'
       AND scope_type = 'global' AND scope_id IS NULL
       AND jsonb_typeof(value) = 'string'
  ) THEN
    RAISE EXCEPTION 'platform_policies row hr.duty_notices.go_live_at is missing';
  END IF;
END $$;
