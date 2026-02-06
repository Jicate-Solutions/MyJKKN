'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Activity,
  Layers,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import type { LifecycleKPIs } from '@/types/usage-analytics';
import { HEALTH_GRADE_CONFIG, type HealthGrade } from '@/types/usage-analytics';

interface LifecycleKPICardsProps {
  kpis: LifecycleKPIs | null;
  loading: boolean;
}

function TrendIndicator({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="flex items-center text-xs text-green-600">
        <TrendingUp className="h-3 w-3 mr-0.5" />
        +{value}%
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex items-center text-xs text-red-600">
        <TrendingDown className="h-3 w-3 mr-0.5" />
        {value}%
      </span>
    );
  }
  return (
    <span className="flex items-center text-xs text-muted-foreground">
      <Minus className="h-3 w-3 mr-0.5" />
      0%
    </span>
  );
}

export function LifecycleKPICards({ kpis, loading }: LifecycleKPICardsProps) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-24" />
                <div className="h-8 bg-muted rounded w-16" />
                <div className="h-3 bg-muted rounded w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const periodLabel =
    kpis.period_days === 1
      ? 'today'
      : `last ${kpis.period_days} days`;

  const cards = [
    {
      title: 'Active Users',
      value: kpis.active_users_period,
      subtitle: `${kpis.active_users_24h} in last 24h`,
      icon: Users,
      trend: kpis.trends.active_users_change,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Total Actions',
      value: kpis.total_actions_period.toLocaleString(),
      subtitle: `${kpis.total_actions_24h.toLocaleString()} in last 24h`,
      icon: Activity,
      trend: kpis.trends.actions_change,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Modules Used',
      value: `${kpis.modules_used}/${kpis.total_modules}`,
      subtitle: `${Math.round((kpis.modules_used / kpis.total_modules) * 100)}% adoption in ${periodLabel}`,
      icon: Layers,
      trend: kpis.trends.modules_change,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  // Health score card with special rendering
  const healthScore = kpis.health_score;
  const healthGrade = (kpis.health_grade || 'F') as HealthGrade;
  const gradeConfig = HEALTH_GRADE_CONFIG[healthGrade] || HEALTH_GRADE_CONFIG.F;
  const hasHealthScore = healthScore !== null && healthScore !== undefined;

  // Determine health score color
  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  const getHealthProgressColor = (score: number) => {
    if (score >= 80) return '[&>div]:bg-green-500';
    if (score >= 50) return '[&>div]:bg-amber-500';
    return '[&>div]:bg-red-500';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {card.title}
              </p>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-2xl font-bold">{card.value}</p>
              <TrendIndicator value={card.trend} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {card.subtitle}
            </p>
          </CardContent>
        </Card>
      ))}

      {/* Health Score Card - Special rendering */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              Health Score
            </p>
            <div className="p-2 rounded-lg bg-rose-50">
              <Heart className="h-4 w-4 text-rose-600" />
            </div>
          </div>
          {hasHealthScore ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <p className={`text-2xl font-bold ${getHealthScoreColor(healthScore)}`}>
                  {healthScore.toFixed(1)}
                </p>
                <Badge
                  variant="secondary"
                  className={`${gradeConfig.color} ${gradeConfig.bgColor} text-xs`}
                >
                  {healthGrade} - {gradeConfig.label}
                </Badge>
              </div>
              <div className="mt-2">
                <Progress
                  value={healthScore}
                  className={`h-2 ${getHealthProgressColor(healthScore)}`}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Composite score across all dimensions
              </p>
            </>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-muted-foreground">—</p>
                <Badge variant="outline" className="text-xs">
                  No data
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Scores compute daily from usage data
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
