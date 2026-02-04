'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Users,
  Flame,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Target,
  Lightbulb,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBriefingPopup } from '@/hooks/admission/use-briefing-notifications';
import type { BriefingNotification, ActionItem } from '@/lib/services/admission/briefing-delivery-service';

interface BriefingPopupProps {
  notification: BriefingNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BriefingPopup({
  notification,
  open,
  onOpenChange
}: BriefingPopupProps) {
  const router = useRouter();
  const { briefing, isLoading, markAsRead, isMarking } = useBriefingPopup(notification);

  // Mark as read when opened
  useEffect(() => {
    if (open && notification && !notification.is_read) {
      markAsRead();
    }
  }, [open, notification]);

  const handleViewFullBriefing = () => {
    onOpenChange(false);
    router.push('/admission/briefing');
  };

  const handleActionClick = (action: ActionItem) => {
    if (action.link) {
      onOpenChange(false);
      router.push(action.link);
    }
  };

  const getActionIcon = (type: ActionItem['type']) => {
    switch (type) {
      case 'followup':
        return Clock;
      case 'review':
        return CheckCircle;
      case 'alert':
        return AlertCircle;
      default:
        return ArrowRight;
    }
  };

  const getActionPriorityColor = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-amber-500';
      default:
        return 'text-blue-500';
    }
  };

  const getHighlightIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'alert':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Lightbulb className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {isLoading ? (
                  <Skeleton className="h-6 w-48" />
                ) : (
                  briefing?.title || notification?.title || 'Daily Briefing'
                )}
              </DialogTitle>
              <DialogDescription>
                {isLoading ? (
                  <Skeleton className="h-4 w-64 mt-1" />
                ) : (
                  briefing?.briefing_date
                    ? new Date(briefing.briefing_date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'AI-generated insights for your admission pipeline'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading ? (
            <BriefingPopupSkeleton />
          ) : briefing ? (
            <div className="space-y-6 py-2">
              {/* Executive Summary */}
              <div className="p-4 rounded-lg bg-muted/50 border">
                <p className="text-sm text-foreground leading-relaxed">
                  {briefing.content.executive_summary}
                </p>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Total Leads"
                  value={briefing.content.key_metrics.total_leads}
                  icon={Users}
                  color="text-blue-500"
                />
                <MetricCard
                  label="New Today"
                  value={briefing.content.key_metrics.new_leads}
                  icon={TrendingUp}
                  color="text-green-500"
                />
                <MetricCard
                  label="Hot Leads"
                  value={briefing.content.key_metrics.hot_leads}
                  icon={Flame}
                  color="text-orange-500"
                />
                <MetricCard
                  label="Followups"
                  value={briefing.content.key_metrics.followups_today}
                  icon={Clock}
                  color="text-purple-500"
                  highlight={briefing.content.key_metrics.overdue_followups > 0}
                  subtext={
                    briefing.content.key_metrics.overdue_followups > 0
                      ? `${briefing.content.key_metrics.overdue_followups} overdue`
                      : undefined
                  }
                />
              </div>

              {/* Conversion Rate */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Conversion Rate</span>
                </div>
                <Badge variant="secondary" className="text-lg font-bold">
                  {briefing.content.key_metrics.conversion_rate.toFixed(1)}%
                </Badge>
              </div>

              {/* Highlights */}
              {briefing.content.highlights.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Key Highlights
                  </h4>
                  <div className="space-y-2">
                    {briefing.content.highlights.slice(0, 3).map((highlight, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-background"
                      >
                        {getHighlightIcon(highlight.type)}
                        <div>
                          <p className="text-sm font-medium">{highlight.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {highlight.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              {briefing.content.action_items.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Priority Actions
                  </h4>
                  <div className="space-y-2">
                    {briefing.content.action_items.slice(0, 3).map((action) => {
                      const ActionIcon = getActionIcon(action.type);
                      return (
                        <button
                          key={action.id}
                          onClick={() => handleActionClick(action)}
                          className={cn(
                            'w-full flex items-center justify-between p-3 rounded-lg border bg-background',
                            'hover:bg-muted/50 transition-colors text-left',
                            action.link && 'cursor-pointer'
                          )}
                          disabled={!action.link}
                        >
                          <div className="flex items-center gap-3">
                            <ActionIcon
                              className={cn('h-4 w-4', getActionPriorityColor(action.priority))}
                            />
                            <div>
                              <p className="text-sm font-medium">{action.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {action.description}
                              </p>
                            </div>
                          </div>
                          {action.link && (
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Unable to load briefing content</p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleViewFullBriefing} className="gap-2">
            View Full Briefing
            <ExternalLink className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  highlight?: boolean;
  subtext?: string;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  highlight,
  subtext
}: MetricCardProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border bg-background',
        highlight && 'border-amber-300 dark:border-amber-700'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold">{value.toLocaleString()}</p>
      {subtext && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          {subtext}
        </p>
      )}
    </div>
  );
}

function BriefingPopupSkeleton() {
  return (
    <div className="space-y-6 py-2">
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
