'use client';

/**
 * Institution Grid — super admin's default view (decision #17).
 *
 * Renders one compact card per JKKN institution (11 tenants). Each card shows
 * a short rollup: active staff, pending approvals (with overdue split),
 * staff on leave today, and FY utilization %.
 *
 * A failing card renders inline error and doesn't break neighbors — the
 * `error` field is set per-card by HRDashboardService.getInstitutionGrid().
 */

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Building2, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InstitutionCard } from '@/types/hr-dashboard';

export function InstitutionGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="h-full">
          <CardHeader className="pb-2">
            <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-4 w-24 rounded bg-muted/70 animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted/70 animate-pulse" />
            <div className="h-4 w-28 rounded bg-muted/70 animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function InstitutionGrid({ cards }: { cards: InstitutionCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No institutions found. Super admin view requires at least one{' '}
        <code className="font-mono text-xs">hr_organizations</code> row linked to
        an institution.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <InstitutionCardTile key={card.institution_id} card={card} />
      ))}
    </div>
  );
}

function InstitutionCardTile({ card }: { card: InstitutionCard }) {
  const pct = card.fy_utilization_pct;
  const overdue = card.pending_approvals_overdue;

  if (card.error) {
    return (
      <Card className="h-full border-red-200 bg-red-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {card.institution_name}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-red-700 space-y-1">
          <p>Card failed to aggregate.</p>
          <p className="font-mono break-all text-[10px] text-red-600/80">{card.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link
      href={`/hr?institution_id=${card.institution_id}`}
      className="block"
    >
      <Card className="h-full hover:shadow-md hover:border-primary/40 transition-all">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{card.institution_name}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active staff</span>
            <span className="font-semibold">{card.active_staff.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pending approvals</span>
            <span className="flex items-center gap-1.5">
              <span className="font-semibold">{card.pending_approvals}</span>
              {overdue > 0 && (
                <Badge
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-300 h-5 text-[10px] px-1.5"
                >
                  {overdue} overdue
                </Badge>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">On leave today</span>
            <span className="font-semibold">{card.staff_on_leave_today}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5" />
              FY utilization
            </span>
            <span
              className={cn(
                'font-semibold',
                pct >= 90 && 'text-red-600',
                pct >= 70 && pct < 90 && 'text-amber-600',
                pct < 70 && 'text-green-700'
              )}
            >
              {pct}%
            </span>
          </div>
          <div className="pt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
            View institution <ArrowRight className="h-3 w-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
