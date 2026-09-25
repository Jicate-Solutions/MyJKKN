'use client';

/**
 * "Interviews booked for posts that are no longer open" (#13).
 *
 * When a post is filled or closed, interviews already booked for it are NOT
 * cancelled automatically. This card lists the upcoming ones so HR decides for
 * each. Read-only on purpose: the decision is made on the interview itself.
 * Hidden when there is nothing to decide.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loadClosedPostInterviews } from '../interview-booking-hr-actions';

export const CLOSED_POST_INTERVIEWS_QUERY_KEY = ['hr', 'interview-booking', 'closed-post-interviews'] as const;

const POST_STATUS_LABEL: Record<'filled' | 'closed', string> = { filled: 'Filled', closed: 'Closed' };

function formatIST(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function ClosedPostInterviewsCard() {
  const { data } = useQuery({
    queryKey: CLOSED_POST_INTERVIEWS_QUERY_KEY,
    queryFn: () => loadClosedPostInterviews(),
  });

  if (!data || data.success === false || data.rows.length === 0) return null;

  return (
    <Card data-testid="closed-post-interviews-card" className="border-amber-700/40 dark:border-amber-400/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          Interviews booked for posts that are no longer open
        </CardTitle>
        <CardDescription>Nothing has been cancelled. Decide for each one.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {data.rows.map((row) => (
            <li key={row.id} className="py-3" data-testid="closed-post-interview-row">
              <Link
                href={`/hr/recruitment/interviews/${row.id}`}
                className="flex flex-col gap-1 rounded-md sm:flex-row sm:items-center sm:justify-between hover:bg-muted/50"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-foreground break-words">{row.candidate_name}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="break-words">{row.post_title}</span>
                    <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                      {POST_STATUS_LABEL[row.post_status]}
                    </Badge>
                  </p>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  <p className="text-foreground">{formatIST(row.scheduled_at)}</p>
                  <p>{row.round_name ? `Round ${row.round_number} · ${row.round_name}` : `Round ${row.round_number}`}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
