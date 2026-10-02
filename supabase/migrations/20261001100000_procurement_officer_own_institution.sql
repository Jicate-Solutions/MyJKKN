-- Procurement Officer: own institution only.
--
-- institution_scope = 'all' made role_has_institution_access() return true for
-- every institution, so officers saw (and could act on) every institution's
-- requests, RFQs, quotations, POs and GRNs — and, because that function backs
-- RLS across the app, cross-institution rows in other modules too.
--
-- 'own' = the user's profile institution (plus its CAS sibling and any explicit
-- user_institution_access grant). Procurement Manager is left at 'all'.

UPDATE public.custom_roles
SET institution_scope = 'own',
    updated_at = now()
WHERE role_key = 'procurement_officer';
