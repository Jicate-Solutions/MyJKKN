-- ============================================================================
-- Tenant scoping: a NULL institution must mean "no match", not "skip the test".
--
-- Date: 2026-08-06
-- Spec: specs/director-desk/SPEC.md
-- Applies to production, where 20260811100000/100200 are already applied.
--
-- THE DEFECT
-- ----------
-- Both check functions carried this predicate:
--
--     AND (dh.institution_id IS NULL
--          OR dh.institution_id IS NOT DISTINCT FROM p.institution_id)
--
-- The leading `IS NULL OR` is a short-circuit: when the handover's institution
-- is NULL the tenant test never runs at all. A handover minted while BOTH
-- parties had a NULL institution (super admins commonly have none, and 18
-- non-learner profiles sit that way today) is therefore permanently unscoped —
-- it keeps granting after the receiver is moved INTO a college, which is the
-- one thing the spine's tenant promise says cannot happen.
--
-- THE FIX IS A DELETION
-- ---------------------
-- Removing the short-circuit is sufficient, because SQL already has the right
-- semantics: `NULL IS NOT DISTINCT FROM NULL` is TRUE. So the remaining clause
-- alone gives the full truth table, with no special-casing:
--
--   handover inst | receiver inst | before  | after
--   --------------|---------------|---------|-------
--   NULL          | NULL          | grant   | grant   (cluster-level, unchanged)
--   NULL          | College B     | grant   | DENY    <-- the defect, now closed
--   College A     | NULL          | deny    | DENY
--   College A     | College A     | grant   | grant
--   College A     | College B     | deny    | DENY
--
-- Nobody who legitimately holds a grant today loses it: the only row that
-- changes is the one where the receiver has since acquired an institution the
-- handover was never scoped to.
--
-- WHY THE BODIES BELOW ARE MACHINE-EXTRACTED
-- ------------------------------------------
-- Both functions are CREATE OR REPLACE'd here, which means this file's body is
-- the one that wins. Rather than retype them from the repo — the exact mistake
-- that silently reverted the cross-tenant guard once already (PR #2840) — these
-- bodies were read out of PRODUCTION with pg_get_functiondef on 2026-08-06 and
-- edited programmatically. The ONLY textual difference from the live definition
-- is the removal of the `dh.institution_id IS NULL OR` line.
-- ============================================================================

-- ---- fn_handover_grants_key: short-circuit removed (1 site) ----
CREATE OR REPLACE FUNCTION public.fn_handover_grants_key(p_user_id uuid, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.director_handovers dh
    JOIN public.profiles p ON p.id = dh.grantee_user_id
    WHERE dh.grantee_user_id = p_user_id
      -- pending grants access too: you must be able to open a thing to decide
      -- whether to accept it (decision 8).
      AND dh.status IN ('pending', 'accepted')
      AND dh.revoked_at IS NULL
      -- Decision 4. Due dates are dates, and the day is inclusive: a handover
      -- due today is live until IST midnight, not expired at 00:00.
      AND dh.due_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
      -- Decision 7: the moment the receiver's profile stops being active their
      -- doors shut, without waiting for the nightly sweep to relabel the row.
      AND COALESCE(p.is_active, true) = true
      -- MULTI-TENANT. institution_id on the row is the GRANTER's institution at
      -- grant time; a grant only counts while the receiver still belongs to it.
      -- Written as strict equality and NOT as role_has_institution_access(),
      -- deliberately: that helper answers "may the CALLER see this institution",
      -- returns true for any institution when the caller holds a role scoped
      -- 'all', and is evaluated for auth.uid() — none of which is the question
      -- here. The question is whether the GRANTEE is still inside the tenant the
      -- grant was made in. A receiver who transfers colleges loses the handover.
      AND dh.institution_id IS NOT DISTINCT FROM p.institution_id
      -- `@>` (array-contains), not `= ANY(...)`. GIN cannot serve `= ANY`, so
      -- the idx_dh_permission_keys index below was never used by this lookup.
      AND dh.permission_keys @> ARRAY[p_key]
      -- Access level is re-checked HERE, not merely filtered in the UI.
      AND public.fn_handover_key_allowed_at_level(p_key, dh.access_level)
      -- Belt and braces: a wall added AFTER a grant was written retroactively
      -- kills that grant on the next check, rather than grandfathering it.
      AND NOT public.fn_handover_key_is_blocked(p_key)
  );
$function$;

-- ---- fn_my_handover_permissions: short-circuit removed (1 site) ----
CREATE OR REPLACE FUNCTION public.fn_my_handover_permissions()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT k), '{}'::text[])
  FROM public.director_handovers dh
  JOIN public.profiles p ON p.id = dh.grantee_user_id
  CROSS JOIN LATERAL unnest(dh.permission_keys) AS k
  WHERE dh.grantee_user_id = auth.uid()
    AND dh.status IN ('pending','accepted')
    AND dh.revoked_at IS NULL
    AND dh.due_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
    AND COALESCE(p.is_active, true) = true
    -- Same multi-tenant predicate as fn_handover_grants_key, and it MUST stay the
    -- same: this feeds the page gates and that one feeds RLS. If the page gate
    -- honoured a cross-institution grant that RLS did not, the receiver would get
    -- an open page over an empty table and no way to tell why.
    AND dh.institution_id IS NOT DISTINCT FROM p.institution_id
    AND NOT public.fn_handover_key_is_blocked(k)
    -- Same predicate the RLS path uses (fn_handover_grants_key). Shared on
    -- purpose: if the page gate and the data layer disagreed about what
    -- 'update' means, the receiver would get a page that opens onto nothing,
    -- or a button that 403s.
    AND public.fn_handover_key_allowed_at_level(k, dh.access_level);
$function$;

-- Grants are unchanged by CREATE OR REPLACE, but re-assert them so this file is
-- self-contained and a fresh apply cannot leave the oracle open.
REVOKE EXECUTE ON FUNCTION public.fn_handover_grants_key(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_handover_permissions() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_handover_permissions() TO authenticated;

DO $assert$
BEGIN
  IF has_function_privilege('authenticated','public.fn_handover_grants_key(uuid, text)','EXECUTE') THEN
    RAISE EXCEPTION 'fn_handover_grants_key is callable by authenticated — the oracle is open';
  END IF;
  IF NOT has_function_privilege('authenticated','public.fn_my_handover_permissions()','EXECUTE') THEN
    RAISE EXCEPTION 'fn_my_handover_permissions lost its grant — every page gate would stop seeing handovers';
  END IF;
END;
$assert$;

NOTIFY pgrst, 'reload schema';
