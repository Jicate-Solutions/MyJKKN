-- Updated: 2026-07-14 - Learners Council: executive-only publish/configure gates
--
-- Context
-- -------
-- The Learners Council is ONE body across all JKKN institutions. Its office bearers
-- (President / Vice President / Secretary / Treasurer, i.e. lc_positions.category =
-- 'executive') are LC-wide posts: institution_id IS NULL, max_holders = 1 each.
--
-- Two defects this migration closes:
--
-- 1. lc_od_approval_chains: UPDATE was gated on `created_by = auth.uid()`, so only the
--    person who happened to create a chain could edit or deactivate it. The Secretary
--    could not touch the President's chain. INSERT was gated only on `created_by =
--    auth.uid()`, so ANY authenticated user (incl. a non-LC learner) could create an OD
--    approval chain. Both are replaced with an executive/super-admin gate.
--
-- 2. lc_announcements: UPDATE allowed ANY active lc_member to update ANY announcement,
--    including flipping status to 'published'. INSERT checked only `created_by`, so a
--    member could POST a row with status='published' directly and bypass review entirely.
--    Policy is now: any LC member may DRAFT; only executives (or a super admin) may
--    publish. Enforced in the database, not just in the UI.
--
-- Deliberate non-use of is_admin(): access here is granted to LC office bearers and
-- super admins ONLY, per an explicit product decision. is_admin() would additionally
-- admit hardcoded staff roles (admin/staff/administrator), which is not intended and is
-- the known cross-tenant bypass pattern.

-- ============================================================================
-- 1. HELPERS
-- ============================================================================

-- Is the caller an LC office bearer? (President / Vice President / Secretary / Treasurer)
CREATE OR REPLACE FUNCTION public.fn_is_lc_executive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM lc_members m
    JOIN lc_positions p ON p.id = m.position_id
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'
      AND p.category = 'executive'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_lc_executive() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_lc_executive() TO authenticated;

-- Is the caller any active Learners Council member? (any position, any institution)
CREATE OR REPLACE FUNCTION public.fn_is_lc_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM lc_members m
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_lc_member() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_lc_member() TO authenticated;

-- ============================================================================
-- 2. lc_od_approval_chains
-- ============================================================================

-- SELECT stays permissive (USING true) ON PURPOSE. LCODService.createODRequest() reads
-- this table with the requesting learner's own session to auto-assign a chain by
-- institution. Restricting SELECT here would break OD submission for every student.
-- Chain rows hold no personal data (name, event scope, approver role labels), and
-- visibility of the chains PAGE is gated in the app layer to LC members.

DROP POLICY IF EXISTS lc_od_chains_insert ON lc_od_approval_chains;
CREATE POLICY lc_od_chains_insert ON lc_od_approval_chains
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (is_super_admin() OR fn_is_lc_executive())
);

DROP POLICY IF EXISTS lc_od_chains_update ON lc_od_approval_chains;
CREATE POLICY lc_od_chains_update ON lc_od_approval_chains
FOR UPDATE TO authenticated
USING      (is_super_admin() OR fn_is_lc_executive())
WITH CHECK (is_super_admin() OR fn_is_lc_executive());

-- Note: deletion of a chain is a SOFT delete (is_active = false) performed via UPDATE,
-- so it is covered by the UPDATE policy above. No DELETE policy is granted, which keeps
-- hard deletes denied for everyone (RLS default-deny) and preserves chain history.

-- ============================================================================
-- 3. lc_announcements
-- ============================================================================

-- Executives must be able to SEE other members' drafts in order to publish them.
-- Without this, the "any member drafts -> an executive submits" workflow is impossible.
DROP POLICY IF EXISTS lc_announcements_select ON lc_announcements;
CREATE POLICY lc_announcements_select ON lc_announcements
FOR SELECT TO authenticated
USING (
  status::text = 'published'
  OR created_by = auth.uid()
  OR is_super_admin()
  OR fn_is_lc_executive()
);

-- Anyone may create a DRAFT. Creating an already-published row is executives only.
DROP POLICY IF EXISTS lc_announcements_insert ON lc_announcements;
CREATE POLICY lc_announcements_insert ON lc_announcements
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    status::text = 'draft'
    OR is_super_admin()
    OR fn_is_lc_executive()
  )
);

-- Authors may edit their own announcement; executives may edit any.
-- The draft -> published transition itself is guarded by the trigger below, because a
-- WITH CHECK expression cannot distinguish "editing my draft" from "publishing my draft".
DROP POLICY IF EXISTS lc_announcements_update ON lc_announcements;
CREATE POLICY lc_announcements_update ON lc_announcements
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR is_super_admin()
  OR fn_is_lc_executive()
)
WITH CHECK (
  created_by = auth.uid()
  OR is_super_admin()
  OR fn_is_lc_executive()
);

-- ============================================================================
-- 4. PUBLISH GUARD + PROVENANCE STAMP
-- ============================================================================

-- Enforces "only LC executives (or a super admin) may submit an announcement", and
-- stamps who actually did it -- reviewed_by/published_at are NOT trusted from the client
-- (the previous publish path let the caller pass any reviewer id it liked).
CREATE OR REPLACE FUNCTION public.fn_lc_announcement_guard_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- auth.uid() IS NULL means a service-role / superuser context (which also bypasses
  -- RLS); leave those writes alone. Only real end-user sessions are gated here.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'published')
  THEN
    IF NOT (is_super_admin() OR fn_is_lc_executive()) THEN
      RAISE EXCEPTION
        'Only Learners Council office bearers (President, Vice President, Secretary, Treasurer) can submit an announcement. You can save it as a draft for one of them to submit.'
        USING ERRCODE = '42501';
    END IF;

    -- Stamp real provenance on the publishing action.
    NEW.reviewed_by  := auth.uid();
    NEW.reviewed_at  := COALESCE(NEW.reviewed_at, now());
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lc_announcement_guard_publish ON lc_announcements;
CREATE TRIGGER trg_lc_announcement_guard_publish
BEFORE INSERT OR UPDATE ON lc_announcements
FOR EACH ROW EXECUTE FUNCTION public.fn_lc_announcement_guard_publish();
