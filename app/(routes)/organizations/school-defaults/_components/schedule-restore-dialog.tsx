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
import { Input } from '@/components/ui/input';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';
import { SchoolDefaultsRestoreService } from '@/lib/services/school-defaults-restore-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface ScheduleRestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRecords: string[];
  resourceType?: 'degree' | 'department';
  onScheduled?: (result: { restoreId: string; scheduledFor: Date; recordIds: string[] }) => void;
}

export default function ScheduleRestoreDialog({
  open,
  onOpenChange,
  selectedRecords,
  resourceType = 'degree',
  onScheduled,
}: ScheduleRestoreDialogProps) {
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string>(() => {
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
    // Format as local datetime string for datetime-local input (YYYY-MM-DDTHH:mm)
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      oneHourFromNow.getFullYear() +
      '-' +
      pad(oneHourFromNow.getMonth() + 1) +
      '-' +
      pad(oneHourFromNow.getDate()) +
      'T' +
      pad(oneHourFromNow.getHours()) +
      ':' +
      pad(oneHourFromNow.getMinutes())
    );
  });

  async function handleSchedule() {
    if (!scheduledFor) {
      setError('Please select a date and time');
      return;
    }

    try {
      setScheduling(true);
      setError(null);

      const supabase = createClientSupabaseClient();
      const { data: user } = await supabase.auth.getUser();

      if (!user.user?.id) {
        throw new Error('User not authenticated');
      }

      const scheduledDate = new Date(scheduledFor);
      if (scheduledDate <= new Date()) {
        throw new Error('Scheduled time must be in the future');
      }

      const restoreId = await SchoolDefaultsRestoreService.scheduleRestore(
        selectedRecords,
        resourceType,
        scheduledDate,
        user.user.id
      );

      onScheduled?.({ restoreId, scheduledFor: scheduledDate, recordIds: selectedRecords });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule restore');
    } finally {
      setScheduling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Restore</DialogTitle>
          <DialogDescription>
            Schedule these {selectedRecords.length} records to be restored at a later time
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && <AlertBox type="error" message={error} />}

          <div>
            <label htmlFor="schedule-datetime" className="text-sm font-medium">Scheduled for</label>
            <Input
              id="schedule-datetime"
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              disabled={scheduling}
              className="mt-1"
              min={(() => {
                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                return (
                  now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
                  'T' + pad(now.getHours()) + ':' + pad(now.getMinutes())
                );
              })()}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be at least 1 minute in the future
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={scheduling}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={scheduling} className="gap-2">
            {scheduling && <Loader2 className="h-4 w-4 animate-spin" />}
            {scheduling ? 'Scheduling...' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
