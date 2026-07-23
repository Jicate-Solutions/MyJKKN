-- ============================================================================
-- Schools Network module — updated_at auto-bump triggers
-- File:  20260703170100_schools_network_updated_at_triggers.sql
-- Date:  2026-07-03
--
-- WHY (live-verified receipt, 2026-07-03 HM-portal e2e):
--   A PATCH through /api/schools-portal/me/contact changed
--   school_contacts.notes but updated_at stayed equal to created_at —
--   the Schools Network substrate migration
--   (20260630120000_schools_network_substrate.sql) created every table
--   with an updated_at TIMESTAMPTZ column but defined NO BEFORE UPDATE
--   triggers to bump it. Every UPDATE on these tables silently leaves
--   updated_at stale.
--
-- WHAT THIS MIGRATION DOES (additive + idempotent — safe to re-run):
--   Adds one BEFORE UPDATE trigger per Schools Network table, reusing the
--   repo's canonical trigger function public.update_updated_at_column()
--   (defined in supabase/setup/00_master_setup.sql; same function used by
--   supabase/setup/04_triggers.sql and recent migrations, e.g.
--   20260703000000_hostel_rooms_v2_pr1_substrate.sql).
--
--   Covered tables (all 10 substrate tables; each has updated_at):
--     1. school_session_types
--     2. program_partner_types
--     3. school_contact_roles
--     4. program_partners
--     5. schools
--     6. school_contacts
--     7. school_jkkn_owners
--     8. school_sessions
--     9. school_contributions
--    10. program_partner_grants
--
-- No new functions, no RLS changes, no data changes.
-- ============================================================================

-- Updated: 2026-07-03 - Add missing updated_at bump triggers to Schools
-- Network tables (portal PATCH left updated_at == created_at).

-- 1. school_session_types
DROP TRIGGER IF EXISTS set_updated_at ON public.school_session_types;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.school_session_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. program_partner_types
DROP TRIGGER IF EXISTS set_updated_at ON public.program_partner_types;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.program_partner_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. school_contact_roles
DROP TRIGGER IF EXISTS set_updated_at ON public.school_contact_roles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.school_contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. program_partners
DROP TRIGGER IF EXISTS set_updated_at ON public.program_partners;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.program_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. schools
DROP TRIGGER IF EXISTS set_updated_at ON public.schools;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. school_contacts (the live-verified stale-updated_at table)
DROP TRIGGER IF EXISTS set_updated_at ON public.school_contacts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.school_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. school_jkkn_owners
DROP TRIGGER IF EXISTS set_updated_at ON public.school_jkkn_owners;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.school_jkkn_owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. school_sessions
DROP TRIGGER IF EXISTS set_updated_at ON public.school_sessions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.school_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. school_contributions
DROP TRIGGER IF EXISTS set_updated_at ON public.school_contributions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.school_contributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. program_partner_grants
DROP TRIGGER IF EXISTS set_updated_at ON public.program_partner_grants;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.program_partner_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
