-- BUG-006107 follow-up — the council President's assign click was STILL refused
-- after #3802 (migration 20261220000000), which merged and applied on 2026-09-15.
--
-- WHY THE FIRST FIX DID NOT HOLD
-- The Issues screen sends only `{ assigneeId }`. The PATCH route
-- (app/api/learners-council/issues/[id]/route.ts) writes assigned_to + assigned_at
-- AND adds `status = 'in_progress'` in the SAME update when no status was sent.
-- 20261220000000 neutralised `assigned_to` only, so the raiser guard went on to
-- refuse `status` — same 42501, one column later. Proven live as the President
-- (rolled back) on 2026-09-15 18:55 and again at 22:15 before this file was written.
--
-- FIX
-- Inside the existing executive exemption, also neutralise the ONE routing
-- transition the route performs: open -> in_progress while an assignee is being
-- set. Nothing else is widened: resolved / closed by the raiser, is_icc_only,
-- category_id, filed_by, institution_id and raised_by_id stay guarded.
-- Additionally (deep review HIGH #1 on #3802): the exemption no longer applies at
-- all on a ticket marked is_icc_only, so a confidential ICC case is never routed
-- by its own raiser, executive or not.
--
-- REHEARSED ON PRODUCTION 2026-09-15 22:15 IST as `authenticated`, every case undone:
--   control, live body: President's real click (assign + in_progress)  -> 42501 status
--   A  new body: President's real click                                 -> ALLOWED
--   B  new body: President, bare assign                                 -> ALLOWED
--   C  new body: President, status = resolved on his own ticket         -> 42501 status
--   C2 new body: President, assign + resolved in one update             -> 42501 status
--   D  new body: an ordinary raiser's real click on her own ticket      -> 42501 assigned_to
--   E  new body: President's real click on his ticket made ICC-only     -> 42501 assigned_to
--
-- SCOPE: CREATE OR REPLACE of one trigger function, body taken from the LIVE
-- function (pg_get_functiondef) with two edits. No table change, no policy change,
-- no grants (trigger functions are not directly callable). Not SECURITY DEFINER.
-- fn_grievance_raiser_change_allowed (the pure rule) is untouched.

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
  -- 2026-12-21 (BUG-006107 follow-up): the Issues screen sends only the assignee
  -- and the PATCH route ADDS status = 'in_progress' in the same UPDATE, so the
  -- 2026-12-20 exemption (assigned_to only) still refused the President's click
  -- on `status`. Neutralise BOTH columns of that one routing transition
  -- (open -> in_progress while assigning). A confidential ICC-only ticket is
  -- never routed by its own raiser, executive or not (deep review HIGH #1).
  IF coalesce(public.fn_is_lc_executive(), false)
     AND NOT coalesce(OLD.is_icc_only, false) THEN
    v_old.assigned_to := NEW.assigned_to;
    IF NEW.assigned_to IS NOT NULL
       AND OLD.status = 'open'
       AND NEW.status = 'in_progress' THEN
      v_old.status := NEW.status;
    END IF;
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
