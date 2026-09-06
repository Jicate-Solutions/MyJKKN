-- Tournament per-event roles could not READ the event row they were appointed to.
--
-- The per-event access model (20260801001000) gave in-charges / committee members /
-- volunteers policies on tournament_divisions, and every API route gates on
-- canViewTournament(). But the events row ITSELF is fetched by a direct client read
-- (EventBaseService.getEvent -> .from('events')), so it is governed purely by RLS —
-- and `events` only ever had:
--     events_auth_read         institution_id = caller's profiles.institution_id
--     events_auth_read_public  is_public = true AND status NOT IN (draft, cancelled)
-- Neither covers an appointed organizer from another institution. The induction
-- analogue (events_induction_speaker_read) exists; the tournament one was never written.
--
-- Symptom: the member passes RoutePermissionGuard's fallbackCheck
-- (fn_has_any_tournament_role) and sees the sidebar link, then the detail page shows
-- "Tournament not found, or you don't have access to it." PostgREST reports the RLS
-- denial as PGRST116 and getEvent maps PGRST116 -> null, so an authorization failure
-- arrives at the UI looking like a missing record.
--
-- Verified 2026-07-22 as a real student committee member (role='student', institution
-- 5736d86f, member of a committee on an event owned by b962527f): 2 of 12 tournaments
-- visible, 0 drafts, 0 rows for the event they were actually assigned to. The single
-- tournament that did work only did so incidentally — it was is_public + status='live'.
--
-- Scoped to sports_tournament: marathon keeps its own committee-access model
-- (events.marathon.ops.committee_access), so widening this to every event type would
-- change read access for tables outside this module's blast radius.
--
-- No recursion risk: all three fn_* are SECURITY DEFINER (so their internal reads of
-- events / event_committees bypass RLS rather than re-entering this policy) and each
-- hard-codes auth.uid() internally, so they only ever reveal the CALLER's own role.
-- Read-only: writes stay on events_incharge_update + trg_events_guard_privileged_fields.

DROP POLICY IF EXISTS events_tournament_role_read ON public.events;

CREATE POLICY events_tournament_role_read ON public.events
  FOR SELECT
  TO authenticated
  USING (
    event_type = 'sports_tournament'
    AND (
      fn_is_event_incharge(id)
      OR fn_is_event_committee_member(id)
      OR fn_is_event_volunteer(id)
    )
  );

COMMENT ON POLICY events_tournament_role_read ON public.events IS
  'Per-event tournament organizers (in-charge / committee member / checked-in volunteer) may read the event row they are appointed to, regardless of institution or publish state. Without this the detail page 404s for exactly the users the in-charge feature exists for.';
