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
  TrendingUp,
  Lightbulb,
  CheckCircle,
  Clock,
  Plus,
  ArrowRight,
  Users
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Process Improvements | Process Excellence',
  description: 'Track and manage process improvement initiatives',
};

export default async function ProcessImprovementsPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Placeholder improvements data
  const improvements = [
    {
      id: '1',
      title: 'Student Registration Automation',
      process: 'Admissions',
      status: 'implemented',
      impact: 'high',
      savings: '40% time reduction',
      owner: 'IT Department',
      date: '2026-01-15',
    },
    {
      id: '2',
      title: 'Digital Fee Collection',
      process: 'Finance',
      status: 'in_progress',
      impact: 'high',
      savings: '60% faster processing',
      owner: 'Finance Team',
      date: '2026-02-01',
    },
    {
      id: '3',
      title: 'Leave Approval Workflow',
      process: 'HR',
      status: 'under_review',
      impact: 'medium',
      savings: '2 days TAT reduction',
      owner: 'HR Department',
      date: '2026-02-03',
    },
    {
      id: '4',
      title: 'Library Book Request Portal',
      process: 'Library',
      status: 'proposed',
      impact: 'low',
      savings: 'Better tracking',
      owner: 'Library Team',
      date: '2026-02-05',
    },
  ];

  const statusColors: Record<string, string> = {
    implemented: 'bg-green-100 text-green-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    under_review: 'bg-blue-100 text-blue-700',
    proposed: 'bg-purple-100 text-purple-700',
  };

  const impactColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-orange-100 text-orange-700',
    low: 'bg-gray-100 text-gray-700',
  };

  return (
    <ContentLayout title="Process Improvements">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Improvements' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Process Improvements</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage continuous improvement initiatives
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Submit Idea
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Implemented</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {improvements.filter(i => i.status === 'implemented').length}
              </div>
              <p className="text-xs text-muted-foreground">This quarter</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {improvements.filter(i => i.status === 'in_progress').length}
              </div>
              <p className="text-xs text-muted-foreground">Active initiatives</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Under Review</CardTitle>
              <Lightbulb className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {improvements.filter(i => i.status === 'under_review').length}
              </div>
              <p className="text-xs text-muted-foreground">Being evaluated</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Proposed</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {improvements.filter(i => i.status === 'proposed').length}
              </div>
              <p className="text-xs text-muted-foreground">New ideas</p>
            </CardContent>
          </Card>
        </div>

        {/* Improvements List */}
        <Card>
          <CardHeader>
            <CardTitle>All Improvements</CardTitle>
            <CardDescription>Track improvement initiatives across processes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {improvements.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      <Badge className={impactColors[item.impact]}>
                        {item.impact} impact
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.process} Process • {item.savings}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{item.owner}</span>
                      <span>•</span>
                      <span>{item.date}</span>
                    </div>
                  </div>
                  <Badge className={statusColors[item.status]}>
                    {item.status.replace('_', ' ')}
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
