'use client';

/**
 * Snooze (Suppression) Dialog — lets users suppress signals for N months.
 * Uses useCreateSuppression() hook.
 * Un-snooze available via separate button using useUnsnoozeSuppression().
 */

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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock } from 'lucide-react';
import {
  useCreateSuppression,
  useUnsnoozeSuppression,
} from '@/hooks/hr/recruitment-need/use-recruitment-signal';

interface SnoozeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  programId?: string | null;
  institutionName?: string;
}

const SNOOZE_MONTHS = [
  { value: '1', label: '1 month' },
  { value: '2', label: '2 months' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
];

export function SnoozeDialog({
  open,
  onOpenChange,
  institutionId,
  programId,
  institutionName,
}: SnoozeDialogProps) {
  const [months, setMonths] = useState('3');
  const [reason, setReason] = useState('');
  const createMutation = useCreateSuppression();

  function handleSnooze() {
    if (!reason.trim()) return;

    const suppressUntil = new Date();
    suppressUntil.setMonth(suppressUntil.getMonth() + parseInt(months, 10));

    createMutation.mutate(
      {
        institution_id: institutionId,
        program_id: programId ?? null,
        reason: reason.trim(),
        suppress_until: suppressUntil.toISOString(),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setReason('');
          setMonths('3');
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Snooze Signal
          </DialogTitle>
          <DialogDescription>
            Suppress recruitment signal{institutionName ? ` for ${institutionName}` : ''}.
            The signal will be de-emphasized until the snooze expires.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Duration</label>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SNOOZE_MONTHS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">
              Reason <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this signal being snoozed? (required)"
              className="mt-1.5"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSnooze}
            disabled={!reason.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Snoozing...' : 'Snooze'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Un-Snooze Button ───────────────────────────────────────────────────────────

interface UnsnoozeButtonProps {
  suppressionId: string;
  className?: string;
}

export function UnsnoozeButton({ suppressionId, className }: UnsnoozeButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const unsnoozeMutation = useUnsnoozeSuppression();

  function handleUnsnooze() {
    unsnoozeMutation.mutate(
      { id: suppressionId, reason: 'Manually un-snoozed' },
      { onSuccess: () => setConfirming(false) }
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="h-6 text-[11px] px-2"
          onClick={handleUnsnooze}
          disabled={unsnoozeMutation.isPending}
        >
          {unsnoozeMutation.isPending ? '...' : 'Confirm'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[11px] px-2"
          onClick={() => setConfirming(false)}
        >
          No
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={`h-6 text-[11px] px-2 ${className ?? ''}`}
      onClick={() => setConfirming(true)}
    >
      Un-snooze
    </Button>
  );
}
