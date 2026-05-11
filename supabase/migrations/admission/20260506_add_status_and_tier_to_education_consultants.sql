-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260506_add_status_and_tier_to_education_consultants
--
-- Purpose:   The consultants list page reads consultant.status and
--            consultant.tier in the global view, but those columns previously
--            only existed on the consultant_institutions junction table.
--            ConsultantService.createConsultant strips status/tier from the
--            form input and never creates a junction row, so most consultants
--            had no status anywhere → Status badge rendered empty for every
--            row in the global view.
--
-- Fix:       Add global status + tier columns directly on education_consultants.
--            They act as the consultant's default; per-institution overrides
--            remain on consultant_institutions.{status,tier} when filtering
--            by institution.
--
-- Type/CHECK choices mirror the junction table (text + permissive CHECK) so the
-- UI's existing CONSULTANT_STATUS allowlist (5 values) works as-is. The narrower
-- consultant_status enum (draft/active/inactive/blacklisted) is intentionally
-- NOT used because it doesn't include suspended/pending_verification/contract_expired.
--
-- Companion code change: lib/services/admission/consultant-service.ts
-- createConsultant() no longer strips status/tier from the input destructure,
-- so they flow into the INSERT.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.education_consultants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.education_consultants
  DROP CONSTRAINT IF EXISTS education_consultants_status_check;

ALTER TABLE public.education_consultants
  ADD CONSTRAINT education_consultants_status_check
  CHECK (status IN ('active', 'inactive', 'suspended', 'pending_verification', 'contract_expired'));

ALTER TABLE public.education_consultants
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'bronze';

ALTER TABLE public.education_consultants
  DROP CONSTRAINT IF EXISTS education_consultants_tier_check;

ALTER TABLE public.education_consultants
  ADD CONSTRAINT education_consultants_tier_check
  CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond'));

COMMENT ON COLUMN public.education_consultants.status
IS 'Global default status. Per-institution overrides live on consultant_institutions.status.';

COMMENT ON COLUMN public.education_consultants.tier
IS 'Global default tier. Per-institution overrides live on consultant_institutions.tier.';
