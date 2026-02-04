'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useLatestBriefing, useBriefingNotifications } from '@/hooks/admission/use-briefing-notifications';
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
  Target,
  Lightbulb,
  AlertTriangle,
  Printer,
  RefreshCw,
  ChevronRight,
  BarChart3,
  Calendar
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ActionItem } from '@/lib/services/admission/briefing-delivery-service';

function BriefingPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  trend,
  description
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  trend?: { value: number; isPositive: boolean };
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs mt-1',
                  trend.isPositive ? 'text-green-600' : 'text-red-600'
                )}
              >
                {trend.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trend.isPositive ? '+' : ''}
                {trend.value}% vs yesterday
              </div>
            )}
          </div>
          <div className={cn('h-12 w-12 rounded-full flex items-center justify-center bg-muted')}>
            <Icon className={cn('h-6 w-6', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionItemCard({ action }: { action: ActionItem }) {
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

  const getPriorityBadge = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">High Priority</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">Medium</Badge>;
      default:
        return <Badge variant="outline">Low</Badge>;
    }
  };

  const Icon = getActionIcon(action.type);

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-sm">{action.title}</h4>
          {getPriorityBadge(action.priority)}
        </div>
        <p className="text-sm text-muted-foreground">{action.description}</p>
        {action.link && (
          <Link
            href={action.link}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
          >
            Take Action
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function HighlightCard({
  highlight
}: {
  highlight: { title: string; description: string; type: string };
}) {
  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircle,
          color: 'text-green-500',
          bg: 'bg-green-500/10'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          color: 'text-amber-500',
          bg: 'bg-amber-500/10'
        };
      case 'alert':
        return {
          icon: AlertCircle,
          color: 'text-red-500',
          bg: 'bg-red-500/10'
        };
      default:
        return {
          icon: Lightbulb,
          color: 'text-blue-500',
          bg: 'bg-blue-500/10'
        };
    }
  };

  const { icon: Icon, color, bg } = getTypeStyles(highlight.type);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border">
      <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <div>
        <p className="font-medium text-sm">{highlight.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{highlight.description}</p>
      </div>
    </div>
  );
}

function BriefingPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const { data: briefing, isLoading, refetch, isRefetching } = useLatestBriefing(institutionId);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Daily Briefing">
          <BriefingPageSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  if (!briefing) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Daily Briefing">
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Briefing</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <Card className="py-16">
              <CardContent className="flex flex-col items-center text-center">
                <Sparkles className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Briefing Available</h3>
                <p className="text-muted-foreground max-w-md">
                  Your daily briefing has not been generated yet. Briefings are typically
                  generated in the morning based on your admission pipeline data.
                </p>
                <Button className="mt-6" asChild>
                  <Link href="/admission/dashboard">
                    Go to Dashboard
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Daily Briefing">
        <div className="space-y-6 print:space-y-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <Breadcrumb className="print:hidden">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Briefing</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex items-center gap-3 mt-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{briefing.title}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {new Date(briefing.briefing_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isRefetching && 'animate-spin')} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>

          {/* Executive Summary */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-foreground leading-relaxed">
                {briefing.content.executive_summary}
              </p>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4">
            <MetricCard
              label="Total Leads"
              value={briefing.content.key_metrics.total_leads}
              icon={Users}
              color="text-blue-500"
            />
            <MetricCard
              label="New Leads"
              value={briefing.content.key_metrics.new_leads}
              icon={TrendingUp}
              color="text-green-500"
              description="Added today"
            />
            <MetricCard
              label="Hot Leads"
              value={briefing.content.key_metrics.hot_leads}
              icon={Flame}
              color="text-orange-500"
              description="High engagement"
            />
            <MetricCard
              label="Followups Today"
              value={briefing.content.key_metrics.followups_today}
              icon={Clock}
              color="text-purple-500"
              description={
                briefing.content.key_metrics.overdue_followups > 0
                  ? `${briefing.content.key_metrics.overdue_followups} overdue`
                  : 'On track'
              }
            />
          </div>

          {/* Conversion Rate Banner */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium">Overall Conversion Rate</p>
                    <p className="text-sm text-muted-foreground">Lead to enrollment</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary">
                    {briefing.content.key_metrics.conversion_rate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
            {/* Key Highlights */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  Key Highlights
                </CardTitle>
                <CardDescription>
                  Important insights from your admission data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {briefing.content.highlights.length > 0 ? (
                  briefing.content.highlights.map((highlight, index) => (
                    <HighlightCard key={index} highlight={highlight} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No highlights available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Priority Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Priority Actions
                </CardTitle>
                <CardDescription>
                  Recommended actions for today
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {briefing.content.action_items.length > 0 ? (
                  briefing.content.action_items.map((action) => (
                    <ActionItemCard key={action.id} action={action} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No action items for today
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Predictions & Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
            {/* Predictions */}
            {briefing.content.predictions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Predictions
                  </CardTitle>
                  <CardDescription>
                    AI-generated forecasts based on your data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {briefing.content.predictions.map((prediction, index) => (
                    <div key={index} className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">{prediction.metric}</p>
                        <Badge
                          variant={
                            prediction.confidence === 'high'
                              ? 'default'
                              : prediction.confidence === 'medium'
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {prediction.confidence} confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{prediction.prediction}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {briefing.content.recommendations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Recommendations
                  </CardTitle>
                  <CardDescription>
                    Suggested improvements for your pipeline
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {briefing.content.recommendations.map((rec, index) => (
                    <div key={index} className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{rec.category}</Badge>
                      </div>
                      <p className="text-sm font-medium">{rec.recommendation}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expected impact: {rec.impact}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Funnel by Stage */}
          {Object.keys(briefing.content.key_metrics.leads_by_stage).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Funnel Distribution</CardTitle>
                <CardDescription>Leads by pipeline stage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(briefing.content.key_metrics.leads_by_stage).map(
                    ([stage, count]) => {
                      const total = briefing.content.key_metrics.total_leads || 1;
                      const percentage = ((count as number) / total) * 100;
                      return (
                        <div key={stage} className="flex items-center gap-3">
                          <div className="w-32 text-sm capitalize truncate">
                            {stage.replace(/_/g, ' ')}
                          </div>
                          <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="w-16 text-sm font-medium text-right">{count}</div>
                        </div>
                      );
                    }
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Print Footer */}
          <div className="hidden print:block text-center text-xs text-muted-foreground py-4 border-t">
            Generated by MyJKKN AI on{' '}
            {new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function BriefingPage() {
  return <BriefingPageContent />;
}
