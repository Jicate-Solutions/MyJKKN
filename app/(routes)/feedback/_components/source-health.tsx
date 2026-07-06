'use client';

import { useEffect, useState } from 'react';
import {
  Instagram,
  MessageCircle,
  GraduationCap,
  Sparkles,
  UtensilsCrossed,
  BookOpen,
  Users,
  Activity,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchSourceHealth,
  type SourceHealth as SourceHealthData,
} from '@/lib/services/feedback/super-cockpit-service';
import type { FeedbackSource } from '@/lib/types/feedback-spine';

const SOURCE_META: Record<
  FeedbackSource,
  { label: string; icon: React.ElementType; color: string }
> = {
  ig_comment: { label: 'IG Comment', icon: Instagram, color: 'text-pink-500' },
  ig_dm: { label: 'IG DM', icon: MessageCircle, color: 'text-purple-500' },
  session_feedback: { label: 'Session', icon: GraduationCap, color: 'text-blue-500' },
  ai_pulse: { label: 'AI Pulse', icon: Sparkles, color: 'text-amber-500' },
  mess: { label: 'Mess', icon: UtensilsCrossed, color: 'text-orange-500' },
  class_feedback: { label: 'Class', icon: BookOpen, color: 'text-indigo-500' },
  parent: { label: 'Parent', icon: Users, color: 'text-teal-500' },
  scf_checkin: { label: 'SCF', icon: Activity, color: 'text-emerald-500' },
};

// Canonical render order — internal captured voice first, external surfaces last.
const SOURCES: FeedbackSource[] = [
  'session_feedback',
  'class_feedback',
  'mess',
  'parent',
  'scf_checkin',
  'ai_pulse',
  'ig_comment',
  'ig_dm',
];

/** Relative "last event" label — keeps management's eye on how fresh a channel is. */
function formatLastEvent(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Merge the fetched health rows against the canonical 8 sources so EVERY channel
 * renders — a source the backend omits is shown as dry (count 0), never hidden.
 * Management must SEE that a channel isn't flowing, not be misled that it's absent.
 */
function mergeSources(data: SourceHealthData[] | null): SourceHealthData[] {
  const bySource = new Map<FeedbackSource, SourceHealthData>();
  for (const row of data ?? []) bySource.set(row.source, row);
  return SOURCES.map((source) => {
    const row = bySource.get(source);
    if (row) return row;
    return {
      source,
      count: 0,
      classified_pct: 0,
      last_at: null,
      is_dry: true,
    };
  });
}

function SourceTile({ health }: { health: SourceHealthData }) {
  const meta = SOURCE_META[health.source];
  const isDry = health.is_dry || health.count === 0;

  return (
    <div
      className={`rounded-lg border p-3 ${
        isDry ? 'border-dashed bg-muted/40' : 'bg-card'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-1.5 text-xs font-medium ${
            isDry ? 'text-muted-foreground' : meta.color
          }`}
        >
          <meta.icon className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{meta.label}</span>
        </div>
        {isDry ? (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] font-normal bg-amber-50 text-amber-700 border-amber-200"
          >
            <CircleDashed className="h-2.5 w-2.5" />
            Dry
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] font-normal bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            <CheckCircle2 className="h-2.5 w-2.5" />
            Flowing
          </Badge>
        )}
      </div>

      <div
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          isDry ? 'text-muted-foreground/60' : 'text-foreground'
        }`}
      >
        {health.count.toLocaleString()}
      </div>

      <div className="mt-1 text-[11px] text-muted-foreground">
        {isDry ? (
          'No events yet'
        ) : (
          <span>
            {clampPct(health.classified_pct)}% classified &middot;{' '}
            {formatLastEvent(health.last_at)}
          </span>
        )}
      </div>
    </div>
  );
}

export function SourceHealth() {
  const [data, setData] = useState<SourceHealthData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchSourceHealth()
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load source health.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = mergeSources(data);
  const flowingCount = merged.filter((h) => !(h.is_dry || h.count === 0)).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Source Health</CardTitle>
        <CardDescription className="text-xs">
          {isLoading || error
            ? 'Which of the 8 feedback channels are flowing versus dry. A dry channel isn’t broken — it just has no events yet, so there’s genuinely no feedback to show from it.'
            : `${flowingCount} of ${SOURCES.length} feedback channels are flowing. A dry channel isn’t broken — it just has no events yet, so there’s genuinely no feedback to show from it.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <Skeleton className="mt-2 h-7 w-12" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-red-600">
            Couldn&rsquo;t load source health. {error}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {merged.map((health) => (
              <SourceTile key={health.source} health={health} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
