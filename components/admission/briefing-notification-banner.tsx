'use client';

import { useState } from 'react';
import { X, Sparkles, ChevronRight, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBriefingBanner } from '@/hooks/admission/use-briefing-notifications';
import { useAuth } from '@/hooks/use-auth';

interface BriefingNotificationBannerProps {
  onViewBriefing?: () => void;
  className?: string;
}

export function BriefingNotificationBanner({
  onViewBriefing,
  className
}: BriefingNotificationBannerProps) {
  const { profile } = useAuth();
  const userId = profile?.id;

  const {
    notification,
    unreadCount,
    isLoading,
    hasUnread,
    markAsRead,
    dismiss,
    isDismissing
  } = useBriefingBanner(userId);

  const [isVisible, setIsVisible] = useState(true);

  // Don't render if no unread notifications or dismissed
  if (!hasUnread || !notification || !isVisible || isLoading) {
    return null;
  }

  const handleDismiss = async () => {
    if (notification?.id) {
      await dismiss(notification.id);
      setIsVisible(false);
    }
  };

  const handleView = async () => {
    if (notification?.id) {
      await markAsRead(notification.id);
    }
    onViewBriefing?.();
  };

  // Get priority-based styles
  const getPriorityStyles = () => {
    switch (notification.priority) {
      case 'high':
        return 'bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 border-orange-300 dark:border-orange-700';
      case 'low':
        return 'bg-gradient-to-r from-slate-500/10 via-gray-500/10 to-zinc-500/10 border-slate-300 dark:border-slate-700';
      default:
        return 'bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-blue-300 dark:border-blue-700';
    }
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border p-4 mb-6 transition-all duration-300',
        getPriorityStyles(),
        className
      )}
    >
      {/* Animated sparkle effect in background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-2 left-4 animate-pulse">
          <Sparkles className="h-3 w-3 text-primary" />
        </div>
        <div className="absolute bottom-3 right-8 animate-pulse delay-150">
          <Sparkles className="h-2 w-2 text-primary" />
        </div>
        <div className="absolute top-4 right-20 animate-pulse delay-300">
          <Sparkles className="h-2.5 w-2.5 text-primary" />
        </div>
      </div>

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm text-foreground">
                {notification.title}
              </h4>
              {unreadCount > 1 && (
                <span className="inline-flex items-center justify-center h-5 px-1.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {notification.summary}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="default"
            size="sm"
            onClick={handleView}
            className="gap-1"
          >
            View Briefing
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            disabled={isDismissing}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>

      {/* Key highlights preview */}
      {notification.metadata?.highlights && notification.metadata.highlights.length > 0 && (
        <div className="relative mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Bell className="h-3 w-3" />
          <span>
            Highlights: {notification.metadata.highlights.slice(0, 2).join(' | ')}
            {notification.metadata.highlights.length > 2 && ' ...'}
          </span>
        </div>
      )}
    </div>
  );
}
