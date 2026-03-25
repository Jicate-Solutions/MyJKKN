'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  Bell,
  TrendingUp,
  LineChart,
  Activity,
  BarChart3,
  X,
  ExternalLink,
  Users,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  AIInsight,
  InsightPriority,
  InsightType,
} from '@/lib/services/admission/ai-insights-service';

interface InsightCardProps {
  insight: AIInsight;
  onDismiss?: (id: string) => void;
  isDismissing?: boolean;
  compact?: boolean;
}

const priorityConfig: Record<
  InsightPriority,
  { color: string; bgColor: string; borderColor: string; icon: React.ReactNode }
> = {
  critical: {
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: <AlertCircle className="h-5 w-5 text-red-600" />,
  },
  high: {
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: <AlertTriangle className="h-5 w-5 text-orange-600" />,
  },
  medium: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: <Info className="h-5 w-5 text-yellow-600" />,
  },
  low: {
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: <Lightbulb className="h-5 w-5 text-blue-600" />,
  },
};

const typeConfig: Record<InsightType, { label: string; icon: React.ReactNode }> = {
  follow_up_reminder: {
    label: 'Follow-up',
    icon: <Bell className="h-4 w-4" />,
  },
  conversion_opportunity: {
    label: 'Conversion',
    icon: <TrendingUp className="h-4 w-4" />,
  },
  engagement_alert: {
    label: 'Engagement',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  trend_insight: {
    label: 'Trend',
    icon: <LineChart className="h-4 w-4" />,
  },
  anomaly_detection: {
    label: 'Anomaly',
    icon: <Activity className="h-4 w-4" />,
  },
  recommendation: {
    label: 'Recommendation',
    icon: <Lightbulb className="h-4 w-4" />,
  },
  performance_insight: {
    label: 'Performance',
    icon: <BarChart3 className="h-4 w-4" />,
  },
};

export function InsightCard({
  insight,
  onDismiss,
  isDismissing,
  compact = false,
}: InsightCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const priority = priorityConfig[insight.priority];
  const type = typeConfig[insight.type];

  const relatedCount = insight.related_lead_ids?.length || 0;

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-start gap-3 p-3 rounded-lg border transition-colors',
          priority.bgColor,
          priority.borderColor,
          'hover:shadow-sm'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex-shrink-0 mt-0.5">{priority.icon}</div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', priority.color)}>
            {insight.title}
          </p>
          {insight.metric_value !== undefined && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {insight.metric_label}: {insight.metric_value}
              {insight.metric_change !== undefined && insight.metric_change !== 0 && (
                <span
                  className={cn(
                    'ml-1',
                    insight.metric_change > 0 ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  ({insight.metric_change > 0 ? '+' : ''}
                  {insight.metric_change.toFixed(1)}%)
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {insight.action_url && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <Link href={insight.action_url}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View details</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onDismiss && isHovered && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDismiss(insight.id)}
              disabled={isDismissing}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        priority.borderColor,
        'hover:shadow-md'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardHeader className={cn('pb-2', priority.bgColor)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {priority.icon}
            <div>
              <CardTitle className={cn('text-base', priority.color)}>
                {insight.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {type.icon}
                  <span className="ml-1">{type.label}</span>
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs capitalize',
                    insight.priority === 'critical' && 'border-red-300 text-red-700',
                    insight.priority === 'high' && 'border-orange-300 text-orange-700',
                    insight.priority === 'medium' && 'border-yellow-300 text-yellow-700',
                    insight.priority === 'low' && 'border-blue-300 text-blue-700'
                  )}
                >
                  {insight.priority}
                </Badge>
              </div>
            </div>
          </div>
          {onDismiss && isHovered && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mt-1 -mr-2"
              onClick={() => onDismiss(insight.id)}
              disabled={isDismissing}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        <p className="text-sm text-muted-foreground">{insight.description}</p>

        {/* Metrics */}
        {insight.metric_value !== undefined && (
          <div className="flex items-center gap-4 p-2 bg-muted/50 rounded-md">
            <div>
              <p className="text-2xl font-bold">{insight.metric_value}</p>
              <p className="text-xs text-muted-foreground">{insight.metric_label}</p>
            </div>
            {insight.metric_change !== undefined && insight.metric_change !== 0 && (
              <div
                className={cn(
                  'flex items-center gap-1 text-sm font-medium',
                  insight.metric_change > 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {insight.metric_change > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingUp className="h-4 w-4 rotate-180" />
                )}
                {insight.metric_change > 0 ? '+' : ''}
                {insight.metric_change.toFixed(1)}%
              </div>
            )}
          </div>
        )}

        {/* Related entities */}
        {relatedCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>Affects {relatedCount} lead{relatedCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Expiry */}
        {insight.expires_at && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              Expires{' '}
              {new Date(insight.expires_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* Action button */}
        {insight.action_url && (
          <Button asChild className="w-full" variant="outline">
            <Link href={insight.action_url}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Take Action
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
