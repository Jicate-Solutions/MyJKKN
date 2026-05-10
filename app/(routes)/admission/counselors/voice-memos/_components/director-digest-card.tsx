// app/(routes)/admission/counselors/voice-memos/_components/director-digest-card.tsx
// One-row-per-bucket sentiment digest for the director.
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import { TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DirectorDigest } from '@/types/voice-memo-monitor';

interface DirectorDigestCardProps {
  digest: DirectorDigest;
}

function bucketAccent(bucket: string): {
  dot: string;
  text: string;
  bar: string;
} {
  const key = bucket.toLowerCase();
  if (key === 'interested' || key === 'positive' || key === 'happy') {
    return {
      dot: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-300',
      bar: 'bg-emerald-500',
    };
  }
  if (key === 'concerned' || key === 'anxious' || key === 'worried') {
    return {
      dot: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-300',
      bar: 'bg-amber-500',
    };
  }
  if (key === 'negative' || key === 'angry' || key === 'frustrated') {
    return {
      dot: 'bg-red-500',
      text: 'text-red-700 dark:text-red-300',
      bar: 'bg-red-500',
    };
  }
  return {
    dot: 'bg-slate-400',
    text: 'text-slate-600 dark:text-slate-300',
    bar: 'bg-slate-400',
  };
}

export function DirectorDigestCard({ digest }: DirectorDigestCardProps) {
  const entries = Object.entries(digest.bucket_counts);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const max = Math.max(1, ...entries.map(([, n]) => n));

  // Sort: highest count first, but keep stable order otherwise.
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          Director digest
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 || total === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No analyzed memos in window yet.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map(([bucket, count]) => {
              const accent = bucketAccent(bucket);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const widthPct = (count / max) * 100;
              return (
                <div key={bucket} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn('h-2 w-2 rounded-full shrink-0', accent.dot)}
                      />
                      <span className={cn('font-medium capitalize truncate', accent.text)}>
                        {bucket}
                      </span>
                    </div>
                    <div className="text-muted-foreground tabular-nums shrink-0 ml-2">
                      {count} <span className="text-[10px]">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', accent.bar)}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground text-right pt-1">
              {total} analyzed memo{total === 1 ? '' : 's'} in window
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
