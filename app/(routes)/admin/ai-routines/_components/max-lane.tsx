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
 * What MaxLaneNote reads off the routine's `maxlane:<id>` schedule row.
 *
 * `max_only` is not declared on the exported `ScheduleRow` type (schedule-editor.tsx),
 * but it IS delivered to the browser: GET /api/admin/ai-routines/schedule returns
 * fn_ai_routine_schedules_list's rows unchanged, and that function is
 * `RETURNS SETOF ai_routine_schedules` — every column of the table ships, and
 * `max_only boolean DEFAULT false` is one of them. Declared optional here so a
 * plain ScheduleRow satisfies this shape without editing the shared type.
 */
export type MaxLaneNoteSchedule = {
  enabled: boolean;
  max_only?: boolean | null;
};

/**
 * Routine ids whose OWN cloud handler calls `shouldDeferToMaxLane(<id>)`
 * UNCONDITIONALLY and, when it answers true, returns having done none of the
 * routine's work. For exactly these routines the `maxlane:<id>` row decides
 * whether the cloud path runs at all, so the row can be described honestly.
 *
 * Derived by grepping every call site in the repo (2026-07-30):
 *
 *   app/api/cron/ai-pulse-anomaly-scan/route.ts:99
 *     if (await shouldDeferToMaxLane('ai-pulse-anomaly-scan')) {   ← unconditional
 *
 * Every OTHER call site is deliberately excluded, because the row does NOT
 * decide the cloud path there:
 *
 *   • Six are gated on a platform policy the browser cannot see —
 *     `if (lane === 'direct' && (await shouldDeferToMaxLane('<id>')))` in
 *     scf-learner-notes:242, curriculum-lesson-spine-generate:472,
 *     scf-generate-suggestions:663, session-feedback-escalation:175,
 *     induction-generate-playbook:316, induction-session-effectiveness:171.
 *     All six `loops.*.generation_lane` policies are 'jobs' in production, so
 *     the guard is never reached and the cloud cron runs regardless of the row.
 *   • analyze-voice-memos:380 defers only its SENTIMENT stage; the cloud cron
 *     still runs and still transcribes, so "the cloud path stands down" is false.
 *   • The remaining `maxLane: true` routines never call the guard at all (e.g.
 *     admission-counselor-briefing is a plain vercel.json cron), so `max_only`
 *     on their row changes nothing about the cloud path.
 *
 * For anything not in this set the honest answer is "unknown", and MaxLaneNote
 * renders nothing rather than asserting a fallback that may not exist. If a
 * routine's cron later gains an unconditional guard, add its id here.
 */
const CLOUD_CRON_DEFERS_TO_MAX_LANE = new Set<string>(['ai-pulse-anomaly-scan']);

/**
 * The note text, mirroring lib/services/platform/max-lane-deferral.ts exactly:
 *   • row missing or disabled → `if (!laneRow?.enabled) return false` → cloud runs.
 *   • max_only = true         → guard returns true unconditionally → cloud stands down.
 *   • max_only = false        → heartbeat-gated → cloud is a live backup that
 *                               reclaims the work as soon as the pulse goes stale.
 * Returns null when the routine's cloud path does not consult the guard.
 */
function maxLaneNoteText(routineId: string, schedule?: MaxLaneNoteSchedule): string | null {
  if (!CLOUD_CRON_DEFERS_TO_MAX_LANE.has(routineId)) return null;
  if (!schedule?.enabled) return 'Max lane not scheduled — the cloud cron runs this';
  if (schedule.max_only === true) return 'Max lane only — the cloud cron stands down';
  return 'Max lane, with the cloud cron as a live backup';
}

/**
 * One-line muted note shown near the schedule line on Max-lane cards.
 *
 * This used to be the fixed string "Max lane: scheduled + fallback API cron" on
 * every Max-lane card, with no props and no data behind it. It was false in the
 * dangerous direction — it promised an operator that a dead Max lane would be
 * covered by a cloud cron, for routines where no such fallback relationship
 * exists in either direction. It now renders only where the code proves it.
 */
export function MaxLaneNote({
  routineId,
  schedule,
}: {
  routineId: string;
  schedule?: MaxLaneNoteSchedule;
}) {
  const text = maxLaneNoteText(routineId, schedule);
  if (!text) return null;
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
