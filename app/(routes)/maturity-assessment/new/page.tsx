/**
 * New Maturity Assessment Page
 */

import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { AssessmentForm } from '../_components/assessment-form';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import type { MaturityFramework } from '@/types/maturity-assessment';

export default async function NewMaturityAssessmentPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/login');
  }

  // Check role - only staff can create assessments
  if (profile.role && ['student', 'parent'].includes(profile.role)) {
    redirect('/maturity-assessment');
  }

  const institutionId = profile.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="New Assessment">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                You need to be assigned to an institution to create assessments.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const supabase = await createClient();

  // Get or create the framework
  let framework: MaturityFramework | null = null;

  const { data: existingFramework } = await supabase
    .from('maturity_frameworks')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .single();

  if (existingFramework) {
    framework = existingFramework as MaturityFramework;
  } else {
    // Create default framework
    const defaultDimensions = MaturityAssessmentService.getDefaultDimensions();

    const { data: newFramework, error } = await supabase
      .from('maturity_frameworks')
      .insert({
        institution_id: institutionId,
        name: 'Excellence Journey',
        description: 'Based on TQM International Education Excellence Model',
        dimensions: defaultDimensions,
        is_active: true,
        created_by: profile.id
      })
      .select()
      .single();

    if (error) {
      console.error('[NewMaturityAssessmentPage] Error creating framework:', error);
      return (
        <ContentLayout title="New Assessment">
          <div className="flex items-center justify-center min-h-[400px]">
            <Card className="max-w-md">
              <CardContent className="pt-6 text-center">
                <p className="text-red-600">
                  Failed to initialize assessment framework. Please try again.
                </p>
              </CardContent>
            </Card>
          </div>
        </ContentLayout>
      );
    }

    framework = newFramework as MaturityFramework;
  }

  // Get departments for the institution
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('name');

  return (
    <ContentLayout title="New Maturity Assessment">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' },
          { label: 'New Assessment', href: '/maturity-assessment/new' }
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">New Assessment</h1>
          <p className="text-sm text-muted-foreground">
            Conduct a self-assessment to evaluate your current maturity level across 6 dimensions
          </p>
        </div>

        <AssessmentForm
          framework={framework}
          institutionId={institutionId}
          departments={departments || []}
        />
      </div>
    </ContentLayout>
  );
}
