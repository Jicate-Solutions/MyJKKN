'use client';

import { useState, useMemo } from 'react';
import {
  FileText,
  ReceiptIndianRupee,
  Percent,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  User,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { StudentBillingSummary } from '@/types/billing-schedule';
import { useStudentBillCancellations } from '@/hooks/billing/use-bill-cancellation';
import { BILL_CANCEL_REASON_LABELS } from '@/types/billing-bill-cancellation';
import type { BillCancelReasonCode } from '@/types/billing-bill-cancellation';

interface StudentTransactionHistoryProps {
  summary: StudentBillingSummary;
  onRefresh: () => void;
}

/**
 * Who performed an event. A single row can carry more than one — a receipt
 * keyed in by one user on behalf of the cashier who took the cash names both.
 * `system` marks an actor that is not a person (the payment gateway), so it
 * renders differently from a named staff member.
 */
interface TransactionActor {
  label: string;
  name: string;
  system?: boolean;
}

interface TransactionEvent {
  id: string;
  type:
    | 'bill_created'
    | 'bill_cancelled'
    | 'payment_received'
    | 'discount_applied'
    | 'refund_processed';
  date: string;
  amount: number;
  description: string;
  status: string;
  reference?: string;
  actors: TransactionActor[];
  details?: any;
}

/**
 * Attribution for a receipt. The two identities are NOT interchangeable:
 *
 *   created_by    - the signed-in session that keyed the receipt in.
 *   accountant_id - the cashier credited with collecting the money.
 *
 * Half of all receipts (4,159 of 8,318 on 2026-09-03) have created_by NULL,
 * because /api/billing/receipts/bulk-import runs on a service-role client —
 * auth.getUser() returns nothing there, so the RPC writes NULL. That route
 * compensates by putting the importing user in accountant_id, which is why
 * 4,084 of those 4,159 still name a real person. Reading created_by alone
 * left every one of them blank.
 *
 * The remaining 74 are Razorpay captures finalized by the webhook, which has
 * no user at all — they are labelled as the gateway rather than left empty,
 * so a blank chip always means genuinely lost attribution, never "system".
 */
function getReceiptActors(receipt: any): TransactionActor[] {
  const actors: TransactionActor[] = [];

  if (receipt.creator?.full_name) {
    actors.push({ label: 'Recorded by', name: receipt.creator.full_name });
  }

  // Only a second chip when it is genuinely a second person. On the manual
  // form the operator usually picks themselves as the accountant, and
  // "Recorded by X / Collected by X" is noise.
  if (
    receipt.accountant?.full_name &&
    receipt.accountant.full_name !== receipt.creator?.full_name
  ) {
    actors.push({ label: 'Collected by', name: receipt.accountant.full_name });
  }

  if (actors.length === 0 && receipt.payment_mode === 'online') {
    actors.push({
      label: 'Captured by',
      name: 'Online payment gateway',
      system: true
    });
  }

  return actors;
}

export function StudentTransactionHistory({
  summary,
  onRefresh
}: StudentTransactionHistoryProps) {
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // The timeline is assembled client-side from the summary, which carries no
  // cancellation record — so the cancellations are fetched alongside it.
  const { data: cancellations } = useStudentBillCancellations(summary.student?.id);

  // Combine all transactions into a timeline
  const allTransactions = useMemo(() => {
    const transactions: TransactionEvent[] = [];

    // Add bills
    summary.bills.forEach((bill) => {
      const description = bill.bill_description
        ? `Bill created: ${bill.bill_description}`
        : 'Bill created';

      transactions.push({
        id: `bill-${bill.id}`,
        type: 'bill_created',
        date: bill.created_at,
        amount: bill.final_amount,
        description: description,
        status: bill.status,
        // 1,079 of 20,960 bills carry no created_by (generator//import runs).
        // Bills have no second identity column to fall back on, so those are
        // named as a system action rather than shown blank.
        actors: bill.creator?.full_name
          ? [{ label: 'Created by', name: bill.creator.full_name }]
          : [{ label: 'Created by', name: 'System / bulk generation', system: true }],
        details: bill
      });
    });

    // Add receipts
    summary.receipts.forEach((receipt) => {
      transactions.push({
        id: `receipt-${receipt.id}`,
        type: 'payment_received',
        date: receipt.created_at || receipt.receipt_date,
        amount: receipt.payment_amount,
        description: `Payment via ${receipt.payment_mode}`,
        status: 'completed',
        reference: receipt.receipt_number,
        actors: getReceiptActors(receipt),
        details: receipt
      });
    });

    // Add discounts
    summary.discounts.forEach((discount) => {
      transactions.push({
        id: `discount-${discount.id}`,
        type: 'discount_applied',
        date: discount.effective_date,
        amount: discount.discount_amount,
        description: `${discount.discount_category} discount`,
        status: discount.approval_status,
        actors: discount.creator?.full_name
          ? [{ label: 'Applied by', name: discount.creator.full_name }]
          : [],
        details: discount
      });
    });

    // Add refunds
    summary.refunds.forEach((refund) => {
      transactions.push({
        id: `refund-${refund.id}`,
        type: 'refund_processed',
        date: refund.refund_date,
        amount: refund.net_refund_amount,
        description: `${refund.refund_category} refund`,
        status: refund.approval_status,
        actors: refund.creator?.full_name
          ? [{ label: 'Processed by', name: refund.creator.full_name }]
          : [],
        details: refund
      });
    });

    // Add bill cancellations. Dated by cancelled_at, NOT by the bill's
    // created_at — a bill raised in June and cancelled in August belongs at
    // August in a timeline, otherwise the void is invisible where it happened.
    cancellations?.forEach((c) => {
      transactions.push({
        id: `bill-cancel-${c.id}`,
        type: 'bill_cancelled',
        date: c.cancelled_at,
        amount: c.amount_cancelled,
        description: `Bill cancelled — ${
          BILL_CANCEL_REASON_LABELS[c.reason_code as BillCancelReasonCode] ??
          c.reason_code
        }: ${c.reason}`,
        status: 'cancelled',
        actors: c.cancelled_by_name
          ? [{ label: 'Cancelled by', name: c.cancelled_by_name }]
          : [],
        details: c
      });
    });

    // Sort by date (newest first)
    return transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [summary, cancellations]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let filtered = allTransactions;

    if (typeFilter !== 'all') {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    if (timeFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();

      switch (timeFilter) {
        case 'last_7_days':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'last_30_days':
          filterDate.setDate(now.getDate() - 30);
          break;
        case 'last_90_days':
          filterDate.setDate(now.getDate() - 90);
          break;
        case 'this_year':
          filterDate.setFullYear(now.getFullYear(), 0, 1);
          break;
      }

      filtered = filtered.filter((t) => new Date(t.date) >= filterDate);
    }

    return filtered;
  }, [allTransactions, timeFilter, typeFilter]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'bill_created':
        return <FileText className='h-4 w-4' />;
      case 'bill_cancelled':
        return <Ban className='h-4 w-4' />;
      case 'payment_received':
        return <ReceiptIndianRupee className='h-4 w-4' />;
      case 'discount_applied':
        return <Percent className='h-4 w-4' />;
      case 'refund_processed':
        return <RefreshCw className='h-4 w-4' />;
      default:
        return <Clock className='h-4 w-4' />;
    }
  };

  const getTransactionColor = (type: string, status: string) => {
    if (status === 'cancelled' || status === 'rejected') {
      return 'text-red-600 bg-red-50 border-red-200';
    }

    switch (type) {
      case 'bill_created':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'payment_received':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'discount_applied':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'refund_processed':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
      case 'completed':
      case 'approved':
      case 'processed':
        return <CheckCircle className='h-3 w-3 text-green-600' />;
      case 'cancelled':
      case 'rejected':
        return <XCircle className='h-3 w-3 text-red-600' />;
      case 'pending':
        return <Clock className='h-3 w-3 text-yellow-600' />;
      case 'overdue':
        return <AlertCircle className='h-3 w-3 text-red-600' />;
      default:
        return <Clock className='h-3 w-3 text-gray-600' />;
    }
  };

  const getAmountDisplay = (type: string, amount: number) => {
    const isPositive = type === 'payment_received';
    const isNegative =
      type === 'refund_processed' || type === 'discount_applied';

    return (
      <div
        className={`font-medium ${
          isPositive
            ? 'text-green-600'
            : isNegative
            ? 'text-red-600'
            : 'text-gray-900'
        }`}
      >
        {isPositive ? '+' : isNegative ? '-' : ''}
        {formatCurrency(amount)}
      </div>
    );
  };

  if (filteredTransactions.length === 0) {
    return (
      <div className='text-center py-12'>
        <Clock className='mx-auto h-12 w-12 text-muted-foreground' />
        <h3 className='mt-4 text-lg font-semibold'>No transactions found</h3>
        <p className='mt-2 text-muted-foreground'>
          No transactions match the selected filters.
        </p>
        <Button variant='outline' onClick={onRefresh} className='mt-4'>
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Filters */}
      <div className='flex flex-col sm:flex-row gap-4'>
        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className='w-full sm:w-48'>
            <SelectValue placeholder='Filter by time' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Time</SelectItem>
            <SelectItem value='last_7_days'>Last 7 Days</SelectItem>
            <SelectItem value='last_30_days'>Last 30 Days</SelectItem>
            <SelectItem value='last_90_days'>Last 90 Days</SelectItem>
            <SelectItem value='this_year'>This Year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className='w-full sm:w-48'>
            <SelectValue placeholder='Filter by type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='bill_created'>Bills Created</SelectItem>
            <SelectItem value='bill_cancelled'>Bills Cancelled</SelectItem>
            <SelectItem value='payment_received'>Payments</SelectItem>
            <SelectItem value='discount_applied'>Discounts</SelectItem>
            <SelectItem value='refund_processed'>Refunds</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant='outline'
          onClick={onRefresh}
          className='w-full sm:w-auto'
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      {/* Transaction Timeline */}
      <div className='space-y-4'>
        {filteredTransactions.map((transaction, index) => (
          <div key={transaction.id} className='relative'>
            {/* Timeline line */}
            {index < filteredTransactions.length - 1 && (
              <div className='absolute left-6 top-12 w-0.5 h-8 bg-border' />
            )}

            <Card className='ml-0'>
              <CardContent className='p-4'>
                <div className='flex items-start gap-4'>
                  {/* Icon */}
                  <div
                    className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center ${getTransactionColor(
                      transaction.type,
                      transaction.status
                    )}`}
                  >
                    {getTransactionIcon(transaction.type)}
                  </div>

                  {/* Content */}
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-start justify-between'>
                      <div className='space-y-1'>
                        <div className='flex items-center gap-2'>
                          <h4 className='font-medium text-sm'>
                            {transaction.description}
                          </h4>
                          {getStatusIcon(transaction.status)}
                        </div>
                        <div className='flex items-center gap-2 flex-wrap'>
                          <span className='text-xs text-muted-foreground'>
                            {formatDateTime(transaction.date)}
                          </span>
                          {transaction.actors.length > 0 ? (
                            transaction.actors.map((actor) => (
                              <span
                                key={`${actor.label}-${actor.name}`}
                                className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                                  actor.system
                                    ? 'bg-muted/60 text-muted-foreground italic'
                                    : 'bg-muted'
                                }`}
                              >
                                {actor.system ? (
                                  <Settings className='h-3 w-3' />
                                ) : (
                                  <User className='h-3 w-3' />
                                )}
                                <span className='text-muted-foreground'>
                                  {actor.label}
                                </span>
                                <span className='font-medium'>{actor.name}</span>
                              </span>
                            ))
                          ) : (
                            <span className='text-xs px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground italic'>
                              User not recorded
                            </span>
                          )}
                        </div>
                        {transaction.reference && (
                          <div className='text-xs font-mono text-muted-foreground'>
                            Ref: {transaction.reference}
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div className='text-right'>
                        {getAmountDisplay(transaction.type, transaction.amount)}
                        <div className='text-xs text-muted-foreground capitalize'>
                          {transaction.status.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm'>Transaction Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
            <div className='text-center'>
              <div className='text-2xl font-bold text-blue-600'>
                {summary.bills.length}
              </div>
              <div className='text-muted-foreground'>Bills</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-green-600'>
                {summary.receipts.length}
              </div>
              <div className='text-muted-foreground'>Payments</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-purple-600'>
                {summary.discounts.length}
              </div>
              <div className='text-muted-foreground'>Discounts</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-orange-600'>
                {summary.refunds.length}
              </div>
              <div className='text-muted-foreground'>Refunds</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
