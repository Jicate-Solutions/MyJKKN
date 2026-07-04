'use client';

// Live Pulse Check — teacher control. Lists TODAY's sessions the teacher marked
// attendance for (the class picker, decision #5) and lets them launch a live
// class poll for one. Spec: specs/live-pulse-check-2026-06-25.md (original);
// upgraded 2026-07-04 (Live Poll Engine Phase B) to launch the rich
// ClassPollDialog (builder + open-live + present full screen + live results,
// with the 3 loop questions that still feed session_feedback) instead of the
// old bare "totals only" PulseTotalsDialog. See class-poll-dialog.tsx and
// lib/services/live-poll/class-poll-service.ts for the new mechanism.

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

/** Today's sessions the teacher can open a live class poll for. */
export function LivePulseSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useFacultyCompletion(from, to);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todaySessions: FacultyCompletionRow[] = (data ?? []).filter(
    (r) => r.attendance_date === today,
  );

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
