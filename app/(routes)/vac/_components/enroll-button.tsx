'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useEnrollInCourse } from '@/hooks/vac/use-vac';
import { useToast } from '@/hooks/use-toast';
import { Loader2, BookOpen, CheckCircle } from 'lucide-react';
import type { VACCourse } from '@/types/vac';

interface EnrollButtonProps {
  course: VACCourse;
  userId: string;
  isEnrolled: boolean;
  onEnrollSuccess?: () => void;
}

export function EnrollButton({
  course,
  userId,
  isEnrolled,
  onEnrollSuccess,
}: EnrollButtonProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const enrollMutation = useEnrollInCourse();

  const handleEnroll = async () => {
    try {
      await enrollMutation.mutateAsync({
        userId,
        courseId: course.id,
        formData: {
          // For free courses, mark as waived
          payment_status: course.fee === 0 ? 'waived' : 'pending',
          payment_amount: course.fee,
        },
      });

      toast({
        title: 'Enrolled successfully!',
        description: `You are now enrolled in ${course.name}`,
      });

      setOpen(false);
      onEnrollSuccess?.();
    } catch (error) {
      toast({
        title: 'Enrollment failed',
        description:
          error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  if (isEnrolled) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <CheckCircle className="h-4 w-4 text-green-600" />
        Enrolled
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button className="gap-2">
          <BookOpen className="h-4 w-4" />
          Enroll Now
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enroll in {course.name}?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              You are about to enroll in this {course.duration_hours}-hour course.
            </p>
            {course.fee > 0 ? (
              <p className="font-medium text-foreground">
                Course fee: Rs. {course.fee.toLocaleString()}
              </p>
            ) : (
              <p className="font-medium text-green-600">
                This course is free!
              </p>
            )}
            <p className="text-sm">
              After enrollment, you will have access to all course content.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEnroll}
            disabled={enrollMutation.isPending}
          >
            {enrollMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Confirm Enrollment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
