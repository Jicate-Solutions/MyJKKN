-- =============================================================================
-- 20260630140000_scf_record_suggestion_kind.sql
-- SCF self-improving loop → learn from POSITIVE feedback (part 2 of 2).
-- Depends on 20260630130000_scf_suggestions_kind.sql (the scf_ai_suggestions.kind
-- column). This migration teaches the record RPC to STORE that kind.
-- =============================================================================
-- The generator (cron/scf-generate-suggestions) now has two branches:
--   * low-understanding window  -> records kind='improvement' (the legacy path)
--   * standout-positive window  -> records kind='success'    (the new path)
-- Both call fn_scf_record_suggestion, which needs a kind parameter to label the
-- row it writes.
--
-- DROP + CREATE (not CREATE OR REPLACE): adding a parameter changes the identity
-- argument list, so REPLACE would create a SECOND overload and make the existing
-- 10-named-arg callers (the cron + ai-suggest-improvement route) ambiguous.
-- Dropping the exact old 11-arg signature first keeps exactly one function.
--
-- BACK-COMPAT: p_kind is the LAST parameter and DEFAULTs to 'improvement', so the
-- currently-deployed callers (which pass neither p_section_id nor p_kind) keep
-- working unchanged and continue to label their rows 'improvement'. This makes
-- the migration safe to apply BEFORE the new cron code deploys.
-- =============================================================================

DROP FUNCTION IF EXISTS public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid
);

CREATE OR REPLACE FUNCTION public.fn_scf_record_suggestion(
  p_institution_id uuid,
  p_course_code    text,
  p_faculty_email  text,
  p_window_from    date,
  p_window_to      date,
  p_input_responses integer,
  p_input_low      integer,
  p_input_avg      numeric,
  p_suggestion     jsonb,
  p_model          text,
  p_section_id     uuid DEFAULT NULL::uuid,
  p_kind           text DEFAULT 'improvement'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.scf_ai_suggestions (
    institution_id, course_code, faculty_email, window_from, window_to,
    input_responses, input_low_responses, input_avg_understood, suggestion, model,
    section_id, domain, kind
  ) VALUES (
    p_institution_id,
    p_course_code,
    lower(NULLIF(btrim(p_faculty_email), '')),
    p_window_from,
    p_window_to,
    p_input_responses,
    p_input_low,
    p_input_avg,
    p_suggestion,
    p_model,
    p_section_id,
    'session_feedback',                                  -- domain is always session_feedback here
    COALESCE(NULLIF(btrim(p_kind), ''), 'improvement')   -- guard against '' / NULL -> default
  )
  ON CONFLICT (
    institution_id,
    course_code,
    COALESCE(faculty_email, ''),
    window_from,
    window_to,
    domain
  ) DO UPDATE SET
    suggestion              = EXCLUDED.suggestion,
    input_responses         = EXCLUDED.input_responses,
    input_low_responses     = EXCLUDED.input_low_responses,
    input_avg_understood    = EXCLUDED.input_avg_understood,
    model                   = EXCLUDED.model,
    section_id              = EXCLUDED.section_id,
    kind                    = EXCLUDED.kind,             -- re-record corrects the label if the window flipped
    updated_at              = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- LOCK: service_role ONLY (consistent with 150000/160000). This is SECURITY
-- DEFINER and writes ANY tenant's suggestion row with no per-caller scoping; its
-- only callers are server-side service-role (the cron + the ai-suggest-improvement
-- route's createServiceRoleClient). Granting `authenticated` would be a cross-tenant
-- forge/overwrite primitive — so this migration leaves the function safe on its own
-- rather than relying on the downstream 160000 to revoke a too-broad grant.
REVOKE EXECUTE ON FUNCTION public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid, text
) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
