'use client';

import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  formatCurrency,
  formatINRCompact,
  num,
  drilldown,
  type DrilldownScope,
} from './_utils';
import type { BillingUserActivityRow } from '@/types/billing-analytics';

function prettyRole(role: string): string {
  if (!role) return '—';
  return role
    .split('_')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

function lastActive(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

const LINK = 'rounded px-1 underline-offset-2 hover:underline';

export function UserActivityLeaderboard({
  data,
  loading,
  scope,
}: {
  data?: BillingUserActivityRow[];
  loading: boolean;
  /** Active institution + date window, carried into every drill-down link. */
  scope: DrilldownScope;
}) {
  const rows = data ?? [];

  if (loading && !data) {
    return <Skeleton className='h-64 w-full' />;
  }

  if (rows.length === 0) {
    return (
      <p className='text-muted-foreground py-12 text-center text-sm'>
        No accounts activity in the selected range.
      </p>
    );
  }

  // Neither the activities page nor the receipts list can filter by the user
  // who acted, so these links open the scoped list rather than one person's.
  const activitiesHref = drilldown.activities();
  const receiptsHref = drilldown.receipts(scope);

  return (
    <div className='max-h-[420px] overflow-auto'>
      <table className='w-full text-sm'>
        <thead className='bg-background sticky top-0'>
          <tr className='text-muted-foreground border-b text-left text-xs'>
            <th className='py-2 pr-2 font-medium'>User</th>
            <th className='px-2 py-2 text-right font-medium'>Actions</th>
            <th className='px-2 py-2 text-right font-medium'>Receipts</th>
            <th className='px-2 py-2 text-right font-medium'>Collected</th>
            <th className='px-2 py-2 text-right font-medium'>Last Active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className='hover:bg-muted/40 border-b'>
              <td className='py-2 pr-2'>
                <Link
                  href={activitiesHref}
                  className='block hover:underline'
                  aria-label={`View billing activity (${r.full_name})`}
                >
                  <div className='font-medium'>{r.full_name}</div>
                  <Badge variant='outline' className='mt-0.5 font-normal'>
                    {prettyRole(r.role)}
                  </Badge>
                </Link>
              </td>
              <td className='px-2 py-2 text-right'>
                <Link href={activitiesHref} className={LINK}>
                  {num(r.actions_count).toLocaleString('en-IN')}
                </Link>
              </td>
              <td className='px-2 py-2 text-right'>
                <Link href={receiptsHref} className={LINK}>
                  {num(r.receipts_count).toLocaleString('en-IN')}
                </Link>
              </td>
              <td
                className='px-2 py-2 text-right font-semibold text-green-700'
                title={formatCurrency(num(r.amount_collected))}
              >
                <Link href={receiptsHref} className={LINK}>
                  {formatINRCompact(r.amount_collected)}
                </Link>
              </td>
              <td className='text-muted-foreground px-2 py-2 text-right text-xs'>
                <Link href={activitiesHref} className={LINK}>
                  {lastActive(r.last_active)}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
