/**
 * Maturity Assessment Detail Page
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Edit, Send, CheckCircle, ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { getAssessmentById } from '../_data/get-assessments';
import { MaturityStageBadge, MaturityScoreCircle } from '../_components/maturity-stage-badge';
import { MaturityRadarChart } from '../_components/maturity-radar-chart';
import { ProgressTracker } from '../_components/progress-tracker';
import { AssessmentActionsClient } from './_components/assessment-actions-client';
import type { AssessmentStatus, MaturityDimensionName, MaturityStage } from '@/types/maturity-assessment';
import { MATURITY_STAGE_NAMES, MATURITY_DIMENSIONS } from '@/types/maturity-assessment';

interface AssessmentDetailPageProps {
  params: Promise<{ id: string }>;
}

const statusColors: Record<AssessmentStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-500'
};

export default async function AssessmentDetailPage({
  params
}: AssessmentDetailPageProps) {
  const { id } = await params;
  const { profile } = await getEnhancedUserProfile();

  const assessment = await getAssessmentById(id);

  if (!assessment) {
    notFound();
  }

  const isAdmin = profile?.role
    ? ['super_admin', 'admin', 'principal', 'hod'].includes(profile.role)
    : false;

  const isOwner = profile?.id === assessment.assessor_id;
  const canEdit = (isOwner || isAdmin) && assessment.status === 'draft';
  const canSubmit = isOwner && assessment.status === 'draft';
  const canApprove = isAdmin && assessment.status === 'submitted';

  const dimensionScores = assessment.dimension_scores as Record<
    MaturityDimensionName,
    MaturityStage
  >;

  // Get framework dimensions for criteria display
  const frameworkDimensions = (assessment.framework?.dimensions || []) as Array<{
    name: string;
    description: string;
    stage_1_criteria: string;
    stage_2_criteria: string;
    stage_3_criteria: string;
    stage_4_criteria: string;
  }>;

  return (
    <ContentLayout title="Assessment Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' },
          { label: 'Assessment Details', href: `/maturity-assessment/${id}` }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/maturity-assessment">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Link>
              </Button>
            </div>
            <h1 className="text-2xl font-bold py-1">
              {assessment.department?.name || 'Institution-wide'} Assessment
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge className={statusColors[assessment.status]}>
                {assessment.status.charAt(0).toUpperCase() +
                  assessment.status.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {format(new Date(assessment.assessment_date), 'MMMM d, yyyy')}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" asChild>
                <Link href={`/maturity-assessment/${id}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
            )}
            <AssessmentActionsClient
              assessmentId={id}
              status={assessment.status}
              canSubmit={canSubmit}
              canApprove={canApprove}
              reviewerId={profile?.id}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overall Score Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Overall Maturity Stage
                    </p>
                    <div className="text-3xl font-bold">
                      Stage {assessment.overall_stage}:{' '}
                      {MATURITY_STAGE_NAMES[assessment.overall_stage]}
                    </div>
                    {assessment.target_stage && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Target: Stage {assessment.target_stage} by{' '}
                        {assessment.target_date
                          ? format(new Date(assessment.target_date), 'MMM yyyy')
                          : 'TBD'}
                      </p>
                    )}
                  </div>
                  <MaturityScoreCircle stage={assessment.overall_stage} size="lg" />
                </div>
              </CardContent>
            </Card>

            {/* Dimension Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Dimension Scores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {MATURITY_DIMENSIONS.map((dimension) => {
                  const score = dimensionScores[dimension] || 1;
                  const frameworkDim = frameworkDimensions.find(
                    (d) => d.name === dimension
                  );
                  const criteriaKey = `stage_${score}_criteria` as keyof typeof frameworkDim;
                  const criteria = frameworkDim?.[criteriaKey] || '';

                  return (
                    <div
                      key={dimension}
                      className="flex items-start justify-between p-4 rounded-lg bg-muted/30"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{dimension}</span>
                          <MaturityStageBadge stage={score} size="sm" showLabel={false} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {frameworkDim?.description}
                        </p>
                        {criteria && (
                          <p className="text-sm mt-2 p-2 bg-background rounded border">
                            <span className="font-medium">Current Level:</span> {criteria}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Evidence */}
            {assessment.evidence && (
              <Card>
                <CardHeader>
                  <CardTitle>Supporting Evidence</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{assessment.evidence}</p>
                </CardContent>
              </Card>
            )}

            {/* Improvement Plan */}
            {assessment.improvement_plan && (
              <Card>
                <CardHeader>
                  <CardTitle>Improvement Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{assessment.improvement_plan}</p>
                </CardContent>
              </Card>
            )}

            {/* Progress Tracker */}
            <ProgressTracker
              assessmentId={id}
              isReadOnly={assessment.status === 'archived'}
            />
          </div>

          {/* Right Column - Radar Chart & Meta */}
          <div className="space-y-6">
            <MaturityRadarChart
              dimensionScores={dimensionScores}
              targetStage={assessment.target_stage}
              title="Dimension Overview"
              showLegend={false}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assessment Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Assessor:</span>
                  <p className="font-medium">
                    {assessment.assessor?.full_name || 'Unknown'}
                  </p>
                </div>
                <Separator />
                <div>
                  <span className="text-muted-foreground">Framework:</span>
                  <p className="font-medium">{assessment.framework?.name}</p>
                </div>
                <Separator />
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p className="font-medium">
                    {format(new Date(assessment.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                {assessment.reviewed_by && assessment.reviewed_at && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Reviewed by:</span>
                      <p className="font-medium">
                        {assessment.reviewer?.full_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(assessment.reviewed_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
