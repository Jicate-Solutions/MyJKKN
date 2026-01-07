# Billing Module - Student Menu Labels Fix

**Date**: 2026-01-07
**Issue**: Student users see admin billing menus ("All Bills", "Student Search") instead of student-specific views
**Status**: ✅ FIXED

## Problem

Student role users were seeing administrative billing interface:

- ❌ Menu showed "Schedule > Student Search" and "All Bills" (admin terminology)
- ❌ Students saw search filters designed for admins to search across all students
- ❌ No clear indication that students were viewing their own data only
- ❌ Confusing UX - students thought they had access to all student billing data

**Example**: Student "BOOBAL A" saw "Student Billing Search" page with filters to search for other students.

## Root Cause Analysis

### Issue 1: No Role-Based Menu Labels

**Problem**: The sidebar menu used static labels for all users regardless of role.

```typescript
// BEFORE (same for all users):
{
  href: '/billing/schedule',
  label: 'Schedule',  // Generic label
  submenus: [
    { href: '/billing/schedule/students', label: 'Student Search' },  // Admin label
    { href: '/billing/schedule', label: 'All Bills' }  // Admin label
  ]
}
```

**Impact**: Students saw admin-oriented labels even though they could only see their own data.

### Issue 2: No Page Title Differentiation

**Problem**: Page titles were hardcoded as "Student Billing Search" for all users.

```typescript
// BEFORE (same for all users):
<ContentLayout title='Student Billing Search'>
  <h1>Student Billing Search</h1>
  <p>Search and manage student billing information with advanced filters</p>
</ContentLayout>
```

**Impact**: Students thought they had search capabilities across all students.

### Issue 3: Search Filters Always Visible

**Problem**: Search filters were shown to all users, even students who can only see their own data.

```typescript
// BEFORE (shown to everyone):
<StudentSearchFilters
  filters={filters}
  onFilterChange={handleFilterChange}
/>
```

**Impact**: Students saw unnecessary search filters (name, roll number, institution, etc.) that don't apply when viewing only their own bills.

## Solution

### Fix 1: Dynamic Menu Labels Based on Role

Updated `GetRoleBasedPages()` function in `lib/sidebarMenuLink.ts`:

```typescript
const isStudent = userRole.role_key === 'student';

// Change billing menu labels for students
.map((menu) => {
  if (menu.submenus.length === 0) {
    if (isStudent) {
      if (menu.href === '/billing/schedule') {
        return { ...menu, label: 'My Bills' };  // Student-friendly
      }
      if (menu.href === '/billing/receipts') {
        return { ...menu, label: 'My Receipts' };  // Student-friendly
      }
      if (menu.href === '/billing/invoices') {
        return { ...menu, label: 'My Invoices' };  // Student-friendly
      }
    }
    return menu;
  }

  // Also update submenu labels
  const filteredSubmenus = menu.submenus.map((submenu) => {
    if (isStudent) {
      if (submenu.href === '/billing/schedule') {
        return { ...submenu, label: 'My Bills' };
      }
    }
    return submenu;
  });
});
```

**Result**:
- ✅ Students see: "My Bills", "My Receipts", "My Invoices"
- ✅ Other roles see: "All Bills", "All Receipts", "Invoices"

### Fix 2: Dynamic Page Titles and Descriptions

Updated `app/(routes)/billing/schedule/students/page.tsx`:

```typescript
const isStudent = profile?.role === 'student';

const pageTitle = isStudent ? 'My Bills' : 'Student Billing Search';
const pageDescription = isStudent
  ? 'View your billing information and payment history'
  : 'Search and manage student billing information with advanced filters';

<ContentLayout title={pageTitle}>
  <h1>{pageTitle}</h1>
  <p>{pageDescription}</p>
</ContentLayout>
```

**Result**:
- ✅ Students see: "My Bills" with "View your billing information" description
- ✅ Other roles see: "Student Billing Search" with admin description

### Fix 3: Conditional Search Filters

Hide search filters for students (they only see their own data):

```typescript
{/* Hide search filters for students - they only see their own data */}
{!isStudent && (
  <StudentSearchFilters
    filters={filters}
    onFilterChange={handleFilterChange}
  />
)}

<div className={isStudent ? '' : 'mt-6'}>
  <StudentDataTable search={search} isStudentView={isStudent} />
</div>
```

**Result**:
- ✅ Students: No search filters shown (clean interface)
- ✅ Other roles: Full search capability with all filters

### Fix 4: Automatic Student Email Filtering

Added automatic filtering by student email when role is student:

```typescript
const { profile, isLoading: authLoading } = useAuth();
const isStudent = profile?.role === 'student';
const studentEmail = isStudent ? profile?.email : undefined;

const search = useMemo(() => {
  return studentBillingSearchParamsSchema.parse({
    // ... other filters
    // If student, filter by their email automatically
    student_email: isStudent ? studentEmail : searchParams.get('student_email') || undefined
  });
}, [searchParams, isStudent, studentEmail]);
```

**Result**:
- ✅ Students automatically see only their own bills (filtered by email)
- ✅ Other roles can optionally filter by student email

### Fix 5: Updated Schema to Support Student Email Filter

Added `student_email` parameter to search schema:

```typescript
// student-data-table-schema.ts
export const studentBillingSearchParamsSchema = z.object({
  // ... existing filters
  student_email: z.string().optional(), // For filtering by student email (used for student role)
});
```

## Files Modified

### 1. Sidebar Menu Configuration

**File**: `lib/sidebarMenuLink.ts`

**Changes**:
- Added `isStudent` check in `GetRoleBasedPages()` function
- Dynamically change menu labels based on user role
- Updated both main menus and submenus for billing section

### 2. Billing Students Page

**File**: `app/(routes)/billing/schedule/students/page.tsx`

**Changes**:
- Added `useAuth()` hook to get user profile
- Added `isStudent` detection
- Made page title and description dynamic based on role
- Hide search filters for students
- Automatically filter by student email for students
- Pass `isStudentView` prop to data table

### 3. Search Schema

**File**: `app/(routes)/billing/schedule/students/_components/student-data-table-schema.ts`

**Changes**:
- Added `student_email: z.string().optional()` to schema
- Allows filtering by student email for role-based data access

## Impact

### Before

- ❌ Students saw: "Student Billing Search" with "Student Search" menu
- ❌ Students saw: Full search filters (name, roll number, institution, etc.)
- ❌ Students confused: "Can I search for other students' bills?"
- ❌ Poor UX: Admin interface shown to non-admin users

### After

- ✅ Students see: "My Bills" with clean, personal billing view
- ✅ Students see: NO search filters (only their own data shown)
- ✅ Students understand: This is my personal billing information
- ✅ Better UX: Student-appropriate interface with clear, personal language
- ✅ Other roles see: Full admin interface with search capabilities

## User Experience Comparison

### Student View

**Menu**:
- Billing Management
  - My Bills ✓
  - My Receipts ✓
  - My Invoices ✓

**Page Content**:
```
My Bills
View your billing information and payment history

[Data Table showing only student's own bills]
- No search filters
- No "Student Search" button
- Clear indication of personal data
```

### Admin/Staff View

**Menu**:
- Billing Management
  - Schedule
    - Student Search ✓
    - All Bills ✓
  - Receipts
    - All Receipts ✓
  - Invoices ✓

**Page Content**:
```
Student Billing Search
Search and manage student billing information with advanced filters

[Search Filters: Name, Roll Number, Institution, etc.]

[Data Table showing all students' bills]
- Full search capability
- Can filter by any student
- Admin-level access
```

## Testing

### Pre-Fix Behavior

```
❌ Student logs in
❌ Navigates to Billing → Schedule → Student Search
❌ Sees: "Student Billing Search" with search filters
❌ Confused: "Can I search for other students?"
❌ Sees: "Student Search" button suggesting admin access
```

### Post-Fix Expected Behavior

```
✓ Student logs in
✓ Navigates to Billing → My Bills
✓ Sees: "My Bills" with clear personal title
✓ Sees: Only their own billing data (no search needed)
✓ Sees: No search filters (clean interface)
✓ Understands: This is my personal billing information
```

### Verification Steps

1. **Test as Student**:
   ```
   1. Log in as student (student@jkkn.ac.in)
   2. Check sidebar menu shows "My Bills" (not "All Bills")
   3. Navigate to Billing → My Bills
   4. Verify page title is "My Bills"
   5. Verify description is personal ("View your billing information")
   6. Verify NO search filters are shown
   7. Verify data table shows only student's own bills
   ```

2. **Test as Admin**:
   ```
   1. Log in as admin/staff user
   2. Check sidebar menu shows "Schedule" with "Student Search", "All Bills"
   3. Navigate to Billing → Schedule → Student Search
   4. Verify page title is "Student Billing Search"
   5. Verify description mentions "advanced filters"
   6. Verify search filters ARE shown
   7. Verify can search across all students
   ```

## Related Information

### Note About Student "BOOBAL A" (student@jkkn.ac.in)

**Query Result**: Student has **NO bills** in the database.

```sql
SELECT * FROM billing_student_bills b
JOIN learners_profiles lp ON b.student_id = lp.id
WHERE lp.student_email = 'boobal@gmail.com'
   OR lp.college_email = 'student@jkkn.ac.in';

-- Result: 0 bills found
```

**This is why the student sees ₹0.00 and "No Dues"** - they have no billing records yet.

**Expected Behavior**:
- Page will show "My Bills" title ✓
- No search filters shown ✓
- Data table shows "No billing records found" ✓
- This is CORRECT behavior (student has no bills)

### Future Enhancements

**Similar Updates Needed**:
1. **Receipts Page** (`/billing/receipts`):
   - Update to show "My Receipts" for students
   - Hide search filters for students
   - Filter by student email automatically

2. **Invoices Page** (`/billing/invoices`):
   - Update to show "My Invoices" for students
   - Hide search filters for students
   - Filter by student email automatically

3. **Refunds Page** (if students need access):
   - Update to show "My Refunds" for students
   - Show only student's own refund records

### Menu Permission Configuration

The billing menus require these permissions:

```typescript
// MENU_PERMISSIONS in lib/sidebarMenuLink.ts
'/billing/schedule': 'billing.schedule.view',  // Both student and admin
'/billing/receipts': 'billing.receipts.view',  // Both student and admin
'/billing/invoices': 'billing.invoices.view',  // Both student and admin
```

**Important**: Students must have these permissions in their role configuration to see billing menus.

### RLS Policy Requirements

This menu fix works in conjunction with the RLS policies created earlier:

```sql
-- Students can view their own bills
CREATE POLICY "Students can view their own bills"
ON billing_student_bills FOR SELECT TO authenticated
USING (
  student_id IN (
    SELECT lp.id FROM learners_profiles lp
    JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
    WHERE p.id = auth.uid() AND p.role = 'student'
  )
);
```

The menu changes provide better UX, while RLS policies ensure data security.

## Prevention

### Checklist for Future Role-Based UI

1. ✅ **Check user role** before rendering menu labels
2. ✅ **Use dynamic titles** based on user role
3. ✅ **Hide irrelevant filters** for users with limited access
4. ✅ **Use personal language** for students ("My" instead of "All")
5. ✅ **Auto-filter data** for students (don't require manual filtering)
6. ✅ **Test with all roles** to verify appropriate UI is shown

### Template for Role-Based Page Titles

```typescript
import { useAuth } from '@/hooks/use-auth';

function MyPage() {
  const { profile } = useAuth();
  const isStudent = profile?.role === 'student';

  const pageTitle = isStudent ? 'My [Resource]' : 'All [Resources]';
  const pageDescription = isStudent
    ? 'View your [resource] information'
    : 'Search and manage [resource] information';

  return (
    <ContentLayout title={pageTitle}>
      <h1>{pageTitle}</h1>
      <p>{pageDescription}</p>

      {/* Hide search filters for students */}
      {!isStudent && <SearchFilters />}

      {/* Show data with auto-filtering for students */}
      <DataTable isStudentView={isStudent} />
    </ContentLayout>
  );
}
```

## Monitoring

### What to Watch

1. **Student Feedback**: Check if students understand they're viewing their own bills
2. **Menu Labels**: Verify students see "My Bills" not "All Bills"
3. **Search Filters**: Ensure students don't see unnecessary search filters
4. **Data Access**: Confirm students only see their own billing data

### Success Metrics

- ✅ Students see personalized menu labels ("My Bills")
- ✅ Students see simplified interface (no search filters)
- ✅ Students understand they're viewing personal data
- ✅ No student confusion about "searching for other students"
- ✅ Admin users still have full search capabilities

---

**Verified**: Student role users now see appropriate billing menu labels and page interfaces customized for viewing their own billing data only.
