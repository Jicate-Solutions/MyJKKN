'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TierBadge } from './tier-badge';
import { TOTAL_METRICS_COUNT } from '@/lib/services/solutions/paradigm-shift-service';
import type { DepartmentParadigmShift } from '@/lib/services/solutions/paradigm-shift-service';
import { formatCurrency } from '@/lib/services/solutions';

export function DepartmentCard({ dept }: { dept: DepartmentParadigmShift }) {
  const progressPct = Math.round((dept.active_metrics_count / TOTAL_METRICS_COUNT) * 100);

  return (
    <Link href={`/solutions/paradigm-shift/${dept.department_id}`}>
      <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold truncate">
                {dept.department_name}
              </CardTitle>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {dept.institution_name}
              </p>
            </div>
            <TierBadge tier={dept.tier} activeMetricsCount={dept.active_metrics_count} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{dept.active_metrics_count}/{TOTAL_METRICS_COUNT} metrics active</span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          {/* Key stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-semibold">{dept.metrics.solutions_built}</p>
              <p className="text-[10px] text-muted-foreground">Solutions</p>
            </div>
            <div>
              <p className="text-sm font-semibold">
                {dept.metrics.revenue_generated === 0
                  ? '\u2014'
                  : dept.metrics.revenue_generated < 1000
                    ? `\u20B9${dept.metrics.revenue_generated}`
                    : `${Math.round(dept.metrics.revenue_generated / 1000)}K`}
              </p>
              <p className="text-[10px] text-muted-foreground">Revenue</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{dept.metrics.publications}</p>
              <p className="text-[10px] text-muted-foreground">Pubs</p>
            </div>
          </div>

          {/* Department 40% revenue share */}
          {dept.metrics.revenue_generated > 0 && (
            <div className="flex items-center justify-between text-xs border-t pt-2">
              <span className="text-muted-foreground">Dept Share (40%)</span>
              <span className="font-semibold text-emerald-700">
                {formatCurrency(dept.metrics.revenue_generated * 0.4)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
