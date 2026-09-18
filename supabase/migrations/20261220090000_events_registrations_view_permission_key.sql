-- ─── Event registrations — gate reading on a permission key, not role names ──
-- 2026-09-16
--
-- SYMPTOM: a COO opening a tournament's Event Logistics → Registrations tab sees
-- "No registrations yet." on an event that has registrants. The tiles above it
-- (Divisions, Active Entries, Entries by Division, Payment Status) are correct,
-- and Review Comments opens fine. Only the people are missing.
--
-- CAUSE: every SELECT policy on events_registrations tests a property of the
-- CALLER'S ROLE NAME or their literal institution — never a permission:
--
--   events_reg_admin_read            get_current_user_role() IN ('super_admin',
--                                    'admin','administrator','event_coordinator')
--   events_reg_committee_member_read lead/member of the event's committee
--   events_reg_institution_read      registration.institution_id IN (caller's
--                                    profiles.institution_id WHERE NOT NULL)
--   events_reg_public_event_read     events.is_public AND status <> draft
--   events_reg_self_read             profile_id = auth.uid()
--
-- 'coo' is in none of the role lists. It is a tier-1 executive role carrying
-- institution_scope = 'all', so its profiles.institution_id is NULL — and
-- events_reg_institution_read drops NULLs explicitly (`AND institution_id IS NOT
-- NULL`), making the IN-list empty, which matches no row. A facilitator sees the
-- same list fine because their institution_id equals the learners' own: the
-- public registration path writes the REGISTRANT's institution
-- (lib/api/events/tournament/handlers/public-register.ts — `institution_id:
-- dto.is_external ? null : selfInstitutionId`). So visibility here ranks by
-- "same college as the registrant", which inverts for cross-institution roles:
-- the more senior the role, the less it sees.
--
-- The same class of bug was fixed for the review thread on 2026-09-11
-- (20261130090000_event_review_comments_permission_keys.sql), which is why the
-- COO CAN see Review Comments on the very same page. This applies that fix to
-- the registration list.
--
-- Two further holes this closes, both from the institution test:
--   * EXTERNAL registrants are written with institution_id = NULL, so they are
--     invisible to every institution-scoped reader — nobody outside the four
--     hardcoded role names can see an open tournament's outside entrants.
--   * The policy tests the REGISTRATION's institution. This one tests the
--     EVENT's, via role_has_institution_access(), which already understands
--     institution_scope = 'all' and user_institution_access grants.
--
-- NOT folded into events.view: students hold that to browse the public feed,
-- and this list carries every registrant's phone number and email.
--
-- This migration is ADDITIVE. All five policies above are left in place, so no
-- one who can read the list today loses it; PERMISSIVE policies OR together.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Every statement is idempotent.

-- ── 1. Seed the key ─────────────────────────────────────────────────────────
-- administrator and event_coordinator already hold this access through
-- events_reg_admin_read, so granting it to them changes nothing today and makes
-- the grant visible in Role Management instead of buried in a policy body.
-- 'coo' is the role the bug was reported against.
--
-- Every other role is now a Role Management toggle — no migration needed to add
-- or remove principal, hod, sports_coordinator or anyone else.
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.registrations.view', true),
       updated_at  = now()
 WHERE role_key IN ('administrator', 'event_coordinator', 'coo')
   AND (permissions->>'events.registrations.view')::boolean IS NOT TRUE;

-- ── 2. The policy ───────────────────────────────────────────────────────────
-- Admitted without a key (mirrors fn_can_read_event_review_comments): the
-- event's appointed in-charge and its creator. Neither is institution-tested —
-- an in-charge may be borrowed from another college, and locking a creator out
-- of their own event's entrant list would be absurd. Super admins pass
-- user_has_permission()'s own bypass.
DROP POLICY IF EXISTS "events_reg_permission_read" ON public.events_registrations;
CREATE POLICY "events_reg_permission_read" ON public.events_registrations
  FOR SELECT TO authenticated USING (
    public.fn_is_event_incharge(event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = event_id
           AND e.created_by = (SELECT auth.uid())
       )
    OR (
      (SELECT public.user_has_permission('events.registrations.view'))
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_id
          AND public.role_has_institution_access(e.institution_id)
      )
    )
  );

COMMENT ON POLICY "events_reg_permission_read" ON public.events_registrations IS
  'Read an event''s registration list: the event in-charge, the event creator, or a holder of events.registrations.view with access to the owning institution (role_has_institution_access, so institution_scope=''all'' executives such as the COO pass). Added 2026-09-16 because every pre-existing SELECT policy tested a hardcoded role name or the caller''s literal institution_id, which no cross-institution role satisfies. Deliberately does NOT admit events.view — students hold it, and these rows carry participant phone numbers and emails.';

NOTIFY pgrst, 'reload schema';
