'use client';

/**
 * AI Pulse — 4-AND Engagement Gate Progress
 *
 * Real-time visualisation of which of the 4 gates the learner has hit.
 * "3 of 4 gates passed" when 3/4 are green; cycle outcome metric counts
 * a learner as ENGAGED iff all 4 are green (the AND, not the OR).
 *
 * Pure presentational — receives signals via props and renders. The page
 * orchestrator (live-session-shell) computes the gate status via
 * `evaluateGates()` from the service.
 */

import { Check, Circle, Clock, MessageCircleQuestion, LogIn, ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { GateStatus } from '@/lib/services/ai-pulse/live-session-service';

interface EngagementProgressProps {
  gates: GateStatus;
  className?: string;
}

interface GateRow {
  label: string;
  description: string;
  passed: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

export function EngagementProgress({ gates, className }: EngagementProgressProps) {
  const rows: GateRow[] = [
    {
      label: 'Joined within 5 minutes',
      description: 'Click Join when the session opens — late arrivals miss this gate.',
      passed: gates.joined_within_5min,
      Icon: LogIn,
    },
    {
      label: 'Responded to ≥ 3 polls',
      description: 'Champion issues 3–5 polls during the session. Submit at least 3.',
      passed: gates.polls_responded_ok,
      Icon: MessageCircleQuestion,
    },
    {
      label: 'Stayed until the end',
      description: 'Leave the tab open until 7:30 PM IST so the final heartbeat fires.',
      passed: gates.stayed_until_end,
      Icon: Clock,
    },
    {
      label: 'Passed the quiz',
      description: 'Quiz opens after the session. Pass mark = 60%.',
      passed: gates.quiz_passed,
      Icon: ScrollText,
    },
  ];

  const percent = Math.round((gates.passed_count / gates.total) * 100);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Engagement Gates</span>
          <span
            className={
              gates.is_engaged
                ? 'text-sm font-medium text-green-700 dark:text-green-400'
                : 'text-sm font-medium text-muted-foreground'
            }
            data-testid="engagement-gate-summary"
          >
            {gates.passed_count} of {gates.total} gates passed
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={percent} className="h-2" />

        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-start gap-3"
              data-testid={`gate-${slugify(row.label)}`}
            >
              <div
                className={
                  row.passed
                    ? 'mt-0.5 h-6 w-6 shrink-0 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center text-green-700 dark:text-green-400'
                    : 'mt-0.5 h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground'
                }
                aria-hidden
              >
                {row.passed ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <row.Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span
                    className={
                      row.passed
                        ? 'text-sm font-medium'
                        : 'text-sm font-medium text-muted-foreground'
                    }
                  >
                    {row.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{row.description}</p>
              </div>
            </li>
          ))}
        </ul>

        {gates.is_engaged ? (
          <div className="rounded-md border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-sm text-green-800 dark:text-green-300">
            All 4 gates passed — you count as engaged for this cycle.
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
            Engagement requires <strong>all four</strong> gates (AND, not OR).
            Missed live? An async make-up window stays open for 48 hours after
            the session ends.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
