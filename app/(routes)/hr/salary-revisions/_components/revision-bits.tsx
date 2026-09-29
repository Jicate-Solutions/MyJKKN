'use client';

/**
 * Small pieces every salary revision screen shares: the status, the flags
 * (PAY CUT / asking for self / asking for a senior — rulings 7 and 9), the
 * Director's red band warning (ruling 6), the suggested figure shown beside the
 * asked one (ruling 13), and the page header and "no access" notice.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatRupees } from '@/lib/hr/salary-suggestion';
import {
  STATUS_LABELS,
  flagsFor,
  toAmount,
  type SalaryRevisionRow,
  type SalaryRevisionStatus,
} from '@/lib/hr/salary-revision';
import type { SuggestionNote } from '@/hooks/hr/use-salary-revisions';

export function rupees(value: number | string | null | undefined): string {
  const n = toAmount(value as number | string | null);
  return n === null ? '—' : formatRupees(n);
}

const STATUS_TONE: Record<SalaryRevisionStatus, string> = {
  waiting_principal: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  waiting_director: 'border-sky-500/50 text-sky-700 dark:text-sky-400',
  approved: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400',
  applied: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400',
  stopped: 'border-border text-muted-foreground',
  refused: 'border-border text-muted-foreground',
};

export function StatusBadge({ status }: { status: SalaryRevisionStatus }) {
  return (
    <Badge variant='outline' className={`font-normal ${STATUS_TONE[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function RevisionFlags({ row }: {
  row: Pick<SalaryRevisionRow, 'is_cut' | 'final_is_cut' | 'final_monthly_gross' | 'is_self' | 'is_for_senior'>;
}) {
  const flags = flagsFor(row);
  if (flags.length === 0) return null;
  return (
    <span className='inline-flex flex-wrap gap-1'>
      {flags.map((f) =>
        f.kind === 'cut' ? (
          <Badge key={f.kind} variant='destructive' className='font-semibold' data-flag='cut'>
            {f.label}
          </Badge>
        ) : (
          <Badge
            key={f.kind}
            variant='outline'
            className='border-violet-500/50 font-normal text-violet-700 dark:text-violet-300'
            data-flag={f.kind}
          >
            {f.label}
          </Badge>
        ),
      )}
    </span>
  );
}

/** RULING 6 — red, and only on the Director's screens (the server fills it only for him). */
export function BandWarning({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span
      className='inline-flex items-center gap-1 text-xs font-medium text-destructive'
      data-testid='band-warning'
    >
      <AlertTriangle className='h-3.5 w-3.5' />
      {text}
    </span>
  );
}

/** RULING 13 — the suggested figure beside the asked one, or "rule not set". */
export function SuggestionBeside({ suggestion }: { suggestion: SuggestionNote | undefined }) {
  if (!suggestion) return <span className='text-muted-foreground'>—</span>;
  if (suggestion.verdict === 'suggested' && suggestion.figure !== null) {
    return <span className='tabular-nums'>{formatRupees(suggestion.figure)}</span>;
  }
  if (suggestion.verdict === 'rule_not_set') {
    return <span className='text-muted-foreground'>Rule not set</span>;
  }
  return <span className='text-xs text-muted-foreground'>{suggestion.note ?? 'No suggestion'}</span>;
}

/** The page frame. The HR layout already draws the breadcrumb and the chips. */
export function RevisionPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ContentLayout title={title}>
      {children}
    </ContentLayout>
  );
}

/** Rule 27: a denied page says so and says who to ask — never a silent redirect. */
export function NoAccess({ title, what }: { title: string; what: string }) {
  return (
    <ContentLayout title={title}>
      <Alert variant='destructive' className='mt-6'>
        <ShieldAlert className='h-4 w-4' />
        <AlertDescription>
          You do not have access to {what}. Ask the HR head if you think you should.
        </AlertDescription>
      </Alert>
    </ContentLayout>
  );
}
