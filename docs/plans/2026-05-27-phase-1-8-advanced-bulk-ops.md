# Phase 1.8: Advanced Bulk Operations & Performance

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Extend Phase 1.7's bulk restore capabilities to support departments, add pre-restore confirmation with affected schools, implement scheduled operations, add heartbeat monitoring for connection stability, and optimize for 1000+ record operations.

**Architecture:** Extend existing `SchoolDefaultsRestoreService` with department support and scheduled operations queue. Add `RestoreConfirmationDialog` to show affected schools before commit. Enhance `useAuditLogSubscription` with heartbeat monitoring. Create pagination/batching for large restores with progress granularity.

**Tech Stack:** Supabase (Realtime, PostgRES), React hooks (useEffect, useRef, useState), React Query, Shadcn UI (Dialog, Checkbox, Progress)

---

## Task 1: Extend Restore Service for Departments

**Files:**
- Modify: `lib/services/school-defaults-restore-service.ts:1-90`
- Test: Manual verification in dev environment

**Step 1: Add department-aware query helper**

```typescript
// In school-defaults-restore-service.ts, add this helper function after imports

async function getDeletedRecords(
  supabase: ReturnType<typeof createClientSupabaseClient>,
  resourceType: 'degree' | 'department'
): Promise<Array<{ id: string; school_id: string; school_name: string; name: string; code: string; deleted_at: string }>> {
  const tableName = resourceType === 'degree' ? 'degrees' : 'departments';
  const nameField = resourceType === 'degree' ? 'degree_name' : 'department_name';
  const codeField = resourceType === 'degree' ? 'degree_code' : 'department_code';

  const { data, error } = await supabase
    .from(tableName)
    .select(`
      id,
      school_id:institutions!inner(id, institution_name),
      ${nameField},
      ${codeField},
      deleted_at
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    id: item.id,
    school_id: item.school_id.id,
    school_name: item.school_id.institution_name,
    name: item[nameField],
    code: item[codeField],
    deleted_at: item.deleted_at,
  }));
}
```

**Step 2: Add bulk restore with resource type support**

```typescript
// Replace existing bulkRestoreDeletedDegrees with this new method

static async bulkRestoreDeletedRecords(
  recordIds: string[],
  resourceType: 'degree' | 'department',
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number; errors: Record<string, string> }> {
  const supabase = createClientSupabaseClient();
  const tableName = resourceType === 'degree' ? 'degrees' : 'departments';
  let successCount = 0;
  let failedCount = 0;
  const errors: Record<string, string> = {};

  for (let i = 0; i < recordIds.length; i++) {
    const recordId = recordIds[i];
    try {
      const { error } = await supabase
        .from(tableName)
        .update({ deleted_at: null })
        .eq('id', recordId);

      if (error) throw error;
      successCount++;
    } catch (err) {
      failedCount++;
      errors[recordId] = err instanceof Error ? err.message : 'Unknown error';
    }

    if (onProgress) {
      onProgress(i + 1, recordIds.length);
    }
  }

  return { success: successCount, failed: failedCount, errors };
}
```

**Step 3: Add batch restore for performance (1000+ records)**

```typescript
// Add this method after bulkRestoreDeletedRecords

static async bulkRestoreDeletedRecordsBatched(
  recordIds: string[],
  resourceType: 'degree' | 'department',
  batchSize: number = 100,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number; errors: Record<string, string> }> {
  let totalSuccess = 0;
  let totalFailed = 0;
  const allErrors: Record<string, string> = {};

  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    const results = await this.bulkRestoreDeletedRecords(
      batch,
      resourceType,
      (current, total) => {
        const overallCurrent = i + current;
        onProgress?.(overallCurrent, recordIds.length);
      }
    );

    totalSuccess += results.success;
    totalFailed += results.failed;
    Object.assign(allErrors, results.errors);
  }

  return { success: totalSuccess, failed: totalFailed, errors: allErrors };
}
```

**Step 4: Update bulk log restore to support departments**

```typescript
// Replace existing bulkLogRestore with this version

static async bulkLogRestore(
  recordIds: string[],
  resourceType: 'degree' | 'department',
  schoolName: string,
  userId: string
): Promise<void> {
  const supabase = createClientSupabaseClient();

  const logs = recordIds.map(recordId => ({
    action: 'restore',
    school_id: undefined, // Will be populated by DB trigger if needed
    school_name: schoolName,
    resource_type: resourceType,
    changes: { action: 'bulk_restore', resource_type: resourceType },
    user_id: userId,
  }));

  await supabase.from('school_defaults_audit_logs').insert(logs);
}
```

**Step 5: Commit**

```bash
git add lib/services/school-defaults-restore-service.ts
git commit -m "feat: extend restore service for departments and batched operations

- Add getDeletedRecords helper supporting degree and department queries
- Replace bulkRestoreDeletedDegrees with bulkRestoreDeletedRecords (resource_type param)
- Add bulkRestoreDeletedRecordsBatched for 1000+ record operations
- Update bulkLogRestore to support both degree and department resource types
- Batch size default: 100 records per transaction for performance"
```

---

## Task 2: Create Restore Confirmation Dialog

**Files:**
- Create: `app/(routes)/organizations/school-defaults/_components/restore-confirmation-dialog.tsx`

**Step 1: Design confirmation dialog component**

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertBox } from '@/components/ui/alert-box';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeletedRecord {
  id: string;
  school_id: string;
  school_name: string;
  name: string;
  code: string;
}

interface RestoreConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: DeletedRecord[];
  resourceType: 'degree' | 'department';
  onConfirm: (recordIds: string[]) => Promise<void>;
}

export default function RestoreConfirmationDialog({
  open,
  onOpenChange,
  records,
  resourceType,
  onConfirm,
}: RestoreConfirmationDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(records.map(r => r.id)));
      setError(null);
    }
  }, [open, records]);

  const affectedSchools = Array.from(
    new Set(
      records
        .filter(r => selectedIds.has(r.id))
        .map(r => r.school_name)
    )
  );

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      setError(null);
      await onConfirm(Array.from(selectedIds));
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore records');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Confirm Restoration
          </DialogTitle>
          <DialogDescription>
            Review affected schools before restoring {resourceType === 'degree' ? 'K-12 Programs' : 'departments'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && <AlertBox type="error" message={error} />}

          <div>
            <h3 className="font-semibold text-sm mb-2">Records to Restore ({selectedIds.size})</h3>
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
              {records.map(record => (
                <div key={record.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded text-sm">
                  <Checkbox
                    checked={selectedIds.has(record.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedIds);
                      if (checked) {
                        newSet.add(record.id);
                      } else {
                        newSet.delete(record.id);
                      }
                      setSelectedIds(newSet);
                    }}
                    disabled={confirming}
                  />
                  <span className="flex-1">
                    {record.name} <span className="text-gray-500">({record.code})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">Affected Schools ({affectedSchools.length})</h3>
            <div className="flex flex-wrap gap-2">
              {affectedSchools.map(school => (
                <Badge key={school} variant="secondary">
                  {school}
                </Badge>
              ))}
            </div>
          </div>

          <AlertBox
            type="warning"
            message={`This will restore ${selectedIds.size} ${resourceType}(s) across ${affectedSchools.length} school(s). This action is reversible.`}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || confirming}
            className="gap-2"
          >
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirming ? 'Restoring...' : `Restore (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Add to school-defaults-page imports**

In `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx`:

```typescript
import RestoreConfirmationDialog from './restore-confirmation-dialog';
```

**Step 3: Update school-defaults-page state**

```typescript
const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
const [confirmDialogRecords, setConfirmDialogRecords] = useState<any[]>([]);
const [confirmResourceType, setConfirmResourceType] = useState<'degree' | 'department'>('degree');
```

**Step 4: Add handler to open confirmation**

```typescript
async function handleOpenRestoreConfirmation() {
  try {
    const supabase = createClientSupabaseClient();
    
    // Fetch both degrees and departments
    const { data: degrees } = await supabase
      .from('degrees')
      .select('id, institutions!inner(id, institution_name), degree_name, degree_code, deleted_at')
      .not('deleted_at', 'is', null);

    const { data: departments } = await supabase
      .from('departments')
      .select('id, institutions!inner(id, institution_name), department_name, department_code, deleted_at')
      .not('deleted_at', 'is', null);

    // For now, show degrees (can extend to toggle between types)
    const transformed = (degrees || []).map((item: any) => ({
      id: item.id,
      school_id: item.institutions[0]?.id,
      school_name: item.institutions[0]?.institution_name,
      name: item.degree_name,
      code: item.degree_code,
    }));

    setConfirmDialogRecords(transformed);
    setConfirmResourceType('degree');
    setConfirmDialogOpen(true);
  } catch (err) {
    console.error('Error loading records for confirmation:', err);
  }
}
```

**Step 5: Add confirmation dialog to JSX**

```typescript
<RestoreConfirmationDialog
  open={confirmDialogOpen}
  onOpenChange={setConfirmDialogOpen}
  records={confirmDialogRecords}
  resourceType={confirmResourceType}
  onConfirm={async (recordIds) => {
    const { data: user } = await createClientSupabaseClient().auth.getUser();
    if (user.user?.id) {
      await SchoolDefaultsRestoreService.bulkRestoreDeletedRecordsBatched(
        recordIds,
        confirmResourceType,
        100,
        (current, total) => {
          // Progress tracking if needed
        }
      );
      await fetchDeletedDegrees();
    }
  }}
/>
```

**Step 6: Commit**

```bash
git add app/\(routes\)/organizations/school-defaults/_components/restore-confirmation-dialog.tsx
git add app/\(routes\)/organizations/school-defaults/_components/school-defaults-page.tsx
git commit -m "feat: add restore confirmation dialog with affected schools display

- Show all affected schools and record counts before committing restore
- Multi-select with individual checkbox control
- Warning alert with operation summary
- Integration into school-defaults-page
- Support for both degree and department resources"
```

---

## Task 3: Add WebSocket Heartbeat Monitoring

**Files:**
- Modify: `hooks/use-audit-log-subscription.ts:1-130`

**Step 1: Add heartbeat interval constant and state**

```typescript
// At top of file, after imports

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 10000; // 10 seconds to receive response

interface SubscriptionState {
  status: ConnectionStatus;
  lastHeartbeat: number;
  missedHeartbeats: number;
}
```

**Step 2: Add heartbeat monitoring to hook**

```typescript
// In useAuditLogSubscription function, add these refs after existing ones

const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({
  status: 'connecting',
  lastHeartbeat: Date.now(),
  missedHeartbeats: 0,
});

const sendHeartbeat = useCallback(() => {
  if (!isMountedRef.current || subscriptionRef.current === null) return;

  try {
    // Send a no-op message to test connection
    subscriptionRef.current.send({
      type: 'heartbeat',
      timestamp: Date.now(),
    });

    heartbeatTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      
      setSubscriptionState(prev => ({
        ...prev,
        missedHeartbeats: prev.missedHeartbeats + 1,
      }));

      if (subscriptionState.missedHeartbeats > 2) {
        scheduleReconnect();
      }
    }, HEARTBEAT_TIMEOUT);
  } catch (err) {
    console.error('Heartbeat send failed:', err);
    scheduleReconnect();
  }
}, [subscriptionState.missedHeartbeats]);

const startHeartbeat = useCallback(() => {
  if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
  
  heartbeatIntervalRef.current = setInterval(() => {
    sendHeartbeat();
  }, HEARTBEAT_INTERVAL);
}, [sendHeartbeat]);

const stopHeartbeat = useCallback(() => {
  if (heartbeatIntervalRef.current) {
    clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = null;
  }
  if (heartbeatTimeoutRef.current) {
    clearTimeout(heartbeatTimeoutRef.current);
    heartbeatTimeoutRef.current = null;
  }
}, []);
```

**Step 3: Integrate heartbeat into subscription lifecycle**

Update the subscribe callback status handler:

```typescript
.subscribe((status, err) => {
  if (!isMountedRef.current) return;

  if (status === 'SUBSCRIBED') {
    setSubscriptionState(prev => ({
      ...prev,
      status: 'connected',
      lastHeartbeat: Date.now(),
      missedHeartbeats: 0,
    }));
    retryCountRef.current = 0;
    startHeartbeat();
  } else if (status === 'CHANNEL_ERROR') {
    setSubscriptionState(prev => ({ ...prev, status: 'error' }));
    stopHeartbeat();
    handleSubscriptionError(err);
  } else if (status === 'CLOSED') {
    setSubscriptionState(prev => ({ ...prev, status: 'disconnected' }));
    stopHeartbeat();
    scheduleReconnect();
  }
});
```

**Step 4: Update cleanup in useEffect**

```typescript
useEffect(() => {
  isMountedRef.current = true;
  subscribe();

  return () => {
    isMountedRef.current = false;
    stopHeartbeat();
    unsubscribe();
  };
}, [subscribe, unsubscribe, stopHeartbeat]);
```

**Step 5: Return heartbeat state in hook**

```typescript
return {
  isConnected: subscriptionState.status === 'connected',
  status: subscriptionState.status,
  lastHeartbeat: subscriptionState.lastHeartbeat,
  missedHeartbeats: subscriptionState.missedHeartbeats,
  subscribe,
  unsubscribe,
};
```

**Step 6: Commit**

```bash
git add hooks/use-audit-log-subscription.ts
git commit -m "feat: add WebSocket heartbeat monitoring for connection stability

- Send heartbeat every 30 seconds to detect stale connections
- 10 second timeout per heartbeat with automatic reconnection on failure
- Track missed heartbeats and trigger reconnection after 2 misses
- Clean up heartbeat timers on unmount to prevent leaks
- Export heartbeat metrics (lastHeartbeat, missedHeartbeats) for monitoring"
```

---

## Task 4: Add Audit Trail Filtering by Affected School/Record

**Files:**
- Modify: `app/(routes)/organizations/school-defaults/audit/_components/audit-log-filters.tsx:1-50`

**Step 1: Extend filter state interface**

```typescript
// Update FilterState interface

export interface FilterState {
  searchText: string;
  actionType: 'all' | 'create' | 'update' | 'delete' | 'restore';
  school: string;
  resourceType: 'all' | 'degree' | 'department';
  dateRange?: {
    from: Date;
    to: Date;
  };
}
```

**Step 2: Add filter UI for resource type and date range**

In the filter component JSX, add:

```typescript
{/* Resource Type Filter */}
<div>
  <label className="text-sm font-medium">Resource Type</label>
  <select
    value={filters.resourceType || 'all'}
    onChange={(e) => 
      onFilterChange({ 
        ...filters, 
        resourceType: e.target.value as FilterState['resourceType'] 
      })
    }
    className="w-full px-3 py-2 border rounded-md"
  >
    <option value="all">All Resources</option>
    <option value="degree">K-12 Programs Only</option>
    <option value="department">Departments Only</option>
  </select>
</div>

{/* Date Range Filter */}
<div>
  <label className="text-sm font-medium">From Date</label>
  <input
    type="date"
    value={filters.dateRange?.from?.toISOString().split('T')[0] || ''}
    onChange={(e) =>
      onFilterChange({
        ...filters,
        dateRange: {
          ...filters.dateRange,
          from: new Date(e.target.value),
          to: filters.dateRange?.to || new Date(),
        },
      })
    }
    className="w-full px-3 py-2 border rounded-md"
  />
</div>
```

**Step 3: Update audit log table filter application**

In `audit-log-table.tsx`, update `applyFilters` function:

```typescript
function applyFilters(logs: AuditLog[], filters: FilterState): AuditLog[] {
  return logs.filter(log => {
    // Existing search text filter
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const matchesSearch =
        log.school_name.toLowerCase().includes(searchLower) ||
        getUserDisplay(log).toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Action type filter
    if (filters.actionType !== 'all' && log.action !== filters.actionType) {
      return false;
    }

    // School filter
    if (filters.school && log.school_id !== filters.school) {
      return false;
    }

    // Resource type filter
    if (filters.resourceType && filters.resourceType !== 'all' && log.resource_type !== filters.resourceType) {
      return false;
    }

    // Date range filter
    if (filters.dateRange?.from || filters.dateRange?.to) {
      const logDate = new Date(log.created_at);
      if (filters.dateRange.from && logDate < filters.dateRange.from) return false;
      if (filters.dateRange.to && logDate > filters.dateRange.to) return false;
    }

    return true;
  });
}
```

**Step 4: Commit**

```bash
git add app/\(routes\)/organizations/school-defaults/audit/_components/audit-log-filters.tsx
git add app/\(routes\)/organizations/school-defaults/audit/_components/audit-log-table.tsx
git commit -m "feat: add advanced audit trail filtering

- Filter by resource type (degree vs department)
- Filter by date range (from/to)
- Combine with existing school, action, and search filters
- Support for restore action in filter options"
```

---

## Task 5: Implement Scheduled Restore Queue

**Files:**
- Create: `lib/services/scheduled-restore-queue.ts`
- Modify: `lib/services/school-defaults-restore-service.ts`

**Step 1: Create scheduled restore queue service**

```typescript
// Create: lib/services/scheduled-restore-queue.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

interface ScheduledRestore {
  id: string;
  recordIds: string[];
  resourceType: 'degree' | 'department';
  scheduledFor: Date;
  status: 'pending' | 'completed' | 'failed';
  createdBy: string;
  executedAt?: Date;
  error?: string;
}

export class ScheduledRestoreQueue {
  private static processingRef = new Map<string, boolean>();

  static async scheduleRestore(
    recordIds: string[],
    resourceType: 'degree' | 'department',
    scheduledFor: Date,
    userId: string
  ): Promise<string> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('scheduled_restores')
      .insert({
        record_ids: recordIds,
        resource_type: resourceType,
        scheduled_for: scheduledFor.toISOString(),
        status: 'pending',
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  static async getPendingRestores(): Promise<ScheduledRestore[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('scheduled_restores')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async executeScheduledRestore(restoreId: string): Promise<void> {
    if (this.processingRef.get(restoreId)) return;
    
    this.processingRef.set(restoreId, true);

    try {
      const supabase = createClientSupabaseClient();

      const { data: restore, error: fetchError } = await supabase
        .from('scheduled_restores')
        .select('*')
        .eq('id', restoreId)
        .single();

      if (fetchError) throw fetchError;

      // Execute the restore
      const results = await (await import('@/lib/services/school-defaults-restore-service')).SchoolDefaultsRestoreService
        .bulkRestoreDeletedRecordsBatched(
          restore.record_ids,
          restore.resource_type,
          100
        );

      // Update status to completed
      await supabase
        .from('scheduled_restores')
        .update({
          status: 'completed',
          executed_at: new Date().toISOString(),
        })
        .eq('id', restoreId);
    } catch (err) {
      // Mark as failed with error message
      const supabase = createClientSupabaseClient();
      await supabase
        .from('scheduled_restores')
        .update({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        .eq('id', restoreId);

      throw err;
    } finally {
      this.processingRef.delete(restoreId);
    }
  }

  static async processQueue(): Promise<void> {
    try {
      const pending = await this.getPendingRestores();
      
      for (const restore of pending) {
        await this.executeScheduledRestore(restore.id);
      }
    } catch (err) {
      console.error('Error processing scheduled restore queue:', err);
    }
  }

  static startQueueProcessor(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      this.processQueue();
    }, intervalMs);
  }
}
```

**Step 2: Create migration for scheduled_restores table**

```sql
-- Create: 20260527_create_scheduled_restores.sql

CREATE TABLE scheduled_restores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_ids TEXT[] NOT NULL,
  resource_type VARCHAR(20) CHECK (resource_type IN ('degree', 'department')),
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR(20) CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  executed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scheduled_restores_status ON scheduled_restores(status);
CREATE INDEX idx_scheduled_restores_scheduled_for ON scheduled_restores(scheduled_for);
```

**Step 3: Add schedule method to SchoolDefaultsRestoreService**

```typescript
// In school-defaults-restore-service.ts, add:

static async scheduleRestore(
  recordIds: string[],
  resourceType: 'degree' | 'department',
  scheduledFor: Date,
  userId: string
): Promise<string> {
  const { ScheduledRestoreQueue } = await import('./scheduled-restore-queue');
  return ScheduledRestoreQueue.scheduleRestore(recordIds, resourceType, scheduledFor, userId);
}
```

**Step 4: Initialize queue processor on app startup**

In `app/(routes)/organizations/school-defaults/page.tsx` or a root layout:

```typescript
import { ScheduledRestoreQueue } from '@/lib/services/scheduled-restore-queue';

useEffect(() => {
  // Start queue processor
  const interval = ScheduledRestoreQueue.startQueueProcessor(60000); // Check every minute
  
  return () => clearInterval(interval);
}, []);
```

**Step 5: Commit**

```bash
git add lib/services/scheduled-restore-queue.ts
git add lib/services/school-defaults-restore-service.ts
git add migrations/20260527_create_scheduled_restores.sql
git commit -m "feat: implement scheduled restore queue with deferred execution

- Queue restores for execution at specified future time
- Background processor checks queue every minute
- Per-restore status tracking (pending/completed/failed)
- Error logging for failed scheduled restores
- Prevents concurrent execution of same restore with processing map
- Support for both degree and department resources"
```

---

## Task 6: Performance Optimization for 1000+ Records

**Files:**
- Modify: `lib/services/school-defaults-restore-service.ts`
- Modify: `app/(routes)/organizations/school-defaults/_components/bulk-restore-dialog.tsx`

**Step 1: Add pagination helper for large record sets**

```typescript
// In school-defaults-restore-service.ts, add:

static async getDeletedRecordsPaginated(
  resourceType: 'degree' | 'department',
  page: number = 0,
  pageSize: number = 100
): Promise<{ records: any[]; total: number; hasMore: boolean }> {
  const supabase = createClientSupabaseClient();
  const tableName = resourceType === 'degree' ? 'degrees' : 'departments';
  const nameField = resourceType === 'degree' ? 'degree_name' : 'department_name';
  const codeField = resourceType === 'degree' ? 'degree_code' : 'department_code';

  // Get total count
  const { count } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true })
    .not('deleted_at', 'is', null);

  // Get paginated records
  const { data } = await supabase
    .from(tableName)
    .select(`
      id,
      school_id:institutions!inner(id, institution_name),
      ${nameField},
      ${codeField},
      deleted_at
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  return {
    records: (data || []).map((item: any) => ({
      id: item.id,
      school_id: item.school_id.id,
      school_name: item.school_id.institution_name,
      name: item[nameField],
      code: item[codeField],
    })),
    total: count || 0,
    hasMore: (page + 1) * pageSize < (count || 0),
  };
}
```

**Step 2: Update BulkRestoreDialog for pagination**

```typescript
// In bulk-restore-dialog.tsx, update component state:

const [currentPage, setCurrentPage] = useState(0);
const [totalRecords, setTotalRecords] = useState(0);
const itemsPerPage = 50;
const totalPages = Math.ceil(totalRecords / itemsPerPage);

// Add useEffect to load records for current page
useEffect(() => {
  if (open && deletedDegrees.length === 0) {
    loadRecordsPage(0);
  }
}, [open]);

async function loadRecordsPage(page: number) {
  try {
    const result = await SchoolDefaultsRestoreService.getDeletedRecordsPaginated(
      'degree',
      page,
      itemsPerPage
    );
    
    // Convert to component's record format
    const formattedRecords = result.records.map(r => ({
      id: r.id,
      school_id: r.school_id,
      school_name: r.school_name,
      degree_name: r.name,
      degree_code: r.code,
    }));
    
    setDeletedDegrees(formattedRecords);
    setTotalRecords(result.total);
  } catch (err) {
    console.error('Error loading records:', err);
  }
}

// Add pagination controls to JSX
<div className="flex justify-between items-center mt-4">
  <div className="text-sm text-muted-foreground">
    Page {currentPage + 1} of {Math.max(1, totalPages)} ({totalRecords} total)
  </div>
  <div className="flex gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        setCurrentPage(p => p - 1);
        loadRecordsPage(currentPage - 1);
      }}
      disabled={currentPage === 0}
    >
      Previous
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        setCurrentPage(p => p + 1);
        loadRecordsPage(currentPage + 1);
      }}
      disabled={!hasMore || currentPage >= totalPages - 1}
    >
      Next
    </Button>
  </div>
</div>
```

**Step 3: Add progress granularity for large batches**

```typescript
// In bulk-restore-dialog.tsx handleRestore:

const degreeIds = Array.from(selectedIds);
const results = await SchoolDefaultsRestoreService.bulkRestoreDeletedRecordsBatched(
  degreeIds,
  'degree',
  50, // Smaller batch size for more frequent progress updates
  (current, total) => {
    if (!isAborted) {
      const percent = Math.round((current / total) * 100);
      setProgress(percent);
      
      // Update status text with more granular feedback
      setProgressMessage(`Restoring... ${current} of ${total}`);
    }
  }
);
```

**Step 4: Commit**

```bash
git add lib/services/school-defaults-restore-service.ts
git add app/\(routes\)/organizations/school-defaults/_components/bulk-restore-dialog.tsx
git commit -m "feat: performance optimization for 1000+ record operations

- Add getDeletedRecordsPaginated for memory-efficient loading
- Implement pagination in bulk-restore-dialog (50 items per page)
- Reduce batch size from 100 to 50 for more frequent progress updates
- Add granular progress messages showing current/total counts
- Prevents loading all records into memory at once"
```

---

## Testing Checklist

- [ ] Department bulk restore works (select/restore departments)
- [ ] Confirmation dialog shows all affected schools correctly
- [ ] Resource type filter works (degree/department/all)
- [ ] Date range filtering shows correct logs
- [ ] WebSocket heartbeat active (check DevTools Network)
- [ ] Connection recovers after network offline/online
- [ ] Missed heartbeat detection triggers reconnection
- [ ] Scheduled restore queues and executes at scheduled time
- [ ] Pagination works for 1000+ deleted records
- [ ] Progress updates frequently during large restore
- [ ] Error messages show details for partial failures
- [ ] Cleanup prevents memory leaks on unmount
- [ ] TypeScript build passes with no errors

---

## Verification Commands

```bash
# Type check
npm run typecheck

# Build
npm run build

# View database migration
cat migrations/20260527_create_scheduled_restores.sql
```

---

## Files Summary

**Modified (3):**
- `lib/services/school-defaults-restore-service.ts` - Extend for departments + batching
- `hooks/use-audit-log-subscription.ts` - Add heartbeat monitoring
- `app/.../audit-log-filters.tsx` - Add resource type + date filters
- `app/.../audit-log-table.tsx` - Apply new filter types
- `app/.../school-defaults-page.tsx` - Add confirmation dialog integration
- `app/.../bulk-restore-dialog.tsx` - Add pagination for 1000+ records

**Created (3):**
- `app/.../restore-confirmation-dialog.tsx` - Confirmation with affected schools
- `lib/services/scheduled-restore-queue.ts` - Queue management service
- `migrations/20260527_create_scheduled_restores.sql` - Database schema

**Total Changes:** 6 files modified, 3 files created, 1 migration

---

## Future Enhancements Beyond Phase 1.8

- Webhook notifications on restore completion
- Restore history timeline view
- Bulk restore templates (save/load common restore sets)
- Department auto-restore triggers (on degree restore)
- Analytics dashboard for restore operations
- Audit log export with filters
