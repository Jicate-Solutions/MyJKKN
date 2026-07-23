-- Campus Living — remove the academic-fee % gate on room upgrades / first-bookings.
--
-- Operator decision: a room upgrade should ALWAYS reserve the room and generate the upgrade
-- bill immediately ('Reserve & pay'), and an unallocated learner should be able to book
-- straight into a higher category — instead of being held on a 5-day reservation until they
-- reach 30% of academic fees. Clearing upgrade_threshold_pct makes
-- _cl_upgrade_threshold_check.meets = TRUE for everyone, so fn_self_upgrade_room_category
-- takes its meets-threshold path:
--   * unallocated learner  -> _cl_execute_first_booking (allocated straight into the category)
--   * allocated learner    -> reserve bed + generate the differential upgrade bill now
-- Reversible via the backup table below (restore: UPDATE hostel_categories c SET
-- upgrade_threshold_pct = b.upgrade_threshold_pct FROM _bak_hostel_categories_threshold_20260615 b
-- WHERE b.id = c.id;).

CREATE TABLE IF NOT EXISTS _bak_hostel_categories_threshold_20260615 AS
SELECT id, name, type, upgrade_threshold_pct FROM hostel_categories;

UPDATE hostel_categories
SET upgrade_threshold_pct = NULL
WHERE upgrade_threshold_pct IS NOT NULL;
