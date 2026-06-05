-- Bus Pass Request becomes instant self-service: remove its approval step so
-- submission auto-finalizes (no Transport Head review).
DELETE FROM service_request_approval_steps
WHERE service_type_id = (SELECT id FROM service_types WHERE slug = 'transport-request');
