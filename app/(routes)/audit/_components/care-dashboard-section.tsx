// app/(routes)/audit/_components/care-dashboard-section.tsx
// Leadership culture-audit list on the audit dashboard (spec §5):
// initiative · audience · framework · index · flagged pillars · re-audit due.
// Data: fn_care_list_audits (CARE v1) + fn_carre_list_audits (CARRE v2), merged
// (owner sees own; leadership sees all). Each row is badged CARE v1 / CARRE v2
// and its index is computed with the framework-matched math (/80 vs /100).

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, HeartHandshake, Inbox, Plus } from 'lucide-react';
import { useCareAudits, useCarreAudits } from '@/hooks/audit';
import {
  careIndex,
  pillarScores as carePillarScores,
} from '@/lib/services/audit/care-scoring-service';
import {
  carreIndex,
  pillarScores as carrePillarScores,
} from '@/lib/services/audit/carre-scoring-service';
import { cn } from '@/lib/utils';

type Framework = 'CARE' | 'CARRE';

interface ListRow {
  cycle_id: string;
  name: string;
  audience: string | null;
  phase: string;
  re_audit_date: string;
  created_at: string;
  owner_name: string | null;
  owner_scores: Array<{ parameter_code: string; score: number }>;
  framework: Framework;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Framework-matched index + flagged (floor-rule) pillars for one row. */
function computeRow(row: ListRow) {
  if (row.framework === 'CARRE') {
    const { index } = carreIndex(row.owner_scores);
    const flagged = carrePillarScores(row.owner_scores).filter(
      (p) => p.scoredCount === 5 && p.total < 8,
    );
    return { index, denom: 100, itemCount: 25, flagged };
  }
  const { index } = careIndex(row.owner_scores);
  const flagged = carePillarScores(row.owner_scores).filter(
    (p) => p.scoredCount === 5 && p.total < 8,
  );
  return { index, denom: 80, itemCount: 20, flagged };
}

/** Verdict-band colouring for the index badge (bands differ per framework). */
function indexBadgeClass(framework: Framework, index: number | null): string {
  if (index === null) return 'tabular-nums';
  if (framework === 'CARRE') {
    return cn(
      'tabular-nums',
      index < 38 && 'border-red-300 text-red-800',
      index >= 38 && index < 60 && 'border-amber-300 text-amber-800',
      index >= 60 && index < 81 && 'border-sky-300 text-sky-800',
      index >= 81 && 'border-emerald-300 text-emerald-800',
    );
  }
  return cn(
    'tabular-nums',
    index < 30 && 'border-red-300 text-red-800',
    index >= 30 && index < 48 && 'border-amber-300 text-amber-800',
    index >= 48 && index < 65 && 'border-sky-300 text-sky-800',
    index >= 65 && 'border-emerald-300 text-emerald-800',
  );
}

export function CareDashboardSection() {
  const { data: careAudits, isLoading: careLoading } = useCareAudits();
  const { data: carreAudits, isLoading: carreLoading } = useCarreAudits();
  const isLoading = careLoading || carreLoading;

  const rows = useMemo<ListRow[]>(() => {
    const care: ListRow[] = (careAudits ?? []).map((a) => ({ ...a, framework: 'CARE' }));
    const carre: ListRow[] = (carreAudits ?? []).map((a) => ({ ...a, framework: 'CARRE' }));
    return [...care, ...carre].sort((x, y) => {
      const dx = new Date(x.re_audit_date).getTime();
      const dy = new Date(y.re_audit_date).getTime();
      if (dx !== dy) return dx - dy; // soonest re-audit first (overdue at top)
      return new Date(y.created_at).getTime() - new Date(x.created_at).getTime();
    });
  }, [careAudits, carreAudits]);

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <HeartHandshake className="h-4 w-4 text-rose-600" />
          Culture Audits
        </CardTitle>
        <Button size="sm" variant="outline" asChild className="shrink-0">
          <Link href="/audit/care/new">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New CARRE audit
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center text-xs text-muted-foreground">
            <Inbox className="h-6 w-6 mb-2" />
            <p>No culture audits yet.</p>
            <p>
              Any staff member can open a CARRE audit — 25 items, 0–4, one
              initiative, one audience.
            </p>
          </div>
        ) : (
          <div className="rounded-md border divide-y">
            {rows.map((audit) => {
              const { index, denom, itemCount, flagged } = computeRow(audit);
              const overdue =
                audit.phase !== 'closed' &&
                new Date(audit.re_audit_date) < new Date();
              return (
                <Link
                  key={`${audit.framework}:${audit.cycle_id}`}
                  href={`/audit/care/${audit.cycle_id}`}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{audit.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] uppercase flex-shrink-0',
                          audit.framework === 'CARRE'
                            ? 'border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300'
                            : 'border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        {audit.framework === 'CARRE' ? 'CARRE v2' : 'CARE v1'}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {audit.audience ?? '—'}
                      {audit.owner_name ? ` · ${audit.owner_name}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {flagged.map((p) => (
                      <Badge
                        key={p.pillar}
                        variant="outline"
                        className="text-[10px] border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                        title={`${p.label} ${p.total}/20 — floor rule`}
                      >
                        {p.pillar} {p.total}
                      </Badge>
                    ))}
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', indexBadgeClass(audit.framework, index))}
                    >
                      {index === null
                        ? `${audit.owner_scores.length}/${itemCount}`
                        : `${index}/${denom}`}
                    </Badge>
                    <span
                      className={cn(
                        'text-[11px] tabular-nums',
                        overdue ? 'text-red-600 font-medium' : 'text-muted-foreground',
                      )}
                    >
                      {formatDate(audit.re_audit_date)}
                    </span>
                    {overdue && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                      >
                        Overdue
                      </Badge>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
