'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsStockLevels,
  useImsExpiringItems,
  useImsStockValuation,
} from '@/hooks/ims/use-ims-reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Package,
  AlertTriangle,
  DollarSign,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { ImsStockValuation } from '@/types/ims';

function getStockStatusBadge(quantity: number, reorderLevel: number, maxLevel?: number) {
  if (quantity <= 0) {
    return <Badge variant='destructive'>Out of Stock</Badge>;
  }
  if (quantity <= reorderLevel) {
    return <Badge variant='destructive' className='bg-orange-500'>Low Stock</Badge>;
  }
  if (maxLevel && quantity > maxLevel) {
    return <Badge variant='secondary'>Overstocked</Badge>;
  }
  return <Badge variant='default' className='bg-green-600'>In Stock</Badge>;
}

function getExpiryStatusBadge(daysLeft: number) {
  if (daysLeft <= 0) {
    return <Badge variant='destructive'>Expired</Badge>;
  }
  if (daysLeft <= 7) {
    return <Badge variant='destructive'>Critical</Badge>;
  }
  if (daysLeft <= 30) {
    return <Badge variant='destructive' className='bg-orange-500'>Expiring Soon</Badge>;
  }
  return <Badge variant='secondary'>OK</Badge>;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

export default function StockReportPage() {
  const [activeTab, setActiveTab] = useState('levels');
  const [expiryDays, setExpiryDays] = useState(60);

  const { isLoading: permissionsLoading } = usePermissions();
  const { storeId, institutionId } = useImsStoreContext();

  const { data: stockLevels, isLoading: stockLoading } = useImsStockLevels(storeId || '', institutionId);
  const { data: expiringItems, isLoading: expiringLoading } = useImsExpiringItems(storeId || '', expiryDays, institutionId);
  const { data: valuation, isLoading: valuationLoading } = useImsStockValuation(storeId || '', institutionId);

  if (permissionsLoading) {
    return (
      <ContentLayout title='Stock Report'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Compute summary stats
  const totalItems = stockLevels?.length ?? 0;
  const stockValue = stockLevels?.reduce((sum: number, item: any) => sum + (item.total_value ?? 0), 0) ?? 0;
  const lowStockCount = stockLevels?.filter((item: any) => {
    const reorder = item.item?.reorder_level ?? 0;
    return item.current_quantity <= reorder && item.current_quantity > 0;
  }).length ?? 0;
  const expiringCount = expiringItems?.length ?? 0;

  const totalValuation = valuation?.reduce((sum: number, v: ImsStockValuation) => sum + v.total_value, 0) ?? 0;

  return (
    <ContentLayout title='Stock Report'>
      <div className='space-y-6'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <div className='flex items-center gap-2 mb-1'>
              <Link href='/ims/reports'>
                <Button variant='ghost' size='sm'>
                  <ArrowLeft className='h-4 w-4 mr-1' />
                  Back to Reports
                </Button>
              </Link>
            </div>
            <h1 className='text-2xl font-bold'>Stock Report</h1>
            <p className='text-muted-foreground'>
              Comprehensive view of inventory levels, expiring items, and stock valuation.
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className='grid gap-4 grid-cols-2 md:grid-cols-4'>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30'>
                  <Package className='h-5 w-5 text-blue-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Total Items</p>
                  <p className='text-2xl font-bold'>
                    {stockLoading ? <BeatLoader size={8} color='#00e902' /> : totalItems}
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
                  <p className='text-sm text-muted-foreground'>Stock Value</p>
                  <p className='text-2xl font-bold'>
                    {stockLoading ? <BeatLoader size={8} color='#00e902' /> : formatCurrency(stockValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30'>
                  <AlertTriangle className='h-5 w-5 text-orange-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Low Stock</p>
                  <p className='text-2xl font-bold'>
                    {stockLoading ? <BeatLoader size={8} color='#00e902' /> : lowStockCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-red-50 dark:bg-red-950/30'>
                  <Clock className='h-5 w-5 text-red-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Expiring ({expiryDays}d)</p>
                  <p className='text-2xl font-bold'>
                    {expiringLoading ? <BeatLoader size={8} color='#00e902' /> : expiringCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className='space-y-4'>
          <TabsList>
            <TabsTrigger value='levels'>Stock Levels</TabsTrigger>
            <TabsTrigger value='expiring'>Expiring Items</TabsTrigger>
            <TabsTrigger value='valuation'>Valuation</TabsTrigger>
          </TabsList>

          {/* Stock Levels Tab */}
          <TabsContent value='levels'>
            <Card>
              <CardHeader>
                <CardTitle>Current Stock Levels</CardTitle>
              </CardHeader>
              <CardContent>
                {stockLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : !stockLevels || stockLevels.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>No stock data available.</p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className='text-right'>Quantity</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className='text-right'>Value</TableHead>
                          <TableHead className='text-right'>Reorder Level</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockLevels.map((stock: any) => {
                          const reorderLevel = stock.item?.reorder_level ?? 0;
                          const maxLevel = stock.item?.max_stock_level ?? 0;
                          return (
                            <TableRow key={stock.id}>
                              <TableCell className='font-medium'>
                                <div>
                                  <p>{stock.item?.name ?? 'Unknown'}</p>
                                  <p className='text-xs text-muted-foreground'>{stock.item?.code ?? ''}</p>
                                </div>
                              </TableCell>
                              <TableCell>{stock.item?.category?.name ?? '-'}</TableCell>
                              <TableCell className='text-right font-mono'>
                                {stock.current_quantity}
                              </TableCell>
                              <TableCell>{stock.item?.base_unit?.abbreviation ?? '-'}</TableCell>
                              <TableCell className='text-right'>{formatCurrency(stock.total_value ?? 0)}</TableCell>
                              <TableCell className='text-right font-mono'>{reorderLevel}</TableCell>
                              <TableCell>
                                {getStockStatusBadge(stock.current_quantity, reorderLevel, maxLevel)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Expiring Items Tab */}
          <TabsContent value='expiring'>
            <Card>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle>Expiring Items</CardTitle>
                  <div className='flex gap-2'>
                    {[30, 60, 90].map((days) => (
                      <Button
                        key={days}
                        variant={expiryDays === days ? 'default' : 'outline'}
                        size='sm'
                        onClick={() => setExpiryDays(days)}
                      >
                        {days} Days
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {expiringLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : !expiringItems || expiringItems.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    No items expiring within {expiryDays} days.
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Batch #</TableHead>
                          <TableHead className='text-right'>Quantity</TableHead>
                          <TableHead>Expiry Date</TableHead>
                          <TableHead className='text-right'>Days Left</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expiringItems.map((item: any, index: number) => (
                          <TableRow key={`${item.item_id}-${item.batch_number}-${index}`}>
                            <TableCell className='font-medium'>
                              <div>
                                <p>{item.item_name}</p>
                                <p className='text-xs text-muted-foreground'>{item.item_code}</p>
                              </div>
                            </TableCell>
                            <TableCell className='font-mono text-sm'>
                              {item.batch_number || '-'}
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {item.quantity}
                            </TableCell>
                            <TableCell>
                              {new Date(item.expiry_date).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {item.days_until_expiry}
                            </TableCell>
                            <TableCell>
                              {getExpiryStatusBadge(item.days_until_expiry)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Valuation Tab */}
          <TabsContent value='valuation'>
            <Card>
              <CardHeader>
                <CardTitle>Stock Valuation by Category</CardTitle>
              </CardHeader>
              <CardContent>
                {valuationLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : !valuation || valuation.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>No valuation data available.</p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className='text-right'>Item Count</TableHead>
                          <TableHead className='text-right'>Total Quantity</TableHead>
                          <TableHead className='text-right'>Value</TableHead>
                          <TableHead className='text-right'>% of Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {valuation.map((v: ImsStockValuation) => (
                          <TableRow key={v.category_id}>
                            <TableCell className='font-medium'>{v.category_name}</TableCell>
                            <TableCell className='text-right font-mono'>{v.item_count}</TableCell>
                            <TableCell className='text-right font-mono'>{v.total_quantity}</TableCell>
                            <TableCell className='text-right'>{formatCurrency(v.total_value)}</TableCell>
                            <TableCell className='text-right font-mono'>
                              {totalValuation > 0
                                ? ((v.total_value / totalValuation) * 100).toFixed(1)
                                : '0.0'}%
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className='font-bold bg-muted/50'>
                          <TableCell>Total</TableCell>
                          <TableCell className='text-right'>
                            {valuation.reduce((s: number, v: ImsStockValuation) => s + v.item_count, 0)}
                          </TableCell>
                          <TableCell className='text-right'>
                            {valuation.reduce((s: number, v: ImsStockValuation) => s + v.total_quantity, 0)}
                          </TableCell>
                          <TableCell className='text-right'>{formatCurrency(totalValuation)}</TableCell>
                          <TableCell className='text-right'>100.0%</TableCell>
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
