'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useIsEnrolled, useEnrollInCourse } from '@/hooks/vac/use-vac';

interface EnrollButtonProps {
  courseId: string;
  courseFee: number;
  userId: string;
}

export function EnrollButton({ courseId, courseFee, userId }: EnrollButtonProps) {
  const { data: isEnrolled, isLoading: checkingEnrollment } = useIsEnrolled(userId, courseId);
  const enrollMutation = useEnrollInCourse();

  const handleEnroll = () => {
    enrollMutation.mutate({
      user_id: userId,
      course_id: courseId,
      payment_amount: courseFee > 0 ? courseFee : undefined,
    });
  };

  if (checkingEnrollment) {
    return (
      <Button disabled variant="outline" className="min-w-[160px]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Checking...
      </Button>
    );
  }

  if (isEnrolled) {
    return (
      <Button
        disabled
        variant="outline"
        className="min-w-[160px] border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400"
      >
        <CheckCircle2 className="mr-2 h-4 w-4" />
        Enrolled
      </Button>
    );
  }

  return (
    <Button
      onClick={handleEnroll}
      disabled={enrollMutation.isPending}
      className="min-w-[160px]"
    >
      {enrollMutation.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Enrolling...
        </>
      ) : courseFee > 0 ? (
        `Enroll Now — ₹${courseFee.toLocaleString('en-IN')}`
      ) : (
        'Enroll Free'
      )}
    </Button>
  );
}
