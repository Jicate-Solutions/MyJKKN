'use client';

/**
 * A sender's own all-college messages.
 *
 * The point of this screen is that nothing about your message is hidden from
 * you: whether it is still waiting, how long is left before it leaves on its
 * own, who decided and what they said, and — while it is still waiting — a way
 * to take it back. A sent message cannot be recalled, which is exactly why the
 * withdraw button has to be here while it still means something.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, AlertTriangle, Undo2, MessageSquareQuote } from 'lucide-react';
import { describeStatus, formatMoment } from '@/lib/learners-council/broadcast-reach';
import type { BroadcastRequestView } from '@/lib/learners-council/broadcast-server';
import { CountdownLine, ReachLines, useLiveClock } from './_components/broadcast-bits';

interface Outcome {
  key: string;
  ok: boolean;
  message: string;
}

interface MyBroadcastsClientProps {
  initialRequests: BroadcastRequestView[];
  readFailed: boolean;
  approverName: string | null;
  approverIsNamed: boolean;
  configUnreadable: boolean;
  autoSendHours: number;
}

const TONE_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  waiting: 'secondary',
  good: 'default',
  bad: 'destructive',
  neutral: 'outline',
};

export function MyBroadcastsClient({
  initialRequests,
  readFailed,
  approverName,
  approverIsNamed,
  configUnreadable,
  autoSendHours,
}: MyBroadcastsClientProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  // Ids withdrawn in this tab. Derived over the server rows rather than copied
  // into state: after router.refresh() the server already reports them as
  // cancelled, so this override becomes redundant instead of contradicting it.
  const [withdrawnIds, setWithdrawnIds] = useState<ReadonlySet<string>>(new Set());
  const requests = initialRequests.map((request) =>
    withdrawnIds.has(request.id) ? { ...request, status: 'cancelled' } : request
  );
  const nowMs = useLiveClock();

  const cancel = useCallback(
    async (requestId: string) => {
      setBusyId(requestId);
      try {
        const response = await fetch('/api/learners-council/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', request_id: requestId }),
        });

        const payload = await response.json().catch(() => ({}) as Record<string, unknown>);

        if (!response.ok || payload?.success === false) {
          setOutcomes((prev) => [
            ...prev,
            {
              key: `${requestId}-${Date.now()}`,
              ok: false,
              message:
                (typeof payload?.error === 'string' && payload.error) ||
                `That message could not be withdrawn (the server answered ${response.status}). It is still waiting, and will still send itself when the window closes, unless you try again.`,
            },
          ]);
          return;
        }

        setWithdrawnIds((prev) => new Set(prev).add(requestId));
        setOutcomes((prev) => [
          ...prev,
          {
            key: `${requestId}-${Date.now()}`,
            ok: true,
            message: 'Withdrawn. That message will not be sent.',
          },
        ]);
        router.refresh();
      } catch {
        setOutcomes((prev) => [
          ...prev,
          {
            key: `${requestId}-${Date.now()}`,
            ok: false,
            message:
              'That message could not be withdrawn — check your connection and try again. It is still waiting to be sent.',
          },
        ]);
      } finally {
        setBusyId(null);
      }
    },
    [router]
  );

  const hoursLabel = `${autoSendHours} hour${autoSendHours === 1 ? '' : 's'}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My all-college messages</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Messages you addressed to every college wait for one approval before they go out. Anything
          you send to your own college goes out immediately and is not listed here.
        </p>
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {configUnreadable ? (
          <>This page could not read who decides on these messages. They still send themselves after {hoursLabel}.</>
        ) : approverIsNamed ? (
          <>
            <span className="font-medium text-foreground">{approverName || 'The named approver'}</span>{' '}
            decides on these. Anything left undecided for {hoursLabel} sends itself — no answer counts
            as a yes.
          </>
        ) : (
          <>
            No approver has been named yet, so nobody will actively approve these — each one simply
            sends itself {hoursLabel} after you submit it. Withdraw it before then if you change your
            mind.
          </>
        )}
      </div>

      {outcomes.length > 0 && (
        <div className="space-y-2">
          {outcomes.map((outcome) => (
            <div
              key={outcome.key}
              className={
                outcome.ok
                  ? 'rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100'
                  : 'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
              }
            >
              {outcome.message}
            </div>
          ))}
        </div>
      )}

      {readFailed ? (
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <p className="font-medium">Your messages could not be read.</p>
            <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
              This is a failure, not an empty list. Do not assume a message you sent has gone away —
              reload the page, and tell the Learners Council office if it keeps happening.
            </p>
          </CardContent>
        </Card>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="font-medium">You have not sent an all-college message.</p>
            <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
              The list loaded correctly and was empty. Messages to your own college go out
              immediately and never appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const status = describeStatus(request.status);
            const isWaiting = request.status === 'pending';

            return (
              <Card
                key={request.id}
                className={isWaiting ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-muted'}
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-base font-semibold">{request.title}</h2>
                    <Badge variant={TONE_BADGE[status.tone] || 'outline'} className="flex-shrink-0">
                      {status.label}
                    </Badge>
                  </div>

                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.body}</p>

                  {isWaiting ? (
                    <CountdownLine autoSendAt={request.autoSendAt} nowMs={nowMs} voice="sender" />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {status.detail}{' '}
                      {request.decidedAt ? `Decided ${formatMoment(request.decidedAt)}.` : ''}
                    </p>
                  )}

                  <ReachLines request={request} />

                  {request.decisionNote && (
                    <div className="flex items-start gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      <MessageSquareQuote className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span>
                        <span className="text-muted-foreground">Note back: </span>
                        {request.decisionNote}
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Submitted {formatMoment(request.createdAt)}
                  </p>

                  {isWaiting && (
                    <div className="border-t pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === request.id}
                        onClick={() => cancel(request.id)}
                      >
                        <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                        {busyId === request.id ? 'Withdrawing…' : 'Withdraw this message'}
                      </Button>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Once it has gone out it cannot be recalled — a wrong message is corrected by
                        sending a new one.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
