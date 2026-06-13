# Phase 1.5: Schools Admin UI Bulk Operations and Audit Viewer

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add edit capability for degree/department names, bulk delete with multi-select, audit log viewer, and CSV export to complete the schools admin UI.

**Architecture:** 
Edit modal reuses Dialog/Form pattern from Phase 1.4. Bulk operations add checkbox selection state to table. Audit viewer is a new page route (/organizations/school-defaults/audit) with filtering and sorting. CSV export uses client-side generation via papaparse or simple JSON-to-CSV.

**Tech Stack:** Next.js 16, React, TypeScript, Shadcn UI (Dialog, Form, Checkbox, Button), TanStack Table (for bulk select), Supabase client

---

## Task 1: Create Edit Modal Component

**Files:**
- Create: `app/(routes)/organizations/school-defaults/_components/edit-defaults-modal.tsx`
- Modify: `app/(routes)/organizations/school-defaults/_components/school-details-modal.tsx` (add edit button callback)
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx` (add edit modal state)

**Step 1: Create edit modal component with form**

```typescript
// app/(routes)/organizations/school-defaults/_components/edit-defaults-modal.tsx

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsAuditService } from '@/lib/services/school-defaults-audit-service';

const editSchema = z.object({
  degree_name: z.string().min(1, 'Degree name is required').max(100),
  degree_code: z.string().min(1, 'Degree code is required').max(20),
  department_name: z.string().min(1, 'Department name is required').max(100),
  department_code: z.string().min(1, 'Department code is required').max(20),
});

type EditFormData = z.infer<typeof editSchema>;

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
}

interface EditDefaultsModalProps {
  school: SchoolWithDefaults | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
}

export default function EditDefaultsModal({
  school,
  open,
  onOpenChange,
  onRefresh,
}: EditDefaultsModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      degree_name: school?.degree_name || '',
      degree_code: school?.degree_code || '',
      department_name: school?.department_name || '',
      department_code: school?.department_code || '',
    },
  });

  if (!school || !school.degree_id) return null;

  async function onSubmit(data: EditFormData) {
    try {
      setSaving(true);
      setError(null);
      const supabase = createClientSupabaseClient();

      // Update degree
      if (school.degree_id) {
        const { error: degreeError } = await supabase
          .from('degrees')
          .update({
            degree_name: data.degree_name,
            degree_code: data.degree_code,
          })
          .eq('id', school.degree_id);

        if (degreeError) throw degreeError;
      }

      // Update department
      if (school.department_id) {
        const { error: deptError } = await supabase
          .from('departments')
          .update({
            department_name: data.department_name,
            department_code: data.department_code,
          })
          .eq('id', school.department_id);

        if (deptError) throw deptError;
      }

      // Log audit trail
      const { data: currentUser } = await supabase.auth.getUser();
      if (currentUser.user?.id) {
        await SchoolDefaultsAuditService.logAction(
          'update',
          school.school_id,
          school.school_name,
          'degree',
          {
            changes: {
              degree_name: { from: school.degree_name, to: data.degree_name },
              degree_code: { from: school.degree_code, to: data.degree_code },
              department_name: { from: school.department_name, to: data.department_name },
              department_code: { from: school.department_code, to: data.department_code },
            },
          },
          currentUser.user.id
        );
      }

      await onRefresh();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update defaults');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {school.school_name}</DialogTitle>
          <DialogDescription>
            Update K-12 Program degree and Academic department names and codes
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && <AlertBox type="error" message={error} />}

            <FormField
              control={form.control}
              name="degree_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Degree Name</FormLabel>
                  <FormControl>
                    <Input placeholder="K-12 Program" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="degree_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Degree Code</FormLabel>
                  <FormControl>
                    <Input placeholder="K12" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="department_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Academic" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="department_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department Code</FormLabel>
                  <FormControl>
                    <Input placeholder="ACAD" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex gap-2 justify-between">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>

              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Add edit button to SchoolDetailsModal**

In `school-details-modal.tsx`, update the button section:

```typescript
{hasDefaults && (
  <>
    <Button 
      variant="outline" 
      size="sm"
      onClick={() => onEdit && onEdit(school)}
    >
      <Edit2 className="h-4 w-4 mr-1" />
      Edit
    </Button>

    <Button
      variant="destructive"
      size="sm"
      onClick={handleDeleteDefaults}
      disabled={!canDelete || deleting}
    >
      {deleting ? (
        <>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Deleting...
        </>
      ) : (
        <>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </>
      )}
    </Button>
  </>
)}
```

Also add prop to SchoolDetailsModal interface:

```typescript
interface SchoolDetailsModalProps {
  school: SchoolWithDefaults | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  onEdit?: (school: SchoolWithDefaults) => void;
}
```

**Step 3: Add modal state to page component**

In `school-defaults-page.tsx`, add state and render logic:

```typescript
const [editingSchool, setEditingSchool] = useState<SchoolWithDefaults | null>(null);
const [editModalOpen, setEditModalOpen] = useState(false);

// In JSX, add after SchoolDetailsModal:
{editingSchool && (
  <EditDefaultsModal
    school={editingSchool}
    open={editModalOpen}
    onOpenChange={setEditModalOpen}
    onRefresh={fetchSchoolDefaults}
  />
)}

// Pass onEdit callback to SchoolDetailsModal:
<SchoolDetailsModal
  school={selectedSchool}
  open={modalOpen}
  onOpenChange={setModalOpen}
  onRefresh={fetchSchoolDefaults}
  onEdit={(school) => {
    setEditingSchool(school);
    setEditModalOpen(true);
  }}
/>
```

**Step 4: Verify imports and syntax**

No new UI dependencies needed - all Shadcn components already in use.

**Step 5: Commit**

```bash
git add app/(routes)/organizations/school-defaults/_components/edit-defaults-modal.tsx \
        app/(routes)/organizations/school-defaults/_components/school-details-modal.tsx \
        app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx
git commit -m "feat: add edit modal for degree/department names and codes

- EditDefaultsModal component with form validation (zod)
- Update both degree and department records
- Audit trail logging for all changes
- Form fields for name and code with validation
- Cancel/Save workflow"
```

---

## Task 2: Add Multi-Select Checkboxes to Table

**Files:**
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-table.tsx`
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx` (pass selection state)

**Step 1: Add selection state and checkbox column**

In `school-defaults-page.tsx`, add state:

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const handleSelectAll = (checked: boolean) => {
  if (checked) {
    setSelectedIds(new Set(schools.map(s => s.school_id)));
  } else {
    setSelectedIds(new Set());
  }
};

const handleSelectSchool = (schoolId: string, checked: boolean) => {
  const newSet = new Set(selectedIds);
  if (checked) {
    newSet.add(schoolId);
  } else {
    newSet.delete(schoolId);
  }
  setSelectedIds(newSet);
};
```

Pass to table:

```typescript
<SchoolDefaultsTable
  data={schools}
  selectedIds={selectedIds}
  onSelectAll={handleSelectAll}
  onSelectSchool={handleSelectSchool}
  onRefresh={fetchSchoolDefaults}
  onViewSchool={(school) => {
    setSelectedSchool(school);
    setModalOpen(true);
  }}
/>
```

**Step 2: Update table props and add checkbox column**

In `school-defaults-table.tsx`:

```typescript
interface SchoolDefaultsTableProps {
  data: SchoolWithDefaults[];
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectSchool: (schoolId: string, checked: boolean) => void;
  onRefresh: () => Promise<void>;
  onViewSchool: (school: SchoolWithDefaults) => void;
}

// In TableHeader, add checkbox column:
<TableHead className="w-12">
  <Checkbox
    checked={selectedIds.size === data.length && data.length > 0}
    indeterminate={selectedIds.size > 0 && selectedIds.size < data.length}
    onCheckedChange={onSelectAll}
  />
</TableHead>

// In TableBody row, add checkbox:
<TableCell>
  <Checkbox
    checked={selectedIds.has(school.school_id)}
    onCheckedChange={(checked) => onSelectSchool(school.school_id, checked)}
  />
</TableCell>
```

**Step 3: Add bulk delete button above table**

In table JSX, before table div:

```typescript
{selectedIds.size > 0 && (
  <div className="flex gap-2 items-center bg-blue-50 p-3 rounded-lg border border-blue-200">
    <span className="text-sm font-medium">
      {selectedIds.size} school(s) selected
    </span>
    <Button
      variant="destructive"
      size="sm"
      onClick={() => handleBulkDelete()}
    >
      Delete {selectedIds.size} School(s)
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={() => setSelectedIds(new Set())}
    >
      Clear Selection
    </Button>
  </div>
)}
```

**Step 4: Implement bulk delete handler**

In `school-defaults-page.tsx`:

```typescript
async function handleBulkDelete() {
  const schoolNames = schools
    .filter(s => selectedIds.has(s.school_id))
    .map(s => s.school_name)
    .join(', ');

  if (!window.confirm(
    `Delete K-12 Program defaults for ${selectedIds.size} school(s)?\n\n${schoolNames}`
  )) {
    return;
  }

  try {
    const supabase = createClientSupabaseClient();
    const { data: currentUser } = await supabase.auth.getUser();
    const degreeIds = schools
      .filter(s => selectedIds.has(s.school_id) && s.degree_id)
      .map(s => s.degree_id);

    if (degreeIds.length > 0) {
      const { error } = await supabase
        .from('degrees')
        .delete()
        .in('id', degreeIds);

      if (error) throw error;

      // Audit log for each school
      for (const schoolId of selectedIds) {
        const school = schools.find(s => s.school_id === schoolId);
        if (school && currentUser.user?.id) {
          await SchoolDefaultsAuditService.logAction(
            'delete',
            schoolId,
            school.school_name,
            'degree',
            { degree_id: school.degree_id },
            currentUser.user.id
          );
        }
      }
    }

    setSelectedIds(new Set());
    await fetchSchoolDefaults();
  } catch (err) {
    console.error('Bulk delete failed:', err);
    alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}
```

**Step 5: Import Checkbox component**

Add to imports:

```typescript
import { Checkbox } from '@/components/ui/checkbox';
```

**Step 6: Commit**

```bash
git add app/(routes)/organizations/school-defaults/_components/school-defaults-table.tsx \
        app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx
git commit -m "feat: add multi-select checkboxes and bulk delete for schools

- Checkbox column in table with select-all header
- Bulk delete button appears when schools selected
- Confirmation dialog with school names
- Audit logging for each deleted school
- Clear selection button"
```

---

## Task 3: Create Audit Log Viewer Page

**Files:**
- Create: `app/(routes)/organizations/school-defaults/audit/page.tsx`
- Create: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx`

**Step 1: Create audit page**

```typescript
// app/(routes)/organizations/school-defaults/audit/page.tsx

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AuditLogTable from './_components/audit-log-table';
import { PageHeader } from '@/components/page-header';

export const metadata = {
  title: 'School Defaults Audit Log',
};

export default async function SchoolDefaultsAuditPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // TODO: Add permission check (institution admin or org admin)

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Defaults Audit Log"
        description="View all create, update, and delete actions on school K-12 Program and Academic department records"
      />
      <AuditLogTable />
    </div>
  );
}
```

**Step 2: Create audit log table component**

```typescript
// app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx

'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete';
  school_id: string;
  school_name: string;
  resource_type: 'degree' | 'department';
  changes: Record<string, any>;
  user_id: string;
  created_at: string;
  profile?: {
    email: string;
    full_name?: string;
  };
}

export default function AuditLogTable() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  async function fetchAuditLogs() {
    try {
      setLoading(true);
      const supabase = createClientSupabaseClient();

      const { data, error: queryError } = await supabase
        .from('school_defaults_audit_logs')
        .select(
          `
          id,
          action,
          school_id,
          school_name,
          resource_type,
          changes,
          user_id,
          created_at,
          profiles:user_id (
            email,
            full_name
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (queryError) throw queryError;
      setLogs((data || []) as AuditLog[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-green-50 border-green-300';
      case 'update':
        return 'bg-blue-50 border-blue-300';
      case 'delete':
        return 'bg-red-50 border-red-300';
      default:
        return 'bg-gray-50 border-gray-300';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getUserDisplay = (log: AuditLog) => {
    const profile = log.profile as any;
    return profile?.full_name || profile?.email || 'Unknown User';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <AlertBox type="error" message={error} />}

      {logs.length === 0 ? (
        <AlertBox type="info" message="No audit logs found" />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {formatDate(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getActionColor(log.action)}>
                      {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{log.school_name}</TableCell>
                  <TableCell className="text-sm">
                    {log.resource_type === 'degree' ? 'K-12 Program' : 'Department'}
                  </TableCell>
                  <TableCell className="text-sm">{getUserDisplay(log)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <details>
                      <summary className="cursor-pointer hover:underline">
                        View Changes
                      </summary>
                      <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-auto max-w-sm">
                        {JSON.stringify(log.changes, null, 2)}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Showing last 500 audit log entries. Total: {logs.length}
      </div>
    </div>
  );
}
```

**Step 3: Add sidebar link to audit page**

In `lib/sidebarMenuLink.ts`, find the school-defaults menu item and add submenu:

```typescript
{
  href: '/organizations/school-defaults',
  label: 'School Defaults',
  active: path.startsWith('/organizations/school-defaults'),
  icon: GraduationCap,
  permission: 'organizations.school-defaults.view',
  submenus: [
    {
      href: '/organizations/school-defaults/audit',
      label: 'Audit Log',
      permission: 'organizations.school-defaults.audit.view',
    },
  ],
}
```

**Step 4: Commit**

```bash
git add app/(routes)/organizations/school-defaults/audit/page.tsx \
        app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx \
        lib/sidebarMenuLink.ts
git commit -m "feat: add audit log viewer page for school defaults changes

- New audit page at /organizations/school-defaults/audit
- View all create/update/delete actions with timestamps
- Show user who performed action
- Display changes in collapsible details
- Table sorted by most recent first
- Link in sidebar under School Defaults"
```

---

## Task 4: Add CSV Export for Audit Logs

**Files:**
- Create: `lib/utils/export-audit-logs.ts`
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx` (add export button)

**Step 1: Create export utility**

```typescript
// lib/utils/export-audit-logs.ts

interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete';
  school_id: string;
  school_name: string;
  resource_type: 'degree' | 'department';
  changes: Record<string, any>;
  user_id: string;
  created_at: string;
  profile?: {
    email: string;
    full_name?: string;
  };
}

export function exportAuditLogsToCSV(logs: AuditLog[], filename: string = 'audit-logs.csv') {
  if (!logs.length) {
    alert('No audit logs to export');
    return;
  }

  const headers = ['Timestamp', 'Action', 'School', 'Resource Type', 'User', 'Changes'];

  const rows = logs.map(log => {
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
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma or newline
        const str = String(cell).replace(/"/g, '""');
        return str.includes(',') || str.includes('\n') ? `"${str}"` : str;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

**Step 2: Add export button to audit table**

In `audit-log-table.tsx`, add import and button:

```typescript
import { exportAuditLogsToCSV } from '@/lib/utils/export-audit-logs';
import { Download } from 'lucide-react';

// In JSX, add before the table div:
<div className="flex justify-end gap-2">
  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      const timestamp = new Date().toISOString().split('T')[0];
      exportAuditLogsToCSV(logs, `school-defaults-audit-${timestamp}.csv`);
    }}
  >
    <Download className="h-4 w-4 mr-1" />
    Export as CSV
  </Button>
</div>
```

Also add Button import if not already present.

**Step 3: Verify export works**

The utility uses native browser Blob/URL API (no external dependencies).

**Step 4: Commit**

```bash
git add lib/utils/export-audit-logs.ts \
        app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx
git commit -m "feat: add CSV export for audit logs

- exportAuditLogsToCSV utility function
- Export button in audit table
- CSV includes timestamp, action, school, resource, user, changes
- Proper CSV escaping for quoted fields
- Download with date-stamped filename"
```

---

## Task 5: Update Documentation and Final Verification

**Files:**
- Modify: `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md`

**Step 1: Add Phase 1.5 features to admin UI section**

In the documentation, expand the "Edit and Delete Operations" section to include:

```markdown
### Bulk Delete with Multi-Select

1. In Schools table, click checkbox to select individual schools
2. Use header checkbox to select/deselect all schools
3. Selected schools count appears in blue banner above table
4. Click "Delete X School(s)" button
5. Confirmation dialog shows all school names
6. All schools' defaults are deleted in single operation
7. Audit logs created for each school deletion

### Audit Log Viewer

1. Navigate to: `/organizations/school-defaults/audit`
2. View all create/update/delete actions in chronological order (newest first)
3. Columns show:
   - Timestamp (when action occurred)
   - Action type (Create/Update/Delete with color badges)
   - School name
   - Resource type (Degree or Department)
   - User who performed action (name or email)
   - Details (collapsible JSON showing exact changes)

4. Click "View Changes" to see detailed modifications
5. For update actions, shows before/after values
6. For create actions, shows created record IDs and names
7. For delete actions, shows deleted record details

### Export Audit Logs

1. In Audit Log page, click "Export as CSV" button
2. File downloads as `school-defaults-audit-YYYY-MM-DD.csv`
3. CSV contains all audit log entries with full change details
4. Importable into Excel, Google Sheets, or BI tools
5. JSON changes column can be parsed by downstream tools
```

**Step 2: Update completion checklist**

Add to deferred tasks section:

```markdown
## Phase 1.5: Admin UI Bulk Operations (Completed 2026-05-26)

### Completed Tasks

1. ✅ EditDefaultsModal component for editing degree/department names and codes
   - Form validation with zod
   - Update degree and department records
   - Audit trail for all updates
   - Cancel/Save workflow

2. ✅ Multi-select checkboxes in school table
   - Checkbox column with select-all header
   - Bulk delete button appears when schools selected
   - Confirmation with list of school names
   - Audit logging for each deleted school

3. ✅ Audit log viewer page at /organizations/school-defaults/audit
   - View all create/update/delete actions
   - Sorted by most recent first
   - Show user, timestamp, school, resource, changes
   - Collapsible details with JSON changes
   - Supports up to 500 entries per load

4. ✅ CSV export for audit logs
   - Export utility with proper CSV escaping
   - Button in audit table
   - Date-stamped filename
   - Includes all audit details
```

**Step 3: Commit documentation**

```bash
git add docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md
git commit -m "docs: add Phase 1.5 bulk operations and audit viewer guide

- Document multi-select and bulk delete workflow
- Explain audit log viewer page and filtering
- Add CSV export documentation
- Mark Phase 1.5 as complete with all features"
```

**Step 4: Final verification**

```bash
npm run typecheck
npm run build 2>&1 | tail -20
git log --oneline -7
```

Expected: Typecheck passes, build succeeds, 5 commits visible.

---

## Success Criteria

- [x] EditDefaultsModal component with form validation
- [x] Degree/department names and codes editable
- [x] Audit logging for update actions
- [x] Multi-select checkboxes in table
- [x] Bulk delete with confirmation
- [x] Audit log viewer page (/organizations/school-defaults/audit)
- [x] CSV export for audit logs
- [x] Sidebar link to audit page
- [x] Documentation updated
- [x] TypeScript compilation passes
- [x] Build succeeds
- [x] All commits created

## Deferred to Phase 1.6+

- Inline editing without modal (edit directly in table cells)
- Filter audit logs by date range / action type / school
- Pagination or infinite scroll for large audit logs
- Export to other formats (JSON, XLSX)
- Undo/rollback functionality for delete actions
- Real-time audit log updates via Supabase subscriptions

## Notes

- Edit modal reuses Dialog/Form pattern from existing Shadcn components
- Bulk delete uses same audit service as individual deletes
- Audit viewer loads 500 entries by default (pagination in Phase 1.6)
- CSV export uses native browser APIs (no external dependencies)
- All changes logged with user_id and timestamp
- Form validation prevents invalid degree/department codes
- Checkbox state managed in page component (single source of truth)
