'use client';

// The approver's queue — one card per change picked for this week.
//
// Reads GET /api/whats-new/highlights?queue=1 and writes back through
// PUT /api/whats-new/highlights. Both ends re-check whats_new.highlights.manage
// server-side; the buttons here are a courtesy, not the gate.
//
// Three lines per card, and they are the whole point. "What changed" alone is
// what the plain list already carries and is the complaint this answers, so a
// card cannot be approved until all three are filled in — the route says so in
// a sentence and the table holds it as a CHECK.
//
// SKIP IS A DECISION, NOT A DELETE. A skipped change stays in the table with
// status 'skipped' so selection never offers it again. Without that, the same
// entry would come back every week until someone wrote it up, and a queue that
// repeats itself is a queue people stop reading.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, X, AlertCircle, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Status = 'draft' | 'approved' | 'skipped';

interface Candidate {
  sha: string;
  date: string;
  kind: 'new' | 'fixed' | 'security';
  module_key: string;
  module_label: string;
  subject: string;
  pr_number: number | null;
  breaking: boolean;
  score: number;
  reason: string;
  suggestedAffects: string;
}

interface Saved {
  sha: string;
  headline: string | null;
  affects: string | null;
  action: string | null;
  status: Status;
  selection_reason: string | null;
}

interface QueueBody {
  weekFrom: string;
  saved: Saved[];
  candidates: Candidate[];
}

interface Draft {
  headline: string;
  affects: string;
  action: string;
}

function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function HighlightQueue() {
  const [body, setBody] = useState<QueueBody | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/whats-new/highlights?queue=1', { cache: 'no-cache' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(json?.error ?? `The queue could not be loaded (HTTP ${res.status}).`);
        return;
      }
      setBody(json as QueueBody);
    } catch {
      setLoadError('The queue could not be loaded — the request did not reach the server.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savedBySha = useMemo(() => {
    const m = new Map<string, Saved>();
    for (const s of body?.saved ?? []) m.set(s.sha, s);
    return m;
  }, [body]);

  /** The text on screen for one card: what has been typed, else what was saved. */
  const draftFor = useCallback(
    (c: Candidate): Draft => {
      const typed = drafts[c.sha];
      if (typed) return typed;
      const saved = savedBySha.get(c.sha);
      return {
        headline: saved?.headline ?? '',
        affects: saved?.affects ?? c.suggestedAffects,
        action: saved?.action ?? '',
      };
    },
    [drafts, savedBySha]
  );

  const setField = (sha: string, field: keyof Draft, value: string, current: Draft) => {
    setDrafts((d) => ({ ...d, [sha]: { ...current, [field]: value } }));
  };

  async function write(c: Candidate, status: Status, draft: Draft) {
    setBusy(c.sha);
    setRowError((e) => ({ ...e, [c.sha]: '' }));
    try {
      const res = await fetch('/api/whats-new/highlights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sha: c.sha,
          status,
          headline: draft.headline,
          affects: draft.affects,
          action: draft.action,
          selection_reason: c.reason,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setRowError((e) => ({
          ...e,
          [c.sha]: json?.error ?? `Nothing was saved (HTTP ${res.status}).`,
        }));
        return;
      }
      // Re-read rather than patch state by hand: the queue drops anything now
      // decided, and reconstructing that here would be a second copy of a rule
      // the server already applies.
      setDrafts((d) => {
        const next = { ...d };
        delete next[c.sha];
        return next;
      });
      await load();
    } catch {
      setRowError((e) => ({ ...e, [c.sha]: 'Nothing was saved — the request did not reach the server.' }));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div>
            <p className="font-medium">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!body) {
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading this week’s changes…
        </span>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const approvedCount = body.saved.filter((s) => s.status === 'approved').length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Week beginning <span className="font-medium text-foreground">{formatDay(body.weekFrom)}</span> ·{' '}
        <span className="font-medium text-foreground">{approvedCount}</span>{' '}
        {approvedCount === 1 ? 'highlight is' : 'highlights are'} live on What’s New ·{' '}
        <span className="font-medium text-foreground">{body.candidates.length}</span> waiting for a write-up
      </p>

      {body.candidates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ListChecks className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 font-medium">Nothing is waiting</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every change picked for this week has been written up or set aside. New ones appear as
              they ship.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {body.candidates.map((c) => {
            const draft = draftFor(c);
            const saved = savedBySha.get(c.sha);
            const isBusy = busy === c.sha;
            const complete =
              draft.headline.trim() !== '' && draft.affects.trim() !== '' && draft.action.trim() !== '';
            const err = rowError[c.sha];
            return (
              <li key={c.sha} className="rounded-xl border bg-card p-4 sm:p-5">
                {/* What the reader sees today — the developer's own words. Kept
                    in view so the write-up is checked against the change, not
                    written from memory. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.module_label}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDay(c.date)}</span>
                  {c.pr_number && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">#{c.pr_number}</span>
                    </>
                  )}
                  {c.breaking && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      Breaking
                    </span>
                  )}
                  {saved?.status === 'approved' && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Live
                    </span>
                  )}
                </div>
                <p className="mt-1.5 break-words text-sm text-foreground">{c.subject}</p>
                <p className="mt-1 text-xs italic text-muted-foreground">{c.reason}</p>

                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor={`headline-${c.sha}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      Headline — plain English, no prefix, no number
                    </label>
                    <Input
                      id={`headline-${c.sha}`}
                      value={draft.headline}
                      onChange={(e) => setField(c.sha, 'headline', e.target.value, draft)}
                      placeholder="Global search now respects your access limits."
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`affects-${c.sha}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      Who it affects
                    </label>
                    <Input
                      id={`affects-${c.sha}`}
                      value={draft.affects}
                      onChange={(e) => setField(c.sha, 'affects', e.target.value, draft)}
                      placeholder="Everyone signed in."
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`action-${c.sha}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      What you can do now, and where to find it
                    </label>
                    <Textarea
                      id={`action-${c.sha}`}
                      rows={2}
                      value={draft.action}
                      onChange={(e) => setField(c.sha, 'action', e.target.value, draft)}
                      placeholder="Open Analytics → Engagement; other colleges’ numbers are gone."
                    />
                  </div>
                </div>

                {err && (
                  <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{err}</span>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy || !complete}
                    aria-busy={isBusy}
                    onClick={() => void write(c, 'approved', draft)}
                  >
                    {isBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void write(c, 'draft', draft)}
                  >
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => void write(c, 'skipped', draft)}
                  >
                    <X className="mr-2 h-4 w-4" aria-hidden="true" />
                    Not worth a write-up
                  </Button>
                  <span
                    className={cn(
                      'text-xs',
                      complete ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'
                    )}
                  >
                    {complete ? 'Ready to approve' : 'All three lines are needed before approving'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
