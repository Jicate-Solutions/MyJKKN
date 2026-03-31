'use client';

import { useExpoCaptureStats, useExpoWaStats } from '@/hooks/admission/use-expo-capture';
import { Users, User, MessageCircle, CheckCheck, AlertTriangle } from 'lucide-react';

interface CaptureStatsBarProps {
  eventId: string;
  currentUserId: string;
}

export function CaptureStatsBar({ eventId, currentUserId }: CaptureStatsBarProps) {
  const { data: stats, isLoading } = useExpoCaptureStats(eventId, currentUserId);
  const { data: waStats } = useExpoWaStats(eventId);

  const hasWaActivity = (waStats?.total ?? 0) > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-14 bg-card border-t flex items-center justify-around px-4 z-10">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">You:</span>
        <span className="text-lg font-bold">
          {isLoading ? '—' : stats?.myCount ?? 0}
        </span>
      </div>
      <div className="w-px h-6 bg-border" />
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Team:</span>
        <span className="text-lg font-bold">
          {isLoading ? '—' : stats?.teamCount ?? 0}
        </span>
      </div>
      {hasWaActivity && (
        <>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5 text-green-600" />
              {waStats?.sent ?? 0}
            </span>
            {(waStats?.failed ?? 0) > 0 && (
              <span className="text-sm font-medium flex items-center gap-0.5 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                {waStats.failed}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
