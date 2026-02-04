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
  ClipboardCheck,
  Clock,
  CheckCircle,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Assessments | Maturity Assessment',
  description: 'View and manage organizational maturity assessments',
};

export default async function MaturityAssessmentsPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Placeholder assessments data
  const assessments = [
    {
      id: '1',
      name: 'Q1 2026 Institutional Assessment',
      type: 'Full Assessment',
      status: 'completed',
      score: 78,
      created_at: '2026-01-15',
      completed_at: '2026-01-28',
    },
    {
      id: '2',
      name: 'Digital Transformation Readiness',
      type: 'Focused Assessment',
      status: 'in_progress',
      score: null,
      created_at: '2026-02-01',
      completed_at: null,
    },
    {
      id: '3',
      name: 'Q4 2025 Institutional Assessment',
      type: 'Full Assessment',
      status: 'completed',
      score: 72,
      created_at: '2025-10-10',
      completed_at: '2025-10-25',
    },
    {
      id: '4',
      name: 'Academic Excellence Review',
      type: 'Focused Assessment',
      status: 'completed',
      score: 85,
      created_at: '2025-09-01',
      completed_at: '2025-09-15',
    },
  ];

  return (
    <ContentLayout title="Assessments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' },
          { label: 'Assessments' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Maturity Assessments</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage organizational maturity assessments
            </p>
          </div>
          <Button asChild>
            <Link href="/maturity-assessment/new">
              <Plus className="mr-2 h-4 w-4" />
              New Assessment
            </Link>
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assessments</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{assessments.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {assessments.filter(a => a.status === 'in_progress').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {assessments.filter(a => a.status === 'completed').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Latest Score</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {assessments.find(a => a.status === 'completed')?.score || '-'}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assessments List */}
        <Card>
          <CardHeader>
            <CardTitle>All Assessments</CardTitle>
            <CardDescription>View and manage your maturity assessments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assessments.map((assessment) => (
                <Link
                  key={assessment.id}
                  href={`/maturity-assessment/${assessment.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{assessment.name}</span>
                        <Badge variant="outline">{assessment.type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Started: {format(new Date(assessment.created_at), 'dd MMM yyyy')}
                        {assessment.completed_at && (
                          <> • Completed: {format(new Date(assessment.completed_at), 'dd MMM yyyy')}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {assessment.score !== null && (
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{assessment.score}%</p>
                          <p className="text-xs text-muted-foreground">Score</p>
                        </div>
                      )}
                      <Badge
                        variant={assessment.status === 'completed' ? 'default' : 'secondary'}
                        className={assessment.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}
                      >
                        {assessment.status === 'in_progress' ? 'In Progress' : 'Completed'}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
