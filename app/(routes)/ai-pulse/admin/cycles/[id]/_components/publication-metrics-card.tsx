// app/(routes)/ai-pulse/admin/cycles/[id]/_components/publication-metrics-card.tsx
// Created: 2026-06-11 — AI Lab Hour SOP Phase V (Pulse Impact read path)
//
// Admin cycle-detail card: per-department Instagram publication metrics for
// one cycle, sorted by reach. Deadline and reach-target columns are judged
// against live ai_pulse_policies rows (ig_post_deadline_hours,
// ig_reach_threshold) — see lib/services/ai-pulse/pulse-analytics-service.ts.
//
// Pattern reference: app/(routes)/ai-pulse/evidence/naac/_components/
// naac-preview-table.tsx (table shape).

'use client';

import { ExternalLink, TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useCyclePublicationMetrics } from '@/lib/services/ai-pulse/pulse-analytics-service';

interface PublicationMetricsCardProps {
  cycleId: string;
}

function formatPostedAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function DeadlineBadge({ met }: { met: boolean | null }) {
  if (met === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return met ? (
    <Badge variant="outline" className="border-green-600 text-green-600">
      On time
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-600 text-red-600">
      Late
    </Badge>
  );
}

function ThresholdBadge({ met }: { met: boolean | null }) {
  if (met === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return met ? (
    <Badge variant="outline" className="border-green-600 text-green-600">
      Above target
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-600 text-amber-600">
      Below target
    </Badge>
  );
}

export function PublicationMetricsCard({ cycleId }: PublicationMetricsCardProps) {
  const { data, isLoading, error } = useCyclePublicationMetrics(cycleId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Publication Metrics</CardTitle>
        </div>
        <CardDescription>
          {data
            ? `Instagram performance per department for this cycle. A post counts as on time when it goes live within ${data.deadline_hours} hours of the session, and above target when it reaches at least ${data.reach_threshold.toLocaleString('en-IN')} people.`
            : 'Instagram performance per department for this cycle.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">
            Loading publication metrics…
          </p>
        ) : error ? (
          <p className="py-4 text-sm text-muted-foreground">
            Couldn’t load publication metrics: {error.message}
          </p>
        ) : !data || data.rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No Instagram publications submitted for this cycle yet. Rows appear
            once teams submit a publication entry with an Instagram link.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Department</TableHead>
                  <TableHead className="min-w-[140px]">Team</TableHead>
                  <TableHead className="text-right">Reach</TableHead>
                  <TableHead className="text-right">Likes</TableHead>
                  <TableHead className="text-right">Comments</TableHead>
                  <TableHead className="min-w-[120px]">Posted</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Reach target</TableHead>
                  <TableHead>Post</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.submission_id}>
                    <TableCell className="text-sm">
                      {row.department_name || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.team_name || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.reach === null
                        ? '—'
                        : row.reach.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.likes === null
                        ? '—'
                        : row.likes.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.comments === null
                        ? '—'
                        : row.comments.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatPostedAt(row.posted_at)}
                    </TableCell>
                    <TableCell>
                      <DeadlineBadge met={row.deadline_met} />
                    </TableCell>
                    <TableCell>
                      <ThresholdBadge met={row.threshold_met} />
                    </TableCell>
                    <TableCell>
                      <a
                        href={row.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
