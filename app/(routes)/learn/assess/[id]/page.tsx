'use client';

import { use, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useAuth } from '@/hooks/use-auth';
import { useAssessmentDetail, useStartAttempt, useSubmitAnswers, useLearnerSubmissions } from '@/hooks/pde/use-pde';
import { QuestionCard } from '../_components/question-card';
import { TimerBar } from '../_components/timer-bar';
import { BeatLoader } from 'react-spinners';
import { ArrowLeft, ArrowRight, CheckCircle2, Send, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SubmissionAnswer, PDEAssessmentQuestion, MCQOption } from '@/types/pde';

export default function AssessmentTakerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: assessmentId } = use(params);
  const router = useRouter();
  const { profile: user } = useAuth();

  const { data: assessment, isLoading } = useAssessmentDetail(assessmentId);
  const { data: prevSubmissions } = useLearnerSubmissions(user?.id, assessmentId);
  const startAttempt = useStartAttempt();
  const submitAnswers = useSubmitAnswers();

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  const questions = assessment?.questions || [];
  const currentQuestion = questions[currentQuestionIdx];
  const attemptsUsed = prevSubmissions?.length || 0;
  const maxAttempts = assessment?.max_attempts || 3;
  const canAttempt = attemptsUsed < maxAttempts;

  // Start attempt
  const handleStart = useCallback(async () => {
    if (!user?.id || !assessmentId) return;
    try {
      const submission = await startAttempt.mutateAsync({
        assessmentId,
        learnerId: user.id,
      });
      setSubmissionId(submission.id);
      setHasStarted(true);
      startTimeRef.current = Date.now();
    } catch {
      // Error is handled by the mutation
    }
  }, [user?.id, assessmentId, startAttempt]);

  // Answer change handler
  const handleAnswerChange = useCallback((questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  // Auto-grade an answer
  const gradeAnswer = useCallback((question: PDEAssessmentQuestion, selectedAnswer: string): SubmissionAnswer => {
    let isCorrect = false;
    if (question.question_type === 'multiple_choice' && question.options) {
      const correctOption = question.options.find((opt: MCQOption) => opt.is_correct);
      isCorrect = correctOption?.text === selectedAnswer;
    } else if (question.question_type === 'true_false') {
      isCorrect = question.correct_answer === selectedAnswer;
    }
    // short_answer gets manual grading (auto_score = 0 for now)
    return {
      question_id: question.id,
      selected_answer: selectedAnswer,
      is_correct: isCorrect,
      points_earned: isCorrect ? question.points : 0,
    };
  }, []);

  // Submit all answers
  const handleSubmit = useCallback(async () => {
    if (!submissionId) return;
    setIsSubmitting(true);
    try {
      const gradedAnswers: SubmissionAnswer[] = questions.map((q) => {
        const selected = answers[q.id] || '';
        return gradeAnswer(q, selected);
      });
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      await submitAnswers.mutateAsync({
        submissionId,
        answers: gradedAnswers,
        timeSpentSeconds: timeSpent,
      });
      router.push(`/learn/assess/${assessmentId}/results?submission=${submissionId}`);
    } catch {
      setIsSubmitting(false);
    }
  }, [submissionId, questions, answers, gradeAnswer, submitAnswers, assessmentId, router]);

  // Time up handler
  const handleTimeUp = useCallback(() => {
    handleSubmit();
  }, [handleSubmit]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hasStarted) return;
      if (e.key === 'ArrowRight' && currentQuestionIdx < questions.length - 1) {
        setCurrentQuestionIdx((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentQuestionIdx > 0) {
        setCurrentQuestionIdx((prev) => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasStarted, currentQuestionIdx, questions.length]);

  if (isLoading) {
    return (
      <ContentLayout title="Assessment">
        <div className="flex justify-center p-12">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!assessment) {
    return (
      <ContentLayout title="Assessment">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Assessment not found.</p>
          <Button variant="outline" onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Pre-start screen
  if (!hasStarted) {
    return (
      <ContentLayout title={assessment.title}>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learn', href: '/vac' },
            { label: 'Assessment' },
          ]}
        />
        <div className="max-w-2xl mx-auto mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{assessment.title}</CardTitle>
              {assessment.description && (
                <p className="text-muted-foreground text-sm mt-1">{assessment.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <span className="text-muted-foreground">Questions</span>
                  <span className="font-medium">{questions.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <span className="text-muted-foreground">Time Limit</span>
                  <span className="font-medium">
                    {assessment.time_limit_minutes ? `${assessment.time_limit_minutes} min` : 'No limit'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <span className="text-muted-foreground">Pass Threshold</span>
                  <span className="font-medium">{assessment.pass_threshold}%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <span className="text-muted-foreground">Attempts</span>
                  <span className="font-medium">{attemptsUsed} / {maxAttempts}</span>
                </div>
              </div>

              {!canAttempt ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600 dark:text-red-400">
                    You have used all {maxAttempts} attempts for this assessment.
                  </span>
                </div>
              ) : (
                <Button onClick={handleStart} className="w-full" size="lg" disabled={startAttempt.isPending}>
                  {startAttempt.isPending ? <BeatLoader color="#fff" size={8} /> : 'Start Assessment'}
                </Button>
              )}

              <Button variant="outline" onClick={() => router.back()} className="w-full">
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // Active assessment
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <ContentLayout title={assessment.title}>
      <div className="space-y-4">
        {/* Timer */}
        {assessment.time_limit_minutes && (
          <TimerBar
            totalMinutes={assessment.time_limit_minutes}
            onTimeUp={handleTimeUp}
          />
        )}

        <div className="flex gap-4">
          {/* Question Navigation Sidebar */}
          <div className="hidden md:block w-16 shrink-0">
            <div className="sticky top-20 space-y-2">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = idx === currentQuestionIdx;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIdx(idx)}
                    className={cn(
                      'w-10 h-10 rounded-full text-sm font-medium flex items-center justify-center transition-all border',
                      isCurrent && 'border-primary bg-primary text-primary-foreground',
                      !isCurrent && isAnswered && 'border-green-500 bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400',
                      !isCurrent && !isAnswered && 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                    )}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Question Area */}
          <div className="flex-1 space-y-4">
            {/* Mobile question nav */}
            <div className="flex md:hidden gap-1 flex-wrap">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = idx === currentQuestionIdx;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIdx(idx)}
                    className={cn(
                      'w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center border',
                      isCurrent && 'border-primary bg-primary text-primary-foreground',
                      !isCurrent && isAnswered && 'border-green-500 bg-green-100 text-green-700 dark:bg-green-950/30',
                      !isCurrent && !isAnswered && 'border-muted-foreground/30 text-muted-foreground'
                    )}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Question Card */}
            {currentQuestion && (
              <QuestionCard
                question={currentQuestion}
                questionNumber={currentQuestionIdx + 1}
                selectedAnswer={answers[currentQuestion.id]}
                onAnswerChange={handleAnswerChange}
              />
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                disabled={currentQuestionIdx === 0}
                onClick={() => setCurrentQuestionIdx((prev) => prev - 1)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>

              <span className="text-sm text-muted-foreground">
                {answeredCount} / {questions.length} answered
              </span>

              {currentQuestionIdx < questions.length - 1 ? (
                <Button
                  onClick={() => setCurrentQuestionIdx((prev) => prev + 1)}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={isSubmitting}>
                      <Send className="h-4 w-4 mr-2" />
                      Submit
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Submit Assessment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {allAnswered ? (
                          <>You have answered all {questions.length} questions. Once submitted, you cannot change your answers.</>
                        ) : (
                          <>You have only answered {answeredCount} of {questions.length} questions. Unanswered questions will be marked incorrect. Continue?</>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Review Answers</AlertDialogCancel>
                      <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit Now'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
