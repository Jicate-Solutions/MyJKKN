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
import {
  useCycleParticipation,
  type ParticipationCounts,
} from '@/lib/services/ai-pulse/participation-service';

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

/**
 * One population's turnout on its own line — the "own line" split so the student
 * cohort's signal stays legible and isn't blurred by senior-learner turnout.
 */
function PopulationBlock({
  label,
  counts,
}: {
  label: string;
  counts: ParticipationCounts;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">
        {label}{' '}
        <span className="text-muted-foreground tabular-nums">
          · {counts.total}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Joined" value={counts.joined} />
        <Stat label="On time" value={counts.joined_on_time} />
        <Stat label="Quiz submitted" value={counts.quiz_submitted} />
        <Stat label="Quiz passed" value={counts.quiz_passed} />
        <Stat label="Feedback" value={counts.feedback_count} />
      </div>
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
          reads low. Learners and senior learners are counted on their own lines.
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
          <div className="space-y-5">
            <PopulationBlock label="Learners" counts={data.student} />
            {data.senior.total > 0 && (
              <PopulationBlock label="Senior learners" counts={data.senior} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
