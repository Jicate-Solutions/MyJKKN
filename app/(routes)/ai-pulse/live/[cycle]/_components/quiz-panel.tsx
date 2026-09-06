'use client';

/**
 * AI Pulse — Post-Session Quiz Panel
 *
 * Appears when Champion marks the cycle as `status='post_event'`. Two windows:
 *   - Live window: 60 minutes after session ends → counts as live engagement
 *   - Async make-up: 60 min – 48 hours → counts as async make-up (Q5 spec)
 *
 * Quiz content itself comes from the Quiz Authoring console.
 * This panel is the LEARNER-side submission UI: pick answers, see score,
 * submit. Pass threshold is policy-driven in the submit service.
 *
 * v2 contract:
 *   - Quiz questions are read from the cycle's `config.quiz` JSONB via
 *     QuizService.getQuiz — the SAME store the Quiz Authoring console writes.
 *     (The previous read targeted an `ai_pulse_quizzes` table that was never
 *     created and had no writer, so it always degraded to "not authored".)
 *   - Bilingual: English is primary; Tamil is shown beneath when authored.
 *   - A question with no correct answer marked is shown but excluded from
 *     scoring (denominator counts only scoreable questions). If nothing is
 *     authored at all, we show a "not yet authored" notice.
 *   - Pass mark is policy-driven (live 40 / async 60 by default), read from
 *     the authored quiz; displayed thresholds match the submit service.
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
import { Textarea } from '@/components/ui/textarea';
import { useSubmitQuiz } from '@/lib/services/ai-pulse/live-session-service';
import { QuizService } from '@/lib/services/ai-pulse/quiz-service';
import { stripLeadingQuestionNumber } from '@/lib/services/ai-pulse/quiz-question-text';

interface QuizPanelProps {
  cycleId: string;
  quizOpen: boolean; // true within 60 min of session end
  asyncWindowOpen: boolean; // true within the policy async window of session end
  asyncWindowHours?: number; // policy-driven async make-up window; default 48
  alreadySubmitted: boolean;
  existingScore?: number;
}

interface QuizQuestion {
  id: string;
  prompt: string;
  prompt_ta?: string;
  options: Array<{ id: string; label: string; label_ta?: string; is_correct: boolean }>;
}

export function QuizPanel({
  cycleId,
  quizOpen,
  asyncWindowOpen,
  asyncWindowHours = 48,
  alreadySubmitted,
  existingScore,
}: QuizPanelProps) {
  const submitQuiz = useSubmitQuiz(cycleId);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [shownScore, setShownScore] = useState<number | null>(
    existingScore ?? null,
  );
  // Pass thresholds come from the authored quiz (config.quiz). These literals
  // mirror DEFAULT_QUIZ in quiz-service.ts — live 50 (raised from 40 on
  // 2026-07-30, decision #10), async make-up 60. They are a read-side fallback
  // only: an authored quiz always supplies its own stored values below, so
  // changing them cannot re-score any cycle that has a quiz on file.
  const [thresholds, setThresholds] = useState<{ live: number; async: number }>({
    live: 50,
    async: 60,
  });

  // Async make-up = post-event + outside the 60-min live window
  const asyncMakeup = !quizOpen && asyncWindowOpen;
  // Threshold that actually applies to this submission window.
  const passThreshold = asyncMakeup ? thresholds.async : thresholds.live;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Read from config.quiz (the store the Quiz Authoring console writes),
        // NOT the never-created ai_pulse_quizzes table. Map the authored
        // bilingual shape (question_en/_ta, text_en/_ta) → the panel's shape.
        const ctx = await QuizService.getQuiz(cycleId);
        if (cancelled) return;
        setThresholds({
          live: ctx?.quiz.pass_threshold_live ?? 50,
          async: ctx?.quiz.pass_threshold_async ?? 60,
        });
        const mapped: QuizQuestion[] = (ctx?.quiz.questions ?? [])
          .map((q) => {
            // Strip any number the author typed into the text — this list is
            // already numbered by the <ol> below, so leaving it in shows the
            // learner the number twice.
            const en = stripLeadingQuestionNumber(q.question_en);
            const ta = stripLeadingQuestionNumber(q.question_ta);
            const options = q.options
              .map((o) => {
                const oen = o.text_en?.trim() ?? '';
                const ota = o.text_ta?.trim() ?? '';
                return {
                  id: o.id,
                  label: oen || ota,
                  label_ta: oen && ota && ota !== oen ? ota : undefined,
                  is_correct: o.is_correct === true,
                };
              })
              .filter((o) => o.label.length > 0);
            return {
              id: q.id,
              prompt: en || ta,
              prompt_ta: en && ta && ta !== en ? ta : undefined,
              options,
            };
          })
          // Render any question with a prompt and ≥2 options. A question with
          // NO correct answer marked is shown but excluded from scoring (see
          // computeScore) — product decision: show it, don't count it.
          .filter((q) => q.prompt.length > 0 && q.options.length >= 2);
        setQuestions(mapped);
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
    // Only questions with a correct answer marked count toward the score.
    // Keyless questions are shown but excluded from the denominator.
    const scoreable = questions.filter((q) =>
      q.options.some((o) => o.is_correct),
    );
    if (scoreable.length === 0) return () => 0;
    return () => {
      let correct = 0;
      for (const q of scoreable) {
        const pick = picks[q.id];
        const correctOpt = q.options.find((o) => o.is_correct);
        if (pick && correctOpt && pick === correctOpt.id) correct += 1;
      }
      return Math.round((correct / scoreable.length) * 100);
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
            The quiz unlocks when the session ends. You&apos;ll
            have 60 minutes for the live window, then {asyncWindowHours} hours for
            the async make-up.
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
                  {shownScore >= passThreshold ? 'passed' : `did not pass (need ${passThreshold}%)`}.
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
    // Only scoreable questions must be answered — keyless questions are shown
    // but optional, since they don't count toward the score.
    const scoreable = questions.filter((q) =>
      q.options.some((o) => o.is_correct),
    );
    const allAnswered = scoreable.every((q) => !!picks[q.id]);
    if (!allAnswered) {
      toast.error('Answer every scored question before submitting.');
      return;
    }
    const score = computeScore();
    try {
      await submitQuiz.mutateAsync({ score, asyncMakeup, feedback });
      setShownScore(score);
      setSubmitted(true);
      toast.success(
        score >= passThreshold ? `Quiz passed (${score}%)` : `Quiz submitted (${score}%)`,
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
                  {q.prompt_ta && (
                    <p className="-mt-1 text-sm text-muted-foreground">
                      {q.prompt_ta}
                    </p>
                  )}
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
                          {opt.label_ta && (
                            <span className="text-muted-foreground">
                              {' '}
                              — {opt.label_ta}
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </li>
              ))}
            </ol>

            {/* CARE E-move: voice channel. Anonymous to the Champion —
                surfaced as text only on the admin cycle page. */}
            <div className="space-y-1.5">
              <Label htmlFor="quiz-feedback" className="text-sm font-medium">
                What should change next week?{' '}
                <span className="text-muted-foreground font-normal">
                  (optional, anonymous)
                </span>
              </Label>
              <Textarea
                id="quiz-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Pace, topic, format, tools — anything."
                rows={2}
                maxLength={500}
              />
            </div>

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
