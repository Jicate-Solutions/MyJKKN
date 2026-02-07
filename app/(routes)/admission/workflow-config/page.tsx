'use client';

import { AlertCircle, Settings2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useActiveWorkflowConfig,
  useUpsertWorkflowConfig,
} from '@/hooks/admission/use-workflow-config';
import { InstitutionWorkflowForm } from './_components/institution-workflow-form';

export default function WorkflowConfigPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId;

  const { data: config, isLoading, isError, error } = useActiveWorkflowConfig(institutionId);
  const upsertMutation = useUpsertWorkflowConfig();

  if (!institutionId) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Institution</AlertTitle>
          <AlertDescription>Select an institution to configure workflows.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message || 'Failed to load workflow configuration.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5" />
        <div>
          <h1 className="text-xl font-bold">Workflow Configuration</h1>
          <p className="text-xs text-muted-foreground">
            Configure admission stages, documents, quotas, and SLA for this institution
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <InstitutionWorkflowForm
          config={config || null}
          institutionId={institutionId}
          onSave={(data) => upsertMutation.mutate(data)}
          isSaving={upsertMutation.isPending}
        />
      )}
    </div>
  );
}
