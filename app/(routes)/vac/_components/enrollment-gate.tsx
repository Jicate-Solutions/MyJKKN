'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { EnrollButton } from './enroll-button';

interface EnrollmentGateProps {
  courseId: string;
  courseName: string;
  courseFee: number;
  userId: string;
  children: React.ReactNode;
  isEnrolled: boolean;
}

export function EnrollmentGate({
  courseId,
  courseName,
  courseFee,
  userId,
  children,
  isEnrolled,
}: EnrollmentGateProps) {
  if (isEnrolled) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content preview */}
      <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <Card className="w-full max-w-sm border-dashed bg-background/80 backdrop-blur-md">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-semibold">Content Locked</h3>
              <p className="text-sm text-muted-foreground">
                Enroll in <span className="font-medium text-foreground">{courseName}</span> to
                access this content.
              </p>
            </div>

            <EnrollButton courseId={courseId} courseFee={courseFee} userId={userId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
