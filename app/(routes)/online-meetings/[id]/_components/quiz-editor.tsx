'use client';

/**
 * Online Meetings — quiz authoring.
 *
 * The server action refuses a quiz that a knowledge-free respondent could
 * pass. That check exists because the AI Pulse quiz shipped with its correct
 * answers clustered in one slot: picking a single letter throughout scored
 * exactly the pass mark, and the threshold had to be raised after the fact.
 * The warning below tells the host about it before they save rather than
 * after.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MeetingQuiz, OnlineMeeting } from '@/lib/services/online-meetings/types';

import { saveQuizAction } from '../../_actions/meeting-actions';

interface Props {
  meeting: OnlineMeeting;
  isHost: boolean;
}

type Draft = MeetingQuiz;

function newQuestion(index: number) {
  return {
    id: `q${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
    question: '',
    options: [
      { id: 'a', text: '', is_correct: true },
      { id: 'b', text: '', is_correct: false },
    ],
  };
}

export function QuizEditor({ meeting, isHost }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>({
    questions: meeting.quiz?.questions ?? [],
    pass_threshold: meeting.quiz?.pass_threshold ?? 50,
  });

  /** The best score somebody could get by always picking the same slot. */
  const blindScore = useMemo(() => {
    if (draft.questions.length === 0) return 0;
    const maxOptions = Math.max(...draft.questions.map((q) => q.options.length));
    let best = 0;
    for (let slot = 0; slot < maxOptions; slot++) {
      const hits = draft.questions.filter(
        (q) => q.options[slot]?.is_correct === true,
      ).length;
      best = Math.max(best, Math.round((hits / draft.questions.length) * 100));
    }
    return best;
  }, [draft.questions]);

  if (!isHost) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {draft.questions.length > 0
            ? 'A quiz has been set for this meeting. It opens when the meeting ends.'
            : 'No quiz for this meeting.'}
        </CardContent>
      </Card>
    );
  }

  function update(fn: (d: Draft) => Draft) {
    setDraft((prev) => fn(structuredClone(prev)));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Post-meeting quiz</CardTitle>
          <p className="text-xs text-muted-foreground">
            Opens when the meeting ends. Turn on &ldquo;count a post-meeting
            quiz&rdquo; in the meeting settings for it to affect the engagement
            report.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {draft.questions.map((q, qi) => (
            <div key={q.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Input
                  value={q.question}
                  placeholder={`Question ${qi + 1}`}
                  onChange={(e) =>
                    update((d) => {
                      d.questions[qi].question = e.target.value;
                      return d;
                    })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    update((d) => {
                      d.questions.splice(qi, 1);
                      return d;
                    })
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                </Button>
              </div>

              {q.options.map((o, oi) => (
                <div key={o.id} className="flex items-center gap-2 pl-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={o.is_correct}
                    onChange={() =>
                      update((d) => {
                        d.questions[qi].options.forEach((opt, j) => {
                          opt.is_correct = j === oi;
                        });
                        return d;
                      })
                    }
                    aria-label={`Option ${oi + 1} is correct`}
                  />
                  <Input
                    value={o.text}
                    placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                    onChange={(e) =>
                      update((d) => {
                        d.questions[qi].options[oi].text = e.target.value;
                        return d;
                      })
                    }
                  />
                  {q.options.length > 2 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        update((d) => {
                          d.questions[qi].options.splice(oi, 1);
                          if (!d.questions[qi].options.some((x) => x.is_correct)) {
                            d.questions[qi].options[0].is_correct = true;
                          }
                          return d;
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  )}
                </div>
              ))}

              <Button
                size="sm"
                variant="ghost"
                className="ml-2 gap-1.5"
                disabled={q.options.length >= 6}
                onClick={() =>
                  update((d) => {
                    const next = d.questions[qi].options.length;
                    d.questions[qi].options.push({
                      id: String.fromCharCode(97 + next),
                      text: '',
                      is_correct: false,
                    });
                    return d;
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add option
              </Button>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              update((d) => {
                d.questions.push(newQuestion(d.questions.length));
                return d;
              })
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add question
          </Button>

          <div className="flex items-center gap-3 border-t pt-4">
            <Label htmlFor="q-threshold" className="font-normal">
              Pass mark
            </Label>
            <Input
              id="q-threshold"
              type="number"
              min={1}
              max={100}
              value={draft.pass_threshold}
              onChange={(e) =>
                update((d) => {
                  d.pass_threshold = Number(e.target.value) || 50;
                  return d;
                })
              }
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>

          {draft.questions.length > 0 && blindScore >= draft.pass_threshold && (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                aria-hidden
              />
              <span>
                Somebody who always picked the same option would score{' '}
                {blindScore}% and pass. Move the correct answers around, or
                raise the pass mark. This will be refused on save.
              </span>
            </p>
          )}

          <Button
            onClick={() =>
              startTransition(async () => {
                const r = await saveQuizAction(meeting.id, draft);
                if (!r.success) toast.error(r.error);
                else {
                  toast.success('Quiz saved.');
                  router.refresh();
                }
              })
            }
            disabled={pending}
            className="gap-2"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save quiz
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
