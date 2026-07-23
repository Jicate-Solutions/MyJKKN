-- Replace the Bus Pass Request's static fields with two live TMS lookup fields,
-- and restrict the type to students (the sync target learners_profiles is student-only).
-- Depends on 20260602100000 having added the tms_route / tms_route_stop enum values.
DO $$
DECLARE
  v_type_id uuid;
BEGIN
  SELECT id INTO v_type_id FROM service_types WHERE slug = 'transport-request';
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'transport-request service type not found';
  END IF;

  DELETE FROM service_type_fields WHERE service_type_id = v_type_id;

  INSERT INTO service_type_fields
    (service_type_id, field_key, field_label, field_type, is_required, display_order, help_text)
  VALUES
    (v_type_id, 'bus_route', 'Bus Route', 'tms_route', true, 1, 'Select your bus route'),
    (v_type_id, 'boarding_stop', 'Boarding Stop', 'tms_route_stop', true, 2,
       'Select your boarding stop on the chosen route');

  UPDATE service_types
     SET allowed_roles = ARRAY['super_admin','student']::text[]
   WHERE id = v_type_id;
END $$;
