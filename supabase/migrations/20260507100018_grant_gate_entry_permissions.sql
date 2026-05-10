-- ============================================================================
-- 20260507100018 — Grant admission.gate_entry.* permissions to relevant roles
-- ============================================================================
-- Splits the three keys by audience:
--   - .create  → gate_security (their primary job), plus admission /
--                admission_staff / admission_counselor / expo_counselor so
--                reception staff and counselors can also log walk-ins
--   - .view    → admission / admission_staff (super_admin is implicit). Also
--                gate_security so they can see the day's roll. Counselors do
--                NOT get .view to keep their leads-list-only privilege model.
--   - .manage  → admission / admission_staff (settings owner)
--
-- Note: gate_security currently holds only campus_living.* perms (block-gate
-- visitor logging). Adding admission.gate_entry.* is intentional — same
-- persona logging students at the *admission* gate.
-- ============================================================================

-- .create — broadly granted to anyone who might capture a gate entry
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.gate_entry.create": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('gate_security', 'admission', 'admission_staff', 'admission_counselor', 'expo_counselor')
   AND COALESCE(permissions->>'admission.gate_entry.create', 'false') <> 'true';

-- .view — admission team members + gate_security (so guards can verify the day's roll)
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.gate_entry.view": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('admission', 'admission_staff', 'gate_security')
   AND COALESCE(permissions->>'admission.gate_entry.view', 'false') <> 'true';

-- .manage — admission team only
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.gate_entry.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('admission', 'admission_staff')
   AND COALESCE(permissions->>'admission.gate_entry.manage', 'false') <> 'true';
