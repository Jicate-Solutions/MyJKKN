'use client'

import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Shirt,
  Package,
  Truck,
  AlertTriangle,
  Plus,
  CalendarDays,
  Settings,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useLaundryOrders,
  useLaundryStats,
  useDailyLaundrySchedule,
} from '@/hooks/campus-living/use-laundry'
import type { HostelLaundryOrder } from '@/types/campus-living'

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
  submitted: { label: 'Submitted', variant: 'secondary' },
  collected: { label: 'Collected', variant: 'default' },
  washing: { label: 'Washing', variant: 'outline' },
  ready: { label: 'Ready', variant: 'default' },
  delivered: { label: 'Delivered', variant: 'default' },
  disputed: { label: 'Disputed', variant: 'destructive' },
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'submitted': return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'collected': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'washing': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'ready': return 'bg-green-100 text-green-700 border-green-200'
    case 'delivered': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'disputed': return 'bg-red-100 text-red-700 border-red-200'
    default: return ''
  }
}

export default function LaundryDashboardPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  // JS getDay(): 0=Sun, but our schedule uses 1=Mon...7=Sun
  const jsDow = new Date().getDay()
  const scheduleDow = jsDow === 0 ? 7 : jsDow

  const { data: ordersData, isLoading: ordersLoading } = useLaundryOrders(institutionId)
  const { data: stats, isLoading: statsLoading } = useLaundryStats(institutionId)
  const { data: schedule, isLoading: scheduleLoading } = useDailyLaundrySchedule(institutionId, scheduleDow)

  const isLoading = ordersLoading || statsLoading || scheduleLoading

  if (isLoading) {
    return (
      <ContentLayout title="Laundry Management">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const orders = (ordersData as any)?.data ?? (ordersData ?? [])
  const recentOrders = (orders as HostelLaundryOrder[]).slice(0, 10)
  const activeCount = stats?.by_status
    ? (stats.by_status['submitted'] ?? 0) +
      (stats.by_status['collected'] ?? 0) +
      (stats.by_status['washing'] ?? 0) +
      (stats.by_status['ready'] ?? 0)
    : 0
  const disputeCount = stats?.by_status?.['disputed'] ?? 0
  const collectionsToday = schedule?.collections?.length ?? 0
  const deliveriesToday = schedule?.deliveries?.length ?? 0

  return (
    <ContentLayout title="Laundry Management">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Laundry Management</h1>
            <p className="text-muted-foreground">
              Track laundry orders, schedules, and configurations
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/laundry/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/laundry/orders/new">
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
              <Shirt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCount}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.total ?? 0} total orders
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Today&apos;s Collections</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{collectionsToday}</div>
              <p className="text-xs text-muted-foreground">Blocks scheduled today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Today&apos;s Deliveries</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deliveriesToday}</div>
              <p className="text-xs text-muted-foreground">Blocks scheduled today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Disputes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{disputeCount}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.dispute_rate ?? 0}% dispute rate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/campus-living/laundry/orders/new">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">New Order</h3>
                  <p className="text-sm text-muted-foreground">Create a new laundry order</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/campus-living/laundry/orders">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">View All Orders</h3>
                  <p className="text-sm text-muted-foreground">Browse and filter all orders</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/campus-living/laundry/settings">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Settings className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Settings</h3>
                  <p className="text-sm text-muted-foreground">Configure laundry schedules and vendors</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Orders Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/laundry/orders">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shirt className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No laundry orders yet</p>
                <Button variant="outline" className="mt-3" asChild>
                  <Link href="/campus-living/laundry/orders/new">Create First Order</Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead className="text-center">Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">
                        {order.order_number}
                      </TableCell>
                      <TableCell>{order.learner?.full_name ?? '-'}</TableCell>
                      <TableCell>{order.block?.name ?? '-'}</TableCell>
                      <TableCell className="text-center">{order.total_items}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(order.status)}
                        >
                          {STATUS_BADGE[order.status]?.label ?? order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/campus-living/laundry/orders/${order.id}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  )
}
