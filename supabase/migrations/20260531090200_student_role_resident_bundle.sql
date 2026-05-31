-- Scope the student role's campus_living namespace to the My Hostel resident
-- bundle. Removes the 144 over-granted admin keys; preserves all non-campus_living
-- permissions verbatim. Resident own-data access is enforced by RLS (view_own
-- branches) + user_is_hosteler().
UPDATE custom_roles
SET permissions = (
      SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
      FROM jsonb_each(permissions) AS e(k, v)
      WHERE k NOT LIKE 'campus_living%'
    ) || jsonb_build_object(
      'campus_living.view', true,
      'campus_living.my_hostel.view', true,
      'campus_living.allocations.view_own', true,
      'campus_living.fees.view_own', true,
      'campus_living.profile.view_own', true,
      'campus_living.profile.edit_own', true,
      'campus_living.vacate_requests.view_own', true,
      'campus_living.vacate_requests.submit', true,
      'campus_living.leave.view_own', true,
      'campus_living.leave.request', true,
      'campus_living.gate_passes.view_own', true,
      'campus_living.gate_passes.create', true,
      'campus_living.premium.pick_room', true,
      'campus_living.premium.invite_roommate', true,
      'campus_living.premium.view_dashboard', true
    ),
    updated_at = now()
WHERE role_key = 'student';
