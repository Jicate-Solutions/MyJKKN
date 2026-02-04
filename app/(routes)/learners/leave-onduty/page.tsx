import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  ArrowRight
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Leave & On-Duty | Learners',
  description: 'Apply for leave or on-duty and track your applications',
};

export default async function LearnerLeaveOnDutyPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  return (
    <ContentLayout title="Leave & On-Duty">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/learners/profiles' },
          { label: 'Leave & On-Duty' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Leave & On-Duty</h1>
            <p className="text-sm text-muted-foreground">
              Apply for leave or on-duty and track your applications
            </p>
          </div>
          <Button asChild>
            <Link href="/learners/leave-onduty/apply">
              <Plus className="mr-2 h-4 w-4" />
              Apply Now
            </Link>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2</div>
              <p className="text-xs text-muted-foreground">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8</div>
              <p className="text-xs text-muted-foreground">This semester</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1</div>
              <p className="text-xs text-muted-foreground">This semester</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Days Used</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">5</div>
              <p className="text-xs text-muted-foreground">of 10 allowed</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Apply for Leave/On-Duty
              </CardTitle>
              <CardDescription>
                Submit a new leave or on-duty application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/learners/leave-onduty/apply">
                  Apply Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                My Applications
              </CardTitle>
              <CardDescription>
                View and track all your applications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/learners/leave-onduty/my-applications">
                  View Applications
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Applications */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Applications</CardTitle>
            <CardDescription>Your latest leave and on-duty requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { type: 'Leave', reason: 'Family function', dates: 'Feb 10-11, 2026', days: 2, status: 'pending' },
                { type: 'On-Duty', reason: 'Sports competition', dates: 'Jan 28, 2026', days: 1, status: 'approved' },
                { type: 'Leave', reason: 'Medical checkup', dates: 'Jan 15, 2026', days: 1, status: 'approved' },
                { type: 'On-Duty', reason: 'NSS Camp', dates: 'Jan 5-7, 2026', days: 3, status: 'approved' },
                { type: 'Leave', reason: 'Personal', dates: 'Dec 20, 2025', days: 1, status: 'rejected' },
              ].map((app, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={app.type === 'Leave' ? 'secondary' : 'outline'}>
                        {app.type}
                      </Badge>
                      <span className="font-medium">{app.reason}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {app.dates} • {app.days} day{app.days > 1 ? 's' : ''}
                    </p>
                  </div>
                  <Badge
                    variant={
                      app.status === 'approved' ? 'default' :
                      app.status === 'rejected' ? 'destructive' : 'secondary'
                    }
                    className={
                      app.status === 'approved' ? 'bg-green-100 text-green-700' :
                      app.status === 'rejected' ? '' : 'bg-yellow-100 text-yellow-700'
                    }
                  >
                    {app.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
