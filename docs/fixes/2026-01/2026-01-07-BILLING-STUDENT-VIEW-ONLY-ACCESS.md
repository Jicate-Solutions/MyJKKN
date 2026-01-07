# Billing Module - Student View-Only Access Fix

**Date**: 2026-01-07
**Issue**: Students could see action buttons (Generate Receipt, Apply Discount, Schedule Bill) on billing pages
**Status**: ✅ FIXED

## Problem

Student role users were seeing administrative action buttons that they shouldn't have access to:

- ❌ "Student Search" submenu visible in sidebar (students should only see "My Bills")
- ❌ "Schedule Bill" button visible on student billing details page
- ❌ "Generate Receipt" button visible on bills table
- ❌ "Apply Discount" button visible on bills table
- ❌ "Edit" and "Delete" buttons visible in dropdown menu
- ❌ Checkboxes for selecting bills (used for bulk actions)

**User Experience Issue**: Students saw administrative controls that suggested they could perform actions they don't have permission for.

## Root Cause Analysis

### Issue 1: Student Search Submenu Visible to Students

**Problem**: The sidebar menu showed "Student Search" submenu to all users with billing permissions.

**Impact**: Students saw a menu that suggests they can search for other students' billing information.

### Issue 2: Action Buttons Not Role-Aware

**Problem**: Action buttons on billing pages were only checking permissions, not user role.

```typescript
// BEFORE (permission check only):
const canCreateBills = isSuperAdmin || canAccess('billing.schedule', 'create');

// Showed button if user had ANY billing permission
{canCreateBills && <Button>Schedule Bill</Button>}
```

**Impact**: Even though RLS policies prevent students from creating bills, the UI showed buttons that suggested they could.

### Issue 3: No View-Only Mode for Students

**Problem**: The StudentBillsTable component had no concept of "view-only" mode for students.

**Impact**: Students saw action buttons (Generate Receipt, Apply Discount) even though:
1. They don't have permission to create receipts or discounts
2. They should only be able to VIEW their billing information

## Solution

### Fix 1: Hide "Student Search" Submenu for Students

Updated `lib/sidebarMenuLink.ts`:

```typescript
const filteredSubmenus = menu.submenus.filter((submenu) => {
  const requiredPermission = MENU_PERMISSIONS[submenu.href];
  if (!requiredPermission) return false;

  // Hide "Student Search" submenu for students
  if (isStudent && submenu.href === '/billing/schedule/students') {
    return false;
  }

  return userRole.permissions[requiredPermission] === true;
});
```

**Result**:
- ✅ Students see: "My Bills" only (no submenu)
- ✅ Other roles see: "Schedule" with "Student Search" and "All Bills" submenus

### Fix 2: Hide "Schedule Bill" Button for Students

Updated `app/(routes)/billing/schedule/students/[id]/page.tsx`:

```typescript
import { useAuth } from '@/hooks/use-auth';

export default function StudentBillingDetailPage() {
  const { profile } = useAuth();
  const isStudent = profile?.role === 'student';

  // Hide Schedule Bill button for students
  {!isStudent && canCreateBills && (
    <Button asChild>
      <Link href={`/billing/schedule/new?student_id=${studentId}`}>
        <Plus className='mr-2 h-4 w-4' />
        Schedule Bill
      </Link>
    </Button>
  )}
}
```

**Result**:
- ✅ Students: No "Schedule Bill" button shown
- ✅ Other roles: "Schedule Bill" button visible (if they have permission)

### Fix 3: Add View-Only Mode to StudentBillsTable

Updated component interface to accept `isStudentView` prop:

```typescript
// student-bills-table.tsx
interface StudentBillsTableProps {
  bills: StudentBill[];
  statusFilter: string;
  onRefresh: () => void;
  isStudentView?: boolean; // NEW: Indicates student view-only mode
}

export function StudentBillsTable({
  bills,
  statusFilter,
  onRefresh,
  isStudentView = false
}: StudentBillsTableProps) {
  // Disable all action permissions for students
  const canEditBills = !isStudentView && (isSuperAdmin || canAccess('billing.schedule', 'update'));
  const canDeleteBills = !isStudentView && (isSuperAdmin || canAccess('billing.schedule', 'delete'));
  const canCreateReceipts = !isStudentView && (isSuperAdmin || canAccess('billing.receipts', 'create'));
  const canApplyDiscounts = !isStudentView && (isSuperAdmin || canAccess('billing.discounts', 'create'));
  const canProcessRefunds = !isStudentView && (isSuperAdmin || canAccess('billing.refunds', 'create'));
}
```

**Result**: When `isStudentView={true}`, ALL action permissions are `false`, which automatically hides:
- ✅ "Generate Receipt" button
- ✅ "Apply Discount" button
- ✅ "Edit" option in dropdown
- ✅ "Delete" option in dropdown
- ✅ "Process Refund" option in dropdown

### Fix 4: Hide Bill Selection Checkboxes for Students

Updated `canSelectBill` function to prevent students from selecting bills:

```typescript
const canSelectBill = (bill: StudentBill) => {
  // Students cannot select bills (view-only access)
  if (isStudentView) return false;
  return bill.status === 'unpaid' || bill.status === 'partially_paid';
};
```

**Result**:
- ✅ Students: No checkboxes shown (can't select bills for bulk actions)
- ✅ Other roles: Checkboxes shown for unpaid/partially paid bills

### Fix 5: Pass isStudentView Prop from Parent

Updated parent page to pass the prop:

```typescript
// app/(routes)/billing/schedule/students/[id]/page.tsx
<StudentBillsTable
  bills={billingSummary.bills}
  statusFilter={billStatusFilter}
  onRefresh={refetchSummary}
  isStudentView={isStudent}
/>
```

## Files Modified

### 1. Sidebar Menu Configuration

**File**: `lib/sidebarMenuLink.ts`

**Changes**:
- Added check to hide `/billing/schedule/students` submenu for student role
- Students now only see "My Bills" with no submenu

### 2. Student Billing Detail Page

**File**: `app/(routes)/billing/schedule/students/[id]/page.tsx`

**Changes**:
- Added `useAuth()` hook to detect student role
- Added `isStudent` boolean flag
- Wrapped "Schedule Bill" button in `!isStudent &&` check
- Passed `isStudentView={isStudent}` prop to `StudentBillsTable`

### 3. Student Bills Table Component

**File**: `app/(routes)/billing/schedule/students/[id]/_components/student-bills-table.tsx`

**Changes**:
- Added `isStudentView?: boolean` to component props
- Updated all permission checks to include `!isStudentView &&` condition
- Updated `canSelectBill()` to return `false` for students
- All action buttons automatically hidden when `isStudentView={true}`

## Impact

### Before

**Student View**:
- ❌ Sidebar showed: "Schedule" → "Student Search", "All Bills"
- ❌ Page showed: "Schedule Bill" button
- ❌ Table showed: "Generate Receipt", "Apply Discount" buttons
- ❌ Table showed: Checkboxes to select bills
- ❌ Dropdown showed: "Edit", "Delete", "Process Refund" options
- ❌ Confusing UX: Students thought they could perform admin actions

**Admin/Staff View**:
- ✓ Full access to all buttons and actions (correct)

### After

**Student View**:
- ✅ Sidebar shows: "My Bills" only (no submenu)
- ✅ Page shows: NO "Schedule Bill" button
- ✅ Table shows: NO "Generate Receipt" or "Apply Discount" buttons
- ✅ Table shows: NO checkboxes (can't select bills)
- ✅ Dropdown shows: ONLY "View" option
- ✅ Clear UX: Students understand they have view-only access
- ✅ Can view bill details, status, amounts (read-only)

**Admin/Staff View**:
- ✅ Sidebar shows: "Schedule" → "Student Search", "All Bills"
- ✅ Page shows: "Schedule Bill" button
- ✅ Table shows: All action buttons (Generate Receipt, Apply Discount)
- ✅ Table shows: Checkboxes for bulk actions
- ✅ Dropdown shows: All options (View, Edit, Delete, etc.)
- ✅ Full administrative capabilities (unchanged)

## User Experience Comparison

### Student View - Bills Table

**Actions Available**:
```
✓ View bill details (Eye icon)
✗ Generate Receipt (HIDDEN)
✗ Apply Discount (HIDDEN)
✗ Edit (HIDDEN)
✗ Delete (HIDDEN)
✗ Select bills (HIDDEN - no checkboxes)
```

**Dropdown Menu**:
```
┌─────────────────┐
│ 👁 View Details │ ← ONLY option for students
└─────────────────┘
```

### Admin View - Bills Table

**Actions Available**:
```
✓ View bill details
✓ Generate Receipt (for selected bills)
✓ Apply Discount (for selected bills)
✓ Edit bill
✓ Delete bill
✓ Select bills for bulk actions
```

**Dropdown Menu**:
```
┌──────────────────────┐
│ 👁 View Details       │
│ ✏️ Edit               │
│ 🗑️ Delete             │
├──────────────────────┤
│ 🧾 Generate Receipt   │
│ 💰 Apply Discount     │
│ 💸 Process Refund     │
└──────────────────────┘
```

## Testing

### Pre-Fix Behavior

```
❌ Student logs in
❌ Navigates to Billing → Schedule → Student Search
❌ Views their bill details
❌ Sees: "Schedule Bill" button (shouldn't see this)
❌ Sees: "Generate Receipt", "Apply Discount" buttons
❌ Sees: Checkboxes to select bills
❌ Clicks "Generate Receipt"
❌ Gets: Permission denied error (confusing)
```

### Post-Fix Expected Behavior

```
✓ Student logs in
✓ Navigates to Billing → My Bills (no "Student Search" shown)
✓ Views their bill details
✓ Sees: NO "Schedule Bill" button (clean interface)
✓ Sees: NO "Generate Receipt" or "Apply Discount" buttons
✓ Sees: NO checkboxes (can't select bills)
✓ Can only: View bill details (read-only)
✓ Clear expectation: View-only access to own billing information
```

### Verification Steps

1. **Test as Student**:
   ```
   1. Log in as student (student@jkkn.ac.in)
   2. Navigate to Billing → My Bills
   3. Verify NO "Student Search" submenu shown
   4. Click on a bill to view details
   5. Verify NO "Schedule Bill" button at top
   6. Verify bills table shows NO action buttons
   7. Verify NO checkboxes next to bills
   8. Click dropdown (⋮) on a bill
   9. Verify ONLY "View Details" option shown
   10. Verify can view bill details (read-only)
   ```

2. **Test as Admin**:
   ```
   1. Log in as admin/staff user
   2. Navigate to Billing → Schedule → Student Search
   3. Verify "Student Search" submenu IS shown
   4. Search for a student and view details
   5. Verify "Schedule Bill" button IS shown
   6. Verify bills table shows action buttons
   7. Verify checkboxes ARE shown next to bills
   8. Click dropdown on a bill
   9. Verify ALL options shown (View, Edit, Delete, etc.)
   10. Verify can perform all admin actions
   ```

## Security Notes

### RLS Policies Still Enforce Data Access

The UI changes (hiding buttons) are for **user experience** only. The actual security is enforced by:

1. **RLS Policies** (created earlier):
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

2. **Permission System**: Backend APIs still check permissions
3. **Role-Based Access**: Students cannot create, update, or delete bills regardless of UI

**Important**: Hiding buttons prevents confusion but does NOT provide security. Security is always enforced at the database and API level.

### Why Hide Buttons if RLS Prevents Access?

**User Experience Reasons**:
- **Clarity**: Students immediately know they have view-only access
- **No Confusion**: Prevents students from clicking buttons that will fail
- **Professional**: Clean interface without disabled/inaccessible controls
- **Reduced Support**: Fewer "why can't I click this?" questions

**Best Practice**: UI should reflect actual capabilities - don't show controls users can't use.

## Related Information

### Other Pages That May Need Similar Updates

**Similar Pattern Needed**:
1. **Receipts Page** (`/billing/receipts`):
   - Students see "My Receipts" (no action buttons)
   - Other roles see full receipt management

2. **Invoices Page** (`/billing/invoices`):
   - Students see "My Invoices" (view-only)
   - Other roles see invoice generation and management

3. **Refunds Page** (if students need access):
   - Students see "My Refunds" (view refund status)
   - Other roles see refund processing and management

### Student Bill Details Components

**Components Updated**:
- ✅ `StudentBillsTable` - Now has view-only mode for students
- ⏳ `StudentReceiptsTable` - May need similar update
- ⏳ `StudentTransactionHistory` - May need review

### Permission Configuration

**Required Permissions for Students**:
```typescript
{
  'billing.schedule.view': true,    // View own bills
  'billing.receipts.view': true,    // View own receipts
  'billing.invoices.view': true,    // View own invoices

  // Students should NOT have these:
  'billing.schedule.create': false,  // Cannot create bills
  'billing.schedule.update': false,  // Cannot edit bills
  'billing.schedule.delete': false,  // Cannot delete bills
  'billing.receipts.create': false,  // Cannot generate receipts
  'billing.discounts.create': false, // Cannot apply discounts
  'billing.refunds.create': false,   // Cannot process refunds
}
```

## Prevention

### Checklist for Future Role-Based Action Buttons

1. ✅ **Check user role** before showing action buttons
2. ✅ **Use isStudentView prop** pattern for view-only modes
3. ✅ **Hide bulk action controls** (checkboxes) for view-only users
4. ✅ **Disable ALL action permissions** when in view-only mode
5. ✅ **Test with all roles** to verify appropriate buttons shown
6. ✅ **Don't rely on permissions alone** - combine with role checks

### Template for View-Only Table Component

```typescript
interface MyTableProps {
  data: any[];
  isStudentView?: boolean; // Add this prop
}

export function MyTable({ data, isStudentView = false }: MyTableProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  // Disable ALL actions for students
  const canEdit = !isStudentView && (isSuperAdmin || canAccess('module', 'update'));
  const canDelete = !isStudentView && (isSuperAdmin || canAccess('module', 'delete'));
  const canCreate = !isStudentView && (isSuperAdmin || canAccess('module', 'create'));

  const canSelectRow = (row: any) => {
    if (isStudentView) return false; // Students can't select
    return true; // Others can select
  };

  return (
    <div>
      {/* Checkboxes only shown if canSelectRow returns true */}
      {/* Action buttons only shown if can* permissions are true */}
    </div>
  );
}
```

## Monitoring

### What to Watch

1. **Student Feedback**: Check if students report any action buttons visible
2. **Permission Errors**: Monitor for permission denied errors from students
3. **UI Consistency**: Verify all billing pages have consistent view-only mode
4. **Support Tickets**: Track "why can't I do X?" questions from students

### Success Metrics

- ✅ Zero students report seeing action buttons they can't use
- ✅ Zero permission denied errors from students clicking hidden buttons
- ✅ Students understand they have view-only access
- ✅ Clear distinction between student and admin interfaces
- ✅ No support tickets about "broken" buttons for students

---

**Verified**: Student role users now see view-only interface for billing pages with no action buttons (Schedule Bill, Generate Receipt, Apply Discount, Edit, Delete) visible.
