'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatINRCompact, num } from './_utils';
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

export function UserActivityLeaderboard({
  data,
  loading,
}: {
  data?: BillingUserActivityRow[];
  loading: boolean;
}) {
  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Accounts Team Activity</CardTitle>
        <p className='text-muted-foreground text-xs'>
          Actions logged and payments collected per user in the selected range.
        </p>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className='h-64 w-full' />
        ) : rows.length === 0 ? (
          <p className='text-muted-foreground py-12 text-center text-sm'>
            No accounts activity in the selected range.
          </p>
        ) : (
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
                      <div className='font-medium'>{r.full_name}</div>
                      <Badge variant='outline' className='mt-0.5 font-normal'>
                        {prettyRole(r.role)}
                      </Badge>
                    </td>
                    <td className='px-2 py-2 text-right'>
                      {num(r.actions_count).toLocaleString('en-IN')}
                    </td>
                    <td className='px-2 py-2 text-right'>
                      {num(r.receipts_count).toLocaleString('en-IN')}
                    </td>
                    <td
                      className='px-2 py-2 text-right font-semibold text-green-700'
                      title={formatCurrency(num(r.amount_collected))}
                    >
                      {formatINRCompact(r.amount_collected)}
                    </td>
                    <td className='text-muted-foreground px-2 py-2 text-right text-xs'>
                      {lastActive(r.last_active)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
