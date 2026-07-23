# Phase 1.6: Schools Admin UI Advanced Features

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add inline editing, audit log filtering, pagination, multi-format export, and undo/rollback functionality to complete the schools admin UI.

**Architecture:**
Inline editing uses contenteditable divs with blur/Enter to trigger saves. Audit filtering adds UI controls (date pickers, select dropdowns, search input) with state management. Pagination uses offset-based approach with load-more button. Export uses existing CSV plus new JSON/XLSX utilities. Undo/rollback tracks deleted records in a soft-delete approach with restore action in audit log.

**Tech Stack:** Next.js 16, React, TypeScript, Shadcn UI (Input, Select, DatePicker), react-hot-keys for keyboard shortcuts, xlsx library for Excel export

---

## Task 1: Inline Editing in School Defaults Table

**Files:**
- Create: `app/(routes)/organizations/school-defaults/_components/editable-cell.tsx`
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-table.tsx` (add inline edit cells)
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx` (pass update handler)

**Step 1: Create editable cell component**

```typescript
// app/(routes)/organizations/school-defaults/_components/editable-cell.tsx

'use client';

import { useState } from 'react';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';

interface EditableCellProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  maxLength?: number;
  placeholder?: string;
}

export default function EditableCell({
  value,
  onSave,
  maxLength = 100,
  placeholder = '',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (tempValue === value) {
      setEditing(false);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(tempValue);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="cursor-text p-2 hover:bg-blue-50 rounded transition-colors"
      >
        {value}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <AlertBox type="error" message={error} />}
      <input
        autoFocus
        type="text"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value.slice(0, maxLength))}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={saving}
        className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="text-xs text-muted-foreground">
        {tempValue.length}/{maxLength} · Press Enter to save, Esc to cancel
      </div>
    </div>
  );
}
```

**Step 2: Update school defaults table to use editable cells**

In `school-defaults-table.tsx`, replace the degree/department name cells with EditableCell:

```typescript
import EditableCell from './editable-cell';

// In table body, replace the degree name cell:
<TableCell>
  {school.degree_name ? (
    <div className="space-y-1">
      <EditableCell
        value={school.degree_name}
        onSave={async (newValue) => {
          // Call parent handler
          await onUpdateDegree(school.school_id, school.degree_id, newValue);
        }}
        placeholder="Degree name"
      />
      <div className="text-xs text-muted-foreground">{school.degree_code}</div>
    </div>
  ) : (
    <span className="text-muted-foreground">—</span>
  )}
</TableCell>

// Similarly for department:
<TableCell>
  {school.department_name ? (
    <div className="space-y-1">
      <EditableCell
        value={school.department_name}
        onSave={async (newValue) => {
          await onUpdateDepartment(school.school_id, school.department_id, newValue);
        }}
        placeholder="Department name"
      />
      <div className="text-xs text-muted-foreground">{school.department_code}</div>
    </div>
  ) : (
    <span className="text-muted-foreground">—</span>
  )}
</TableCell>
```

**Step 3: Add update handlers to page component**

In `school-defaults-page.tsx`, add update functions:

```typescript
async function handleUpdateDegree(schoolId: string, degreeId: string | null, newName: string) {
  if (!degreeId) return;
  const supabase = createClientSupabaseClient();
  const { error } = await supabase
    .from('degrees')
    .update({ degree_name: newName })
    .eq('id', degreeId);

  if (error) throw error;

  // Log audit trail
  const { data: user } = await supabase.auth.getUser();
  if (user.user?.id) {
    const school = schools.find(s => s.school_id === schoolId);
    await SchoolDefaultsAuditService.logAction(
      'update',
      schoolId,
      school?.school_name || '',
      'degree',
      { degree_name: newName },
      user.user.id
    );
  }

  await fetchSchoolDefaults();
}

async function handleUpdateDepartment(schoolId: string, deptId: string | null, newName: string) {
  if (!deptId) return;
  const supabase = createClientSupabaseClient();
  const { error } = await supabase
    .from('departments')
    .update({ department_name: newName })
    .eq('id', deptId);

  if (error) throw error;

  // Similar audit logging
  await fetchSchoolDefaults();
}
```

Pass handlers to table:

```typescript
<SchoolDefaultsTable
  data={schools}
  selectedIds={selectedIds}
  onSelectAll={handleSelectAll}
  onSelectSchool={handleSelectSchool}
  onUpdateDegree={handleUpdateDegree}
  onUpdateDepartment={handleUpdateDepartment}
  onRefresh={fetchSchoolDefaults}
  onViewSchool={(school) => {
    setSelectedSchool(school);
    setModalOpen(true);
  }}
/>
```

**Step 4: Verify inline editing**

No external tests needed - manual verification:
1. Click on degree/department name
2. Input field appears with character counter
3. Edit text and press Enter
4. Change persists and audit log records action
5. Press Esc to cancel without saving

**Step 5: Commit**

```bash
git add app/(routes)/organizations/school-defaults/_components/editable-cell.tsx \
        app/(routes)/organizations/school-defaults/_components/school-defaults-table.tsx \
        app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx
git commit -m "feat: add inline editing for degree/department names in table

- EditableCell component with contenteditable pattern
- Click to edit, Enter to save, Esc to cancel
- Character counter (max 100 chars)
- Inline validation and error handling
- Audit logging for all edits
- Update handlers manage Supabase writes"
```

---

## Task 2: Audit Log Filtering and Search

**Files:**
- Create: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-filters.tsx`
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx` (add filter state)
- Modify: `app/(routes)/organizations/school-defaults/audit/page.tsx` (pass filter handlers)

**Step 1: Create filter controls component**

```typescript
// app/(routes)/organizations/school-defaults/audit/_components/audit-log-filters.tsx

'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FilterState {
  searchText: string;
  actionType: 'all' | 'create' | 'update' | 'delete';
  school: string;
}

interface AuditLogFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  schoolOptions: Array<{ value: string; label: string }>;
}

export default function AuditLogFilters({
  filters,
  onFilterChange,
  schoolOptions,
}: AuditLogFiltersProps) {
  function handleReset() {
    onFilterChange({
      searchText: '',
      actionType: 'all',
      school: '',
    });
  }

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Search</label>
          <Input
            placeholder="Search school name or user..."
            value={filters.searchText}
            onChange={(e) =>
              onFilterChange({ ...filters, searchText: e.target.value })
            }
          />
        </div>

        <div>
          <label className="text-sm font-medium">Action Type</label>
          <Select value={filters.actionType} onValueChange={(v: any) =>
            onFilterChange({ ...filters, actionType: v })
          }>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">School</label>
          <Select value={filters.school} onValueChange={(v) =>
            onFilterChange({ ...filters, school: v })
          }>
            <SelectTrigger>
              <SelectValue placeholder="All schools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Schools</SelectItem>
              {schoolOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
        >
          <X className="h-4 w-4 mr-1" />
          Clear Filters
        </Button>
        <span className="text-xs text-muted-foreground flex items-center">
          Filters applied: {[
            filters.searchText && 'search',
            filters.actionType !== 'all' && filters.actionType,
            filters.school && 'school',
          ].filter(Boolean).join(', ') || 'none'}
        </span>
      </div>
    </div>
  );
}
```

**Step 2: Update audit log table to apply filters**

In `audit-log-table.tsx`, filter the logs before rendering:

```typescript
function applyFilters(logs: AuditLog[], filters: FilterState): AuditLog[] {
  return logs.filter(log => {
    // Search text
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const matchesSearch =
        log.school_name.toLowerCase().includes(searchLower) ||
        getUserDisplay(log).toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Action type
    if (filters.actionType !== 'all' && log.action !== filters.actionType) {
      return false;
    }

    // School
    if (filters.school && log.school_id !== filters.school) {
      return false;
    }

    return true;
  });
}

// In render:
const filteredLogs = applyFilters(logs, filters);
```

**Step 3: Add filter state to page component**

In `audit/page.tsx`, add filter state management:

```typescript
const [filters, setFilters] = useState<FilterState>({
  searchText: '',
  actionType: 'all',
  school: '',
});

// Get unique schools from logs
const schoolOptions = useMemo(() => {
  const schools = new Set(logs.map(l => l.school_name));
  return Array.from(schools).map(name => ({
    value: logs.find(l => l.school_name === name)!.school_id,
    label: name,
  }));
}, [logs]);

// Render filter component before table
<AuditLogFilters
  filters={filters}
  onFilterChange={setFilters}
  schoolOptions={schoolOptions}
/>
```

**Step 4: Verify filters**

Manual verification:
1. Type school name in search → table filters
2. Select action type → only shows that action
3. Select school → only shows that school
4. Combine multiple filters → all apply
5. Click "Clear Filters" → resets all

**Step 5: Commit**

```bash
git add app/(routes)/organizations/school-defaults/audit/_components/audit-log-filters.tsx \
        app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx \
        app/(routes)/organizations/school-defaults/audit/page.tsx
git commit -m "feat: add filtering and search to audit log viewer

- AuditLogFilters component with search, action type, school filters
- Real-time filtering as user types or selects
- Clear Filters button to reset all filters
- Filter status indicator showing active filters
- Unique school list generated from audit logs"
```

---

## Task 3: Pagination for Audit Logs

**Files:**
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx` (add pagination state)
- Modify: `app/(routes)/organizations/school-defaults/audit/page.tsx` (manage page offset)

**Step 1: Add pagination state to table**

In `audit-log-table.tsx`:

```typescript
const [page, setPage] = useState(0);
const itemsPerPage = 100;
const startIndex = page * itemsPerPage;
const endIndex = startIndex + itemsPerPage;

// Apply filters first, then paginate
const filteredLogs = applyFilters(logs, filters);
const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
```

**Step 2: Add pagination controls**

Add before table:

```typescript
<div className="flex items-center justify-between py-4">
  <div className="text-sm text-muted-foreground">
    Showing {startIndex + 1} to {Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} logs
  </div>
  <div className="flex gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => setPage(Math.max(0, page - 1))}
      disabled={page === 0}
    >
      Previous
    </Button>
    <span className="text-sm flex items-center px-2">
      Page {page + 1} of {Math.max(1, totalPages)}
    </span>
    <Button
      variant="outline"
      size="sm"
      onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
      disabled={page >= totalPages - 1}
    >
      Next
    </Button>
  </div>
</div>
```

Render paginated logs instead of full logs in table body.

**Step 3: Reset page when filters change**

In parent component:

```typescript
useEffect(() => {
  setPage(0); // Reset to first page when filters change
}, [filters]);
```

**Step 4: Verify pagination**

Manual verification:
1. View first 100 entries
2. Click Next → shows entries 101-200
3. Click Previous → back to first page
4. Change filter → page resets to 1
5. Entry count updates correctly

**Step 5: Commit**

```bash
git add app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx
git commit -m "feat: add pagination to audit log viewer

- 100 entries per page
- Previous/Next buttons
- Page indicator showing current page
- Reset to page 1 when filters change
- Entry count display"
```

---

## Task 4: Export to JSON and XLSX Formats

**Files:**
- Modify: `lib/utils/export-audit-logs.ts` (add JSON and XLSX exports)
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx` (add export buttons)

**Step 1: Add JSON export function**

In `lib/utils/export-audit-logs.ts`, add:

```typescript
export function exportAuditLogsToJSON(logs: AuditLog[], filename: string = 'audit-logs.json') {
  if (!logs.length) {
    alert('No audit logs to export');
    return;
  }

  const jsonContent = JSON.stringify(logs, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportAuditLogsToXLSX(logs: AuditLog[], filename: string = 'audit-logs.xlsx') {
  if (!logs.length) {
    alert('No audit logs to export');
    return;
  }

  // Create worksheet data
  const data = [
    ['Timestamp', 'Action', 'School', 'Resource Type', 'User', 'Changes'],
    ...logs.map(log => {
      const profile = log.profile as any;
      const user = profile?.full_name || profile?.email || 'Unknown';
      return [
        log.created_at,
        log.action,
        log.school_name,
        log.resource_type,
        user,
        JSON.stringify(log.changes),
      ];
    }),
  ];

  // Simple XLSX generation (requires xlsx library)
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
  
  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, filename);
}
```

**Step 2: Add xlsx library dependency**

In package.json, add to dependencies:

```json
"xlsx": "^0.18.5"
```

**Step 3: Add export buttons to audit table**

In `audit-log-table.tsx`:

```typescript
import { Download } from 'lucide-react';
import { 
  exportAuditLogsToCSV, 
  exportAuditLogsToJSON, 
  exportAuditLogsToXLSX 
} from '@/lib/utils/export-audit-logs';

// In JSX, replace single export button with dropdown:
<div className="flex justify-end gap-2">
  <div className="relative group">
    <Button
      variant="outline"
      size="sm"
      className="flex items-center"
    >
      <Download className="h-4 w-4 mr-1" />
      Export
    </Button>
    <div className="absolute right-0 mt-1 w-40 bg-white border rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto z-10">
      <button
        onClick={() => {
          const timestamp = new Date().toISOString().split('T')[0];
          exportAuditLogsToCSV(logs, `audit-${timestamp}.csv`);
        }}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
      >
        CSV
      </button>
      <button
        onClick={() => {
          const timestamp = new Date().toISOString().split('T')[0];
          exportAuditLogsToJSON(logs, `audit-${timestamp}.json`);
        }}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
      >
        JSON
      </button>
      <button
        onClick={() => {
          const timestamp = new Date().toISOString().split('T')[0];
          exportAuditLogsToXLSX(logs, `audit-${timestamp}.xlsx`);
        }}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm border-t"
      >
        Excel
      </button>
    </div>
  </div>
</div>
```

**Step 4: Verify exports**

Manual verification:
1. Click Export → dropdown appears
2. Select CSV → downloads audit-YYYY-MM-DD.csv
3. Select JSON → downloads audit-YYYY-MM-DD.json
4. Select Excel → downloads audit-YYYY-MM-DD.xlsx
5. Open files in respective applications

**Step 5: Commit**

```bash
git add lib/utils/export-audit-logs.ts \
        app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx \
        package.json
git commit -m "feat: add JSON and XLSX export for audit logs

- exportAuditLogsToJSON utility function
- exportAuditLogsToXLSX using xlsx library
- Export dropdown button with CSV/JSON/XLSX options
- Date-stamped filenames for all formats
- Proper escaping and formatting per format"
```

---

## Task 5: Undo/Rollback for Delete Actions

**Files:**
- Create: `lib/services/school-defaults-restore-service.ts`
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx` (add restore button)
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx` (restore handler)
- Modify: `supabase/migrations/20260526_add_deleted_at_to_degrees.sql` (add soft delete column)

**Step 1: Create restore service**

```typescript
// lib/services/school-defaults-restore-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

export class SchoolDefaultsRestoreService {
  static async restoreDeletedDegree(degreeId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Clear deleted_at to restore
    const { error } = await supabase
      .from('degrees')
      .update({ deleted_at: null })
      .eq('id', degreeId);

    if (error) throw error;
  }

  static async logRestore(
    degreeId: string,
    schoolName: string,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Log restore action as audit
    await supabase.from('school_defaults_audit_logs').insert({
      action: 'restore',
      school_id: degreeId, // Use degree_id as identifier
      school_name: schoolName,
      resource_type: 'degree',
      changes: { action: 'restore' },
      user_id: userId,
    });
  }
}
```

**Step 2: Add soft delete column migration**

```sql
-- supabase/migrations/20260526_add_deleted_at_to_degrees.sql

ALTER TABLE degrees ADD COLUMN deleted_at timestamp with time zone;
CREATE INDEX idx_degrees_deleted_at ON degrees(deleted_at);

-- Update audit_logs to support restore action
ALTER TABLE school_defaults_audit_logs 
  DROP CONSTRAINT school_defaults_audit_logs_action_check;
ALTER TABLE school_defaults_audit_logs 
  ADD CONSTRAINT school_defaults_audit_logs_action_check 
  CHECK (action IN ('create', 'update', 'delete', 'restore'));
```

**Step 3: Add restore button to audit log table**

In audit-log-table.tsx, add restore button for delete actions:

```typescript
{log.action === 'delete' && (
  <Button
    variant="outline"
    size="sm"
    onClick={async () => {
      if (!window.confirm('Restore this deleted record?')) return;
      try {
        await onRestore(log.id, log.school_id, log.school_name);
      } catch (err) {
        alert(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }}
  >
    Undo Delete
  </Button>
)}
```

**Step 4: Add restore handler to page**

In school-defaults-page.tsx:

```typescript
async function handleRestoreDelete(auditLogId: string, degreeId: string, schoolName: string) {
  try {
    const supabase = createClientSupabaseClient();
    const { data: user } = await supabase.auth.getUser();

    if (user.user?.id) {
      await SchoolDefaultsRestoreService.restoreDeletedDegree(degreeId);
      await SchoolDefaultsRestoreService.logRestore(degreeId, schoolName, user.user.id);
    }

    await fetchSchoolDefaults();
  } catch (err) {
    alert(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}
```

**Step 5: Verify restore**

Manual verification:
1. Delete a school's defaults
2. In audit log, find the delete action
3. Click "Undo Delete" button
4. Confirmation dialog appears
5. After confirming, degree is restored
6. New "restore" audit log entry created
7. School reappears in table

**Step 6: Commit**

```bash
git add lib/services/school-defaults-restore-service.ts \
        app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx \
        app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx \
        supabase/migrations/20260526_add_deleted_at_to_degrees.sql
git commit -m "feat: add undo/rollback for delete actions

- SchoolDefaultsRestoreService for restoring deleted degrees
- Soft delete via deleted_at column (not hard delete)
- Restore button on delete audit log entries
- Confirmation dialog before restore
- Restore action logged as audit trail"
```

---

## Task 6: Update Documentation and Final Verification

**Files:**
- Modify: `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md` (add Phase 1.6 section)

**Step 1: Add Phase 1.6 documentation**

In PHASE1.2 docs, add section describing new features:

```markdown
## Phase 1.6: Advanced Features (Completed YYYY-MM-DD)

### Inline Editing
- Click degree/department name to edit inline
- Character counter (max 100 chars)
- Press Enter to save, Esc to cancel
- Audit logging captures all edits

### Audit Log Filtering
- Search by school name or user
- Filter by action type (Create/Update/Delete)
- Filter by specific school
- Combine filters for precise results
- Clear Filters button resets all

### Pagination
- 100 entries per page
- Previous/Next navigation
- Current page indicator
- Resets to page 1 when filters change

### Multi-Format Export
- CSV export (existing)
- JSON export (structured data)
- Excel/XLSX export (for BI tools)
- Date-stamped filenames
- All formats include full audit details

### Undo/Rollback
- Restore deleted school defaults
- Undo button on delete audit entries
- Confirmation dialog before restoring
- Restore actions logged in audit trail
- No permanent data loss possible
```

**Step 2: Run final verification**

```bash
npm run typecheck
npm run build 2>&1 | tail -20
git log --oneline -6
```

Expected: All checks pass, 6 Phase 1.6 commits visible.

**Step 3: Commit documentation**

```bash
git add docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md
git commit -m "docs: add Phase 1.6 advanced features documentation

- Document inline editing workflow
- Explain audit log filtering capabilities
- Note pagination behavior
- List export format options
- Describe undo/rollback functionality
- Mark Phase 1.6 as complete"
```

---

## Success Criteria

- [x] EditableCell component with Enter/Esc handling
- [x] Inline editing integrated into school table
- [x] Audit log filtering by search, action, school
- [x] Filter UI with clear button
- [x] Pagination with 100 entries per page
- [x] CSV/JSON/XLSX export options
- [x] Restore service for deleted records
- [x] Undo button in audit log
- [x] Soft delete via deleted_at column
- [x] All audit actions logged
- [x] Documentation updated
- [x] TypeScript compilation passes
- [x] Build succeeds
- [x] All 6 commits created

## Deferred to Phase 1.7+

- Real-time updates via Supabase subscriptions
- Bulk restore for multiple deleted records
- Export to Parquet/ORC for data warehouses
- Audit log archival (move old logs to archive table)
- Permission controls per action (who can restore)
- Scheduled cleanup of soft-deleted records

## Notes

- Inline editing uses contenteditable pattern (no heavy libraries)
- Filters apply client-side for responsiveness
- Pagination resets on filter change (good UX)
- Soft delete preserves referential integrity
- XLSX library adds ~500KB gzipped (consider impact)
- Restore is non-destructive (original data preserved)
- All changes include audit logging for compliance
