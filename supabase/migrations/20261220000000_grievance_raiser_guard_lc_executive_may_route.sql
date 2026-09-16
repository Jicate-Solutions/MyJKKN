-- BUG-006107 — the council President cannot assign an issue he raised himself.
--
-- WHY
-- /learners-council/issues writes to grievance_tickets. The PATCH route tries the
-- update on the caller's own session first and only takes its executive path
-- (fn_is_lc_executive) when RLS returns 0 rows. A President who RAISED the ticket
-- is admitted by RLS as the raiser — and then fn_grievance_raiser_update_guard
-- fires and refuses assigned_to, because its privileged set is only
-- super_admin / admin / icc_member. The executive path is never reached.
-- Reported 2026-09-15 by ABISHEK FLEMING A on ticket 87935200… ("No sufficient
-- restroom in pharmacy college").
--
-- FIX
-- Teach the trigger the authority the route already has: an active council
-- executive may change assigned_to on a ticket they raised. Nothing else is
-- widened — status, is_icc_only, category_id, filed_by, institution_id and
-- raised_by_id stay guarded for the raiser, executive or not.
--
-- SCOPE: CREATE OR REPLACE of one trigger function. No table change, no policy
-- change, no new function, no grants (trigger fns are not directly callable).
-- fn_grievance_raiser_change_allowed (the pure, IMMUTABLE rule) is untouched.

CREATE OR REPLACE FUNCTION public.fn_grievance_raiser_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid := auth.uid();
  v_privileged  boolean;
  v_blocked     text;
  v_old         public.grievance_tickets;
BEGIN
  -- Only the raiser acting on her own row is constrained. Staff writes are
  -- governed by RLS and by the app.
  IF v_actor IS NULL OR OLD.raised_by_id IS NULL OR OLD.raised_by_id <> v_actor THEN
    RETURN NEW;
  END IF;

  v_privileged := coalesce(public.is_super_admin(), false)
               OR coalesce(public.is_admin(), false)
               OR EXISTS (
                    SELECT 1
                    FROM public.user_roles ur
                    JOIN public.custom_roles cr ON ur.role_id = cr.id
                    WHERE ur.user_id = v_actor
                      AND cr.role_key = 'icc_member'
                  );

  -- 2026-12-20 (BUG-006107): an ACTIVE council executive may ROUTE her own ticket.
  -- fn_is_lc_executive() is the same authority the PATCH route already trusts for
  -- executives on other people's tickets. We neutralise only assigned_to in the
  -- comparison so every other guard — status, is_icc_only, category… — still
  -- applies: the President can hand his complaint to a member, but cannot mark it
  -- resolved himself (that would file accreditation evidence for a self-handled case).
  v_old := OLD;
  IF coalesce(public.fn_is_lc_executive(), false) THEN
    v_old.assigned_to := NEW.assigned_to;
  END IF;

  v_blocked := public.fn_grievance_raiser_change_allowed(v_old, NEW, v_privileged);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'grievance_tickets.% cannot be changed by the person who raised the ticket (ticket %). Allowed edits: the complaint text, and status -> withdrawn. Changing is_icc_only would lock the team members handling it out of the case; changing status to resolved or closed would emit NAAC/UGC accreditation evidence for a complaint nobody handled.',
      v_blocked, OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;
