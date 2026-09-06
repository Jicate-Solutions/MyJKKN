-- ============================================================================
-- Housekeeping: grant campus_living.housekeeping.mark_done to warden roles
-- ----------------------------------------------------------------------------
-- fn_housekeeping_mark_booking and the hostel_cleaning_bookings UPDATE policy
-- gate on 'campus_living.housekeeping.mark_done'. Warden and Chief Warden held
-- view + schedule but mark_done was explicitly false, so the day board's
-- Complete / No-show buttons returned error_code 'forbidden' for every warden
-- since the module shipped (2026-06-10). Housekeeping Staff already holds
-- mark_done; this brings the supervising roles in line with the intended flow
-- (warden oversees + closes out resident bookings).
-- ============================================================================

UPDATE custom_roles
SET permissions = permissions
      || jsonb_build_object('campus_living.housekeeping.mark_done', true),
    updated_at  = now()
WHERE role_key IN ('warden', 'chief_warden')
  AND (permissions->>'campus_living.housekeeping.mark_done')::boolean
      IS DISTINCT FROM TRUE;
