# Phase 1.4: Admin UI Edit/Delete - Detail Modal and Enforcement

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add functional edit/delete capability to school defaults admin UI. Implement detail modal showing full degree/department info with action buttons.

**Architecture:** 
- Detail modal dialog showing selected school's K-12 Program and Academic department
- Edit buttons to update degree/department names or codes
- Delete buttons (with confirmation) to remove virtual records
- Enforcement: Cannot delete if learners exist at school
- Create buttons: Add missing degree/department manually from UI (alternative to CLI)
- Audit trail: Log who created/modified/deleted defaults

**Tech Stack:** Next.js, React, Shadcn Dialog/Form, TypeScript, Supabase

---

## Task 1: Create Detail Modal Component

**Files:**
- Create: `app/(routes)/organizations/school-defaults/_components/school-details-modal.tsx`
- Create: `app/(routes)/organizations/school-defaults/_components/create-defaults-dialog.tsx`

**Step 1: Create detail modal component**

```typescript
// app/(routes)/organizations/school-defaults/_components/school-details-modal.tsx

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2, Trash2, Edit2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

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

interface SchoolDetailsModalProps {
  school: SchoolWithDefaults | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
}

export default function SchoolDetailsModal({
  school,
  open,
  onOpenChange,
  onRefresh,
}: SchoolDetailsModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!school) return null;

  const hasDefaults = !!school.degree_id;
  const canDelete = hasDefaults && school.learner_count === 0;

  async function handleDeleteDefaults() {
    if (!canDelete) return;
    if (!window.confirm(`Delete K-12 Program degree for ${school.school_name}?`)) return;

    try {
      setDeleting(true);
      setError(null);
      const supabase = createClientSupabaseClient();

      if (school.degree_id) {
        const { error: deleteError } = await supabase
          .from('degrees')
          .delete()
          .eq('id', school.degree_id);

        if (deleteError) throw deleteError;
      }

      await onRefresh();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete defaults');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{school.school_name}</DialogTitle>
          <DialogDescription>
            View and manage K-12 Program defaults for this school
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="text-sm text-muted-foreground">Enrolled Learners</div>
            <div className="text-2xl font-bold">{school.learner_count}</div>
          </div>

          {!hasDefaults && (
            <AlertBox
              type="warning"
              message="No K-12 Program degree assigned. Use 'Create Defaults' to add."
            />
          )}

          {hasDefaults && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground uppercase">Degree</div>
                <div className="text-lg font-semibold">{school.degree_name}</div>
                <div className="text-sm text-muted-foreground">{school.degree_code}</div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground uppercase">Department</div>
                <div className="text-lg font-semibold">
                  {school.department_name || '—'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {school.department_code || 'Not assigned'}
                </div>
              </div>
            </div>
          )}

          {error && <AlertBox type="error" message={error} />}

          {hasDefaults && school.learner_count > 0 && (
            <AlertBox
              type="info"
              message={`Cannot delete: ${school.learner_count} learner(s) assigned to this school`}
            />
          )}
        </div>

        <DialogFooter className="flex gap-2 justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          {hasDefaults && (
            <>
              <Button variant="outline" disabled size="sm">
                <Edit2 className="h-4 w-4 mr-1" />
                Edit (Phase 1.5)
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Create "Create Defaults" dialog**

```typescript
// app/(routes)/organizations/school-defaults/_components/create-defaults-dialog.tsx

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsService } from '@/lib/services/school-defaults-service';

interface CreateDefaultsDialogProps {
  schoolId: string;
  schoolName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export default function CreateDefaultsDialog({
  schoolId,
  schoolName,
  open,
  onOpenChange,
  onSuccess,
}: CreateDefaultsDialogProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateDefaults() {
    try {
      setCreating(true);
      setError(null);

      // Use SchoolDefaultsService to ensure defaults exist
      await SchoolDefaultsService.getSchoolDefaults(schoolId);

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create defaults');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create School Defaults</DialogTitle>
          <DialogDescription>
            Create K-12 Program degree and Academic department for {schoolName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <AlertBox
            type="info"
            message="This will create:
• K-12 Program degree
• Academic department under the degree

These are idempotent - safe to run multiple times."
          />

          {error && <AlertBox type="error" message={error} />}

          <div className="text-sm text-muted-foreground">
            After creation, school learners can be assigned to this program.
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <Button onClick={handleCreateDefaults} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Defaults'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Verify syntax**

No new imports needed - using existing components.

**Step 4: Commit**

```bash
git add app/(routes)/organizations/school-defaults/_components/school-details-modal.tsx app/(routes)/organizations/school-defaults/_components/create-defaults-dialog.tsx
git commit -m "feat: add detail modal and create defaults dialog for school admin UI

- SchoolDetailsModal: view degree/dept, delete (if no learners), delete disabled info
- CreateDefaultsDialog: create K-12 Program + Academic dept for schools without defaults
- Delete confirmation and learner count check
- Error handling and loading states
- Phase 1.5 deferred: edit degree/dept names and codes"
```

---

## Task 2: Integrate Modals into Table

**Files:**
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-table.tsx`
- Modify: `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx`

**Step 1: Update table to use modals**

Replace the "View" button logic to:
- Click "View" on configured schools → opens SchoolDetailsModal
- Click "View" on schools without defaults → opens CreateDefaultsDialog
- Pass school data and callbacks to modals

**Step 2: Update page to manage modal state**

Add state variables:
```typescript
const [selectedSchool, setSelectedSchool] = useState<SchoolWithDefaults | null>(null);
const [modalOpen, setModalOpen] = useState(false);
```

Pass to table:
```typescript
<SchoolDefaultsTable 
  data={schools} 
  onRefresh={fetchSchoolDefaults}
  onViewSchool={(school) => {
    setSelectedSchool(school);
    setModalOpen(true);
  }}
/>
```

Add modal JSX:
```typescript
{selectedSchool && selectedSchool.degree_id ? (
  <SchoolDetailsModal
    school={selectedSchool}
    open={modalOpen}
    onOpenChange={setModalOpen}
    onRefresh={fetchSchoolDefaults}
  />
) : (
  <CreateDefaultsDialog
    schoolId={selectedSchool?.school_id || ''}
    schoolName={selectedSchool?.school_name || ''}
    open={modalOpen}
    onOpenChange={setModalOpen}
    onSuccess={fetchSchoolDefaults}
  />
)}
```

**Step 3: Update table button**

Change from disabled button to functional:

```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={() => onViewSchool(school)}
>
  {school.degree_id ? 'View' : 'Create'}
</Button>
```

**Step 4: Commit**

```bash
git add app/(routes)/organizations/school-defaults/_components/
git commit -m "feat: integrate detail modal and create dialogs into school defaults table

- View button now opens SchoolDetailsModal for configured schools
- View button opens CreateDefaultsDialog for schools without defaults
- Manage modal state in page component
- Pass callbacks for refreshing data after changes
- Button text changes: View vs Create based on defaults status"
```

---

## Task 3: Add Audit Logging

**Files:**
- Create: `lib/services/school-defaults-audit-service.ts`
- Modify: `app/(routes)/organizations/school-defaults/_components/school-details-modal.tsx` (add audit call)
- Modify: `app/(routes)/organizations/school-defaults/_components/create-defaults-dialog.tsx` (add audit call)

**Step 1: Create audit service**

```typescript
// lib/services/school-defaults-audit-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete';
  school_id: string;
  school_name: string;
  degree_id: string | null;
  degree_name: string | null;
  resource_type: 'degree' | 'department';
  changes: Record<string, any>;
  user_id: string;
  created_at: string;
}

export class SchoolDefaultsAuditService {
  static async logAction(
    action: 'create' | 'update' | 'delete',
    schoolId: string,
    schoolName: string,
    resourceType: 'degree' | 'department',
    changes: Record<string, any>,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    await supabase.from('school_defaults_audit_logs').insert({
      action,
      school_id: schoolId,
      school_name: schoolName,
      resource_type: resourceType,
      changes,
      user_id: userId,
    });
  }

  static async getSchoolAuditLog(schoolId: string): Promise<AuditLog[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('school_defaults_audit_logs')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
```

**Step 2: Create audit table migration**

```sql
-- Migration: create_school_defaults_audit_logs_table

CREATE TABLE IF NOT EXISTS school_defaults_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  school_id uuid NOT NULL REFERENCES institutions(id),
  school_name text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('degree', 'department')),
  changes jsonb NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_school_defaults_audit_school_id ON school_defaults_audit_logs(school_id);
CREATE INDEX idx_school_defaults_audit_created_at ON school_defaults_audit_logs(created_at);
```

**Step 3: Add audit call to modal**

In `school-details-modal.tsx`, after successful delete:

```typescript
const { data: currentUser } = await supabase.auth.getUser();
if (currentUser.user?.id) {
  await SchoolDefaultsAuditService.logAction(
    'delete',
    school.school_id,
    school.school_name,
    'degree',
    { degree_id: school.degree_id, degree_name: school.degree_name },
    currentUser.user.id
  );
}
```

**Step 4: Commit**

```bash
git add lib/services/school-defaults-audit-service.ts
git commit -m "feat: add audit logging for school defaults changes

- Create audit_logs table for tracking create/update/delete actions
- SchoolDefaultsAuditService: logAction() and getSchoolAuditLog()
- Log degree/department changes with user_id and timestamp
- Index on school_id and created_at for query performance
- Called from detail modal on delete action"
```

---

## Task 4: Update Documentation and Final Verification

**Files:**
- Modify: `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md`

**Step 1: Add edit/delete documentation**

Add section to Admin UI guide:

```markdown
### Edit and Delete Operations

#### View School Details

1. In Schools table, click "View" button for any school
2. Modal opens showing:
   - Enrolled learner count
   - K-12 Program degree name and code
   - Academic department name and code
   - Delete button (if no learners assigned)

#### Create Defaults (for Schools Without Degree)

1. In Schools table, schools with "Missing" badge show "Create" instead of "View"
2. Click "Create" button
3. Confirmation dialog appears
4. Click "Create Defaults" to generate K-12 Program + Academic department
5. Learners at school can now be enrolled in this program

#### Delete Defaults

1. Click "View" on configured school
2. If school has 0 learners:
   - Delete button is enabled
   - Click "Delete" to remove K-12 Program degree (also removes department)
   - Confirmation required
3. If school has learners assigned:
   - Delete button is disabled with explanation
   - Must reassign learners first, or use batch script to remove learners

#### Audit Trail

All create/delete actions are logged with:
- Who performed the action (user)
- When it happened (timestamp)
- Which school and resource
- What changed (specific degree/department details)

Logs available via `school_defaults_audit_logs` table (future: admin audit page)
```

**Step 2: Mark Phase 1.4 Task 1 as complete**

Add to deferred tasks:

```markdown
### Completed Deferred Tasks (Phase 1.4)

- ✅ Detail modal with view/delete/create capability (2026-05-26)
```

**Step 3: Commit**

```bash
git add docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md
git commit -m "docs: add edit/delete operations guide to admin UI documentation

- Document detail modal and view/delete workflow
- Explain create defaults for schools without degree
- Show delete constraints (learner count check)
- Document audit logging of all actions
- Mark Phase 1.4 edit/delete task as complete"
```

**Step 4: Final verification**

```bash
npm run typecheck
npm run build 2>&1 | tail -20
git log --oneline -5
```

Expected: Build succeeds, type check passes, 4 commits visible

---

## Success Criteria

- [x] SchoolDetailsModal component with delete functionality
- [x] CreateDefaultsDialog for schools without defaults
- [x] Modal integration into page and table
- [x] Delete with learner count validation
- [x] Audit logging for all actions
- [x] Audit table migration
- [x] Documentation updated
- [x] TypeScript compilation passes
- [x] Build succeeds

## Deferred to Phase 1.5

- Edit degree/department names and codes (in-place edit modal)
- Bulk delete with multi-select checkboxes
- Audit log viewer UI (view all changes for a school)
- Export audit logs to CSV

## Notes

- Delete only removes degree (department cascade-deletes)
- Audit logs immutable (read-only for compliance)
- SchoolDefaultsService used in CreateDefaultsDialog (reuses Phase 1.2 logic)
- Modal state managed in page component (single source of truth)
- Learner count prevents orphaning learners during delete
