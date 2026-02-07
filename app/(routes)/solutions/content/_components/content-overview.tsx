'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Video,
  Palette,
  FileText,
  Users,
  Clock,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import {
  useContentOrders,
  useContentOrderStats,
  useDeliverables,
} from '@/hooks/solutions/use-content';
import { useProductionLearners } from '@/hooks/solutions/use-production-portal';

export function ContentOverview() {
  // Fetch real data from hooks
  const { data: ordersData, isLoading: ordersLoading, error: ordersError } = useContentOrders({ limit: 100 });
  const { data: orderStats, isLoading: statsLoading } = useContentOrderStats();
  const { data: deliverablesData, isLoading: deliverablesLoading } = useDeliverables({ limit: 100 });
  const { data: learnersData, isLoading: learnersLoading } = useProductionLearners({ limit: 100 });

  const isLoading = ordersLoading || statsLoading || deliverablesLoading || learnersLoading;

  // Calculate stats from real data
  // ContentOrder has no 'status' field - count total orders as active
  const activeOrders = ordersData?.metadata?.total || ordersData?.data?.length || 0;
  const inQueue = deliverablesData?.data?.filter(d => d.status === 'pending' || d.status === 'in_progress').length || 0;
  const productionLearners = learnersData?.metadata?.total || learnersData?.data?.length || 0;
  const completedThisMonth = deliverablesData?.data?.filter(d => {
    if (d.status !== 'approved' && d.status !== 'delivered') return false;
    const now = new Date();
    const completedDate = d.approved_at ? new Date(d.approved_at) : null;
    return completedDate &&
      completedDate.getMonth() === now.getMonth() &&
      completedDate.getFullYear() === now.getFullYear();
  }).length || 0;

  // Queue by division - division is on the order, not the deliverable
  const deliverablesByDivision = deliverablesData?.data?.reduce((acc, d) => {
    const division = d.order?.division || 'other';
    if (d.status === 'pending' || d.status === 'in_progress') {
      acc[division] = (acc[division] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>) || {};

  const queueByDivision = [
    { division: 'Video', count: deliverablesByDivision['video'] || 0, color: 'bg-blue-500' },
    { division: 'Design', count: deliverablesByDivision['design'] || 0, color: 'bg-purple-500' },
    { division: 'Writing', count: deliverablesByDivision['writing'] || 0, color: 'bg-green-500' },
    { division: 'Animation', count: deliverablesByDivision['animation'] || 0, color: 'bg-orange-500' },
  ].filter(d => d.count > 0);

  // Recent deliverables in progress
  const recentDeliverables = deliverablesData?.data
    ?.filter(d => d.status === 'in_progress' || d.status === 'review')
    ?.slice(0, 3) || [];

  const divisionIcons: Record<string, React.ElementType> = {
    video: Video,
    design: Palette,
    writing: FileText,
    animation: Video,
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
    in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
    review: { label: 'Review', color: 'bg-blue-100 text-blue-800' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
    delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-800' },
  };

  // Progress estimation by status (ContentDeliverable has no progress_percentage field)
  const statusProgress: Record<string, number> = {
    pending: 0,
    in_progress: 50,
    review: 80,
    revision: 40,
    approved: 100,
    delivered: 100,
    rejected: 0,
  };

  const totalInQueue = queueByDivision.reduce((sum, d) => sum + d.count, 0) || 1; // Avoid division by zero

  return (
    <div className="space-y-6">
      {/* Error State */}
      {ordersError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load content data. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <Video className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{activeOrders}</div>
            )}
            <p className="text-xs text-muted-foreground">Content orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Queue</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            {deliverablesLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{inQueue}</div>
            )}
            <p className="text-xs text-muted-foreground">Deliverables pending</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Learners</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {learnersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{productionLearners}</div>
            )}
            <p className="text-xs text-muted-foreground">Production talent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {deliverablesLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{completedThisMonth}</div>
            )}
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/content/orders">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Content Orders
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>Manage all content orders</CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/content/queue">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Work Queue
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>Deliverables awaiting work</CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/content/production">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Production Learners
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>Manage production talent</CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Queue by Division */}
        <Card>
          <CardHeader>
            <CardTitle>Queue by Division</CardTitle>
            <CardDescription>Deliverables distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {deliverablesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : queueByDivision.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Clock className="mx-auto h-8 w-8 mb-2" />
                <p>No deliverables in queue</p>
              </div>
            ) : (
              <div className="space-y-4">
                {queueByDivision.map((item) => (
                  <div key={item.division} className="flex items-center gap-4">
                    <div className="w-20 font-medium">{item.division}</div>
                    <div className="flex-1">
                      <Progress
                        value={(item.count / totalInQueue) * 100}
                        className="h-2"
                      />
                    </div>
                    <div className="w-8 text-right text-sm font-medium">{item.count}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Deliverables */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Deliverables</CardTitle>
              <CardDescription>Currently in progress</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/solutions/content/queue">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {deliverablesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentDeliverables.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <FileText className="mx-auto h-8 w-8 mb-2" />
                <p>No active deliverables</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentDeliverables.map((item) => {
                  const Icon = divisionIcons[item.order?.division || 'writing'] || FileText;
                  const status = statusConfig[item.status] || statusConfig.pending;
                  const progress = statusProgress[item.status] || 0;
                  return (
                    <div key={item.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{item.title}</span>
                        </div>
                        <Badge className={status.color}>{status.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-1 flex-1" />
                        <span className="text-xs text-muted-foreground">{progress}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
