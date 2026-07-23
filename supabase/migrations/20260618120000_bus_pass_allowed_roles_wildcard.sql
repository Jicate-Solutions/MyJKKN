-- Bus Pass Request: open to every authenticated user.
--
-- The previous allowed_roles was a static snapshot of staff.role_key (+ student
-- + super_admin) taken at 20260602110200. It went stale: custom roles added
-- afterwards — staff_counselor, admission_counselor, coe, coe_office,
-- transport_head, digital_coordinator, school_faculty, health_* and others —
-- were never in the list, so those users could neither see nor submit a Bus
-- Pass request.
--
-- Replace the enumerated snapshot with the '*' wildcard. Both gates special-case
-- it to mean "any authenticated user":
--   * visibility  — ServiceTypeService.getServiceTypes appends '*' to the
--                   overlaps() comparison set.
--   * submission  — ServiceRequestService.createRequest treats '*' as allow-all.
-- New custom roles are now included automatically, with no future top-ups.
DO $$
DECLARE
  v_type_id uuid;
BEGIN
  SELECT id INTO v_type_id FROM service_types WHERE slug = 'transport-request';
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'transport-request service type not found';
  END IF;

  UPDATE service_types
     SET allowed_roles = ARRAY['*'],
         updated_at = now()
   WHERE id = v_type_id;
END $$;
