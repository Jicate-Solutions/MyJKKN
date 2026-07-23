'use client';

/**
 * AI Pulse — Champion "Issue Poll" control (live page)
 *
 * Rendered ONLY for the Champion + Co-Champion (both hold the
 * `ai_pulse_champion` role). Lets them:
 *   - compose a poll (question + 2–4 options) and issue it (is_open=true)
 *   - see every poll this cycle with its live response count
 *   - close an open poll (set closed_at + is_open=false)
 *
 * The option builder reuses the quiz authoring pattern
 * (admin/quiz/[cycle]/_components/option-row.tsx) — a labelled row with an
 * add/remove control, capped at 2–4 options (polls are simpler than the
 * graded bilingual quiz, so no Tamil field / correct-answer radio here).
 *
 * Write authorization is enforced by RLS (ai_pulse_polls INSERT/UPDATE gated
 * on the ai_pulse_champion role); this control's visibility is gated by the
 * SAME role check in the shell, so a non-Champion never sees it and a forged
 * request is still rejected by the database.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Loader2,
  Plus,
  Trash2,
  MessageCircleQuestion,
  Lock,
  Megaphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useChampionPolls,
  useCreatePoll,
  useClosePoll,
  pollIsAcceptingResponses,
} from '@/lib/services/ai-pulse/live-session-service';

interface ChampionPollsControlProps {
  cycleId: string;
  /** Cycle session end (ISO) — used to show whether a poll is still live. */
  endsAt: string | null;
}

interface DraftOption {
  id: string;
  label: string;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

function newOptionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `opt_${(crypto as Crypto).randomUUID()}`;
  }
  return `opt_${Math.random().toString(36).slice(2)}`;
}

function blankDraft(): DraftOption[] {
  return [
    { id: newOptionId(), label: '' },
    { id: newOptionId(), label: '' },
  ];
}

export function ChampionPollsControl({
  cycleId,
  endsAt,
}: ChampionPollsControlProps) {
  const { data: polls = [], isLoading } = useChampionPolls(cycleId);
  const createPoll = useCreatePoll(cycleId);
  const closePoll = useClosePoll(cycleId);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<DraftOption[]>(blankDraft());

  const setOptionLabel = (id: string, label: string) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));

  const addOption = () =>
    setOptions((prev) =>
      prev.length >= MAX_OPTIONS ? prev : [...prev, { id: newOptionId(), label: '' }],
    );

  const removeOption = (id: string) =>
    setOptions((prev) =>
      prev.length <= MIN_OPTIONS ? prev : prev.filter((o) => o.id !== id),
    );

  const filledOptions = options.filter((o) => o.label.trim().length > 0);
  const canIssue =
    question.trim().length > 0 &&
    filledOptions.length >= MIN_OPTIONS &&
    filledOptions.length <= MAX_OPTIONS &&
    !createPoll.isPending;

  const handleIssue = async () => {
    try {
      await createPoll.mutateAsync({
        question: question.trim(),
        options: filledOptions.map((o) => ({ id: o.id, label: o.label.trim() })),
      });
      toast.success('Poll issued.');
      setQuestion('');
      setOptions(blankDraft());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not issue poll.';
      toast.error(msg);
    }
  };

  const handleClose = async (pollId: string) => {
    try {
      await closePoll.mutateAsync({ pollId });
      toast.success('Poll closed.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not close poll.';
      toast.error(msg);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" aria-hidden />
          Champion — Issue a Poll
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Composer */}
        <div className="space-y-3 rounded-md border p-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Poll question
            </label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which AI tool will you try first this week?"
              className="mt-1 min-h-[56px]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Options
                <span className="ml-2 text-xs text-muted-foreground">
                  {options.length} / {MAX_OPTIONS}
                </span>
              </span>
            </div>

            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground w-4">
                  {String.fromCharCode(65 + i)}
                </span>
                <Input
                  value={opt.label}
                  onChange={(e) => setOptionLabel(opt.id, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOption(opt.id)}
                  disabled={options.length <= MIN_OPTIONS}
                  aria-label={`Remove option ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOption}
              disabled={options.length >= MAX_OPTIONS}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add option
            </Button>
          </div>

          <Button onClick={handleIssue} disabled={!canIssue} className="gap-2">
            {createPoll.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Issuing…
              </>
            ) : (
              <>
                <MessageCircleQuestion className="h-4 w-4" />
                Issue poll
              </>
            )}
          </Button>
        </div>

        {/* Issued polls + counts */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">This cycle&apos;s polls</h4>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading polls…
            </div>
          ) : polls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No polls issued yet. Compose one above to engage the room.
            </p>
          ) : (
            polls.map((poll) => {
              const accepting = pollIsAcceptingResponses(poll, endsAt);
              return (
                <div
                  key={poll.id}
                  className="rounded-md border p-3 space-y-1"
                  data-testid={`champion-poll-${poll.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-tight">
                      {poll.question}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {poll.response_count}{' '}
                      {poll.response_count === 1 ? 'response' : 'responses'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {poll.options.map((o) => o.label).join(' · ')}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span
                      className={`text-xs font-medium ${
                        accepting
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {accepting ? 'Open' : 'Closed'}
                    </span>
                    {accepting && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleClose(poll.id)}
                        disabled={closePoll.isPending}
                        className="gap-2"
                      >
                        <Lock className="h-3 w-3" />
                        Close poll
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
