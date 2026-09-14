'use client';

/**
 * Online Meetings — the live console.
 *
 * ONE component for two audiences. A signed-in colleague at
 * /online-meetings/[id]/live and an external guest at /join/[token] see
 * exactly the same thing; only the `transport` differs, and it differs in one
 * respect — which API prefix the writes go to and whether a join token rides
 * along. Building this twice would have meant the guest experience quietly
 * falling behind the internal one, which is the failure this whole module
 * exists to stop.
 *
 * The AI Pulse live shell is the ancestor of this file and several of its
 * hard-won details are carried over deliberately:
 *
 *   - The meeting link is a REAL ANCHOR that stays clickable after joining,
 *     not a one-shot window.open. Mobile popup blockers, failed Teams deep
 *     links and lost tabs make rejoining normal; the AI Pulse button flipped to
 *     a disabled "Joined" state and produced its single largest bug cluster
 *     ("shows joined but never opened", "cannot rejoin after I left").
 *   - When there is no link, say so explicitly. A dead button that does
 *     nothing is worse than a sentence explaining why.
 *   - The heartbeat writes presence while the page is open, and joining is
 *     idempotent — a second click never restamps the on-time verdict.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Radio,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { evaluateMeetingGates } from '@/lib/services/live-engine/engagement-gates';
import { safeMeetingHref } from '@/lib/services/online-meetings/meeting-url';
import type { LiveMeetingData } from '@/lib/services/online-meetings/types';

/** How the console reaches the server. The only thing that differs by audience. */
export interface LiveTransport {
  /** '/api/online-meetings/live' or '/api/public/online-meetings/live'. */
  base: string;
  /** Present for a guest, absent for a signed-in participant. */
  joinToken?: string;
}

interface LiveConsoleProps {
  initial: LiveMeetingData;
  transport: LiveTransport;
  /**
   * Host or manager. Only changes what the no-link state SAYS: a host who
   * discovers the link is missing while sitting on the live page needs to be
   * told where to add it, and a guest must never see that. Defaults false so
   * the guest surface can never accidentally opt in.
   */
  isHost?: boolean;
}

/** Presence ping interval. One minute, matching the AI Pulse heartbeat. */
const HEARTBEAT_MS = 60_000;

function formatWindow(data: LiveMeetingData): string {
  const tz = data.meeting.timezone || 'Asia/Kolkata';
  const start = new Date(data.meeting.starts_at).toLocaleString('en-IN', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const end = new Date(data.meeting.ends_at).toLocaleTimeString('en-IN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

export function LiveConsole({ initial, transport, isHost = false }: LiveConsoleProps) {
  const [data, setData] = useState<LiveMeetingData>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const post = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      const res = await fetch(`${transport.base}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: data.meeting.id,
          ...(transport.joinToken ? { join_token: transport.joinToken } : {}),
          ...body,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? 'That did not work. Please try again.');
      }
      // Every write returns the refreshed payload, so the page re-renders from
      // one authoritative read instead of patching its own copy of the state.
      if (json.live) setData(json.live as LiveMeetingData);
      return json;
    },
    [data.meeting.id, transport],
  );

  const alreadyJoined = !!data.attendance.joined_at;
  const isLive = data.meeting.status === 'live';
  // Host-typed free text that reaches unauthenticated guests. Never an href
  // without this. See lib/services/online-meetings/meeting-url.ts.
  const safeMeetUrl = safeMeetingHref(data.meeting.meet_url);

  // Heartbeat. Only while joined and only while the meeting is actually
  // running — pinging a finished meeting would extend `stayed_until` past the
  // end and hand everybody the presence gate for free.
  useEffect(() => {
    if (!alreadyJoined || !isLive) return;
    const tick = () => {
      void post('heartbeat').catch(() => {
        // Silent. A dropped ping is not worth an error toast over a live
        // meeting; the next one in sixty seconds will carry the same signal.
      });
    };
    tick();
    const id = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [alreadyJoined, isLive, post]);

  const gates = useMemo(
    () =>
      evaluateMeetingGates(
        data.attendance.engagement_signals,
        data.meeting.ends_at,
        data.polls.length,
        data.config,
      ),
    [data],
  );

  async function run(action: string, body?: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    try {
      await post(action, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  const statusBadge =
    data.meeting.status === 'live' ? (
      <Badge className="gap-1 bg-red-600 hover:bg-red-600">
        <Radio className="h-3 w-3" aria-hidden /> Live now
      </Badge>
    ) : data.meeting.status === 'completed' ? (
      <Badge variant="secondary">Finished</Badge>
    ) : data.meeting.status === 'cancelled' ? (
      <Badge variant="destructive">Cancelled</Badge>
    ) : (
      <Badge variant="outline">Scheduled</Badge>
    );

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{data.meeting.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{formatWindow(data)}</p>
              {data.meeting.host_name && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Hosted by {data.meeting.host_name}
                </p>
              )}
            </div>
            {statusBadge}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.meeting.description && (
            <p className="text-sm leading-relaxed">{data.meeting.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {!alreadyJoined ? (
              <Button
                onClick={() => run('join')}
                disabled={busy === 'join' || !data.join_open}
                className="gap-2"
                data-testid="om-join"
              >
                {busy === 'join' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                )}
                Join this meeting
              </Button>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-500">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                You joined at{' '}
                {new Date(data.attendance.joined_at as string).toLocaleTimeString('en-IN', {
                  timeZone: data.meeting.timezone || 'Asia/Kolkata',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}

            {/* A real anchor, always clickable, never a one-shot window.open.
                See the file header for why this shape is load-bearing.

                The href is validated before use. This button is rendered to
                EXTERNAL GUESTS on the public join page, so a host who stored a
                `javascript:` link would otherwise have it run in the session of
                every person who clicked. React does not sanitise href. */}
            {safeMeetUrl ? (
              <Button asChild variant={alreadyJoined ? 'default' : 'outline'} className="gap-2">
                <a href={safeMeetUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open the video call
                </a>
              </Button>
            ) : isHost ? (
              // The host is the ONE person who can fix this, so they get the
              // fix rather than the apology a participant gets.
              <Button asChild variant="outline" className="gap-2">
                <a href={`/online-meetings/${data.meeting.id}`}>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Add the video link
                </a>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground" data-testid="om-no-link">
                The video link has not been published yet. Your attendance is
                still recorded &mdash; check back shortly.
              </span>
            )}

            {!data.join_open && !alreadyJoined && data.join_opens_at && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Joining opens{' '}
                {new Date(data.join_opens_at).toLocaleString('en-IN', {
                  timeZone: data.meeting.timezone || 'Asia/Kolkata',
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden />
            Signed in as {data.participant.display_name}
            {data.participant.kind === 'external' && ' (guest)'}
          </p>
        </CardContent>
      </Card>

      {/* Engagement — only when this meeting measures more than presence. */}
      {gates.counted_total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your participation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={gates.engagement_percent ?? 0} className="h-2" />
            <ul className="space-y-2">
              {gates.gates
                .filter((g) => g.counted)
                .map((g) => (
                  <li key={g.key} className="flex items-start gap-2 text-sm">
                    {g.passed ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
                        aria-hidden
                      />
                    ) : (
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span>
                      <span className="font-medium">{g.label}</span>
                      <span className="text-muted-foreground"> &mdash; {g.detail}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.polls.length > 0 && (
        <PollsPanel
          data={data}
          busy={busy}
          onAnswer={(pollId, optionId) =>
            run('poll', { poll_id: pollId, option_id: optionId })
          }
        />
      )}

      {(data.quiz_open || data.quiz_async_window_open) &&
        data.quiz.questions.length > 0 && (
          <QuizPanel
            data={data}
            busy={busy}
            onSubmit={(answers) => run('quiz', { answers })}
          />
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PollsPanel({
  data,
  busy,
  onAnswer,
}: {
  data: LiveMeetingData;
  busy: string | null;
  onAnswer: (pollId: string, optionId: string) => void;
}) {
  const answered = new Set(data.answered_poll_ids);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Polls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.polls.map((poll) => {
          const isAnswered = answered.has(poll.id);
          const isClosed = !poll.is_open || !!poll.closed_at;
          return (
            <div key={poll.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{poll.question}</p>
                {isClosed && <Badge variant="secondary">Closed</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                {poll.options.map((opt) => (
                  <Button
                    key={opt.id}
                    size="sm"
                    variant={isAnswered ? 'secondary' : 'outline'}
                    disabled={isClosed || busy === 'poll'}
                    onClick={() => onAnswer(poll.id, opt.id)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              {isAnswered && (
                <p className="text-xs text-muted-foreground">
                  Your answer is recorded. Choosing again replaces it.
                </p>
              )}
              {/* A closed poll is shown rather than hidden so somebody who
                  missed it can see it existed, instead of wondering why their
                  participation bar is short. */}
              {isClosed && !isAnswered && (
                <p className="text-xs text-muted-foreground">
                  This poll closed before you answered.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function QuizPanel({
  data,
  busy,
  onSubmit,
}: {
  data: LiveMeetingData;
  busy: string | null;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const submitted = typeof data.attendance.engagement_signals.quiz_score === 'number';
  const allAnswered = data.quiz.questions.every((q) => answers[q.id]);

  if (submitted) {
    const score = data.attendance.engagement_signals.quiz_score as number;
    const passed = data.attendance.engagement_signals.quiz_passed;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quiz</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            You scored <span className="font-semibold">{score}%</span>.{' '}
            {passed ? 'That is a pass.' : `The pass mark was ${data.quiz.pass_threshold}%.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quiz</CardTitle>
        {data.quiz_async_window_open && !data.quiz_open && (
          <p className="text-xs text-muted-foreground">
            You are taking this after the live window, so it counts as a make-up.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {data.quiz.questions.map((q, i) => (
          <div key={q.id} className="space-y-2">
            <p className="text-sm font-medium">
              {i + 1}. {q.question}
            </p>
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => (
                <Button
                  key={opt.id}
                  size="sm"
                  variant={answers[q.id] === opt.id ? 'default' : 'outline'}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                >
                  {opt.text}
                </Button>
              ))}
            </div>
          </div>
        ))}
        <Button
          onClick={() => onSubmit(answers)}
          disabled={!allAnswered || busy === 'quiz'}
          className="gap-2"
        >
          {busy === 'quiz' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Submit answers
        </Button>
        <p className="text-xs text-muted-foreground">
          You get one attempt, so check your answers before submitting.
        </p>
      </CardContent>
    </Card>
  );
}
