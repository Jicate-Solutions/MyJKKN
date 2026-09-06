'use client';

// Resource-person live-pulse control for ONE induction session. Open a pulse,
// watch anonymized live totals (polled every 8s, k>=3 floor enforced server-side),
// and close early. Auto-closes after 240 min server-side; this UI reflects that
// when a poll returns is_open=false. Rendered per session inside SessionsLedCard,
// so it appears on both /learners/my-induction and /my-induction-sessions.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Radio, Square, Users, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  InductionPulseService,
  type InductionPulse,
  type PulseTotals,
} from '@/lib/services/induction/induction-pulse-service';

function minutesLeft(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

export function SessionPulseControl({ sessionId }: { sessionId: string }) {
  const [pulse, setPulse] = useState<InductionPulse | null>(null);
  const [totals, setTotals] = useState<PulseTotals | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }
  useEffect(() => stopPolling, []);

  async function refreshTotals(pid: string) {
    try {
      const t = await InductionPulseService.getSessionPulseTotals(pid);
      setTotals(t);
      if (t && !t.is_open) {
        stopPolling(); // server auto-closed (240 min) — reflect it
        setPulse(null);
      }
    } catch {
      /* transient poll error — keep last totals */
    }
  }

  function startPolling(pid: string) {
    stopPolling();
    timer.current = setInterval(() => refreshTotals(pid), 8000);
  }

  async function open() {
    setBusy(true);
    try {
      const p = await InductionPulseService.openSessionPulse(sessionId);
      setPulse(p);
      if (p) {
        await refreshTotals(p.id);
        startPolling(p.id);
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not open the pulse');
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!pulse) return;
    setBusy(true);
    try {
      await InductionPulseService.closeSessionPulse(pulse.id);
      stopPolling();
      setPulse(null);
      setTotals(null);
      toast.success('Live pulse closed');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not close the pulse');
    } finally {
      setBusy(false);
    }
  }

  const live = pulse !== null && (totals?.is_open ?? true);

  if (!live) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={open}
        disabled={busy}
      >
        <Radio className="h-3 w-3 mr-1" />
        Open live pulse
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-emerald-700">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live pulse open
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={close} disabled={busy}>
          <Square className="h-3 w-3 mr-1" />
          Close
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {totals?.response_count ?? 0}
          {totals?.enrolled_count ? ` / ${totals.enrolled_count}` : ''} responded
        </span>
        {totals && !totals.suppressed && totals.avg_rating != null && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {Number(totals.avg_rating).toFixed(1)}
          </span>
        )}
        {totals?.suppressed && <span>ratings hidden until 3 responses</span>}
        {totals?.auto_close_at && <span>· {minutesLeft(totals.auto_close_at)}m left</span>}
      </div>
    </div>
  );
}
