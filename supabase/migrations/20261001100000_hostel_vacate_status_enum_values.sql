-- ============================================================================
-- Hostel vacate: new approval-chain statuses
-- ============================================================================
-- Must be its own migration: a freshly added enum value cannot be used in the
-- same transaction that adds it. The follow-up migration
-- 20261001110000_hostel_vacate_approval_chain_damage_fine.sql uses them.
--
-- Flow: draft -> pending_dues (bills not cleared) -> pending_principal ->
--       pending_warden -> pending_mess -> pending_cao -> [pending_fine] -> completed
-- pending_dues already exists and is reused for the automatic bill check.
-- ============================================================================
ALTER TYPE public.vacate_request_status_enum ADD VALUE IF NOT EXISTS 'pending_principal';
ALTER TYPE public.vacate_request_status_enum ADD VALUE IF NOT EXISTS 'pending_mess';
ALTER TYPE public.vacate_request_status_enum ADD VALUE IF NOT EXISTS 'pending_cao';
ALTER TYPE public.vacate_request_status_enum ADD VALUE IF NOT EXISTS 'pending_fine';
