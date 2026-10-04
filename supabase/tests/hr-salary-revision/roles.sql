-- The four roles as they are BEFORE the migration: none holds a salary
-- revision key. The migration's UPDATEs (by role_key) are what grant them.
INSERT INTO public.custom_roles (role_key, permissions, institution_scope) VALUES
  ('principal', '{"hr.view": true}', 'own'),
  ('hod',       '{"hr.view": true}', 'own'),
  ('hr_head',   '{"hr.view": true, "hr.payroll.salary.view": true, "hr.payroll.salary.manage": true}', 'all'),
  ('faculty',   '{"hr.view": true}', 'own');
