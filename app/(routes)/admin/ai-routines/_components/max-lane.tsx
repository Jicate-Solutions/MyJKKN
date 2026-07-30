'use client';

// ============================================================================
// Max Lane — "Run on Max" button + status for routines that run on the
// Director's Claude Max subscription via a Mac-side scheduled runner.
//
// The button queues a request row (POST /api/admin/ai-routines/max-run →
// fn_max_lane_request_run); a Mac poller claims + completes it. This component
// only WRITES the request and READS its latest status — it never runs anything
// itself. Status polling is lifted to the parent hook so the whole page makes
// one GET per tick, and polling stops the moment nothing is active.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const BRAND = '#0b6d41';

export type MaxLaneRequest = {
  id: string;
  routine_id: string;
  status: 'pending' | 'claimed' | 'done' | 'error';
  requested_at: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  result_note: string | null;
};

const ACTIVE_STATUSES = new Set(['pending', 'claimed']);

/**
 * Loads the LATEST Max-lane request per routine_id into a Map. Polls every 15s
 * ONLY while at least one request is still active (pending/claimed) and stops
 * once everything is settled (done/error) — it never polls forever. Any fetch
 * failure is silent (the button + status simply don't update).
 */
export function useMaxLaneRequests() {
  const [map, setMap] = useState<Map<string, MaxLaneRequest>>(new Map());

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/admin/ai-routines/max-run', { cache: 'no-store' });
      if (!resp.ok) return; // 403/500 → no status shown
      const json = await resp.json();
      const rows: MaxLaneRequest[] = Array.isArray(json?.requests) ? json.requests : [];
      // rows arrive newest-first (requested_at desc); keep the first (latest) per routine
      const m = new Map<string, MaxLaneRequest>();
      for (const r of rows) {
        if (typeof r?.routine_id === 'string' && !m.has(r.routine_id)) m.set(r.routine_id, r);
      }
      setMap(m);
    } catch {
      // silent — no status UI
    }
  }, []);

  const anyActive = Array.from(map.values()).some((r) => ACTIVE_STATUSES.has(r.status));

  // initial load
  useEffect(() => {
    void load();
  }, [load]);

  // poll only while something is active; the cleanup clears the interval when
  // anyActive flips to false, so we never poll a fully-settled page.
  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => {
      void load();
    }, 15000);
    return () => clearInterval(id);
  }, [anyActive, load]);

  return { map, refetch: load };
}

function fmtHHMM(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
}

function statusText(request: MaxLaneRequest): string {
  switch (request.status) {
    case 'pending':
      return 'Max: queued';
    case 'claimed':
      return 'Max: running';
    case 'done': {
      const t = fmtHHMM(request.completed_at);
      return t ? `Max: done ${t}` : 'Max: done';
    }
    case 'error':
      return request.result_note ? `Max: failed — ${request.result_note}` : 'Max: failed';
    default:
      return '';
  }
}

/**
 * What MaxLaneNote needs off the routine's `maxlane:<id>` schedule row.
 *
 * `max_only` is not declared on the exported `ScheduleRow` type, but it IS
 * delivered to the browser: GET /api/admin/ai-routines/schedule calls
 * fn_ai_routine_schedules_list, which is `RETURNS SETOF ai_routine_schedules`
 * over `SELECT *` — every column ships. Declared optional here so a plain
 * ScheduleRow satisfies this shape without touching the shared type.
 */
export type MaxLaneNoteSchedule = {
  enabled: boolean;
  max_only?: boolean | null;
};

/**
 * One-line muted note shown near the schedule line on Max-lane cards.
 *
 * The text is DERIVED from the row, never hardcoded, because the two modes mean
 * OPPOSITE things operationally (see lib/services/platform/max-lane-deferral.ts):
 *
 *   • max_only = true  → shouldDeferToMaxLane returns true UNCONDITIONALLY. The
 *     cloud/API path always stands down, so there is NO fallback cron: if the
 *     Max lane is down, the run is simply skipped.
 *   • max_only = false → heartbeat-gated. The cloud cron is a live backup and
 *     reclaims the work the moment the runner pulse goes stale.
 *   • no row / paused  → the guard's `if (!laneRow?.enabled) return false`
 *     short-circuits, so the cloud cron is what actually runs this routine.
 *
 * This used to be a fixed "Max lane: scheduled + fallback API cron" string on
 * every card. On production 13 of the 14 enabled `maxlane:%` rows are
 * max_only=true, so that string was false on 13 of 14 cards — and misleading in
 * the dangerous direction: it promised an admin that a dead Max lane would be
 * covered by a cloud cron when the run is actually just dropped.
 */
export function MaxLaneNote({ schedule }: { schedule?: MaxLaneNoteSchedule }) {
  let text: string;
  if (!schedule) {
    text = 'Max lane: not scheduled — runs on the API cron';
  } else if (!schedule.enabled) {
    text = 'Max lane: paused — runs on the API cron';
  } else if (schedule.max_only === true) {
    text = 'Max lane only — no API fallback';
  } else {
    text = 'Max lane: scheduled + fallback API cron';
  }

  return (
    <span className="flex items-center gap-1 text-muted-foreground/80">
      <Zap className="h-3.5 w-3.5" /> {text}
    </span>
  );
}

/**
 * The "Run on Max" button plus its latest-request status line. The button is
 * disabled while a request for this routine is still pending/claimed.
 */
export function MaxLaneRunButton({
  routineId,
  routineName,
  request,
  onQueued,
}: {
  routineId: string;
  routineName: string;
  request?: MaxLaneRequest;
  onQueued: () => void;
}) {
  const [queuing, setQueuing] = useState(false);
  const active = request ? ACTIVE_STATUSES.has(request.status) : false;
  const isError = request?.status === 'error';

  async function run() {
    setQueuing(true);
    try {
      const resp = await fetch('/api/admin/ai-routines/max-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routineId }),
      });
      const data = await resp.json();
      if (data?.ok) {
        toast.success(`${routineName} — queued on the Max lane`);
      } else {
        // e.g. { ok:false, error:'already queued' }
        toast.message(`${routineName}: ${data?.error ?? 'could not queue'}`);
      }
      onQueued(); // refetch so the status reflects the new/existing request
    } catch (e) {
      toast.error(`${routineName}: ${e instanceof Error ? e.message : 'request failed'}`);
    } finally {
      setQueuing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={run}
        disabled={queuing || active}
        style={{ borderColor: `${BRAND}66`, color: BRAND }}
      >
        {queuing ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="mr-1.5 h-3.5 w-3.5" />
        )}
        Run on Max
      </Button>
      {request ? (
        <span
          className={`text-[11px] ${
            isError ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
          }`}
        >
          {statusText(request)}
        </span>
      ) : null}
    </div>
  );
}
