'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  BAND_STATUS_LABELS,
  FINDING_DESCRIPTIONS,
  FINDING_LABELS,
  type BandStatus,
  type BillAggregateStatus,
  type BillingAuditFinding
} from '@/types/campus-living-billing-audit';

// One colour per meaning, used on both pages so a red badge means the same
// thing in the KPI breakdown and in the table.
const FINDING_TONE: Record<BillingAuditFinding, string> = {
  no_room_bill: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  no_mess_bill: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  upgrade_unbilled: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  unpaid: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  overdue: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  amount_mismatch: 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300',
  no_band: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  category_drift: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
};

export function findingTone(f: BillingAuditFinding): string {
  return FINDING_TONE[f];
}

export function FindingBadge({ finding, className }: { finding: BillingAuditFinding; className?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant='outline' className={cn('whitespace-nowrap font-normal', FINDING_TONE[finding], className)}>
            {FINDING_LABELS[finding]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-xs text-xs'>
          {FINDING_DESCRIPTIONS[finding]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FindingBadges({ findings }: { findings: BillingAuditFinding[] }) {
  if (findings.length === 0) {
    return (
      <Badge variant='outline' className='border-emerald-300 bg-emerald-50 text-emerald-800 font-normal dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'>
        Clean
      </Badge>
    );
  }
  return (
    <div className='flex flex-wrap gap-1'>
      {findings.map((f) => (
        <FindingBadge key={f} finding={f} />
      ))}
    </div>
  );
}

const BAND_TONE: Record<BandStatus, string> = {
  within: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  above: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  below: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  no_band: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  no_category: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300'
};

export function BandStatusBadge({ status }: { status: BandStatus }) {
  return (
    <Badge variant='outline' className={cn('whitespace-nowrap font-normal', BAND_TONE[status])}>
      {BAND_STATUS_LABELS[status]}
    </Badge>
  );
}

const BILL_STATUS_TONE: Record<string, string> = {
  paid: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  partially_paid: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  unpaid: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
};

const BILL_STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  partially_paid: 'Partly paid',
  unpaid: 'Unpaid'
};

/** null status = no bill of that class — rendered as a muted "No bill". */
export function BillStatusBadge({ status }: { status: BillAggregateStatus | string | null }) {
  if (!status) {
    return <span className='text-xs text-muted-foreground'>No bill</span>;
  }
  return (
    <Badge variant='outline' className={cn('whitespace-nowrap font-normal', BILL_STATUS_TONE[status] ?? '')}>
      {BILL_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
