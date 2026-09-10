-- ============================================================================
-- Close the second half of the same hole: a creator-less event is not "owned
-- by everyone in the institution" for the purposes of its feedback form
-- ============================================================================
-- 20260909210000 removed `events.view` from fn_can_manage_event_feedback and
-- replaced it with the events_auth_update owner rule. That rule has two
-- clauses, and the second one re-opened the hole it was meant to close:
--
--     e.created_by IS NULL
--     AND e.institution_id IN (SELECT institution_id FROM profiles
--                               WHERE id = auth.uid() AND institution_id IS NOT NULL)
--
-- Measured against production on 2026-09-09: 36 of 51 events carry
-- created_by = NULL. On every one of them that clause is true for EVERY profile
-- in the institution — students included. The Director's decision was "owner
-- and in-charge only", and a row with no creator has no owner, so inheriting
-- events_auth_update's institution fallback contradicts the decision rather
-- than implementing it.
--
-- It stays correct for the events table itself: an UPDATE to a creator-less
-- event row is a different risk from rewriting a live questionnaire and reading
-- every attendee's answers. This function is not obliged to be as loose, and
-- the header of 20260909210000 is amended by this file on exactly that clause.
--
-- WHAT THIS COSTS, measured rather than assumed: of those 36 creator-less
-- events, 2 name an in-charge and 34 do not. On those 34, feedback becomes
-- manageable by super admin / admin only. None of the 34 has a feedback form
-- today (1 event in the whole database does, and it has both a creator and an
-- in-charge), so no existing questionnaire loses its editor. A coordinator who
-- needs one of the 34 must be named in that event's in-charge list — which is
-- the supported way to appoint an event coordinator, and takes effect
-- immediately because fn_is_event_incharge reads events.config->'incharges'
-- live.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_can_manage_event_feedback(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin()
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND e.created_by = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.fn_can_manage_event_feedback(uuid) IS
  'Authority to create/edit/delete an event''s feedback forms and questions, and to read its responses. Super admin, admin, the event in-charge (events.config->incharges), or the event''s creator — nothing else. Deliberately rejects events.view (a read key held by students and faculty) and the events_auth_update creator-less-institution fallback (true for every profile in the institution on the 36 of 51 events that carry no created_by). See 20260909210000 and 20260909220000.';

-- Lock the function from anon. Postgres grants EXECUTE to PUBLIC by default and
-- Supabase grants anon on top, so a new SECURITY DEFINER function is callable by
-- an unauthenticated client unless this is stated. Every branch of the gate above
-- resolves through auth.uid(), which is NULL for anon, so the function already
-- fails closed in-body — but an unauthenticated caller should not reach the body.
-- service_role is granted explicitly so the REVOKE below cannot strip it.
REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) TO authenticated, service_role;
