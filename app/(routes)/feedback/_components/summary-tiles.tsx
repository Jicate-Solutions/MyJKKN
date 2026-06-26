'use client';

import { MessageSquare, SmilePlus, Frown, Meh, Shuffle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeedbackSummary } from '@/lib/services/feedback/feedback-dashboard-service';

interface SummaryTilesProps {
  summary: FeedbackSummary | null;
  isLoading: boolean;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

export function SummaryTiles({ summary, isLoading }: SummaryTilesProps) {
  const tiles = [
    {
      label: 'Total Events',
      value: summary?.total,
      icon: MessageSquare,
      colorClass: 'text-foreground',
    },
    {
      label: 'Positive',
      value: summary?.bySentiment.positive,
      icon: SmilePlus,
      colorClass: 'text-emerald-600',
    },
    {
      label: 'Neutral',
      value: summary?.bySentiment.neutral,
      icon: Meh,
      colorClass: 'text-muted-foreground',
    },
    {
      label: 'Negative',
      value: summary?.bySentiment.negative,
      icon: Frown,
      colorClass: 'text-red-500',
    },
    {
      label: 'Mixed',
      value: summary?.bySentiment.mixed,
      icon: Shuffle,
      colorClass: 'text-amber-500',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
              <t.icon className={`h-3.5 w-3.5 ${t.colorClass}`} />
              {t.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold tabular-nums ${t.colorClass}`}>
              {formatNumber(t.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
