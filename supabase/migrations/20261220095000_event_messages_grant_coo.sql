-- ─── events.messages.send — grant to the COO ────────────────────────────────
-- 2026-09-16
--
-- Follow-up to 20261220094000, which introduced events.messages.send and gave
-- it to event_coordinator and administrator. The COO was deliberately left out
-- at the time (Messages treated as an operations tool for whoever runs the
-- event, with executives directing the organiser through Review Comments).
-- Reversed on the Director's instruction, 2026-09-16: the COO gets it.
--
-- No function change is needed — 20261220094000 already added the key arm to
-- fn_can_manage_event_messages. This is a grant.
--
-- ── Scope, stated plainly ───────────────────────────────────────────────────
-- custom_roles.role_key = 'coo' carries institution_scope = 'all', so
-- role_has_institution_access() short-circuits TRUE for every event. Unlike
-- event_coordinator — whose 'own' scope confines them to their own college's
-- events — this grant lets the COO message the registrants of ANY event in the
-- system, at any institution.
--
-- What that reaches, measured on "School Zonal 2026" (2026-09-16): 668 active
-- registrations, 476 with a MyJKKN account who receive an in-app notification,
-- 192 with no account who hear nothing. Every send is recorded in
-- event_registrant_messages with the sender and the resolved audience, and the
-- compose surface requires a second confirmation that repeats the recipient
-- count before anything goes out.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.messages.send', true),
       updated_at  = now()
 WHERE role_key = 'coo'
   AND (permissions->>'events.messages.send')::boolean IS NOT TRUE;

NOTIFY pgrst, 'reload schema';
