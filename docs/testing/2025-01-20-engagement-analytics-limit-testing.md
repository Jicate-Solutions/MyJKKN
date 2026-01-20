# Testing Guide: Engagement Analytics 1000 Record Limit Fix

**Date:** 2025-01-20
**Related Fix:** [2025-01-20-FIX-engagement-analytics-1000-record-limit.md](../fixes/2025-01/2025-01-20-FIX-engagement-analytics-1000-record-limit.md)

## Overview

This guide provides step-by-step testing instructions to verify that the Engagement Analytics now correctly handles more than 1000 student records.

## Prerequisites

- ✅ Dev server running (`npm run dev`)
- ✅ Browser DevTools open (Console tab)
- ✅ Access to Activity page at `/users/activity`
- ✅ Test data with various student counts

## Test Scenarios

### Test 1: Small Institution (< 1000 Students)

**Expected:** Normal operation, no warnings

**Steps:**
1. Navigate to `/users/activity`
2. Click "Engagement Analytics" tab
3. Select an institution with < 1000 students
4. Select date range (last 30 days)
5. Click "Apply Filters"

**Verification:**
- ✅ All students displayed in table
- ✅ No console warnings
- ✅ Metrics show correct student counts
- ✅ Charts render properly

**Console Check:**
```javascript
// Should be empty (no warnings)
```

---

### Test 2: Medium Institution (1000-5000 Students)

**Expected:** All students loaded, no warnings (within new 10k limit)

**Steps:**
1. Navigate to `/users/activity`
2. Click "Engagement Analytics" tab
3. Select institution with 1000-5000 students
4. Select date range (last 30 days)
5. Click "Apply Filters"
6. Open Browser Console

**Verification:**
- ✅ All students displayed (not truncated at 1000)
- ✅ No console warnings (count < 10,000)
- ✅ Student count matches database records
- ✅ Pagination works smoothly in table

**Console Check:**
```javascript
// Should be empty (no warnings, under limit)
```

**SQL Verification:**
```sql
-- Run in Supabase SQL Editor
SELECT COUNT(*) as total_students
FROM student_engagement_scores
WHERE institution_id = 'YOUR_INSTITUTION_ID'
  AND calculation_date = CURRENT_DATE;

-- Compare count with UI display
```

---

### Test 3: Large Institution (5000-10000 Students)

**Expected:** All students loaded, no warnings (at new 10k limit)

**Steps:**
1. Navigate to `/users/activity`
2. Click "Engagement Analytics" tab
3. Select institution with 5000-10000 students
4. Select date range (last 30 days)
5. Click "Apply Filters"
6. Monitor Browser Console

**Verification:**
- ✅ All students displayed
- ✅ No warnings (still under 10k limit)
- ✅ Performance acceptable (< 2 seconds load time)
- ✅ Table scrolling remains smooth

**Performance Check:**
```javascript
// In Browser Console
performance.now() // Before API call
// Wait for data to load
performance.now() // After data rendered
// Difference should be < 2000ms
```

---

### Test 4: Very Large Institution (> 10000 Students)

**Expected:** 10,000 students loaded, console warning appears

**Steps:**
1. Navigate to `/users/activity`
2. Click "Engagement Analytics" tab
3. Select institution with > 10,000 students
4. Open Browser Console **before** applying filters
5. Click "Apply Filters"
6. Watch for console warning

**Verification:**
- ✅ First 10,000 students displayed
- ✅ **Console warning appears** (critical check!)
- ✅ Warning message indicates total count
- ⚠️ UI shows indication that pagination needed

**Expected Console Warning:**
```javascript
[EngagementService] Query limit reached: 10000 students.
Total students: 12534. Consider implementing pagination for this scope.
```

**Action Required:**
If this warning appears, notify development team that pagination implementation is needed for this institution.

---

### Test 5: At-Risk Students (All Sizes)

**Expected:** All at-risk students loaded (up to 10k)

**Steps:**
1. Navigate to `/users/activity`
2. Click "Engagement Analytics" tab
3. Apply filters for institution
4. Click on "At-Risk Students" card (red card with count)
5. Verify modal shows all at-risk students

**Verification:**
- ✅ At-Risk modal displays all students
- ✅ Count matches dashboard metric
- ✅ No console warnings (unless > 10k at-risk students - rare)

**SQL Verification:**
```sql
SELECT COUNT(*) as at_risk_count
FROM student_engagement_scores
WHERE institution_id = 'YOUR_INSTITUTION_ID'
  AND calculation_date = CURRENT_DATE
  AND is_at_risk = true;
```

---

### Test 6: Section Comparison

**Expected:** All sections displayed (up to 500)

**Steps:**
1. Navigate to `/users/activity`
2. Click "Engagement Analytics" tab
3. Select **Semester** level (not institution)
4. Select a semester with many sections
5. Verify section comparison table

**Verification:**
- ✅ All sections displayed
- ✅ Engagement scores calculated correctly
- ✅ No console warnings (most semesters have < 100 sections)
- ✅ Can click sections to drill down

**Note:** If semester has > 500 sections (very rare), console warning will appear.

---

## Regression Testing

### Existing Features Still Work

**Test:**
1. ✅ Activity Logs tab (unchanged, uses pagination)
2. ✅ Date range filters
3. ✅ Organization level filters (institution/department/program/semester/section)
4. ✅ Export functionality
5. ✅ Student detail modal
6. ✅ Charts and metrics

---

## Performance Testing

### Browser Memory Usage

**Steps:**
1. Open Chrome DevTools → Performance → Memory
2. Take heap snapshot before loading data
3. Load engagement analytics with 5000+ students
4. Take heap snapshot after data loads
5. Compare memory usage

**Expected:**
- Memory increase: < 50MB for 10,000 students
- No memory leaks on data refresh
- GC cleans up old data properly

**How to Check:**
```javascript
// In Browser Console
performance.memory.usedJSHeapSize / 1048576 // MB before
// Load data
performance.memory.usedJSHeapSize / 1048576 // MB after
// Difference should be < 50MB
```

---

### API Response Time

**Test Different Data Sizes:**

| Student Count | Expected Response Time |
|---------------|------------------------|
| < 1000 | < 500ms |
| 1000-3000 | 500ms - 1000ms |
| 3000-5000 | 1000ms - 1500ms |
| 5000-10000 | 1500ms - 2500ms |
| > 10000 | 2500ms+ (pagination needed) |

**How to Measure:**
1. Open Browser DevTools → Network tab
2. Filter by "engagement" in requests
3. Check response time in "Time" column

---

## Edge Cases

### Edge Case 1: Exactly 1000 Students

**Test:**
- Institution with exactly 1000 students
- Should load all 1000 with no warning

**Expected:**
- ✅ All 1000 students displayed
- ✅ No console warning (< 10,000 limit)

---

### Edge Case 2: Exactly 10,000 Students

**Test:**
- Institution with exactly 10,000 students
- Should load all but trigger warning

**Expected:**
- ✅ All 10,000 students displayed
- ⚠️ Console warning appears (at limit)

---

### Edge Case 3: No Students

**Test:**
- Section with no enrolled students
- Should show empty state

**Expected:**
- ✅ Empty state message displayed
- ✅ No errors in console
- ✅ No API failures

---

### Edge Case 4: Network Failure

**Test:**
- Simulate network failure (DevTools → Network → Offline)
- Attempt to load engagement data

**Expected:**
- ✅ Error message displayed to user
- ✅ Retry button available
- ✅ No console errors (handled gracefully)

---

## Browser Compatibility

Test in multiple browsers:

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

## Automated Testing (Future)

### Unit Tests

```typescript
// lib/services/analytics/engagement-service.test.ts
describe('EngagementService Limit Handling', () => {
  it('should apply 10k limit to student queries', async () => {
    const mockSupabase = createMockSupabase();
    const result = await EngagementService.getMetrics(request, userId);
    expect(mockSupabase.limit).toHaveBeenCalledWith(10000);
  });

  it('should log warning when hitting limit', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn');
    // Mock count = 10,000
    await EngagementService.getMetrics(request, userId);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Query limit reached')
    );
  });
});
```

### Integration Tests

```typescript
// e2e/engagement-analytics.spec.ts
test('should load all students up to 10k', async ({ page }) => {
  await page.goto('/users/activity');
  await page.click('[data-testid="engagement-tab"]');

  // Select large institution
  await page.selectOption('[data-testid="institution-select"]', 'large-institution-id');
  await page.click('[data-testid="apply-filters"]');

  // Wait for data to load
  await page.waitForSelector('[data-testid="student-table"]');

  // Verify student count
  const studentCount = await page.locator('[data-testid="student-row"]').count();
  expect(studentCount).toBeLessThanOrEqual(10000);
});
```

---

## Rollback Plan

If critical issues are found:

1. **Immediate Rollback:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Alternative Fix:**
   - Lower limit to 5,000 temporarily
   - Implement pagination immediately
   - Notify users of limitation

3. **Communication:**
   - Alert stakeholders of issue
   - Provide ETA for resolution
   - Document lessons learned

---

## Success Criteria

✅ **All tests pass:**
- [ ] Small institution test (< 1000 students)
- [ ] Medium institution test (1000-5000 students)
- [ ] Large institution test (5000-10000 students)
- [ ] Very large institution test (> 10000 students with warning)
- [ ] At-risk students test
- [ ] Section comparison test
- [ ] Performance benchmarks met
- [ ] No regression in existing features

✅ **Performance acceptable:**
- [ ] Load time < 2 seconds for 5000 students
- [ ] Memory usage < 50MB increase
- [ ] No browser freezing or lag

✅ **Warnings working:**
- [ ] Console warnings appear for > 10k students
- [ ] Warning messages are clear and actionable

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | Claude Code | 2025-01-20 | ✅ Code Complete |
| QA Engineer | ___________ | __________ | ⏳ Pending |
| Product Owner | ___________ | __________ | ⏳ Pending |
| DevOps | ___________ | __________ | ⏳ Pending |

---

## Notes

- Document any issues found during testing
- Report performance bottlenecks
- Suggest improvements for future iterations
