'use client';

// Live Pulse banner — when a teacher opens an in-class pulse for a session the
// learner is marked Present in, this surfaces a prominent "answer now" call.
// Tapping opens the SAME feedback dialog, but the answer is tagged source=live_poll.
// Polls via useOpenPulsesForLearner (refetchInterval) so it appears within seconds.
// Spec: specs/live-pulse-check-2026-06-25.md (#11 in-app discovery; the push ping
// is a documented fast-follow).

import { Radio, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOpenPulsesForLearner } from '@/hooks/use-session-feedback';
import type { PendingSession, OpenPulseForLearner } from '@/types/session-feedback';

const BRAND = '#0b6d41';

/** Map an open pulse to the PendingSession shape the FeedbackDialog renders. */
function pulseToSession(p: OpenPulseForLearner): PendingSession {
  return {
    attendance_date: p.attendance_date,
    timetable_id: p.timetable_id,
    period_id: p.period_id,
    section_id: null,
    course_id: null,
    course_code: p.course_code,
    course_name: p.course_name,
    faculty_name: null,
    period_name: null,
    start_time: null,
    end_time: null,
  };
}

interface LivePulseBannerProps {
  onAnswer: (session: PendingSession, source: 'live_poll') => void;
}

export function LivePulseBanner({ onAnswer }: LivePulseBannerProps) {
  const { data } = useOpenPulsesForLearner();
  // Show only open pulses the learner has NOT already answered (#3 counts once).
  const open = (data ?? []).filter((p) => !p.already_answered);
  if (open.length === 0) return null;

  return (
    <Card className="border-[#0b6d41]/40 bg-[#0b6d41]/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0b6d41] opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#0b6d41]" />
          </span>
          <h2 className="text-sm font-semibold" style={{ color: BRAND }}>
            Live pulse — your teacher wants a quick check
          </h2>
        </div>
        <ul className="space-y-2">
          {open.map((p) => {
            const label = p.course_name || p.course_code || 'Class session';
            const suffix = p.course_code && p.course_name ? ` · ${p.course_code}` : '';
            return (
              <li key={p.pulse_id}>
                <Button
                  type="button"
                  onClick={() => onAnswer(pulseToSession(p), 'live_poll')}
                  className="w-full justify-between bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <Radio className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}{suffix}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm shrink-0">
                    Answer now <ChevronRight className="h-4 w-4" />
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Takes ~10 seconds and confirms your attendance. Only you see your answer — your teacher sees totals only.
        </p>
      </CardContent>
    </Card>
  );
}
