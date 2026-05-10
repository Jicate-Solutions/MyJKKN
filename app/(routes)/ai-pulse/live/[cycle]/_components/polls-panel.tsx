'use client';

/**
 * AI Pulse — Live Polls Panel
 *
 * Renders Champion-issued polls during the session. Each submitted response
 * increments engagement_signals.polls_responded; the 4-AND gate requires ≥3
 * to pass that gate.
 *
 * v1 contract (kept narrow on purpose):
 *   - Poll list is read-only here (Champion-side authoring lives in
 *     `/ai-pulse/admin/quiz` for post-event quizzes; live polls are a
 *     separate Champion surface owned by another agent).
 *   - We render in submitted vs open buckets. Once a response is recorded we
 *     parent-invalidates and the poll re-renders as "Submitted".
 *   - "Submitted" tracking client-side only — the Source of Truth is
 *     ai_pulse_poll_responses (audit) + engagement_signals.polls_responded.
 *
 * Empty state: "No live polls yet — wait for the Champion." Crucial because
 * sessions don't always run polls in the first 5 minutes.
 */

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MessageCircleQuestion, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  useRecordPollResponse,
  type LivePoll,
} from '@/lib/services/ai-pulse/live-session-service';

interface PollsPanelProps {
  cycleId: string;
  polls: LivePoll[];
  pollsRespondedCount: number;
}

export function PollsPanel({ cycleId, polls, pollsRespondedCount }: PollsPanelProps) {
  const recordResponse = useRecordPollResponse(cycleId);
  // Track which poll IDs we just submitted in this client tab.
  // The server-side count is authoritative; this is just for instant UI feedback.
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Record<string, string>>({});

  const orderedPolls = useMemo(
    () =>
      [...polls].sort(
        (a, b) =>
          new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime(),
      ),
    [polls],
  );

  const handleSubmit = async (pollId: string) => {
    const optionId = selected[pollId];
    if (!optionId) {
      toast.error('Pick an option first.');
      return;
    }
    try {
      await recordResponse.mutateAsync({ pollId, optionId });
      setSubmittedIds((prev) => {
        const next = new Set(prev);
        next.add(pollId);
        return next;
      });
      toast.success('Response recorded.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save response.';
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4" aria-hidden />
            Live Polls
          </span>
          <span
            className="text-xs font-normal text-muted-foreground"
            data-testid="polls-counter"
          >
            {pollsRespondedCount} responded · need ≥3
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {orderedPolls.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No live polls yet — wait for the Champion to issue one.
          </p>
        )}

        {orderedPolls.map((poll) => {
          const submitted = submittedIds.has(poll.id);
          return (
            <div
              key={poll.id}
              className="rounded-md border p-3 space-y-3"
              data-testid={`poll-${poll.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-tight">{poll.question}</p>
                {submitted && (
                  <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Submitted
                  </span>
                )}
              </div>

              {!submitted && (
                <>
                  <RadioGroup
                    value={selected[poll.id] ?? ''}
                    onValueChange={(val) =>
                      setSelected((prev) => ({ ...prev, [poll.id]: val }))
                    }
                  >
                    {poll.options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <RadioGroupItem
                          value={opt.id}
                          id={`${poll.id}-${opt.id}`}
                        />
                        <Label
                          htmlFor={`${poll.id}-${opt.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>

                  <Button
                    size="sm"
                    onClick={() => handleSubmit(poll.id)}
                    disabled={recordResponse.isPending || !selected[poll.id]}
                    className="gap-2"
                  >
                    {recordResponse.isPending ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      'Submit response'
                    )}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
