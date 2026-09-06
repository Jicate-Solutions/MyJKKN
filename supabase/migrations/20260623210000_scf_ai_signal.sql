-- 20260623210000_scf_ai_signal.sql
-- Session-feedback AI signal — the read side of the loop's IMPROVE-step AI assist.
--
-- fn_scf_ai_signal aggregates recent post-class feedback for ONE course over a
-- date window and returns the numeric signals PLUS the raw anonymized comment
-- text (free_texts[]) so an LLM can synthesize concrete teaching adjustments.
--
-- ANONYMITY LOCKDOWN (load-bearing):
--   Every OTHER fn_scf_* RPC grants EXECUTE to `authenticated` because it
--   aggregates/anonymizes server-side before returning. THIS one returns the
--   raw free_text comment array, which — though never tied to a student id — is
--   the most identity-adjacent payload in the feature. So it is SERVICE-ROLE
--   ONLY. The calling route (app/api/academic/session-feedback/
--   ai-suggest-improvement/route.ts) feeds free_texts to the model and NEVER
--   returns them to the client; the route's auth+scope logic is the boundary.
--   Beyond REVOKE FROM PUBLIC, we explicitly REVOKE FROM anon AND authenticated
--   (the Supabase default ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every
--   new function — see CLAUDE.md "Lock new RPCs from anon"). Only service_role
--   may call it.

CREATE OR REPLACE FUNCTION public.fn_scf_ai_signal(
  p_course_code     text,
  p_from            date,
  p_to              date,
  p_institution_id  uuid    DEFAULT NULL,
  p_faculty_email   text    DEFAULT NULL
)
RETURNS TABLE (
  course_code     text,
  responses       bigint,
  low_responses   bigint,
  avg_understood  numeric,
  free_texts      text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_course_code                                                          AS course_code,
    count(*)                                                               AS responses,
    count(*) FILTER (WHERE f.understood <= 2)                              AS low_responses,
    round(avg(f.understood)::numeric, 2)                                   AS avg_understood,
    array_agg(f.free_text) FILTER (
      WHERE f.free_text IS NOT NULL AND btrim(f.free_text) <> ''
    )                                                                      AS free_texts
  FROM public.session_feedback f
  WHERE f.course_code = p_course_code
    AND f.attendance_date BETWEEN p_from AND p_to
    AND (p_institution_id IS NULL OR f.institution_id = p_institution_id)
    AND (p_faculty_email  IS NULL OR lower(f.faculty_email) = lower(p_faculty_email));
$$;

COMMENT ON FUNCTION public.fn_scf_ai_signal(text,date,date,uuid,text) IS
  'AI IMPROVE-step signal for one course over a window: responses, low_responses (understood<=2), avg_understood, and the raw anonymized free_text[]. SERVICE-ROLE ONLY because it returns raw comment text — the caller feeds it to the model and never returns it to the client. Session-feedback substrate: 20260615233000_session_feedback_substrate.sql.';

REVOKE EXECUTE ON FUNCTION public.fn_scf_ai_signal(text,date,date,uuid,text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_ai_signal(text,date,date,uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';
