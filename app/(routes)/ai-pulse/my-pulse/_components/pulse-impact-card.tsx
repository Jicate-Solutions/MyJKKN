// app/(routes)/ai-pulse/my-pulse/_components/pulse-impact-card.tsx
// Created: 2026-06-11 — AI Lab Hour SOP Phase V (Pulse Impact read path)
//
// Learner-facing card on /ai-pulse/my-pulse: the cycle's top Instagram
// publications ranked by reach. List length and the reach target come from
// live ai_pulse_policies rows (gold_standard_count, ig_reach_threshold) —
// see lib/services/ai-pulse/pulse-analytics-service.ts.
//
// Pattern reference: ../_components/current-cycle-card.tsx (card shape).

'use client';

import Link from 'next/link';
import { TrendingUp, Heart, ExternalLink, Megaphone } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useTopPublications,
  type PulsePublication,
} from '@/lib/services/ai-pulse/pulse-analytics-service';

interface PulseImpactCardProps {
  cycleId: string | null;
}

function reachCopy(pub: PulsePublication, threshold: number): string {
  if (pub.reach === null) {
    return 'Instagram metrics for this post haven’t synced yet.';
  }
  const people = pub.reach.toLocaleString('en-IN');
  const target = threshold.toLocaleString('en-IN');
  return pub.threshold_met
    ? `This post reached ${people} people — above the ${target} target.`
    : `This post reached ${people} people — below the ${target} target.`;
}

export function PulseImpactCard({ cycleId }: PulseImpactCardProps) {
  const { data, isLoading, error } = useTopPublications(cycleId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Pulse Impact</CardTitle>
        </div>
        <CardDescription>
          {cycleId
            ? 'Top Instagram publications from this cycle, ranked by reach.'
            : 'No active cycle — impact appears once a cycle is running.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!cycleId ? null : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading publications…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Couldn’t load publication metrics. Please try again later.
          </p>
        ) : !data || data.publications.length === 0 ? (
          <div className="space-y-3">
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No publications submitted this cycle.
            </div>
            <Button asChild size="sm" variant="secondary" className="w-full">
              <Link href={`/ai-pulse/submit/publication?cycle=${cycleId}`}>
                <Megaphone className="h-4 w-4 mr-2" />
                Submit Publication
              </Link>
            </Button>
          </div>
        ) : (
          data.publications.map((pub) => (
            <div
              key={pub.submission_id}
              className="rounded-md border p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {pub.team_name || 'Team'}
                  </p>
                  {pub.department_name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {pub.department_name}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={
                      pub.threshold_met
                        ? 'gap-1 border-green-600 text-green-600'
                        : 'gap-1'
                    }
                  >
                    <TrendingUp className="h-3 w-3" />
                    {pub.reach === null
                      ? 'Reach —'
                      : `Reach ${pub.reach.toLocaleString('en-IN')}`}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Heart className="h-3 w-3" />
                    {pub.likes === null
                      ? '—'
                      : pub.likes.toLocaleString('en-IN')}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {reachCopy(pub, data.reach_threshold)}
              </p>
              <a
                href={pub.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                View post <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
