-- ─── CAC: let the CEO open it, and let principals name owners in their own college ───
-- 2026-08-13 — Director decisions D1 and D2, taken 2026-08-13 by plain-English interview.
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Director-gated apply, by hand.
--
-- ══ WHAT THIS FIXES, IN PLAIN ENGLISH ════════════════════════════════════════
--
-- 1. THE CEO COULD NOT OPEN THE DASHBOARD BUILT ON THEIR OWN FRAMEWORK.
--    /accreditation/cac — the Cluster Academic Council dashboard — gates on
--    `accreditation.cac.view`. Read live on 2026-08-13, the `ceo` role did not
--    carry that key at all, and `ceo@jkkn.ac.in` is NOT a super admin
--    (is_super_admin = false), so no bypass covered for it. The CEO could see
--    the Accreditation menu item and every other body's dashboard, and was
--    refused at the one page that reports the council framework they own.
--    `managing_director` was in the same position. Six roles already held the
--    key — accreditation_officer, coo, hod, principal, registrar,
--    vice_principal — so the two most senior roles in the cluster were the
--    only ones locked out of it.
--
-- 2. EXACTLY ONE ROLE COULD NAME A METRIC OWNER.
--    `accreditation.naac.narrative.manage` is the key the live RLS on
--    public.accreditation_metric_owners uses for BOTH its USING and its
--    WITH CHECK (policy accred_metric_owners_manage), i.e. it IS the
--    assign-an-owner write. Swept across all 90 active roles on 2026-08-13,
--    exactly one role held it: accreditation_officer. Assigning ownership of
--    an accreditation body was therefore a single-person bottleneck for the
--    whole 14-institution cluster.
--
--    Measured the same day: accreditation_metric_owners holds 11 rows, and
--    all 11 were created in a single sitting that morning (10:52–11:04),
--    covering 4 of the 14 active institutions. Ten institutions have no owner
--    named for any body. This migration does not assign anybody — it widens
--    who is allowed to.
--
-- ══ WHAT IT CHANGES — SEVEN (role, key) PAIRS, AND NOTHING ELSE ══════════════
--
--   ceo                 → accreditation.cac.view                (was ABSENT)
--   ceo                 → accreditation.naac.narrative.view     (was ABSENT)
--   ceo                 → accreditation.naac.narrative.manage   (was ABSENT)
--   managing_director   → accreditation.cac.view                (was ABSENT)
--   managing_director   → accreditation.naac.narrative.view     (was ABSENT)
--   managing_director   → accreditation.naac.narrative.manage   (was ABSENT)
--   principal           → accreditation.naac.narrative.manage   (was false)
--
-- `principal` ALREADY held accreditation.cac.view and .naac.narrative.view as
-- true, so those are not re-granted here — but the guard in section 3 still
-- asserts them, because the thing worth checking is the END STATE, not the
-- rows this file happened to touch.
--
-- `accreditation_officer` already holds all three by value. Its row is
-- deliberately NOT touched. The guard still asserts its end state.
--
-- ══ A PRINCIPAL GAINS NO CROSS-COLLEGE POWER ═════════════════════════════════
--
-- accred_metric_owners_manage reads, verbatim from the live catalog:
--
--     is_super_admin()
--     OR (user_has_permission('accreditation.naac.narrative.manage')
--         AND role_has_institution_access(institution_id))
--
-- The second arm is an AND. `principal` is institution_scope = 'own' (read
-- live 2026-08-13), so role_has_institution_access() already confines a
-- principal to their own college plus any explicit user_institution_access
-- grant. Handing them the manage key lets a principal name owners INSIDE
-- their own college and nowhere else. That containment is pre-existing RLS;
-- this migration adds nothing to it and removes nothing from it.
--
-- `ceo`, `managing_director` and `accreditation_officer` are institution_scope
-- = 'all', which is the intent for cluster-level roles: the council is a
-- cluster body.
--
-- ══ WHY `||` AND NOT `jsonb_set` ═════════════════════════════════════════════
--
-- custom_roles.permissions is jsonb and these roles are a genuine MIX, verified
-- by value on prod 2026-08-13:
--
--     ceo                → all three keys ABSENT (no key present at all)
--     managing_director  → all three keys ABSENT
--     principal          → .manage present and explicitly `false`
--
-- SIX of the seven pairs are therefore the ABSENT case and one is the
-- explicitly-false case, so whatever is used has to handle both.
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
-- The real hazard is the FOUR-argument form with `false`, which silently
-- returns the row unchanged for every absent key — here that would be six of
-- the seven pairs quietly ungranted while the migration reported success.
--
-- `||` is used because it is immune to that footgun regardless of who edits
-- this file later, and because it sets all three keys in ONE expression where
-- jsonb_set needs three nested calls. Both operators return NULL if the input
-- jsonb is NULL, so neither is safer on that count; permissions is NOT NULL
-- DEFAULT '{}' so the case does not arise. `||` MERGES, so the other keys on
-- these roles (accreditation.view among them) are preserved — verified.
--
-- ══ WHY THE GUARD READS `->>` AND NEVER `?` ══════════════════════════════════
--
-- user_has_permission() tests `(permissions->>key)::boolean = true`. The `?`
-- existence operator returns TRUE for a key stored `false` — and principal's
-- .manage key is stored exactly that way right now. A `?`-based assert would
-- report principal as already granted while the principal still could not
-- assign an owner. Section 3 asserts BY VALUE only, against the text 'true',
-- so an explicit `false` and an absent key are both caught and named.
--
-- ══ SCOPING ══════════════════════════════════════════════════════════════════
--
-- Every statement below is scoped by an explicit `role_key IN (...)`. No
-- predicate of the shape "every role that already holds X" appears anywhere, so
-- this file is structurally incapable of sweeping in a role nobody reviewed.
--
-- Re-runnable: both UPDATEs are idempotent and the guard is a pure read.

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
-- which is the point: the council reports across all 14 institutions.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'accreditation.cac.view',              true,
         'accreditation.naac.narrative.view',   true,
         'accreditation.naac.narrative.manage', true
       ),
       updated_at = now()
 WHERE role_key IN ('ceo', 'managing_director');

-- ══ 2. PRINCIPAL — may also assign metric owners (Director decision D2) ══════
--
-- One key only. principal already holds accreditation.cac.view and
-- accreditation.naac.narrative.view as true; only .manage was false.
--
-- This is the decision that unblocks the bottleneck described at the top: with
-- it, each college's principal can name owners for their own college instead of
-- every assignment in the cluster queueing behind the accreditation officer.
-- institution_scope = 'own' keeps each principal inside their own college.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'accreditation.naac.narrative.manage', true
       ),
       updated_at = now()
 WHERE role_key = 'principal';

-- ══ 3. GUARD — fails the migration unless the END STATE reads true by value ══
--
-- Asserts the full 4 roles x 3 keys = 12 pair matrix, not merely the 7 pairs
-- this file writes. accreditation_officer is untouched above but is asserted
-- here, because a migration that leaves the estate in the wrong state should
-- fail whether or not it was the thing that broke it.
--
-- A missing role_key is a FAILURE, never a skip: if a role were renamed, the
-- UPDATE would match zero rows and the per-key read would return NULL, which is
-- a no-op that otherwise looks exactly like success.
--
-- RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only guard stamps zero rows
-- and reads as a clean apply, and Studio hides NOTICE output entirely.

DO $$
DECLARE
  v_role      text;
  v_key       text;
  v_actual    text;
  v_missing   text[] := ARRAY[]::text[];
  v_roles     text[] := ARRAY[
    'ceo',
    'managing_director',
    'principal',
    'accreditation_officer'
  ];
  v_keys      text[] := ARRAY[
    'accreditation.cac.view',
    'accreditation.naac.narrative.view',
    'accreditation.naac.narrative.manage'
  ];
  v_manage_holders int;
BEGIN
  -- 3a. every named role must exist at all, and be reported (not skipped) if not
  FOREACH v_role IN ARRAY v_roles
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = v_role) THEN
      v_missing := v_missing || (v_role || ' :: ROLE DOES NOT EXIST');
      CONTINUE;
    END IF;

    -- 3b. every key must read the TEXT 'true' via ->> (never the ? operator,
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

  -- 3c. an inactive role would carry the key but grant nobody anything, because
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
      'CAC open-up FAILED — % of 12 (role, key) pair(s) do not read true by value: %',
      array_length(v_missing, 1), array_to_string(v_missing, ' | ');
  END IF;

  -- 3d. REPORTED, NOT ENFORCED. Roles outside the four reviewed above that
  --     already hold accreditation.cac.view are left exactly as they are, but
  --     they must be visible in the apply log rather than silently inherited.
  --     Expected on 2026-08-13: coo, hod, registrar, vice_principal — granted
  --     by 20260809100100 (Director decision 9, 2026-08-01).
  --
  --     This sweep is deliberately NOT the only check on anything this file
  --     intends to change: all 12 intended pairs go through the RAISE EXCEPTION
  --     path in 3b above.
  FOR v_role IN
    SELECT role_key FROM public.custom_roles
     WHERE (permissions ->> 'accreditation.cac.view') = 'true'
       AND role_key <> ALL (v_roles)
     ORDER BY role_key
  LOOP
    RAISE NOTICE 'accreditation.cac.view also TRUE on role_key=% (pre-existing, untouched)', v_role;
  END LOOP;

  -- 3e. REPORTED, NOT ENFORCED. The manage key is the assign-an-owner write, so
  --     the count of roles holding it is the number worth reading back after an
  --     apply. Expected to go from 1 to 4.
  SELECT count(*) INTO v_manage_holders
    FROM public.custom_roles
   WHERE (permissions ->> 'accreditation.naac.narrative.manage') = 'true';

  RAISE NOTICE 'roles holding accreditation.naac.narrative.manage after this migration: %',
    v_manage_holders;

  RAISE NOTICE 'CAC open-up OK — 4 roles x 3 keys verified by value (7 pairs newly set)';
END $$;
