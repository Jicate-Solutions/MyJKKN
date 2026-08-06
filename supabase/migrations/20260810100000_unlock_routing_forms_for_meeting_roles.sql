-- 20260810100000_unlock_routing_forms_for_meeting_roles.sql
--
-- Routing Forms has been built, nav-wired and unreachable since it shipped.
--
-- WHAT WAS ACTUALLY WRONG
--   On 2026-08-04 an audit found routing_forms, routing_form_rules and
--   routing_form_responses at 0 rows with max(created_at) NULL — not "empty
--   since June", but never one row, ever.
--
--   The cause was not a missing feature. The page exists at
--   /meetings/routing-forms, the builder exists at [id], the rule evaluator and
--   the public /r/<slug> widget exist, and 'meetings.routing.view' IS registered
--   in lib/constants/permissions.ts. So this is NOT the ungrantable failure mode
--   (a key no role can be given). It is the plainer one:
--
--     24 roles carry 'meetings.routing.view'.  All 24 have it set to "false".
--     24 roles carry 'meetings.routing.manage'. All 24 have it set to "false".
--
--   Zero roles granted it, so only super admins could open the page — via
--   PermissionGuard's super-admin bypass — and none of them ever made a form.
--
-- WHY A GRANT IS SUFFICIENT, AND WHY IT IS SAFE
--   Widening a permission normally means touching four layers (page gate, RLS,
--   RPC, API route). Here the other layers are already wired to this same key
--   and already scope by owner:
--
--     routing_forms_select  USING  is_super_admin() OR is_admin()
--                                  OR host_profile_id = auth.uid() ...
--     routing_forms_insert  WITH CHECK  ... OR (host_profile_id = auth.uid()
--                                  AND user_has_permission('meetings.routing.manage'))
--
--   The INSERT policy calls user_has_permission() itself, so RLS defers to this
--   very flag. Granting it cannot widen anyone past their own rows: a holder can
--   only ever create, read and edit routing forms where they are the host.
--   Nobody gains sight of anybody else's forms.
--
-- WHO GETS IT, AND WHY THAT RULE
--   Exactly the roles that ALREADY hold 'meetings.view' = true.
--
--   That rule is deliberate rather than convenient. Four of the 24 carrying the
--   key cannot see the Meetings module at all — Digital Coordinator, JICATE
--   Staff, Sports Coordinator and Student — so granting them a sub-permission of
--   a module they cannot open would be incoherent, and in Student's case plainly
--   wrong. Tying the grant to meetings.view means this migration can never
--   out-grant the module gate above it, including for roles added later.
--
-- REVERSIBLE. Set both keys back to "false" to undo; no data is created or
-- destroyed, and no policy, function or grant is altered.

BEGIN;

-- Grant view + manage together. View alone would render a list with a "New
-- routing form" button that fails at the RLS INSERT check — a worse experience
-- than the locked page it replaces, and the kind of half-grant that reads as a
-- bug rather than a boundary.
UPDATE custom_roles
SET
  permissions = jsonb_set(
                  jsonb_set(permissions, '{meetings.routing.view}',   'true'::jsonb, false),
                  '{meetings.routing.manage}', 'true'::jsonb, false
                ),
  updated_at  = now()
WHERE permissions ? 'meetings.routing.view'
  AND permissions ? 'meetings.routing.manage'
  AND (permissions ->> 'meetings.view') = 'true'
  -- Idempotent: re-running changes nothing once both are already true.
  AND (
        (permissions ->> 'meetings.routing.view')   IS DISTINCT FROM 'true'
     OR (permissions ->> 'meetings.routing.manage') IS DISTINCT FROM 'true'
      );

-- Prove the outcome rather than assume it. A silent UPDATE that matched zero
-- rows looks identical to a successful one, and this repo has been bitten by
-- exactly that shape before.
DO $$
DECLARE
  v_granted   int;
  v_withheld  int;
BEGIN
  SELECT count(*) INTO v_granted
  FROM custom_roles
  WHERE (permissions ->> 'meetings.routing.view')   = 'true'
    AND (permissions ->> 'meetings.routing.manage') = 'true';

  SELECT count(*) INTO v_withheld
  FROM custom_roles
  WHERE permissions ? 'meetings.routing.view'
    AND (permissions ->> 'meetings.view') IS DISTINCT FROM 'true';

  RAISE NOTICE 'routing forms: % role(s) granted view+manage; % role(s) deliberately withheld (no meetings.view)',
    v_granted, v_withheld;

  IF v_granted = 0 THEN
    RAISE EXCEPTION
      'Routing Forms is still reachable by nobody — the grant matched no roles. '
      'Check that custom_roles.permissions still stores FLAT dotted keys '
      '(e.g. "meetings.routing.view") rather than a nested object; a shape change '
      'would make every predicate here silently false.';
  END IF;
END $$;

COMMIT;
