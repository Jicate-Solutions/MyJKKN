// app/(routes)/ai-pulse/_components/my-attendance-card.tsx
// Created: 2026-05-06 — Wave B.1

import { CheckCircle2, AlertCircle, XCircle, Clock, Flame } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  AiPulseAttendance,
  AttendanceState,
} from '@/lib/services/ai-pulse/learner-service';

interface MyAttendanceCardProps {
  attendance: AiPulseAttendance;
  streak: number;
}

const STATE_CONFIG: Record<AttendanceState, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  engaged: { label: 'Engaged', icon: CheckCircle2, tone: 'text-green-600' },
  partial: { label: 'Partial — needs make-up', icon: AlertCircle, tone: 'text-amber-600' },
  absent: { label: 'Absent', icon: XCircle, tone: 'text-red-600' },
  pending: { label: 'Pending — session not yet started', icon: Clock, tone: 'text-muted-foreground' },
  unknown: { label: 'No data yet', icon: Clock, tone: 'text-muted-foreground' },
};

function formatDayType(d: string | null): string | null {
  if (!d) return null;
  const map: Record<string, string> = {
    live_session: 'Live session',
    async_makeup: 'Async make-up',
    build_day: 'Build day',
    demo_day: 'Demo day',
  };
  return map[d] ?? d;
}

export function MyAttendanceCard({ attendance, streak }: MyAttendanceCardProps) {
  const cfg = STATE_CONFIG[attendance.state] ?? STATE_CONFIG.unknown;
  const Icon = cfg.icon;
  const dayLabel = formatDayType(attendance.day_type);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${cfg.tone}`} />
              <CardTitle className="text-base">My Attendance</CardTitle>
            </div>
            <CardDescription>
              {cfg.label}
              {dayLabel ? ` · ${dayLabel}` : ''}
            </CardDescription>
          </div>
          {streak > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Flame className="h-3 w-3 text-orange-500" />
              {streak}-week streak
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Engagement requires 4 signals: joined within 5 min, responded to polls,
          stayed until end, and passed the quiz. Async make-up rescues a miss.
        </p>
      </CardContent>
    </Card>
  );
}
