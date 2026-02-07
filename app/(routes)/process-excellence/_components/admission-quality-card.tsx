'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  PhoneCall,
  AlertTriangle,
  Users,
  Target,
  Minus,
} from 'lucide-react';
import { useAdmissionTQMMetrics } from '@/hooks/admission/use-admission-tqm-metrics';

interface AdmissionQualityCardProps {
  institutionId: string;
}

function formatDelta(current: number | null, previous: number | null): {
  text: string;
  isPositive: boolean;
  icon: typeof TrendingUp;
} {
  if (current == null || previous == null || previous === 0) {
    return { text: '', isPositive: true, icon: Minus };
  }
  const delta = current - previous;
  const pct = ((delta / previous) * 100).toFixed(1);
  if (delta > 0) {
    return { text: `+${pct}%`, isPositive: true, icon: TrendingUp };
  } else if (delta < 0) {
    return { text: `${pct}%`, isPositive: false, icon: TrendingDown };
  }
  return { text: '0%', isPositive: true, icon: Minus };
}

function formatCurrency(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  } else if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${amount}`;
}

function formatHours(hours: number | null): string {
  if (hours == null) return '--';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function AdmissionQualityCard({ institutionId }: AdmissionQualityCardProps) {
  const { data, isLoading, isError } = useAdmissionTQMMetrics(institutionId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-48 bg-muted rounded" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded" />
              ))}
            </div>
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return null; // Silently don't render if data unavailable
  }

  const { current, previous, copq } = data;

  // Compute deltas
  const conversionDelta = formatDelta(
    current.conversion_rate_pct,
    previous?.conversion_rate_pct ?? null
  );
  // For SLA and lost rate, interpret correctly:
  // Higher SLA is better (positive = good)
  const slaDelta = formatDelta(
    current.first_contact_sla_pct,
    previous?.first_contact_sla_pct ?? null
  );
  // Lower lost rate is better (flip the interpretation)
  const lostDelta = formatDelta(
    current.lost_rate_pct,
    previous?.lost_rate_pct ?? null
  );

  const SLA_TARGET = 90; // 90% target for first contact within 4hrs
  const CYCLE_TARGET_HOURS = 504; // 21 days

  const slaOk = (current.first_contact_sla_pct ?? 0) >= SLA_TARGET;
  const cycleOk =
    current.avg_cycle_time_hours != null &&
    current.avg_cycle_time_hours <= CYCLE_TARGET_HOURS;

  return (
    <Card>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Admission Process Quality</h3>
          </div>
          <Badge variant="outline" className="text-[10px]">
            This Month
          </Badge>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Conversion Rate */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs text-muted-foreground">Conversion</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold">
                {current.conversion_rate_pct != null
                  ? `${current.conversion_rate_pct.toFixed(1)}%`
                  : '--'}
              </span>
              {conversionDelta.text && (
                <span
                  className={`text-[10px] font-medium ${
                    conversionDelta.isPositive ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {conversionDelta.text}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {current.enrolled_count}/{current.total_leads} leads
            </div>
          </div>

          {/* Avg Cycle Time */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-purple-600" />
              <span className="text-xs text-muted-foreground">Cycle Time</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold">
                {formatHours(current.avg_cycle_time_hours)}
              </span>
              {current.avg_cycle_time_hours != null && (
                <span className={`text-[10px] ${cycleOk ? 'text-green-600' : 'text-amber-600'}`}>
                  {cycleOk ? '✓' : '⚠'}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Target: {formatHours(CYCLE_TARGET_HOURS)}
            </div>
          </div>

          {/* First Contact SLA */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <PhoneCall className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs text-muted-foreground">1st Contact SLA</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold">
                {current.first_contact_sla_pct != null
                  ? `${current.first_contact_sla_pct.toFixed(0)}%`
                  : '--'}
              </span>
              {slaDelta.text ? (
                <span
                  className={`text-[10px] font-medium ${
                    slaDelta.isPositive ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {slaDelta.text}
                </span>
              ) : (
                <span className={`text-[10px] ${slaOk ? 'text-green-600' : 'text-amber-600'}`}>
                  {slaOk ? '✓' : '⚠'}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Target: {SLA_TARGET}% within 4hrs
            </div>
          </div>

          {/* Lost Rate */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">Lost Rate</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold">
                {current.lost_rate_pct != null
                  ? `${current.lost_rate_pct.toFixed(1)}%`
                  : '0%'}
              </span>
              {lostDelta.text && (
                <span
                  className={`text-[10px] font-medium ${
                    !lostDelta.isPositive ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {lostDelta.text}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Lower is better
            </div>
          </div>
        </div>

        {/* COPQ Section */}
        {(copq.total_incidents > 0 ||
          copq.total_visible_cost > 0 ||
          copq.total_hidden_cost > 0) && (
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Cost of Poor Quality (COPQ)
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="font-semibold text-red-600">
                  {formatCurrency(copq.total_visible_cost)}
                </span>
                <span className="text-muted-foreground ml-1">visible</span>
              </div>
              <div>
                <span className="font-semibold text-amber-600">
                  {formatCurrency(copq.total_hidden_cost)}
                </span>
                <span className="text-muted-foreground ml-1">hidden</span>
              </div>
              <div className="text-muted-foreground">
                {copq.total_incidents} incident{copq.total_incidents !== 1 ? 's' : ''}
              </div>
            </div>
            {copq.top_categories.length > 0 && (
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {copq.top_categories.map((cat) => (
                  <Badge
                    key={cat.category}
                    variant="outline"
                    className="text-[9px] px-1.5 py-0"
                  >
                    {cat.category.replace(/_/g, ' ')} ({formatCurrency(cat.cost)})
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* No COPQ fallback */}
        {copq.total_incidents === 0 &&
          copq.total_visible_cost === 0 &&
          copq.total_hidden_cost === 0 && (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground text-center">
                No COPQ incidents this month
              </div>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
