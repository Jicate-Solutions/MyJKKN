'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsFinancialTransactions,
  useImsFinancialSummary,
  useImsDepartmentCostSummary,
  useImsItemProfitSummary,
  useImsTodayMetrics,
} from '@/hooks/ims/use-ims-financial';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BeatLoader } from 'react-spinners';
import {
  ShoppingCart,
  Truck,
  Package,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import type {
  ImsTransactionType,
  ImsFinancialTransaction,
  ImsDepartmentCostSummary,
  ImsItemProfitSummary,
} from '@/types/ims';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  let from = to;

  switch (preset) {
    case 'today':
      from = to;
      break;
    case 'week': {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      from = weekStart.toISOString().split('T')[0];
      break;
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      from = monthStart.toISOString().split('T')[0];
      break;
    }
    case 'year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      from = yearStart.toISOString().split('T')[0];
      break;
    }
  }
  return { from, to };
}

function getTransactionTypeBadge(type: ImsTransactionType) {
  const config: Record<
    ImsTransactionType,
    { label: string; className: string }
  > = {
    sale: { label: 'Sale', className: 'bg-green-600 text-white' },
    purchase: { label: 'Purchase', className: 'bg-blue-600 text-white' },
    issue: { label: 'Issue', className: 'bg-purple-600 text-white' },
    return: { label: 'Return', className: 'bg-orange-500 text-white' },
    adjustment: { label: 'Adjustment', className: 'bg-yellow-500 text-white' },
    write_off: { label: 'Write Off', className: 'bg-red-600 text-white' },
  };
  const c = config[type] || { label: type, className: 'bg-gray-500 text-white' };
  return <Badge className={c.className}>{c.label}</Badge>;
}

export default function FinancialOverviewPage() {
  const [activeTab, setActiveTab] = useState('transactions');
  const [activePreset, setActivePreset] = useState('month');
  const [dateFrom, setDateFrom] = useState(() => getDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getDateRange('month').to);
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('all');
  const [txnPage, setTxnPage] = useState(1);
  const txnLimit = 15;

  const { isLoading: permissionsLoading } = usePermissions();
  const { storeId, institutionId } = useImsStoreContext();

  // Today's metrics
  const { data: todayMetrics, isLoading: metricsLoading } =
    useImsTodayMetrics(storeId ?? '', institutionId);

  // Financial summary
  const { data: summary, isLoading: summaryLoading } =
    useImsFinancialSummary(storeId ?? '', dateFrom, dateTo, institutionId);

  // Financial transactions
  const { data: transactionsData, isLoading: txnLoading } =
    useImsFinancialTransactions({
      store_id: storeId ?? undefined,
      institution_id: institutionId,
      transaction_type:
        txnTypeFilter !== 'all'
          ? (txnTypeFilter as ImsTransactionType)
          : undefined,
      date_from: dateFrom,
      date_to: dateTo,
      page: txnPage,
      limit: txnLimit,
    });

  // Department cost summary
  const { data: deptCosts, isLoading: deptCostsLoading } =
    useImsDepartmentCostSummary(storeId ?? '', institutionId);

  // Item profit summary
  const { data: itemProfits, isLoading: itemProfitsLoading } =
    useImsItemProfitSummary(storeId ?? '', institutionId);

  const handlePreset = (preset: string) => {
    setActivePreset(preset);
    const range = getDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setTxnPage(1);
  };

  const handleCustomDate = () => {
    setActivePreset('custom');
    setTxnPage(1);
  };

  if (permissionsLoading) {
    return (
      <ContentLayout title='Financial Overview'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Derive transactions list — handle both array and paginated object shapes
  const transactions: ImsFinancialTransaction[] = Array.isArray(transactionsData)
    ? transactionsData
    : transactionsData?.data ?? [];
  const totalTxnCount: number = Array.isArray(transactionsData)
    ? transactionsData.length
    : transactionsData?.metadata?.total ?? transactions.length;
  const totalPages = Math.max(1, Math.ceil(totalTxnCount / txnLimit));

  // Total department cost for percentage bar
  const totalDeptCost =
    deptCosts?.reduce(
      (s: number, d: ImsDepartmentCostSummary) =>
        s + d.total_issued_value + d.total_consumed_value,
      0
    ) ?? 0;

  // Net today calculation
  const netToday = todayMetrics
    ? todayMetrics.sales_revenue - todayMetrics.profit
    : 0;

  return (
    <ContentLayout title='Financial Overview'>
      <div className='space-y-6'>
        {/* Header */}
        <div>
          <div className='flex items-center gap-2 mb-1'>
            <Link href='/ims/dashboard'>
              <Button variant='ghost' size='sm'>
                <ArrowLeft className='h-4 w-4 mr-1' />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <h1 className='text-2xl font-bold'>Financial Overview</h1>
          <p className='text-muted-foreground'>
            Comprehensive financial dashboard with transactions, department
            costs, and item profitability analysis.
          </p>
        </div>

        {/* Today's Metrics Row */}
        <div className='grid gap-4 grid-cols-2 md:grid-cols-4'>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-green-50 dark:bg-green-950/30'>
                  <ShoppingCart className='h-5 w-5 text-green-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Today&apos;s Sales
                  </p>
                  {metricsLoading ? (
                    <BeatLoader size={8} color='#00e902' />
                  ) : (
                    <>
                      <p className='text-2xl font-bold'>
                        {todayMetrics?.sales_count ?? 0}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {formatCurrency(todayMetrics?.sales_revenue ?? 0)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30'>
                  <Truck className='h-5 w-5 text-blue-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Today&apos;s Purchases
                  </p>
                  {metricsLoading ? (
                    <BeatLoader size={8} color='#00e902' />
                  ) : (
                    <>
                      <p className='text-2xl font-bold'>
                        {todayMetrics?.pending_payments ?? 0}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {formatCurrency(todayMetrics?.sales_revenue ?? 0)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30'>
                  <Package className='h-5 w-5 text-purple-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Profit Today
                  </p>
                  {metricsLoading ? (
                    <BeatLoader size={8} color='#00e902' />
                  ) : (
                    <>
                      <p className='text-2xl font-bold'>
                        {formatCurrency(todayMetrics?.profit ?? 0)}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        Margin:{' '}
                        {(todayMetrics?.margin_percent ?? 0).toFixed(1)}%
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30'>
                  {(todayMetrics?.profit ?? 0) >= 0 ? (
                    <TrendingUp className='h-5 w-5 text-green-600' />
                  ) : (
                    <TrendingDown className='h-5 w-5 text-red-600' />
                  )}
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Net Today</p>
                  {metricsLoading ? (
                    <BeatLoader size={8} color='#00e902' />
                  ) : (
                    <p
                      className={`text-2xl font-bold ${
                        (todayMetrics?.sales_revenue ?? 0) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(todayMetrics?.sales_revenue ?? 0)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='text-sm font-medium text-muted-foreground'>
                Period:
              </span>
              {[
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This Week' },
                { key: 'month', label: 'This Month' },
                { key: 'year', label: 'This Year' },
              ].map((preset) => (
                <Button
                  key={preset.key}
                  variant={activePreset === preset.key ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => handlePreset(preset.key)}
                >
                  {preset.label}
                </Button>
              ))}
              <div className='flex items-center gap-2 ml-auto'>
                <Input
                  type='date'
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    handleCustomDate();
                  }}
                  className='w-40'
                />
                <span className='text-muted-foreground'>to</span>
                <Input
                  type='date'
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    handleCustomDate();
                  }}
                  className='w-40'
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary Section */}
        <div className='grid gap-4 grid-cols-1 md:grid-cols-3'>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30'>
                  <Truck className='h-5 w-5 text-blue-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Total Costs
                  </p>
                  <p className='text-2xl font-bold'>
                    {summaryLoading ? (
                      <BeatLoader size={8} color='#00e902' />
                    ) : (
                      formatCurrency(summary?.total_costs ?? 0)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-green-50 dark:bg-green-950/30'>
                  <ShoppingCart className='h-5 w-5 text-green-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Total Revenue</p>
                  <p className='text-2xl font-bold'>
                    {summaryLoading ? (
                      <BeatLoader size={8} color='#00e902' />
                    ) : (
                      formatCurrency(summary?.total_revenue ?? 0)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30'>
                  <IndianRupee className='h-5 w-5 text-emerald-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Gross Profit</p>
                  <p
                    className={`text-2xl font-bold ${
                      (summary?.gross_profit ?? 0) >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {summaryLoading ? (
                      <BeatLoader size={8} color='#00e902' />
                    ) : (
                      formatCurrency(summary?.gross_profit ?? 0)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Financial Summary Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className='flex items-center justify-center py-12'>
                <BeatLoader color='#00e902' />
              </div>
            ) : !summary ? (
              <p className='text-center text-muted-foreground py-8'>
                No financial data available for the selected period.
              </p>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className='text-right'>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className='font-medium'>
                        Total Revenue
                      </TableCell>
                      <TableCell className='text-right text-green-600 font-mono'>
                        {formatCurrency(summary.total_revenue)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className='font-medium'>Total Costs</TableCell>
                      <TableCell className='text-right text-red-600 font-mono'>
                        {formatCurrency(summary.total_costs)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className='font-medium'>
                        Gross Profit
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-bold ${
                          summary.gross_profit >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {formatCurrency(summary.gross_profit)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className='font-medium'>
                        Issues Value
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {formatCurrency(summary.total_issues_value)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className='font-medium'>Write-offs</TableCell>
                      <TableCell className='text-right text-red-600 font-mono'>
                        {formatCurrency(summary.total_write_offs)}
                      </TableCell>
                    </TableRow>
                    <TableRow className='font-bold bg-muted/50'>
                      <TableCell>Transaction Count</TableCell>
                      <TableCell className='text-right font-mono'>
                        {summary.transaction_count}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className='space-y-4'
        >
          <TabsList>
            <TabsTrigger value='transactions'>Transactions</TabsTrigger>
            <TabsTrigger value='department-costs'>Department Costs</TabsTrigger>
            <TabsTrigger value='item-profit'>Item Profit</TabsTrigger>
          </TabsList>

          {/* Transactions Tab */}
          <TabsContent value='transactions'>
            <Card>
              <CardHeader>
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                  <CardTitle>Financial Transactions</CardTitle>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm text-muted-foreground'>Type:</span>
                    <Select
                      value={txnTypeFilter}
                      onValueChange={(value) => {
                        setTxnTypeFilter(value);
                        setTxnPage(1);
                      }}
                    >
                      <SelectTrigger className='w-[150px]'>
                        <SelectValue placeholder='All Types' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>All Types</SelectItem>
                        <SelectItem value='sale'>Sale</SelectItem>
                        <SelectItem value='purchase'>Purchase</SelectItem>
                        <SelectItem value='issue'>Issue</SelectItem>
                        <SelectItem value='return'>Return</SelectItem>
                        <SelectItem value='adjustment'>Adjustment</SelectItem>
                        <SelectItem value='write_off'>Write Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {txnLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : transactions.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    No transactions found for the selected filters.
                  </p>
                ) : (
                  <>
                    <div className='overflow-x-auto'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className='text-right'>
                              Amount
                            </TableHead>
                            <TableHead>Created By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((txn: ImsFinancialTransaction) => {
                            const isCredit =
                              txn.transaction_type === 'sale' ||
                              txn.transaction_type === 'return';
                            return (
                              <TableRow key={txn.id}>
                                <TableCell className='whitespace-nowrap'>
                                  {format(
                                    new Date(txn.created_at),
                                    'dd MMM yyyy'
                                  )}
                                  <br />
                                  <span className='text-xs text-muted-foreground'>
                                    {format(
                                      new Date(txn.created_at),
                                      'hh:mm a'
                                    )}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {getTransactionTypeBadge(
                                    txn.transaction_type
                                  )}
                                </TableCell>
                                <TableCell>
                                  {txn.item ? (
                                    <div>
                                      <p className='font-medium'>
                                        {txn.item.name}
                                      </p>
                                      <p className='text-xs text-muted-foreground'>
                                        {txn.item.code}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className='text-muted-foreground'>
                                      -
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className='max-w-[200px] truncate'>
                                  {txn.description || '-'}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-mono ${
                                    isCredit
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {isCredit ? '+' : '-'}
                                  {formatCurrency(Math.abs(txn.amount))}
                                </TableCell>
                                <TableCell className='text-sm'>
                                  {txn.created_by_profile?.full_name ?? '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    <div className='flex items-center justify-between mt-4'>
                      <p className='text-sm text-muted-foreground'>
                        Showing {(txnPage - 1) * txnLimit + 1} to{' '}
                        {Math.min(txnPage * txnLimit, totalTxnCount)} of{' '}
                        {totalTxnCount} transactions
                      </p>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={txnPage <= 1}
                          onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className='h-4 w-4' />
                          Previous
                        </Button>
                        <span className='text-sm font-medium'>
                          Page {txnPage} of {totalPages}
                        </span>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={txnPage >= totalPages}
                          onClick={() =>
                            setTxnPage((p) => Math.min(totalPages, p + 1))
                          }
                        >
                          Next
                          <ChevronRight className='h-4 w-4' />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Department Costs Tab */}
          <TabsContent value='department-costs'>
            <Card>
              <CardHeader>
                <CardTitle>Department Cost Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {deptCostsLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : !deptCosts || deptCosts.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    No department cost data available.
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead className='text-right'>
                            Issued Value
                          </TableHead>
                          <TableHead className='text-right'>
                            Consumed Value
                          </TableHead>
                          <TableHead className='text-right'>
                            Item Count
                          </TableHead>
                          <TableHead className='text-right'>
                            % of Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptCosts.map((dept: ImsDepartmentCostSummary) => {
                          const deptTotal =
                            dept.total_issued_value + dept.total_consumed_value;
                          const percentage =
                            totalDeptCost > 0
                              ? (deptTotal / totalDeptCost) * 100
                              : 0;
                          return (
                            <TableRow key={dept.department_id}>
                              <TableCell className='font-medium'>
                                {dept.department_name}
                              </TableCell>
                              <TableCell className='text-right font-mono'>
                                {formatCurrency(dept.total_issued_value)}
                              </TableCell>
                              <TableCell className='text-right font-mono'>
                                {formatCurrency(dept.total_consumed_value)}
                              </TableCell>
                              <TableCell className='text-right font-mono'>
                                {dept.item_count}
                              </TableCell>
                              <TableCell className='text-right'>
                                <div className='flex items-center justify-end gap-2'>
                                  <div className='w-16 bg-muted rounded-full h-2'>
                                    <div
                                      className='bg-blue-600 h-2 rounded-full'
                                      style={{
                                        width: `${Math.min(percentage, 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <span className='font-mono text-sm'>
                                    {percentage.toFixed(1)}%
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Total Row */}
                        <TableRow className='font-bold bg-muted/50'>
                          <TableCell>Total</TableCell>
                          <TableCell className='text-right'>
                            {formatCurrency(
                              deptCosts.reduce(
                                (s: number, d: ImsDepartmentCostSummary) =>
                                  s + d.total_issued_value,
                                0
                              )
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {formatCurrency(
                              deptCosts.reduce(
                                (s: number, d: ImsDepartmentCostSummary) =>
                                  s + d.total_consumed_value,
                                0
                              )
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {deptCosts.reduce(
                              (s: number, d: ImsDepartmentCostSummary) =>
                                s + d.item_count,
                              0
                            )}
                          </TableCell>
                          <TableCell className='text-right font-mono'>
                            100.0%
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Item Profit Tab */}
          <TabsContent value='item-profit'>
            <Card>
              <CardHeader>
                <CardTitle>Item Profit Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {itemProfitsLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : !itemProfits || itemProfits.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    No item profit data available.
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead className='text-right'>
                            Qty Sold
                          </TableHead>
                          <TableHead className='text-right'>
                            Revenue
                          </TableHead>
                          <TableHead className='text-right'>
                            Cost
                          </TableHead>
                          <TableHead className='text-right'>Profit</TableHead>
                          <TableHead className='text-right'>
                            Margin %
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemProfits.map((item: ImsItemProfitSummary) => (
                          <TableRow key={item.item_id}>
                            <TableCell className='font-medium'>
                              {item.item_name}
                            </TableCell>
                            <TableCell>
                              <span className='text-xs text-muted-foreground font-mono'>
                                {item.item_code}
                              </span>
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {item.total_sold.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {formatCurrency(item.total_revenue)}
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {formatCurrency(item.total_cost)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono font-bold ${
                                item.profit >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(item.profit)}
                            </TableCell>
                            <TableCell className='text-right'>
                              <Badge
                                variant={
                                  item.margin_percent >= 0
                                    ? 'default'
                                    : 'destructive'
                                }
                                className={
                                  item.margin_percent >= 20
                                    ? 'bg-green-600'
                                    : item.margin_percent >= 0
                                      ? 'bg-yellow-500'
                                      : ''
                                }
                              >
                                {item.margin_percent.toFixed(1)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className='font-bold bg-muted/50'>
                          <TableCell colSpan={2}>Total</TableCell>
                          <TableCell className='text-right'>
                            {itemProfits
                              .reduce(
                                (s: number, i: ImsItemProfitSummary) =>
                                  s + i.total_sold,
                                0
                              )
                              .toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className='text-right'>
                            {formatCurrency(
                              itemProfits.reduce(
                                (s: number, i: ImsItemProfitSummary) =>
                                  s + i.total_revenue,
                                0
                              )
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {formatCurrency(
                              itemProfits.reduce(
                                (s: number, i: ImsItemProfitSummary) =>
                                  s + i.total_cost,
                                0
                              )
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right ${
                              itemProfits.reduce(
                                (s: number, i: ImsItemProfitSummary) =>
                                  s + i.profit,
                                0
                              ) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {formatCurrency(
                              itemProfits.reduce(
                                (s: number, i: ImsItemProfitSummary) =>
                                  s + i.profit,
                                0
                              )
                            )}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
