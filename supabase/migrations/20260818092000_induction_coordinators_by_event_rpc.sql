-- Induction list — read every visible induction's coordinators in one call.
--
-- WHY AN RPC AND NOT A SELECT. induction_event_coordinators carries exactly one
-- policy, induction_event_coordinators_admin (is_super_admin() OR is_admin()),
-- so a browser-side .from('induction_event_coordinators') returns zero rows for
-- an Induction Lead or a coordinator — the silent-empty-state failure mode, not
-- an error. It also holds TWO FKs to profiles (user_id and assigned_by), which
-- makes a PostgREST embed of profiles ambiguous and breaks the whole select.
--
-- WHY NOT fn_induction_list_event_coordinators. That one is per-event AND gated
-- on fn_induction_can_manage_event_coordinators (Induction Lead / super-admin
-- only). The list page needs a Coordinators column for N inductions readable by
-- anyone who can see the induction — including the coordinators themselves, who
-- are exactly the people the existing gate excludes. One call, not N.
--
-- SELF-AUTHORIZING, per row. SECURITY DEFINER bypasses RLS, so the predicate is
-- carried here rather than inherited. It mirrors how the rest of the module
-- gates itself and is strictly narrower than events_auth_read:
--   • super-admin sees everything
--   • a coordinator sees the inductions they coordinate (they may hold no
--     induction.view at all — that is the carve-out the module layout relies on)
--   • induction.view + access to that induction's college sees that college's
-- Anyone else gets no rows, which is the same answer the list itself gives them.
CREATE OR REPLACE FUNCTION public.fn_induction_coordinators_by_event()
 RETURNS TABLE(event_id uuid, user_id uuid, full_name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ::text casts: profiles.full_name/email are varchar and RETURNS TABLE
  -- declares text; SECURITY DEFINER is strict about the mismatch (42804).
  SELECT iec.event_id, iec.user_id, p.full_name::text, p.email::text
  FROM public.induction_event_coordinators iec
  JOIN public.profiles p ON p.id = iec.user_id
  JOIN public.induction_programs ip ON ip.event_id = iec.event_id
  WHERE ip.institution_id IS NOT NULL
    AND (
      is_super_admin()
      OR public.fn_induction_is_event_coordinator(iec.event_id)
      OR (
        public.user_has_permission('induction.view')
        AND public.role_has_institution_access(ip.institution_id)
      )
    )
  ORDER BY p.full_name;
$function$;

-- REVOKE from anon specifically, not just PUBLIC: Supabase grants the anon role
-- directly, so revoking PUBLIC alone leaves it reachable without a session.
REVOKE ALL ON FUNCTION public.fn_induction_coordinators_by_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_coordinators_by_event() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_coordinators_by_event() TO authenticated;
