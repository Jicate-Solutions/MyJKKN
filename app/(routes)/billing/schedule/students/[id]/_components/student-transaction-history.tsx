'use client';

import { useState, useMemo } from 'react';
import {
  Calendar,
  FileText,
  Receipt,
  Percent,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface StudentTransactionHistoryProps {
  summary: StudentBillingSummary;
  onRefresh: () => void;
}

interface TransactionEvent {
  id: string;
  type:
    | 'bill_created'
    | 'payment_received'
    | 'discount_applied'
    | 'refund_processed';
  date: string;
  amount: number;
  description: string;
  status: string;
  reference?: string;
  details?: any;
}

export function StudentTransactionHistory({
  summary,
  onRefresh
}: StudentTransactionHistoryProps) {
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Combine all transactions into a timeline
  const allTransactions = useMemo(() => {
    const transactions: TransactionEvent[] = [];

    // Add bills
    summary.bills.forEach((bill) => {
      transactions.push({
        id: `bill-${bill.id}`,
        type: 'bill_created',
        date: bill.created_at,
        amount: bill.final_amount,
        description: bill.bill_description,
        status: bill.status,
        details: bill
      });
    });

    // Add receipts
    summary.receipts.forEach((receipt) => {
      transactions.push({
        id: `receipt-${receipt.id}`,
        type: 'payment_received',
        date: receipt.receipt_date,
        amount: receipt.payment_amount,
        description: `Payment via ${receipt.payment_mode}`,
        status: 'completed',
        reference: receipt.receipt_number,
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
        details: refund
      });
    });

    // Sort by date (newest first)
    return transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [summary]);

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
      case 'payment_received':
        return <Receipt className='h-4 w-4' />;
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
                        <div className='text-xs text-muted-foreground'>
                          {formatDateTime(transaction.date)}
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
