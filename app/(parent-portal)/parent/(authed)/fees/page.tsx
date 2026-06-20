'use client';

/** Fees — total due, selectable bills → HDFC/Razorpay, receipts list. */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { useParentFees } from '@/hooks/parent/use-parent-fees';
import { ParentFeeService } from '@/lib/services/parent/parent-academic-service';

export default function ParentFeesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <FeesContent />
    </Suspense>
  );
}

function FeesContent() {
  const search = useSearchParams();
  const { activeLearnerId } = useParentSession();
  const { data, isLoading, isError } = useParentFees();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);

  // Payment return feedback (set as the cancel/return URL on initiation).
  useEffect(() => {
    const p = search.get('payment');
    if (p === 'success') toast.success('Payment received. Your receipt will appear shortly.');
    else if (p === 'cancelled') toast.info('Payment was cancelled.');
  }, [search]);

  // Default-select all outstanding bills once loaded.
  useEffect(() => {
    if (data?.bills) setSelected(new Set(data.bills.map((b) => b.id)));
  }, [data?.bills]);

  const selectedTotal = useMemo(
    () =>
      (data?.bills ?? [])
        .filter((b) => selected.has(b.id))
        .reduce((sum, b) => sum + b.balanceAmount, 0),
    [data?.bills, selected]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pay = async () => {
    if (!activeLearnerId || selected.size === 0) return;
    setPaying(true);
    try {
      const res = await ParentFeeService.pay({
        learnerId: activeLearnerId,
        billIds: [...selected],
      });
      window.location.href = res.paymentUrl; // hand off to the gateway
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start payment');
      setPaying(false);
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (isError || !data)
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Couldn’t load fees. Please try again.
      </Card>
    );

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-xl font-bold">Fee Payments</h1>

      <Card className="bg-gradient-to-br from-[#0b6d41] to-[#0a5733] p-5 text-white">
        <p className="text-xs text-white/80">Total Due</p>
        <p className="text-3xl font-bold">{formatCurrency(data.totalDue)}</p>
        <p className="mt-1 text-xs text-white/80">
          {data.learnerName} · {data.admissionNumber}
        </p>
      </Card>

      {data.bills.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No outstanding fees. 🎉
        </Card>
      ) : (
        <Card className="divide-y divide-black/5 p-2 dark:divide-white/10">
          {data.bills.map((b) => (
            <label key={b.id} className="flex items-center gap-3 p-3">
              <input
                type="checkbox"
                checked={selected.has(b.id)}
                onChange={() => toggle(b.id)}
                className="h-4 w-4 accent-[#0b6d41]"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.categoryName || b.description}</p>
                {b.dueDate && (
                  <p className="text-xs text-muted-foreground">Due {formatDate(b.dueDate)}</p>
                )}
              </div>
              <span className="text-sm font-semibold">{formatCurrency(b.balanceAmount)}</span>
            </label>
          ))}
        </Card>
      )}

      {data.receipts.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Receipts</h2>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {data.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.receiptNumber || 'Receipt'}</p>
                  {r.paidDate && (
                    <p className="text-xs text-muted-foreground">{formatDate(r.paidDate)}</p>
                  )}
                </div>
                <span className="font-semibold text-[#0b6d41]">{formatCurrency(r.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.bills.length > 0 && (
        <Button
          onClick={pay}
          disabled={paying || selected.size === 0}
          className="w-full bg-gradient-to-r from-[#0b6d41] to-[#0a5733] py-6 text-base font-semibold"
        >
          {paying ? 'Starting payment…' : `Proceed to Pay ${formatCurrency(selectedTotal)}`}
        </Button>
      )}
    </div>
  );
}
