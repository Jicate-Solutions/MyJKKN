'use client';

// app/(routes)/meetings/polls/_components/polls-manager.tsx
//
// Client manager for the Meeting Polls list + create flow (Universal Booking
// M5). Lists the host's polls and provides a "New poll" form where the host
// names the poll, sets a duration, and adds 2+ candidate times. Submits via
// the createPollAction server action.
//
// Candidate times are entered with the native datetime-local input and sent as
// ISO instants. The browser interprets datetime-local in the user's local zone
// (IST for JKKN staff), which is what we want — the public widget then renders
// every option in IST.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  Plus,
  Trash2,
  Vote,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { createPollAction, deletePollAction } from '../actions';
import type { PollSummary } from '@/lib/services/meetings/meeting-poll-service';

const IST = 'Asia/Kolkata';

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

interface DraftOption {
  /** value of the datetime-local input ("YYYY-MM-DDTHH:mm" in local time). */
  local: string;
}

export function PollsManager({ initialPolls }: { initialPolls: PollSummary[] }) {
  const router = useRouter();
  const [polls, setPolls] = useState<PollSummary[]>(initialPolls);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [options, setOptions] = useState<DraftOption[]>([{ local: '' }, { local: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function resetForm() {
    setTitle('');
    setDescription('');
    setDurationMin(30);
    setOptions([{ local: '' }, { local: '' }]);
    setError(null);
  }

  async function submit() {
    setError(null);
    const isoOptions = options
      .map((o) => o.local)
      .filter(Boolean)
      .map((local) => {
        const d = new Date(local); // local time → instant
        return Number.isNaN(d.getTime()) ? null : { start: d.toISOString() };
      })
      .filter((o): o is { start: string } => o !== null);

    if (!title.trim()) {
      setError('Please give the poll a title.');
      return;
    }
    if (isoOptions.length < 2) {
      setError('Add at least two candidate times.');
      return;
    }

    setBusy(true);
    try {
      const res = await createPollAction({
        title: title.trim(),
        description: description.trim() || null,
        durationMin,
        options: isoOptions,
      });
      if (!res.success || !res.data) {
        setError(res.error ?? 'Could not create the poll.');
        return;
      }
      // Refresh from the server so the new poll appears with its tallies.
      resetForm();
      setShowForm(false);
      router.refresh();
      // Optimistic prepend so the list updates immediately even before refresh.
      setPolls((prev) => [
        {
          id: res.data!.pollId,
          slug: res.data!.slug,
          title: title.trim(),
          description: description.trim() || null,
          durationMin,
          status: 'open',
          winningOptionId: null,
          bookingId: null,
          optionCount: isoOptions.length,
          totalVotes: 0,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function remove(pollId: string) {
    const res = await deletePollAction(pollId);
    if (res.success) {
      setPolls((prev) => prev.filter((p) => p.id !== pollId));
      router.refresh();
    } else {
      setError(res.error ?? 'Could not delete the poll.');
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/poll/${slug}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(slug);
        setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
      },
      () => setError('Could not copy the link.'),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Propose several times, share the link, and confirm the winner once votes are in.
        </p>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> New poll
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

      {/* ── Create form ──────────────────────────────────────────────── */}
      {showForm && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">New meeting poll</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="poll-title">Title</Label>
              <Input
                id="poll-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
                placeholder="e.g. Q3 planning sync"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="poll-desc">Description (optional)</Label>
              <Textarea
                id="poll-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="What's this meeting about?"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="poll-duration">Duration (minutes)</Label>
              <Input
                id="poll-duration"
                type="number"
                min={1}
                max={1440}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value) || 30)}
                className="w-32"
              />
            </div>

            <div className="grid gap-2">
              <Label>Candidate times (add at least two)</Label>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="datetime-local"
                    value={opt.local}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((o, j) => (j === i ? { local: e.target.value } : o)),
                      )
                    }
                    className="max-w-[16rem]"
                  />
                  {options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove time"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setOptions((prev) => [...prev, { local: '' }])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add another time
              </Button>
              <p className="text-xs text-muted-foreground">
                Times are in your local timezone (IST) and shown to invitees in IST.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Vote className="mr-1.5 h-4 w-4" />
                )}
                {busy ? 'Creating…' : 'Create poll'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Poll list ────────────────────────────────────────────────── */}
      {polls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Vote className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No polls yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create a poll to let invitees vote on the time that suits them best.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {polls.map((poll) => (
            <Card key={poll.id}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/meetings/polls/${poll.id}`}
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {poll.title}
                    </Link>
                    {poll.status === 'closed' ? (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" /> Confirmed
                      </Badge>
                    ) : (
                      <Badge variant="default" className="gap-1">
                        <Vote className="h-3 w-3" /> Open
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {poll.optionCount} times
                    </span>
                    <span>
                      {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
                    </span>
                    <span>{poll.durationMin} min</span>
                    <span>Created {fmtDate(poll.createdAt)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {poll.status === 'open' && (
                    <Button variant="outline" size="sm" onClick={() => copyLink(poll.slug)}>
                      {copied === poll.slug ? (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copied === poll.slug ? 'Copied' : 'Copy link'}
                    </Button>
                  )}
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/meetings/polls/${poll.id}`}>Results</Link>
                  </Button>
                  {poll.status === 'open' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(poll.id)}
                      aria-label="Delete poll"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
