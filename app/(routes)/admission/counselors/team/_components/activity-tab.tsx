'use client';

// activity-tab.tsx
// Tab 5: Last 50 cascade events from admission_lead_cascade_history.
// Empty state shown gracefully when table has no rows (pre-cascade activity).

import { useCounselorCascadeHistory } from '@/hooks/admission/use-counselor-team-data';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, ArrowRight, AlertCircle } from 'lucide-react';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface ActivityTabProps {
  institutionId: string | undefined;
}

export function ActivityTab({ institutionId }: ActivityTabProps) {
  const { data: events = [], isLoading, error } = useCounselorCascadeHistory(institutionId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <Activity className="mb-4 h-12 w-12 opacity-40" />
        <p className="font-medium">No cascade events yet</p>
        <p className="mt-1 text-sm max-w-sm">
          Lead reassignment events will appear here when the auto-assignment engine runs or
          managers manually reassign leads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        Showing last {events.length} cascade event{events.length !== 1 ? 's' : ''}
      </p>

      {events.map((ev) => {
        const fromName = ev.from_counselor?.name ?? 'Unassigned';
        const toName = ev.to_counselor?.name ?? 'Unassigned';
        const leadName = ev.lead?.full_name ?? 'Unknown lead';

        return (
          <Card key={ev.id} className="border-l-4 border-l-primary/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Lead name */}
                  <p className="text-sm font-medium truncate">{leadName}</p>

                  {/* Counselor transfer arrow */}
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs py-0 font-normal">
                      {fromName}
                    </Badge>
                    <ArrowRight className="h-3 w-3 flex-shrink-0" />
                    <Badge variant="secondary" className="text-xs py-0 font-normal">
                      {toName}
                    </Badge>
                  </div>

                  {/* Reason */}
                  {ev.reason && (
                    <p className="mt-1 text-xs text-muted-foreground italic line-clamp-1">
                      {ev.reason}
                    </p>
                  )}
                </div>

                {/* Time */}
                <time
                  dateTime={ev.created_at}
                  className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0"
                  title={new Date(ev.created_at).toLocaleString('en-IN')}
                >
                  {timeAgo(ev.created_at)}
                </time>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
