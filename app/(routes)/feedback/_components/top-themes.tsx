'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { TopicCount } from '@/lib/services/feedback/feedback-dashboard-service';

interface TopThemesProps {
  topics: TopicCount[];
  isLoading: boolean;
}

export function TopThemes({ topics, isLoading }: TopThemesProps) {
  const max = topics[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Top Themes</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No topics classified yet.</p>
        ) : (
          <div className="space-y-2">
            {topics.map(({ topic, count }) => (
              <div key={topic} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm truncate" title={topic}>
                      {topic}
                    </span>
                    <Badge variant="secondary" className="ml-2 flex-shrink-0 tabular-nums">
                      {count}
                    </Badge>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${Math.round((count / max) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
