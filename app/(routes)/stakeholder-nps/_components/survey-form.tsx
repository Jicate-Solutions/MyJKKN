/**
 * Survey Form Component (Route-specific wrapper)
 * Wraps the shared survey-form component with route-specific logic
 */

'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { SurveyForm as SharedSurveyForm } from '@/components/stakeholder-nps';
import { useCreateNPSSurvey, useUpdateNPSSurvey } from '@/hooks/stakeholder-nps';
import type { CreateSurveyFormValues } from '@/lib/validations/stakeholder-nps';
import type { NPSSurvey } from '@/types/stakeholder-nps';

interface SurveyFormWrapperProps {
  institutionId: string;
  initialData?: NPSSurvey;
  mode?: 'create' | 'edit';
}

export function SurveyFormWrapper({
  institutionId,
  initialData,
  mode = 'create',
}: SurveyFormWrapperProps) {
  const router = useRouter();
  const createMutation = useCreateNPSSurvey();
  const updateMutation = useUpdateNPSSurvey();

  const handleSubmit = async (data: CreateSurveyFormValues) => {
    try {
      if (mode === 'create') {
        // Create new survey
        await createMutation.mutateAsync({
          institution_id: data.institution_id,
          title: data.title,
          description: data.description || undefined,
          stakeholder_types: [data.stakeholder_type],
          question:
            data.questions?.[0]?.question ||
            'How likely are you to recommend our institution to others?',
          start_date: new Date(data.start_date).toISOString(),
          end_date: new Date(data.end_date).toISOString(),
          status: 'draft',
        });
        toast.success('Survey created successfully');
        router.push('/stakeholder-nps/surveys');
      } else if (mode === 'edit' && initialData) {
        // Update existing survey
        await updateMutation.mutateAsync({
          id: initialData.id,
          dto: {
            title: data.title,
            description: data.description || undefined,
            stakeholder_types: [data.stakeholder_type],
            question: data.questions?.[0]?.question,
            start_date: new Date(data.start_date).toISOString(),
            end_date: new Date(data.end_date).toISOString(),
          },
        });
        toast.success('Survey updated successfully');
        router.push(`/stakeholder-nps/surveys/${initialData.id}`);
      }
    } catch (error) {
      console.error('[SurveyFormWrapper] Submit failed:', error);
      toast.error(
        mode === 'create'
          ? 'Failed to create survey'
          : 'Failed to update survey'
      );
      throw error;
    }
  };

  return (
    <SharedSurveyForm
      institutionId={institutionId}
      initialData={initialData}
      onSubmit={handleSubmit}
      loading={createMutation.isPending || updateMutation.isPending}
      mode={mode}
    />
  );
}
