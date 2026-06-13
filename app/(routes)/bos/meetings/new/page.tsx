'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MeetingForm, MeetingFormValues } from '../_components/meeting-form';
import { useCreateBosMeeting } from '@/hooks/bos/use-bos-meetings';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { logger } from '@/lib/utils/enhanced-logger';

export default function NewMeetingPage() {
  const router = useRouter();
  const createMeeting = useCreateBosMeeting();
  const scope = useBosBoardScope();

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

  if (scope.isLoading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-10 w-64' />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  // Only the board chairman (or super-admin) can schedule a new meeting.
  const canSchedule = scope.isSuperAdmin || scope.isChairmanIn.size > 0;

  if (!canSchedule) {
    return (
      <div>
        <PageHeader
          title='Schedule Meeting'
          description='Create a new Board of Studies meeting.'
        />
        <Alert variant='destructive' className='mt-6 max-w-2xl'>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle>Chairman access required</AlertTitle>
          <AlertDescription className='space-y-3'>
            <p>
              Only the board chairman can schedule a Board of Studies meeting.
              Your account is not listed as a chairman in any active composition.
            </p>
            <Button variant='outline' size='sm' onClick={() => router.push('/bos/meetings')}>
              Back to meetings
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title='Schedule Meeting'
        description='Create a new Board of Studies meeting.'
      />

      <div className='mt-4'>
        <MeetingForm
          isSubmitting={createMeeting.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/bos/meetings')}
        />
      </div>
    </div>
  );
}
