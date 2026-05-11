'use client';

// Created: 2026-05-06 — AI Pulse module v3 (Wave B.5 Anomaly Review console)
//
// Main client component. Two filters (flag_type, status) → fetch anomaly
// flags via React Query → render AnomalyRow per item → opens ReviewDialog
// when user clicks Review.
//
// Empty / error / loading states all rendered inline. Empty state for
// "pending + all types" tells the Champion they're caught up — important
// because this is a monthly cadence, not a daily one.

import { useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useAnomalyFlagsList,
  type AnomalyFlagRow,
  type AnomalyFlagType,
} from '@/lib/services/ai-pulse/anomaly-service';

import { AnomalyRow } from './anomaly-row';
import { ReviewDialog } from './review-dialog';

type StatusFilter = 'pending' | 'all';
type TypeFilter = AnomalyFlagType | 'all';

const FLAG_TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All flag types' },
  { value: 'intra_dept_scoring_outlier', label: 'Intra-dept scoring outlier' },
  { value: 'random_poll_response_pattern', label: 'Random poll-response pattern' },
  { value: 'ig_reach_inconsistent', label: 'IG reach inconsistent' },
  { value: 'rotation_gaming', label: 'Rotation gaming' },
  { value: 'excuse_frequency_outlier', label: 'Excuse-frequency outlier' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending only' },
  { value: 'all', label: 'All (including reviewed)' },
];

export function AnomalyList() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [activeFlag, setActiveFlag] = useState<AnomalyFlagRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useAnomalyFlagsList({
    flag_type: typeFilter,
    status: statusFilter,
  });

  const handleReview = (flag: AnomalyFlagRow) => {
    setActiveFlag(flag);
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      // Defer clearing so the dialog's exit animation has the data it needs.
      setTimeout(() => setActiveFlag(null), 150);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground'>
        <strong>Monthly anomaly review.</strong> Algorithmic flags from the AI
        Pulse cron jobs — confirm, dismiss, or mark inconclusive. Reviewed
        flags are timestamped and locked to your user ID for audit. Cadence:
        one pass per month per Champion (Krishnaveni) and Co-Champion (Ranjith).
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Label htmlFor='type-filter' className='text-xs'>
            Flag type
          </Label>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as TypeFilter)}
          >
            <SelectTrigger id='type-filter'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLAG_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1'>
          <Label htmlFor='status-filter' className='text-xs'>
            Status
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger id='status-filter'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className='space-y-3'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-24 w-full' />
          ))}
        </div>
      )}

      {error && (
        <div className='rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive'>
          Failed to load anomaly flags. Confirm you hold the{' '}
          <code className='font-mono'>aiPulse:anomaly.review</code> permission
          and reload.
        </div>
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <div className='rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground'>
          {statusFilter === 'pending'
            ? 'No pending flags — you are caught up for this cycle.'
            : 'No flags match the current filters.'}
        </div>
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className='space-y-3'>
          {data.map((flag) => (
            <AnomalyRow key={flag.id} flag={flag} onReview={handleReview} />
          ))}
        </div>
      )}

      <ReviewDialog
        flag={activeFlag}
        open={dialogOpen}
        onOpenChange={handleDialogChange}
      />
    </div>
  );
}
