'use client';

import { useRouter } from 'next/navigation';
import {
  Package,
  DollarSign,
  AlertTriangle,
  FileText,
  ShoppingCart,
  TrendingUp,
  Clock,
  XCircle,
  ArrowRight,
  Activity,
  RefreshCw,
  BarChart3,
  PackagePlus,
  ClipboardList,
  Store,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsDashboardStats,
  useImsAlertSummary,
  useImsRecentActivity,
} from '@/hooks/ims/use-ims-reports';
import { useImsLowStockItems } from '@/hooks/ims/use-ims-stock';
import type { ImsRecentActivity, ImsLowStockItem } from '@/types/ims';

function StatCard({
  icon: Icon,
  title,
  value,
  description,
  className,
  iconClassName,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  description?: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconClassName || 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityIcon({ type }: { type: ImsRecentActivity['type'] }) {
  switch (type) {
    case 'sale':
      return <ShoppingCart className="h-4 w-4 text-green-600" />;
    case 'indent':
      return <ClipboardList className="h-4 w-4 text-blue-600" />;
    case 'grn':
      return <PackagePlus className="h-4 w-4 text-purple-600" />;
    case 'issue':
      return <Package className="h-4 w-4 text-orange-600" />;
    case 'approval':
      return <FileText className="h-4 w-4 text-teal-600" />;
    case 'stock_alert':
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function ImsDashboardPage() {
  const router = useRouter();
  const { storeId, institutionId, storeName } = useImsStoreContext();

  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useImsDashboardStats(storeId || '', institutionId);

  const {
    data: alerts,
    isLoading: alertsLoading,
    refetch: refetchAlerts,
  } = useImsAlertSummary(storeId || '', institutionId);

  const {
    data: lowStockItems,
    isLoading: lowStockLoading,
    refetch: refetchLowStock,
  } = useImsLowStockItems(storeId || '', institutionId);

  const {
    data: recentActivity,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useImsRecentActivity(storeId || '', 10, institutionId);

  const isLoading = statsLoading || alertsLoading;

  const handleRefresh = () => {
    refetchStats();
    refetchAlerts();
    refetchLowStock();
    refetchActivity();
  };

  return (
    <ContentLayout title="IMS Dashboard">
      <div className="space-y-6">
        {/* Header with store context pill */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">IMS Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                Inventory management overview and quick actions
              </p>
            </div>
            {storeName && (
              <Badge
                variant="outline"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-primary/30 bg-primary/5"
              >
                <Store className="h-3.5 w-3.5 text-primary" />
                {storeName}
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <BeatLoader color="#6366f1" size={12} />
          </div>
        )}

        {!isLoading && (
          <>
            {/* Primary stat row — 4 key metrics */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Package}
                title="Total Items"
                value={stats?.total_items ?? 0}
                description="Items in inventory catalog"
              />
              <StatCard
                icon={DollarSign}
                title="Stock Value"
                value={formatCurrency(stats?.total_stock_value ?? 0)}
                description="Total value of current stock"
              />
              <StatCard
                icon={ShoppingCart}
                title="Today's Sales"
                value={stats?.today_sales ?? 0}
                description="Transactions today"
              />
              <StatCard
                icon={TrendingUp}
                title="Today's Revenue"
                value={formatCurrency(stats?.today_revenue ?? 0)}
                description="Revenue generated today"
              />
            </div>

            {/* Alert bar — critical info immediately visible */}
            {alerts && (alerts.expired > 0 || alerts.out_of_stock > 0) && (
              <Alert className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800 dark:text-red-300">
                  <strong>Attention Required:</strong>{' '}
                  {alerts.out_of_stock > 0 && (
                    <span>
                      {alerts.out_of_stock} item(s) are out of stock.{' '}
                    </span>
                  )}
                  {alerts.expired > 0 && (
                    <span>
                      {alerts.expired} batch(es) have expired.{' '}
                    </span>
                  )}
                  {alerts.expiring_soon > 0 && (
                    <span>
                      {alerts.expiring_soon} batch(es) expiring soon.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Secondary stat row — stock health indicators */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={AlertTriangle}
                title="Low Stock Alerts"
                value={stats?.low_stock_count ?? 0}
                description="Items below reorder level"
                className={
                  (stats?.low_stock_count ?? 0) > 0
                    ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950'
                    : ''
                }
                iconClassName={
                  (stats?.low_stock_count ?? 0) > 0 ? 'text-orange-600' : undefined
                }
              />
              <StatCard
                icon={Clock}
                title="Expiring Soon"
                value={stats?.expiring_soon_count ?? 0}
                description="Items expiring within 60 days"
                className={
                  (stats?.expiring_soon_count ?? 0) > 0
                    ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'
                    : ''
                }
                iconClassName={
                  (stats?.expiring_soon_count ?? 0) > 0 ? 'text-yellow-600' : undefined
                }
              />
              <StatCard
                icon={XCircle}
                title="Out of Stock"
                value={stats?.out_of_stock_count ?? 0}
                description="Items with zero quantity"
                className={
                  (stats?.out_of_stock_count ?? 0) > 0
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                    : ''
                }
                iconClassName={
                  (stats?.out_of_stock_count ?? 0) > 0 ? 'text-red-600' : undefined
                }
              />
              <StatCard
                icon={FileText}
                title="Pending Indents"
                value={stats?.pending_indents ?? 0}
                description="Awaiting approval"
              />
            </div>

            {/* Two-column layout: Low Stock table + Recent Activity feed */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              {/* Low Stock Alerts */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Low Stock Alerts</CardTitle>
                      <CardDescription>
                        Items below their reorder level
                      </CardDescription>
                    </div>
                    {(alerts?.low_stock ?? 0) > 0 && (
                      <Badge variant="destructive">
                        {alerts?.low_stock} items
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {lowStockLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <BeatLoader color="#6366f1" size={10} />
                    </div>
                  ) : !lowStockItems || lowStockItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p>All items are well-stocked</p>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Current</TableHead>
                            <TableHead className="text-right">Reorder Level</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lowStockItems.slice(0, 8).map((item: ImsLowStockItem) => (
                            <TableRow key={item.item_id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{item.item_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.item_code}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={
                                    item.current_quantity <= 0
                                      ? 'destructive'
                                      : 'outline'
                                  }
                                >
                                  {item.current_quantity} {item.unit_abbreviation}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {item.reorder_level} {item.unit_abbreviation}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {lowStockItems.length > 8 && (
                        <div className="pt-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push('/ims/stock?filter=low_stock')}
                          >
                            View all {lowStockItems.length} items
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Activity</CardTitle>
                  <CardDescription>Latest inventory operations</CardDescription>
                </CardHeader>
                <CardContent>
                  {activityLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <BeatLoader color="#6366f1" size={10} />
                    </div>
                  ) : !recentActivity || recentActivity.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p>No recent activity</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recentActivity.map((activity: ImsRecentActivity) => (
                        <div
                          key={activity.id}
                          className="flex items-start gap-3 pb-3 border-b last:border-b-0 last:pb-0"
                        >
                          <div className="mt-0.5">
                            <ActivityIcon type={activity.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">
                              {activity.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {activity.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {activity.user_name && (
                                <span className="text-xs text-muted-foreground">
                                  {activity.user_name}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(activity.timestamp).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {activity.type.replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions — horizontal row below main content */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
                <CardDescription>Common inventory operations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => router.push('/ims/sales')}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    New Sale
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/ims/indents/new')}
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    New Indent
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/ims/stock/grn/new')}
                  >
                    <PackagePlus className="h-4 w-4 mr-2" />
                    Receive Stock
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/ims/reports')}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    View Reports
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
