-- The role rows as the desk read them live (2026-10-09 ~23:30 IST): procurement.request_create
-- true only for procurement_manager, procurement_officer and store_admin; request_approve true
-- only for procurement_manager. Each row also carries an unrelated key, to prove the grant
-- touches nothing else on the row.
INSERT INTO custom_roles (role_key, role_name, permissions) VALUES
  ('hod', 'HoD', '{"procurement.request_create": false, "procurement.request_approve": false, "attendance.view": true}'),
  ('principal', 'Principal', '{"procurement.request_approve": false, "reports.view": true}'),
  ('office_assistant', 'Office Assistant', '{"procurement.request_create": "false", "fees.view": true}'),
  ('procurement_manager', 'Procurement Manager', '{"procurement.request_create": true, "procurement.request_approve": true}'),
  ('procurement_officer', 'Procurement Officer', '{"procurement.request_create": true, "procurement.request_approve": false}'),
  ('store_admin', 'Store Admin', '{"procurement.request_create": true}'),
  ('lab_assistant', 'Lab Assistant', '{"ims.view": true}');
