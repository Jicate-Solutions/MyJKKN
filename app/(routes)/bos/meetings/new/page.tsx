'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { MeetingForm, MeetingFormValues } from '../_components/meeting-form';
import { useCreateBosMeeting } from '@/hooks/bos/use-bos-meetings';
import { logger } from '@/lib/utils/enhanced-logger';

export default function NewMeetingPage() {
  const router = useRouter();
  const createMeeting = useCreateBosMeeting();

  const handleSubmit = async (data: MeetingFormValues) => {
    try {
      const created = await createMeeting.mutateAsync(data as any);
      toast.success('Meeting scheduled successfully');
      router.push(`/bos/meetings/${created.id}`);
    } catch (error) {
      logger.error('academic/bos', 'Failed to schedule meeting', error);
      toast.error((error as Error).message || 'Failed to schedule meeting');
    }
  };

  return (
    <div className='max-w-3xl'>
      <PageHeader
        title='Schedule Meeting'
        description='Create a new Board of Studies meeting.'
      />

      <div className='mt-6'>
        <MeetingForm
          isSubmitting={createMeeting.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/bos/meetings')}
        />
      </div>
    </div>
  );
}
