'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Anomaly,
  InsightPriority,
} from '@/lib/services/admission/ai-insights-service';

interface AnomalyAlertsProps {
  anomalies: Anomaly[];
  isLoading?: boolean;
  maxItems?: number;
}

const severityConfig: Record<
  InsightPriority,
  { color: string; bgColor: string; borderColor: string }
> = {
  critical: {
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  high: {
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  medium: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  low: {
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
};

export function AnomalyAlerts({
  anomalies,
  isLoading,
  maxItems = 5,
}: AnomalyAlertsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-500" />
            Anomaly Detection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-lg border">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayAnomalies = anomalies.slice(0, maxItems);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-purple-500" />
          Anomaly Detection
          {anomalies.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {anomalies.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayAnomalies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No anomalies detected</p>
            <p className="text-sm mt-1">All metrics are within expected ranges</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayAnomalies.map((anomaly) => {
              const severity = severityConfig[anomaly.severity];
              return (
                <div
                  key={anomaly.id}
                  className={cn(
                    'p-4 rounded-lg border transition-colors',
                    severity.bgColor,
                    severity.borderColor
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-full',
                        anomaly.severity === 'critical' && 'bg-red-100',
                        anomaly.severity === 'high' && 'bg-orange-100',
                        anomaly.severity === 'medium' && 'bg-yellow-100',
                        anomaly.severity === 'low' && 'bg-blue-100'
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          'h-4 w-4',
                          anomaly.severity === 'critical' && 'text-red-600',
                          anomaly.severity === 'high' && 'text-orange-600',
                          anomaly.severity === 'medium' && 'text-yellow-600',
                          anomaly.severity === 'low' && 'text-blue-600'
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={cn('font-medium text-sm', severity.color)}>
                          {anomaly.title}
                        </h4>
                        <Badge
                          variant="outline"
                          className={cn('text-xs capitalize', severity.color)}
                        >
                          {anomaly.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {anomaly.description}
                      </p>
                      {anomaly.actual !== undefined && (
                        <div className="mt-2 flex items-center gap-4 text-xs">
                          <span className="text-muted-foreground">
                            Metric: <strong>{anomaly.metric}</strong>
                          </span>
                          <span className="text-muted-foreground">
                            Value: <strong>{anomaly.actual}</strong>
                          </span>
                          {anomaly.deviation !== 0 && (
                            <span
                              className={cn(
                                'font-medium',
                                anomaly.deviation > 0 ? 'text-green-600' : 'text-red-600'
                              )}
                            >
                              {anomaly.deviation > 0 ? '+' : ''}
                              {anomaly.deviation.toFixed(1)}% deviation
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
