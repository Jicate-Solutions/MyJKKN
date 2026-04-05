'use client';

import { use, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSubmissionResults, useAssessmentDetail, useLearnerSubmissions } from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import { QuestionCard } from '../../_components/question-card';
import { BeatLoader } from 'react-spinners';
import { CheckCircle2, XCircle, RotateCcw, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FinksDimension, SubmissionAnswer, PDEAssessmentQuestion } from '@/types/pde';

const FINKS_LABELS: Record<FinksDimension, string> = {
  foundational_knowledge: 'Foundational Knowledge',
  application: 'Application',
  integration: 'Integration',
  human_dimension: 'Human Dimension',
  caring: 'Caring',
  learning_how_to_learn: 'Learning How to Learn',
};

const FINKS_COLORS: Record<FinksDimension, string> = {
  foundational_knowledge: 'bg-blue-500',
  application: 'bg-green-500',
  integration: 'bg-purple-500',
  human_dimension: 'bg-orange-500',
  caring: 'bg-pink-500',
  learning_how_to_learn: 'bg-cyan-500',
};

export default function AssessmentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: assessmentId } = use(params);
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('submission');
  const router = useRouter();
  const { profile: user } = useAuth();

  const { data: results, isLoading: loadingResults } = useSubmissionResults(submissionId || undefined);
  const { data: assessment } = useAssessmentDetail(assessmentId);
  const { data: prevSubmissions } = useLearnerSubmissions(user?.id, assessmentId);

  // Compute Fink's dimension breakdown from questions + answers
  const finksBreakdown = useMemo(() => {
    if (!results || !assessment) return null;
    const breakdown: Record<string, { earned: number; total: number }> = {};
    const answersMap = new Map<string, SubmissionAnswer>();
    if (results.answers) {
      results.answers.forEach((a: SubmissionAnswer) => answersMap.set(a.question_id, a));
    }
    assessment.questions.forEach((q: PDEAssessmentQuestion) => {
      const dim = q.finks_dimension || 'foundational_knowledge';
      if (!breakdown[dim]) breakdown[dim] = { earned: 0, total: 0 };
      breakdown[dim].total += q.points;
      const ans = answersMap.get(q.id);
      if (ans) breakdown[dim].earned += ans.points_earned;
    });
    return breakdown;
  }, [results, assessment]);

  // Score info
  const percentage = results?.final_score ?? results?.auto_score ?? 0;
  const passed = results?.passed ?? false;
  const attemptsUsed = prevSubmissions?.length || 0;
  const maxAttempts = assessment?.max_attempts || 3;
  const canRetry = attemptsUsed < maxAttempts && !passed;
  const showCorrect = assessment?.show_correct_after ?? true;

  if (loadingResults) {
    return (
      <ContentLayout title="Results">
        <div className="flex justify-center p-12">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!results) {
    return (
      <ContentLayout title="Results">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Submission not found.</p>
          <Button variant="outline" onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const answersMap = new Map<string, SubmissionAnswer>();
  if (results.answers) {
    results.answers.forEach((a: SubmissionAnswer) => answersMap.set(a.question_id, a));
  }

  return (
    <ContentLayout title="Assessment Results">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/vac' },
          { label: 'Assessment', href: `/learn/assess/${assessmentId}` },
          { label: 'Results' },
        ]}
      />

      <div className="max-w-3xl mx-auto mt-6 space-y-6">
        {/* Score Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={cn(
                'w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold',
                passed
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
              )}>
                {Math.round(percentage)}%
              </div>

              <div className="flex items-center gap-2">
                {passed ? (
                  <Badge className="bg-green-500 text-white text-sm px-3 py-1">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Passed
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-sm px-3 py-1">
                    <XCircle className="h-4 w-4 mr-1" />
                    Failed
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                Pass threshold: {assessment?.pass_threshold ?? 70}% | Attempt {results.attempt_number} of {maxAttempts}
              </p>

              {results.time_spent_seconds && (
                <p className="text-xs text-muted-foreground">
                  Time spent: {Math.floor(results.time_spent_seconds / 60)}m {results.time_spent_seconds % 60}s
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Fink's Dimension Breakdown */}
        {finksBreakdown && Object.keys(finksBreakdown).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance by Dimension</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(Object.entries(finksBreakdown) as [FinksDimension, { earned: number; total: number }][]).map(
                ([dim, { earned, total }]) => {
                  const pct = total > 0 ? (earned / total) * 100 : 0;
                  return (
                    <div key={dim} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{FINKS_LABELS[dim] || dim.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground">{earned}/{total} pts ({Math.round(pct)}%)</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', FINKS_COLORS[dim] || 'bg-gray-500')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
            </CardContent>
          </Card>
        )}

        {/* Question-by-Question Review */}
        {assessment && showCorrect && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Question Review</h2>
            {assessment.questions.map((q: PDEAssessmentQuestion, idx: number) => (
              <QuestionCard
                key={q.id}
                question={q}
                questionNumber={idx + 1}
                selectedAnswer={answersMap.get(q.id)?.selected_answer}
                onAnswerChange={() => {}}
                readOnly
                submissionAnswer={answersMap.get(q.id)}
                showCorrectAnswer={showCorrect}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {canRetry && (
            <Button onClick={() => router.push(`/learn/assess/${assessmentId}`)} className="flex-1">
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry Assessment
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push('/vac')} className="flex-1">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Courses
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
