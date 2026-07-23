-- ─────────────────────────────────────────────────────────────────
-- Campus Living ⇄ Resource Management — PR-2 incident bridge
--
-- Adds a nullable resource_id FK on hostel_incidents so that wardens
-- can confirm a learner-filed incident is in fact an RM work order
-- (e.g. "AC compressor failed" → linked to the AC resource row).
--
-- ADDITIVE-ONLY. Backward compatible.
--   • New column is NULL by default → existing rows unaffected.
--   • Incidents without a resource_id stay Campus-Living-only.
--   • Incidents with a resource_id become eligible for the
--     `confirmAndCreateMaintenanceLog` flow shipped in this PR.
--
-- DOES NOT touch hostel_maintenance_requests / maintenance-service.ts.
-- Those destructive removals are deferred to PR-3 per the integration
-- spec at specs/campus-living-rm-integration.md.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.hostel_incidents
  ADD COLUMN IF NOT EXISTS resource_id uuid
    REFERENCES public.resources(id)
    ON DELETE SET NULL;

-- Help warden confirmation queries (`WHERE resource_id IS NOT NULL`)
-- and FK-join planners.
CREATE INDEX IF NOT EXISTS hostel_incidents_resource_id_idx
  ON public.hostel_incidents (resource_id)
  WHERE resource_id IS NOT NULL;

COMMENT ON COLUMN public.hostel_incidents.resource_id IS
  'Optional FK to resources(id). When set, the warden can promote this incident '
  'into a resource_maintenance_logs row via IncidentService.confirmAndCreateMaintenanceLog. '
  'See specs/campus-living-rm-integration.md PR-2.';
