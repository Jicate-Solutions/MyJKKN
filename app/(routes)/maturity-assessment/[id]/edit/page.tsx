/**
 * Edit Maturity Assessment Page
 */

import { redirect, notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { getAssessmentById } from '../../_data/get-assessments';
import { AssessmentForm } from '../../_components/assessment-form';
import type { MaturityFramework, MaturityStage } from '@/types/maturity-assessment';

interface EditAssessmentPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAssessmentPage({
  params
}: EditAssessmentPageProps) {
  const { id } = await params;
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/login');
  }

  const assessment = await getAssessmentById(id);

  if (!assessment) {
    notFound();
  }

  // Check permissions
  const isAdmin = profile.role
    ? ['super_admin', 'admin', 'principal', 'hod'].includes(profile.role)
    : false;
  const isOwner = profile.id === assessment.assessor_id;

  if (!isOwner && !isAdmin) {
    redirect(`/maturity-assessment/${id}`);
  }

  // Only draft assessments can be edited
  if (assessment.status !== 'draft') {
    redirect(`/maturity-assessment/${id}`);
  }

  const supabase = await createClient();

  // Get departments for the institution
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('institution_id', assessment.institution_id)
    .eq('is_active', true)
    .order('name');

  const framework = assessment.framework as MaturityFramework;

  return (
    <ContentLayout title="Edit Assessment">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' },
          { label: 'Assessment', href: `/maturity-assessment/${id}` },
          { label: 'Edit', href: `/maturity-assessment/${id}/edit` }
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Edit Assessment</h1>
          <p className="text-sm text-muted-foreground">
            Update your assessment before submitting for review
          </p>
        </div>

        <AssessmentForm
          framework={framework}
          institutionId={assessment.institution_id}
          departments={departments || []}
          existingAssessment={{
            id: assessment.id,
            department_id: assessment.department_id,
            assessment_date: assessment.assessment_date,
            dimension_scores: assessment.dimension_scores as Record<string, MaturityStage>,
            evidence: assessment.evidence,
            improvement_plan: assessment.improvement_plan,
            target_stage: assessment.target_stage,
            target_date: assessment.target_date
          }}
        />
      </div>
    </ContentLayout>
  );
}
