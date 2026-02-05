/**
 * Create New Process Definition Page
 */

'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useCreateProcessDefinition } from '@/hooks/process-excellence';
import { ProcessDefinitionForm } from '../../_components/process-definition-form';
import type { CreateProcessDefinitionInput } from '@/lib/validations/process-excellence';

export default function NewProcessDefinitionPage() {
  const router = useRouter();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const createDefinition = useCreateProcessDefinition();

  const handleSubmit = async (data: CreateProcessDefinitionInput) => {
    // Transform form input to DTO format for the service
    // Ensure stages have all required fields
    const validatedStages = data.stages.map((stage) => ({
      name: stage.name || '',
      expected_duration_hours: stage.expected_duration_hours || 0,
      is_value_add: stage.is_value_add || false,
      description: stage.description,
      order: stage.order
    }));

    await createDefinition.mutateAsync({
      institution_id: data.institution_id,
      name: data.name,
      category: data.category,
      description: data.description,
      stages: validatedStages,
      target_cycle_time_hours: data.target_cycle_time_hours,
      target_value_add_ratio: data.target_value_add_ratio,
      sla_hours: data.sla_hours,
      is_active: data.is_active
    });
    router.push('/process-excellence/definitions');
  };

  if (!selectedInstitutionId) {
    return (
      <ContentLayout title='Create Process Definition'>
        <Card>
          <CardContent className='py-10 text-center text-muted-foreground'>
            Please select an institution to create a process definition.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Create Process Definition'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Definitions', href: '/process-excellence/definitions' },
          { label: 'New' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Create Process Definition</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Define a new process with stages, SLA targets, and success criteria
          </p>
        </div>

        <ProcessDefinitionForm
          institutionId={selectedInstitutionId}
          onSubmit={handleSubmit}
          isLoading={createDefinition.isPending}
        />
      </div>
    </ContentLayout>
  );
}
