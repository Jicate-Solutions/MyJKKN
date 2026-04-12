'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEngagementSummary, useRecentActivity } from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  BookOpen,
  ClipboardCheck,
  Target,
  Award,
  Flame,
  Hammer,
  Activity,
  ChevronDown,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Activity event type configuration
const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: typeof BookOpen; color: string; bgColor: string }> = {
  lesson: {
    label: 'Lesson',
    icon: BookOpen,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-950/40',
  },
  quiz: {
    label: 'Quiz',
    icon: ClipboardCheck,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-950/40',
  },
  quest: {
    label: 'Quest',
    icon: Target,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-950/40',
  },
  badge: {
    label: 'Badge',
    icon: Award,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-950/40',
  },
  streak: {
    label: 'Streak',
    icon: Flame,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-950/40',
  },
  build: {
    label: 'Build Session',
    icon: Hammer,
    color: 'text-rose-600',
    bgColor: 'bg-rose-100 dark:bg-rose-950/40',
  },
  discussion: {
    label: 'Discussion',
    icon: MessageSquare,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100 dark:bg-teal-950/40',
  },
};

// Activity event shape (from engagement logs)
interface ActivityEvent {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export default function ActivityFeedPage() {
  const { profile: user } = useAuth();
  const learnerId = user?.id;
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState(20);

  const { data: engagementData, isLoading: engagementLoading } = useEngagementSummary(learnerId);
  const { data: activityData, isLoading: activityLoading } = useRecentActivity(learnerId, 50);
  const isLoading = engagementLoading || activityLoading;

  // Transform raw engagement events into activity events
  const allEvents: ActivityEvent[] = useMemo(() => {
    if (!activityData || !Array.isArray(activityData)) return [];
    return activityData.map((event: Record<string, unknown>) => ({
      id: (event.id as string) || String(Math.random()),
      event_type: (event.event_type as string) || 'engagement',
      description: (event.description as string) || (event.event_type as string) || 'Activity',
      created_at: (event.created_at as string) || new Date().toISOString(),
      metadata: (event.metadata as Record<string, unknown>) || undefined,
    }));
  }, [activityData]);

  const filteredEvents = useMemo(() => {
    if (!typeFilter) return allEvents;
    return allEvents.filter((e) => e.event_type === typeFilter);
  }, [allEvents, typeFilter]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEvents.length;

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <ContentLayout title="Activity Feed">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Profile', href: '/learn/profile' },
          { label: 'Activity' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header + Filter */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#0b6d41' }}>
              Activity Feed
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your complete PDE journey -- every lesson, quest, badge, and build session
            </p>
          </div>
          <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Activities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Activity Feed */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#0b6d41" />
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Activity className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No activity yet</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {typeFilter
                    ? `No ${EVENT_TYPE_CONFIG[typeFilter]?.label.toLowerCase() || typeFilter} activity found. Try clearing the filter.`
                    : 'Start learning, building, or completing quests to see your activity feed grow. Every action you take is recorded here.'}
                </p>
                {typeFilter && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setTypeFilter('')}
                  >
                    Clear Filter
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {visibleEvents.map((event) => {
                  const config = EVENT_TYPE_CONFIG[event.event_type] || {
                    label: event.event_type,
                    icon: Activity,
                    color: 'text-gray-600',
                    bgColor: 'bg-gray-100',
                  };
                  const Icon = config.icon;

                  return (
                    <div
                      key={event.id}
                      className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors"
                    >
                      {/* Icon */}
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                        config.bgColor
                      )}>
                        <Icon className={cn('h-5 w-5', config.color)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-relaxed">
                          {event.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {config.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatRelativeTime(event.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Load More */}
                {hasMore && (
                  <div className="flex justify-center p-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleCount((prev) => prev + 20)}
                    >
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Load More
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
