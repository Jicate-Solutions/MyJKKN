import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  Users
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Grievance Analytics | TQM',
  description: 'Analyze grievance trends and performance metrics',
};

export default async function GrievanceAnalyticsPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  const isStaff = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  if (!isStaff) {
    redirect('/grievance');
  }

  return (
    <ContentLayout title="Grievance Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: 'Analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Grievance Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track trends, identify patterns, and improve resolution rates
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">234</div>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                12% from last month
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">87%</div>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                5% improvement
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Resolution Time</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">18h</div>
              <div className="flex items-center text-xs text-red-600">
                <TrendingDown className="h-3 w-3 mr-1" />
                2h slower this week
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">92%</div>
              <p className="text-xs text-muted-foreground">Target: 95%</p>
            </CardContent>
          </Card>
        </div>

        {/* Trends by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Tickets by Category</CardTitle>
            <CardDescription>Distribution of grievances across categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { category: 'Academic', count: 78, percentage: 33, trend: 'up' },
                { category: 'Infrastructure', count: 56, percentage: 24, trend: 'down' },
                { category: 'Administrative', count: 45, percentage: 19, trend: 'up' },
                { category: 'Faculty', count: 32, percentage: 14, trend: 'stable' },
                { category: 'Others', count: 23, percentage: 10, trend: 'down' },
              ].map((cat, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-32 font-medium">{cat.category}</div>
                  <div className="flex-1">
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm">{cat.count}</div>
                  <Badge
                    variant={cat.trend === 'up' ? 'default' : cat.trend === 'down' ? 'secondary' : 'outline'}
                    className="w-16 justify-center"
                  >
                    {cat.trend === 'up' ? '↑' : cat.trend === 'down' ? '↓' : '→'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Performance by Handler */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Handler Performance
            </CardTitle>
            <CardDescription>Resolution metrics by assigned staff</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Dr. Kumar', resolved: 45, avgTime: '12h', satisfaction: 4.5 },
                { name: 'Prof. Sharma', resolved: 38, avgTime: '16h', satisfaction: 4.2 },
                { name: 'Ms. Priya', resolved: 32, avgTime: '14h', satisfaction: 4.4 },
                { name: 'Mr. Rajan', resolved: 28, avgTime: '20h', satisfaction: 3.9 },
              ].map((handler, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium">{handler.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {handler.resolved} resolved • Avg {handler.avgTime}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">★ {handler.satisfaction}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
