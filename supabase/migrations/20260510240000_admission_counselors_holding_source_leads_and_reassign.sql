-- ============================================================================
-- Two new RPCs for the source detail page's Counselors tab:
--
--   get_counselors_holding_source_leads — returns every counselor who
--     currently holds at least one lead from the given source, with their
--     lead count and whether they're formally mapped via
--     admission_counselor_sources. Used by the new "Other counselors holding
--     leads from this source" section.
--
--   reassign_source_leads_between_counselors — bulk-move all leads from one
--     counselor to another (for the given source + institution). Sets both
--     counselor_id and assigned_counselor_id atomically; permission-gated
--     same as bulk_route_unassigned_leads.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Read RPC: counselors with leads from this source.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_counselors_holding_source_leads(
  p_source         lead_source,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  counselor_id uuid,
  user_id      uuid,
  name         text,
  email        text,
  designation  text,
  is_active    boolean,
  current_leads int,
  max_leads    int,
  source_lead_count bigint,
  is_mapped    boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    ac.id          AS counselor_id,
    ac.user_id     AS user_id,
    ac.name        AS name,
    ac.email       AS email,
    ac.designation AS designation,
    ac.is_active   AS is_active,
    ac.current_leads,
    ac.max_leads,
    COUNT(l.id)    AS source_lead_count,
    EXISTS (
      SELECT 1
      FROM admission_counselor_sources cs
      JOIN admission_lead_sources_master m ON m.id = cs.source_id
      WHERE cs.counselor_id = ac.id
        AND m.enum_value = p_source
    ) AS is_mapped
  FROM admission_leads l
  JOIN admission_counselors ac ON ac.id = l.counselor_id
  WHERE l.source = p_source
    AND l.counselor_id IS NOT NULL
    AND (p_institution_id IS NULL OR l.institution_id = p_institution_id)
  GROUP BY ac.id, ac.user_id, ac.name, ac.email, ac.designation, ac.is_active,
           ac.current_leads, ac.max_leads
  ORDER BY source_lead_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_counselors_holding_source_leads(lead_source, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_counselors_holding_source_leads(lead_source, uuid) IS
  'Lists counselors currently holding at least one lead from the given source. Includes lead count and is_mapped flag (whether the counselor is formally mapped via admission_counselor_sources). Used by the Counselors tab on the source detail page.';

-- ----------------------------------------------------------------------------
-- Write RPC: bulk-reassign all of one counselor's leads to another.
-- ----------------------------------------------------------------------------
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

  -- Atomic bulk update.
  WITH updated AS (
    UPDATE admission_leads
       SET counselor_id          = p_to_counselor_id,
           assigned_counselor_id = v_to_user_id,
           assigned_at           = now(),
           assigned_by           = v_user_id,
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
  'Bulk-move all leads of source p_source currently held by p_from_counselor_id to p_to_counselor_id within p_institution_id (NULL = all institutions). Sets BOTH counselor_id and assigned_counselor_id atomically. SECURITY DEFINER + permission door check.';

DO $$
BEGIN
  RAISE NOTICE 'Source-tab counselor-holding + reassign RPCs applied.';
END $$;

COMMIT;
