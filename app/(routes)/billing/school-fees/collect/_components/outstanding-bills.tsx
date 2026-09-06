'use client';

// outstanding-bills.tsx — select what is being paid, and how much of it.
//
// The "Pay Now" input is the only editable cell, and it never exceeds the
// bill's balance: the hook clamps on every keystroke and re-anchors the whole
// map whenever the bills refetch. The display clamps once more, covering the
// single frame between a refetch and that re-anchoring.

import { useMemo } from 'react';
import { Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
function statusOf(bill: SchoolOutstandingBill): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (bill.status === 'partially_paid') return { label: 'PARTIAL', variant: 'secondary' };
  const due = bill.due_date ? new Date(bill.due_date) : null;
  const isOverdue =
    bill.status === 'overdue' ||
    (due != null && !isNaN(due.getTime()) && due < new Date(new Date().toDateString()));
  if (isOverdue) return { label: 'OVERDUE', variant: 'destructive' };
  return { label: 'PENDING', variant: 'outline' };
}

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
    <div className="rounded-md border overflow-x-auto">
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
            const status = statusOf(bill);
            const isPayable = bill.balance_amount > 0;
            const isSelected = Boolean(selected[bill.id]);
            return (
              <TableRow key={bill.id} className={isSelected ? 'bg-muted/40' : undefined}>
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
                  <Badge variant={status.variant}>{status.label}</Badge>
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
      </Table>
    </div>
  );
}
