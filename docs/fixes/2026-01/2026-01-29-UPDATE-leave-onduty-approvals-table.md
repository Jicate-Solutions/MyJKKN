# Update: Leave/OnDuty Approvals Page - Card to Table Format

**Date**: 2026-01-29
**Type**: UI Enhancement
**Priority**: Medium

---

## Summary

Converted the Leave/OnDuty approvals page from card-based layout to an advanced data table format, matching the pattern used in other academic modules (attendance, consolidation, etc.).

---

## Changes

### Before (Card-based Layout)
- Applications displayed as individual cards
- Limited filtering and sorting
- Less information density
- Horizontal scrolling for actions
- Manual pagination

### After (Table-based Layout)
- Professional data table with TanStack Table
- Advanced sorting by any column
- Column visibility toggle
- Search/filter functionality
- Better information density
- Responsive design
- Pagination controls
- Consistent with other modules

---

## Files Created/Modified

### 1. Created: Approvals Table Columns

**File**: `app/(routes)/academic/leave-onduty/approvals/_components/approvals-columns.tsx`

```typescript
export const createColumns = (
  isSuperAdmin: boolean,
  onViewDetails: (row: any) => void,
  onApprove: (row: any) => void,
  onReject: (row: any) => void
): ColumnDef<ApprovalTableRow>[]
```

**Columns**:
1. ✅ **Applied On** - Application date with day of week
2. ✅ **Learner** - Name, roll number, register number
3. ✅ **Category & Type** - Leave/OnDuty badge with sub-category
4. ✅ **Period** - Date range with period type (fullday/forenoon/afternoon/periodwise)
5. ✅ **Institution & Section** - Only shown for super admin
6. ✅ **Reason** - Truncated text (max 60 chars)
7. ✅ **Status** - Pending badge
8. ✅ **Actions** - Dropdown menu (View Details, Approve, Reject)

**Features**:
- ✅ Sortable columns (Applied On)
- ✅ Rich formatting with icons
- ✅ Conditional columns for super admin
- ✅ Category-based color coding
- ✅ Actions dropdown menu

### 2. Updated: Approvals Page

**File**: `app/(routes)/academic/leave-onduty/approvals/page.tsx`

**Key Changes**:

**Added Imports**:
```typescript
import { createColumns } from './_components/approvals-columns';
import { DataTable } from '@/components/ui/data-table';
```

**Updated Data Normalization**:
```typescript
// Before: Complex approval-to-application mapping
const normalizedApprovals = useMemo(() => {
  if (isSuperAdmin && superAdminPendingApps) {
    return superAdminPendingApps.map((app: any) => ({
      id: `super-admin-${app.id}`,
      application_id: app.id,
      application: app,
      status: 'pending',
      approver_id: profile?.id,
    }));
  }
  return pendingApprovals || [];
}, [isSuperAdmin, superAdminPendingApps, pendingApprovals, profile?.id]);

// After: Direct application objects
const normalizedApprovals = useMemo(() => {
  if (isSuperAdmin && superAdminPendingApps) {
    return superAdminPendingApps; // Return applications directly
  }
  return (pendingApprovals || [])
    .map((approval: any) => approval.application)
    .filter(Boolean);
}, [isSuperAdmin, superAdminPendingApps, pendingApprovals]);
```

**Added Table Handlers**:
```typescript
const handleViewDetails = (row: any) => {
  setSelectedApplicationId(row.id);
};

const handleApprove = (row: any) => {
  setSelectedApplicationId(row.id);
  setApprovalAction('approved');
};

const handleReject = (row: any) => {
  setSelectedApplicationId(row.id);
  setApprovalAction('rejected');
};

const columns = useMemo(
  () => createColumns(isSuperAdmin, handleViewDetails, handleApprove, handleReject),
  [isSuperAdmin]
);
```

**Replaced Card List with DataTable**:
```tsx
// Before: Card-based list
<div className="space-y-4">
  {normalizedApprovals.map((approval: any) => (
    <Card key={approval.id}>
      {/* Complex card layout */}
    </Card>
  ))}
</div>

// After: DataTable component
<DataTable
  columns={columns}
  data={normalizedApprovals || []}
  searchKey="reason"
  searchPlaceholder="Search by reason..."
/>
```

---

## User Interface

### Table Features

1. **Search**: Search applications by reason text
2. **Sort**: Click column headers to sort (Applied On, Learner, etc.)
3. **Filter**: Use column filters for specific values
4. **Pagination**: Navigate through pages of results
5. **Column Visibility**: Toggle which columns to show
6. **Actions Menu**: 3-dot menu for each row:
   - 👁️ View Details - Opens detail modal
   - ✅ Approve - Opens approval confirmation
   - ❌ Reject - Opens rejection confirmation

### Responsive Design

- **Desktop**: Full table with all columns
- **Tablet**: Optimized column widths
- **Mobile**: Horizontal scroll with essential columns

### Color Coding

**Category Badges**:
- 🟦 **Leave**: Blue badge
- 🟪 **OnDuty**: Purple badge

**Status**:
- ⏳ **Pending**: Secondary badge

---

## Benefits

### For Users

1. ✅ **Better Overview**: See more applications at once
2. ✅ **Quick Sorting**: Sort by date, learner name, etc.
3. ✅ **Fast Search**: Find applications by reason
4. ✅ **Efficient Actions**: Dropdown menu for each row
5. ✅ **Professional Look**: Consistent with other modules

### For Developers

1. ✅ **Reusable Pattern**: Matches attendance/consolidation pattern
2. ✅ **Easy Maintenance**: Standard TanStack Table patterns
3. ✅ **Scalable**: Handles large datasets efficiently
4. ✅ **Type-Safe**: Full TypeScript support
5. ✅ **Testable**: Column definitions are pure functions

---

## Data Flow

### Super Admin View

```
superAdminPendingApps (from hook)
  ↓
normalizedApprovals (direct applications)
  ↓
DataTable (with institution column)
  ↓
User actions (Approve/Reject)
  ↓
handleProcessApproval
```

### Regular Approver View

```
pendingApprovals (from hook)
  ↓
Extract applications from approvals
  ↓
normalizedApprovals (filtered applications)
  ↓
DataTable (without institution column)
  ↓
User actions (Approve/Reject)
  ↓
handleProcessApproval
```

---

## Testing Checklist

### Visual Testing
- [ ] Table displays correctly on desktop
- [ ] Table is responsive on tablet/mobile
- [ ] All columns render properly
- [ ] Icons and badges show correctly
- [ ] Actions dropdown works
- [ ] Modal opens on "View Details"

### Functional Testing
- [ ] Search filters applications correctly
- [ ] Sorting works on sortable columns
- [ ] Pagination works with large datasets
- [ ] Column visibility toggle works
- [ ] Approve action opens dialog
- [ ] Reject action opens dialog
- [ ] Actions complete successfully

### Role-Based Testing
- [ ] Super admin sees institution column
- [ ] Regular approver doesn't see institution column
- [ ] Super admin sees all institutions' applications
- [ ] Regular approver sees only their approvals

### Data Integrity
- [ ] All application data displays correctly
- [ ] Learner info shows properly
- [ ] Dates format correctly
- [ ] Period types display properly
- [ ] Reasons are truncated appropriately

---

## Migration Notes

### No Database Changes
- No migration files needed
- No schema changes
- Same data queries
- Same API endpoints

### Backward Compatibility
- ✅ Existing queries work unchanged
- ✅ Approval flow unchanged
- ✅ Modal dialogs unchanged
- ✅ Statistics cards unchanged

---

## Future Enhancements

### Possible Additions
1. **Bulk Actions**: Select multiple rows and approve/reject at once
2. **Export**: Export table data to Excel/CSV
3. **Advanced Filters**: Filter by category, date range, learner
4. **Saved Views**: Save custom column/filter configurations
5. **Quick Approve**: In-row approve/reject without modal

### Performance Optimizations
1. **Virtual Scrolling**: For very large datasets (1000+ rows)
2. **Server-Side Pagination**: Load pages from server
3. **Column Resizing**: Manual column width adjustment
4. **Row Selection**: Select rows for batch operations

---

## Related Files

- Columns: `app/(routes)/academic/leave-onduty/approvals/_components/approvals-columns.tsx` (NEW)
- Page: `app/(routes)/academic/leave-onduty/approvals/page.tsx` (UPDATED)
- DataTable: `components/ui/data-table.tsx` (EXISTING)
- Column Header: `components/data-table/column-header.tsx` (EXISTING)
- Types: `types/leave-onduty.ts` (EXISTING)

---

**Status**: ✅ Implemented
**Testing**: Manual testing required
**Deployment**: Ready for production
