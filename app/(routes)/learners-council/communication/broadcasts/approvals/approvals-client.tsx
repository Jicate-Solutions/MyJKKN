'use client';

/**
 * The approver's queue.
 *
 * Three things this screen refuses to do:
 *   1. Show a countdown that is stale. It ticks in the browser, so the number
 *      on screen is the number right now.
 *   2. Report a headcount it could not establish. The colleges a message names
 *      are exact and always shown; the learner count appears only when it was
 *      actually counted.
 *   3. Succeed silently. Every decision prints its outcome — including the
 *      database's own refusal sentence, verbatim, when it refuses.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Inbox,
  AlertTriangle,
  UserRound,
} from 'lucide-react';
import { formatMoment } from '@/lib/learners-council/broadcast-reach';
import type { BroadcastRequestView } from '@/lib/learners-council/broadcast-server';
import { CountdownLine, ReachLines, useLiveClock } from '../_components/broadcast-bits';

interface Outcome {
  key: string;
  ok: boolean;
  message: string;
}

interface BroadcastApprovalsClientProps {
  initialRequests: BroadcastRequestView[];
  readFailed: boolean;
  approverName: string | null;
  approverIsNamed: boolean;
  configUnreadable: boolean;
  autoSendHours: number;
  viewerIsAdministrator: boolean;
}

export function BroadcastApprovalsClient({
  initialRequests,
  readFailed,
  approverName,
  approverIsNamed,
  configUnreadable,
  autoSendHours,
  viewerIsAdministrator,
}: BroadcastApprovalsClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  // Ids decided in this tab, hidden immediately so the queue reflects the click
  // without waiting for the refetch. Derived rather than copied into state: once
  // router.refresh() brings fresh rows the decided ones are already gone from
  // them, so this filter quietly becomes a no-op instead of drifting out of step
  // with the server.
  const [decidedIds, setDecidedIds] = useState<ReadonlySet<string>>(new Set());
  const requests = initialRequests.filter((request) => !decidedIds.has(request.id));
  const nowMs = useLiveClock();

  const decide = useCallback(
    async (requestId: string, approve: boolean) => {
      const note = (notes[requestId] || '').trim();

      // The database refuses a rejection with no reason, on purpose — the
      // sender has to know what to change. Say so here rather than making
      // somebody discover it by being refused.
      if (!approve && note.length === 0) {
        setOutcomes((prev) => [
          ...prev,
          {
            key: `${requestId}-${Date.now()}`,
            ok: false,
            message:
              'Please write a short reason before rejecting, so the sender knows what to change.',
          },
        ]);
        return;
      }

      setBusyId(requestId);

      try {
        const response = await fetch('/api/learners-council/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: approve ? 'approve' : 'reject',
            request_id: requestId,
            note: note.length > 0 ? note : null,
          }),
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
                `The decision was not recorded (the server answered ${response.status}). Nothing has changed.`,
            },
          ]);
          return;
        }

        setDecidedIds((prev) => new Set(prev).add(requestId));
        setOutcomes((prev) => [
          ...prev,
          {
            key: `${requestId}-${Date.now()}`,
            ok: true,
            message: approve
              ? 'Approved. The message has gone out to the learners it names.'
              : 'Rejected. The sender can read your reason and send a corrected message.',
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
              'The decision could not be sent — check your connection and try again. Nothing has changed.',
          },
        ]);
      } finally {
        setBusyId(null);
      }
    },
    [notes, router]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">All-college message approvals</h1>
        <p className="text-sm text-muted-foreground">
          Messages the Learners Council wants to send to every college wait here for one decision.
        </p>
      </div>

      <ApproverBanner
        approverIsNamed={approverIsNamed}
        approverName={approverName}
        configUnreadable={configUnreadable}
        autoSendHours={autoSendHours}
        viewerIsAdministrator={viewerIsAdministrator}
      />

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
            <p className="font-medium">The waiting list could not be read.</p>
            <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
              This is a failure, not an empty queue — there may well be messages waiting. Reload the
              page, and tell the Learners Council office if it keeps happening.
            </p>
          </CardContent>
        </Card>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="font-medium">Nothing is waiting for a decision.</p>
            <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
              The list loaded correctly and had no messages in it. If you were expecting one, it may
              already have been decided, cancelled, or sent automatically — or it may be held under
              an account other than yours.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} className="border-l-4 border-l-amber-400">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{request.title}</h2>
                  <Badge variant="secondary" className="flex-shrink-0">
                    <Clock className="mr-1 h-3 w-3" />
                    Waiting since {formatMoment(request.createdAt)}
                  </Badge>
                </div>

                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.body}</p>

                <CountdownLine autoSendAt={request.autoSendAt} nowMs={nowMs} voice="approver" />

                <ReachLines request={request} />

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <UserRound className="h-4 w-4" />
                  <span>
                    Asked for by{' '}
                    <span className="font-medium text-foreground">
                      {request.requesterName || 'a council member whose name could not be read'}
                    </span>
                    {request.requesterCollege ? ` — ${request.requesterCollege}` : ''}
                  </span>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <Label htmlFor={`note-${request.id}`}>
                    Note to the sender{' '}
                    <span className="font-normal text-muted-foreground">
                      (optional to approve, required to reject)
                    </span>
                  </Label>
                  <Textarea
                    id={`note-${request.id}`}
                    rows={2}
                    placeholder="Why you approved, or what needs to change before this can go out"
                    value={notes[request.id] || ''}
                    onChange={(event) =>
                      setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      disabled={busyId === request.id}
                      onClick={() => decide(request.id, true)}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      {busyId === request.id ? 'Working…' : 'Approve and send'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === request.id}
                      onClick={() => decide(request.id, false)}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Whether anyone actually holds the approver seat.
 *
 * On production nobody does yet, and that is not a state to hide: it changes
 * what this queue means. With no named approver, every all-college message
 * leaves on the clock alone, so the banner says exactly that.
 */
function ApproverBanner({
  approverIsNamed,
  approverName,
  configUnreadable,
  autoSendHours,
  viewerIsAdministrator,
}: {
  approverIsNamed: boolean;
  approverName: string | null;
  configUnreadable: boolean;
  autoSendHours: number;
  viewerIsAdministrator: boolean;
}) {
  const hoursLabel = `${autoSendHours} hour${autoSendHours === 1 ? '' : 's'}`;

  if (configUnreadable) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        This page could not read who the named approver is. You can still decide, but treat the seat
        as unconfirmed until the Learners Council office says otherwise.
      </div>
    );
  }

  if (!approverIsNamed) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        No approver has been named yet, so all-college messages will send themselves after{' '}
        {hoursLabel} whether or not anyone looks at this page.
        {viewerIsAdministrator
          ? ' You can decide here because you are an administrator — a decision made now still counts.'
          : ''}
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{approverName || 'The named approver'}</span>{' '}
      holds the approver seat. Anything left undecided for {hoursLabel} sends itself.
    </div>
  );
}
