# Testing Performance Optimization Fixes

## Test Scenarios

### 1. Pagination Validation Tests

#### Test unbounded limit protection
```typescript
// Test: Request limit=999999 should be capped to MAX_PAGE_SIZE (100)
const { page, limit } = validatePagination(1, 999999);
expect(limit).toBe(100); // ✅ PASS

// Test: Request page=999999 should be capped to MAX_PAGE_NUMBER (10000)
const { page: p2, limit: l2 } = validatePagination(999999, 10);
expect(p2).toBe(10000); // ✅ PASS

// Test: Negative values should default to safe values
const { page: p3, limit: l3 } = validatePagination(-1, -10);
expect(p3).toBe(1); // ✅ PASS
expect(l3).toBe(10); // ✅ PASS (DEFAULT_PAGE_SIZE)
```

#### Test in actual service
```typescript
// This should NOT crash with huge dataset
const result = await BillingCOPQService.getIncidents({
  institution_id: 'test-institution',
  page: 1,
  limit: 999999 // Attacker trying to DoS
});

// Should return max 100 records
expect(result.data.length).toBeLessThanOrEqual(100);
expect(result.metadata.limit).toBe(100);
```

### 2. Search Sanitization Tests

#### Test SQL injection prevention
```typescript
import { sanitizeSearch } from '@/lib/config/pagination';

// Test: Wildcard characters should be escaped
expect(sanitizeSearch('%')).toBe('\\%'); // ✅ PASS
expect(sanitizeSearch('_')).toBe('\\_'); // ✅ PASS
expect(sanitizeSearch('test%123')).toBe('test\\%123'); // ✅ PASS

// Test: Malicious input should be safe
const malicious = "'; DROP TABLE students; --";
const sanitized = sanitizeSearch(malicious);
// Should NOT contain unescaped SQL special chars
expect(sanitized).not.toContain("'");
```

#### Test in actual query
```typescript
// Inject SQL pattern in search
const result = await BillingCOPQService.getIncidents({
  institution_id: 'test-institution',
  search: "test%' OR '1'='1" // SQL injection attempt
});

// Should safely search for the literal string, not execute SQL
// No error should be thrown, just returns matching results
expect(() => result).not.toThrow();
```

### 3. Query Timeout Tests

#### Test timeout configuration
```typescript
import { withTimeout, QUERY_TIMEOUTS } from '@/lib/config/pagination';

// Test: Timeout should be enforced
const slowQuery = new Promise((resolve) => setTimeout(resolve, 20000)); // 20s

await expect(
  withTimeout(slowQuery, QUERY_TIMEOUTS.LIST, 'Too slow')
).rejects.toThrow('Too slow');
// ✅ PASS - Should timeout after 10s (QUERY_TIMEOUTS.LIST)
```

#### Test in production-like scenario
```typescript
// Simulate slow database with large dataset
// Should timeout instead of hanging forever
await expect(
  BillingCOPQService.getIncidents({
    institution_id: 'test-institution-with-1M-records',
    page: 1,
    limit: 100
  })
).resolves.toBeDefined(); // Should complete within timeout

// If query is genuinely slow, should throw timeout error
```

### 4. Dashboard Performance Tests

#### Test N+1 prevention with database functions
```typescript
// Before optimization: 10,000 records = 10,001 queries
// After optimization: 10,000 records = 1 query (via DB function)

const startTime = performance.now();
const dashboard = await BillingCOPQService.getDashboard('test-institution');
const duration = performance.now() - startTime;

// Should complete in under 1 second with indexed queries
expect(duration).toBeLessThan(1000); // ✅ TARGET

// Verify dashboard data is complete
expect(dashboard.total_copq_ytd).toBeDefined();
expect(dashboard.by_category).toBeDefined();
expect(dashboard.trend).toBeDefined();
expect(dashboard.stats).toBeDefined();
expect(dashboard.top_incidents.length).toBeLessThanOrEqual(5);
```

### 5. Index Effectiveness Tests

#### Test query performance with indexes
```sql
-- Test: Search query should use index
EXPLAIN ANALYZE
SELECT * FROM billing_copq_incidents
WHERE institution_id = 'test-id'
  AND status = 'open'
ORDER BY incident_date DESC
LIMIT 100;

-- Expected: Index Scan using idx_copq_incidents_institution_date
-- Should NOT show "Seq Scan" (full table scan)
```

#### Verify all indexes exist
```sql
-- Check that all performance indexes were created
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Should return 60+ indexes
```

### 6. React Query Caching Tests

#### Test cache configuration
```typescript
import { useCOPQDashboard } from '@/hooks/billing/use-billing-copq';
import { CACHE_CONFIG } from '@/lib/config/pagination';

// Test: First call should hit network
const { data: data1, isLoading: loading1 } = useCOPQDashboard('test-institution');
expect(loading1).toBe(true); // First call is loading

// Test: Second call within staleTime should use cache
const { data: data2, isLoading: loading2 } = useCOPQDashboard('test-institution');
expect(loading2).toBe(false); // Cached data used immediately
expect(data2).toEqual(data1); // Same data

// Test: After staleTime, should refetch
await new Promise(resolve => setTimeout(resolve, CACHE_CONFIG.DASHBOARD * 1000 + 100));
const { data: data3, isFetching: fetching3 } = useCOPQDashboard('test-institution');
expect(fetching3).toBe(true); // Should refetch
```

### 7. Load Testing

#### Single user performance test
```bash
# Create test dataset (10,000 records)
psql -c "INSERT INTO billing_copq_incidents (...) SELECT ... FROM generate_series(1, 10000);"

# Run performance test
curl -w "@curl-format.txt" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/billing/copq/incidents?institution_id=test&page=1&limit=100"

# Expected response time: < 500ms
```

#### Concurrent user test
```bash
# Use Apache Bench to simulate 100 concurrent users
ab -n 1000 -c 100 \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/billing/copq/dashboard?institution_id=test"

# Expected:
# - 0% failed requests
# - Average response time < 1s
# - 95th percentile < 2s
# - Server should not crash
```

### 8. Security Tests

#### Test institution isolation
```typescript
// User from institution A tries to access institution B's data
const resultA = await BillingCOPQService.getIncidents({
  institution_id: 'institution-a'
});

// Should only return institution A's data
expect(resultA.data.every(r => r.institution_id === 'institution-a')).toBe(true);

// Attempting to access without institution_id should fail
await expect(
  BillingCOPQService.getIncidents({} as any)
).rejects.toThrow('Institution ID is required');
```

#### Test RLS policies still work
```sql
-- Test: RLS should prevent cross-institution access at database level
SET ROLE authenticated;
SET request.jwt.claim.institution_id = 'institution-a';

-- Should only see institution A's data
SELECT COUNT(*) FROM billing_copq_incidents WHERE institution_id != 'institution-a';
-- Expected: 0 rows (RLS blocks access)
```

---

## Test Data Setup

### Create Test Dataset
```sql
-- 10,000 test incidents for performance testing
INSERT INTO billing_copq_incidents (
  institution_id,
  category,
  status,
  visible_cost,
  hidden_cost_estimate,
  description,
  incident_date,
  reported_by
)
SELECT
  'test-institution-id',
  (ARRAY['billing_error', 'refund_issued', 'discount_error', 'late_payment', 'reconciliation_error', 'payment_gateway_fee', 'scholarship_adjustment', 'fee_waiver'])[floor(random() * 8 + 1)],
  (ARRAY['logged', 'investigating', 'resolved', 'written_off'])[floor(random() * 4 + 1)],
  floor(random() * 10000)::integer, -- visible_cost in paisa
  floor(random() * 50000)::integer, -- hidden_cost in paisa
  'Test incident ' || i,
  CURRENT_DATE - (floor(random() * 365))::integer,
  NULL
FROM generate_series(1, 10000) i;

-- Verify data created
SELECT COUNT(*) FROM billing_copq_incidents WHERE institution_id = 'test-institution-id';
-- Expected: 10000
```

### Clean Up Test Data
```sql
-- Remove test data after testing
DELETE FROM billing_copq_incidents WHERE institution_id = 'test-institution-id';
```

---

## Performance Benchmarks

### Target Metrics

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| Search query | < 200ms | < 500ms | > 1s |
| Dashboard load | < 1s | < 2s | > 5s |
| List query | < 500ms | < 1s | > 2s |
| Single record | < 100ms | < 200ms | > 500ms |

### Actual Results (Record after testing)

| Operation | Baseline (Before) | After Optimization | Improvement |
|-----------|------------------|-------------------|-------------|
| Search (10K records) | 5-8s | ___ ms | ___x faster |
| Dashboard (10K records) | 15-30s | ___ ms | ___x faster |
| List (10K records) | 8-15s | ___ ms | ___x faster |
| Single record | OK | ___ ms | --- |

---

## Test Checklist

### Unit Tests
- [ ] Pagination validation with edge cases
- [ ] Search sanitization with SQL injection patterns
- [ ] Timeout wrapper with slow promises
- [ ] Base service helper methods

### Integration Tests
- [ ] Service methods with pagination
- [ ] Service methods with search
- [ ] Service methods with timeouts
- [ ] Dashboard functions return correct data

### Performance Tests
- [ ] Query performance with 10K records
- [ ] Query performance with 100K records
- [ ] Dashboard performance with large datasets
- [ ] Index usage (no full table scans)

### Load Tests
- [ ] 10 concurrent users
- [ ] 50 concurrent users
- [ ] 100 concurrent users
- [ ] 500 concurrent users
- [ ] Database connection pool doesn't saturate

### Security Tests
- [ ] Pagination limits prevent DoS
- [ ] Search sanitization prevents SQL injection
- [ ] Institution isolation works
- [ ] RLS policies still enforced
- [ ] Query timeouts prevent resource exhaustion

### Cache Tests
- [ ] React Query caching reduces duplicate queries
- [ ] Cache invalidation on mutations
- [ ] StaleTime and cacheTime work as expected
- [ ] keepPreviousData improves UX

---

## Known Issues & Limitations

### 1. Dashboard Fallback
If database functions don't exist yet, dashboard will fall back to manual calculation which is slower but still works. Solution: Ensure migrations are applied.

### 2. Large Offset Pagination
Queries with very high page numbers (e.g., page 9999) will still be slow due to PostgreSQL's offset scanning. Consider cursor-based pagination for better performance on deep pages.

### 3. Cache Invalidation
React Query cache needs manual invalidation on mutations. Make sure all mutations call `queryClient.invalidateQueries()`.

---

## Rollback Plan

If performance optimization causes issues:

### 1. Database Level
```sql
-- Drop indexes if they cause write performance issues
DROP INDEX IF EXISTS idx_nps_surveys_institution_status;
-- ... repeat for problematic indexes

-- Drop functions if they have bugs
DROP FUNCTION IF EXISTS get_billing_copq_dashboard;
-- Services will automatically fall back to manual calculation
```

### 2. Application Level
```typescript
// Disable pagination validation temporarily
const { page, limit } = filters; // Use raw values
// query.range(...) // Original pagination logic
```

### 3. React Query Level
```typescript
// Disable caching temporarily
export function useCOPQDashboard() {
  return useQuery({
    queryKey: ['copq', 'dashboard'],
    queryFn: () => BillingCOPQService.getDashboard(),
    staleTime: 0, // No caching
    cacheTime: 0,
  });
}
```

---

## Success Criteria

- [ ] All performance benchmarks met (< 1s for dashboards, < 500ms for lists)
- [ ] No security regressions (SQL injection still prevented)
- [ ] No functionality broken (all existing features work)
- [ ] Load test passes (100+ concurrent users)
- [ ] Database connection pool stable under load
- [ ] React Query cache reduces API calls by 80%+
