'use client';

// app/(routes)/ai-pulse/admin/quiz/[cycle]/_components/ai-suggest-button.tsx
// Calls POST /api/ai-pulse/quiz/suggest. v1: returns 5 placeholder bilingual
// questions. Champion edits/replaces.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Loader2 } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import {
  useSuggestQuestions,
  type QuizQuestion,
} from '@/lib/services/ai-pulse/quiz-service';

interface AiSuggestButtonProps {
  cycleId: string;
  hasRecording: boolean;
  hasExistingQuestions: boolean;
  onAppend: (questions: QuizQuestion[]) => void;
  onReplace: (questions: QuizQuestion[]) => void;
}

export function AiSuggestButton({
  cycleId,
  hasRecording,
  hasExistingQuestions,
  onAppend,
  onReplace,
}: AiSuggestButtonProps) {
  const [pendingQuestions, setPendingQuestions] = useState<QuizQuestion[] | null>(null);
  const suggest = useSuggestQuestions(cycleId);

  const trigger = async () => {
    try {
      const questions = await suggest.mutateAsync();
      if (questions.length === 0) {
        toast('No suggestions returned', { icon: 'ℹ️' });
        return;
      }

      // If editor is empty, just append directly. Otherwise prompt.
      if (!hasExistingQuestions) {
        onAppend(questions);
        toast.success(`Added ${questions.length} suggested questions`);
        return;
      }

      setPendingQuestions(questions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI suggest failed';
      toast.error(msg);
    }
  };

  const confirmAppend = () => {
    if (!pendingQuestions) return;
    onAppend(pendingQuestions);
    toast.success(`Appended ${pendingQuestions.length} questions`);
    setPendingQuestions(null);
  };

  const confirmReplace = () => {
    if (!pendingQuestions) return;
    onReplace(pendingQuestions);
    toast.success(`Replaced quiz with ${pendingQuestions.length} suggestions`);
    setPendingQuestions(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={trigger}
        disabled={suggest.isPending}
        className="gap-2"
        title={
          hasRecording
            ? 'Generate 5 questions from this cycle\'s recording transcript'
            : 'No recording_url set on this cycle — using placeholder questions for v1'
        }
      >
        {suggest.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            AI-suggest 5 questions
          </>
        )}
      </Button>

      <AlertDialog
        open={!!pendingQuestions}
        onOpenChange={(open) => {
          if (!open) setPendingQuestions(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Add {pendingQuestions?.length ?? 0} AI-suggested questions
            </AlertDialogTitle>
            <AlertDialogDescription>
              You already have {hasExistingQuestions ? 'existing questions' : 'a draft'} in
              the editor. Append the new ones to the end, or replace everything?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmReplace}
            >
              Replace all
            </Button>
            <AlertDialogAction onClick={confirmAppend}>
              Append to end
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
