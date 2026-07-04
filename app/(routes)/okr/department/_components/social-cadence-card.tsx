'use client';

/**
 * SocialCadenceCard — leadership view of a department's monthly Instagram
 * cadence, surfaced INSIDE the OKR department dashboard (Director-locked
 * decision #4: the monthly loop lives inside the OKR system).
 *
 * Read-only here: it lists the department's monthly cadence cycles (objective,
 * month, status, reach delta) and deep-links to the Social Loop page where the
 * owner (HOD) opens / acts on / closes cycles. Each cadence links to a
 * cycle_type='monthly' OKR objective, so this card is the OKR-side window onto
 * the same loop. Reach numbers come from ig_monthly_audit via the cadence API.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getCadences } from '@/lib/services/social/cadence-service';
import type { CadenceStatus, MonthlyCadence } from '@/lib/types/social-cadence';

function monthLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const STATUS_STYLE: Record<CadenceStatus, string> = {
  open: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  awaiting_close: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  closed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  unmeasurable: 'bg-muted text-muted-foreground border-border',
};

const STATUS_LABEL: Record<CadenceStatus, string> = {
  open: 'Open',
  awaiting_close: 'Awaiting close',
  closed: 'Closed',
  unmeasurable: 'Not measurable',
};

function Delta({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) {
    return <span className="text-xs text-muted-foreground">reach n/a</span>;
  }
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const cls = delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {delta > 0 ? '+' : ''}
      {delta.toLocaleString('en-US')}
    </span>
  );
}

export function SocialCadenceCard({ departmentId }: { departmentId?: string }) {
  const [rows, setRows] = useState<MonthlyCadence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!departmentId) {
      setRows([]);
      return;
    }
    (async () => {
      const res = await getCadences({ departmentId });
      if (cancelled) return;
      if (!res.success) {
        setError(res.error ?? 'Failed to load social cadence.');
        setRows([]);
      } else {
        setRows(res.cadences ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  return (
    <Card className="border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarClock className="h-5 w-5 text-[#0b6d41]" />
          Monthly Instagram Cadence
        </CardTitle>
        <CardDescription>
          The department&apos;s monthly reach loop (objective → measure → feedback → act →
          re-measure). Owned by the HOD;{' '}
          <Link href="/admission/social/loop" className="inline-flex items-center gap-1 text-[#0b6d41] hover:underline">
            open the Social Loop <ExternalLink className="h-3 w-3" />
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No monthly cadence cycles for this department yet.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{monthLabel(c.cadence_month)}</span>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{c.objective}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    base {c.baseline_reach?.toLocaleString('en-US') ?? '—'}
                  </span>
                  <Delta delta={c.reach_delta} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
