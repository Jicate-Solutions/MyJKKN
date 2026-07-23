-- Add the read-only Passenger Type field (shown first) and widen Bus Pass Request
-- eligibility to all staff roles + students. Separate txn from the enum migration.
DO $$
DECLARE
  v_type_id uuid;
  v_roles   text[];
BEGIN
  SELECT id INTO v_type_id FROM service_types WHERE slug='transport-request';
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'transport-request service type not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM service_type_fields WHERE service_type_id=v_type_id AND field_key='passenger_type') THEN
    INSERT INTO service_type_fields
      (service_type_id, field_key, field_label, field_type, is_required, display_order, help_text)
    VALUES
      (v_type_id, 'passenger_type', 'Passenger Type', 'passenger_type', false, 0,
       'Detected automatically from your account');
  END IF;

  -- Eligibility: every staff role present today + student + super_admin (deduped).
  SELECT array_agg(DISTINCT rk) INTO v_roles
  FROM (
    SELECT role_key AS rk FROM staff WHERE role_key IS NOT NULL
    UNION SELECT 'student'
    UNION SELECT 'super_admin'
  ) t;
  UPDATE service_types SET allowed_roles = v_roles WHERE id=v_type_id;
END $$;
