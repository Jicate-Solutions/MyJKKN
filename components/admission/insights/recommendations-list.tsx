'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Lightbulb,
  ArrowRight,
  Phone,
  Calendar,
  Send,
  UserPlus,
  ClipboardList,
  Settings,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Recommendation,
  InsightAction,
  InsightPriority,
} from '@/lib/services/admission/ai-insights-service';

interface RecommendationsListProps {
  recommendations: Recommendation[];
  isLoading?: boolean;
  maxItems?: number;
}

const actionIcons: Record<InsightAction, React.ReactNode> = {
  contact_lead: <Phone className="h-4 w-4" />,
  schedule_followup: <Calendar className="h-4 w-4" />,
  send_campaign: <Send className="h-4 w-4" />,
  assign_counselor: <UserPlus className="h-4 w-4" />,
  review_leads: <ClipboardList className="h-4 w-4" />,
  update_strategy: <Settings className="h-4 w-4" />,
  view_report: <FileText className="h-4 w-4" />,
  no_action: null,
};

const priorityColors: Record<InsightPriority, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
};

export function RecommendationsList({
  recommendations,
  isLoading,
  maxItems = 5,
}: RecommendationsListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayRecommendations = recommendations.slice(0, maxItems);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Recommendations
          {recommendations.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {recommendations.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayRecommendations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No recommendations at this time</p>
            <p className="text-sm mt-1">
              Generate insights to see actionable recommendations
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayRecommendations.map((rec, index) => (
              <div
                key={rec.id}
                className={cn(
                  'p-4 rounded-lg border transition-colors hover:bg-muted/50',
                  index === 0 && 'ring-2 ring-primary/20'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-full',
                        rec.priority === 'critical' && 'bg-red-100',
                        rec.priority === 'high' && 'bg-orange-100',
                        rec.priority === 'medium' && 'bg-yellow-100',
                        rec.priority === 'low' && 'bg-blue-100'
                      )}
                    >
                      {actionIcons[rec.actionType] || <Lightbulb className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{rec.title}</h4>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', priorityColors[rec.priority])}
                        >
                          {rec.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {rec.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {rec.impact}
                      </p>
                    </div>
                  </div>
                </div>
                {rec.actionUrl && (
                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={rec.actionUrl}>
                        {rec.actionLabel}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {recommendations.length > maxItems && (
              <div className="text-center pt-2">
                <Button variant="ghost" size="sm">
                  View all {recommendations.length} recommendations
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
