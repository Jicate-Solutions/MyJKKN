# [Issue/Bug Title] Fix Documentation

**Document ID**: `YYYY-MM-DD-FIX-[issue-name]`  
**Issue ID**: #[GitHub/Jira Issue Number]  
**Severity**: Critical | High | Medium | Low  
**Status**: Identified | In Progress | Fixed | Verified  
**Fixed Version**: X.Y.Z  
**Date Fixed**: YYYY-MM-DD  
**Fixed By**: [Your Name]

## Issue Summary
Brief description of the problem that was occurring.

## Impact
- **Users Affected**: All users | Specific group | Individual cases
- **Features Affected**: List of affected features
- **Data Impact**: Data loss | Data corruption | No data impact
- **Business Impact**: Revenue loss | User experience | Compliance

## Root Cause Analysis

### Symptoms
- Symptom 1: What users saw
- Symptom 2: Error messages
- Symptom 3: Unexpected behavior

### Investigation Process
1. Step 1: Initial report analysis
2. Step 2: Log review
3. Step 3: Code inspection
4. Step 4: Root cause identification

### Root Cause
Detailed explanation of what was causing the issue.

### Timeline
- **First Reported**: YYYY-MM-DD HH:MM
- **Confirmed**: YYYY-MM-DD HH:MM
- **Fix Started**: YYYY-MM-DD HH:MM
- **Fix Deployed**: YYYY-MM-DD HH:MM
- **Verified**: YYYY-MM-DD HH:MM

## Technical Details

### Affected Code
```typescript
// Before (problematic code)
function problematicFunction() {
  // Issue was here
}
```

### Fix Applied
```typescript
// After (fixed code)
function fixedFunction() {
  // Fixed implementation
}
```

### Files Changed
- `path/to/file1.ts`: Description of change
- `path/to/file2.tsx`: Description of change
- `path/to/file3.sql`: Description of change

### Database Changes
```sql
-- If any database fixes were needed
UPDATE table_name SET column = value WHERE condition;
```

## Testing

### Test Cases Added
1. **Test 1**: Description
   ```typescript
   test('should handle edge case', () => {
     // Test implementation
   });
   ```

2. **Test 2**: Description

### Verification Steps
1. Step to verify fix works
2. Step to ensure no regression
3. Step to validate edge cases

## Prevention Measures

### Code Changes
- Added validation for X
- Improved error handling in Y
- Added monitoring for Z

### Process Improvements
- New code review checklist item
- Additional testing requirements
- Documentation updates

### Monitoring Added
- Alert for condition X
- Dashboard metric for Y
- Log aggregation for Z

## Rollback Plan

### If Issue Reoccurs
1. Immediate action to take
2. How to rollback the fix
3. Alternative solution

### Rollback Commands
```bash
# Commands to rollback if needed
git revert commit-hash
npm run rollback:fix
```

## Lessons Learned

### What Went Well
- Quick identification
- Effective communication
- Clean fix implementation

### What Could Be Improved
- Earlier detection
- Better logging
- More comprehensive tests

### Action Items
- [ ] Add monitoring for similar issues
- [ ] Update testing guidelines
- [ ] Review related code for similar problems

## Related Issues

### Similar Issues
- Issue #123: Similar problem in different module
- Issue #456: Related but different root cause

### Potential Impact Areas
- Module A: Check for similar pattern
- Module B: May have same vulnerability

## Communication

### Stakeholder Updates
- **YYYY-MM-DD HH:MM**: Initial notification sent
- **YYYY-MM-DD HH:MM**: Fix in progress update
- **YYYY-MM-DD HH:MM**: Resolution notification

### User Communication
- In-app notification: Yes/No
- Email sent: Yes/No
- Documentation updated: Yes/No

## Metrics

### Before Fix
- Error rate: X%
- Response time: Ys
- Success rate: Z%

### After Fix
- Error rate: X%
- Response time: Ys
- Success rate: Z%

## Update Log
- **YYYY-MM-DD**: Issue identified
- **YYYY-MM-DD**: Fix implemented
- **YYYY-MM-DD**: Fix verified in production

---

**Keywords**: [searchable, tags, for, this, fix]  
**Components**: [affected, components]  
**References**: [links to related docs, PRs, commits]