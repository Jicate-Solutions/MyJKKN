// lib/services/instasolver/stats-service.ts
//
// Every figure on every InstaSolver screen comes from one of these RPCs — none
// is computed in the browser and none is a literal (spec acceptance #9). The
// RPCs are SECURITY INVOKER, so RLS scopes each figure to the caller.

import type {
  AdminOverview,
  Analytics,
  DashboardStats,
  InstaSolverAccess,
  ReporterProfile,
  Workload,
  WorkloadFilters
} from '@/types/instasolver';
import { db, unwrap } from './shared';

export class InstaSolverStatsService {
  static async access(): Promise<InstaSolverAccess> {
    return unwrap(await db().rpc('instasolver_my_access')) as InstaSolverAccess;
  }

  /** Who a report is filed as — name, email, designation, institution, mobile. */
  static async reporterProfile(): Promise<ReporterProfile | null> {
    return (unwrap(await db().rpc('instasolver_my_reporter_profile')) as ReporterProfile | null) ?? null;
  }

  static async dashboard(): Promise<DashboardStats> {
    return unwrap(await db().rpc('instasolver_get_dashboard_stats')) as DashboardStats;
  }

  static async analytics(days = 30): Promise<Analytics> {
    return unwrap(await db().rpc('instasolver_get_analytics', { p_days: days })) as Analytics;
  }

  static async workload(filters: WorkloadFilters = {}): Promise<Workload> {
    return unwrap(
      await db().rpc('instasolver_get_workload', {
        p_institution_id: filters.institution_id ?? null,
        p_priority: filters.priority ?? null,
        p_open_days: filters.open_days ?? null
      })
    ) as Workload;
  }

  static async adminOverview(): Promise<AdminOverview> {
    return unwrap(await db().rpc('instasolver_get_admin_overview')) as AdminOverview;
  }
}
