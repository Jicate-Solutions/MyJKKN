'use client';

// components/ai-tasks/ai-task-button.tsx
// The "AI Max button". Click → enqueues an async AI task on the 50% batch lane
// (NEVER the Max subscription) → shows an ETA → reflects the result back when the
// */15 sweep finishes. Resumes state on mount so returning to the page shows a
// ready result. Spec: specs/ai-max-button-async-lane-2026-07-04.md (P1/P2).
//
// The ready summary lives in a Popover (not an inline card) so it never expands
// the table row it sits in. `autoOpen` opens that popover on mount — used by the
// P2 deep-link (?course=) so clicking the "ready" notification lands on the class
// AND pops the summary open in one step.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

type TaskStatus = 'queued' | 'submitting' | 'submitted' | 'done' | 'failed' | 'skipped';

interface Suggestion {
  summary?: string;
  likelyCauses?: string[];
  suggestedAdjustments?: { title?: string; how?: string }[];
  quickWin?: string;
  whatToWatchNext?: string;
}
interface TaskResult {
  suggestion?: Suggestion | null;
  reason?: string;
  meta?: { responses?: number; avg_understood?: number | null };
}
interface TaskRow {
  id: string;
  status: TaskStatus;
  result?: TaskResult | null;
  error?: string | null;
}

interface Props {
  taskType: string;
  entityId: string;
  label?: string;
  className?: string;
  /** Open the result popover on mount (P2 deep-link to the exact class). */
  autoOpen?: boolean;
  /** Ready-state button text. Defaults to the pilot's copy. */
  readyLabel?: string;
  /** Popover heading. Defaults to the pilot's copy. */
  popoverTitle?: string;
}

const OUTSTANDING: TaskStatus[] = ['queued', 'submitting', 'submitted'];
const POLL_MS = 20000;
// After this long still pending, the ₹0 Max lane is slow or its worker is down
// (there is no paid fallback for these tasks). Rather than spin forever on a
// misleading "ready soon", switch to an honest "still queued — check back" note.
// The task is NOT failed — it stays queued and completes when the lane catches up
// — so polling continues; only the copy changes. 3 min is well past a normal
// completion, so it fires only when the lane is genuinely behind.
const SLOW_MS = 180000;

export function AiTaskButton({
  taskType,
  entityId,
  label = 'Summarise with AI',
  className,
  autoOpen = false,
  readyLabel = 'AI summary ready',
  popoverTitle = "AI summary of this class's feedback",
}: Props) {
  const [phase, setPhase] = useState<'idle' | 'pending' | 'ready' | 'failed'>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [eta, setEta] = useState<string>('');
  const [result, setResult] = useState<TaskResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyRow = useCallback((row: TaskRow | undefined) => {
    if (!row) { setPhase('idle'); return; }
    setTaskId(row.id);
    if (row.status === 'done') {
      setResult(row.result ?? null);
      setPhase('ready');
      // P2 deep-link: if we arrived here via the ready notification (?course=),
      // pop the summary open. Runs inside the resume fetch callback (async), so
      // it's not a synchronous setState-in-effect.
      if (autoOpen && row.result?.suggestion) setPopoverOpen(true);
    }
    else if (row.status === 'failed') { setErrorMsg(row.error || 'Could not generate.'); setPhase('failed'); }
    else if (OUTSTANDING.includes(row.status)) { setPhase('pending'); }
  }, [autoOpen]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Resume state on mount: is there a recent task for this (feature, entity)?
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/ai-tasks/status?feature=${encodeURIComponent(taskType)}&entity=${encodeURIComponent(entityId)}`);
        const json = await res.json();
        if (alive && json.ok) applyRow(json.tasks?.[0]);
      } catch { /* stay idle */ }
    })();
    return () => { alive = false; };
  }, [taskType, entityId, applyRow]);

  // Poll while a task is outstanding.
  useEffect(() => {
    if (phase !== 'pending' || !taskId) { stopPoll(); return; }
    const tick = async () => {
      try {
        const res = await fetch(`/api/ai-tasks/status?ids=${encodeURIComponent(taskId)}`);
        const json = await res.json();
        const row: TaskRow | undefined = json.ok ? json.tasks?.[0] : undefined;
        if (!row) return;
        if (row.status === 'done') { setResult(row.result ?? null); setPhase('ready'); stopPoll(); }
        else if (row.status === 'failed') { setErrorMsg(row.error || 'Could not generate.'); setPhase('failed'); stopPoll(); }
      } catch { /* keep polling */ }
    };
    pollRef.current = setInterval(tick, POLL_MS);
    return stopPoll;
  }, [phase, taskId, stopPoll]);

  // Slow-lane / worker-down copy: once pending exceeds SLOW_MS, stop implying
  // "ready soon" and reassure the user it is safely queued (see SLOW_MS). Reset
  // whenever we leave 'pending' (idle/ready/failed) or a fresh re-enqueue (new taskId).
  useEffect(() => {
    if (phase !== 'pending') { setSlow(false); return; }
    setSlow(false);
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [phase, taskId]);

  const enqueue = useCallback(async () => {
    setPhase('pending'); setResult(null); setErrorMsg(''); setPopoverOpen(false);
    try {
      const res = await fetch('/api/ai-tasks/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType, entityId }),
      });
      const json = await res.json();
      if (!json.ok) { setErrorMsg(json.error || 'Could not queue.'); setPhase('failed'); return; }
      setTaskId(json.task_id);
      setEta(json.eta || 'shortly');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not queue.'); setPhase('failed');
    }
  }, [taskType, entityId]);

  // ── render ──
  if (phase === 'pending') {
    return (
      <div className={className}>
        <span className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          {slow ? 'Queued · taking longer than usual' : `Queued · ${eta || 'ready soon'}`}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">
          {slow
            ? 'The AI is busy right now — your request is safely queued and will finish in the background. You can close this and check back in a few minutes.'
            : 'Runs in the background — you can leave this page and come back.'}
        </p>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className={className}>
        <span className="inline-flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {errorMsg || 'Could not generate.'}
        </span>
        <Button variant="outline" size="sm" className="ml-2" onClick={enqueue}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    );
  }

  if (phase === 'ready') {
    const s = result?.suggestion;
    if (!s) {
      const msg = result?.reason === 'not_enough_feedback'
        ? 'Not enough feedback yet to summarise (needs at least 3 responses).'
        : result?.reason === 'ai_not_configured'
          ? 'AI is not configured right now.'
          : 'No summary available.';
      return (
        <div className={className}>
          <p className="text-sm text-muted-foreground">{msg}</p>
          <Button variant="ghost" size="sm" className="mt-1" onClick={enqueue}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Check again
          </Button>
        </div>
      );
    }
    return (
      <div className={className}>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
            >
              <Sparkles className="mr-1.5 h-4 w-4" /> {readyLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96 max-h-[70vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" /> {popoverTitle}
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={enqueue} title="Regenerate">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {s.summary && <p className="mt-2 text-sm">{s.summary}</p>}
            <div className="mt-3 space-y-3 text-sm">
              {Array.isArray(s.likelyCauses) && s.likelyCauses.length > 0 && (
                <div>
                  <p className="font-medium">Likely causes</p>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {s.likelyCauses.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(s.suggestedAdjustments) && s.suggestedAdjustments.length > 0 && (
                <div>
                  <p className="font-medium">Suggested adjustments</p>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {s.suggestedAdjustments.map((a, i) => (
                      <li key={i}><span className="font-medium text-foreground">{a.title}</span>{a.how ? ` — ${a.how}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              {s.quickWin && <div><p className="font-medium">Quick win</p><p className="text-muted-foreground">{s.quickWin}</p></div>}
              {s.whatToWatchNext && <div><p className="font-medium">What to watch next</p><p className="text-muted-foreground">{s.whatToWatchNext}</p></div>}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // idle
  return (
    <Button variant="outline" size="sm" className={className} onClick={enqueue}>
      <Sparkles className="mr-1.5 h-4 w-4" /> {label}
    </Button>
  );
}
