/**
 * Process Definition Detail Page - Server Component
 * Process Excellence Module: Display process definition details
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ProcessDefinitionDetail } from '../../_components/process-definition-detail';

interface ProcessDefinitionPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProcessDefinitionPage({ params }: ProcessDefinitionPageProps) {
  const { id } = await params;

  // Get user profile
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Fetch process definition
  let definition;
  try {
    definition = await ProcessExcellenceService.getProcessDefinition(id, profile.institution_id);
  } catch (error) {
    console.error('[process-excellence] Error fetching definition:', error);
    notFound();
  }

  // Security check - verify institution access
  if (definition.institution_id !== profile.institution_id) {
    notFound();
  }

  return (
    <ContentLayout title={definition.name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Definitions', href: '/process-excellence/definitions' },
          { label: definition.name, href: `/process-excellence/definitions/${id}` }
        ]}
      />

      <div className="mt-6">
        <ProcessDefinitionDetail definition={definition} />
      </div>
    </ContentLayout>
  );
}
