-- Grant Sports Tournament View + Create + Edit access to the Event Coordinator role.
-- Created: 2026-07-20.
--
-- WHY
--   The `event_coordinator` role held NO sports.tournaments.* key, so the
--   Tournament module never appeared in their sidebar and its pages bounced them:
--   the nav (isPageAccessible) and the RoutePermissionGuard both gate
--   /events/tournament on `sports.tournaments.view`, and the tournament_divisions
--   RLS policies gate writes on the matching keys. Event Coordinators run
--   tournament committees, so they need to see, create and edit tournaments.
--
-- TIER GRANTED — View + Create/Edit (NOT manage/delete, NOT the student browse):
--   sports.tournaments.view    -> see the admin module + read divisions
--                                 (menu, route guard, tournament_divisions_select)
--   sports.tournaments.create  -> seed divisions when creating a tournament
--                                 (tournament_divisions_insert)
--   sports.tournaments.edit    -> update tournaments / divisions
--                                 (tournament_divisions_update)
--
-- DELIBERATELY NOT GRANTED:
--   sports.tournaments.manage  -> delete divisions, lifecycle/status changes,
--                                 appoint per-event in-charges, registration-form
--                                 builder (event_registration_forms_manage).
--   sports.tournaments.browse  -> the student-facing /events/tournaments page.
--
-- custom_roles.permissions is the single source of truth: this one grant flows to
-- the sidebar, the RoutePermissionGuard, the API gates, and RLS together.
-- Additive + idempotent (safe to re-run — jsonb || re-sets the same keys to true).

UPDATE public.custom_roles
SET permissions = permissions
      || jsonb_build_object(
           'sports.tournaments.view',   true,
           'sports.tournaments.create', true,
           'sports.tournaments.edit',   true
         ),
    updated_at = now()
WHERE role_key = 'event_coordinator';
