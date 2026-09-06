-- ============================================================================
-- SCHOOL OF INFLUENCE — access gate + roster privacy (S8)
-- Created: 2026-07-30  (spec: specs/school-of-influence-batches-2026-07-30.md, §7 S8)
-- ============================================================================
-- Decisions implemented here (spec §2):
--   D6  Membership GATES access to the School of Influence programme pages.
--       The gate is PROGRAMME-wide, not batch-wide: batches run in PARALLEL and
--       exist for grouping/reporting (D1), so holding a non-terminal membership
--       in ANY batch of the programme opens the programme.
--   D14 Roster privacy. Staff always see the full roster. A member sees their own
--       batch-mates ONLY while
--       fn_get_policy_bool('soi.roster.visible_to_batchmates', true, cohort_id)
--       is true — read at RUNTIME, per batch, never baked in. NEVER public.
--
-- WHAT THE SPINE ALREADY DOES — AND IS THEREFORE NOT REPEATED HERE
--   20260731040000_cohort_core_spine.sql already ships RLS on cohorts and
--   cohort_memberships. Measured against this section's four requirements:
--     • staff see the full roster  → ALREADY SATISFIED. Its SELECT policies lead
--       with is_super_admin()/is_admin() and otherwise require
--       user_has_permission('cohort.view') AND role_has_institution_access(...).
--       NOTHING IS ADDED for staff.
--     • a non-member reads nothing → ALREADY SATISFIED. Same policy: no
--       cohort.view, no rows.
--     • anon reads nothing         → ALREADY SATISFIED, and verified live rather
--       than assumed. anon holds Supabase's default table-level SELECT grant on
--       BOTH tables, so RLS is the only thing standing between anon and 62
--       membership rows; anon has no EXECUTE on user_has_permission, so the
--       spine's policy hard-denies it. NOTHING IS ADDED for anon.
--     • a MEMBER sees their batch / their batch-mates → NOT SATISFIED, and this
--       is the whole gap. A learner-member holds no cohort.view key, so today
--       they cannot read their own membership row, let alone the batch. Without
--       the two policies below, D6 has nothing to gate ON and D14 is unreachable.
--
--   So this file adds EXACTLY the missing member path: two ADDITIVE permissive
--   SELECT policies. PostgreSQL OR-combines permissive policies for the same
--   command, so these WIDEN the spine's policies rather than fight them — the
--   spine's policies are not dropped, replaced, or edited by this file.
--
-- ⚠ NO `TO public USING (true)` ANYWHERE. That shape defeats RLS even with RLS
--   ON and is how 38 tables / 4,734 rows (9 with names + phone numbers) were
--   served publicly on this project. Both policies below are unqualified (i.e.
--   they apply to every role) but their USING clause is a hard function check
--   that returns FALSE for anon, so "never public" (D14) holds structurally.
--
-- WHY THREE SECURITY DEFINER FUNCTIONS AND NOT INLINE EXISTS(...)
--   A policy ON cohort_memberships whose USING clause SELECTs FROM
--   cohort_memberships is self-referential and raises 42P17 (infinite recursion)
--   the first time anyone reads the table. The membership lookup therefore lives
--   inside SECURITY DEFINER functions, which are not subject to the caller's RLS
--   and so terminate. This is the repo-canonical fix for that failure.
--
-- Every function: STABLE, SET search_path, NULL-safe via COALESCE, and
-- REVOKE EXECUTE FROM anon, PUBLIC in THIS SAME FILE — Supabase's
-- ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function separately
-- from PUBLIC, so both must be revoked or the function ships anon-callable.
--
-- DEPENDS ON PR #2680 (S3, 20260808130000) for cohorts_kind_check to admit
-- 'school_of_influence'. Until that lands, 0 rows can carry that kind, so every
-- object below is inert rather than wrong — it fails CLOSED.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. Rehearsed on prod inside a
-- single Mgmt-API BEGIN..ROLLBACK batch (persona transcript in the PR body), and
-- production re-verified unchanged in a SEPARATE call. This file deliberately
-- carries no BEGIN;/COMMIT; of its own so that wrapping it stays a dry run.
-- ============================================================================

-- ── 1. primitive: is the caller a live member of THIS batch? ──────────────────
-- The one membership lookup every other object here is built from. SECURITY
-- DEFINER purely to break the RLS recursion described above; it returns a
-- boolean and never leaks a row.
--
-- member_ref is compared to auth.uid() directly: PR #2680's batch-service
-- resolves every member to a profiles.id, and in MyJKKN auth.users.id ==
-- profiles.id (1:1), so member_ref IS the caller's uid for their own rows.
--
-- NON-TERMINAL statuses only. 'graduated' and 'removed' are the spine's two
-- terminal membership statuses (lib/services/cohort-core/lifecycle.ts gives them
-- no outgoing transitions), so someone who finished or left a round loses access
-- while invited/enrolled/active/paused keep it.
--
-- ⚠ 'paused' IS INSIDE THE GATE, per this section's written instruction that the
--   gate is "an active (non-terminal) membership". Flagged rather than silently
--   changed: when S7 arms D8's pause (it ships DISABLED, spec §5), pausing will
--   NOT withdraw read access, which is arguably not what "paused" should mean.
--   Deliberately left as the spec states, isolated to this one predicate so S7
--   can tighten it in its own file after a Director ruling. Zero live impact
--   today: 0 School of Influence memberships exist and D8 is off.
--
-- Hard-scoped to kind='school_of_influence' so this can never widen visibility
-- for sf100 / foundations / cdc / trainer / mba_associate cohorts.
CREATE OR REPLACE FUNCTION public.fn_soi_is_batch_member(p_cohort_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT true
    FROM public.cohort_memberships m
    JOIN public.cohorts c ON c.id = m.cohort_id
    WHERE m.cohort_id  = p_cohort_id
      AND c.kind       = 'school_of_influence'
      AND m.member_ref = auth.uid()
      AND m.status NOT IN ('graduated', 'removed')
    LIMIT 1
  ), false);
$$;

COMMENT ON FUNCTION public.fn_soi_is_batch_member(uuid) IS
  'School of Influence D6/D14 primitive: does the calling user hold a '
  'non-terminal membership in this School of Influence batch? SECURITY DEFINER '
  'to break RLS self-recursion on cohort_memberships. False for anon and for '
  'every non-SoI cohort.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_is_batch_member(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_is_batch_member(uuid) TO authenticated;

-- ── 2. D6 — the programme access gate (also the route guard's RPC) ────────────
-- PROGRAMME-wide by design: a member of Batch B may open the programme, because
-- the batches are parallel groups of ONE programme (D1). Batch-scoping this
-- would lock members out of the shared programme pages.
--
-- p_source_event_id identifies the programme, matching the event that is its
-- front door (cohorts.config.source_event_id — the same claim PR #2680 keys its
-- one-batch-per-person index on). NULL means "any School of Influence
-- programme", which is what the route guard passes: the guard's job is
-- module-entry, and there is exactly one programme today. Per-programme pages
-- pass their own event id.
--
-- Read directly off the parent cohorts row rather than off #2680's derived
-- config.soi_programme_key, so this predicate is correct even for a membership
-- written before that trigger existed.
CREATE OR REPLACE FUNCTION public.fn_soi_has_programme_access(
  p_source_event_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT true
    FROM public.cohort_memberships m
    JOIN public.cohorts c ON c.id = m.cohort_id
    WHERE c.kind       = 'school_of_influence'
      AND m.member_ref = auth.uid()
      AND m.status NOT IN ('graduated', 'removed')
      AND (
        p_source_event_id IS NULL
        OR NULLIF(btrim(c.config ->> 'source_event_id'), '') = p_source_event_id::text
      )
    LIMIT 1
  ), false);
$$;

COMMENT ON FUNCTION public.fn_soi_has_programme_access(uuid) IS
  'School of Influence D6: does the calling user hold a non-terminal membership '
  'in ANY batch of this programme (NULL = any SoI programme)? Backs the '
  '/startup-studio/school-of-influence route guard. False for anon.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_has_programme_access(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_has_programme_access(uuid) TO authenticated;

-- ── 3. D14 — may the caller see THIS roster row? ──────────────────────────────
-- Evaluated per membership row by the policy in §5.
--   self       → always. A member must be able to read their own row; that row
--                IS the proof of membership the whole gate rests on, and no
--                config flag may hide it from its owner.
--   batch-mate → only while soi.roster.visible_to_batchmates is true for THIS
--                cohort. Read at runtime through fn_get_policy_bool, so flipping
--                the policy row changes who can see the roster with no deploy
--                and no migration.
--   otherwise  → false. Staff are NOT handled here; the spine's own policy
--                already admits them and OR-combines with this one.
--
-- ⚠ SCOPE NOTE — measured against the LIVE function on prod 2026-07-30, not the
--   repo file, which is stale here (ref feedback_secdef_replace_silently_reverted
--   _money_gate: always read pg_get_functiondef, never assume the checked-in text).
--   The repo copy of fn_get_policy (20260429000002) resolves only
--   institution/global/role/user, and reading only that would wrongly conclude a
--   cohort-scoped row is inert. The LIVE fn_get_policy already carries S1's two
--   cohort branches — `scope_type='cohort' AND scope_id=p_scope_id` (precedence 2)
--   with a `scope_id IS NULL` programme-wide fallback (precedence 5) — and all 15
--   spec §4 rows are live, published and is_active, including
--   soi.roster.visible_to_batchmates = true at cohort scope with a NULL scope_id.
--   Verified by calling it: fn_get_policy_bool(key, FALSE, <uuid>) returns true,
--   i.e. the ROW answered, not the default.
--
--   That resolver change and those 15 rows are applied to PROD but are NOT in any
--   migration file on jicate/main (S1's PR is still in flight). This file
--   therefore does not depend on them: fn_get_policy_bool is called with the
--   spec's own default, true, so a database rebuilt from main's migrations alone
--   still behaves exactly as specified, and per-batch overrides start working the
--   moment S1 merges — with no change here.
CREATE OR REPLACE FUNCTION public.fn_soi_membership_visible_to_me(
  p_cohort_id  uuid,
  p_member_ref uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    -- Own row. Guarded on auth.uid() IS NOT NULL so an anon caller cannot match
    -- a NULL member_ref (member_ref is NOT NULL today, but a NULL = NULL compare
    -- yielding NULL and then COALESCEing is not a safety story worth relying on).
    (auth.uid() IS NOT NULL AND p_member_ref = auth.uid()
       AND public.fn_soi_is_batch_member(p_cohort_id))
    -- Batch-mate, while the batch's roster flag allows it.
    OR (public.fn_soi_is_batch_member(p_cohort_id)
        AND COALESCE(
              public.fn_get_policy_bool(
                'soi.roster.visible_to_batchmates', true, p_cohort_id
              ), true)),
    false);
$$;

COMMENT ON FUNCTION public.fn_soi_membership_visible_to_me(uuid, uuid) IS
  'School of Influence D14: may the caller see this roster row? Own row always; '
  'batch-mates only while fn_get_policy_bool(soi.roster.visible_to_batchmates, '
  'true, cohort_id) is true. Staff are covered by the spine policy, not here. '
  'Never public.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_membership_visible_to_me(uuid, uuid)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_membership_visible_to_me(uuid, uuid)
  TO authenticated;

-- ── 4. D6 layer 1 of 2 (DATA) — a member may read their own batch row ─────────
-- ADDITIVE. The spine's cohorts_select_permission is untouched and still governs
-- staff; this policy ORs in the member path.
--
-- Without it the gate is decorative: a member admitted to the programme pages
-- could not read the batch's own name, dates or capacity, so the page would
-- render empty. Scoped by fn_soi_is_batch_member, which itself requires
-- kind='school_of_influence' — a member of Batch A sees Batch A, never Batch B,
-- and never any other cohort kind.
DROP POLICY IF EXISTS cohorts_soi_member_select ON public.cohorts;
CREATE POLICY cohorts_soi_member_select ON public.cohorts
  FOR SELECT USING (public.fn_soi_is_batch_member(id));

-- ── 5. D14 layer 1 of 2 (DATA) — roster visibility ────────────────────────────
-- ADDITIVE, same reasoning: cohort_memberships_select_permission is untouched
-- and still gives staff the full roster.
DROP POLICY IF EXISTS cohort_memberships_soi_member_select ON public.cohort_memberships;
CREATE POLICY cohort_memberships_soi_member_select ON public.cohort_memberships
  FOR SELECT USING (
    public.fn_soi_membership_visible_to_me(cohort_id, member_ref)
  );

-- Layer 2 of 2 for BOTH decisions is the route guard at
-- app/(routes)/startup-studio/school-of-influence/layout.tsx, which calls
-- fn_soi_has_programme_access via RoutePermissionGuard's fallbackCheck and
-- renders an explicit PermissionError (never a silent redirect — CLAUDE.md
-- rule 27). RLS alone is not a UI; a UI guard alone is not security.
--
-- No SELECT policy is added for cohort_status_events: nothing in this section
-- exposes lifecycle events to members, and the spine already scopes them to
-- staff. Adding one would widen more than D6/D14 ask for.

NOTIFY pgrst, 'reload schema';
