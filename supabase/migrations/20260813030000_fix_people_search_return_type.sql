-- ============================================================================
-- The hand-over people picker returned an error instead of people.
--
-- Date: 2026-08-06
-- Found by: the Director, using the feature on production. Not by CI.
--
-- THE FAILURE, reproduced verbatim through PostgREST with a real session:
--   POST /rest/v1/rpc/fn_handover_people_search  {"p_query":"eao"}
--   400  42804  "structure of query does not match function result type"
--        "Returned type character varying(255) does not match expected type
--         text in column 7."
--
-- In the dialog this surfaced as the catch-all
--   "Could not look people up just now. Check you are still signed in, then
--    try again."
-- which sent the Director to check his session — the one thing that was fine.
--
-- THE CAUSE
-- ---------
-- The signature declares `institution_name text` (column 7), but it is fed by
-- `institutions.name`, which is `character varying(255)`. PostgreSQL does not
-- coerce a RETURNS TABLE column: any width-qualified varchar against a declared
-- text raises 42804 and discards the WHOLE result set, so the picker could never
-- return anybody — with or without a search term.
--
-- All seven columns were checked, not just the one that errored, so fixing this
-- cannot simply surface the next mismatch:
--   profiles.id uuid ✓ · full_name text ✓ · email text ✓ · role text ✓ ·
--   designation text ✓ · institution_id uuid ✓ · institutions.name varchar(255) ✗
--
-- THE FIX
-- -------
-- Cast at the one site: `i.name::text`. Body otherwise byte-identical to the
-- live definition read from production with pg_get_functiondef today — not
-- retyped from the repo, which is how a body gets silently reverted.
--
-- WHY CI MISSED IT
-- ----------------
-- Nothing executes this RPC. TypeCheck cannot see a PostgreSQL return-type
-- contract, and the tests use an in-memory fake whose column types are whatever
-- JavaScript made them. A 42804 only exists against a real catalog. The general
-- lesson is the repo's own: a test that models the SQL proves only self-agreement.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_handover_people_search(p_query text)
 RETURNS TABLE(id uuid, full_name text, email text, role text, designation text, institution_id uuid, institution_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Every OUT column below (id, role, email, institution_id …) also becomes a
-- plpgsql variable, and several of them share a name with a profiles column.
-- All references in the query are table-qualified, but use_column removes the
-- entire class of "column reference is ambiguous" failure rather than relying
-- on that discipline surviving the next edit.
#variable_conflict use_column
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
BEGIN
  IF NOT public.fn_can_hand_over() THEN
    RAISE EXCEPTION 'Not authorised to hand over work'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.full_name,
         p.email,
         p.role,
         p.designation,
         p.institution_id,
         i.name::text AS institution_name
  FROM public.profiles p
  LEFT JOIN public.institutions i ON i.id = p.institution_id
  WHERE COALESCE(p.is_active, true) = true
    AND COALESCE(p.is_login_disabled, false) = false
    AND p.learner_id IS NULL
    AND p.role <> 'student'
    AND p.id <> auth.uid()
    AND public.role_has_institution_access(p.institution_id)
    AND (
      v_q = ''
      OR p.full_name ILIKE '%' || v_q || '%'
      OR p.email     ILIKE '%' || v_q || '%'
    )
  -- Exact-prefix matches first: typing "Bo" should surface Boobalan before
  -- everyone whose email merely contains "bo".
  ORDER BY (p.full_name ILIKE v_q || '%') DESC NULLS LAST,
           p.full_name ASC NULLS LAST
  LIMIT 20;
END;
$function$;


REVOKE EXECUTE ON FUNCTION public.fn_handover_people_search(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_people_search(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
