'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsDepartmentConsumption,
  useImsItemConsumption,
} from '@/hooks/ims/use-ims-reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  BarChart3,
  Building2,
  Package,
  IndianRupee,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { ImsDepartmentConsumption, ImsItemConsumption } from '@/types/ims';

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

export default function ConsumptionReportPage() {
  const [activeTab, setActiveTab] = useState('department');
  const [activePreset, setActivePreset] = useState('month');
  const [dateFrom, setDateFrom] = useState(() => getDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getDateRange('month').to);

  const { isLoading: permissionsLoading } = usePermissions();
  const { storeId, institutionId } = useImsStoreContext();

  const { data: deptConsumption, isLoading: deptLoading } =
    useImsDepartmentConsumption(storeId || '', dateFrom, dateTo, institutionId);

  const { data: itemConsumption, isLoading: itemLoading } =
    useImsItemConsumption(storeId || '', institutionId);

  const handlePreset = (preset: string) => {
    setActivePreset(preset);
    const range = getDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleCustomDate = () => {
    setActivePreset('custom');
  };

  if (permissionsLoading) {
    return (
      <ContentLayout title='Department Consumption Report'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Summary calculations
  const totalDepartments = deptConsumption?.length ?? 0;
  const totalItemsConsumed =
    deptConsumption?.reduce(
      (sum: number, d: ImsDepartmentConsumption) => sum + d.total_quantity,
      0
    ) ?? 0;
  const totalCost =
    deptConsumption?.reduce(
      (sum: number, d: ImsDepartmentConsumption) => sum + d.total_value,
      0
    ) ?? 0;

  return (
    <ContentLayout title='Department Consumption Report'>
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
          <h1 className='text-2xl font-bold'>Department Consumption Report</h1>
          <p className='text-muted-foreground'>
            Analyze department-wise consumption costs and track the most consumed
            inventory items.
          </p>
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

        {/* Summary Cards */}
        <div className='grid gap-4 grid-cols-1 md:grid-cols-3'>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30'>
                  <Building2 className='h-5 w-5 text-purple-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Total Departments
                  </p>
                  <p className='text-2xl font-bold'>
                    {deptLoading ? (
                      <BeatLoader size={8} color='#00e902' />
                    ) : (
                      totalDepartments
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30'>
                  <Package className='h-5 w-5 text-blue-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Total Items Consumed
                  </p>
                  <p className='text-2xl font-bold'>
                    {deptLoading ? (
                      <BeatLoader size={8} color='#00e902' />
                    ) : (
                      totalItemsConsumed.toLocaleString('en-IN')
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
                  <IndianRupee className='h-5 w-5 text-green-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Total Cost</p>
                  <p className='text-2xl font-bold'>
                    {deptLoading ? (
                      <BeatLoader size={8} color='#00e902' />
                    ) : (
                      formatCurrency(totalCost)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className='space-y-4'
        >
          <TabsList>
            <TabsTrigger value='department'>By Department</TabsTrigger>
            <TabsTrigger value='item'>By Item</TabsTrigger>
          </TabsList>

          {/* By Department Tab */}
          <TabsContent value='department'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <BarChart3 className='h-5 w-5 text-purple-600' />
                  Department Consumption
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deptLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : !deptConsumption || deptConsumption.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    No department consumption data available for the selected
                    period.
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department Name</TableHead>
                          <TableHead className='text-right'>
                            Items Consumed
                          </TableHead>
                          <TableHead className='text-right'>
                            Total Quantity
                          </TableHead>
                          <TableHead className='text-right'>
                            Total Cost
                          </TableHead>
                          <TableHead className='text-right'>
                            % of Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptConsumption.map((dept: ImsDepartmentConsumption) => (
                          <TableRow key={dept.department_id}>
                            <TableCell className='font-medium'>
                              {dept.department_name}
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {dept.total_items}
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {dept.total_quantity.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className='text-right'>
                              {formatCurrency(dept.total_value)}
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='flex items-center justify-end gap-2'>
                                <div className='w-16 bg-muted rounded-full h-2'>
                                  <div
                                    className='bg-purple-600 h-2 rounded-full'
                                    style={{
                                      width: `${totalCost > 0 ? Math.min((dept.total_value / totalCost) * 100, 100) : 0}%`,
                                    }}
                                  />
                                </div>
                                <span className='font-mono text-sm'>
                                  {totalCost > 0
                                    ? (
                                        (dept.total_value / totalCost) *
                                        100
                                      ).toFixed(1)
                                    : '0.0'}
                                  %
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className='font-bold bg-muted/50'>
                          <TableCell>Total</TableCell>
                          <TableCell className='text-right'>
                            {deptConsumption.reduce(
                              (s: number, d: ImsDepartmentConsumption) =>
                                s + d.total_items,
                              0
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {deptConsumption
                              .reduce(
                                (s: number, d: ImsDepartmentConsumption) =>
                                  s + d.total_quantity,
                                0
                              )
                              .toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className='text-right'>
                            {formatCurrency(totalCost)}
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

          {/* By Item Tab */}
          <TabsContent value='item'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Package className='h-5 w-5 text-blue-600' />
                  Item Consumption
                </CardTitle>
              </CardHeader>
              <CardContent>
                {itemLoading ? (
                  <div className='flex items-center justify-center py-12'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : !itemConsumption || itemConsumption.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    No item consumption data available.
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead className='text-right'>
                            Total Consumed
                          </TableHead>
                          <TableHead className='text-right'>
                            Total Cost
                          </TableHead>
                          <TableHead>Departments</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemConsumption.map((item: ImsItemConsumption) => (
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
                              {item.total_quantity.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className='text-right'>
                              {formatCurrency(item.total_value)}
                            </TableCell>
                            <TableCell>
                              <div className='flex flex-wrap gap-1'>
                                {item.departments.length > 0
                                  ? item.departments.map(
                                      (
                                        dept: {
                                          name: string;
                                          quantity: number;
                                        },
                                        idx: number
                                      ) => (
                                        <Badge
                                          key={idx}
                                          variant='secondary'
                                          className='text-xs'
                                        >
                                          {dept.name} ({dept.quantity})
                                        </Badge>
                                      )
                                    )
                                  : <span className='text-muted-foreground text-sm'>-</span>}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className='font-bold bg-muted/50'>
                          <TableCell colSpan={2}>Total</TableCell>
                          <TableCell className='text-right'>
                            {itemConsumption
                              .reduce(
                                (s: number, i: ImsItemConsumption) =>
                                  s + i.total_quantity,
                                0
                              )
                              .toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className='text-right'>
                            {formatCurrency(
                              itemConsumption.reduce(
                                (s: number, i: ImsItemConsumption) =>
                                  s + i.total_value,
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
