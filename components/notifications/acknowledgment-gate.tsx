'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  ChevronRight,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { UnacknowledgedNotification } from '@/types/notifications';

/**
 * AcknowledgmentGate — The core component that replaces Google Chat's voluntary 🙏
 *
 * This renders a full-screen blocking overlay when there are unacknowledged
 * mandatory notifications. The user CANNOT interact with the app until they
 * read and acknowledge every pending notification.
 *
 * Design principle: Cookie-consent pattern — you must deal with it to proceed.
 */
export function AcknowledgmentGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);

  // Fetch unacknowledged notifications
  const { data, isLoading } = useQuery({
    queryKey: ['unacknowledged-notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/acknowledge');
      if (!res.ok) return { unacknowledged: [], count: 0, has_pending: false };
      return res.json();
    },
    refetchInterval: 60000, // Check every minute for new mandatory notifications
    refetchOnWindowFocus: true
  });

  const notifications: UnacknowledgedNotification[] =
    data?.unacknowledged || [];
  const hasPending = notifications.length > 0;

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch('/api/notifications/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notificationId })
      });
      if (!res.ok) throw new Error('Failed to acknowledge');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['unacknowledged-notifications']
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const handleAcknowledge = useCallback(async () => {
    const current = notifications[currentIndex];
    if (!current) return;

    setAcknowledging(true);
    try {
      await acknowledgeMutation.mutateAsync(current.notification_id);

      if (currentIndex < notifications.length - 1) {
        // Move to next notification
        setCurrentIndex((prev) => prev + 1);
        toast.success(
          `Acknowledged (${currentIndex + 1}/${notifications.length})`
        );
      } else {
        // All done
        toast.success('All notifications acknowledged!', {
          icon: '✅',
          duration: 3000
        });
        setCurrentIndex(0);
      }
    } catch {
      toast.error('Failed to acknowledge. Please try again.');
    } finally {
      setAcknowledging(false);
    }
  }, [notifications, currentIndex, acknowledgeMutation]);

  // Don't block while loading
  if (isLoading) return <>{children}</>;

  // No pending acknowledgments — render app normally
  if (!hasPending) return <>{children}</>;

  const current = notifications[currentIndex];
  if (!current) return <>{children}</>;

  const deadlineDate = new Date(current.deadline_at);
  const isOverdue = current.is_overdue;
  const timeLeft = isOverdue
    ? 'OVERDUE'
    : getTimeRemaining(deadlineDate);

  return (
    <>
      {/* Blocked app content (blurred) */}
      <div className="pointer-events-none select-none blur-sm opacity-30">
        {children}
      </div>

      {/* Full-screen acknowledgment overlay */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg bg-background rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div
            className={cn(
              'px-6 py-4 flex items-center gap-3',
              isOverdue
                ? 'bg-destructive text-destructive-foreground'
                : current.priority === 'urgent'
                  ? 'bg-orange-500 text-white'
                  : 'bg-primary text-primary-foreground'
            )}
          >
            <Shield className="h-6 w-6 shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">
                Mandatory Acknowledgment
              </h2>
              <p className="text-sm opacity-90">
                {notifications.length === 1
                  ? '1 notification requires your acknowledgment'
                  : `${currentIndex + 1} of ${notifications.length} notifications`}
              </p>
            </div>
            {isOverdue && (
              <Badge variant="outline" className="bg-white/20 text-white border-white/30 shrink-0">
                OVERDUE
              </Badge>
            )}
          </div>

          {/* Notification content */}
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Title and metadata */}
            <div>
              <h3 className="text-xl font-semibold">{current.title}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Bell className="h-3.5 w-3.5" />
                  {current.category}
                </span>
                <span>·</span>
                <span>From: {current.created_by_name}</span>
                <span>·</span>
                <Badge
                  variant={
                    current.priority === 'urgent'
                      ? 'destructive'
                      : current.priority === 'high'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-xs"
                >
                  {current.priority}
                </Badge>
              </div>
            </div>

            {/* Body */}
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <RichTextDisplay content={current.body} />
            </div>

            {/* Deadline indicator */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                isOverdue
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isOverdue ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              <span>
                {isOverdue
                  ? `Acknowledgment was due ${getTimeAgo(deadlineDate)}. Your supervisor will be notified.`
                  : `Deadline: ${timeLeft}`}
              </span>
            </div>
          </div>

          {/* Action area */}
          <div className="px-6 py-4 bg-muted/30 border-t">
            <Button
              onClick={handleAcknowledge}
              disabled={acknowledging}
              className={cn(
                'w-full h-12 text-base font-semibold gap-2',
                isOverdue && 'bg-destructive hover:bg-destructive/90'
              )}
            >
              {acknowledging ? (
                'Acknowledging...'
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  I Acknowledge
                  {notifications.length > 1 && currentIndex < notifications.length - 1 && (
                    <ChevronRight className="h-4 w-4 ml-1" />
                  )}
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              By acknowledging, you confirm that you have read and understood
              this notification. This action is permanently recorded.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function getTimeRemaining(deadline: Date): string {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return 'OVERDUE';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}
