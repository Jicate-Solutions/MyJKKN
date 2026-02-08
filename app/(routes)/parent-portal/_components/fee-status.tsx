'use client';

import { CreditCard, Calendar, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { LearnerFeeSummary } from '@/types/parent-portal';

interface FeeStatusProps {
  learnerName: string;
  learnerPhoto?: string | null;
  fees?: LearnerFeeSummary;
  onPayNow?: () => void;
}

export function FeeStatus({ learnerName, fees, onPayNow }: FeeStatusProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const paymentPercentage = fees.total_billed > 0
    ? (fees.total_paid / fees.total_billed) * 100
    : 0;

  const hasPendingFees = fees.total_pending > 0;
  const hasOverdueFees = fees.total_overdue > 0;

  return (
    <Card className={`${hasOverdueFees ? 'border-red-200 bg-red-50/30' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{learnerName}</CardTitle>
          {!hasPendingFees && (
            <Badge variant="outline" className="bg-green-50 text-green-700">
              <CheckCircle className="mr-1 h-3 w-3" />
              All Paid
            </Badge>
          )}
          {hasOverdueFees && (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Overdue
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Fee Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Total Billed */}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CreditCard className="h-4 w-4" />
              <span>Total Billed</span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900">
              {formatCurrency(fees.total_billed)}
            </p>
          </div>

          {/* Total Paid */}
          <div className="rounded-lg bg-green-50 p-3">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span>Paid</span>
            </div>
            <p className="mt-1 text-xl font-bold text-green-700">
              {formatCurrency(fees.total_paid)}
            </p>
          </div>

          {/* Total Pending */}
          <div className={`rounded-lg p-3 ${hasOverdueFees ? 'bg-red-50' : 'bg-orange-50'}`}>
            <div className={`flex items-center gap-2 text-sm ${hasOverdueFees ? 'text-red-700' : 'text-orange-700'}`}>
              <AlertTriangle className="h-4 w-4" />
              <span>Pending</span>
            </div>
            <p className={`mt-1 text-xl font-bold ${hasOverdueFees ? 'text-red-700' : 'text-orange-700'}`}>
              {formatCurrency(fees.total_pending)}
            </p>
          </div>
        </div>

        {/* Payment Progress */}
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-600">Payment Progress</span>
            <span className="font-medium text-gray-900">
              {paymentPercentage.toFixed(0)}% Complete
            </span>
          </div>
          <Progress value={paymentPercentage} className="h-2" />
        </div>

        {/* Next Due Date */}
        {fees.next_due_date && fees.next_due_amount > 0 && (
          <div className="flex items-center justify-between rounded-lg border bg-blue-50 p-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">Next Payment Due</p>
                <p className="text-xs text-blue-700">{formatDate(fees.next_due_date)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-blue-900">
                {formatCurrency(fees.next_due_amount)}
              </p>
            </div>
          </div>
        )}

        {/* Recent Payments */}
        {fees.recent_payments && fees.recent_payments.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
              <TrendingUp className="h-4 w-4" />
              Recent Payments
            </h4>
            <div className="space-y-2">
              {fees.recent_payments.slice(0, 3).map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg border bg-white p-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatCurrency(payment.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Receipt: {payment.receipt_number}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(payment.date)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Button */}
        {hasPendingFees && (
          <Button
            onClick={onPayNow}
            className="w-full"
            variant={hasOverdueFees ? 'destructive' : 'default'}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Pay Now - {formatCurrency(fees.total_pending)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
