import { BaseService } from '@/lib/services/base-service';
import type {
  BillingAnalyticsFilters,
  BillingAnalyticsOverview,
  BillingTodayCollections,
  BillingCollectionTrendPoint,
  BillingInstitutionAnalytics,
  BillingAgingBucketRow,
  BillingCategoryAnalytics,
  BillingCollectionSplit,
  BillingUserActivityRow,
  BillingDailyActivityRow,
  TrendGranularity,
} from '@/types/billing-analytics';

// ============================================================================
// BILLING ANALYTICS SERVICE
// ============================================================================
// Thin wrapper over 7 SECURITY DEFINER RPCs (migration 20260602094000). All
// aggregation happens in Postgres — the service only marshals params and lets
// BaseService.executeDashboardRPC handle the timeout + slow-query logging.
// Institution scope + permission gating live inside the RPCs, so the service
// passes the *selected* institution filter (or null for "all accessible").
// ============================================================================

export class BillingAnalyticsService extends BaseService {
  /** Shared p_institution_ids / p_date_from / p_date_to mapping. Empty selection
   *  → null so the RPC falls back to the caller's full accessible scope. */
  private static scopeParams(filters: BillingAnalyticsFilters) {
    return {
      p_institution_ids:
        filters.institution_ids && filters.institution_ids.length > 0
          ? filters.institution_ids
          : null,
      p_date_from: filters.date_from ?? null,
      p_date_to: filters.date_to ?? null,
    };
  }

  private static instParam(filters: BillingAnalyticsFilters) {
    return {
      p_institution_ids:
        filters.institution_ids && filters.institution_ids.length > 0
          ? filters.institution_ids
          : null,
    };
  }

  static getOverview(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingAnalyticsOverview>(
      'get_billing_analytics_overview',
      this.scopeParams(filters)
    );
  }

  static getTodayCollections(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingTodayCollections>(
      'get_billing_today_collections',
      this.instParam(filters)
    );
  }

  static getCollectionTrend(
    filters: BillingAnalyticsFilters & { granularity?: TrendGranularity } = {}
  ) {
    return this.executeDashboardRPC<BillingCollectionTrendPoint[]>(
      'get_billing_collection_trend',
      { ...this.scopeParams(filters), p_granularity: filters.granularity ?? 'day' }
    );
  }

  static getByInstitution(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingInstitutionAnalytics[]>(
      'get_billing_analytics_by_institution',
      this.scopeParams(filters)
    );
  }

  static getAging(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingAgingBucketRow[]>(
      'get_billing_analytics_aging',
      this.instParam(filters)
    );
  }

  /** Management vs Government vs Unallocated — see BillingCollectionSplit. */
  static getCollectionSplit(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingCollectionSplit>(
      'get_billing_collection_split',
      this.scopeParams(filters)
    );
  }

  static getByCategory(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingCategoryAnalytics[]>(
      'get_billing_analytics_by_category',
      this.instParam(filters)
    );
  }

  static getUserActivity(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingUserActivityRow[]>(
      'get_billing_user_activity',
      this.scopeParams(filters)
    );
  }

  static getDailyActivity(filters: BillingAnalyticsFilters = {}) {
    return this.executeDashboardRPC<BillingDailyActivityRow[]>(
      'get_billing_daily_activity',
      this.scopeParams(filters)
    );
  }
}
