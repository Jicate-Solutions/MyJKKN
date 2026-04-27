'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsDashboardStats } from '@/hooks/ims/use-ims-reports';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import {
  Package,
  ShoppingCart,
  FileText,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Box,
  IndianRupee,
} from 'lucide-react';

export default function ImsReportsPage() {
  const router = useRouter();
  const {
    canAccess,
    isLoading: permissionsLoading,
  } = usePermissions();
  const { storeId, institutionId, isSuperAdmin } = useImsStoreContext();

  const { data: stats, isLoading: statsLoading } = useImsDashboardStats(storeId || '', institutionId);

  if (permissionsLoading) {
    return (
      <ContentLayout title='IMS Reports'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  const reportCategories = [
    {
      title: 'Stock Reports',
      description: 'Monitor inventory levels, track expiring items, and review stock valuation across your stores.',
      icon: Package,
      href: '/ims/reports/stock',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      features: [
        'Current stock levels by item and category',
        'Items expiring within configurable timeframe',
        'Stock valuation by category',
      ],
    },
    {
      title: 'Sales Reports',
      description: 'Analyze revenue trends, payment method breakdown, and identify your best-selling items.',
      icon: ShoppingCart,
      href: '/ims/reports/sales',
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      features: [
        'Daily revenue and profit trends',
        'Payment method breakdown',
        'Top 5 selling items by revenue',
      ],
    },
    {
      title: 'Indent Reports',
      description: 'Track indent request status distribution and analyze department-wise requisition patterns.',
      icon: FileText,
      href: '/ims/reports/indents',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30',
      features: [
        'Status distribution (Pending, Approved, Rejected, etc.)',
        'Department-wise indent analysis',
        'Approval and completion rate metrics',
      ],
    },
    {
      title: 'Consumption Reports',
      description: 'Review department-wise consumption costs and track the most consumed inventory items.',
      icon: BarChart3,
      href: '/ims/reports/consumption',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30',
      features: [
        'Department consumption breakdown by value',
        'Top consumed items with department distribution',
        'Date range filtering for period analysis',
      ],
    },
    {
      title: 'UPI Audit Report',
      description: 'Reconcile UPI QR code payments against bank statements. Track transaction refs for daily cash reconciliation.',
      icon: IndianRupee,
      href: '/ims/reports/upi',
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-950/30',
      features: [
        'All UPI QR transactions with bank reference IDs',
        'Daily/weekly/monthly collection totals',
        'Cashier-wise UPI payment audit trail',
      ],
    },
  ];

  return (
    <ContentLayout title='IMS Reports'>
      <div className='space-y-6'>
        {/* Page Header */}
        <div>
          <h1 className='text-2xl font-bold'>IMS Reports</h1>
          <p className='text-muted-foreground'>
            Comprehensive reporting and analytics for your inventory management.
          </p>
        </div>

        {/* Quick Stats */}
        {statsLoading ? (
          <div className='flex items-center justify-center py-8'>
            <BeatLoader color='#00e902' size={10} />
          </div>
        ) : stats ? (
          <div className='grid gap-4 grid-cols-2 md:grid-cols-4'>
            <Card>
              <CardContent className='pt-6'>
                <div className='flex items-center gap-3'>
                  <div className='p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30'>
                    <Box className='h-5 w-5 text-blue-600' />
                  </div>
                  <div>
                    <p className='text-sm text-muted-foreground'>Total Items</p>
                    <p className='text-2xl font-bold'>{stats.total_items}</p>
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
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(stats.total_stock_value)}
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
                    <p className='text-2xl font-bold'>{stats.low_stock_count}</p>
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
                    <p className='text-sm text-muted-foreground'>Today&apos;s Revenue</p>
                    <p className='text-2xl font-bold'>
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(stats.today_revenue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Report Category Cards - 2x2 Grid */}
        <div className='grid gap-6 md:grid-cols-2'>
          {reportCategories.map((category) => {
            const Icon = category.icon;
            return (
              <Card key={category.title} className='flex flex-col'>
                <CardHeader>
                  <div className='flex items-center gap-3'>
                    <div className={`p-3 rounded-lg ${category.bgColor}`}>
                      <Icon className={`h-6 w-6 ${category.color}`} />
                    </div>
                    <div>
                      <CardTitle className='text-lg'>{category.title}</CardTitle>
                    </div>
                  </div>
                  <CardDescription className='mt-2'>
                    {category.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex-1'>
                  <ul className='space-y-2'>
                    {category.features.map((feature, idx) => (
                      <li key={idx} className='flex items-start gap-2 text-sm text-muted-foreground'>
                        <span className='mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0' />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className='w-full'
                    onClick={() => router.push(category.href)}
                  >
                    View Report
                    <ArrowRight className='ml-2 h-4 w-4' />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </ContentLayout>
  );
}
