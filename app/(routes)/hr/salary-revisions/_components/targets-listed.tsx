'use client';

/**
 * Held parts of raises waiting on the Director (rulings of 7 Oct 2026,
 * fn_hr_salary_revision_targets_listed). One read-only section on the
 * approval page, shown only to the Director list (the database refuses
 * everyone else): parked, lapsed, back with him after the window, skipped by
 * the monthly check, a start date that wrote nothing, and months a principal
 * flagged. Each row links to its request. A flagged month that is over can be
 * counted as met or missed here; the database checks who may.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  TARGET_KEYS,
  TARGET_LABELS,
  listedReasonInWords,
  monthName,
  resultText,
  type ListedTargetRow,
  type TargetResult,
} from '@/lib/hr/salary-revision';
import { rupees } from './revision-bits';

function flaggedResults(row: ListedTargetRow): TargetResult[] {
  return Array.isArray(row.results) ? (row.results as TargetResult[]).filter((r) => r && typeof r === 'object' && 'target' in r) : [];
}

/** "3 months counted: 1 met, 2 missed" from a plan row's months. */
function monthsSummary(row: ListedTargetRow): string | null {
  if (!Array.isArray(row.results) || row.results.length === 0) return null;
  const months = row.results as Array<{ status?: string }>;
  if (!months.every((m) => m && typeof m === 'object' && 'status' in m)) return null;
  const met = months.filter((m) => m.status === 'met' || m.status === 'decided_met').length;
  const missed = months.filter((m) => m.status === 'missed' || m.status === 'decided_missed').length;
  return `${months.length} month${months.length === 1 ? '' : 's'} measured: ${met} met, ${missed} missed`;
}

export function TargetsListedSection({ rows, today, busy, onDecide }: {
  rows: ListedTargetRow[];
  /** Today in India, yyyy-MM-dd. */
  today: string;
  busy?: boolean;
  onDecide?: (id: string, month: string, met: boolean) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className='mt-8' data-testid='targets-listed'>
      <h2 className='mb-2 text-base font-semibold'>Held parts of raises waiting on you ({rows.length})</h2>
      <p className='mb-3 text-sm text-muted-foreground'>
        The increment of each raise was paid on its start date; these held parts were not paid by the
        monthly check. Open a raise to see its months.
      </p>
      <ul className='divide-y divide-border rounded-md border border-border text-sm'>
        {rows.map((r) => {
          const results = r.month ? flaggedResults(r) : [];
          const summary = r.month ? null : monthsSummary(r);
          const canDecide = Boolean(onDecide && r.month && r.month.slice(0, 7) < today.slice(0, 7));
          return (
            <li key={`${r.request_id}-${r.month ?? 'plan'}-${r.why}`} className='space-y-1 px-3 py-2' data-testid='listed-row'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span>
                  <Link href={`/hr/salary-revisions/${r.request_id}`} className='font-medium hover:underline'>{r.person_name}</Link>
                  <span className='text-muted-foreground'>
                    {' '}· {listedReasonInWords(r.why)}{r.month ? ` (${monthName(r.month)})` : ''}
                  </span>
                </span>
                <span className='text-xs text-muted-foreground tabular-nums'>
                  Increment {rupees(r.increment_amount)} · held {rupees(r.held_amount)} a month
                </span>
              </div>
              {summary && <p className='text-xs text-muted-foreground'>{summary}</p>}
              {results.length > 0 && (
                <p className='text-xs text-muted-foreground'>
                  {TARGET_KEYS.map((k) => {
                    const x = results.find((y) => y.target === k);
                    return x ? `${TARGET_LABELS[k]}: ${resultText(x)} ${x.met ? 'met' : 'not met'}` : null;
                  }).filter(Boolean).join(' · ')}
                </p>
              )}
              {canDecide && r.month && (
                <span className='flex flex-wrap gap-1'>
                  <Button size='sm' disabled={busy} onClick={() => onDecide?.(r.request_id, r.month as string, true)}>Count as met</Button>
                  <Button size='sm' variant='outline' disabled={busy} onClick={() => onDecide?.(r.request_id, r.month as string, false)}>
                    Count as missed
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
