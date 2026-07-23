-- Create the Transport Head role, grant it the service-request keys it needs to
-- reach the approvals inbox / request details, and repoint the Bus Pass Request
-- approval step at it (was the generic `administrator` role).
--
-- institution_scope='own' so each transport head only sees their own institution's
-- approvals (the approvals inbox pins non-cross-institutional roles to their inst).
INSERT INTO custom_roles
  (role_key, role_name, description, is_system_role, institution_scope, is_active, permissions)
VALUES (
  'transport_head',
  'Transport Head',
  'Reviews and approves student bus pass requests per institution.',
  false,
  'own',
  true,
  jsonb_build_object(
    'service_requests.approve', true,
    'service_requests.view_all', true,
    'service_requests.view_own', true
  )
)
ON CONFLICT (role_key) DO UPDATE
  SET permissions = custom_roles.permissions
        || jsonb_build_object(
             'service_requests.approve', true,
             'service_requests.view_all', true,
             'service_requests.view_own', true
           ),
      is_active = true;

-- Repoint the existing "Transport Head Review" step from administrator -> transport_head.
UPDATE service_request_approval_steps s
   SET approver_role = 'transport_head'
  FROM service_types t
 WHERE s.service_type_id = t.id
   AND t.slug = 'transport-request'
   AND s.step_order = 1;
