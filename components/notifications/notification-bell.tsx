// components/notifications/notification-bell.tsx
'use client';

import * as React from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useUnreadNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDeleteAllRead,
  UNREAD_PREVIEW_LIMIT
} from '@/hooks/notification/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { useMediaQuery } from '@/hooks/use-media-query';
import { NotificationItem } from './notification-item';
import { collapseDuplicates } from '@/lib/notifications/collapse-duplicates';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

export function NotificationBell() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const { data, isLoading } = useUnreadNotifications(user?.id);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteAllRead = useDeleteAllRead();
  const [open, setOpen] = React.useState(false);

  // Below Tailwind's `sm` the desktop popover was rendering as a ~204px card
  // floating over the page inside a 299px viewport (verified on the Director's
  // iPhone, 2026-08-09) — clipped, cramped, unreadable. Small screens get a
  // bottom sheet instead; >= sm keeps the existing dropdown untouched.
  const isCompact = useMediaQuery('(max-width: 639px)');

  // Radix tooltips have no hover-off on a finger, so on a touch device the
  // "Mark all as read" tooltip LATCHES OPEN over the first notification and
  // stays there. Rather than fighting it with timers, the tooltip simply does
  // not exist where hover does not exist — the buttons keep their aria-label,
  // and in the compact sheet they also carry visible text.
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');

  // `notifications` is a PREVIEW (the few rows this dropdown renders), so its
  // length is not the unread tally. The tally comes from a real COUNT query on
  // GET /api/notifications (`unread_count`, global by contract). Until
  // 2026-07-15 the bell fetched every unread row fully joined, on a 30s poll,
  // just to read `.length` — an array length standing in for a COUNT.
  const notifications = data?.notifications ?? [];
  // ONE fold, and only the near-duplicate one: same metadata.event, or same
  // category + digit-stripped title. It collapses repeats of the SAME fact,
  // which is the only fold that can honestly hide a row.
  //
  // An earlier revision of this PR added a second, category-wide fold to stop a
  // dominant category filling the panel. It cannot work here and it loses mail:
  // the bell only ever holds the newest UNREAD_PREVIEW_LIMIT (5) unread rows, so
  // the burial happens in the API's ORDER BY created_at DESC LIMIT 5, not at
  // render time — folding those 5 by category cannot fetch the row that was
  // never returned, it can only delete one that was.
  //
  // Modelled read-only against production on 2026-08-09 — both folds in the
  // order the reverted revision ran them (collapseDuplicates then
  // collapseByCategory, MIN_STACK = 3) over each user's newest 5 unread,
  // non-expired rows, compared against the duplicate fold alone (what ships):
  // of 7,151 users with unread mail, 4,353 would lose at least one distinct
  // preview row and 2,957 would see the bell collapse to a SINGLE row — 14,008
  // distinct rows destroyed cluster-wide. Live unread state moves, so re-running
  // this drifts by a row or two; the shape does not.
  //
  // Concrete case, still true when re-checked on 2026-08-09 (user 020c6373):
  // five different programmes, all category 'dashboard:anomaly', all
  // "Attendance not marked today — <programme>", none carrying a metadata.event
  // — so the duplicate fold cannot touch them and the category fold folded all
  // five to ONE row showing ONE programme's title, the other four unreachable.
  //
  // Making that panel honest needs a GLOBAL per-category tally, which this
  // component does not have. GET /api/notifications already returns one
  // (`category_counts`), but hooks/notification/use-notifications.ts drops it —
  // wiring it through is a separate change, not a render-time fold.
  const foldedNotifications = collapseDuplicates(notifications);
  const unreadCount = data?.unreadCount ?? 0;
  // What the BADGE shows. The badge is a ~20px pill pinned to a 36px icon
  // button; on a 387px-wide phone a raw three-or-more-digit count (observed:
  // 658) drew outside the button and ran into the account avatar beside it.
  // Cap the glyph count at three so the pill can never grow past the button.
  // The exact number is not lost — the panel header below still prints
  // "{unreadCount} new" in full, one tap away.
  const unreadBadgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  const handleNotificationClick = async (
    notificationId: string,
    actionUrl?: string
  ) => {
    setOpen(false);
    await markAsRead.mutateAsync(notificationId);
    // Always navigate so a click never silently no-ops. Most notifications
    // carry an action_url; dashboard:* digests have historically shipped with
    // url=null, so the click would mark-as-read but go nowhere, making the
    // dropdown feel broken. Fallback to /notifications (the full list) so the
    // user always lands somewhere — never on a 404.
    router.push(actionUrl || '/notifications');
  };

  const handleMarkAllRead = () => {
    if (!user?.id) return;
    markAllAsRead.mutate(user.id);
  };

  const handleClearAll = () => {
    if (!user?.id) return;
    // Mark all as read first, then delete all read in sequence
    markAllAsRead.mutate(user.id, {
      onSuccess: () => {
        deleteAllRead.mutate(user.id);
      }
    });
  };

  const handleViewAll = () => {
    setOpen(false);
    router.push('/notifications');
  };

  const isActioning = markAllAsRead.isPending || deleteAllRead.isPending;

  const trigger = (
    <Button variant='ghost' size='icon' className='relative' aria-label='Notifications'>
      <Bell className='h-5 w-5' aria-hidden='true' />
      {unreadCount > 0 && (
        // The badge grows into a pill instead of clipping — the old fixed
        // h-5 w-5 square could not hold three digits. tabular-nums keeps
        // the width from jittering as the count ticks; the ring separates
        // it from the bell glyph underneath.
        //
        // Anchored on the repo's shared badge corner, 'absolute -top-1
        // -right-1' — the same offsets BottomNav/bottom-nav-item.tsx and
        // eight other badge call sites use. Pulling it in to right-0
        // parked the pill on top of the bell glyph instead.
        // Still no '9+' cap — that reads as "about ten" and hid a real
        // 257-item backlog — but capped at '99+' so the pill is never
        // wider than three glyphs. The panel prints the exact number.
        <Badge
          variant='destructive'
          title={`${unreadCount} unread notifications`}
          className='absolute -top-1 -right-1 h-5 min-w-[1.25rem] w-auto flex items-center justify-center rounded-full px-1 py-0 text-[10px] font-bold leading-none tabular-nums ring-2 ring-background'
        >
          {unreadBadgeLabel}
        </Badge>
      )}
    </Button>
  );

  const renderAction = (
    key: string,
    Icon: typeof CheckCheck,
    label: string,
    shortLabel: string,
    onClick: () => void,
    hoverClass: string
  ) => {
    const button = isCompact ? (
      <Button
        variant='ghost'
        size='sm'
        aria-label={label}
        onClick={onClick}
        disabled={isActioning}
        className={cn('h-8 gap-1 px-2 text-muted-foreground', hoverClass)}
      >
        <Icon className='h-3.5 w-3.5' aria-hidden='true' />
        <span>{shortLabel}</span>
      </Button>
    ) : (
      <Button
        variant='ghost'
        size='icon'
        aria-label={label}
        onClick={onClick}
        disabled={isActioning}
        className={cn('h-7 w-7 text-muted-foreground', hoverClass)}
      >
        <Icon className='h-3.5 w-3.5' aria-hidden='true' />
      </Button>
    );

    // No hover => no tooltip at all, so nothing can latch open on touch.
    if (!canHover) return <React.Fragment key={key}>{button}</React.Fragment>;

    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side='bottom'>
          <p className='text-xs'>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const headerActions = unreadCount > 0 && (
    <div
      className={cn(
        'flex items-center gap-1',
        // Compact: own row, so it can never be overlapped by the title.
        // Desktop: icon-only, must not shrink beside the title.
        isCompact ? '-mx-2 flex-wrap' : 'shrink-0'
      )}
    >
      {renderAction(
        'mark-all',
        CheckCheck,
        'Mark all as read',
        'Mark read',
        handleMarkAllRead,
        'hover:text-foreground'
      )}
      {renderAction(
        'clear-all',
        Trash2,
        'Clear all notifications',
        'Clear',
        handleClearAll,
        'hover:text-destructive'
      )}
    </div>
  );

  // The compact header STACKS. This guards a regression introduced EARLIER IN
  // THIS PR, not a defect on main: main's compact header has icon-only actions
  // and does not collide. Once the compact branch gave those buttons visible
  // text ("Mark read" / "Clear") they occupied a fixed ~171px on one row inside
  // a sheet that also reserves pr-12 for SheetContent's own close button, and
  // the title plus the "{n} new" badge painted straight over them at 299px and
  // 320px. Two rows cost ~24px of height and collide at no width. The title
  // truncates too, so a long count can never push the badge out.
  const renderHeader = (TitleTag: React.ElementType) => (
    <div
      className={cn(
        'border-b px-4 py-3',
        isCompact
          ? 'flex flex-col gap-1.5'
          : 'flex items-center justify-between gap-2'
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          // Clears SheetContent's close button (rendered at right-4) — on the
          // title row only, so the actions below get the full width.
          isCompact && 'pr-12'
        )}
      >
        <TitleTag className='truncate text-sm font-semibold'>
          Notifications
        </TitleTag>
        {unreadCount > 0 && (
          <Badge
            variant='secondary'
            className='h-5 shrink-0 px-1.5 text-xs tabular-nums'
          >
            {unreadCount} new
          </Badge>
        )}
      </div>
      {headerActions}
    </div>
  );

  const listBody = (
    <>
      {isLoading && (
        <div className='p-4 space-y-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='space-y-2'>
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-3 w-3/4' />
            </div>
          ))}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className='p-8 text-center text-muted-foreground'>
          <Bell className='h-12 w-12 mx-auto mb-2 opacity-20' />
          <p className='text-sm font-medium'>All caught up!</p>
          <p className='text-xs mt-0.5 opacity-70'>No new notifications</p>
        </div>
      )}

      {!isLoading && notifications.length > 0 && (
        // line-clamp-2 on the item's title: at 204px wide a single clamped line
        // rendered "Bug BUG-003277 agin..." — a title truncated past the point of
        // meaning anything. Overridden here rather than in notification-item so
        // the shared component (and the full inbox) keep their current layout.
        <div className='divide-y [&_h4]:line-clamp-2 [&_h4]:break-words'>
          {foldedNotifications
            .slice(0, UNREAD_PREVIEW_LIMIT)
            .map((notification) => {
              const stackCount = notification.__stackCount || 1;
              return (
                <div
                  key={notification.id}
                  className={cn('relative', stackCount > 1 && '[&_h4]:pr-12')}
                >
                  <NotificationItem
                    notification={notification}
                    onClick={() =>
                      handleNotificationClick(
                        notification.id,
                        notification.action_url
                      )
                    }
                  />
                  {stackCount > 1 && (
                    <Badge
                      variant='secondary'
                      // Honest wording: this counts the rows LOADED into this
                      // preview, not every matching row on the server.
                      aria-label={`${stackCount} similar notifications loaded in this preview`}
                      className='absolute right-3 top-3 text-[10px] px-1.5 py-0 pointer-events-none'
                    >
                      ×{stackCount}
                    </Badge>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </>
  );

  const footer = notifications.length > 0 && (
    <>
      <Separator />
      <div className='p-2'>
        <Button
          variant='ghost'
          className='w-full text-sm h-9'
          onClick={handleViewAll}
        >
          View all notifications
        </Button>
      </div>
    </>
  );

  if (isCompact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent
            side='bottom'
            // No SheetDescription in this panel; tell Radix so it does not warn
            // about a missing description.
            aria-describedby={undefined}
            className='flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]'
          >
            {renderHeader(SheetTitle)}
            {/* Native scrolling rather than ScrollArea: momentum + overscroll
                containment behave correctly inside an iOS sheet. */}
            <div className='min-h-[8rem] flex-1 overflow-y-auto overscroll-contain'>
              {listBody}
            </div>
            {footer}
          </SheetContent>
        </Sheet>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>

        <PopoverContent className='w-80 p-0' align='end'>
          {renderHeader('h3')}
          <ScrollArea className='h-[400px]'>{listBody}</ScrollArea>
          {footer}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
