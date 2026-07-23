-- Open postal_codes for admin CRUD via the new Learners settings page.
-- Writes gated on permission keys (never role names); reads stay open to
-- all authenticated users (unchanged).

CREATE POLICY postal_codes_insert ON public.postal_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('learners.postal_codes.create'));

CREATE POLICY postal_codes_update ON public.postal_codes
  FOR UPDATE TO authenticated
  USING (public.user_has_permission('learners.postal_codes.edit'))
  WITH CHECK (public.user_has_permission('learners.postal_codes.edit'));

CREATE POLICY postal_codes_delete ON public.postal_codes
  FOR DELETE TO authenticated
  USING (public.user_has_permission('learners.postal_codes.delete'));

-- Grants: same rule as school_master — roles that can create learners
-- maintain the lookup masters. Gate on the learners.create key.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'learners.postal_codes.view', true,
  'learners.postal_codes.create', true,
  'learners.postal_codes.edit', true,
  'learners.postal_codes.delete', true
)
WHERE is_active = true
  AND permissions->'learners.create' = 'true'::jsonb;
