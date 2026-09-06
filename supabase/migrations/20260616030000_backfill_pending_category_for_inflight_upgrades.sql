-- Backfill pending_hostel_category_id for upgrades that were confirmed BEFORE the
-- pending-category feature (mig 20260616020000). Those learners have a reserved room /
-- waiting upgrade but no pending category, so My Hostel doesn't show the "pending" badge.
-- Stage pending = the (latest) waiting target so they surface consistently; the existing
-- promote (pay+threshold) / revert (expiry) logic already handles these rows.
-- Idempotent: only fills NULLs, and never points pending at the learner's current category.
UPDATE learners_profiles lp
SET pending_hostel_category_id = w.target_hostel_category_id, updated_at = now()
FROM (
  SELECT DISTINCT ON (pr.learner_id)
         pr.learner_id AS lp_id, w.target_hostel_category_id
  FROM hostel_waitlist w
  JOIN profiles pr ON pr.id = w.learner_id
  WHERE w.entry_kind = 'upgrade' AND w.status = 'waiting'
    AND w.target_hostel_category_id IS NOT NULL
  ORDER BY pr.learner_id, w.created_at DESC
) w
WHERE lp.id = w.lp_id
  AND lp.pending_hostel_category_id IS NULL
  AND lp.hostel_category_id IS DISTINCT FROM w.target_hostel_category_id;
