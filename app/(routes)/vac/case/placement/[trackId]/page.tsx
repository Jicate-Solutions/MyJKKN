'use client';

import { use, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/use-auth';
import {
  useCASETrack,
  usePlacementQuestions,
  useSubmitPlacement,
} from '@/hooks/vac/use-case';
import type { PlacementQuestion, PlacementResult } from '@/types/case';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Brain,
  Target,
  GraduationCap,
  AlertCircle,
} from 'lucide-react';

// ── Difficulty badge colors ────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, string> = {
  basic: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

// ── Results Screen ─────────────────────────────────────────────────────────

function ResultsScreen({
  result,
  trackId,
  trackName,
}: {
  result: { placement: PlacementResult };
  trackId: string;
  trackName: string;
}) {
  const router = useRouter();
  const { placement } = result;
  const scorePct = placement.score;
  const isGood = scorePct >= 70;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div
            className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto ${
              isGood
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-amber-100 dark:bg-amber-900/30'
            }`}
          >
            {isGood ? (
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            ) : (
              <Target className="h-10 w-10 text-amber-600" />
            )}
          </div>

          <h2 className="text-2xl font-bold">Placement Complete!</h2>
          <p className="text-muted-foreground">{trackName}</p>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1">
              <p className="text-3xl font-bold text-primary">{scorePct}%</p>
              <p className="text-xs text-muted-foreground">Score</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold text-primary">
                {placement.correct_count}/{placement.total_questions}
              </p>
              <p className="text-xs text-muted-foreground">Correct</p>
            </div>
          </div>

          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium">
              Starting at Week {placement.start_week}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {placement.start_week === 1
                ? 'You will start from the beginning of the track.'
                : `Based on your score, you can skip ahead to week ${placement.start_week}.`}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push('/vac/case')}
            >
              Back to CASE
            </Button>
            <Button
              className="flex-1"
              onClick={() => router.push('/vac/case')}
            >
              <GraduationCap className="h-4 w-4 mr-2" />
              Start Course
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function PlacementTestPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id || '';

  const { data: track, isLoading: trackLoading } = useCASETrack(trackId);
  const trackCode = (track as { track_code: string } | undefined)?.track_code || '';
  const { data: questions, isLoading: questionsLoading } = usePlacementQuestions(trackCode);
  const submitPlacement = useSubmitPlacement();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [placementResult, setPlacementResult] = useState<{ placement: PlacementResult } | null>(null);

  const questionList = useMemo(() => {
    if (!questions || !Array.isArray(questions)) return [];
    return questions as PlacementQuestion[];
  }, [questions]);

  const totalQuestions = questionList.length;
  const current = questionList[currentQuestion];
  const isLastQuestion = currentQuestion === totalQuestions - 1;
  const hasAnsweredCurrent = current ? !!answers[current.id] : false;
  const progressPct = totalQuestions > 0 ? ((currentQuestion + 1) / totalQuestions) * 100 : 0;

  const handleSelectAnswer = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    []
  );

  const handleNext = useCallback(() => {
    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion((prev) => prev + 1);
    }
  }, [currentQuestion, totalQuestions]);

  const handlePrev = useCallback(() => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    }
  }, [currentQuestion]);

  const handleSubmit = useCallback(() => {
    if (!userId || !trackId) return;

    const formattedAnswers = questionList.map((q) => ({
      question_id: q.id,
      selected_answer: answers[q.id] || '',
    }));

    submitPlacement.mutate(
      { userId, trackId, answers: formattedAnswers },
      {
        onSuccess: (result) => {
          setPlacementResult(result as { placement: PlacementResult });
        },
      }
    );
  }, [userId, trackId, questionList, answers, submitPlacement]);

  const isLoading = trackLoading || questionsLoading;
  const trackName = (track as { track_name: string } | undefined)?.track_name || 'Track';

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="max-w-2xl mx-auto space-y-4 mt-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (totalQuestions === 0 && !isLoading) {
    return (
      <ContentLayout title="No Questions">
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No placement questions available</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Placement test for this track has not been configured yet.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/vac/case')}>
            Back to CASE Tracker
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Show results screen after submission
  if (placementResult) {
    return (
      <ContentLayout title="Placement Results">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/vac/case">CASE</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Results</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-8">
          <ResultsScreen
            result={placementResult}
            trackId={trackId}
            trackName={trackName}
          />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Placement Test: ${trackName}`}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/case">CASE</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Placement Test</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="max-w-2xl mx-auto space-y-6 mt-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">{trackName} - Placement Test</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Answer the questions to determine your starting position in this track.
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Question {currentQuestion + 1} of {totalQuestions}
            </span>
            <span className="font-medium">{Math.round(progressPct)}%</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>

        {/* Question */}
        {current && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Q{currentQuestion + 1}. {current.question}
                </CardTitle>
                <Badge
                  className={DIFFICULTY_COLORS[current.difficulty] || ''}
                  variant="secondary"
                >
                  {current.difficulty}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {current.options.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    answers[current.id] === opt.value
                      ? 'bg-primary/10 border-primary/30'
                      : 'hover:bg-muted border-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${current.id}`}
                    value={opt.value}
                    checked={answers[current.id] === opt.value}
                    onChange={() => handleSelectAnswer(current.id, opt.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentQuestion === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {/* Question dots */}
          <div className="hidden sm:flex items-center gap-1">
            {questionList.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentQuestion(i)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  i === currentQuestion
                    ? 'bg-primary'
                    : answers[q.id]
                      ? 'bg-primary/40'
                      : 'bg-muted-foreground/20'
                }`}
                aria-label={`Go to question ${i + 1}`}
              />
            ))}
          </div>

          {isLastQuestion ? (
            <Button
              onClick={handleSubmit}
              disabled={!hasAnsweredCurrent || submitPlacement.isPending}
            >
              {submitPlacement.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Submit Test
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!hasAnsweredCurrent}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>

        {/* Answer count */}
        <p className="text-xs text-muted-foreground text-center">
          {Object.keys(answers).length} of {totalQuestions} questions answered
        </p>
      </div>
    </ContentLayout>
  );
}
