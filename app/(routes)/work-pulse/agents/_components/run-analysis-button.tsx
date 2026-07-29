'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';

// "Run weekly analysis on Max" — the page hands the AI its data. This button
// POSTs to /api/work-pulse/analyze, which assembles the pulse/behaviour data,
// enqueues a `work_pulse.analyze` job on the Claude Max lane (fn_ai_enqueue),
// long-polls fn_ai_job_status, upserts the discovered patterns, and returns a
// summary. The route holds the connection while the drain runs (~45s expected),
// so this is a single long request — we show a live elapsed timer next to the
// expected time while it runs (mirrors the ai-query timer pattern).
//
// Inbox / "if slow" fallback: the analysis result is DURABLE — it is written to
// the wp_patterns board server-side as soon as the job completes, whether or not
// this request's response makes it back to the browser. If the request times out
// or the user leaves mid-wait, the patterns still land on the board; the button
// tells the user to refresh in a minute, and router.refresh() re-reads the board.
// (The generic runner's completed result is also retained in the ai_jobs row.)

const EXPECTED_SECONDS = 45;
// A hair below the route's own 285s long-poll deadline so we let the server
// respond first when it can, then fall back to the durable-board message.
const CLIENT_TIMEOUT_MS = 290_000;

export function RunAnalysisButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setElapsed(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    const loadingId = toast.loading('Analysing this week’s pulse on Max…');

    try {
      const res = await fetch('/api/work-pulse/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Explicit failure surface (never silent) — show the server's reason.
        toast.error(data?.error || 'Analysis could not be completed.', { id: loadingId });
        return;
      }

      if (typeof data?.patterns_updated === 'number' && data?.message === 'Analysis complete') {
        toast.success(
          `Analysis complete — ${data.patterns_updated} pattern${
            data.patterns_updated === 1 ? '' : 's'
          } updated.`,
          { id: loadingId }
        );
      } else {
        // e.g. "No entries to analyze this week"
        toast.success(data?.message || 'Analysis finished.', { id: loadingId });
      }
      // Re-read the board so new/updated patterns show immediately.
      router.refresh();
    } catch (err) {
      // Timed out at the client, or the user's connection dropped mid-wait.
      // The job may still be running on Max and its patterns will land on the
      // board — point the user back here to see them (durable inbox fallback).
      const aborted = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
      toast.error(
        aborted
          ? 'Still analysing on Max — refresh the board in a minute to see new patterns.'
          : 'Could not reach the analysis service. Please try again.',
        { id: loadingId }
      );
    } finally {
      stopTimer();
      setRunning(false);
    }
  }, [running, router, stopTimer]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {running && (
        <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {elapsed}s elapsed · expected ~{EXPECTED_SECONDS}s
        </span>
      )}
      <Button onClick={run} disabled={running} size="sm">
        {running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Analysing…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Run weekly analysis
          </>
        )}
      </Button>
    </div>
  );
}
