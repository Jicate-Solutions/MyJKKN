-- ============================================================================
-- An administrator of one college can read — and delete — another college's
-- event feedback. This scopes the gate that allows it.
--
-- ⚠️ UNAPPLIED PROPOSAL. The PR that introduces this file does NOT execute it.
-- Apply with Supabase `apply_migration` (never `execute_sql`, which runs the SQL
-- but writes no supabase_migrations.schema_migrations row).
--
-- ---------------------------------------------------------------------------
-- THIS ONE IS LIVE, NOT LATENT
-- ---------------------------------------------------------------------------
-- Every number below was read from the PRODUCTION catalogue on 2026-09-13, not
-- from supabase/setup/03_policies.sql, which is a known-stale partial.
--
--   * public.fn_can_manage_event_feedback(uuid) EXISTS in production.
--   * EIGHT live RLS policies resolve through it, across four tables:
--       event_feedback_forms      — _select (SELECT) and _manage (ALL)
--       event_feedback_sections   — _select (SELECT) and _manage (ALL)
--       event_feedback_questions  — _select (SELECT) and _manage (ALL)
--       event_feedback_responses  — _select (SELECT) and _delete (DELETE)
--     So this is not a read-only exposure: the same gate permits MANAGE on the
--     forms and DELETE on the answers.
--   * The data is real: 4 forms, 5 sections, 27 questions and 38 RESPONSES
--     across 3 events, every one of them at institution
--     b0b8a724-7c65-4f07-8047-2a38e8100ad5. event_feedback_responses carries
--     `profile_id` and `registration_id`, so a response is attributable to a
--     named person.
--
-- The sibling gate public.fn_can_manage_event_messages(uuid) has the identical
-- flaw but is NOT applied — the function does not exist in production, no policy
-- references it, and its table public.event_registrant_messages is absent. It is
-- therefore LATENT, and it is fixed AT SOURCE in its own (also unapplied)
-- migration 20261205083000 rather than here. That matters: a later
-- CREATE OR REPLACE in this file would be silently undone the moment the
-- operator applied 20261205083000 and re-created the unscoped version over it.
--
-- ---------------------------------------------------------------------------
-- WHAT IS WRONG
-- ---------------------------------------------------------------------------
-- The gate's second branch is a bare `public.is_admin()`. That function is
-- role-key based and cluster-wide:
--
--   SELECT EXISTS (SELECT 1 FROM profiles
--                   WHERE id = user_id
--                     AND (is_super_admin = true
--                          OR role IN ('admin','super_admin','administrator')));
--
-- Nothing in it mentions an institution, and `events` spans NINE institutions
-- (55 events, none with a NULL institution_id). So an administrator of one
-- college passes the gate for every other college's events.
--
-- ---------------------------------------------------------------------------
-- WHO LOSES ACCESS — counted, not estimated
-- ---------------------------------------------------------------------------
-- is_admin() admits 19 people today. After this change:
--
--   16 KEEP IT — they carry profiles.is_super_admin = true, so they pass on the
--                first branch, which is untouched. A super admin is genuinely
--                platform-wide and should be.
--    2 KEEP IT — vg@jkkn.ac.in and deepanj@jkkn.ac.in, both role
--                'administrator'. custom_roles.administrator has
--                institution_scope = 'all', and role_has_institution_access()
--                honours that through its user_roles branch (vg) and its legacy
--                profiles.role branch (deepanj). Neither is affected.
--    1 LOSES IT — test.admin2@jkkn.local, role 'admin', institution
--                5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334. There is no 'admin' row
--                in custom_roles at all, it holds no user_roles with scope
--                'all', and it holds zero user_institution_access grants. Its
--                institution is not the one the three feedback events belong to,
--                so it loses access to all of them.
--
-- THAT ACCOUNT IS A SEEDED TEST LOGIN (`.local`, from
-- scripts/create-test-accounts.ts), not a person who runs an event. No real
-- user loses anything. This is stated up front rather than discovered on an
-- event morning: the same shape as the marathon crew who lost access to the
-- registration fix earlier today.
--
-- The residual risk this closes is therefore mostly FORWARD-looking: the next
-- person given role 'admin' at one college would today be able to read and
-- delete every other college's feedback, silently.
--
-- ---------------------------------------------------------------------------
-- WHAT IS CHANGED, AND WHAT DELIBERATELY IS NOT
-- ---------------------------------------------------------------------------
-- ONLY the is_admin() branch is scoped. is_super_admin(), fn_is_event_incharge()
-- and the event's own creator are untouched — an in-charge is appointed per
-- event and a creator made the event, so both are already event-scoped by
-- construction.
--
-- role_has_institution_access() is the canonical mechanism (see CLAUDE.md and
-- memory reference_permission_scope_is_global_not_per_module): a role scoped
-- 'all' still passes everywhere, a role scoped 'own' is held to its own
-- institution plus its user_institution_access grants plus its CAS sibling.
-- The `institution_id IS NULL` escape keeps a system-wide event readable rather
-- than locking administrators out of it; no production event is in that state
-- today, and the clause is there so that a future one does not become
-- unmanageable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_can_manage_event_feedback(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Genuinely platform-wide, and the only branch that is.
    public.is_super_admin()
    -- An administrator is held to the institutions they may see.
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id = p_event_id
          AND (e.institution_id IS NULL OR public.role_has_institution_access(e.institution_id))
      )
    )
    -- Appointed on this event, so already event-scoped.
    OR public.fn_is_event_incharge(p_event_id)
    -- Made this event, so likewise.
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND e.created_by = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.fn_can_manage_event_feedback(uuid) IS
  'Authority over an event''s feedback forms, sections, questions and responses. Super admin; an admin WITH institution access to the event (role_has_institution_access — eight live RLS policies resolve through this function, including MANAGE on the forms and DELETE on the answers, so an unscoped admin branch let one college manage and delete another college''s feedback); the event in-charge (events.config->incharges); or the event''s creator. Deliberately rejects events.view.';

-- Grants restated rather than assumed. CREATE OR REPLACE preserves the existing
-- ACL, and the ACL read from production on 2026-09-13 was already exactly this
-- (anon=false, authenticated=true, service_role=true, PUBLIC=false) — so these
-- two lines change nothing today and keep the file true on a rebuild from
-- scratch, where Supabase's ALTER DEFAULT PRIVILEGES would otherwise hand anon
-- its own grant.
REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Assert the end state rather than trusting the statements above
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc
   WHERE proname = 'fn_can_manage_event_feedback'
     AND pronamespace = 'public'::regnamespace
   LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'fn_can_manage_event_feedback is missing after this migration';
  END IF;

  -- The whole point of the file. If this string is absent the admin branch is
  -- unscoped again and one college can read another's feedback.
  IF v_src NOT LIKE '%role_has_institution_access%' THEN
    RAISE EXCEPTION
      'fn_can_manage_event_feedback does not scope its admin branch by institution — the cross-tenant read this migration exists to close is still open';
  END IF;

  IF has_function_privilege('anon', 'public.fn_can_manage_event_feedback(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_manage_event_feedback is callable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_can_manage_event_feedback(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_manage_event_feedback is not callable by authenticated — every feedback screen would go blank';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_can_manage_event_feedback(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_manage_event_feedback is not callable by service_role';
  END IF;
END
$assert$;

-- ============================================================================
-- ROLLBACK (for reference)
-- ============================================================================
-- Restores the UNSCOPED gate exactly as production held it on 2026-09-13.
-- Running this re-opens the cross-institution read and delete.
--
-- CREATE OR REPLACE FUNCTION public.fn_can_manage_event_feedback(p_event_id uuid)
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
--   SELECT
--     public.is_super_admin()
--     OR public.is_admin()
--     OR public.fn_is_event_incharge(p_event_id)
--     OR EXISTS (SELECT 1 FROM public.events e
--                 WHERE e.id = p_event_id AND e.created_by = auth.uid());
-- $$;
