-- Migration: pde_certificates cancellation state
-- Date: 2026-07-06 — LinkedIn certificate "Add to Profile" go-live, Phase 1
-- Purpose:
--   pde_certificates had NO revoked/status concept. Product decision (2026-07-06):
--   the public /verify page must show a clear "Cancelled" notice when a certificate
--   is revoked (issued by mistake / work found invalid), because that page is the
--   LinkedIn "See credential" target and is publicly reachable without login.
--   internship_certificates already carries is_revoked/revoked_at/revocation_reason/
--   revoked_by; this brings pde_certificates to parity.
-- Safety: additive + nullable (is_revoked defaults false). No data rewrite.
--   Fully reversible via DROP COLUMN. No new RPC (public reads go through the
--   service-role verify resolver in app code, not a SECURITY DEFINER function).

ALTER TABLE public.pde_certificates
  ADD COLUMN IF NOT EXISTS is_revoked        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at        timestamptz,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS revoked_by        uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.pde_certificates.is_revoked IS
  'When true, the public /verify/[number] page shows a "Cancelled" notice instead of a valid credential. Mirrors internship_certificates.is_revoked. Added 2026-07-06 for LinkedIn cert go-live.';
