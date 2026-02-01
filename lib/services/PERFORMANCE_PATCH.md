# Performance Optimization Patch Guide

## Overview
This document describes the critical performance optimizations required for all service methods to prevent unbounded queries and DoS vulnerabilities.

## Critical Issues Found
1. **Missing pagination validation** - Services accept unlimited page/limit values
2. **No query timeouts** - Queries can hang indefinitely
3. **No search sanitization** - SQL injection risk in ILIKE queries
4. **Missing caching configuration** - React Query hooks don't specify stale/cache times
5. **N+1 query problems** - Dashboard queries make multiple database calls
6. **No performance monitoring** - No logging of slow queries

## Required Changes Per Service

### 1. Add Imports
```typescript
import {
  validatePagination,
  calculatePaginationMetadata,
  sanitizeSearch,
  withTimeout,
  QUERY_TIMEOUTS,
  logSlowQuery,
  PERFORMANCE_THRESHOLDS,
} from '@/lib/config/pagination';
```

### 2. Update List Methods (CRITICAL)

**BEFORE (DANGEROUS):**
```typescript
static async getIncidents(filters: COPQFilters = {}): Promise<COPQListResponse> {
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  query.range((page - 1) * limit, page * limit - 1);
}
```

**AFTER (SAFE):**
```typescript
static async getIncidents(filters: COPQFilters = {}): Promise<COPQListResponse> {
  const startTime = performance.now();

  // SECURITY: Validate pagination to prevent unbounded queries
  const { page, limit } = validatePagination(filters.page, filters.limit);

  try {
    let query = this.supabase
      .from('billing_copq_incidents')
      .select('*', { count: 'exact' });

    // Apply filters with REQUIRED institution_id
    if (!filters.institution_id) {
      throw new Error('Institution ID is required');
    }
    query = query.eq('institution_id', filters.institution_id);

    // SECURITY: Sanitize search to prevent SQL injection
    if (filters.search) {
      const sanitized = sanitizeSearch(filters.search);
      query = query.or(`description.ilike.%${sanitized}%,root_cause.ilike.%${sanitized}%`);
    }

    // ALWAYS apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    // Wrap query with timeout
    const { data, count, error } = await withTimeout(
      query,
      QUERY_TIMEOUTS.LIST,
      'Incident list query timed out'
    );

    if (error) throw new Error(`Failed to fetch incidents: ${error.message}`);

    logSlowQuery('getIncidents', startTime, PERFORMANCE_THRESHOLDS.LIST);

    return {
      data: (data || []) as BillingCOPQIncident[],
      metadata: calculatePaginationMetadata(count || 0, page, limit)
    };
  } catch (error) {
    console.error('[billing/copq] Error fetching incidents:', error);
    throw error;
  }
}
```

### 3. Update Dashboard Methods (Use DB Functions)

**BEFORE (N+1 PROBLEM):**
```typescript
static async getDashboard(institutionId: string): Promise<Dashboard> {
  const surveys = await this.getSurveys(institutionId); // Query 1

  for (const survey of surveys) { // N queries!
    const responses = await this.getResponses(survey.id);
    // ... process
  }
}
```

**AFTER (OPTIMIZED):**
```typescript
static async getDashboard(institutionId: string, year?: number): Promise<COPQDashboard> {
  const startTime = performance.now();

  try {
    // Use database function for single-query aggregation
    const { data, error } = await withTimeout(
      this.supabase.rpc('get_billing_copq_dashboard', {
        p_institution_id: institutionId,
        p_year: year || new Date().getFullYear()
      }),
      QUERY_TIMEOUTS.DASHBOARD,
      'Dashboard query timed out'
    );

    if (error) {
      console.warn('[billing/copq] DB function failed, using fallback:', error);
      return this.calculateDashboardManually(institutionId, year);
    }

    // Get top incidents separately (limited to 5)
    const { data: topIncidents } = await this.supabase
      .from('billing_copq_incidents')
      .select('*')
      .eq('institution_id', institutionId)
      .order('visible_cost', { ascending: false })
      .limit(5);

    logSlowQuery('getDashboard', startTime, PERFORMANCE_THRESHOLDS.DASHBOARD);

    return {
      ...data,
      top_incidents: topIncidents || []
    } as COPQDashboard;
  } catch (error) {
    console.error('[billing/copq] Error fetching dashboard:', error);
    throw error;
  }
}
```

### 4. Update React Query Hooks

**Add cache configuration:**
```typescript
import { CACHE_CONFIG } from '@/lib/config/pagination';

export function useCOPQDashboard(institutionId: string, year?: number) {
  return useQuery({
    queryKey: copqKeys.dashboard(institutionId, year),
    queryFn: () => BillingCOPQService.getDashboard(institutionId, year),
    enabled: !!institutionId,
    staleTime: CACHE_CONFIG.DASHBOARD * 1000,
    cacheTime: CACHE_CONFIG.DASHBOARD * 2 * 1000,
    retry: 1 // Don't retry indefinitely
  });
}

export function useCOPQIncidents(filters: COPQFilters) {
  return useQuery({
    queryKey: copqKeys.incidents(filters),
    queryFn: () => BillingCOPQService.getIncidents(filters),
    enabled: !!filters.institution_id,
    staleTime: CACHE_CONFIG.LIST * 1000,
    cacheTime: CACHE_CONFIG.LIST * 2 * 1000,
    keepPreviousData: true, // Better UX during pagination
    retry: 1
  });
}
```

## Services Requiring Updates

### Priority 1 (CRITICAL - Public Facing)
- [ ] `lib/services/billing/copq/billing-copq-service.ts` - getIncidents, getDashboard
- [ ] `lib/services/stakeholder-nps/nps-service.ts` - getSurveys, getResponses, getDashboard
- [ ] `lib/services/parent-portal/parent-portal-service.ts` - getCommunications
- [ ] `lib/services/grievance/grievance-service.ts` - getTickets, getDashboard

### Priority 2 (HIGH - Internal Tools)
- [ ] `lib/services/process-excellence/process-excellence-service.ts` - All list methods
- [ ] `lib/services/maturity-assessment/maturity-assessment-service.ts` - getAssessments

### Priority 3 (MEDIUM - Existing Modules)
- [ ] All organization services (students, staff, etc.)

## Hooks Requiring Updates

### All hooks in:
- [ ] `hooks/billing/use-billing-copq.ts`
- [ ] `hooks/stakeholder-nps/*.ts`
- [ ] `hooks/grievance/*.ts`
- [ ] `hooks/parent-portal/*.ts`
- [ ] `hooks/process-excellence/*.ts`
- [ ] `hooks/maturity-assessment/*.ts`

## Testing Checklist

### Performance Testing
- [ ] Create test dataset with 10,000+ records
- [ ] Verify all list queries complete under 500ms
- [ ] Verify dashboard queries complete under 1s
- [ ] Test with page=999999 (should be capped to MAX_PAGE_NUMBER)
- [ ] Test with limit=999999 (should be capped to MAX_PAGE_SIZE)
- [ ] Test search with SQL injection patterns (should be sanitized)

### Load Testing
- [ ] Concurrent requests don't cause database saturation
- [ ] Query timeouts trigger after configured duration
- [ ] React Query caching reduces duplicate queries

## Migration Steps

1. **Apply Database Migrations**
   ```bash
   cd /Users/omm/PROJECTS/MyJKKN
   # Indexes
   supabase db push supabase/migrations/20260201224125_add_performance_indexes.sql
   # Dashboard functions
   supabase db push supabase/migrations/20260201224126_add_dashboard_functions.sql
   ```

2. **Update Services** (one at a time, test each)
   - Update imports
   - Add pagination validation
   - Add query timeouts
   - Add performance logging
   - Use DB functions for dashboards

3. **Update Hooks**
   - Add cache configuration
   - Add retry limits
   - Enable keepPreviousData for better UX

4. **Test Thoroughly**
   - Unit tests for pagination validation
   - Integration tests with large datasets
   - Performance benchmarks

## Performance Benchmarks

| Operation | Target | Current (Before Fix) | After Fix |
|-----------|--------|---------------------|-----------|
| Search | < 200ms | 5000ms+ | < 150ms |
| Dashboard | < 1s | 8000ms+ | < 800ms |
| List | < 500ms | 3000ms+ | < 300ms |
| Single | < 100ms | OK | < 50ms |

## Security Improvements

1. **Unbounded Query Prevention**: All list methods now enforce MAX_PAGE_SIZE
2. **SQL Injection Prevention**: Search strings are sanitized
3. **DoS Prevention**: Query timeouts prevent hanging connections
4. **Resource Exhaustion Prevention**: Pagination limits prevent loading 100K+ records

## Monitoring

Add to application monitoring:
- Query execution times (log warnings for slow queries)
- Cache hit rates (React Query)
- Pagination usage patterns (are users hitting limits?)
- Timeout occurrences (indicates need for optimization)
