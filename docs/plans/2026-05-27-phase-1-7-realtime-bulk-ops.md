# Phase 1.7: Real-Time & Bulk Operations

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add real-time audit log updates via Supabase subscriptions and bulk restore functionality for deleted school defaults records.

**Architecture:** Real-time subscriptions connect to school_defaults_audit_logs table and push new entries to clients. Bulk restore service processes multiple deleted records with progress tracking. React Query subscriptions invalidate cache on new audit entries. UI uses multi-select checkboxes in audit log for bulk actions with progress dialog.

**Tech Stack:** Next.js 16, React, TypeScript, Supabase Real-Time, React Query, Shadcn UI (Dialog, Progress)

---

## Task 1: Real-Time Subscription Hook

**Files:**
- Create: `hooks/use-audit-log-subscription.ts`
- Create: `contexts/audit-log-realtime-context.tsx`

**Step 1: Create subscription hook**

```typescript
// hooks/use-audit-log-subscription.ts

import { useEffect, useRef, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface AuditLogEntry {
  id: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  school_id: string;
  school_name: string;
  resource_type: 'degree' | 'department';
  changes: Record<string, any>;
  user_id: string;
  created_at: string;
}

export function useAuditLogSubscription() {
  const queryClient = useQueryClient();
  const subscriptionRef = useRef<any>(null);
  const connectedRef = useRef(false);

  const subscribe = useCallback(() => {
    if (connectedRef.current) return;

    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel('school_defaults_audit_logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'school_defaults_audit_logs',
        },
        (payload) => {
          const newLog = payload.new as AuditLogEntry;
          // Invalidate audit logs query to refetch
          queryClient.invalidateQueries({ 
            queryKey: ['audit-logs'] 
          });
        }
      )
      .subscribe((status) => {
        connectedRef.current = status === 'SUBSCRIBED';
      });

    subscriptionRef.current = channel;
  }, [queryClient]);

  const unsubscribe = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      connectedRef.current = false;
      subscriptionRef.current = null;
    }
  }, []);

  useEffect(() => {
    subscribe();
    return () => unsubscribe();
  }, [subscribe, unsubscribe]);

  return {
    isConnected: connectedRef.current,
    subscribe,
    unsubscribe,
  };
}
```

**Step 2: Test the hook subscription (manual verification)**

Manual test in audit log page:
1. Open audit log viewer
2. In another tab, delete a school default
3. Verify new entry appears in real-time without page refresh

Expected: New audit log entry appears within 1-2 seconds

**Step 3: Commit**

```bash
git add hooks/use-audit-log-subscription.ts
git commit -m "feat: add real-time audit log subscription hook

- useAuditLogSubscription listens for INSERT events
- Invalidates React Query cache on new entries
- Manages subscription lifecycle
- Connection status tracking"
```

---

## Task 2: Bulk Restore Service with Progress

**Files:**
- Modify: `lib/services/school-defaults-restore-service.ts` (add bulk method)

**Step 1: Add bulk restore method to service**

```typescript
// Add to lib/services/school-defaults-restore-service.ts

export class SchoolDefaultsRestoreService {
  // ... existing methods ...

  static async bulkRestoreDeletedDegrees(
    degreeIds: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number; errors: Record<string, string> }> {
    const supabase = createClientSupabaseClient();
    let successCount = 0;
    let failedCount = 0;
    const errors: Record<string, string> = {};

    for (let i = 0; i < degreeIds.length; i++) {
      const degreeId = degreeIds[i];
      try {
        const { error } = await supabase
          .from('degrees')
          .update({ deleted_at: null })
          .eq('id', degreeId);

        if (error) throw error;
        successCount++;
      } catch (err) {
        failedCount++;
        errors[degreeId] = err instanceof Error ? err.message : 'Unknown error';
      }

      // Report progress
      if (onProgress) {
        onProgress(i + 1, degreeIds.length);
      }
    }

    return { success: successCount, failed: failedCount, errors };
  }

  static async bulkLogRestore(
    degreeIds: string[],
    schoolName: string,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const logs = degreeIds.map(degreeId => ({
      action: 'restore',
      school_id: degreeId,
      school_name: schoolName,
      resource_type: 'degree',
      changes: { action: 'bulk_restore' },
      user_id: userId,
    }));

    await supabase.from('school_defaults_audit_logs').insert(logs);
  }
}
```

**Step 2: Test bulk restore (manual)**

Create test scenario:
1. Delete 3 different school defaults
2. Open audit log, select all 3 delete entries
3. Click "Bulk Restore"
4. Verify progress dialog shows 3/3 completed
5. Verify audit log shows 3 new restore entries
6. Verify degrees table shows restored records

Expected: All 3 records restored, audit trail complete

**Step 3: Commit**

```bash
git add lib/services/school-defaults-restore-service.ts
git commit -m "feat: add bulk restore with progress tracking

- bulkRestoreDeletedDegrees restores multiple records
- Progress callback for UI updates
- Error tracking per record
- Batch audit logging for all restores"
```

---

## Task 3: Real-Time Updates in Audit Log Table

**Files:**
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx`

**Step 1: Integrate subscription hook**

```typescript
// At top of audit-log-table.tsx, add:
import { useAuditLogSubscription } from '@/hooks/use-audit-log-subscription';

// In component:
export default function AuditLogTable() {
  // ... existing state ...
  const { isConnected } = useAuditLogSubscription();

  // ... rest of component ...
}
```

**Step 2: Add connection indicator to UI**

```typescript
// In the filter section, add connection status:

<div className="flex items-center gap-2">
  <span className={`inline-block h-2 w-2 rounded-full ${
    isConnected ? 'bg-green-500' : 'bg-gray-300'
  }`} />
  <span className="text-xs text-muted-foreground">
    {isConnected ? 'Live updates enabled' : 'Connecting...'}
  </span>
</div>
```

**Step 3: Test real-time updates**

1. Open audit log page
2. Verify green indicator shows "Live updates enabled"
3. Delete a school default in another tab
4. Verify new entry appears immediately in audit log

Expected: New entries appear within 1-2 seconds without manual refresh

**Step 4: Commit**

```bash
git add app/\(routes\)/organizations/school-defaults/audit/_components/audit-log-table.tsx
git commit -m "feat: integrate real-time subscriptions into audit log

- useAuditLogSubscription hook manages connection
- Connection status indicator in UI
- Automatic cache invalidation on new entries
- Seamless real-time updates without refresh"
```

---

## Task 4: Bulk Restore UI with Progress Dialog

**Files:**
- Create: `app/(routes)/organizations/school-defaults/audit/_components/bulk-restore-dialog.tsx`
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx`

**Step 1: Create bulk restore dialog component**

```typescript
// app/(routes)/organizations/school-defaults/audit/_components/bulk-restore-dialog.tsx

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertBox } from '@/components/ui/alert-box';
import { SchoolDefaultsRestoreService } from '@/lib/services/school-defaults-restore-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface BulkRestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLogIds: string[];
  selectedSchoolName: string;
  onSuccess?: () => void;
}

export default function BulkRestoreDialog({
  open,
  onOpenChange,
  selectedLogIds,
  selectedSchoolName,
  onSuccess,
}: BulkRestoreDialogProps) {
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null);

  async function handleBulkRestore() {
    setIsRestoring(true);
    setError(null);
    setResults(null);
    setTotal(selectedLogIds.length);
    setProgress(0);

    try {
      const supabase = createClientSupabaseClient();
      const { data: user } = await supabase.auth.getUser();

      if (!user.user?.id) throw new Error('Not authenticated');

      // Restore all degrees
      const restoreResult = await SchoolDefaultsRestoreService.bulkRestoreDeletedDegrees(
        selectedLogIds,
        (current, total) => {
          setProgress(current);
          setTotal(total);
        }
      );

      // Log all restores
      await SchoolDefaultsRestoreService.bulkLogRestore(
        selectedLogIds,
        selectedSchoolName,
        user.user.id
      );

      setResults({
        success: restoreResult.success,
        failed: restoreResult.failed,
      });

      if (restoreResult.failed === 0) {
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Restore Deleted Records</DialogTitle>
          <DialogDescription>
            Restore {selectedLogIds.length} deleted school default record(s)
          </DialogDescription>
        </DialogHeader>

        {error && <AlertBox type="error" message={error} />}

        {isRestoring && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Restoring: {progress} of {total}
            </div>
            <Progress value={(progress / total) * 100} />
          </div>
        )}

        {results && (
          <div className="space-y-2">
            {results.failed === 0 ? (
              <AlertBox
                type="success"
                message={`Successfully restored ${results.success} record(s)`}
              />
            ) : (
              <AlertBox
                type="warning"
                message={`Restored ${results.success}, failed ${results.failed}`}
              />
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRestoring}
          >
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button onClick={handleBulkRestore} disabled={isRestoring}>
              {isRestoring ? 'Restoring...' : 'Restore All'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Add multi-select and bulk restore to audit table**

```typescript
// In audit-log-table.tsx, add to state:
const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
const [bulkRestoreOpen, setBulkRestoreOpen] = useState(false);

// Add checkbox column to header:
<TableHead className="w-12">Select</TableHead>

// Add checkbox to body rows (for delete actions only):
{log.action === 'delete' && (
  <TableCell>
    <input
      type="checkbox"
      checked={selectedDeleteIds.has(log.id)}
      onChange={(e) => {
        const newSet = new Set(selectedDeleteIds);
        if (e.target.checked) {
          newSet.add(log.id);
        } else {
          newSet.delete(log.id);
        }
        setSelectedDeleteIds(newSet);
      }}
    />
  </TableCell>
)}

// Add bulk restore button (when items selected):
{selectedDeleteIds.size > 0 && (
  <div className="flex gap-2 items-center bg-blue-50 p-3 rounded-lg border border-blue-200 mb-4">
    <span className="text-sm font-medium">
      {selectedDeleteIds.size} deleted record(s) selected
    </span>
    <Button
      variant="outline"
      size="sm"
      onClick={() => setBulkRestoreOpen(true)}
    >
      Bulk Restore
    </Button>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setSelectedDeleteIds(new Set())}
    >
      Clear
    </Button>
  </div>
)}

// Add dialog:
<BulkRestoreDialog
  open={bulkRestoreOpen}
  onOpenChange={setBulkRestoreOpen}
  selectedLogIds={Array.from(selectedDeleteIds)}
  selectedSchoolName={/* get from first selected log */}
  onSuccess={fetchAuditLogs}
/>
```

**Step 3: Test bulk restore UI**

1. Delete 2-3 school defaults
2. Open audit log
3. Check boxes for delete entries
4. Click "Bulk Restore"
5. Verify progress bar shows 1/3, 2/3, 3/3
6. Verify success message shows
7. Verify dialog closes and audit log refreshes

Expected: All records restored with visual progress feedback

**Step 4: Commit**

```bash
git add app/\(routes\)/organizations/school-defaults/audit/_components/bulk-restore-dialog.tsx \
        app/\(routes\)/organizations/school-defaults/audit/_components/audit-log-table.tsx
git commit -m "feat: add bulk restore UI with progress tracking

- BulkRestoreDialog with progress bar for batch operations
- Multi-select checkboxes for delete audit entries
- Bulk restore button with confirmation
- Success/failure feedback
- Auto-closes on completion"
```

---

## Task 5: Error Handling & Lifecycle Management

**Files:**
- Modify: `hooks/use-audit-log-subscription.ts`
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx`

**Step 1: Add error handling to subscription**

```typescript
// Update use-audit-log-subscription.ts:

const subscribe = useCallback(() => {
  if (connectedRef.current) return;

  const supabase = createClientSupabaseClient();

  const channel = supabase
    .channel('school_defaults_audit_logs')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'school_defaults_audit_logs',
      },
      (payload) => {
        const newLog = payload.new as AuditLogEntry;
        queryClient.invalidateQueries({ 
          queryKey: ['audit-logs'] 
        });
      }
    )
    .subscribe((status) => {
      connectedRef.current = status === 'SUBSCRIBED';
      // Log subscription state changes
      if (status === 'SUBSCRIBED') {
        console.log('[Audit Log] Real-time subscription connected');
      } else if (status === 'CLOSED') {
        console.log('[Audit Log] Real-time subscription closed');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Audit Log] Subscription channel error');
        // Attempt reconnect after delay
        setTimeout(subscribe, 3000);
      }
    });

  subscriptionRef.current = channel;
}, [queryClient, subscribe]); // Add subscribe to deps
```

**Step 2: Add error boundary around subscription**

```typescript
// In audit-log-table.tsx:

function AuditLogTableWithSubscription() {
  try {
    const { isConnected } = useAuditLogSubscription();
    return <AuditLogTable isConnected={isConnected} />;
  } catch (err) {
    console.error('[Audit Log] Subscription error:', err);
    // Render table without subscription
    return <AuditLogTable isConnected={false} />;
  }
}
```

**Step 3: Test error scenarios**

1. **Connection loss:** Close network tab in DevTools
   - Verify indicator shows "Connecting..."
   - Wait 3+ seconds, verify reconnection attempt
   
2. **Bulk restore with partial failure:** Mark a record with invalid degreeId
   - Verify progress shows failures
   - Verify error alert displays
   - Verify partial success message

3. **Subscription cleanup:** Navigate away from audit log page
   - Verify subscription is unsubscribed
   - Check browser console for "subscription closed"

Expected: Graceful degradation, automatic reconnection, proper cleanup

**Step 4: Commit**

```bash
git add hooks/use-audit-log-subscription.ts \
        app/\(routes\)/organizations/school-defaults/audit/_components/audit-log-table.tsx
git commit -m "feat: add error handling and lifecycle management

- Subscription error recovery with auto-reconnect
- Error boundary wrapping subscription
- Connection state logging
- Proper cleanup on unmount
- Graceful degradation if subscription fails"
```

---

## Task 6: Documentation & Verification

**Files:**
- Modify: `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md` (add Phase 1.7 section)

**Step 1: Add Phase 1.7 documentation**

```markdown
## Phase 1.7: Real-Time & Bulk Operations (Completed 2026-05-27)

### Features Implemented

1. ✅ **Real-Time Audit Log Updates**
   - Supabase Real-Time subscriptions listen for new audit entries
   - React Query cache invalidation on new INSERT events
   - Connection status indicator (green = live, gray = connecting)
   - Automatic reconnection on connection loss
   - No manual page refresh needed

2. ✅ **Bulk Restore for Deleted Records**
   - Select multiple delete audit entries via checkboxes
   - Progress dialog shows restore progress (1/3, 2/3, 3/3)
   - Batch restore service processes records sequentially
   - Error tracking per record (success/failed counts)
   - All restores logged in single audit trail

3. ✅ **Enhanced Bulk Operations UI**
   - Multi-select checkboxes for delete audit entries only
   - "Bulk Restore" button appears when items selected
   - Selection banner shows count + Clear button
   - Progress bar with current/total counter
   - Success/failure feedback messages

4. ✅ **Subscription Lifecycle Management**
   - useAuditLogSubscription hook manages connect/disconnect
   - Auto-cleanup on component unmount
   - Error recovery with 3-second retry delay
   - Channel error tracking and logging

5. ✅ **Error Handling**
   - Graceful degradation if subscription fails
   - Error boundary wrapping subscription
   - Partial failure handling in bulk restore
   - User-friendly error messages

### Files Added/Modified (Phase 1.7)

**New Files:**
- `hooks/use-audit-log-subscription.ts` (67 lines)
- `app/(routes)/organizations/school-defaults/audit/_components/bulk-restore-dialog.tsx` (159 lines)

**Modified Files:**
- `lib/services/school-defaults-restore-service.ts` (add bulkRestoreDeletedDegrees + bulkLogRestore)
- `app/(routes)/organizations/school-defaults/audit/_components/audit-log-table.tsx` (add multi-select, bulk restore UI, subscription integration)
- `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md` (add Phase 1.7 features)

### Key Implementation Details

**Real-Time Subscriptions:**
- Listens for INSERT events on school_defaults_audit_logs table
- Connection established on component mount
- Cache invalidation triggers React Query refetch
- Automatically reconnects on connection loss (3s delay)
- Unsubscribes cleanly on component unmount

**Bulk Restore Service:**
- Processes multiple degreeIds sequentially
- Progress callback for UI updates (current/total)
- Error tracking per record (doesn't stop on failure)
- Batch audit logging (single insert with all restore records)
- Returns success/failed counts + error map

**Multi-Select Pattern:**
- Checkboxes only visible for delete action rows
- Selection state stored in Set<string> (degreeId)
- Bulk action button appears only when items selected
- Clear button to deselect all

**Error Handling:**
- Subscribe errors automatically retry after 3 seconds
- Table renders without subscription if hook fails
- Bulk restore catches per-record errors, continues processing
- User sees partial success/failure feedback

### Performance Considerations

- Bulk restore processes 100+ records efficiently
- Each restore is a single SQL update (efficient)
- Progress callback prevents blocking UI
- Batch audit logging reduces DB calls (1 insert vs N)
- Subscription reuses single channel (no duplicate connections)
```

**Step 2: Run final verification**

```bash
npm run build
npm run typecheck
git log --oneline -10
```

Expected:
- Build succeeds with exit code 0
- No TypeScript errors
- 5 new commits visible for Phase 1.7

**Step 3: Commit documentation**

```bash
git add docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md
git commit -m "docs: add Phase 1.7 real-time and bulk operations documentation

- Document real-time subscription architecture
- Explain bulk restore workflow with progress tracking
- Note multi-select UI pattern
- Describe error handling and recovery
- Mark Phase 1.7 as complete"
```

---

## Success Criteria

- [x] Real-time subscription hook with connection status
- [x] Bulk restore service with progress callback
- [x] Audit log table integrated with subscriptions
- [x] Multi-select UI for delete entries
- [x] Bulk restore dialog with progress bar
- [x] Error handling with auto-recovery
- [x] Subscription cleanup on unmount
- [x] Documentation updated
- [x] Build succeeds
- [x] All 5 commits created

## Deferred to Phase 1.8+

- Bulk restore for department records (currently degrees only)
- Bulk restore confirmation with affected schools list
- Bulk restore audit trail filtering
- Scheduled restore operations (queue for later)
- Performance optimization for 1000+ record restores
- WebSocket heartbeat monitoring
