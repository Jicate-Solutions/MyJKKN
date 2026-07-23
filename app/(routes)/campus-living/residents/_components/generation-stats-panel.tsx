'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useHostelYearBillStats } from '@/hooks/campus-living/use-hostel-bill-generation';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function StatCard({
  label, value, sub, tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'green' | 'amber' | 'default';
}) {
  const valueTone =
    tone === 'green'
      ? 'text-green-700 dark:text-green-400'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-foreground';
  return (
    <Card>
      <CardContent className='p-4'>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${valueTone}`}>{value}</p>
        {sub && <p className='mt-0.5 text-xs text-muted-foreground'>{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function GenerationStatsPanel({ hostelYearId }: { hostelYearId: string | null }) {
  const { data, isLoading } = useHostelYearBillStats(hostelYearId);

  if (!hostelYearId) return null;
  if (isLoading || !data) {
    return (
      <div className='flex items-center text-sm text-muted-foreground py-2'>
        <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading bill-generation stats…
      </div>
    );
  }

  const {
    total_hostellers, billed, not_billed, bill_count,
    total_amount, paid_amount, outstanding_amount, by_institution,
  } = data;

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <StatCard
          label='Hostellers'
          value={total_hostellers}
          sub={`${bill_count} academic-year bill${bill_count === 1 ? '' : 's'} on record`}
        />
        <StatCard
          label='Billed (created)'
          value={billed}
          tone='green'
          sub={`${pct(billed, total_hostellers)}% of hostellers`}
        />
        <StatCard
          label='Not billed'
          value={not_billed}
          tone='amber'
          sub={`${pct(not_billed, total_hostellers)}% remaining`}
        />
        <StatCard
          label='Billed amount'
          value={inr(total_amount)}
          sub={`${inr(paid_amount)} paid · ${inr(outstanding_amount)} due`}
        />
      </div>

      {by_institution.length > 1 && (
        <div className='rounded-md border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b bg-muted/50 text-left text-xs text-muted-foreground'>
                <th className='px-3 py-2 font-medium'>Institution</th>
                <th className='px-3 py-2 font-medium text-right'>Hostellers</th>
                <th className='px-3 py-2 font-medium text-right'>Billed</th>
                <th className='px-3 py-2 font-medium text-right'>Not billed</th>
              </tr>
            </thead>
            <tbody>
              {by_institution.map((row) => (
                <tr key={row.institution_id} className='border-b last:border-0'>
                  <td className='px-3 py-2'>{row.institution_name}</td>
                  <td className='px-3 py-2 text-right'>{row.total}</td>
                  <td className='px-3 py-2 text-right text-green-700 dark:text-green-400'>{row.billed}</td>
                  <td className='px-3 py-2 text-right text-amber-700 dark:text-amber-400'>{row.not_billed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
