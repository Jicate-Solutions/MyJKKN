'use client';

// app/(routes)/meetings/[uid]/_components/interview-no-show-buttons.tsx
//
// "Mark as no-show" and its undo (#10). The page only renders these for a
// viewer who may change interview rows; the actions check again regardless.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserX, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markInterviewNoShow, undoInterviewNoShow } from '../interview-no-show-actions';

interface InterviewNoShowButtonsProps {
  interviewId: string;
  status: string;
  meetingEnded: boolean;
}

export function InterviewNoShowButtons({ interviewId, status, meetingEnded }: InterviewNoShowButtonsProps) {
  const [saving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canMark = status === 'scheduled' && meetingEnded;
  const canUndo = status === 'no_show';
  if (!canMark && !canUndo) return null;

  function run(action: (id: string) => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(interviewId);
      if (result.success === false) {
        setError(result.error ?? 'Could not update this interview.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {canMark ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(markInterviewNoShow)}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <UserX className="mr-2 h-4 w-4" aria-hidden />
          )}
          Mark as no-show
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => run(undoInterviewNoShow)} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Undo2 className="mr-2 h-4 w-4" aria-hidden />
          )}
          Undo no-show
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
