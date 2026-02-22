'use client';

import Link from 'next/link';
import { Loader2, Plus, ClipboardCheck, Clock, CheckCircle, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useMaturityAssessments } from '@/hooks/maturity-assessment/use-maturity-assessments';
import type { AssessmentStatus } from '@/types/maturity-assessment';

const statusColors: Record<AssessmentStatus, { bg: string; label: string }> = {
  draft: { bg: 'bg-gray-100 text-gray-700', label: 'Draft' },
  submitted: { bg: 'bg-yellow-100 text-yellow-700', label: 'Submitted' },
  approved: { bg: 'bg-green-100 text-green-700', label: 'Approved' },
  archived: { bg: 'bg-gray-100 text-gray-500', label: 'Archived' },
};

export default function MaturityAssessmentsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const {
    assessments,
    loading,
    error,
    metadata,
  } = useMaturityAssessments({
    institution_id: institutionId || '',
    page: 1,
    limit: 50,
  });

  if (!institutionId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              You need to be assigned to an institution to access maturity assessments.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-600">Failed to load assessments. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats from real data
  const totalAssessments = metadata.total;
  const inProgressCount = assessments.filter(
    (a) => a.status === 'draft' || a.status === 'submitted'
  ).length;
  const completedCount = assessments.filter(
    (a) => a.status === 'approved'
  ).length;
  const latestApproved = assessments.find((a) => a.status === 'approved');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold py-1">All Assessments</h2>
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
            <div className="text-2xl font-bold">{totalAssessments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Stage</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestApproved ? `Stage ${latestApproved.overall_stage}` : '-'}
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
          {assessments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No assessments found.</p>
              <p className="text-sm mt-2">
                Create your first assessment to start tracking organizational maturity.
              </p>
              <Button asChild className="mt-4">
                <Link href="/maturity-assessment/new">Create First Assessment</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {assessments.map((assessment) => {
                const deptName =
                  assessment.department?.department_name ||
                  null;
                const statusInfo = statusColors[assessment.status] || statusColors.draft;

                return (
                  <Link
                    key={assessment.id}
                    href={`/maturity-assessment/${assessment.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {deptName || 'Institution-wide'} Assessment
                          </span>
                          <Badge variant="outline">
                            Stage {assessment.overall_stage}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Date: {format(new Date(assessment.assessment_date), 'dd MMM yyyy')}
                          {(assessment as any).assessor?.full_name && (
                            <> &middot; By: {(assessment as any).assessor.full_name}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            {assessment.overall_stage}
                          </p>
                          <p className="text-xs text-muted-foreground">Stage</p>
                        </div>
                        <Badge className={statusInfo.bg}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
