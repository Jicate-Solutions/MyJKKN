-- Migration: Choose Your Menu self-improving loop — PR3 chairperson verdict
-- Date: 2026-06-28  Reason: close loop Part 3/4 control label — see
--   specs/mess-choose-your-menu-self-improving-loop-2026-06-28.md (PR3 section).
-- Ships DARK + backend-mostly. Depends on PR1 (20260727000000_mess_menu_loop_spine.sql,
--   merged) which created mess_menu_recommendations + fn_mess_measure_menu_lift.
--
-- This PR adds the VERDICT channel: the chairperson's accept/reject/edited decision is
-- BOTH (a) the human-in-the-loop control over generated proposals AND (b) the causal
-- control label — 'rejected' slots (old menu kept) are the quasi-control that lets the
-- 2-cycle sim test whether measured lift is the recommendation or just regression-to-the-mean.

-- ── PART 3/4 verdict RPC — set the chairperson's decision on a proposal ──────
-- Writes go through this SECURITY DEFINER RPC (the spine table's RLS gates SELECT only).
-- reviewed_by = auth.uid(): profiles.id == auth.users.id (1:1), so the FK to profiles(id) holds.
-- status is a state-machine value, validated here AND by the table's CHECK constraint.
CREATE OR REPLACE FUNCTION public.fn_mess_recommendation_set_verdict(
  p_recommendation_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A verdict is one of the three terminal review states. 'proposed' is the
  -- generator's initial state and is NOT a settable verdict.
  IF p_status NOT IN ('accepted','rejected','edited') THEN
    RAISE EXCEPTION 'invalid verdict status %, expected accepted|rejected|edited', p_status;
  END IF;

  UPDATE public.mess_menu_recommendations
     SET status      = p_status,
         review_note = p_note,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at  = now()
   WHERE id = p_recommendation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation % not found', p_recommendation_id;
  END IF;
END;
$$;

-- Anon-lock (Supabase default-grants anon EXECUTE on every new function — revoke explicitly)
REVOKE EXECUTE ON FUNCTION public.fn_mess_recommendation_set_verdict(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_recommendation_set_verdict(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
