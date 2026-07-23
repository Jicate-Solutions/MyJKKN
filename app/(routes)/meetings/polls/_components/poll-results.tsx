'use client';

// app/(routes)/meetings/polls/_components/poll-results.tsx
//
// Per-poll results + confirm-winner (Universal Booking M5). Renders each
// candidate time with a vote bar; for an open poll the host can confirm a
// winner (which closes the poll and creates a confirmed booking). A closed
// poll shows the confirmed time as a read-only summary.
//
// The confirm action uses a two-tap guard (select → confirm) so a single
// misclick never books a meeting.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  Trophy,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { confirmWinnerAction } from '../actions';
import type { PollDetail } from '@/lib/services/meetings/meeting-poll-service';

const IST = 'Asia/Kolkata';

const istFull = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export function PollResults({ poll }: { poll: PollDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null); // selected option awaiting confirm
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const maxVotes = useMemo(
    () => Math.max(1, ...poll.options.map((o) => o.voteCount)),
    [poll.options],
  );
  const leaderId = useMemo(() => {
    let best: string | null = null;
    let bestVotes = -1;
    for (const o of poll.options) {
      if (o.voteCount > bestVotes) {
        bestVotes = o.voteCount;
        best = o.id;
      }
    }
    return bestVotes > 0 ? best : null;
  }, [poll.options]);

  const winningOption = poll.options.find((o) => o.id === poll.winningOptionId) ?? null;
  const isClosed = poll.status === 'closed';

  async function confirm(optionId: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await confirmWinnerAction(poll.id, optionId);
      if (!res.success) {
        setError(res.error ?? 'Could not confirm the winner.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/poll/${poll.slug}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setError('Could not copy the link.'),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{poll.title}</h2>
            {isClosed ? (
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" /> Confirmed
              </Badge>
            ) : (
              <Badge variant="default">Open</Badge>
            )}
          </div>
          {poll.description && (
            <p className="mt-1 text-sm text-muted-foreground">{poll.description}</p>
          )}
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {poll.totalVotes}{' '}
              {poll.totalVotes === 1 ? 'vote' : 'votes'}
            </span>
            <span>{poll.durationMin} min</span>
          </p>
        </div>
        {!isClosed && (
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            {copied ? 'Copied' : 'Copy voting link'}
          </Button>
        )}
      </div>

      {error && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Confirmed summary */}
      {isClosed && winningOption && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="flex items-center gap-3 py-4">
            <CalendarCheck className="h-6 w-6 shrink-0 text-green-700" />
            <div>
              <p className="text-sm font-semibold text-green-900">Confirmed time</p>
              <p className="text-sm text-green-800">{istFull(winningOption.startTime)} (IST)</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Options with vote bars */}
      <div className="flex flex-col gap-3">
        {poll.options.map((opt) => {
          const isWinner = isClosed && opt.id === poll.winningOptionId;
          const isLeader = !isClosed && opt.id === leaderId;
          const pct = Math.round((opt.voteCount / maxVotes) * 100);
          return (
            <Card key={opt.id} className={isWinner ? 'border-green-300' : undefined}>
              <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {istFull(opt.startTime)} (IST)
                    {isWinner && (
                      <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
                        <Trophy className="h-3 w-3" /> Winner
                      </Badge>
                    )}
                    {isLeader && !isClosed && (
                      <Badge variant="secondary" className="gap-1">
                        <Trophy className="h-3 w-3" /> Leading
                      </Badge>
                    )}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${isWinner ? 'bg-green-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                      {opt.voteCount} {opt.voteCount === 1 ? 'vote' : 'votes'}
                    </span>
                  </div>
                </div>

                {!isClosed && (
                  <div className="flex shrink-0 items-center gap-2">
                    {pending === opt.id ? (
                      <>
                        <Button size="sm" onClick={() => confirm(opt.id)} disabled={busy}>
                          {busy ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Confirm this time
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPending(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPending(opt.id);
                          setError(null);
                        }}
                        disabled={busy}
                      >
                        Confirm winner
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isClosed && (
        <p className="text-xs text-muted-foreground">
          Confirming a time closes the poll and creates a confirmed booking on your calendar.
        </p>
      )}
    </div>
  );
}
