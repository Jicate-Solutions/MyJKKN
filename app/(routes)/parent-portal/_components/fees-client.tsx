'use client';

import { Loader2, CreditCard, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { useParentDashboard } from '@/hooks/parent-portal';
import { ensureArray } from '@/lib/utils/validation';
import { FeeStatus } from './fee-status';

export function FeesClient() {
  const { data: dashboardData, isLoading, error } = useParentDashboard();

  const handlePayNow = (learnerId: string, amount: number) => {
    toast.success('Online payment coming soon! Please contact the accounts department.');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-sm text-gray-500">Loading fee information...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg font-medium text-gray-900">Failed to load fee data</p>
          <p className="mt-1 text-sm text-gray-500">
            {error?.message || 'An error occurred'}
          </p>
        </div>
      </div>
    );
  }

  const learners = ensureArray(dashboardData.learners, []);
  const totalPending = learners.reduce((sum, l) => sum + (l.fees?.total_pending ?? 0), 0);
  const totalOverdue = learners.reduce((sum, l) => sum + (l.fees?.total_overdue ?? 0), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Fee Status</h1>
        <p className="mt-1 text-gray-600">
          View and manage fee payments for your children
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-3">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Learners</p>
                <p className="text-2xl font-bold text-gray-900">{learners.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-orange-100 p-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Pending</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(totalPending)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={totalOverdue > 0 ? 'border-red-200 bg-red-50/30' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Overdue</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(totalOverdue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fee Status Cards */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Fee Details by Learner
        </h2>

        {learners.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-gray-400" />
              <p className="mt-4 text-lg font-medium text-gray-600">
                No learners found
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Contact your institution to link your children
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {learners.map((learnerData) => (
              <FeeStatus
                key={learnerData.learner.id}
                learnerName={`${learnerData.learner.first_name || ''} ${learnerData.learner.last_name || ''}`.trim() || 'Learner'}
                learnerPhoto={learnerData.learner.photo_url}
                fees={learnerData.fees}
                onPayNow={() =>
                  handlePayNow(
                    learnerData.learner.id,
                    learnerData.fees?.total_pending ?? 0
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Payment Help */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-4">
          <h3 className="font-medium text-blue-900">Need Help?</h3>
          <p className="mt-1 text-sm text-blue-700">
            For payment queries or issues, please contact the institution's
            accounts department or visit the office during working hours.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
