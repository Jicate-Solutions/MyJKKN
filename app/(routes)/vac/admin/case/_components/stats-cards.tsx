'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, CheckCircle, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import type { CaseRiskCalculation } from '@/types/case';

interface StatsCardsProps {
  learners: CaseRiskCalculation[];
  isLoading: boolean;
}

export function StatsCards({ learners, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const total = learners.length;
  const onTrack = learners.filter((l) => l.calculated_risk_level === 'on_track' || l.calculated_risk_level === 'completed').length;
  const atRisk = learners.filter((l) => l.calculated_risk_level === 'at_risk').length;
  const critical = learners.filter((l) => l.calculated_risk_level === 'critical' || l.calculated_risk_level === 'overdue').length;
  const onTrackPct = total > 0 ? Math.round((onTrack / total) * 100) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Learners */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Learners</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{total}</div>
          <p className="text-xs text-muted-foreground">Enrolled in CASE programme</p>
        </CardContent>
      </Card>

      {/* On Track */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">On Track</CardTitle>
          <CheckCircle className="h-4 w-4 text-[#0b6d41]" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-[#0b6d41]">{onTrackPct}%</div>
          <p className="text-xs text-muted-foreground">{onTrack} learners on pace</p>
        </CardContent>
      </Card>

      {/* At Risk */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">At Risk</CardTitle>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">{atRisk}</div>
          <p className="text-xs text-muted-foreground">Need intervention soon</p>
        </CardContent>
      </Card>

      {/* Critical / Overdue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Critical / Overdue</CardTitle>
          <XCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{critical}</div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Immediate action required
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
