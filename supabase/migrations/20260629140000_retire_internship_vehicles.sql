-- ============================================================================
-- The Availability Spine — Limb 3: retire internship_vehicles
-- File: 20260629140000_retire_internship_vehicles.sql | Date: 2026-06-29
--
-- Vehicles now live on the ONE booking spine: a vehicle is a Transport
-- `resources` row (parent_category_id = Transport, custom_attributes.kind =
-- 'vehicle') and a trip is a `resource_reservations` row via ReservationService.
-- The standalone `internship_vehicles` table is no longer the source of truth.
--
-- SAFETY (verified 2026-06-29):
--   • 0 rows in internship_vehicles (never carried real data — its UI/types had
--     drifted away from the DB shape and inserts failed).
--   • No foreign keys reference internship_vehicles from any other table.
--   • All code consumers rewritten in this PR: vehicles-service.ts now reads
--     `resources`; internship-policy-service.ts no longer counts this table.
--
-- ⚠️ ORDER OF OPERATIONS — apply this AFTER this PR's code is deployed.
-- Until the new code is live, the currently-deployed build still reads this
-- table; dropping it before deploy would error the live vehicles page. This file
-- is the record of intent; apply it once the code ships (e.g. during the same
-- /deploy-myjkkn pass, immediately after the deploy is Ready).
-- ============================================================================

DROP TABLE IF EXISTS public.internship_vehicles CASCADE;

NOTIFY pgrst, 'reload schema';
