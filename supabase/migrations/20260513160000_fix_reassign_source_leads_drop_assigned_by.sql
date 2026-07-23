-- =====================================================================
-- 2026-05-11  Fix reassign_source_leads_between_counselors
--
-- Bug: The function from migration 20260510240000_admission_counselors_
-- holding_source_leads_and_reassign.sql writes to admission_leads.assigned_by,
-- which doesn't exist on the table. Running the reassign action from
-- /admission/settings/sources/{id} fails with:
--
--   ERROR  42703  column "assigned_by" of relation "admission_leads" does not exist
--
-- Fix: Drop the assigned_by assignment. The reassignment is fully captured
-- by the three remaining writes — counselor_id (new counselor),
-- assigned_counselor_id (new auth user), assigned_at (timestamp). Identity
-- of "who reassigned" belongs in a separate audit log (overwriting a single
-- column would discard prior reassignment history anyway).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reassign_source_leads_between_counselors(
  p_source            lead_source,
  p_from_counselor_id uuid,
  p_to_counselor_id   uuid,
  p_institution_id    uuid DEFAULT NULL,
  p_reason            text DEFAULT NULL
)
RETURNS TABLE (
  reassigned_count integer,
  to_user_id       uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_to_user_id  uuid;
  v_count       int;
BEGIN
  -- Permission door check (same as bulk-distribute panel).
  IF NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.sources.manage')
    OR user_has_permission('admission.counselors.team.manage')
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_from_counselor_id IS NULL OR p_to_counselor_id IS NULL THEN
    RAISE EXCEPTION 'from and to counselor IDs are required';
  END IF;

  IF p_from_counselor_id = p_to_counselor_id THEN
    RAISE EXCEPTION 'from and to counselors must be different';
  END IF;

  -- Resolve the destination counselor's auth user_id so RLS direct-assignment
  -- visibility kicks in for the new assignee.
  SELECT user_id INTO v_to_user_id
  FROM admission_counselors WHERE id = p_to_counselor_id;

  IF v_to_user_id IS NULL THEN
    RAISE EXCEPTION 'destination counselor has no linked user_id';
  END IF;

  -- Reference v_user_id and p_reason to silence "unused variable" notices
  -- and document that they're available for audit-log expansion later.
  PERFORM v_user_id, p_reason;

  -- Atomic bulk update. assigned_by removed — column does not exist on
  -- admission_leads. counselor_id + assigned_counselor_id + assigned_at
  -- capture the reassignment fully; "who reassigned" goes in audit logs.
  WITH updated AS (
    UPDATE admission_leads
       SET counselor_id          = p_to_counselor_id,
           assigned_counselor_id = v_to_user_id,
           assigned_at           = now(),
           updated_at            = now()
     WHERE source = p_source
       AND counselor_id = p_from_counselor_id
       AND (p_institution_id IS NULL OR institution_id = p_institution_id)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN QUERY SELECT v_count, v_to_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_source_leads_between_counselors(
  lead_source, uuid, uuid, uuid, text
) TO authenticated;

COMMENT ON FUNCTION public.reassign_source_leads_between_counselors(
  lead_source, uuid, uuid, uuid, text
) IS
  'Bulk-move all leads of source p_source currently held by p_from_counselor_id to p_to_counselor_id within p_institution_id (NULL = all institutions). Sets BOTH counselor_id and assigned_counselor_id atomically. SECURITY DEFINER + permission door check. 2026-05-11: dropped assigned_by write — column does not exist.';
