-- Fix student role: align service_requests permission keys with MENU_PERMISSIONS
-- Student role had service_requests.view/create but MENU_PERMISSIONS uses submit/view_own
-- MENU_PERMISSIONS mapping:
--   '/service-requests'             -> 'service_requests.submit'
--   '/service-requests/my-requests' -> 'service_requests.view_own'
-- Updated: 2026-03-02

UPDATE custom_roles
SET permissions = permissions
  - 'service_requests.view'     -- remove old key
  - 'service_requests.create'   -- remove old key
  || jsonb_build_object(
      'service_requests.submit', true,    -- matches MENU_PERMISSIONS for /service-requests
      'service_requests.view_own', true   -- matches MENU_PERMISSIONS for /service-requests/my-requests
     )
WHERE role_key = 'student';
