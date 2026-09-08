-- What's New — make role scoping an ACCESS BOUNDARY instead of a display rule.
--
-- THE GAP THIS CLOSES. app/api/whats-new/route.ts said so in its own words:
--
--     "this gate is per-SESSION, not per-ROLE. Any signed-in user can request
--      any part and receive the full set; the page then filters what it
--      DISPLAYS by role ... the role scoping is a presentation rule, not an
--      access boundary."
--
-- So every signed-in account could read all ~4,800 entries — including the
-- subjects of Administration, AI Routines and Users & Roles changes — by
-- calling /api/whats-new?part=recent directly and ignoring the page. That is
-- the same class of miss as the public/*.json exposure of 2026-09-06, one layer
-- in: not open to the internet, but open to every signed-in learner.
--
-- WHY A FUNCTION AND NOT TYPESCRIPT. The rule already exists twice — as
-- canSeeModule() in the page, and as the permission spine every RLS policy
-- reads. A third copy in a route handler would be the one that drifts. Putting
-- it here means the route asks the database the same question the database
-- already answers for everything else, and a future RLS policy on
-- changelog_entries can call this function rather than restate it.
--
-- NOT NARROWER THAN THE PAGE, deliberately. A server filter that hides a module
-- the page shows today is a regression wearing a security fix's clothes, so
-- every widening source the client uses is reproduced below: the multi-role
-- OR-merge, the profiles.role safety net, live Director's Desk handover keys,
-- and the super-admin bypass. The one client widening NOT reproduced is
-- lib/services/bos/bos-role-permissions.ts, which seeds BOS defaults from a
-- TypeScript table for four role strings; hardcoding those role names here is
-- exactly what this codebase forbids. Its only externally visible effect —
-- `bos.view` seeded from an `academic.bos*` grant — is reproduced instead as a
-- namespace SIBLING rule, so a viewer holding either half sees the
-- board-of-studies module. See the residual note at the foot of this file.

CREATE OR REPLACE FUNCTION public.fn_changelog_visible_modules()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_role       text;
  v_grants     text[];
  v_visible    text[];
BEGIN
  -- Not signed in: no modules. The route refuses before reaching here, so this
  -- is the second lock rather than the first.
  IF v_uid IS NULL THEN
    RETURN '{}'::text[];
  END IF;

  -- Super admins and admins read everything, which is the same first line every
  -- RLS policy in this database opens with.
  IF is_super_admin() OR is_admin() THEN
    RETURN COALESCE((SELECT array_agg(key) FROM changelog_modules), '{}'::text[]);
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;

  -- The viewer's granted keys, OR-merged across every source the page uses.
  -- Only keys whose value is literally true count: `{"billing.view": false}` is
  -- a withheld permission, not a held one.
  SELECT COALESCE(array_agg(DISTINCT k), '{}'::text[])
    INTO v_grants
  FROM (
    -- 1. every role assigned in user_roles (multi-role OR-merge)
    SELECT jsonb_object_keys(cr.permissions) AS k, cr.permissions AS p
      FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
     WHERE ur.user_id = v_uid
       AND cr.is_active

    UNION ALL

    -- 2. the profiles.role safety net. use-permissions.ts merges this in
    --    whenever profiles.role is absent from user_roles — a real data state
    --    on this platform, not a hypothetical. Merging it unconditionally is
    --    the same set or a superset, never less.
    SELECT jsonb_object_keys(cr.permissions), cr.permissions
      FROM custom_roles cr
     WHERE cr.role_key = v_role
       AND cr.is_active
  ) src
  WHERE (src.p ->> src.k)::boolean IS TRUE;

  -- 3. live Director's Desk handovers. The spine's own function decides
  --    liveness (status, revocation, IST due date, walls); restating any of
  --    that here is the drift this call exists to avoid.
  v_grants := v_grants || COALESCE(fn_my_handover_permissions(), '{}'::text[]);

  SELECT COALESCE(array_agg(m.key), '{}'::text[])
    INTO v_visible
  FROM changelog_modules m
  WHERE
    -- Platform-wide: sign-in, navigation, speed. Everyone signed in sees these.
    -- An empty array must mean the same thing as NULL — toModule() in the route
    -- normalises one to the other, and disagreeing here would hide them.
    m.perm IS NULL
    OR cardinality(m.perm) = 0
    OR EXISTS (
      SELECT 1
        FROM unnest(m.perm) AS ns(prefix)
        JOIN unnest(v_grants) AS g(key) ON TRUE
       WHERE g.key = ns.prefix
          OR g.key LIKE ns.prefix || '.%'
          -- BOS sibling rule, standing in for applyBOSFallback(): the `bos`
          -- namespace and the `academic.bos` namespace name the same product
          -- area, and a role may hold its keys under either.
          OR (ns.prefix = 'bos'          AND g.key LIKE 'academic.bos%')
          OR (ns.prefix LIKE 'academic.bos%' AND g.key LIKE 'bos%')
    );

  RETURN v_visible;
END;
$$;

COMMENT ON FUNCTION public.fn_changelog_visible_modules() IS
  'Module keys the CALLER may read in What''s New. Server-side twin of '
  'canSeeModule() in lib/changelog/use-changelog.ts — change them together.';

-- Supabase grants EXECUTE on every new function to anon by default, separately
-- from PUBLIC, so the usual REVOKE FROM PUBLIC alone would leave this callable
-- with the anon key that ships in the client bundle.
REVOKE EXECUTE ON FUNCTION public.fn_changelog_visible_modules() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_changelog_visible_modules() TO authenticated;

-- ───────────────────────────────── residual ─────────────────────────────────
-- One case narrows: a viewer whose role is administrator/hod/principal/faculty,
-- who holds NO `bos%` and NO `academic.bos%` key in the database at all, sees
-- board-of-studies entries today only because bos-role-permissions.ts seeds
-- them in the browser. They no longer will. That seed exists to patch stale
-- navigation data, and product news is not a capability — narrowing here is the
-- correct direction for a boundary. Stated rather than discovered later.
