'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IndianRupee,
  CircleCheckBig,
  CircleAlert,
  Clock,
  Ban,
  RotateCcw,
  Receipt,
} from 'lucide-react';
import { formatDateTimeDMY } from '@/lib/utils/date-format';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import type { StudentBill, BillStatus } from '@/types/billing-schedule';

interface BillingTabProps {
  learnerId: string;
}

const STATUS_CONFIG: Record<
  BillStatus,
  { label: string; className: string; icon: typeof CircleCheckBig }
> = {
  paid: {
    label: 'Paid',
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: CircleCheckBig,
  },
  unpaid: {
    label: 'Unpaid',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: Clock,
  },
  partially_paid: {
    label: 'Partially Paid',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: IndianRupee,
  },
  overdue: {
    label: 'Overdue',
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: CircleAlert,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: Ban,
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: RotateCcw,
  },
};

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function BillingTab({ learnerId }: BillingTabProps) {
  const [bills, setBills] = useState<StudentBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    StudentBillService.getStudentBillsByStudent(learnerId)
      .then((data) => {
        if (!cancelled) setBills(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load bills');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [learnerId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (bills.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Receipt className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No bills generated yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Bills are created when the learner moves to Account status.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalAmount = bills.reduce((s, b) => s + Number(b.final_amount), 0);
  const totalPaid = bills.reduce((s, b) => s + (Number(b.final_amount) - Number(b.balance_amount)), 0);
  const totalBalance = bills.reduce((s, b) => s + Number(b.balance_amount), 0);
  const paidCount = bills.filter((b) => b.status === 'paid').length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Billed" value={formatCurrency(totalAmount)} accent="slate" />
        <SummaryCard label="Paid" value={formatCurrency(totalPaid)} accent="green" />
        <SummaryCard label="Outstanding" value={formatCurrency(totalBalance)} accent={totalBalance > 0 ? 'orange' : 'green'} />
        <SummaryCard
          label="Bills"
          value={`${paidCount}/${bills.length} paid`}
          accent={paidCount === bills.length ? 'green' : 'slate'}
        />
      </div>

      {/* Bills list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Bill Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {bills.map((bill) => {
              const config = STATUS_CONFIG[bill.status] ?? STATUS_CONFIG.unpaid;
              const StatusIcon = config.icon;
              const paid = Number(bill.final_amount) - Number(bill.balance_amount);

              return (
                <div key={bill.id} className="flex items-start gap-3 px-4 py-3 sm:items-center">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.className}`}
                  >
                    <StatusIcon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {bill.bill_description ||
                          (bill as any).item_category?.category_name ||
                          'Fee Item'}
                      </p>
                      <Badge variant="outline" className={`text-[10px] ${config.className}`}>
                        {config.label}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {bill.due_date && (
                        <span>Due: {formatDateTimeDMY(bill.due_date)}</span>
                      )}
                      {bill.payment_date && (
                        <span>Paid on: {formatDateTimeDMY(bill.payment_date)}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums">
                      {formatCurrency(Number(bill.final_amount))}
                    </p>
                    {bill.status === 'partially_paid' && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        Paid: {formatCurrency(paid)} · Bal: {formatCurrency(Number(bill.balance_amount))}
                      </p>
                    )}
                    {bill.status === 'unpaid' && Number(bill.balance_amount) > 0 && (
                      <p className="text-[11px] text-orange-600 tabular-nums">
                        Balance: {formatCurrency(Number(bill.balance_amount))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'green' | 'orange' | 'slate';
}) {
  const tint = {
    green: 'from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30',
    orange: 'from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30',
    slate: 'from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50',
  }[accent];

  return (
    <div className={`rounded-lg border bg-gradient-to-br ${tint} px-3 py-2.5`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}
