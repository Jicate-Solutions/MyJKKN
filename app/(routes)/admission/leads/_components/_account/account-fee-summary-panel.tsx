'use client';
import { useEffect, useState } from 'react';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import type { ResolvedFeeItem } from '@/types/admission';

interface Props {
  learnerId: string;
}

export function AccountFeeSummaryPanel({ learnerId }: Props) {
  const [items, setItems] = useState<ResolvedFeeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    FeeResolutionService.resolveForLearner(learnerId)
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [learnerId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading fee summary…</p>;
  if (items.length === 0)
    return (
      <p className="text-sm text-amber-600">
        No fees resolved — transition will fail.
      </p>
    );

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th>Category</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.category_id ?? 'global'}-${i}`}>
              <td>{it.category_name}</td>
              <td className="text-right">₹{it.amount.toLocaleString()}</td>
            </tr>
          ))}
          <tr className="border-t font-bold">
            <td>Total</td>
            <td className="text-right">₹{total.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
