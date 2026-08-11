-- ─── Accreditation: open the quality framework to the people accountable for it ──
-- 2026-08-02 — Director decision 9 (2026-08-01), role keys confirmed 2026-08-02.
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Director-gated apply, by hand.
--
-- ONE INTENT: the accreditation module is currently held by the `ceo` role
-- alone. `/accreditation/cac` — the Cluster Academic Council dashboard that
-- shipped 2026-08-01 — gates on `accreditation.cac.view`, which is TRUE on zero
-- roles, so the only people who can open it are the 14 super admins (via the
-- is_super_admin() bypass, not via a grant). The Director's decision is that the
-- IQAC, principals and HODs can open it. This file grants the read half to the
-- five roles the Director named, and the narrative-owner WRITE key to IQAC only.
--
-- GRANTS NOTHING TO ANY OTHER ROLE. Every statement below is scoped by an
-- explicit `role_key IN (...)`; no predicate is written as a rule ("every role
-- holding X") that could sweep in a role nobody reviewed.
--
-- ══ WHY `||` AND NOT `jsonb_set` ═════════════════════════════════════════════
-- custom_roles.permissions is jsonb, and for these keys the roles are a MIX:
-- some carry the key explicitly `false`, others do not carry it at all.
-- `jsonb_set(permissions, '{key}', 'true')` without create_missing DOES NOTHING
-- on the absent case and returns the row unchanged — a silent no-op that would
-- leave half the intended grant unmade while the migration reported success.
-- `permissions || jsonb_build_object(...)` sets the key in both cases.
--
-- ══ WHY THE GUARD READS `->>` AND NEVER `?` ══════════════════════════════════
-- user_has_permission() tests `(permissions->>key)::boolean = true`. The `?`
-- existence operator returns TRUE for a key stored `false`, so a `?`-based
-- assert would pass on a role that still cannot open the page. That exact
-- misreading produced a false all-clear on this repo before. Section 3 asserts
-- BY VALUE only.
--
-- Re-runnable: the UPDATEs are idempotent and the guard is a pure read.

-- ══ 1. READ ACCESS — the five accountable roles ══════════════════════════════
--
--   accreditation_officer  IQAC coordinator — owns the framework day to day
--   principal              signs off on their college's submission
--   hod                    confirms their department's metrics
--   registrar              custodian of the records the metrics are drawn from
--   coo                    cluster-level operations
--
-- Six read keys. `accreditation.view` is the module landing (MENU_PERMISSIONS
-- '/accreditation'); the other five open one dashboard each. Read keys only —
-- none of these six admits a write anywhere:
--
--   accreditation.view                    → /accreditation
--   accreditation.metrics.view            → /accreditation/iqac  (107-row master framework)
--   accreditation.coverage.view           → /accreditation/coverage
--   accreditation.cac.view                → /accreditation/cac
--   accreditation.evidence.view           → quality_evidence_mappings qem_select
--   accreditation.naac.narrative.view     → /accreditation/naac/narratives

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'accreditation.view',                 true,
         'accreditation.metrics.view',         true,
         'accreditation.coverage.view',        true,
         'accreditation.cac.view',             true,
         'accreditation.evidence.view',        true,
         'accreditation.naac.narrative.view',  true
       ),
       updated_at = now()
 WHERE role_key IN ('accreditation_officer', 'principal', 'hod', 'registrar', 'coo');

-- ══ 2. WRITE — narrative owner assignment, IQAC ONLY ═════════════════════════
--
-- `accreditation.naac.narrative.manage` is the key the live RLS on
-- public.accreditation_metric_owners uses for BOTH its USING and WITH CHECK
-- (policy accred_metric_owners_manage), i.e. it is the assign-an-owner write.
-- Assigning who owns a criterion narrative is the IQAC's job. Principals and
-- HODs CONFIRM what they are given; they take the `.view` key in section 1 and
-- deliberately not this one. Granting it to them would let a department
-- reassign ownership of another department's criterion.
--
-- Note this key is also the delivery list for the narrative escalation reminder
-- (20260727130000_accreditation_narrative_reminders_escalate_to_iqac): holders
-- receive the escalation. Scoping it to IQAC keeps that notification aimed at
-- the people who can act on it.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'accreditation.naac.narrative.manage', true
       ),
       updated_at = now()
 WHERE role_key = 'accreditation_officer';

-- ══ 3. GUARD — fails the migration unless every pair reads 'true' BY VALUE ════
--
-- Also fails if a named role_key does not exist: a missing role is reported,
-- never skipped. A silently-skipped role is exactly the outcome this migration
-- exists to prevent.

DO $$
DECLARE
  v_role   text;
  v_key    text;
  v_actual text;
  v_missing text[] := ARRAY[]::text[];
  v_read_keys  text[] := ARRAY[
    'accreditation.view',
    'accreditation.metrics.view',
    'accreditation.coverage.view',
    'accreditation.cac.view',
    'accreditation.evidence.view',
    'accreditation.naac.narrative.view'
  ];
BEGIN
  -- 3a. every read role exists at all
  FOREACH v_role IN ARRAY ARRAY['accreditation_officer','principal','hod','registrar','coo']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = v_role) THEN
      v_missing := v_missing || (v_role || ' :: ROLE DOES NOT EXIST');
      CONTINUE;
    END IF;

    -- 3b. every read key reads the TEXT 'true' via ->> (never the ? operator)
    FOREACH v_key IN ARRAY v_read_keys
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

  -- 3c. the IQAC-only write key
  SELECT permissions ->> 'accreditation.naac.narrative.manage' INTO v_actual
    FROM public.custom_roles
   WHERE role_key = 'accreditation_officer';

  IF v_actual IS DISTINCT FROM 'true' THEN
    v_missing := v_missing
      || ('accreditation_officer :: accreditation.naac.narrative.manage = '
          || COALESCE(v_actual, 'ABSENT'));
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'accreditation widen FAILED — % pair(s) do not read true by value: %',
      array_length(v_missing, 1), array_to_string(v_missing, ' | ');
  END IF;

  -- 3d. nobody outside the five named roles picked up the CAC key here.
  --     Reported, not enforced as a grant: pre-existing holders (if any) are
  --     left alone, but they must be visible in the apply log.
  FOR v_role IN
    SELECT role_key FROM public.custom_roles
     WHERE (permissions ->> 'accreditation.cac.view') = 'true'
       AND role_key NOT IN ('accreditation_officer','principal','hod','registrar','coo')
     ORDER BY role_key
  LOOP
    RAISE NOTICE 'accreditation.cac.view also TRUE on role_key=% (pre-existing, untouched)', v_role;
  END LOOP;

  RAISE NOTICE 'accreditation widen OK — 5 roles x 6 read keys + 1 IQAC write key verified by value';
END $$;
