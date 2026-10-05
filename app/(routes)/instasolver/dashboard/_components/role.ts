import type { InstaSolverAccess } from '@/types/instasolver';

/**
 * The standalone app gave each person ONE role, and its dashboard is built per
 * role. In MyJKKN a person can be CAO and Principal, or on a team and a
 * reporter, so the dashboard picks the role whose job is the most demanding:
 * Super Admin → CAO → Maintenance → Principal → Reporter.
 */
export type DashboardRole = 'super_admin' | 'cao' | 'maintenance' | 'principal' | 'reporter';

export function dashboardRole(access: InstaSolverAccess): DashboardRole {
  if (access.is_admin) return 'super_admin';
  if (access.is_manager) return 'cao';
  if (access.is_maintenance) return 'maintenance';
  if (access.is_principal) return 'principal';
  return 'reporter';
}
