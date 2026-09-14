-- 20261212120000_instasolver_permission_all_roles.sql
--
-- InstaSolver — grant `instasolver.view` to EVERY role.
--
-- AUTHORITY
--   Decision I1, specs/instasolver-2026-09-14.md, locked by the Director in a
--   phone interview on 2026-09-14: "Everyone with a login" can file — learners,
--   teaching and non-teaching team members, parents. This is the one decision
--   that makes InstaSolver a front door rather than another gated console, and
--   it is why this migration deliberately does NOT tie the grant to any other
--   key (the usual "grant only where the module key is already true" rule would
--   re-create exactly the lockout the spec exists to remove: 204 non-teaching
--   team members and every parent are FALSE for learners_council.issues.view
--   today, which is how complaints became a students-only surface).
--
-- WHAT THE KEY ACTUALLY BUYS
--   `instasolver.view` unlocks the CHOOSER at /instasolver and nothing else.
--   The chooser writes no data. Every lane behind it re-checks its own key
--   server-side at its own destination:
--     something is broken  -> Campus Walk's task engine (its own gate)
--     a complaint          -> the grievance spine (its own gate)
--     we need to buy       -> Procurement, gated on procurement.request_create,
--                             which stays TRUE for only procurement_officer /
--                             procurement_manager / store_admin. The chooser
--                             renders an explicit "ask your HOD" line for
--                             everyone else rather than a dead card.
--   So holding this key lets a person ASK. It bypasses nothing.
--
-- SHAPE
--   `custom_roles.permissions` stores FLAT dotted keys ("module.thing.action")
--   in a single jsonb object. `create_missing => true` on jsonb_set is what
--   makes this work for roles that have never carried the key at all — the
--   usual `WHERE permissions ? '<key>'` guard would match zero rows here,
--   because this key is brand new in this PR.
--
-- IDEMPOTENT / REVERSIBLE
--   Re-running changes nothing once the key is already true (see the WHERE).
--   To undo: set '{instasolver.view}' back to 'false' for every row. No data is
--   created or destroyed; no policy, function or grant is altered.

BEGIN;

UPDATE public.custom_roles
SET
  permissions = jsonb_set(
                  coalesce(permissions, '{}'::jsonb),
                  '{instasolver.view}',
                  'true'::jsonb,
                  true   -- create_missing: the key is new, most rows lack it
                ),
  updated_at  = now()
-- Idempotent: a role already holding the key true is left untouched, so a
-- re-run neither rewrites rows nor bumps updated_at.
WHERE (permissions ->> 'instasolver.view') IS DISTINCT FROM 'true';

-- Prove the outcome rather than assume it. A silent UPDATE that matched zero
-- rows looks identical to a successful one, and this repo has been bitten by
-- exactly that shape before (see 20260810100000).
DO $$
DECLARE
  v_total   int;
  v_granted int;
BEGIN
  SELECT count(*) INTO v_total   FROM public.custom_roles;
  SELECT count(*) INTO v_granted FROM public.custom_roles
   WHERE (permissions ->> 'instasolver.view') = 'true';

  RAISE NOTICE 'InstaSolver: % of % role(s) now hold instasolver.view', v_granted, v_total;

  IF v_total > 0 AND v_granted <> v_total THEN
    RAISE EXCEPTION
      'InstaSolver grant is incomplete — % of % roles hold instasolver.view. '
      'Decision I1 requires EVERY role. Check that custom_roles.permissions '
      'still stores FLAT dotted keys (e.g. "instasolver.view") rather than a '
      'nested object; a shape change would make the predicate silently false.',
      v_granted, v_total;
  END IF;
END $$;

COMMIT;
