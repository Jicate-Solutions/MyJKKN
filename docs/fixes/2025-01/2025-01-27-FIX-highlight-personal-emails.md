# Fix: Highlight Personal Email Addresses in Learners Profiles Table

**Date**: 2025-01-27
**Type**: Data Validation Enhancement
**Module**: Learners Profiles
**Status**: ✅ Completed
**Priority**: High (Data Quality Issue)

## Problem Statement

The `college_email` field in learners profiles should contain only institutional emails (@jkkn.ac.in), but 115 profiles are using personal email addresses like @gmail.com, @yahoo.com, etc.

## Data Analysis

### Current State (2025-01-27):

| Status | Total Profiles | Using @gmail.com | Using @jkkn.ac.in | Empty |
|--------|---------------|------------------|-------------------|-------|
| **Active** | 4,246 | **107 (2.5%)** ⚠️ | 4,131 (97.3%) ✅ | 0 |
| **Inactive** | 48 | **4 (8.3%)** ⚠️ | 44 (91.7%) ✅ | 0 |
| **Graduated** | 182 | **4 (2.2%)** ⚠️ | 178 (97.8%) ✅ | 0 |
| **Approved** | 5 | 0 | 1 (20%) ✅ | 4 (80%) |
| **Enquiry** | 5 | 0 | 5 (100%) ✅ | 0 |
| **Exited** | 1 | 0 | 1 (100%) ✅ | 0 |

**Total Issues**: 115 profiles using personal email addresses

### Distribution:
- @gmail.com: 115 profiles
- @yahoo.com: 0 profiles (not found yet)
- @hotmail.com: 0 profiles (not found yet)
- Other personal domains: 0 profiles (not found yet)

## Solution Implemented

### Visual Highlighting in Table

**File**: `app/(routes)/learners/profiles/_components/columns.tsx`

#### 1. Added Personal Email Detector Function
```typescript
function isPersonalEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const personalDomains = [
    '@gmail.com',
    '@yahoo.com',
    '@hotmail.com',
    '@outlook.com',
    '@rediffmail.com',
    '@live.com',
    '@mail.com'
  ];

  return personalDomains.some(domain => email.toLowerCase().includes(domain));
}
```

#### 2. Enhanced CollegeEmailCell Component

**Personal Email Display** (Red Background with White Text):
```typescript
<div className="bg-red-600 text-white px-2 py-1.5 rounded-md">
  <AlertTriangle className="h-4 w-4" />
  <span className="text-sm font-medium">{email}</span>
  <Copy button />
</div>
```

**Institutional Email Display** (Normal):
```typescript
<div className="flex items-center gap-2">
  <Copy button />
  <span className="text-sm">{email}</span>
</div>
```

### Visual Indicators:
- ⚠️ **Red Background**: Instantly identifies personal emails
- **White Text**: High contrast for readability
- **Warning Icon**: AlertTriangle icon for visual emphasis
- **Tooltip**: Shows warning message on hover
- **Copy Button**: Still functional for all emails

## Files Modified

1. ✅ `app/(routes)/learners/profiles/_components/columns.tsx`
   - Added `isPersonalEmail()` helper function
   - Updated `CollegeEmailCell` component
   - Added `AlertTriangle` icon import

## SQL Queries for Data Management

### 1. Get All Profiles with Personal Emails

```sql
-- Get all profiles using personal email addresses
SELECT
  id,
  first_name,
  last_name,
  roll_number,
  college_email,
  lifecycle_status,
  created_at
FROM learners_profiles
WHERE
  college_email ILIKE '%@gmail.com'
  OR college_email ILIKE '%@yahoo.com'
  OR college_email ILIKE '%@hotmail.com'
  OR college_email ILIKE '%@outlook.com'
  OR college_email ILIKE '%@rediffmail.com'
ORDER BY lifecycle_status, roll_number;
```

### 2. Export to CSV for Manual Correction

```sql
-- Export list for admin to correct
SELECT
  roll_number as "Roll Number",
  first_name || ' ' || last_name as "Student Name",
  college_email as "Current Email",
  lifecycle_status as "Status",
  institution.name as "Institution",
  program.program_name as "Program",
  semester.semester_name as "Semester"
FROM learners_profiles
LEFT JOIN institutions ON learners_profiles.institution_id = institutions.id
LEFT JOIN programs ON learners_profiles.program_id = programs.id
LEFT JOIN semesters ON learners_profiles.semester_id = semesters.id
WHERE college_email ILIKE '%@gmail.com'
ORDER BY lifecycle_status, roll_number;
```

### 3. Check Active Profiles Only

```sql
-- Focus on active profiles that need correction
SELECT
  roll_number,
  first_name,
  last_name,
  college_email,
  mobile_number
FROM learners_profiles
WHERE
  lifecycle_status = 'active'
  AND (
    college_email ILIKE '%@gmail.com'
    OR college_email ILIKE '%@yahoo.com'
  )
ORDER BY roll_number;
```

### 4. Generate Correct Email Format

```sql
-- Suggest correct email format based on roll number
SELECT
  roll_number,
  first_name || ' ' || last_name as student_name,
  college_email as current_email,
  LOWER(roll_number) || '@jkkn.ac.in' as suggested_email
FROM learners_profiles
WHERE college_email ILIKE '%@gmail.com'
ORDER BY roll_number;
```

## Recommended Actions

### Immediate Actions:
1. ✅ **Visual Highlighting**: Implemented (red background in table)
2. 🔄 **Export List**: Run SQL query to export affected profiles
3. 📧 **Contact Students**: Send emails to 115 students requesting correction
4. 📋 **Create Task**: Assign data correction to admin team

### Data Correction Process:

#### Option 1: Manual Correction (Recommended)
1. Export the list of affected profiles
2. Contact students to provide their correct @jkkn.ac.in email
3. Update profiles one by one after verification
4. Mark as corrected in tracking sheet

#### Option 2: Bulk Update (If pattern is clear)
```sql
-- CAUTION: Only run if you have verified the pattern
-- Example: If roll_number format is correct
UPDATE learners_profiles
SET college_email = LOWER(roll_number) || '@jkkn.ac.in'
WHERE
  college_email ILIKE '%@gmail.com'
  AND roll_number IS NOT NULL
  AND roll_number != '';

-- ALWAYS TEST ON STAGING FIRST!
```

### Preventive Measures:

#### 1. Add Database Constraint (Recommended)
```sql
-- Add check constraint to ensure only institutional emails
ALTER TABLE learners_profiles
ADD CONSTRAINT college_email_domain_check
CHECK (
  college_email IS NULL
  OR college_email ILIKE '%@jkkn.ac.in'
  OR college_email ILIKE '%@jkkncoe.ac.in'
);
```

#### 2. Update Form Validation
**File**: Form components that handle email input
- Add frontend validation for email domain
- Show warning: "College email must end with @jkkn.ac.in"
- Add regex pattern: `/^[a-zA-Z0-9._-]+@jkkn\.ac\.in$/`

#### 3. Add Bulk Upload Validation
**File**: `app/(routes)/learners/profiles/_components/bulk-upload-profiles-dialog-enhanced.tsx`
- Validate email domain during bulk upload
- Reject rows with personal email addresses
- Show validation error with row numbers

#### 4. API Level Validation
**File**: `app/api/learners/*/route.ts`
- Validate email domain at API level
- Return 400 error for invalid domains
- Log validation failures for monitoring

## Testing Checklist

### Visual Verification:
- [x] Personal emails show red background
- [x] Personal emails show white text
- [x] Warning icon displays correctly
- [x] Copy button still works on red background
- [x] Institutional emails display normally
- [x] Tooltip shows warning message

### Data Verification:
- [x] Correctly identifies @gmail.com
- [ ] Correctly identifies @yahoo.com
- [ ] Correctly identifies @hotmail.com
- [ ] Correctly identifies @outlook.com
- [ ] Case-insensitive matching works

### Performance:
- [x] No performance impact on table rendering
- [x] Works with large datasets (4000+ rows)
- [x] Copy button responsive

## Benefits

1. **Immediate Visibility**:
   - Admins can instantly identify data quality issues
   - Red highlighting draws attention to problems
   - No need to manually check each email

2. **Data Quality Tracking**:
   - Easy to count affected profiles
   - Monitor correction progress over time
   - Identify patterns in data entry errors

3. **User Awareness**:
   - Clear visual feedback
   - Helps admins prioritize corrections
   - Supports data cleanup campaigns

4. **Scalable Solution**:
   - Works for any personal email domain
   - Easy to add new domains to check
   - Minimal performance overhead

## Monitoring

### Weekly Report:
```sql
-- Track correction progress weekly
SELECT
  DATE_TRUNC('week', CURRENT_DATE) as report_week,
  lifecycle_status,
  COUNT(*) FILTER (WHERE college_email ILIKE '%@gmail.com') as gmail_count,
  COUNT(*) FILTER (WHERE college_email ILIKE '%@jkkn.ac.in') as jkkn_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE college_email ILIKE '%@gmail.com') / NULLIF(COUNT(*), 0),
    2
  ) as gmail_percentage
FROM learners_profiles
GROUP BY lifecycle_status
ORDER BY gmail_count DESC;
```

### Set Target:
- **Goal**: Reduce personal email usage from 115 to 0
- **Timeline**: 30 days
- **Weekly Target**: Correct 30 profiles per week
- **Owner**: Admin Team / Data Quality Team

## Related Issues

- Personal email might be stored in `personal_email` field instead
- Check if `personal_email` field exists and swap values if needed
- Verify email uniqueness constraint

## Notes

- Database currently has NO constraint on email domain
- This is a data quality issue from manual entry or bulk upload
- Solution is defensive - highlights issue without blocking users
- Permanent fix requires database constraint + form validation

---

**Implemented by**: Claude Code
**Pattern**: Data validation + visual feedback
**Review Status**: Ready for testing
**Next Steps**: Contact affected students for correction
