'use client';

import { Badge } from '@/components/ui/badge';
import type { CdcDriveStatus } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

export const STATUS_BADGE_VARIANT: Record<CdcDriveStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  announced: 'secondary',
  willingness_open: 'default',
  eligibility_locked: 'default',
  attendance_day: 'default',
  results_announced: 'default',
  closed: 'secondary',
  cancelled: 'destructive',
};

/** Per-status colour so a drive's stage reads at a glance (light + dark). */
export const STATUS_BADGE_CLASS: Record<CdcDriveStatus, string> = {
  draft: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  announced: 'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  willingness_open: 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  eligibility_locked: 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  attendance_day: 'border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
  results_announced: 'border-indigo-200 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  closed: 'border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  cancelled: 'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
};

export function DriveStatusBadge({ status, className }: { status: CdcDriveStatus; className?: string }) {
  return (
    <Badge variant="outline" className={`${STATUS_BADGE_CLASS[status]} ${className ?? ''}`.trim()}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {CDC_DRIVE_STATUS_LABELS[status]}
    </Badge>
  );
}
