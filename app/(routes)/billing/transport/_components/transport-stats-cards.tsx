'use client';

import { useMemo } from 'react';
import { Users, IndianRupee, Wallet, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TransportCollectable } from '@/hooks/billing/use-transport-collectables';

function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Advanced, filter-aware stats for the Transport Fees page. Computed from the rows
 * currently in view, so it recomputes whenever the institution / academic-year / search
 * filters change.
 */
export function TransportStatsCards({ rows }: { rows: TransportCollectable[] }) {
  const s = useMemo(() => {
    let billed = 0;
    let outstanding = 0;
    let bills = 0;
    let paid = 0;
    let partial = 0;
    let unpaid = 0;
    for (const r of rows) {
      const b = Number(r.total_billed) || 0;
      const o = Number(r.outstanding_amount) || 0;
      billed += b;
      outstanding += o;
      bills += r.bill_count || 0;
      if (b <= 0) continue;
      if (o <= 0) paid += 1;
      else if (o < b) partial += 1;
      else unpaid += 1;
    }
    const collected = Math.max(0, billed - outstanding);
    const rate = billed > 0 ? Math.round((collected / billed) * 100) : 0;
    return { people: rows.length, bills, billed, collected, outstanding, rate, paid, partial, unpaid };
  }, [rows]);

  /**
   * This card counted every row and called them all "Learners" — so with 1,266
   * learners and 35 Senior Learners in view it read "Learners 1301", which is
   * simply a wrong number for the word beside it. The head count now names
   * whichever populations are actually on screen, and follows the Type filter:
   * narrow to Senior Learners and it says Senior Learners.
   */
  const headLabel = useMemo(() => {
    let hasLearner = false;
    let hasSenior = false;
    for (const r of rows) {
      if (r.person_type === 'staff') hasSenior = true;
      else hasLearner = true;
      if (hasLearner && hasSenior) break;
    }
    if (hasLearner && hasSenior) return 'Learners + Senior Learners';
    if (hasSenior) return 'Senior Learners';
    return 'Learners';
  }, [rows]);

  const cards = [
    { label: headLabel, value: String(s.people), sub: `${s.bills} bill${s.bills === 1 ? '' : 's'}`, icon: Users, tint: 'text-blue-600' },
    { label: 'Total Billed', value: inr(s.billed), sub: 'transport fees', icon: IndianRupee, tint: 'text-indigo-600' },
    { label: 'Collected', value: inr(s.collected), sub: `${s.rate}% collected`, icon: Wallet, tint: 'text-green-600' },
    { label: 'Outstanding', value: inr(s.outstanding), sub: 'pending dues', icon: AlertCircle, tint: 'text-orange-600' },
  ];

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className='p-4'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground text-sm'>{c.label}</span>
                <c.icon className={`h-4 w-4 ${c.tint}`} />
              </div>
              <div className={`mt-1 text-xl font-bold sm:text-2xl ${c.tint}`}>{c.value}</div>
              <div className='text-muted-foreground text-xs'>{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Collection rate bar + status distribution */}
      <Card>
        <CardContent className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='min-w-0 flex-1'>
            <div className='mb-1 flex items-center justify-between text-xs'>
              <span className='text-muted-foreground'>Collection rate</span>
              <span className='font-medium'>{s.rate}%</span>
            </div>
            <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
              <div className='h-full rounded-full bg-green-500' style={{ width: `${Math.min(100, s.rate)}%` }} />
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='outline' className='bg-green-100 text-green-800 border-green-200'>Paid {s.paid}</Badge>
            <Badge variant='outline' className='bg-yellow-100 text-yellow-800 border-yellow-200'>Partial {s.partial}</Badge>
            <Badge variant='outline' className='bg-orange-100 text-orange-800 border-orange-200'>Unpaid {s.unpaid}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
