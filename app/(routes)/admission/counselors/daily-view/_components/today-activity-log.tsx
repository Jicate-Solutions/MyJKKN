'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, StickyNote, ArrowRight, Mail, MessageCircle, Users } from 'lucide-react';
import type { TodayActivity } from '@/lib/services/admission/counselor-daily-view-service';

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  note: StickyNote,
  stage_change: ArrowRight,
  email: Mail,
  whatsapp: MessageCircle,
  meeting: Users,
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: 'text-blue-600 bg-blue-50',
  note: 'text-yellow-600 bg-yellow-50',
  stage_change: 'text-purple-600 bg-purple-50',
  email: 'text-green-600 bg-green-50',
  whatsapp: 'text-emerald-600 bg-emerald-50',
  meeting: 'text-orange-600 bg-orange-50',
};

interface TodayActivityLogProps {
  activities: TodayActivity[];
  isLoading?: boolean;
}

export function TodayActivityLog({ activities, isLoading }: TodayActivityLogProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">
          Today&apos;s Activity ({activities.length})
        </h3>
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No activity recorded today yet.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {activities.map((activity, idx) => {
              const Icon = ACTIVITY_ICONS[activity.activity_type] || StickyNote;
              const colorClass = ACTIVITY_COLORS[activity.activity_type] || 'text-gray-600 bg-gray-50';
              const time = new Date(activity.created_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={`${activity.lead_id}-${idx}`}
                  className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-xs"
                >
                  <div className={`p-1 rounded ${colorClass} flex-shrink-0 mt-0.5`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{activity.lead_name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {activity.activity_type.replace('_', ' ')}
                      </Badge>
                    </div>
                    {activity.description && (
                      <p className="text-muted-foreground truncate mt-0.5">
                        {activity.description}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground flex-shrink-0">{time}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
