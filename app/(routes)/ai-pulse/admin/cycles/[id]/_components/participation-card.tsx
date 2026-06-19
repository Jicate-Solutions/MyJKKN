'use client';

/**
 * AI Pulse — Participation Card (Champion Console, per-cycle)
 *
 * Surfaces OBSERVABLE raw turnout for a cycle's live session — joined, on time,
 * quiz submitted, quiz passed, feedback — counted INDEPENDENTLY. Before this
 * card, the only admin attendance read was the 4-AND `engaged_attendance_rate`,
 * which can read 0% even when turnout was strong (e.g. a session with 192
 * joined / 22 quiz / 19 passed was invisible).
 *
 * Pattern: sibling learner-feedback-card (per-cycle client-side attendance read
 * via useQuery + the participation-service hook).
 */

import { Users, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useCycleParticipation } from '@/lib/services/ai-pulse/participation-service';

interface ParticipationCardProps {
  cycleId: string;
}

interface StatProps {
  label: string;
  value: number;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ParticipationCard({ cycleId }: ParticipationCardProps) {
  const { data, isLoading } = useCycleParticipation(cycleId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" aria-hidden />
          Participation
        </CardTitle>
        <CardDescription>
          Raw turnout for this cycle&apos;s live session — each count is
          independent, so it stays visible even when the engaged-attendance rate
          reads low.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading participation…
          </div>
        ) : !data || data.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No attendance recorded for this cycle yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Joined" value={data.joined} />
            <Stat label="On time" value={data.joined_on_time} />
            <Stat label="Quiz submitted" value={data.quiz_submitted} />
            <Stat label="Quiz passed" value={data.quiz_passed} />
            <Stat label="Feedback" value={data.feedback_count} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
