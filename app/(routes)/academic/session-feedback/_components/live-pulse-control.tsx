'use client';

// Live Pulse Check — teacher control. Lists TODAY's sessions the teacher marked
// attendance for (the class picker, decision #5), lets them open a live pulse,
// and shows the live ANONYMIZED totals (decision #2 — totals only, with a k>=3
// floor before any breakdown is shown). Auto-closes after 240 min (#6).
// Spec: specs/live-pulse-check-2026-06-25.md

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BeatLoader } from 'react-spinners';
import { Radio, ShieldCheck, AlertTriangle, Clock, Users } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useFacultyCompletion,
  useOpenPulse,
  usePulseTotals,
  useChecklistConfig,
} from '@/hooks/use-session-feedback';
import type { FacultyCompletionRow, LivePulseRow } from '@/types/session-feedback';

const BRAND_GREEN = '#0b6d41';

const UNDERSTOOD_LABELS: Record<string, string> = {
  '1': 'Lost',
  '2': 'Shaky',
  '3': 'OK',
  '4': 'Good',
  '5': 'Clear',
};

function minutesLeft(autoCloseAt: string): number {
  const ms = new Date(autoCloseAt).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 60000));
}

// ── PR-A current-period spotlight helpers ────────────────────────────────────
// The attendance blob stores per-period start/end times in mixed formats — 24h
// ("10:00:00") and 12h/meridian ("3:00 PM"). Parse both to minutes-of-day so we
// can tell which of today's classes is happening RIGHT NOW (the capture moment).
function parseBlobTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const s = t.trim();
  // 12-hour with meridian, e.g. "3:00 PM" / "9:05 am"
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const pm = m12[3].toLowerCase() === 'pm';
    if (h === 12) h = 0;
    if (pm) h += 12;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  // 24-hour "HH:MM" or "HH:MM:SS"
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  return null;
}

/** Minutes-since-midnight in IST (Asia/Kolkata) — the wall-clock the blob uses. */
function nowMinutesIST(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

/** Live anonymized totals for one open pulse. Polls every 10s while open. */
function PulseTotalsDialog({
  pulse,
  onOpenChange,
}: {
  pulse: LivePulseRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = pulse !== null;
  const { data: totals, isLoading } = usePulseTotals(pulse?.id ?? null, open);
  const { data: checklistConfig } = useChecklistConfig();
  const labelFor = useMemo(() => {
    const m = new Map<string, string>();
    (checklistConfig ?? []).forEach((c) => m.set(c.item_key, c.label));
    return (key: string) => m.get(key) ?? key;
  }, [checklistConfig]);

  const courseLabel = pulse?.course_name || pulse?.course_code || 'Class session';
  const rate =
    totals && totals.present_count > 0
      ? Math.min(100, Math.round((totals.response_count / totals.present_count) * 100))
      : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: BRAND_GREEN }}>
            <Radio className="h-5 w-5" />
            {courseLabel}
          </DialogTitle>
          <DialogDescription>
            Live pulse — totals only. You never see who answered what.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !totals ? (
          <div className="flex justify-center py-10">
            <BeatLoader color={BRAND_GREEN} size={9} />
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Status row */}
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {totals.is_open ? (
                  <>Open · closes in ~{pulse ? minutesLeft(pulse.auto_close_at) : 0}m</>
                ) : (
                  <>Closed</>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Users className="h-4 w-4" style={{ color: BRAND_GREEN }} />
                {totals.response_count}/{totals.present_count} answered · {rate}%
              </span>
            </div>

            {totals.suppressed ? (
              <Alert className="border-green-200 bg-green-50">
                <ShieldCheck className="h-4 w-4" style={{ color: BRAND_GREEN }} />
                <AlertDescription className="text-green-900">
                  {totals.response_count === 0
                    ? 'No answers yet. Ask the class to open Class Feedback and tap the live pulse.'
                    : `Waiting for at least 3 answers before showing the breakdown — this protects each student's anonymity. ${totals.response_count} so far.`}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Understanding distribution (1–5) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">How well they understood</span>
                    {totals.avg_understood != null && (
                      <Badge
                        variant="outline"
                        className={
                          totals.avg_understood >= 4
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : totals.avg_understood >= 3
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-red-100 text-red-800 border-red-200'
                        }
                      >
                        avg {totals.avg_understood.toFixed(1)}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {['1', '2', '3', '4', '5'].map((lvl) => {
                      const n = totals.dist?.[lvl] ?? 0;
                      const pct =
                        totals.response_count > 0
                          ? Math.round((n / totals.response_count) * 100)
                          : 0;
                      return (
                        <div key={lvl} className="flex items-center gap-2 text-xs">
                          <span className="w-14 shrink-0 text-muted-foreground">
                            {UNDERSTOOD_LABELS[lvl]}
                          </span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor:
                                  lvl <= '2' ? '#ef4444' : lvl === '3' ? '#f59e0b' : BRAND_GREEN,
                              }}
                            />
                          </div>
                          <span className="w-6 shrink-0 text-right tabular-nums font-medium">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Checklist tallies */}
                {totals.checklist_counts && Object.keys(totals.checklist_counts).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">In this class…</span>
                    <ul className="space-y-1">
                      {Object.entries(totals.checklist_counts).map(([key, n]) => (
                        <li key={key} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{labelFor(key)}</span>
                          <span className="tabular-nums font-medium">
                            {n}/{totals.response_count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Today's sessions the teacher can pulse + the live totals dialog. */
export function LivePulseSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useFacultyCompletion(from, to);
  const openPulse = useOpenPulse();
  const [activePulse, setActivePulse] = useState<LivePulseRow | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todaySessions: FacultyCompletionRow[] = (data ?? []).filter(
    (r) => r.attendance_date === today,
  );

  // PR-A — spotlight the class happening RIGHT NOW (or, failing that, the next one
  // coming up today) so "Open Pulse" is a one-tap, unmissable control at the capture
  // moment. Degrades gracefully when the RPC pre-dates the start/end_time columns.
  const nowMin = nowMinutesIST();
  const withTimes = todaySessions
    .map((r) => ({
      row: r,
      startMin: parseBlobTimeToMinutes(r.start_time),
      endMin: parseBlobTimeToMinutes(r.end_time),
    }))
    .filter((x) => x.startMin != null);
  const activeNow = withTimes
    .filter((x) => x.startMin != null && x.endMin != null && nowMin >= x.startMin! && nowMin <= x.endMin!)
    .sort((a, b) => b.startMin! - a.startMin!)[0];
  const nextUp = withTimes
    .filter((x) => x.startMin != null && x.startMin! > nowMin)
    .sort((a, b) => a.startMin! - b.startMin!)[0];
  const spotlight = activeNow ?? nextUp ?? null;
  const spotlightKey = spotlight
    ? `${spotlight.row.timetable_id}-${spotlight.row.period_id}`
    : null;
  const isLive = !!activeNow;

  async function handlePulse(row: FacultyCompletionRow) {
    const key = `${row.timetable_id}-${row.period_id}`;
    setPendingKey(key);
    try {
      const pulse = await openPulse.mutateAsync({
        attendanceDate: row.attendance_date,
        timetableId: row.timetable_id,
        periodId: row.period_id,
      });
      setActivePulse(pulse);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the pulse.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <Card className="mb-6 border-[#0b6d41]/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          <CardTitle>Live Pulse Check</CardTitle>
        </div>
        <CardDescription>
          Open a quick in-class pulse for a class you taught today. Students who are marked
          Present can answer in one tap — you see anonymized totals as they come in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* PR-A spotlight: the current/next class, front-and-centre, one big tap. */}
        {spotlight && spotlight.row.present_count > 0 ? (
          <div className="mb-4 rounded-lg border-2 border-[#0b6d41] bg-[#0b6d41]/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND_GREEN }}>
                  <Radio className="h-3.5 w-3.5" />
                  {isLive ? 'Class in progress — pulse now' : 'Up next today'}
                </div>
                <div className="truncate text-base font-semibold">
                  {spotlight.row.course_name || spotlight.row.course_code || 'Class session'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {spotlight.row.start_time ?? ''}
                  {spotlight.row.end_time ? ` – ${spotlight.row.end_time}` : ''}
                  {' · '}
                  {spotlight.row.present_count} present
                </div>
              </div>
              <Button
                type="button"
                onClick={() => handlePulse(spotlight.row)}
                disabled={pendingKey === spotlightKey}
                className="h-11 shrink-0 bg-[#0b6d41] px-5 text-base hover:bg-[#0b6d41]/90"
              >
                {pendingKey === spotlightKey ? (
                  <BeatLoader color="#ffffff" size={7} />
                ) : (
                  <>
                    <Radio className="mr-2 h-4 w-4" />
                    Open Pulse now
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <BeatLoader color={BRAND_GREEN} size={9} />
          </div>
        ) : todaySessions.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No classes marked today yet. Mark attendance for a class first — then you can open a
              live pulse for it here.
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="divide-y rounded-md border">
            {todaySessions.map((row) => {
              const key = `${row.timetable_id}-${row.period_id}`;
              const label = row.course_name || row.course_code || 'Class session';
              const noPresent = row.present_count === 0;
              return (
                <li key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.present_count} present
                      {noPresent ? ' · mark attendance so students can answer' : ''}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handlePulse(row)}
                    disabled={pendingKey === key || noPresent}
                    className="bg-[#0b6d41] hover:bg-[#0b6d41]/90 shrink-0"
                  >
                    {pendingKey === key ? (
                      <BeatLoader color="#ffffff" size={6} />
                    ) : (
                      <>
                        <Radio className="mr-1.5 h-3.5 w-3.5" />
                        Pulse the class
                      </>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <PulseTotalsDialog pulse={activePulse} onOpenChange={(o) => !o && setActivePulse(null)} />
    </Card>
  );
}
