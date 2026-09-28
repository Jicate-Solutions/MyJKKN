-- Applied BEFORE the migration: the row the Director-level seed copies from
-- (on production: instasolver.complaint.superior_route_to = the Joint MD).
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active)
VALUES ('instasolver.complaint.superior_route_to', 'global', NULL,
        to_jsonb('a0000000-0000-0000-0000-000000000001'::text), 'string', true);
