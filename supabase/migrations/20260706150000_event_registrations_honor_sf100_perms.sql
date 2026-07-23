-- ============================================================================
-- FIX: event_registrations_select — honor the SF100 admin PERMISSION, not just
--      the hardcoded legacy profiles.role list.
-- Created: 2026-07-06  (APPLIED to prod directly on 2026-07-06 via Management API;
--          this migration records the applied change for repo/prod parity.)
-- ============================================================================
-- SYMPTOM: The Solve-for-100 → Admin → Enrollments table showed every Team Name,
--   College and Mentor as "—" for SF100 coordinators, even though the 18
--   registrations, team names and cohort mirror were all intact. Columns sourced
--   from sf100_enrollments (phase/status/paid users) rendered fine; only the
--   fields embedded from event_registrations were blank.
--
-- ROOT CAUSE: event_registrations_select authorized reads by the LEGACY
--   profiles.role string (admin/administrator/staff/faculty/hod/principal) or
--   ownership — NOT by the dynamic permission system. SF100 coordinators have
--   profiles.role = 'student' with their admin rights coming from a CUSTOM role,
--   so the policy rejected them and the browser-client embed
--   `registration:event_registrations(team_name, institution, owner)` returned
--   NULL for every row.
--
-- WHY NOT gate on startup_studio.registrations.view: the 'student' custom role
--   itself carries registrations.view = true, and user_has_permission() has a
--   legacy-role fallback, so EVERY student passes that check — gating on .view
--   would let any student read all event registrations. The discriminating
--   permissions (present in SF100 admin roles, ABSENT from 'student') are
--   startup_studio.sf100.team.view and startup_studio.registrations.manage.
--
-- WHY THE CASE (not (select user_has_permission(...))): a `(select fn())` in an
--   RLS USING clause is planned as an InitPlan evaluated UNCONDITIONALLY, which
--   throws "permission denied for function user_has_permission" for the anon role
--   (anon lacks EXECUTE) and would break public/anon reads. A bare
--   `CASE WHEN auth.uid() IS NULL THEN false ELSE user_has_permission(...) END`
--   guarantees the function is never reached for anon.
--
-- VERIFIED (impersonation, live): SF100 admin (has sf100.team.view) → sees all 18;
--   plain student (only legacy registrations.view) → 0; anon → 0, no error.
--
-- ADDITIVE: this only GRANTS read to SF100-admin permission holders; it removes
--   access from no one (the owner + legacy-role clauses are preserved verbatim).
-- ============================================================================

DROP POLICY IF EXISTS event_registrations_select ON public.event_registrations;
CREATE POLICY event_registrations_select ON public.event_registrations
FOR SELECT USING (
  (owner_id = (select auth.uid()))
  OR (EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = (select auth.uid())
                AND (p.is_super_admin = true
                     OR p.role = ANY (ARRAY['admin','administrator','staff','faculty','hod','principal']))))
  -- SF100/event admins via the dynamic permission system. CASE (not a scalar
  -- sub-select) so user_has_permission is NEVER evaluated for the anon role.
  OR (CASE WHEN (select auth.uid()) IS NULL THEN false
           ELSE (public.user_has_permission('startup_studio.sf100.team.view')
                 OR public.user_has_permission('startup_studio.registrations.manage'))
      END)
);

NOTIFY pgrst, 'reload schema';
