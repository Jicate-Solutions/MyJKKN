'use client';

import { useEffect, useState } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  Reply,
  Building2,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchSuperOverview,
  fetchGenuineVsNoise,
  type SuperFilters,
  type SuperOverview,
  type GenuineVsNoise,
} from '@/lib/services/feedback/super-cockpit-service';

interface SuperOverviewProps {
  filters: SuperFilters;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

const SENTIMENT_ITEMS = [
  { key: 'positive', label: 'Positive', colorClass: 'text-emerald-600', dot: 'bg-emerald-500' },
  { key: 'neutral', label: 'Neutral', colorClass: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  { key: 'negative', label: 'Negative', colorClass: 'text-red-500', dot: 'bg-red-500' },
  { key: 'mixed', label: 'Mixed', colorClass: 'text-amber-500', dot: 'bg-amber-500' },
] as const;

export function SuperOverview({ filters }: SuperOverviewProps) {
  const [overview, setOverview] = useState<SuperOverview | null>(null);
  const [split, setSplit] = useState<GenuineVsNoise | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setIsLoading(true);
    setError(null);

    Promise.all([fetchSuperOverview(filters), fetchGenuineVsNoise(filters)])
      .then(([ov, sp]) => {
        if (ignore) return;
        setOverview(ov);
        setSplit(sp);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : 'Failed to load overview.');
        setOverview(null);
        setSplit(null);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source, filters.hideSpam, filters.institutionId]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-3 h-2.5 w-full" />
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
        <Card>
          <CardContent className="py-3">
            <Skeleton className="h-4 w-full max-w-md" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-8 text-center text-sm text-destructive">
          Couldn&apos;t load the overview.
          <span className="mt-1 block text-xs text-muted-foreground">{error}</span>
        </CardContent>
      </Card>
    );
  }

  if (!overview || overview.total === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No feedback events for the current filters.
        </CardContent>
      </Card>
    );
  }

  const classifiedPct =
    overview.total > 0 ? Math.round((overview.classified / overview.total) * 100) : 0;

  // Prefer the dedicated genuine-vs-noise result (carries noiseTargets); fall back
  // to the overview's own counts if that lane's fetch returned nothing.
  const genuine = split?.genuine ?? overview.genuine;
  const noise = split?.noise ?? overview.noise;
  const noiseTargetCount = split?.noiseTargets.length ?? 0;
  const gnTotal = genuine + noise;
  const genuinePct = gnTotal > 0 ? Math.round((genuine / gnTotal) * 100) : 0;
  const noisePct = gnTotal > 0 ? 100 - genuinePct : 0;

  const tiles = [
    {
      label: 'Total Events',
      value: overview.total,
      icon: MessageSquare,
      colorClass: 'text-foreground',
      note: undefined as string | undefined,
    },
    {
      label: 'Classified',
      value: overview.classified,
      icon: CheckCircle2,
      colorClass: 'text-foreground',
      note: `${classifiedPct}% · ${formatNumber(overview.unclassified)} unclassified`,
    },
    {
      label: 'Needs Reply',
      value: overview.needsReply,
      icon: Reply,
      colorClass: overview.needsReply > 0 ? 'text-amber-600' : 'text-foreground',
      note: undefined as string | undefined,
    },
    {
      label: 'Institutions',
      value: overview.institutions,
      icon: Building2,
      colorClass: 'text-foreground',
      note: undefined as string | undefined,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Core insight: genuine institutional voice vs external noise */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Genuine institutional voice vs external noise
          </CardTitle>
          <CardDescription className="text-xs">
            Most negatives are external troll-storms on a single public post — not
            institutional feedback. This is the cleaned signal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums text-emerald-600">
              {formatNumber(genuine)}
            </span>
            <span className="text-sm text-muted-foreground">genuine</span>
            <span className="px-1 text-muted-foreground">·</span>
            <span className="text-3xl font-semibold tabular-nums text-red-500">
              {formatNumber(noise)}
            </span>
            <span className="text-sm text-muted-foreground">
              external noise (troll-storms filtered)
            </span>
          </div>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-emerald-500" style={{ width: `${genuinePct}%` }} />
            <div className="h-full bg-red-400" style={{ width: `${noisePct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-emerald-600">{genuinePct}%</span> genuine signal
            </span>
            {noiseTargetCount > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                {noiseTargetCount} troll-storm target{noiseTargetCount === 1 ? '' : 's'} filtered
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top-line management tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              {t.note && <p className="mt-0.5 text-xs text-muted-foreground">{t.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Compact by-sentiment row */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            By sentiment
          </span>
          {SENTIMENT_ITEMS.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className={`text-sm font-semibold tabular-nums ${s.colorClass}`}>
                {formatNumber(overview.bySentiment[s.key])}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
