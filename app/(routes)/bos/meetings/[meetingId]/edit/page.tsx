'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { MeetingForm, MeetingFormValues } from '../../_components/meeting-form';
import { useUpdateBosMeeting } from '@/hooks/bos/use-bos-meetings';
import { BosMeetingService } from '@/lib/services/bos/bos-meeting-service';
import { BosMeeting } from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

interface EditMeetingPageProps {
  params: Promise<{ meetingId: string }>;
}

export default function EditMeetingPage({ params }: EditMeetingPageProps) {
  const { meetingId } = use(params);
  const router = useRouter();
  const updateMeeting = useUpdateBosMeeting();

  const [meeting, setMeeting] = useState<BosMeeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    BosMeetingService.getMeeting(meetingId)
      .then((data) => {
        if (data.status !== 'draft') {
          toast.error('Only draft meetings can be edited.');
          router.push(`/bos/meetings/${meetingId}`);
          return;
        }
        setMeeting(data);
      })
      .catch((err) => {
        logger.error('academic/bos', 'Failed to load meeting for edit', err);
        toast.error('Meeting not found');
        router.push('/bos/meetings');
      })
      .finally(() => setIsLoading(false));
  }, [meetingId, router]);

  const handleSubmit = async (data: MeetingFormValues) => {
    try {
      await updateMeeting.mutateAsync({ id: meetingId, data });
      toast.success('Meeting updated');
      router.push(`/bos/meetings/${meetingId}`);
    } catch (error) {
      logger.error('academic/bos', 'Failed to update meeting', error);
      toast.error('Failed to update meeting');
    }
  };

  if (isLoading) {
    return (
      <div className='max-w-3xl space-y-4'>
        <Skeleton className='h-10 w-64' />
        <Skeleton className='h-4 w-80' />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-40 w-full' />
        ))}
      </div>
    );
  }

  if (!meeting) return null;

  return (
    <div className='max-w-3xl'>
      <PageHeader
        title='Edit Meeting'
        description={`Meeting #${meeting.meeting_number}/${meeting.academic_year}`}
      />

      <div className='mt-6'>
        <MeetingForm
          meeting={meeting}
          isSubmitting={updateMeeting.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/bos/meetings/${meetingId}`)}
        />
      </div>
    </div>
  );
}
