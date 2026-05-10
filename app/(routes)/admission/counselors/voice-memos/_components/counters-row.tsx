// app/(routes)/admission/counselors/voice-memos/_components/counters-row.tsx
// 7 counter tiles + status pill with failure-rate readout.
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MemoCounters } from '@/types/voice-memo-monitor';

interface CountersRowProps {
  counters: MemoCounters;
  windowHours: number;
}

interface TileSpec {
  abbrev: string;
  label: string;
  value: number;
  hint?: string;
  accent?: string;
}

function statusPillClasses(color: 'green' | 'amber' | 'red'): string {
  switch (color) {
    case 'green':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'amber':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'red':
      return 'bg-red-100 text-red-900 border-red-200';
  }
}

function statusLabel(color: 'green' | 'amber' | 'red'): string {
  switch (color) {
    case 'green':
      return 'Healthy';
    case 'amber':
      return 'Degraded';
    case 'red':
      return 'Failing';
  }
}

export function CountersRow({ counters, windowHours }: CountersRowProps) {
  const tiles: TileSpec[] = [
    { abbrev: 'U', label: 'Uploaded', value: counters.uploaded, hint: 'Total in window' },
    { abbrev: 'P', label: 'Pending', value: counters.pending, hint: 'Awaiting cron' },
    {
      abbrev: 'T',
      label: 'Transcribing',
      value: counters.transcribing,
      hint: 'Whisper running',
    },
    {
      abbrev: 'A',
      label: 'Analyzing',
      value: counters.analyzing,
      hint: 'Gemini running',
    },
    {
      abbrev: 'C',
      label: 'Completed',
      value: counters.completed,
      hint: 'Analysis done',
      accent: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      abbrev: 'F',
      label: 'Failed',
      value: counters.failed,
      hint: 'Pipeline error',
      accent: counters.failed > 0 ? 'text-red-700 dark:text-red-400' : undefined,
    },
    {
      abbrev: 'R',
      label: 'Rejected',
      value: counters.rejected_non_english,
      hint: 'Non-English',
      accent:
        counters.rejected_non_english > 0
          ? 'text-amber-700 dark:text-amber-400'
          : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Status pill row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border',
            statusPillClasses(counters.status_color),
          )}
        >
          <span className="h-2 w-2 rounded-full bg-current opacity-80" />
          {statusLabel(counters.status_color)} · {counters.failure_rate_pct}% failure rate
        </span>
        <span className="text-xs text-muted-foreground">
          across last {windowHours}h
        </span>
      </div>

      {/* 7-tile counter grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {tiles.map((t) => (
          <Card key={t.abbrev}>
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <span className="font-mono font-bold text-foreground">{t.abbrev}</span>
                <span>{t.label}</span>
              </div>
              <div
                className={cn(
                  'text-2xl font-bold mt-0.5 tabular-nums',
                  t.accent,
                )}
              >
                {t.value}
              </div>
              {t.hint && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {t.hint}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
