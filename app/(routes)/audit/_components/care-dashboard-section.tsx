// app/(routes)/audit/_components/care-dashboard-section.tsx
// Leadership CARE list on the audit dashboard (spec §5):
// initiative · audience · index · flagged pillars · re-audit due (overdue badge).
// Data: fn_care_list_audits (owner sees own; leadership sees all CARE audits).

'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, HeartHandshake, Inbox, Plus } from 'lucide-react';
import { useCareAudits } from '@/hooks/audit';
import {
  careIndex,
  pillarScores,
} from '@/lib/services/audit/care-scoring-service';
import { cn } from '@/lib/utils';

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

export function CareDashboardSection() {
  const { data: audits, isLoading } = useCareAudits();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <HeartHandshake className="h-4 w-4 text-rose-600" />
          CARE Audits
        </CardTitle>
        <Button size="sm" variant="outline" asChild>
          <Link href="/audit/care/new">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New CARE audit
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
        ) : !audits || audits.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center text-xs text-muted-foreground">
            <Inbox className="h-6 w-6 mb-2" />
            <p>No CARE audits yet.</p>
            <p>
              Any staff member can open one — 20 items, 0–4, one initiative,
              one audience.
            </p>
          </div>
        ) : (
          <div className="rounded-md border divide-y">
            {audits.map((audit) => {
              const { index } = careIndex(audit.owner_scores);
              const pillars = pillarScores(audit.owner_scores);
              const flagged = pillars.filter(
                (p) => p.scoredCount === 5 && p.total < 8,
              );
              const overdue =
                audit.phase !== 'closed' &&
                new Date(audit.re_audit_date) < new Date();
              return (
                <Link
                  key={audit.cycle_id}
                  href={`/audit/care/${audit.cycle_id}`}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{audit.name}</div>
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
                      className={cn(
                        'text-[10px] tabular-nums',
                        index !== null && index < 30 && 'border-red-300 text-red-800',
                        index !== null && index >= 30 && index < 48 && 'border-amber-300 text-amber-800',
                        index !== null && index >= 48 && index < 65 && 'border-sky-300 text-sky-800',
                        index !== null && index >= 65 && 'border-emerald-300 text-emerald-800',
                      )}
                    >
                      {index === null
                        ? `${audit.owner_scores.length}/20`
                        : `${index}/80`}
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
