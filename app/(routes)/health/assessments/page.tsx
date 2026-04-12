'use client';

import { useState, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import {
  Brain,
  Heart,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useSubmitAssessment,
  useDeclineAssessment,
  useAssessmentHistory,
  useLatestAssessment,
} from '@/hooks/health/use-health-assessments';
import {
  PHQ9_QUESTIONS,
  GAD7_QUESTIONS,
  PHQ9_OPTIONS,
  PHQ9_SEVERITY,
  GAD7_SEVERITY,
  scorePHQ9,
  scoreGAD7,
  ESCALATION_THRESHOLD_PHQ9,
  ESCALATION_THRESHOLD_GAD7,
  type AssessmentType,
  type AssessmentResponse,
} from '@/types/health-mental';

// ─── View State ───────────────────────────────────────────────────────────────

type View = 'landing' | 'quiz' | 'results';

interface ResultState {
  score: number;
  severity: {
    label: string;
    color: string;
    bg: string;
    action: string;
  };
  type: AssessmentType;
  escalate: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Not taken yet';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getSeverityBadgeClasses(color: string, bg: string): string {
  // Map the Tailwind text/bg classes from severity config into badge variants
  // We use inline style composition to keep it safe with Tailwind's purge
  return `${color} ${bg} border border-current/20 font-medium`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AssessmentCard({
  type,
  onStart,
  onDecline,
  learnerId,
}: {
  type: AssessmentType;
  onStart: (type: AssessmentType) => void;
  onDecline: (type: AssessmentType) => void;
  learnerId: string | undefined;
}) {
  const { data: latest } = useLatestAssessment(learnerId, type);

  const isPHQ9 = type === 'phq9';
  const icon = isPHQ9 ? (
    <Brain className="h-5 w-5 text-indigo-500" />
  ) : (
    <Heart className="h-5 w-5 text-rose-400" />
  );
  const title = isPHQ9 ? 'Depression Screening' : 'Anxiety Screening';
  const subtitle = isPHQ9 ? 'PHQ-9 · 9 questions' : 'GAD-7 · 7 questions';
  const accentBg = isPHQ9 ? 'bg-indigo-50' : 'bg-rose-50';
  const accentBorder = isPHQ9 ? 'border-indigo-100' : 'border-rose-100';
  const buttonClass = isPHQ9
    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
    : 'bg-rose-500 hover:bg-rose-600 text-white';

  const lastCompleted =
    latest?.status === 'completed' ? latest.completed_at : null;
  const lastScore = latest?.status === 'completed' ? latest.total_score : null;
  const lastSeverity =
    latest?.status === 'completed' ? latest.severity : null;

  const severityConfig = lastSeverity
    ? (isPHQ9 ? PHQ9_SEVERITY : GAD7_SEVERITY).find(
        (s) => s.label === lastSeverity
      )
    : null;

  return (
    <Card
      className={`border ${accentBorder} ${accentBg} shadow-sm hover:shadow-md transition-shadow duration-200`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-lg ${isPHQ9 ? 'bg-indigo-100' : 'bg-rose-100'}`}
            >
              {icon}
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-gray-800">
                {title}
              </CardTitle>
              <CardDescription className="text-xs text-gray-500 mt-0.5">
                {subtitle}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Last taken info */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Last taken: {formatDate(lastCompleted)}</span>
          {lastScore !== null && severityConfig && (
            <Badge
              className={`ml-1 text-xs px-2 py-0 h-5 ${getSeverityBadgeClasses(severityConfig.color, severityConfig.bg)}`}
            >
              {lastScore} — {lastSeverity}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            className={`flex-1 h-9 text-sm font-medium rounded-lg ${buttonClass}`}
            onClick={() => onStart(type)}
          >
            {lastCompleted ? 'Retake' : 'Start'}
          </Button>
          <button
            onClick={() => onDecline(type)}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors flex-shrink-0"
          >
            Skip for now
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryTimeline({
  learnerId,
}: {
  learnerId: string | undefined;
}) {
  const { data: history, isLoading } = useAssessmentHistory(learnerId);

  if (isLoading) {
    return (
      <div className="space-y-3 mt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 rounded-xl bg-gray-100 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const completed = history
    ?.filter((a) => a.status === 'completed')
    .slice(0, 10) ?? [];

  if (completed.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No assessments taken yet. Complete one above to see your history.
      </p>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      {completed.map((assessment) => {
        const severityTable =
          assessment.assessment_type === 'phq9' ? PHQ9_SEVERITY : GAD7_SEVERITY;
        const severityConfig = severityTable.find(
          (s) => s.label === assessment.severity
        );

        return (
          <div
            key={assessment.id}
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {assessment.assessment_type === 'phq9' ? (
                  <Brain className="h-4 w-4 text-indigo-400" />
                ) : (
                  <Heart className="h-4 w-4 text-rose-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 leading-none">
                  {assessment.assessment_type === 'phq9'
                    ? 'PHQ-9 (Depression)'
                    : 'GAD-7 (Anxiety)'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(assessment.completed_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">
                {assessment.total_score}
              </span>
              {severityConfig && (
                <Badge
                  className={`text-xs px-2 py-0 h-5 ${getSeverityBadgeClasses(severityConfig.color, severityConfig.bg)}`}
                >
                  {assessment.severity}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizView({
  type,
  onComplete,
  onDecline,
  onBack,
}: {
  type: AssessmentType;
  onComplete: (responses: AssessmentResponse[]) => void;
  onDecline: () => void;
  onBack: () => void;
}) {
  const questions = type === 'phq9' ? PHQ9_QUESTIONS : GAD7_QUESTIONS;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const totalQuestions = questions.length;
  const progressPercent = ((currentIndex + 1) / totalQuestions) * 100;
  const currentAnswer = answers[currentIndex];
  const hasAnswer = currentAnswer !== undefined;

  const isPHQ9 = type === 'phq9';
  const accentColor = isPHQ9 ? 'text-indigo-600' : 'text-rose-500';
  const progressBg = isPHQ9 ? 'bg-indigo-600' : 'bg-rose-500';

  const handleSelect = (value: number) => {
    setAnswers((prev) => ({ ...prev, [currentIndex]: value }));
  };

  const handleNext = () => {
    if (!hasAnswer) return;
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      // Build responses array
      const responses: AssessmentResponse[] = questions.map((_, idx) => ({
        question_index: idx,
        score: answers[idx] ?? 0,
      }));
      onComplete(responses);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    } else {
      onBack();
    }
  };

  const isLastQuestion = currentIndex === totalQuestions - 1;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {currentIndex === 0 ? 'Back' : 'Previous'}
          </button>

          <span className={`text-sm font-medium ${accentColor}`}>
            Question {currentIndex + 1} of {totalQuestions}
          </span>

          <button
            onClick={onDecline}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Exit
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${progressBg}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 max-w-xl mx-auto w-full">
        {/* Over the past 2 weeks label */}
        <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-5 text-center">
          Over the past 2 weeks, how often have you been bothered by...
        </p>

        {/* Question text */}
        <div className="w-full mb-8">
          <p className="text-xl font-semibold text-gray-800 leading-relaxed text-center">
            {questions[currentIndex]}
          </p>
        </div>

        {/* Answer options */}
        <RadioGroup
          value={currentAnswer !== undefined ? String(currentAnswer) : ''}
          onValueChange={(val) => handleSelect(Number(val))}
          className="w-full space-y-3"
        >
          {PHQ9_OPTIONS.map((option) => {
            const isSelected = currentAnswer === option.value;
            return (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`
                  flex items-center gap-4 px-5 py-4 rounded-2xl border-2 cursor-pointer
                  transition-all duration-150 select-none
                  ${
                    isSelected
                      ? isPHQ9
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-rose-400 bg-rose-50'
                      : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100'
                  }
                `}
              >
                <RadioGroupItem
                  value={String(option.value)}
                  id={`option-${option.value}`}
                  className={isSelected ? (isPHQ9 ? 'text-indigo-600' : 'text-rose-500') : ''}
                />
                <Label
                  htmlFor={`option-${option.value}`}
                  className={`text-base font-medium cursor-pointer leading-snug ${
                    isSelected ? 'text-gray-900' : 'text-gray-600'
                  }`}
                >
                  {option.label}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>

      {/* Bottom navigation */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4">
        <Button
          className={`w-full h-12 text-base font-semibold rounded-xl transition-all
            ${
              hasAnswer
                ? isPHQ9
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          disabled={!hasAnswer}
          onClick={handleNext}
        >
          {isLastQuestion ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Submit
            </>
          ) : (
            <>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>

        {/* Quiet decline link */}
        <button
          onClick={onDecline}
          className="w-full mt-3 text-center text-xs text-gray-400 hover:text-gray-500 underline underline-offset-2 transition-colors"
        >
          I&apos;d rather not take this now
        </button>
      </div>
    </div>
  );
}

function ResultsView({
  result,
  onDone,
  onRetake,
}: {
  result: ResultState;
  onDone: () => void;
  onRetake: () => void;
}) {
  const { score, severity, type, escalate } = result;
  const isPHQ9 = type === 'phq9';
  const maxScore = isPHQ9 ? 27 : 21;
  const scorePercent = Math.round((score / maxScore) * 100);

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      {/* Score card */}
      <Card className={`border-0 shadow-md ${severity.bg}`}>
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            {isPHQ9 ? (
              <Brain className="h-6 w-6 text-gray-500" />
            ) : (
              <Heart className="h-6 w-6 text-gray-500" />
            )}
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              {isPHQ9 ? 'PHQ-9 Result' : 'GAD-7 Result'}
            </span>
          </div>

          <div>
            <span className="text-6xl font-bold text-gray-800 tabular-nums">
              {score}
            </span>
            <span className="text-xl text-gray-400 font-light">/{maxScore}</span>
          </div>

          {/* Severity badge */}
          <Badge
            className={`text-sm px-4 py-1.5 font-semibold rounded-full ${getSeverityBadgeClasses(severity.color, severity.bg)}`}
          >
            {severity.label}
          </Badge>

          {/* Score bar */}
          <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden mx-auto max-w-xs">
            <div
              className="h-full rounded-full bg-current transition-all duration-700 ease-out opacity-60"
              style={{ width: `${scorePercent}%`, color: 'inherit' }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Action recommendation */}
      <Card className="border border-gray-100 shadow-sm">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600 leading-relaxed">
              {severity.action}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Counselor referral — shown when score >= threshold */}
      {escalate && (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-3">
                <p className="text-sm font-semibold text-amber-800">
                  We recommend speaking with a counselor
                </p>
                <p className="text-sm text-amber-700 leading-relaxed">
                  Based on your responses, connecting with a counselor could be
                  really helpful. Your wellbeing matters, and support is
                  available.
                </p>
                <a
                  href="mailto:counselor@jkkn.ac.in"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 transition-colors"
                >
                  Book a session with a counselor
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PHQ-9 Q9 crisis note — suicidal ideation question */}
      {isPHQ9 && (
        <p className="text-xs text-gray-400 text-center leading-relaxed px-2">
          If you are having thoughts of harming yourself, please reach out to
          your institution counselor immediately or call iCall: 9152987821.
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button
          className="h-11 w-full rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-medium"
          onClick={onDone}
        >
          Done
        </Button>
        <Button
          variant="ghost"
          className="h-10 w-full text-sm text-gray-500 hover:text-gray-700"
          onClick={onRetake}
        >
          Retake assessment
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssessmentsPage() {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? undefined;

  const [view, setView] = useState<View>('landing');
  const [activeType, setActiveType] = useState<AssessmentType>('phq9');
  const [result, setResult] = useState<ResultState | null>(null);

  const submitMutation = useSubmitAssessment();
  const declineMutation = useDeclineAssessment();

  const handleStart = useCallback((type: AssessmentType) => {
    setActiveType(type);
    setResult(null);
    setView('quiz');
  }, []);

  const handleDecline = useCallback(
    (type?: AssessmentType) => {
      const declineType = type ?? activeType;
      if (learnerId) {
        declineMutation.mutate({ learnerId, type: declineType });
      }
      setView('landing');
    },
    [learnerId, activeType, declineMutation]
  );

  const handleComplete = useCallback(
    (responses: AssessmentResponse[]) => {
      if (!learnerId) return;

      const scored =
        activeType === 'phq9'
          ? scorePHQ9(responses)
          : scoreGAD7(responses);

      const threshold =
        activeType === 'phq9'
          ? ESCALATION_THRESHOLD_PHQ9
          : ESCALATION_THRESHOLD_GAD7;

      setResult({
        score: scored.score,
        severity: scored.severity,
        type: activeType,
        escalate: scored.score >= threshold,
      });

      submitMutation.mutate({ learnerId, type: activeType, responses });
      setView('results');
    },
    [learnerId, activeType, submitMutation]
  );

  // ─── Landing view ─────────────────────────────────────────────────────────

  if (view === 'landing') {
    return (
      <ContentLayout title="Mental Health Assessments">
        <div className="max-w-xl mx-auto space-y-8">
          {/* Intro */}
          <div className="text-center space-y-2 pt-2">
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
              These short, validated screenings help you understand how you are
              feeling. Your responses are private and confidential.
            </p>
          </div>

          {/* Assessment cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AssessmentCard
              type="phq9"
              onStart={handleStart}
              onDecline={handleDecline}
              learnerId={learnerId}
            />
            <AssessmentCard
              type="gad7"
              onStart={handleStart}
              onDecline={handleDecline}
              learnerId={learnerId}
            />
          </div>

          {/* History section */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Past Assessments
            </h2>
            <HistoryTimeline learnerId={learnerId} />
          </div>
        </div>
      </ContentLayout>
    );
  }

  // ─── Quiz view — full-screen feel, no ContentLayout chrome ───────────────

  if (view === 'quiz') {
    return (
      <QuizView
        type={activeType}
        onComplete={handleComplete}
        onDecline={() => handleDecline(activeType)}
        onBack={() => setView('landing')}
      />
    );
  }

  // ─── Results view ─────────────────────────────────────────────────────────

  if (view === 'results' && result) {
    return (
      <ContentLayout title="Your Results">
        <ResultsView
          result={result}
          onDone={() => setView('landing')}
          onRetake={() => handleStart(result.type)}
        />
      </ContentLayout>
    );
  }

  return null;
}
