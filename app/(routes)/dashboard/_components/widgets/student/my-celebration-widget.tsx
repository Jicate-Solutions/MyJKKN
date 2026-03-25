'use client';

import { WidgetContainer } from '../shared/widget-container';
import { PartyPopper, Calendar } from 'lucide-react';
import { useMyCelebration } from '@/hooks/dashboard/use-celebrations';

interface MyCelebrationWidgetProps {
  userId: string;
  isVisible: boolean;
}

export function MyCelebrationWidget({
  userId,
  isVisible,
}: MyCelebrationWidgetProps) {
  const { data: celebration, isLoading, error } = useMyCelebration(userId);

  if (!isVisible) return null;

  // If no celebration found or error, handle gracefully
  if (!isLoading && !celebration) {
    return (
      <WidgetContainer
        title="My Next Milestone"
        icon={PartyPopper}
        isLoading={isLoading}
        error={error ? error.message : null}
      >
        <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
          <Calendar className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No upcoming milestones found</p>
        </div>
      </WidgetContainer>
    );
  }

  const daysLeft = celebration ? celebration.days_until : 0;
  const isBirthday = celebration?.type === 'birthday';

  return (
    <WidgetContainer
      title="My Next Milestone"
      icon={PartyPopper}
      isLoading={isLoading}
      error={error ? error.message : null}
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <div className="relative bg-background border-2 border-primary/20 rounded-full p-4 h-24 w-24 flex flex-col items-center justify-center shadow-sm">
            <span className="text-3xl font-bold text-primary">{daysLeft}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Days</span>
          </div>
        </div>
        
        <div className="space-y-1">
          <h4 className="font-semibold text-lg">
            Upcoming {isBirthday ? 'Birthday' : 'Anniversary'}
          </h4>
          <p className="text-sm text-muted-foreground">
            {celebration?.date && new Date(celebration.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </p>
        </div>

        {daysLeft <= 7 && (
          <div className="bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full">
            Coming up soon! 🎉
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}
