-- Cross-institution store access for IMS, scoped to IMS only.
--
-- WHY
-- Until now "which IMS data may I see" was derived from exactly one value:
-- profiles.institution_id. A user whose home institution is A therefore could
-- never work in a store belonging to institution B, even when the business
-- genuinely needs it (a Jicate Solutions staff member operating the JKKN
-- Pharmacy store).
--
-- WHY NOT user_institution_access
-- The platform already has a cross-institution grant table
-- (user_institution_access + user_has_institution_access()), but it is
-- organisation-wide, not IMS-scoped: 782 policies across 329 NON-IMS tables
-- consult it, versus 2 IMS policies. Its grantees today are ceo@/coo@/
-- registrar@/eao@. Reusing it to fix an inventory problem would silently hand
-- the grantee HR, admissions, exam and hostel data for that institution.
-- IMS therefore gets its own grant table, which nothing outside IMS reads.
--
-- SAFETY PROPERTY
-- ims_accessible_institution_ids() returns exactly {own institution} for any
-- user with no grant rows — i.e. byte-for-byte today's behaviour for every
-- existing user. Only the presence of a grant row widens anything.
--
-- APPLIED 2026-07-28 to project kvizhngldtiuufknvehv (62 policies rewritten,
-- verified against a pre-change snapshot: 0 policies dropped, 0 role bypasses
-- lost, 0 expression differences beyond the intended substitution).
--
-- Grants themselves are DATA, not schema — no ims_user_store_grants rows are
-- seeded here. A grant is a decision about one person, so it belongs in the
-- admin UI (Users -> edit -> "Additional IMS Stores"), not in every environment.

BEGIN;

-- 1. The grant table. Store-level, because "operate this store" is the unit the
--    business actually thinks in; the institution is derived from the store.
CREATE TABLE IF NOT EXISTS public.ims_user_store_grants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id   uuid NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
  is_active  boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ims_user_store_grants_unique UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_ims_user_store_grants_user
  ON public.ims_user_store_grants (user_id)
  WHERE is_active;

COMMENT ON TABLE public.ims_user_store_grants IS
  'Extra IMS stores a user may operate beyond their own institution''s stores. '
  'Read ONLY by ims_accessible_institution_ids() and the IMS store switcher — '
  'deliberately not wired into user_has_institution_access(), so a grant here '
  'never widens access in any non-IMS module.';

ALTER TABLE public.ims_user_store_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ims_user_store_grants_select ON public.ims_user_store_grants;
CREATE POLICY ims_user_store_grants_select ON public.ims_user_store_grants
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR public.get_current_user_role() = 'super_admin'
  );

-- Writes are super-admin only: a grant crosses an institution boundary, which is
-- a stricter bar than the "super_admin OR administrator" that guards ordinary
-- profile edits in PATCH /api/users/[id].
DROP POLICY IF EXISTS ims_user_store_grants_insert ON public.ims_user_store_grants;
CREATE POLICY ims_user_store_grants_insert ON public.ims_user_store_grants
  FOR INSERT WITH CHECK (public.get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS ims_user_store_grants_update ON public.ims_user_store_grants;
CREATE POLICY ims_user_store_grants_update ON public.ims_user_store_grants
  FOR UPDATE USING (public.get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS ims_user_store_grants_delete ON public.ims_user_store_grants;
CREATE POLICY ims_user_store_grants_delete ON public.ims_user_store_grants
  FOR DELETE USING (public.get_current_user_role() = 'super_admin');

-- 2. The single source of truth for IMS institution scope.
--
--    RETURNS SETOF (not uuid[]) so the policies can say `institution_id IN
--    (SELECT ...)`: Postgres turns that into a hashed subplan evaluated ONCE per
--    query. A bare STABLE function call inside a qual risks being re-evaluated
--    per row, on every IMS table.
--
--    SECURITY DEFINER so it reads profiles/ims_user_store_grants without
--    re-entering RLS (the expression it replaces read profiles as the caller).
CREATE OR REPLACE FUNCTION public.ims_accessible_institution_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p.institution_id
    FROM profiles p
   WHERE p.id = (SELECT auth.uid())
     AND p.institution_id IS NOT NULL
  UNION
  SELECT s.institution_id
    FROM ims_user_store_grants g
    JOIN ims_stores s ON s.id = g.store_id
   WHERE g.user_id = (SELECT auth.uid())
     AND g.is_active
     AND s.is_active
     AND s.institution_id IS NOT NULL;
$fn$;

COMMENT ON FUNCTION public.ims_accessible_institution_ids() IS
  'Institutions whose IMS data the current user may touch: their own, plus the '
  'institutions of any active ims_user_store_grants rows. Returns exactly one '
  'row (the home institution) for users with no grants.';

REVOKE ALL ON FUNCTION public.ims_accessible_institution_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.ims_accessible_institution_ids() TO authenticated, service_role;

-- 3. Durable snapshot of every IMS policy BEFORE the rewrite.
--    Doubles as the rollback source: each row carries the original USING /
--    WITH CHECK expression verbatim.
CREATE TABLE IF NOT EXISTS public.ims_rls_policy_backup_20260728 AS
SELECT tablename, policyname, cmd, permissive, roles, qual, with_check, now() AS captured_at
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename LIKE 'ims\_%';

-- 4. Rewrite every institution-scoped IMS policy to consult the helper.
--
--    Done by regex over the rendered expression rather than by hand-retyping 62
--    policies: that preserves each policy's role bypass verbatim (both the
--    plain 'super_admin' form and the ARRAY['super_admin','store_admin'] form
--    used by ims_items UPDATE/DELETE) and the EXISTS-join shapes used by
--    ims_grn_items, ims_sale_items, ims_shifts, ims_unit_conversions,
--    ims_upi_qr_payments and ims_sale_number_counters.
--
--    Only two rendered shapes of the subquery exist in this database:
--      ( SELECT profiles.institution_id FROM profiles WHERE (profiles.id = auth.uid()))
--      ( SELECT profiles.institution_id FROM profiles WHERE (profiles.id = ( SELECT auth.uid() AS uid)))
--    Both are matched below; anything else aborts the migration.
DO $rewrite$
DECLARE
  r        record;
  new_expr text;
  n        int := 0;
  leftover int;
  applied  int;
  pat CONSTANT text :=
    '= \( SELECT profiles\.institution_id\s+FROM profiles\s+WHERE \(profiles\.id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\))\)\)';
  rep CONSTANT text := 'IN ( SELECT public.ims_accessible_institution_ids())';
BEGIN
  -- Iterate the snapshot, not pg_policies: ALTER POLICY mutates pg_policy and
  -- would pull the catalogue out from under an open scan.
  FOR r IN
    SELECT tablename, policyname, qual, with_check
      FROM public.ims_rls_policy_backup_20260728
     WHERE (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%profiles.institution_id%'
     ORDER BY tablename, policyname
  LOOP
    IF r.qual IS NOT NULL THEN
      new_expr := regexp_replace(r.qual, pat, rep, 'g');
      IF new_expr = r.qual THEN
        RAISE EXCEPTION 'Unrecognised USING shape on %.% — aborting: %',
          r.tablename, r.policyname, r.qual;
      END IF;
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                     r.policyname, r.tablename, new_expr);
    ELSE
      new_expr := regexp_replace(r.with_check, pat, rep, 'g');
      IF new_expr = r.with_check THEN
        RAISE EXCEPTION 'Unrecognised WITH CHECK shape on %.% — aborting: %',
          r.tablename, r.policyname, r.with_check;
      END IF;
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                     r.policyname, r.tablename, new_expr);
    END IF;
    n := n + 1;
  END LOOP;

  -- Deliberately NOT asserting a fixed count here. When this ran against the
  -- live database on 2026-07-28 it rewrote exactly 62 policies, but hard-coding
  -- 62 would make a fresh `db reset` fail the day any earlier migration adds or
  -- removes an IMS policy. The two assertions below capture the property that
  -- actually matters and hold at any count.

  -- No IMS policy may still resolve scope from profiles.institution_id...
  SELECT count(*) INTO leftover
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename LIKE 'ims\_%'
     AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%profiles.institution_id%';
  IF leftover <> 0 THEN
    RAISE EXCEPTION '% IMS policies still reference profiles.institution_id', leftover;
  END IF;

  -- ...and the institution-scoped ones must now all go through the helper.
  SELECT count(*) INTO applied
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename LIKE 'ims\_%'
     AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%ims_accessible_institution_ids%';
  IF applied = 0 THEN
    RAISE EXCEPTION 'No IMS policy ended up on ims_accessible_institution_ids()';
  END IF;

  RAISE NOTICE 'Rewrote % IMS policies onto ims_accessible_institution_ids() (% now on the helper)',
    n, applied;
END
$rewrite$;

-- 5. Guard against a NON-IMS policy ever being caught by this change. Nothing
--    outside IMS should reference the helper or the grant table.
DO $guard$
DECLARE leaked int;
BEGIN
  SELECT count(*) INTO leaked
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename NOT LIKE 'ims\_%'
     AND (coalesce(qual, '') || coalesce(with_check, ''))
         LIKE '%ims_accessible_institution_ids%';
  IF leaked <> 0 THEN
    RAISE EXCEPTION 'IMS helper leaked into % non-IMS policies', leaked;
  END IF;
END
$guard$;

COMMIT;
