-- ============================================================================
-- 20260721140000 — Create pde-clinical-images storage bucket
-- ============================================================================
-- Public-read bucket for DE-IDENTIFIED clinical teaching images imported via
-- the PMS casesheet bridge. Metadata is scrubbed at source (sharp re-encode +
-- fail-closed JPEG marker assertion on the PMS box); faculty must additionally
-- confirm no burned-in identifiers before an image is attached to a case
-- (default-deny in the builder). Uploads happen via service-role only in
-- /api/pde/cases/import-from-pms; public-read so the faculty builder and the
-- learner attempt page render with a plain <img src> (signed URLs would rot
-- inside case_scenario JSONB). Paths are {casesheet_id}/{image_id}.jpg.
-- Design: specs/pde-image-bridge-design-2026-07-21.md
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pde-clinical-images', 'pde-clinical-images', true, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
