'use client';

/**
 * AI Pulse — Post-Session Quiz Panel
 *
 * Appears when Champion marks the cycle as `status='post_event'`. Two windows:
 *   - Live window: 60 minutes after session ends → counts as live engagement
 *   - Async make-up: 60 min – 48 hours → counts as async make-up (Q5 spec)
 *
 * Quiz content itself comes from the Quiz Authoring console (different agent).
 * This panel is the LEARNER-side submission UI: pick answers, see score,
 * submit. Pass mark = 60 (centralised in the service).
 *
 * v1 contract:
 *   - Quiz questions are fetched from `ai_pulse_quizzes` if available; if the
 *     table doesn't exist yet (table is in another in-flight PR), we render a
 *     "Quiz not yet authored" notice and let the learner submit a 0 score.
 *     This avoids blocking the learner UI on Quiz Authoring shipping first.
 *   - Score is a percentage 0–100. We compute it client-side from the
 *     learner's picks; the service stores both score and quiz_passed.
 */

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ScrollText, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useSubmitQuiz } from '@/lib/services/ai-pulse/live-session-service';

interface QuizPanelProps {
  cycleId: string;
  quizOpen: boolean; // true within 60 min of session end
  asyncWindowOpen: boolean; // true within 48h of session end
  alreadySubmitted: boolean;
  existingScore?: number;
}

interface QuizQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string; is_correct: boolean }>;
}

export function QuizPanel({
  cycleId,
  quizOpen,
  asyncWindowOpen,
  alreadySubmitted,
  existingScore,
}: QuizPanelProps) {
  const submitQuiz = useSubmitQuiz(cycleId);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [shownScore, setShownScore] = useState<number | null>(
    existingScore ?? null,
  );

  // Async make-up = post-event + outside the 60-min live window
  const asyncMakeup = !quizOpen && asyncWindowOpen;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('ai_pulse_quizzes')
          .select('id, prompt, options')
          .eq('cycle_id', cycleId)
          .order('order_index', { ascending: true });
        if (cancelled) return;
        if (error) {
          // Table missing or RLS reject → degrade gracefully
          setQuestions([]);
        } else {
          setQuestions((data ?? []) as unknown as QuizQuestion[]);
        }
      } catch (e) {
        if (!cancelled) setQuestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (quizOpen || asyncWindowOpen) {
      load();
    }
    return () => {
      cancelled = true;
    };
  }, [cycleId, quizOpen, asyncWindowOpen]);

  const computeScore = useMemo(() => {
    if (!questions || questions.length === 0) return () => 0;
    return () => {
      let correct = 0;
      for (const q of questions) {
        const pick = picks[q.id];
        const correctOpt = q.options.find((o) => o.is_correct);
        if (pick && correctOpt && pick === correctOpt.id) correct += 1;
      }
      return Math.round((correct / questions.length) * 100);
    };
  }, [questions, picks]);

  if (!quizOpen && !asyncWindowOpen) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" aria-hidden />
            Post-Session Quiz
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The quiz unlocks when the Champion ends the session. You&apos;ll
            have 60 minutes for the live window, then 48 hours for the async
            make-up.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" aria-hidden />
            Post-Session Quiz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>
              Submitted ({asyncMakeup ? 'async make-up' : 'live'} window).
              {shownScore !== null && (
                <>
                  {' '}
                  Score: <strong>{shownScore}%</strong> —{' '}
                  {shownScore >= 60 ? 'passed' : 'did not pass (need 60)'}.
                </>
              )}
            </span>
          </div>
          {asyncMakeup && (
            <p className="text-xs text-muted-foreground">
              Async make-up counts toward engagement only if all other gates
              also pass.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async () => {
    if (!questions || questions.length === 0) {
      toast.error('No quiz questions available yet.');
      return;
    }
    const allAnswered = questions.every((q) => !!picks[q.id]);
    if (!allAnswered) {
      toast.error('Answer every question before submitting.');
      return;
    }
    const score = computeScore();
    try {
      await submitQuiz.mutateAsync({ score, asyncMakeup });
      setShownScore(score);
      setSubmitted(true);
      toast.success(
        score >= 60 ? `Quiz passed (${score}%)` : `Quiz submitted (${score}%)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not submit quiz.';
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" aria-hidden />
            Post-Session Quiz
          </span>
          {asyncMakeup ? (
            <span className="flex items-center gap-1 text-xs font-normal text-amber-700 dark:text-amber-400">
              <Clock className="h-3 w-3" /> Async make-up window
            </span>
          ) : (
            <span className="text-xs font-normal text-green-700 dark:text-green-400">
              Live window (60 min)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading quiz…
          </div>
        )}

        {!loading && questions && questions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            The Champion hasn&apos;t authored the quiz for this cycle yet.
            Check back shortly.
          </p>
        )}

        {!loading && questions && questions.length > 0 && (
          <>
            <ol className="space-y-4 list-decimal list-inside">
              {questions.map((q) => (
                <li key={q.id} className="space-y-2">
                  <p className="text-sm font-medium">{q.prompt}</p>
                  <RadioGroup
                    value={picks[q.id] ?? ''}
                    onValueChange={(val) =>
                      setPicks((prev) => ({ ...prev, [q.id]: val }))
                    }
                  >
                    {q.options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <RadioGroupItem value={opt.id} id={`${q.id}-${opt.id}`} />
                        <Label
                          htmlFor={`${q.id}-${opt.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </li>
              ))}
            </ol>

            <Button
              onClick={handleSubmit}
              disabled={submitQuiz.isPending}
              className="gap-2"
            >
              {submitQuiz.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit Quiz'
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
