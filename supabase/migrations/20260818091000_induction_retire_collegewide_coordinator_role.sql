-- Induction — retire the college-wide coordinator grant; per-induction only.
--
-- THE TWO SYSTEMS. The module shipped with two independent ways to appoint a
-- coordinator, and nothing synced them:
--
--   1. /events/induction (the list page's "Induction Coordinators" panel)
--      → fn_induction_assign_coordinator wrote a row into user_roles for
--        custom_roles.role_key = 'induction_coordinator'. That role carries
--        induction.manage with institution_scope='own', so the appointee could
--        manage EVERY induction their college runs, now and in future. The
--        panel grouped people by profiles.institution_id, which made it LOOK
--        like a per-college appointment; the grant itself has no institution
--        column at all.
--
--   2. /events/induction/[id] (the detail console's "Coordinators" section)
--      → fn_induction_assign_event_coordinator writes
--        induction_event_coordinators (event_id, user_id) — one induction,
--        nothing global.
--
-- The shared components/shared/programme-coordinators panel written later for
-- School of Influence names this in its own header: "Induction's appoint writes
-- a row into user_roles, which hands out a global role."
--
-- Live state 2026-08-18: 9 people held the college-wide role, 11
-- induction_event_coordinators rows existed across 5 inductions, and the two
-- sets only partly overlapped — 5 per-event coordinators held no global role,
-- and 3 global holders coordinated no induction at all yet had
-- induction.manage over their whole college.
--
-- Per-event is the model that survives (product decision 2026-08-18).

-- ── 1. Migrate before revoking ──────────────────────────────────────────────
-- Anyone holding the college-wide role but no per-event row anywhere gets an
-- explicit row for each non-blueprint induction their college runs — so nobody
-- loses access to an induction they are actually working on. Holders who
-- ALREADY have a per-event row are skipped: someone deliberately chose which
-- induction they run, and widening that back out would undo the decision.
INSERT INTO public.induction_event_coordinators (event_id, user_id, assigned_by)
SELECT ip.event_id, p.id, NULL
FROM public.user_roles ur
JOIN public.custom_roles cr ON cr.id = ur.role_id AND cr.role_key = 'induction_coordinator'
JOIN public.profiles p ON p.id = ur.user_id
JOIN public.induction_programs ip
  ON ip.institution_id = p.institution_id
 AND ip.is_blueprint = false
WHERE p.institution_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.induction_event_coordinators iec WHERE iec.user_id = p.id
  )
ON CONFLICT (event_id, user_id) DO NOTHING;

-- ── 2. Revoke the college-wide grant ────────────────────────────────────────
-- Safe as a plain DELETE: none of the 9 held it as is_primary and none carry
-- profiles.role = 'induction_coordinator', so neither sync_primary_role_trigger
-- nor the legacy profiles.role arm of role_has_institution_access has anything
-- to go stale. trg_log_user_role_change records each revocation.
DELETE FROM public.user_roles ur
USING public.custom_roles cr
WHERE cr.id = ur.role_id
  AND cr.role_key = 'induction_coordinator';

-- ── 3. Close the door, not just the window ──────────────────────────────────
-- The UI panel is gone, but /rest/v1/rpc/fn_induction_assign_coordinator stays
-- callable by any Induction Lead with a JWT and would silently re-create the
-- grant we just revoked. Drop the retired model's four RPCs.
--
-- fn_induction_can_manage_coordinators() SURVIVES on purpose:
-- fn_induction_can_manage_event_coordinators() delegates to it, so it is still
-- the gate on the per-event section.
DROP FUNCTION IF EXISTS public.fn_induction_assign_coordinator(uuid);
DROP FUNCTION IF EXISTS public.fn_induction_remove_coordinator(uuid);
DROP FUNCTION IF EXISTS public.fn_induction_list_coordinators();
DROP FUNCTION IF EXISTS public.fn_induction_running_colleges();

-- The custom_roles row itself is deliberately left in place and active. Role
-- Management is the single source of truth for who holds what; an admin who
-- decides to grant college-wide induction access from there is making a
-- decision, not tripping over a module back door.
