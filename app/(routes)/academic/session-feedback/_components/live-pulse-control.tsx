'use client';

// Live Pulse Check — teacher control. Lists TODAY's sessions the teacher marked
// attendance for (the class picker, decision #5) and lets them launch a live
// class poll for one. Spec: specs/live-pulse-check-2026-06-25.md (original);
// upgraded 2026-07-04 (Live Poll Engine Phase B) to launch the rich
// ClassPollDialog (builder + open-live + present full screen + live results,
// with the 3 loop questions that still feed session_feedback) instead of the
// old bare "totals only" PulseTotalsDialog. See class-poll-dialog.tsx and
// lib/services/live-poll/class-poll-service.ts for the new mechanism.
//
// The PR-A "current/next class" spotlight (from the faculty-hard-gate work,
// #1779) is preserved here — but its prominent button now launches the SAME
// ClassPollDialog as the list below, so there is one consistent poll path.

import { useEffect, useState } from 'react';
import { AlertTriangle, Radio } from 'lucide-react';
import { format } from 'date-fns';
import { BeatLoader } from 'react-spinners';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFacultyCompletion } from '@/hooks/use-session-feedback';
import type { FacultyCompletionRow } from '@/types/session-feedback';
import { ClassPollDialog } from './class-poll-dialog';

const BRAND_GREEN = '#0b6d41';

// ── PR-A current-period spotlight helpers ────────────────────────────────────
// The attendance blob stores per-period start/end times in mixed formats — 24h
// ("10:00:00") and 12h/meridian ("3:00 PM"). Parse both to minutes-of-day so we
// can tell which of today's classes is happening RIGHT NOW (the capture moment).
function parseBlobTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const s = t.trim();
  // 12-hour with meridian, e.g. "3:00 PM" / "9:05 am" / "3:00:00 PM" (optional seconds)
  const m12 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
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
    // hourCycle:'h23' guarantees midnight renders as "00", not "24" — some engines
    // emit "24" for hour12:false at 00:xx, which would push nowMin out of range.
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

/** Today's sessions the teacher can open a live class poll for. */
export function LivePulseSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useFacultyCompletion(from, to);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todaySessions: FacultyCompletionRow[] = (data ?? []).filter(
    (r) => r.attendance_date === today,
  );

  // PR-A — spotlight the class happening RIGHT NOW (or, failing that, the next one
  // coming up today) so the class poll is a one-tap, unmissable control at the
  // capture moment. Degrades gracefully when the RPC pre-dates start/end_time.
  //
  // nowMin ticks on a timer so the spotlight stays live. Computed once at mount it
  // would freeze — keep highlighting a class that has already ended, or never light
  // up the one that just started. Re-evaluate every 30s.
  const [nowMin, setNowMin] = useState<number>(() => nowMinutesIST());
  useEffect(() => {
    const id = setInterval(() => setNowMin(nowMinutesIST()), 30_000);
    return () => clearInterval(id);
  }, []);
  const withTimes = todaySessions
    .map((r) => ({
      row: r,
      startMin: parseBlobTimeToMinutes(r.start_time),
      endMin: parseBlobTimeToMinutes(r.end_time),
    }))
    // Only a class with Present students can be polled. Excluding present-0 sessions
    // here means a present-0 active class no longer wins the spotlight and then
    // suppresses it (the render guard drops present-0) — the spotlight falls back to
    // the next pollable class instead. Mirrors the per-row "noPresent" disable below.
    .filter((x) => x.startMin != null && x.row.present_count > 0);
  const activeNow = withTimes
    .filter((x) => {
      if (x.startMin == null || x.endMin == null) return false;
      // A class whose end is before its start straddles midnight (e.g. 23:30–00:15):
      // it is "now" from startMin to end-of-day OR from midnight to endMin. The plain
      // start<=now<=end test never matches such a class, so it would never be spotlit.
      return x.endMin >= x.startMin
        ? nowMin >= x.startMin && nowMin <= x.endMin
        : nowMin >= x.startMin || nowMin <= x.endMin;
    })
    .sort((a, b) => b.startMin! - a.startMin!)[0];
  const nextUp = withTimes
    .filter((x) => x.startMin != null && x.startMin! > nowMin)
    .sort((a, b) => a.startMin! - b.startMin!)[0];
  const spotlight = activeNow ?? nextUp ?? null;
  const isLive = !!activeNow;

  return (
    <Card className="mb-6 border-[#0b6d41]/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          <CardTitle>Live Pulse Check</CardTitle>
        </div>
        <CardDescription>
          Open a live poll for a class you taught today — a quick understanding check plus
          whatever else you want to ask. Students who are marked Present can answer in one tap;
          you see anonymized totals as they come in, live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* PR-A spotlight: the current/next class, front-and-centre, one big tap.
            `spotlight` is already restricted to pollable (present_count>0) classes,
            so it always launches a live ClassPollDialog (no disabled state needed). */}
        {spotlight ? (
          <div className="mb-4 rounded-lg border-2 border-[#0b6d41] bg-[#0b6d41]/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND_GREEN }}>
                  <Radio className="h-3.5 w-3.5" />
                  {isLive ? 'Class in progress — poll now' : 'Up next today'}
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
              <ClassPollDialog
                attendanceDate={spotlight.row.attendance_date}
                timetableId={spotlight.row.timetable_id}
                periodId={spotlight.row.period_id}
                courseLabel={spotlight.row.course_name || spotlight.row.course_code || 'Class session'}
                trigger={
                  <Button
                    type="button"
                    className="h-11 shrink-0 bg-[#0b6d41] px-5 text-base hover:bg-[#0b6d41]/90"
                  >
                    <Radio className="mr-2 h-4 w-4" />
                    Open class poll
                  </Button>
                }
              />
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
              live poll for it here.
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
                  {noPresent ? (
                    <Button type="button" size="sm" disabled className="shrink-0">
                      <Radio className="mr-1.5 h-3.5 w-3.5" /> Class poll
                    </Button>
                  ) : (
                    <ClassPollDialog
                      attendanceDate={row.attendance_date}
                      timetableId={row.timetable_id}
                      periodId={row.period_id}
                      courseLabel={label}
                      trigger={
                        <Button type="button" size="sm" className="bg-[#0b6d41] hover:bg-[#0b6d41]/90 shrink-0">
                          <Radio className="mr-1.5 h-3.5 w-3.5" />
                          Class poll
                        </Button>
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
