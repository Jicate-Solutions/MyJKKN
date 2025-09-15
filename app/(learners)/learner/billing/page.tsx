'use client';

import { useState, useCallback } from 'react';
import LearnerLayout from '@/components/layout/learner-layout';
import { LearnerPageHeader } from '@/components/layout/learner-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Receipt,
  CreditCard,
  BarChart3,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Bell,
  Download,
  Eye,
  DollarSign,
  Clock,
  CheckCircle,
  Info,
  Sparkles,
  Activity
} from 'lucide-react';

// Import our billing components
import { BillingOverviewCards } from './_components/billing-overview-cards';
import { BillingCharts } from './_components/billing-charts';
import { BillingFilters } from './_components/billing-filters';
import { BillingBillsList } from './_components/billing-bills-list';
import { BillingPaymentHistory } from './_components/billing-payment-history';
import { BillingAlerts } from './_components/billing-alerts';
import { BillingQuickActions } from './_components/billing-quick-actions';
import { BillingErrorBoundary } from './_components/billing-error-boundary';

// Import hooks and services
import { useLearnerBilling, useLearnerBillingCharts, useLearnerBillingNotifications } from '@/hooks/learner/use-learner-billing';
import { formatCurrency } from '@/lib/utils';

export default function BillingPage() {
  const {
    billingData,
    loading,
    error,
    filters,
    updateFilters,
    refreshData
  } = useLearnerBilling();

  const {
    notifications,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead
  } = useLearnerBillingNotifications();

  const charts = useLearnerBillingCharts(billingData);

  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const handlePayNow = useCallback((amount?: number) => {
    if (billingData?.bills) {
      const unpaidBills = billingData.bills.filter(
        bill => bill.status === 'unpaid' || bill.status === 'overdue'
      );
      setSelectedBills(unpaidBills.map(bill => bill.id));
      setShowPaymentDialog(true);
    }
  }, [billingData?.bills]);

  const handleViewDetails = useCallback((type: 'overdue' | 'unpaid' | 'paid') => {
    updateFilters({ status: type });
  }, [updateFilters]);

  const handleExport = useCallback(() => {
    // Implementation for exporting billing data
    console.log('Exporting billing data with filters:', filters);
  }, [filters]);

  // Error state
  if (error) {
    return (
      <LearnerLayout>
        <LearnerPageHeader
          title='Billing & Payments'
          subtitle='Manage your fees, payments, and financial information'
        />
        <div className='p-4 md:p-6'>
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
          <div className='mt-4 text-center'>
            <Button onClick={refreshData} variant='outline'>
              Try Again
            </Button>
          </div>
        </div>
      </LearnerLayout>
    );
  }

  // Loading state
  if (loading && !billingData) {
    return (
      <LearnerLayout>
        <LearnerPageHeader
          title='Billing & Payments'
          subtitle='Manage your fees, payments, and financial information'
        />
        <div className='p-4 md:p-6 space-y-6'>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6'>
            {[...Array(4)].map((_, i) => (
              <Card key={i} className='animate-pulse'>
                <CardContent className='p-6'>
                  <div className='space-y-3'>
                    <Skeleton className='h-4 w-3/4' />
                    <Skeleton className='h-8 w-1/2' />
                    <Skeleton className='h-2 w-full' />
                    <Skeleton className='h-8 w-full' />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {[...Array(2)].map((_, i) => (
              <Card key={i} className='animate-pulse'>
                <CardContent className='p-6'>
                  <Skeleton className='h-80 w-full' />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </LearnerLayout>
    );
  }

  // No data state
  if (!loading && !billingData) {
    return (
      <LearnerLayout>
        <LearnerPageHeader
          title='Billing & Payments'
          subtitle='Manage your fees, payments, and financial information'
        />
        <div className='p-4 md:p-6'>
          <div className='flex flex-col items-center justify-center text-center p-8 bg-gray-50 rounded-lg shadow-sm border border-dashed'>
            <Receipt className='h-16 w-16 text-gray-400 mb-4' />
            <h2 className='text-2xl font-bold text-gray-800'>No Billing Data</h2>
            <p className='text-gray-600 mt-2 max-w-md'>
              No billing information found for your account. Please contact the administration if this seems incorrect.
            </p>
            <Button onClick={refreshData} className='mt-4' variant='outline'>
              Refresh Data
            </Button>
          </div>
        </div>
      </LearnerLayout>
    );
  }

  const stats = billingData?.billing_stats;

  return (
    <BillingErrorBoundary>
      <LearnerLayout>
        <LearnerPageHeader
          title='Billing & Payments'
          subtitle={`Manage your fees, payments, and financial information • ${formatCurrency(stats?.outstanding_amount || 0)} outstanding`}
        />

        <div className='p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 bg-gradient-to-br from-green-50 via-gray-50 to-yellow-50 min-h-screen'>
          {/* Alerts Section */}
          {!notificationsLoading && notifications.length > 0 && (
            <BillingAlerts
              alerts={stats?.alerts || []}
              notifications={notifications}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
            />
          )}

          {/* Filters */}
          <BillingFilters
            filters={filters}
            onFilterChange={updateFilters}
            onExport={handleExport}
            loading={loading}
          />

          {/* Overview Cards */}
          {stats && (
            <BillingOverviewCards
              stats={stats}
              loading={loading}
              onPayNow={handlePayNow}
              onViewDetails={handleViewDetails}
            />
          )}

          {/* Main Content */}
          <div className='bg-white rounded-2xl shadow-xl border border-green-100 backdrop-blur-sm'>
            <Tabs defaultValue='overview' className='w-full'>
              {/* Mobile-first responsive tabs */}
              <div className='border-b border-gray-200 bg-gradient-to-r from-[#0b6d41] to-green-600 rounded-t-2xl p-1'>
                <TabsList className='grid w-full grid-cols-5 bg-white/20 backdrop-blur-md rounded-xl border-0 h-auto p-1'>
                  <TabsTrigger
                    value='overview'
                    className='flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-white data-[state=active]:bg-white data-[state=active]:text-[#0b6d41] data-[state=active]:shadow-lg rounded-lg transition-all duration-200'
                  >
                    <BarChart3 className='h-4 w-4 sm:h-5 sm:w-5' />
                    <span className='text-xs sm:text-sm font-medium'>Overview</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value='bills'
                    className='relative flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-white data-[state=active]:bg-white data-[state=active]:text-[#0b6d41] data-[state=active]:shadow-lg rounded-lg transition-all duration-200'
                  >
                    <Receipt className='h-4 w-4 sm:h-5 sm:w-5' />
                    <span className='text-xs sm:text-sm font-medium'>Bills</span>
                    {stats && (stats.unpaid_bills + stats.overdue_bills) > 0 && (
                      <Badge variant='destructive' className='absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-[#ffde59] text-black border-2 border-white font-bold'>
                        {stats.unpaid_bills + stats.overdue_bills}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value='payments'
                    className='flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-white data-[state=active]:bg-white data-[state=active]:text-[#0b6d41] data-[state=active]:shadow-lg rounded-lg transition-all duration-200'
                  >
                    <CreditCard className='h-4 w-4 sm:h-5 sm:w-5' />
                    <span className='text-xs sm:text-sm font-medium'>Payments</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value='analytics'
                    className='flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-white data-[state=active]:bg-white data-[state=active]:text-[#0b6d41] data-[state=active]:shadow-lg rounded-lg transition-all duration-200'
                  >
                    <Activity className='h-4 w-4 sm:h-5 sm:w-5' />
                    <span className='text-xs sm:text-sm font-medium'>Analytics</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value='actions'
                    className='flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-white data-[state=active]:bg-white data-[state=active]:text-[#0b6d41] data-[state=active]:shadow-lg rounded-lg transition-all duration-200'
                  >
                    <Sparkles className='h-4 w-4 sm:h-5 sm:w-5' />
                    <span className='text-xs sm:text-sm font-medium'>Actions</span>
                  </TabsTrigger>
                </TabsList>
              </div>

            <TabsContent value='overview' className='space-y-4 sm:space-y-6 mt-4 sm:mt-6 p-4 sm:p-6'>
              <div className='grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6'>
                {/* Charts */}
                <div className='xl:col-span-2 order-2 xl:order-1'>
                  <BillingCharts charts={charts} loading={loading} />
                </div>

                {/* Quick Info Panel */}
                <div className='space-y-4 sm:space-y-6 order-1 xl:order-2'>
                  {/* Recent Activity */}
                  <Card className='bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-lg hover:shadow-xl transition-shadow duration-300'>
                    <CardContent className='p-4 sm:p-6'>
                      <h3 className='text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-[#0b6d41]'>
                        <Clock className='h-5 w-5 text-[#0b6d41]' />
                        Recent Activity
                      </h3>
                      <div className='space-y-3'>
                        {billingData?.recent_transactions.slice(0, 5).map((transaction, index) => (
                          <div key={index} className='flex items-center justify-between p-3 bg-white rounded-lg border border-blue-100 hover:border-blue-200 transition-colors duration-200'>
                            <div className='flex items-center gap-3'>
                              <div className={`p-2 rounded-full ${
                                'receipt_number' in transaction
                                  ? 'bg-green-100 text-green-600'
                                  : 'bg-blue-100 text-blue-600'
                              }`}>
                                {'receipt_number' in transaction ? (
                                  <CheckCircle className='h-4 w-4' />
                                ) : (
                                  <Receipt className='h-4 w-4' />
                                )}
                              </div>
                              <div>
                                <span className='font-medium text-sm sm:text-base block'>
                                  {'receipt_number' in transaction ? 'Payment' : 'Bill'}
                                </span>
                                <span className='text-xs text-gray-500'>
                                  {new Date(transaction.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <div className='text-right'>
                              <span className={`font-semibold text-sm sm:text-base ${
                                'receipt_number' in transaction ? 'text-green-600' : 'text-blue-600'
                              }`}>
                                {formatCurrency('payment_amount' in transaction ? transaction.payment_amount : transaction.final_amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <BillingQuickActions
                    outstandingAmount={stats?.outstanding_amount || 0}
                    hasOverdue={(stats?.overdue_bills || 0) > 0}
                    onPayNow={handlePayNow}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value='bills' className='space-y-4 sm:space-y-6 mt-4 sm:mt-6 p-4 sm:p-6'>
              <BillingBillsList
                bills={(billingData?.bills || []) as any}
                loading={loading}
                onPayBill={handlePayNow}
                selectedBills={selectedBills}
                onSelectionChange={setSelectedBills}
              />
            </TabsContent>

            <TabsContent value='payments' className='space-y-4 sm:space-y-6 mt-4 sm:mt-6 p-4 sm:p-6'>
              <BillingPaymentHistory
                payments={(billingData?.payments || []) as any}
                loading={loading}
              />
            </TabsContent>

            <TabsContent value='analytics' className='space-y-4 sm:space-y-6 mt-4 sm:mt-6 p-4 sm:p-6'>
              <BillingCharts charts={charts} loading={loading} />

              {/* Additional Analytics */}
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6'>
                <Card className='bg-gradient-to-br from-green-50 to-emerald-100 border-green-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105'>
                  <CardContent className='p-4 sm:p-6 text-center'>
                    <div className='flex justify-center mb-3'>
                      <div className='p-3 bg-green-100 rounded-full'>
                        <TrendingUp className='h-6 w-6 text-green-600' />
                      </div>
                    </div>
                    <h3 className='text-base sm:text-lg font-semibold mb-2 text-green-800'>Payment Rate</h3>
                    <div className='text-2xl sm:text-3xl font-bold text-green-600'>
                      {stats && stats.total_bills > 0
                        ? ((stats.paid_bills / stats.total_bills) * 100).toFixed(1)
                        : 0
                      }%
                    </div>
                    <p className='text-xs sm:text-sm text-green-700 mt-1'>of bills paid on time</p>
                  </CardContent>
                </Card>

                <Card className='bg-gradient-to-br from-blue-50 to-cyan-100 border-blue-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105'>
                  <CardContent className='p-4 sm:p-6 text-center'>
                    <div className='flex justify-center mb-3'>
                      <div className='p-3 bg-blue-100 rounded-full'>
                        <DollarSign className='h-6 w-6 text-blue-600' />
                      </div>
                    </div>
                    <h3 className='text-base sm:text-lg font-semibold mb-2 text-blue-800'>Average Bill</h3>
                    <div className='text-2xl sm:text-3xl font-bold text-blue-600'>
                      {stats
                        ? formatCurrency(stats.total_bills > 0 ? stats.total_amount_billed / stats.total_bills : 0)
                        : formatCurrency(0)
                      }
                    </div>
                    <p className='text-xs sm:text-sm text-blue-700 mt-1'>per billing cycle</p>
                  </CardContent>
                </Card>

                <Card className='bg-gradient-to-br from-purple-50 to-pink-100 border-purple-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105'>
                  <CardContent className='p-4 sm:p-6 text-center'>
                    <div className='flex justify-center mb-3'>
                      <div className='p-3 bg-purple-100 rounded-full'>
                        <Sparkles className='h-6 w-6 text-purple-600' />
                      </div>
                    </div>
                    <h3 className='text-base sm:text-lg font-semibold mb-2 text-purple-800'>Total Saved</h3>
                    <div className='text-2xl sm:text-3xl font-bold text-purple-600'>
                      {formatCurrency(stats?.discount_amount || 0)}
                    </div>
                    <p className='text-xs sm:text-sm text-purple-700 mt-1'>through discounts</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value='actions' className='space-y-4 sm:space-y-6 mt-4 sm:mt-6 p-4 sm:p-6'>
              <BillingQuickActions
                outstandingAmount={stats?.outstanding_amount || 0}
                hasOverdue={(stats?.overdue_bills || 0) > 0}
                onPayNow={handlePayNow}
                showAllActions
              />
            </TabsContent>
            </Tabs>
          </div>
        </div>
      </LearnerLayout>
    </BillingErrorBoundary>
  );
}
