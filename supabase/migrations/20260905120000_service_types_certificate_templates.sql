-- ============================================================================
-- Service Requests: per-type certificate templates (2026-09-05)
--
-- After a service request is approved, office staff can generate a
-- print-ready certificate (Bonafide, Course Completion, ...) for the
-- requester. Which certificates a service type may issue is configured on
-- the service type itself (/service-requests/types/[id]/edit).
--
-- The template catalogue lives in code (lib/certificates/registry.ts); this
-- column only stores the ENABLED template keys, so adding a new layout is a
-- code change, not a schema change.
-- ============================================================================

ALTER TABLE service_types
  ADD COLUMN IF NOT EXISTS certificate_template_keys TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN service_types.certificate_template_keys IS
  'Certificate template keys (see lib/certificates/registry.ts) office staff may generate once a request of this type is approved.';
