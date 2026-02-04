'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, BookOpen, LogIn } from 'lucide-react';
import { EnrollButton } from './enroll-button';
import type { VACCourse } from '@/types/vac';

interface EnrollmentGateProps {
  course: VACCourse;
  userId?: string;
  isEnrolled: boolean;
  children: React.ReactNode;
  onEnrollSuccess?: () => void;
}

/**
 * Wraps content and gates access behind enrollment
 * Shows enrollment CTA if user is not enrolled
 */
export function EnrollmentGate({
  course,
  userId,
  isEnrolled,
  children,
  onEnrollSuccess,
}: EnrollmentGateProps) {
  // If enrolled, show the content
  if (isEnrolled) {
    return <>{children}</>;
  }

  // Not logged in
  if (!userId) {
    return (
      <Card className="max-w-lg mx-auto my-12">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <LogIn className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Sign in to access this content</CardTitle>
          <CardDescription>
            You need to be logged in to view course lessons.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/auth/login">
            <Button>Sign In</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Not enrolled - show enrollment CTA
  return (
    <Card className="max-w-lg mx-auto my-12">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-6 w-6 text-amber-600" />
        </div>
        <CardTitle>Enrollment Required</CardTitle>
        <CardDescription className="space-y-2">
          <p>You need to enroll in this course to access the content.</p>
          {course.fee > 0 ? (
            <p className="font-medium text-foreground">
              Course fee: Rs. {course.fee.toLocaleString()}
            </p>
          ) : (
            <p className="font-medium text-green-600">This course is free!</p>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="text-sm text-muted-foreground">
          <BookOpen className="inline h-4 w-4 mr-1" />
          {course.duration_hours} hours | {course.weeks} weeks
        </div>
        <EnrollButton
          course={course}
          userId={userId}
          isEnrolled={false}
          onEnrollSuccess={onEnrollSuccess}
        />
        <p className="text-xs text-muted-foreground">
          After enrollment, you&apos;ll have full access to all lessons.
        </p>
      </CardContent>
    </Card>
  );
}
