// components/accreditation/body-scoreboard-card.tsx
// ============================================================================
// Shared card for each of the 10 compliance bodies. Consumed by the
// /accreditation landing page AND by per-body dashboards (PR-A8+).
// ============================================================================

'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import type { BodyMeta, BodyScoreboard } from '@/lib/types/accreditation';

interface BodyScoreboardCardProps {
  meta: BodyMeta;
  scoreboard?: BodyScoreboard;
  isLoading?: boolean;
}

export function BodyScoreboardCard({ meta, scoreboard, isLoading }: BodyScoreboardCardProps) {
  const href = `/accreditation/${meta.code.toLowerCase()}`;
  const statusBadge =
    meta.status === 'live'
      ? { label: 'Live', variant: 'default' as const }
      : meta.status === 'phase-2'
      ? { label: 'Phase 2+', variant: 'outline' as const }
      : { label: 'Scaffolding', variant: 'secondary' as const };

  return (
    <Link href={href} className="block">
      <Card
        className={`h-full transition hover:shadow-md border-2 ${meta.accentClass}`}
        data-body-code={meta.code}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold tracking-tight">
              {meta.shortLabel}
            </CardTitle>
            <Badge variant={statusBadge.variant} className="text-[10px]">
              {statusBadge.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">{meta.name}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{meta.description}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{meta.cycleLabel}</span>
            <span className="text-muted-foreground/40">·</span>
            <ShieldCheck className="h-3 w-3" />
            <span className="truncate">{meta.scopeLabel}</span>
          </div>
          {isLoading ? (
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          ) : scoreboard ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Metrics seeded</span>
                <span className="font-medium">{scoreboard.metrics_seeded}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Evidence rows</span>
                <span className="font-medium">{scoreboard.evidence_rows}</span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Coverage</span>
                  <span className="font-medium">{scoreboard.coverage_pct}%</span>
                </div>
                <Progress value={scoreboard.coverage_pct} className="h-1.5" />
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-end pt-1 text-xs font-medium text-primary">
            View dashboard <ArrowRight className="ml-1 h-3 w-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
