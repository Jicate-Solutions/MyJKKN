'use client';

import { WidgetContainer } from '../shared/widget-container';
import { CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStudentBilling } from '@/hooks/dashboard/use-student-dashboard';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface BillingWidgetProps {
  studentId: string;
  isVisible: boolean;
}

export function BillingWidget({
  studentId,
  isVisible,
}: BillingWidgetProps) {
  const router = useRouter();
  const { data, isLoading, error } = useStudentBilling(studentId);

  if (!isVisible) return null;

  const totalFees = data?.total_fees || 0;
  const paidAmount = data?.paid_amount || 0;
  const outstandingBalance = data?.outstanding_balance || 0;
  const paymentPercentage = totalFees > 0 ? (paidAmount / totalFees) * 100 : 0;

  const handleClick = () => {
    router.push('/accounts/schedule');
  };

  return (
    <WidgetContainer
      title="Fee Summary"
      icon={CreditCard}
      isLoading={isLoading}
      error={error ? error.message : null}
      onClick={handleClick}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Outstanding Balance</p>
            <p className="text-2xl font-bold">₹{outstandingBalance.toLocaleString()}</p>
          </div>
          <div className={cn(
            "p-2 rounded-full",
            outstandingBalance > 0 ? "bg-red-50 text-red-600 dark:bg-red-950/30" : "bg-green-50 text-green-600 dark:bg-green-950/30"
          )}>
            {outstandingBalance > 0 ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Payment Progress</span>
            <span className="font-medium">{Math.round(paymentPercentage)}%</span>
          </div>
          <Progress value={paymentPercentage} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="text-xs text-muted-foreground">Total Fees</p>
            <p className="text-sm font-semibold">₹{totalFees.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid Amount</p>
            <p className="text-sm font-semibold text-green-600">₹{paidAmount.toLocaleString()}</p>
          </div>
        </div>

        {data?.next_due_date && outstandingBalance > 0 && (
          <div className="pt-2 border-t border-border mt-2">
            <p className="text-xs text-muted-foreground">
              Next Due Date: <span className="font-medium text-foreground">{new Date(data.next_due_date).toLocaleDateString()}</span>
            </p>
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}
