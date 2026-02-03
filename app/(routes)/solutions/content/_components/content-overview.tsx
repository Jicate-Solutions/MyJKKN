'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Video,
  Palette,
  FileText,
  Users,
  Clock,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

export function ContentOverview() {
  const stats = {
    activeOrders: 15,
    inQueue: 24,
    productionLearners: 20,
    completedThisMonth: 45,
  };

  const queueByDivision = [
    { division: 'Video', count: 8, color: 'bg-blue-500' },
    { division: 'Design', count: 10, color: 'bg-purple-500' },
    { division: 'Writing', count: 4, color: 'bg-green-500' },
    { division: 'Animation', count: 2, color: 'bg-orange-500' },
  ];

  const recentDeliverables = [
    {
      id: '1',
      title: 'Promotional Video Edit',
      order: { title: 'Marketing Campaign Q1' },
      division: 'video',
      status: 'in_progress',
      progress: 75,
    },
    {
      id: '2',
      title: 'Social Media Graphics Set',
      order: { title: 'Brand Refresh' },
      division: 'design',
      status: 'review',
      progress: 90,
    },
    {
      id: '3',
      title: 'Product Documentation',
      order: { title: 'New Product Launch' },
      division: 'writing',
      status: 'in_progress',
      progress: 40,
    },
  ];

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

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <Video className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeOrders}</div>
            <p className="text-xs text-muted-foreground">Content orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Queue</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inQueue}</div>
            <p className="text-xs text-muted-foreground">Deliverables pending</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Learners</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.productionLearners}</div>
            <p className="text-xs text-muted-foreground">Production talent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedThisMonth}</div>
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
            <div className="space-y-4">
              {queueByDivision.map((item) => (
                <div key={item.division} className="flex items-center gap-4">
                  <div className="w-20 font-medium">{item.division}</div>
                  <div className="flex-1">
                    <Progress
                      value={(item.count / stats.inQueue) * 100}
                      className="h-2"
                    />
                  </div>
                  <div className="w-8 text-right text-sm font-medium">{item.count}</div>
                </div>
              ))}
            </div>
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
            <div className="space-y-4">
              {recentDeliverables.map((item) => {
                const Icon = divisionIcons[item.division] || FileText;
                const status = statusConfig[item.status];
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
                      <Progress value={item.progress} className="h-1 flex-1" />
                      <span className="text-xs text-muted-foreground">{item.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
