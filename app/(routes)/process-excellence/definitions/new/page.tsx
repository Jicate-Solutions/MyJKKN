/**
 * Create New Process Definition Page
 */

'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { ProcessDefinitionForm } from '../../_components/process-definition-form';

export default function NewProcessDefinitionPage() {
  const router = useRouter();
  const { selectedInstitutionId } = useUserInstitutionAccess();

  const handleSuccess = () => {
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
          onSuccess={handleSuccess}
          onCancel={() => router.back()}
        />
      </div>
    </ContentLayout>
  );
}
