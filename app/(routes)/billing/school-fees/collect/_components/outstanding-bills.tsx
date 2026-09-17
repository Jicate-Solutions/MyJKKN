'use client';

// outstanding-bills.tsx — select what is being paid, and how much of it.
//
// The "Pay Now" input is the only editable cell, and it never exceeds the
// bill's balance: the hook clamps on every keystroke and re-anchors the whole
// map whenever the bills refetch. The display clamps once more, covering the
// single frame between a refetch and that re-anchoring.

import { useMemo } from 'react';
import { Info, AlertTriangle, CheckSquare, Square } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { SchoolOutstandingBill } from '@/types/school-fees';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (n: number) => `₹${inr.format(Number(n) || 0)}`;

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Status badge. `overdue` is DERIVED here rather than trusted from the column:
 * a bill only becomes 'overdue' in the DB when something sweeps it, so a bill
 * past its due date can still read 'unpaid'. The counter must show the clerk
 * what is true today.
 */
type BillStatus = 'paid' | 'partial' | 'overdue' | 'pending';

function statusOf(bill: SchoolOutstandingBill): BillStatus {
  if (bill.balance_amount <= 0) return 'paid';
  if (bill.status === 'partially_paid') return 'partial';
  const due = bill.due_date ? new Date(bill.due_date) : null;
  const isOverdue =
    bill.status === 'overdue' ||
    (due != null && !isNaN(due.getTime()) && due < new Date(new Date().toDateString()));
  if (isOverdue) return 'overdue';
  return 'pending';
}

const STATUS_BADGE: Record<BillStatus, { label: string; className: string }> = {
  paid: {
    label: 'PAID',
    className: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  },
  partial: {
    label: 'PARTIAL',
    className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
  overdue: {
    label: 'OVERDUE',
    className: 'border-transparent bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  },
  pending: {
    label: 'PENDING',
    className: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
};

interface Props {
  bills: SchoolOutstandingBill[];
  loading: boolean;
  error: string | null;
  selected: Record<string, boolean>;
  amounts: Record<string, number>;
  onToggle: (bill: SchoolOutstandingBill, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onAmountChange: (bill: SchoolOutstandingBill, value: number) => void;
  disabled?: boolean;
}

export function OutstandingBills({
  bills,
  loading,
  error,
  selected,
  amounts,
  onToggle,
  onToggleAll,
  onAmountChange,
  disabled,
}: Props) {
  const payable = useMemo(() => bills.filter((b) => b.balance_amount > 0), [bills]);
  const allSelected = payable.length > 0 && payable.every((b) => selected[b.id]);

  const totals = useMemo(() => {
    let billed = 0;
    let paid = 0;
    let balance = 0;
    let overdue = 0;
    let payingNow = 0;
    let selectedCount = 0;
    for (const b of bills) {
      billed += Number(b.final_amount) || 0;
      paid += Number(b.paid_amount) || 0;
      balance += Number(b.balance_amount) || 0;
      if (statusOf(b) === 'overdue') overdue += Number(b.balance_amount) || 0;
      if (selected[b.id]) {
        selectedCount += 1;
        payingNow += Math.min(amounts[b.id] ?? 0, b.balance_amount);
      }
    }
    return { billed, paid, balance, overdue, payingNow, selectedCount };
  }, [bills, selected, amounts]);

  const overdueBills = useMemo(
    () => payable.filter((b) => statusOf(b) === 'overdue'),
    [payable],
  );

  // "Overdue only" is built from the per-bill toggle so the hook's amount
  // anchoring (full balance on select) applies exactly as a click would.
  const selectOverdueOnly = () => {
    onToggleAll(false);
    for (const b of overdueBills) onToggle(b, true);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load bills</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (bills.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No pending bills</AlertTitle>
        <AlertDescription>
          This learner has no outstanding school fee bills for the selected academic year.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary strip — the three numbers a clerk needs before touching a row. */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="Total outstanding" value={money(totals.balance)} tone="amber" />
        <Stat
          label="Overdue"
          value={money(totals.overdue)}
          tone={totals.overdue > 0 ? 'red' : 'neutral'}
          icon={totals.overdue > 0 ? AlertTriangle : undefined}
        />
        <Stat
          label={`Selected · ${totals.selectedCount} of ${payable.length}`}
          value={money(totals.payingNow)}
          tone="teal"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onToggleAll(true)}
          disabled={disabled || payable.length === 0 || allSelected}
        >
          <CheckSquare className="h-3.5 w-3.5 mr-1" />
          Select all
        </Button>
        {overdueBills.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            onClick={selectOverdueOnly}
            disabled={disabled}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Overdue only ({overdueBills.length})
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onToggleAll(false)}
          disabled={disabled || totals.selectedCount === 0}
        >
          <Square className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      </div>

    <div className="rounded-lg border overflow-x-auto">
      <Table>
        {/* Amber header = money still OWED. The payment-history table below
            uses emerald for money RECEIVED. Two dense tables sit on this page
            one above the other; colour is what stops a clerk reading a row
            from the wrong one. */}
        <TableHeader className="bg-amber-50 dark:bg-amber-950/30 [&_th]:text-amber-900 dark:[&_th]:text-amber-200 [&_th]:font-semibold">
          <TableRow className="hover:bg-amber-50 dark:hover:bg-amber-950/30">
            <TableHead className="w-[44px]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => onToggleAll(Boolean(v))}
                disabled={disabled || payable.length === 0}
                aria-label="Select all payable bills"
              />
            </TableHead>
            <TableHead className="min-w-[170px]">Fee Head</TableHead>
            <TableHead className="w-[90px]">Term</TableHead>
            <TableHead className="w-[120px]">Due Date</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead className="text-right w-[110px]">Bill</TableHead>
            <TableHead className="text-right w-[100px]">Paid</TableHead>
            <TableHead className="text-right w-[110px]">Balance</TableHead>
            <TableHead className="text-right w-[130px]">Pay Now</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => {
            const status = STATUS_BADGE[statusOf(bill)];
            const isPayable = bill.balance_amount > 0;
            const isSelected = Boolean(selected[bill.id]);
            return (
              <TableRow
                key={bill.id}
                className={cn(
                  isSelected && 'bg-teal-50/70 hover:bg-teal-50 dark:bg-teal-950/30 dark:hover:bg-teal-950/40',
                  !isPayable && 'opacity-60',
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(v) => onToggle(bill, Boolean(v))}
                    // A fully-settled bill has nothing to collect, so it is
                    // shown for context but cannot enter the payment.
                    disabled={disabled || !isPayable}
                    aria-label={`Select ${bill.category_name || 'bill'}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {bill.category_name || bill.bill_description || 'Fee'}
                </TableCell>
                <TableCell>{bill.term_number ? `Term ${bill.term_number}` : '—'}</TableCell>
                <TableCell>{formatDate(bill.due_date)}</TableCell>
                <TableCell>
                  <Badge className={status.className}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(bill.final_amount)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {money(bill.paid_amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {money(bill.balance_amount)}
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={bill.balance_amount}
                    step="0.01"
                    // Clamped again on the way out. The hook re-anchors the
                    // map after a refetch, but that lands one frame later —
                    // this stops a just-paid amount from flashing against its
                    // new, smaller balance.
                    value={isSelected ? Math.min(amounts[bill.id] ?? 0, bill.balance_amount) : ''}
                    onChange={(e) => onAmountChange(bill, Number(e.target.value))}
                    disabled={disabled || !isSelected}
                    // Spinners stripped. type="number" is kept for the numeric
                    // keypad on tablets and for min/max, but the up/down arrows
                    // are a liability at a cash counter: they invite nudging an
                    // amount a rupee at a time, and a stray scroll over a
                    // focused field silently changes what is being collected.
                    className="h-8 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    onWheel={(e) => e.currentTarget.blur()}
                    aria-label={`Amount to pay for ${bill.category_name || 'bill'}`}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="bg-muted/40">
          <TableRow className="hover:bg-muted/40">
            <TableCell colSpan={5} className="font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">{money(totals.billed)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{money(totals.paid)}</TableCell>
            <TableCell className="text-right tabular-nums font-semibold">{money(totals.balance)}</TableCell>
            <TableCell className="text-right tabular-nums font-bold text-teal-700 dark:text-teal-300">
              {money(totals.payingNow)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
    </div>
  );
}

const STAT_TONE = {
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
  teal: 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100',
  neutral: 'border-border bg-muted/30 text-foreground',
} as const;

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: keyof typeof STAT_TONE;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={cn('rounded-lg border px-3 py-2', STAT_TONE[tone])}>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide opacity-80">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
    </div>
  );
}
