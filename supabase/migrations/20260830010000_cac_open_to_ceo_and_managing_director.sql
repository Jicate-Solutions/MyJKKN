-- ─── CAC: let the CEO and the Managing Director open the council dashboard ───
-- 2026-08-13 — Director decision D1, revised the same day (round 2).
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Director-gated apply, by hand.
--
-- ══ WHAT THIS FIXES, IN PLAIN ENGLISH ════════════════════════════════════════
--
-- THE CEO COULD NOT OPEN THE DASHBOARD BUILT ON THEIR OWN FRAMEWORK.
-- /accreditation/cac — the Cluster Academic Council dashboard — gates on
-- `accreditation.cac.view`. Read live on 2026-08-13, the `ceo` role did not
-- carry that key at all, and `ceo@jkkn.ac.in` is NOT a super admin
-- (is_super_admin = false), so no bypass covered for it. The CEO could see the
-- Accreditation menu and every other body's dashboard, and was refused at the
-- one page that reports the council framework they own. `managing_director`
-- was in the same position. Six roles already held the key —
-- accreditation_officer, coo, hod, principal, registrar, vice_principal — so
-- the two most senior roles in the cluster were the only ones locked out.
--
-- ══ WHAT IT CHANGES — SIX (role, key) PAIRS, AND NOTHING ELSE ════════════════
--
--   ceo                 → accreditation.cac.view                (was ABSENT)
--   ceo                 → accreditation.naac.narrative.view     (was ABSENT)
--   ceo                 → accreditation.naac.narrative.manage   (was ABSENT)
--   managing_director   → accreditation.cac.view                (was ABSENT)
--   managing_director   → accreditation.naac.narrative.view     (was ABSENT)
--   managing_director   → accreditation.naac.narrative.manage   (was ABSENT)
--
-- `accreditation_officer` already holds all three by value. Its row is
-- deliberately NOT touched. The guard in section 2 still asserts its end state,
-- because the thing worth checking is the END STATE, not the rows this file
-- happened to write.
--
-- ══ WHY PRINCIPALS ARE **NOT** GRANTED HERE (Director, 2026-08-13 round 2) ═══
--
-- An earlier draft of this file also granted .manage to `principal`. That was
-- withdrawn deliberately, and the reason is worth recording so nobody adds it
-- back as an obvious omission.
--
-- `user_has_permission()` has FOUR paths, not three. After the super-admin
-- bypass, the multi-role sweep and the legacy profiles.role fallback, it ends:
--
--     RETURN public.fn_handover_grants_key(auth.uid(), permission_name);
--
-- A **Director handover** therefore grants a permission key with no role change
-- at all — scoped to ONE route, revocable, tenant-bound, and chased daily on the
-- Director's Desk if it is forgotten. That is the live precedent, not a theory:
-- eao@jkkn.ac.in holds no role carrying .manage and is not a super admin, yet
-- assigned 14 metric owners on 2026-08-13 — under an accepted handover for
-- route '/accreditation/manage/owners', granted by director@jkkn.ac.in on
-- 2026-08-11.
--
-- The Director's ruling: a permanent role grant fits STANDING cluster
-- accountability (ceo, managing_director), and a handover fits DELEGATED work
-- (principals, one person at a time, revocable). A principal who needs the owner
-- desk is handed it; they are not given it forever by a migration.
--
-- ══ A NOTE ON THE BOTTLENECK THIS DOES AND DOES NOT SOLVE ════════════════════
--
-- `accreditation.naac.narrative.manage` is the key the live RLS on
-- public.accreditation_metric_owners uses for BOTH its USING and its WITH CHECK
-- (policy accred_metric_owners_manage), i.e. it IS the assign-an-owner write.
-- Swept across all active roles on 2026-08-13, exactly one ROLE held it:
-- accreditation_officer. That is a real single-role bottleneck — but it was
-- never a single-PERSON bottleneck, because of the handover path above.
--
-- Measured live 2026-08-13: accreditation_metric_owners holds 14 rows, all
-- created that morning (10:52–11:22), all body-level (metric_code IS NULL),
-- covering 5 of the 8 assessed colleges. Allied Health Sciences, Arts & Science
-- (Aided) and Education have no owner named for any body. **This migration does
-- not assign anybody — it widens who is allowed to.**
--
-- ══ WHY `||` AND NOT `jsonb_set` ═════════════════════════════════════════════
--
-- All six pairs are the ABSENT case, verified by value on prod 2026-08-13:
-- `ceo` and `managing_director` carry none of the three keys at all.
--
-- To be accurate about jsonb_set, because the folklore here is wrong and was
-- repeated into the brief for this change: `jsonb_set(target, path, value)`
-- takes a FOURTH argument, create_if_missing, which DEFAULTS TO TRUE. The
-- three-argument form does create an absent top-level key, so plain
-- `jsonb_set(permissions, '{key}', 'true')` would in fact have granted these
-- correctly. Measured on PostgreSQL 16.14:
--
--     jsonb_set('{"a":true}', '{k}', 'true')          → k = true    (created)
--     jsonb_set('{"a":true}', '{k}', 'true', false)   → k ABSENT    (no-op)
--     jsonb_set('{"k":false}', '{k}', 'true', false)  → k = true
--
-- The real hazard is the FOUR-argument form with `false`, which silently returns
-- the row unchanged for every absent key — here that would be all six pairs
-- quietly ungranted while the migration reported success.
--
-- `||` is used because it is immune to that footgun regardless of who edits this
-- file later, and because it sets all three keys in ONE expression where
-- jsonb_set needs three nested calls. `||` MERGES, so the other keys on these
-- roles (accreditation.view among them) are preserved — verified.
--
-- ══ WHY THE GUARD READS `->>` AND NEVER `?` ══════════════════════════════════
--
-- user_has_permission() tests `(permissions->>key)::boolean = true`. The `?`
-- existence operator returns TRUE for a key stored `false`, so a `?`-based
-- assert passes on a role that still cannot open the page. That is not a
-- hypothetical on this estate: `principal` carries .manage present and
-- explicitly `false` right now, and a `?` check would report it as granted.
-- Section 2 asserts BY VALUE only, against the text 'true', so an explicit
-- `false` and an absent key are both caught and named.
--
-- ══ SCOPING ══════════════════════════════════════════════════════════════════
--
-- The statement below is scoped by an explicit `role_key IN (...)`. No predicate
-- of the shape "every role that already holds X" appears anywhere, so this file
-- is structurally incapable of sweeping in a role nobody reviewed.
--
-- Re-runnable: the UPDATE is idempotent and the guard is a pure read.

-- ══ 1. CEO AND MANAGING DIRECTOR — full CAC access (Director decision D1) ════
--
-- Three keys each. Read + the owner-assignment write:
--
--   accreditation.cac.view                → /accreditation/cac (page gate AND
--                                           the AutoTabNav chip filter, which
--                                           reads the same MENU_PERMISSIONS map)
--   accreditation.naac.narrative.view     → read the owner/narrative tables
--   accreditation.naac.narrative.manage   → name a metric owner
--
-- Both roles are institution_scope = 'all', so both see the whole cluster —
-- which is the point: the council is a cluster body.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'accreditation.cac.view',              true,
         'accreditation.naac.narrative.view',   true,
         'accreditation.naac.narrative.manage', true
       ),
       updated_at = now()
 WHERE role_key IN ('ceo', 'managing_director');

-- ══ 2. GUARD — fails the migration unless the END STATE reads true by value ══
--
-- Asserts the full 3 roles x 3 keys = 9 pair matrix, not merely the 6 pairs this
-- file writes. accreditation_officer is untouched above but is asserted here,
-- because a migration that leaves the estate in the wrong state should fail
-- whether or not it was the thing that broke it.
--
-- `principal` is deliberately ABSENT from this matrix. It is not granted by this
-- file (see the handover note in the header), and asserting it would fail the
-- migration for doing exactly what the Director decided it should do.
--
-- A missing role_key is a FAILURE, never a skip: if a role were renamed, the
-- UPDATE would match zero rows and the per-key read would return NULL, which is
-- a no-op that otherwise looks exactly like success.
--
-- RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only guard stamps zero rows and
-- reads as a clean apply, and Studio hides NOTICE output entirely.

DO $$
DECLARE
  v_role      text;
  v_key       text;
  v_actual    text;
  v_missing   text[] := ARRAY[]::text[];
  v_roles     text[] := ARRAY[
    'ceo',
    'managing_director',
    'accreditation_officer'
  ];
  v_keys      text[] := ARRAY[
    'accreditation.cac.view',
    'accreditation.naac.narrative.view',
    'accreditation.naac.narrative.manage'
  ];
  v_manage_holders int;
BEGIN
  -- 2a. every named role must exist at all, and be reported (not skipped) if not
  FOREACH v_role IN ARRAY v_roles
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = v_role) THEN
      v_missing := v_missing || (v_role || ' :: ROLE DOES NOT EXIST');
      CONTINUE;
    END IF;

    -- 2b. every key must read the TEXT 'true' via ->> (never the ? operator,
    --     which returns TRUE for a key stored false)
    FOREACH v_key IN ARRAY v_keys
    LOOP
      SELECT permissions ->> v_key INTO v_actual
        FROM public.custom_roles
       WHERE role_key = v_role;

      IF v_actual IS DISTINCT FROM 'true' THEN
        v_missing := v_missing
          || (v_role || ' :: ' || v_key || ' = ' || COALESCE(v_actual, 'ABSENT'));
      END IF;
    END LOOP;
  END LOOP;

  -- 2c. an inactive role would carry the key but grant nobody anything, because
  --     user_has_permission() joins through custom_roles on an active assignment.
  --     Report it as a failure rather than shipping a grant that does nothing.
  FOREACH v_role IN ARRAY v_roles
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.custom_roles
       WHERE role_key = v_role AND is_active IS DISTINCT FROM true
    ) THEN
      v_missing := v_missing || (v_role || ' :: ROLE IS NOT ACTIVE');
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'CAC open-up FAILED — % of 9 (role, key) pair(s) do not read true by value: %',
      array_length(v_missing, 1), array_to_string(v_missing, ' | ');
  END IF;

  -- 2d. REPORTED, NOT ENFORCED. Roles outside the three asserted above that
  --     already hold accreditation.cac.view are left exactly as they are, but
  --     they must be visible in the apply log rather than silently inherited.
  --     Expected on 2026-08-13: coo, hod, principal, registrar, vice_principal —
  --     granted by 20260809100100 (Director decision 9, 2026-08-01).
  --
  --     This sweep is deliberately NOT the only check on anything this file
  --     intends to change: all 9 asserted pairs go through the RAISE EXCEPTION
  --     path in 2b above.
  FOR v_role IN
    SELECT role_key FROM public.custom_roles
     WHERE (permissions ->> 'accreditation.cac.view') = 'true'
       AND role_key <> ALL (v_roles)
     ORDER BY role_key
  LOOP
    RAISE NOTICE 'accreditation.cac.view also TRUE on role_key=% (pre-existing, untouched)', v_role;
  END LOOP;

  -- 2e. REPORTED, NOT ENFORCED. The manage key is the assign-an-owner write, so
  --     the count of ROLES holding it is worth reading back after an apply.
  --     Expected to go from 1 to 3. Note this counts roles only — it does NOT
  --     count people holding the key through a Director handover, which is a
  --     separate and equally real path (see the header).
  SELECT count(*) INTO v_manage_holders
    FROM public.custom_roles
   WHERE (permissions ->> 'accreditation.naac.narrative.manage') = 'true';

  RAISE NOTICE 'roles holding accreditation.naac.narrative.manage after this migration: %',
    v_manage_holders;

  RAISE NOTICE 'CAC open-up OK — 3 roles x 3 keys verified by value (6 pairs newly set)';
END $$;
