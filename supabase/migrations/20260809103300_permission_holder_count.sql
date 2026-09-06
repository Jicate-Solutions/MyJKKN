-- =====================================================================================
-- How many REAL PEOPLE currently rely on a permission key
-- Director decision 9 (2026-08-05 interview): when an admin unticks a permission in
-- Role Management, warn them if real people would lose access — and the count must be
-- actual human beings, not the number of roles.
--
-- FILE ONLY / NOT APPLIED. Not run against production, not even inside BEGIN..ROLLBACK.
-- Apply is Director-gated. The UI half is deploy-safe ahead of it: when this function
-- does not exist the client's RPC call errors, the count map stays empty, and no
-- warning is shown. The feature switches itself on the moment this file is applied.
--
-- WHY IT EXISTS
--   PR #2851 registered 118 permission keys the database already enforces. 42 of them
--   were switched on and in active use while being invisible in Role Management. They
--   are editable now, so one careless click can silently break a working feature —
--   and RLS denial in this codebase is ALWAYS silent (0 rows, error = null), so the
--   damage surfaces as "the page is empty", never as an error.
--
-- THE COUNT RULE — the whole point of the feature
--   DISTINCT PEOPLE: custom_roles -> user_roles -> COUNT(DISTINCT user_id).
--   NOT the sum of per-role holder counts. Summing double-counts anyone who holds two
--   of the granting roles. Worked receipt: `bos.experts.view` is granted by 9 roles;
--   summing per-role holders gives 621, the correct distinct-person count is 581.
--   A key granted only by roles nobody holds returns 0, and the UI stays SILENT there.
--   That silence is a feature: a warning that cries wolf gets trained away.
--
-- SEMANTICS, stated so a later reader does not "fix" them into something else
--   * Truthiness mirrors public.user_has_permission() — which does NOT filter on
--     custom_roles.is_active, so neither does this. Counting only active roles would
--     UNDER-warn while the database still enforces the grant, and under-warning is the
--     worse failure for a safety prompt.
--   * The truthy test is spelled as an IN-list rather than `(... ->> key)::boolean`.
--     The IN-list matches exactly the set of strings ::boolean accepts as true, but a
--     malformed value (an object, an array, "maybe") makes it return false instead of
--     raising — one bad row must not take the whole warning offline, because a failed
--     count reads to the UI as "nobody is affected".
--   * The count is per KEY across every granting role, not per role. Unticking the key
--     on one role may leave some of those people holding it through a second role. The
--     number answers "how many people does this permission currently serve", which is
--     the question the admin needs answered before clicking.
--
-- SECURITY
--   SECURITY DEFINER because user_roles RLS lets a user read only their own rows, so an
--   admin editing a role would otherwise count nothing (silently, as always). Discloses
--   AGGREGATE COUNTS ONLY — no identities — matching the precedent set by
--   fn_role_user_counts(). It takes NO acting-user parameter: there is no caller-supplied
--   identity to forge, so there is no IDOR surface.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_permission_live_holder_count(p_keys text[])
RETURNS TABLE(permission_key text, holder_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.pkey AS permission_key,
         COUNT(DISTINCT ur.user_id)::bigint AS holder_count
  FROM (
    -- Deduplicated, blank-stripped, and capped. The cap sits above the size of the
    -- whole permission catalogue (~1,419 keys), so a legitimate batch is never
    -- truncated; it exists only to bound a hostile array. The inner column is named
    -- pkey, not permission_key: RETURNS TABLE columns are OUT parameters and share a
    -- namespace with column references inside the body.
    SELECT DISTINCT u.k AS pkey
    FROM unnest(COALESCE(p_keys, ARRAY[]::text[])) WITH ORDINALITY AS u(k, ord)
    WHERE u.ord <= 2000
      AND u.k IS NOT NULL
      AND btrim(u.k) <> ''
  ) k
  LEFT JOIN custom_roles cr
    ON lower(btrim(cr.permissions ->> k.pkey)) IN ('true', 't', 'yes', 'y', '1')
  LEFT JOIN user_roles ur
    ON ur.role_id = cr.id
  GROUP BY k.pkey;
$$;

COMMENT ON FUNCTION public.fn_permission_live_holder_count(text[]) IS
  'Distinct real people who currently hold each given permission key, via custom_roles -> user_roles. Returns one row per requested key, 0 when no holder exists. Never sums per-role counts (that double-counts multi-role holders). Aggregate counts only, no identities. Feeds the "this permission is used by N people" warning in Role Management.';

-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon
-- separately from PUBLIC, so both must be revoked explicitly.
REVOKE EXECUTE ON FUNCTION public.fn_permission_live_holder_count(text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_permission_live_holder_count(text[]) TO authenticated;

-- =====================================================================================
-- VERIFICATION (run by hand after a Director-approved apply — none of this is executed
-- by this file, and none of it is a gate that could later refuse forever)
--
-- (a) The receipt. Must print roles = 9 and people = 581, and the two must differ from
--     the summed figure (621), which is the bug this function exists to avoid:
--       SELECT count(*) AS roles,
--              sum(h.holders) AS summed_wrong,
--              (SELECT holder_count FROM fn_permission_live_holder_count(
--                  ARRAY['bos.experts.view']))                    AS people_right
--       FROM (SELECT cr.id, count(DISTINCT ur.user_id) AS holders
--             FROM custom_roles cr
--             JOIN user_roles ur ON ur.role_id = cr.id
--             WHERE lower(btrim(cr.permissions ->> 'bos.experts.view'))
--                   IN ('true','t','yes','y','1')
--             GROUP BY cr.id) h;
--
-- (b) Silence where it belongs. A key granted only by a role nobody holds must come
--     back 0, not absent:
--       SELECT * FROM fn_permission_live_holder_count(ARRAY['<key on an empty role>']);
--
-- (c) Every requested key comes back, including nonsense ones (the UI treats an absent
--     key as "unknown" and stays silent, so a dropped row would silently disarm it):
--       SELECT count(*) FROM fn_permission_live_holder_count(
--         ARRAY['bos.experts.view','not.a.real.key','']);   -- expect 2
--
-- (d) Grants. anon must hold nothing; authenticated must hold EXECUTE:
--       SELECT has_function_privilege('anon',
--         'public.fn_permission_live_holder_count(text[])', 'EXECUTE')          AS anon_should_be_false,
--              has_function_privilege('authenticated',
--         'public.fn_permission_live_holder_count(text[])', 'EXECUTE')          AS authed_should_be_true;
--
-- (e) Behaviour, not objects. Open Role Management as a real admin, untick a permission
--     that (a) reported a non-zero count, and confirm the warning names that same number.
-- =====================================================================================
