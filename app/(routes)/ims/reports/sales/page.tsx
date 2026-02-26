'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsFinancialSummary,
  useImsItemProfitSummary,
} from '@/hooks/ims/use-ims-financial';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DollarSign,
  TrendingUp,
  CreditCard,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { ImsItemProfitSummary } from '@/types/ims';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

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

export default function SalesReportPage() {
  const [activePreset, setActivePreset] = useState('month');
  const [dateFrom, setDateFrom] = useState(() => getDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getDateRange('month').to);

  const { isLoading: permissionsLoading } = usePermissions();
  const { storeId, institutionId } = useImsStoreContext();

  const { data: summary, isLoading: summaryLoading } = useImsFinancialSummary(
    storeId || '',
    dateFrom,
    dateTo,
    institutionId
  );

  const { data: topItems, isLoading: topItemsLoading } = useImsItemProfitSummary(storeId || '', institutionId);

  const handlePreset = (preset: string) => {
    setActivePreset(preset);
    const range = getDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleCustomDate = () => {
    setActivePreset('custom');
  };

  // Derive sales-related metrics from financial summary
  const totalSales = summary?.transaction_count ?? 0;
  const totalRevenue = summary?.total_revenue ?? 0;
  const totalProfit = summary?.gross_profit ?? 0;
  const avgSaleValue = totalSales > 0 ? totalRevenue / totalSales : 0;

  // Top 5 items sorted by revenue
  const top5Items = useMemo(() => {
    if (!topItems) return [];
    return [...topItems]
      .sort((a: ImsItemProfitSummary, b: ImsItemProfitSummary) => b.total_revenue - a.total_revenue)
      .slice(0, 5);
  }, [topItems]);

  if (permissionsLoading) {
    return (
      <ContentLayout title='Sales Report'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Sales Report'>
      <div className='space-y-6'>
        {/* Header */}
        <div>
          <div className='flex items-center gap-2 mb-1'>
            <Link href='/ims/reports'>
              <Button variant='ghost' size='sm'>
                <ArrowLeft className='h-4 w-4 mr-1' />
                Back to Reports
              </Button>
            </Link>
          </div>
          <h1 className='text-2xl font-bold'>Sales Report</h1>
          <p className='text-muted-foreground'>
            Revenue trends, payment breakdown, and top-selling items.
          </p>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='text-sm font-medium text-muted-foreground'>Period:</span>
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
                  onChange={(e) => { setDateFrom(e.target.value); handleCustomDate(); }}
                  className='w-40'
                />
                <span className='text-muted-foreground'>to</span>
                <Input
                  type='date'
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); handleCustomDate(); }}
                  className='w-40'
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className='grid gap-4 grid-cols-2 md:grid-cols-4'>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30'>
                  <ShoppingCart className='h-5 w-5 text-blue-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Total Sales</p>
                  <p className='text-2xl font-bold'>
                    {summaryLoading ? <BeatLoader size={8} color='#00e902' /> : totalSales}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-green-50 dark:bg-green-950/30'>
                  <DollarSign className='h-5 w-5 text-green-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Revenue</p>
                  <p className='text-2xl font-bold'>
                    {summaryLoading ? <BeatLoader size={8} color='#00e902' /> : formatCurrency(totalRevenue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30'>
                  <TrendingUp className='h-5 w-5 text-purple-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Profit</p>
                  <p className='text-2xl font-bold'>
                    {summaryLoading ? <BeatLoader size={8} color='#00e902' /> : formatCurrency(totalProfit)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30'>
                  <CreditCard className='h-5 w-5 text-orange-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Avg Sale Value</p>
                  <p className='text-2xl font-bold'>
                    {summaryLoading ? <BeatLoader size={8} color='#00e902' /> : formatCurrency(avgSaleValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue and Profit Summary */}
        {/* TODO: Replace this table with a Recharts LineChart when recharts is installed */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue &amp; Cost Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className='flex items-center justify-center py-12'>
                <BeatLoader color='#00e902' />
              </div>
            ) : !summary ? (
              <p className='text-center text-muted-foreground py-8'>No data available for the selected period.</p>
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
                      <TableCell className='font-medium'>Total Revenue</TableCell>
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
                      <TableCell className='font-medium'>Gross Profit</TableCell>
                      <TableCell className='text-right font-mono font-bold'>
                        {formatCurrency(summary.gross_profit)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className='font-medium'>Issues Value</TableCell>
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
                      <TableCell className='text-right font-mono'>{summary.transaction_count}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* TODO: Replace this table with a Recharts PieChart when recharts is installed */}

        {/* Top 5 Selling Items */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Selling Items</CardTitle>
          </CardHeader>
          <CardContent>
            {topItemsLoading ? (
              <div className='flex items-center justify-center py-12'>
                <BeatLoader color='#00e902' />
              </div>
            ) : top5Items.length === 0 ? (
              <p className='text-center text-muted-foreground py-8'>No sales data available.</p>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-12'>Rank</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className='text-right'>Qty Sold</TableHead>
                      <TableHead className='text-right'>Revenue</TableHead>
                      <TableHead className='text-right'>Profit</TableHead>
                      <TableHead className='text-right'>Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top5Items.map((item: ImsItemProfitSummary, index: number) => (
                      <TableRow key={item.item_id}>
                        <TableCell>
                          <Badge variant='outline' className='font-mono'>#{index + 1}</Badge>
                        </TableCell>
                        <TableCell className='font-medium'>
                          <div>
                            <p>{item.item_name}</p>
                            <p className='text-xs text-muted-foreground'>{item.item_code}</p>
                          </div>
                        </TableCell>
                        <TableCell className='text-right font-mono'>{item.total_sold}</TableCell>
                        <TableCell className='text-right'>{formatCurrency(item.total_revenue)}</TableCell>
                        <TableCell className='text-right'>{formatCurrency(item.profit)}</TableCell>
                        <TableCell className='text-right font-mono'>
                          <Badge
                            variant={item.margin_percent >= 20 ? 'default' : 'secondary'}
                            className={item.margin_percent >= 20 ? 'bg-green-600' : ''}
                          >
                            {item.margin_percent.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
