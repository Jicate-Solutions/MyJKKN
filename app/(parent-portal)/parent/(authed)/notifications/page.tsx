'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useParentNotifications } from '@/hooks/parent/use-parent-features';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';
import type { ParentNotification } from '@/types/parent-portal';

export default function NotificationsPage() {
  const { data, isLoading } = useParentNotifications();
  const queryClient = useQueryClient();
  const router = useRouter();
  const items = data?.data ?? [];

  const markAll = async () => {
    await ParentFeatures.markNotification(undefined, true);
    queryClient.invalidateQueries({ queryKey: ['parent-notifications'] });
  };
  const markOne = async (id: string) => {
    await ParentFeatures.markNotification(id);
    queryClient.invalidateQueries({ queryKey: ['parent-notifications'] });
  };
  // Mark read (fire-and-forget) then open the linked content, if any.
  const open = (n: ParentNotification) => {
    if (!n.isRead) markOne(n.id);
    if (n.actionUrl) router.push(n.actionUrl);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Notifications</h1>
        {(data?.unread ?? 0) > 0 && (
          <button onClick={markAll} className="text-xs font-medium text-[#0b6d41]">
            Mark all read
          </button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          No notifications yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card
              key={n.id}
              onClick={() => open(n)}
              className={cn('cursor-pointer p-4 transition-shadow hover:shadow-md active:scale-[0.99]', !n.isRead && 'border-[#0b6d41]/30 bg-[#0b6d41]/5')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold leading-snug">{n.title ?? 'Notification'}</p>
                <div className="mt-1 flex shrink-0 items-center gap-1.5">
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-[#0b6d41]" />}
                  {n.actionUrl && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.createdAt)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
