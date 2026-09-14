-- 20261212120000_instasolver_permission_all_roles.sql
--
-- InstaSolver — grant `instasolver.view` to every role that can stand in front
-- of a leaking tap.
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
-- WHO IS EXCLUDED, AND WHY (the two rows this does NOT grant)
--   `guest`                      — proxy.ts confines this role to /guest before
--                                  any permission check runs, so the key would
--                                  be unreachable decoration on that row.
--   `external_auditor_timeboxed` — a contracted outsider on a clock
--                                  (20260422_audit_workflow_seeds_and_triggers.sql).
--                                  Campus reporting is not their surface, and a
--                                  time-boxed role should not silently accrue
--                                  new doors between audits.
--   Everything else is granted, INCLUDING inactive and system rows. An inactive
--   role is a role somebody may switch back on; if the grant skipped it, the
--   reactivated role would be the one role in the platform silently missing the
--   front door, and nothing would report that. proxy.ts reads `custom_roles`
--   with `.eq('is_active', true)`, so the key sitting on a dormant row grants
--   nothing until somebody deliberately reactivates that role.
--   `lead_auditor` IS granted — an internal auditor is a team member with a
--   login, which is exactly who I1 names.
--
-- SHAPE — AND THE TEXT-vs-JSONB TRAP THIS MIGRATION WALKS AROUND
--   `custom_roles.permissions` stores FLAT dotted keys ("module.thing.action")
--   in a single jsonb object. `create_missing => true` on jsonb_set is what
--   makes this work for roles that have never carried the key at all — the
--   usual `WHERE permissions ? '<key>'` guard would match zero rows here,
--   because this key is brand new in this PR.
--
--   The predicate compares JSONB, not TEXT, on purpose. `permissions ->> 'k'`
--   yields the TEXT 'true' for BOTH the boolean `true` and the string `"true"`.
--   A role storing the string would therefore be SKIPPED by an `->>`-based
--   UPDATE (it "already looks granted") while every consumer of the key reads it
--   as NOT granted — `userPermissions[key] === true` in lib/auth/route-matcher.ts
--   is a strict boolean comparison, and `user_has_permission()` is no looser.
--   Proven on a scratch PG16: with `permissions = '{"instasolver.view":"true"}'`,
--   `->> = 'true'` is TRUE while `-> = 'true'::jsonb` is FALSE. The earlier
--   predicate skipped that row and the earlier verifier counted it, so the
--   migration would have reported a complete grant over a role that could not
--   open the door. Hence:
--     jsonb_typeof(...) IS DISTINCT FROM 'boolean'  -> repair string/number/null
--     (...) <> 'true'::jsonb                        -> repair boolean false
--   and the verifier counts only a real `'true'::jsonb`.
--
-- NO TRANSACTION CONTROL IN THIS FILE
--   Both appliers (this repo's migration applier and `supabase db push`) wrap
--   each file in a transaction of their own. The applier's dry run is
--   BEGIN … <file> … ROLLBACK, so a `COMMIT;` inside the file would end that
--   outer transaction: the "dry" run would commit for real and the trailing
--   ROLLBACK would have nothing left to undo. This file therefore carries no
--   BEGIN/COMMIT of its own.
--
-- IDEMPOTENT / REVERSIBLE
--   Re-running changes nothing once the key is already boolean true (see the
--   WHERE). To undo: set '{instasolver.view}' back to 'false' for every row. No
--   data is created or destroyed; no policy, function or grant is altered.

UPDATE public.custom_roles
SET
  permissions = jsonb_set(
                  coalesce(permissions, '{}'::jsonb),
                  '{instasolver.view}',
                  'true'::jsonb,
                  true   -- create_missing: the key is new, most rows lack it
                ),
  updated_at  = now()
-- Idempotent: a role already holding the key as boolean true is left untouched,
-- so a re-run neither rewrites rows nor bumps updated_at. A role holding the
-- STRING "true" is deliberately NOT left untouched — that row is broken, and
-- this is the migration that repairs it.
WHERE role_key NOT IN ('guest', 'external_auditor_timeboxed')
  AND (
        jsonb_typeof(permissions -> 'instasolver.view') IS DISTINCT FROM 'boolean'
        OR (permissions -> 'instasolver.view') <> 'true'::jsonb
      );

-- Prove the outcome rather than assume it. A silent UPDATE that matched zero
-- rows looks identical to a successful one, and this repo has been bitten by
-- exactly that shape before (see 20260810100000). The verifier applies the SAME
-- exclusion list as the UPDATE, so the invariant asserted is "every role that
-- should hold the key holds it" — not "every row in the table".
DO $$
DECLARE
  v_eligible int;
  v_granted  int;
BEGIN
  SELECT count(*) INTO v_eligible
    FROM public.custom_roles
   WHERE role_key NOT IN ('guest', 'external_auditor_timeboxed');

  SELECT count(*) INTO v_granted
    FROM public.custom_roles
   WHERE role_key NOT IN ('guest', 'external_auditor_timeboxed')
     AND (permissions -> 'instasolver.view') = 'true'::jsonb;

  RAISE NOTICE 'InstaSolver: % of % eligible role(s) now hold instasolver.view (guest and external_auditor_timeboxed excluded by design)',
    v_granted, v_eligible;

  IF v_eligible > 0 AND v_granted <> v_eligible THEN
    RAISE EXCEPTION
      'InstaSolver grant is incomplete — % of % eligible roles hold instasolver.view. '
      'Decision I1 requires every role except guest and external_auditor_timeboxed. '
      'Check that custom_roles.permissions still stores FLAT dotted keys (e.g. '
      '"instasolver.view") rather than a nested object; a shape change would make '
      'the predicate silently false.',
      v_granted, v_eligible;
  END IF;
END $$;
