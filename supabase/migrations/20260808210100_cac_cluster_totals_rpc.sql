-- ============================================================================
-- Updated: 2026-08-01 — CAC cluster collaboration: one guarded read, and the
-- five views stop answering to every signed-in account.
--
-- NOT applied to any database — Director-gated apply. Nothing here writes,
-- creates a table, or stores a new fact. It adds one read-only function and
-- changes grants on five relations that already exist.
--
-- THIS FIXES A DEFECT IN 20260801093000, WHICH IS ALREADY APPLIED AND IS NOT
-- EDITED HERE. Fix-forward only: that file is on prod, and rewriting it would
-- leave the repository describing a state no database was ever in.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG
--
-- Two faults, and they are the same fault seen from two sides.
--
--   1. The five views are `security_invoker`, so each returns the rows the
--      CALLER may see. That reasoning was sound for a per-institution reader and
--      is wrong for this reader. The Cluster Academic Council exists to look
--      across the colleges; a council member whose access rules are scoped to
--      one institution was shown that institution's slice and no signal that
--      anything was missing. From the client, "row-level security hid it" and
--      "genuinely zero" are the same empty array. The page said so honestly in
--      its footnote, which is the best a page can do and is not good enough for
--      a body whose whole function is the cluster-wide reading.
--
--   2. Their ACL reads `authenticated=r/postgres`. Every signed-in account on
--      the platform — every learner, every visiting account — could query all
--      five over PostgREST directly. `accreditation.cac.view` gated the screen
--      and nothing else. A permission enforced only in the user interface is a
--      suggestion; the anon-exposure work of 2026-07-31 was the same lesson one
--      role along, and the correction is the same: put the gate on the data.
--
-- Fixing either one alone breaks the page. Revoke without a replacement read and
-- four panels go blank in production; add the function and leave the grant and
-- the views still answer anyone who asks. So both are here, and the hook is
-- repointed in the same change.
--
-- ----------------------------------------------------------------------------
-- WHY THE FUNCTION READS THE VIEWS INSTEAD OF RESTATING THEM
--
-- The five view bodies carry roughly three hundred lines of carefully argued
-- join logic — which column is the giver, why the hub is matched on a normalised
-- name, why the overlap count is a floor. Copying that into a function would
-- create two definitions of the same finding that can drift apart silently, and
-- the drift would show up as a number on a council paper.
--
-- Reading them instead works BECAUSE they are `security_invoker`, not in spite
-- of it. Inside a SECURITY DEFINER function `current_user` is the owner, so an
-- invoker view evaluates its base tables as the owner. This function is owned by
-- `postgres`, which carries `rolbypassrls` on this project (verified in the
-- catalog, 2026-08-01), so the base tables answer in full and the council gets
-- the cluster's true totals. The views keep their invoker semantics for any
-- future caller; the authority lives in exactly one place, this function, behind
-- one permission.
--
-- WHY IT TAKES NO ARGUMENTS
-- The same reason its neighbour `fn_cac_measured_metrics` takes none. A
-- SECURITY DEFINER function that accepts a caller-supplied user or institution
-- id and trusts it is an IDOR, and that exact shape was found in 75+ functions
-- on this project in July. Identity comes from `auth.uid()` by way of the
-- permission helpers; there is no parameter to forge. The permission is the only
-- key.
--
-- WHY THE PERMISSION KEY IS AN EXISTING ONE
-- `accreditation.cac.view` is already registered in lib/constants/permissions.ts
-- and already appears in the role dialog. A key that exists only in SQL is
-- ungrantable — nobody can tick it — so the function would be reachable by super
-- admins alone and the council would be locked out of its own page.
--
-- COST: the five reads together plan and execute in ~42ms on production
-- (measured 2026-08-01, as `postgres`, cold). The `authenticated` role's 8s
-- statement_timeout applies to the calling session regardless of the definer, so
-- this had to be checked rather than assumed. It is two orders of magnitude
-- inside the budget.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. THE READ.
--
-- One call, one payload, five keys — deliberately not five functions. The page
-- renders four panels from these five views and one of them reads two; five
-- separate round trips would each re-pay the guard and the planner for no gain.
--
-- The overlap list is capped inside the function. The view holds over a thousand
-- shared titles (1,067 on 2026-08-01) and the panel shows a dozen. The true
-- count is NOT lost by the cap — it comes from `overlap_summary.shared_titles`,
-- which is computed over every title — so the denominator on screen stays honest
-- while the payload stays small.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cac_cluster_totals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Comfortably above anything the panel displays and far below the row count,
  -- so the cap is never the reason a reader sees a short list.
  v_overlap_cap constant int := 50;
  v_result      jsonb;
BEGIN
  -- COALESCE on BOTH predicates. A guard helper that returns NULL makes the
  -- whole condition NULL, `NOT NULL` is NULL, the IF does not fire, and the
  -- function returns the cluster to an unauthorised caller. Never leave either
  -- one bare.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.cac.view'), false)
  ) THEN
    RAISE EXCEPTION
      'Not authorised to read Cluster Academic Council cluster totals'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    -- COALESCE to an empty array on every list. jsonb_agg over zero rows returns
    -- NULL, and a null where the client expects an array is a crash in a panel
    -- rather than an empty panel.
    'funnel', COALESCE((
      SELECT jsonb_agg(to_jsonb(f)
             ORDER BY f.departments_activated DESC, f.institution_name)
      FROM public.v_cac_solution_funnel f
    ), '[]'::jsonb),

    'edges', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.units DESC)
      FROM public.v_cac_exchange_edges e
    ), '[]'::jsonb),

    'overlap', COALESCE((
      SELECT jsonb_agg(to_jsonb(o)
             ORDER BY o.institution_count DESC, o.course_title)
      FROM (
        SELECT *
        FROM public.v_cac_curriculum_overlap
        ORDER BY institution_count DESC, course_title
        LIMIT v_overlap_cap
      ) o
    ), '[]'::jsonb),

    -- Always exactly one row: the view aggregates with no GROUP BY.
    'overlap_summary', (
      SELECT to_jsonb(s) FROM public.v_cac_curriculum_overlap_summary s
    ),

    'isolation', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.institution_name)
      FROM public.v_cac_collaboration_isolation i
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_cac_cluster_totals() IS
  'Cluster-wide totals behind the four CAC collaboration panels, read from the '
  'five v_cac_ views as the definer so the council sees the cluster rather than '
  'its own row-level slice. Takes no arguments by design — identity and '
  'permission are derived internally, so there is nothing for a caller to '
  'forge. Gated on accreditation.cac.view.';

-- Both, not just anon. Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- anon on every new function, AND anon inherits PUBLIC's =X/postgres grant.
-- Revoking one and not the other leaves the function callable with the anon key
-- that ships in every browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_cac_cluster_totals() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cac_cluster_totals() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. THE LOCK.
--
-- `authenticated` loses SELECT on all five. After this the only ways in are the
-- function above, which checks the permission, and a service-role client, which
-- only server code holds. `service_role` and `postgres` are deliberately left
-- alone: the definer function needs the owner grant to read the views at all,
-- and a future server route using the service key should keep working.
--
-- REVOKE ALL rather than REVOKE SELECT. The write bits are not present today,
-- but revoking the set is what makes this statement idempotent against whatever
-- the ACL happens to hold when it runs.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.v_cac_solution_funnel              FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_exchange_edges               FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_curriculum_overlap           FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_curriculum_overlap_summary   FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_collaboration_isolation      FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- 3. THE ASSERTION — read from the catalog, not trusted from the text above.
--
-- Same shape as the assertion in 20260801093000, inverted: that one required
-- `authenticated=r`, this one requires `authenticated` to be absent entirely.
--
-- Reading `pg_class.relacl` directly rather than calling has_table_privilege,
-- for two reasons that have both bitten this project. `information_schema`
-- omits materialized views, so a relation there can read "no grants" while its
-- relacl says otherwise — these five are plain views, but the habit is the
-- defence. And a privilege check answers one bit at a time, whereas what has to
-- be true here is that a whole role is gone.
--
-- The function's own grants are asserted too. A REVOKE that silently did nothing
-- is exactly the failure this block exists to catch, and it is not hypothetical:
-- the rehearsal of 20260808200000 found `authenticated=arwdDxt` still standing
-- after what looked like a correct grant sequence.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rel   text;
  v_acl   text;
  v_fn    oid;
  v_names text[] := ARRAY[
    'v_cac_solution_funnel',
    'v_cac_exchange_edges',
    'v_cac_curriculum_overlap',
    'v_cac_curriculum_overlap_summary',
    'v_cac_collaboration_isolation'
  ];
BEGIN
  FOREACH v_rel IN ARRAY v_names LOOP
    SELECT coalesce(array_to_string(c.relacl, ' '), '')
      INTO v_acl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_rel;

    IF v_acl IS NULL THEN
      RAISE EXCEPTION 'public.% does not exist', v_rel;
    END IF;

    IF v_acl ~ '(^| )authenticated=' THEN
      RAISE EXCEPTION
        'public.% still grants authenticated; acl is %', v_rel, v_acl;
    END IF;

    IF v_acl ~ '(^| )anon=' THEN
      RAISE EXCEPTION 'public.% is granted to anon; acl is %', v_rel, v_acl;
    END IF;

    -- A PUBLIC grant appears as an entry with an empty grantee ("=r/owner").
    IF v_acl ~ '(^| )=' THEN
      RAISE EXCEPTION 'public.% is granted to PUBLIC; acl is %', v_rel, v_acl;
    END IF;

    -- The definer function reads these views as the owner, so the owner grant is
    -- load-bearing and not merely tidy.
    IF v_acl !~ '(^| )postgres=' THEN
      RAISE EXCEPTION
        'public.% no longer grants its owner; the read function cannot see it. acl is %',
        v_rel, v_acl;
    END IF;
  END LOOP;

  SELECT p.oid INTO v_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_cac_cluster_totals';

  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'public.fn_cac_cluster_totals was not created';
  END IF;

  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_cac_cluster_totals';
  END IF;

  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_cac_cluster_totals';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn) THEN
    RAISE EXCEPTION 'fn_cac_cluster_totals is not SECURITY DEFINER';
  END IF;
END $$;
