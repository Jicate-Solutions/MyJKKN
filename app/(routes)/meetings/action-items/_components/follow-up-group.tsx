'use client';

// app/(routes)/meetings/action-items/_components/follow-up-group.tsx
//
// One meeting's follow-ups on "My Follow-ups": the meeting header, then the
// items split into Yours / Others / Unassigned, each with a Done toggle, and a
// "Mark all done" that asks first. Every change goes through the server
// actions in ../actions and then router.refresh() re-reads the list.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowUpRight, CalendarDays, CheckCheck, CheckSquare, Loader2, Square } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  FollowUpBand,
  FollowUpItem,
  FollowUpMeetingGroup,
} from '@/lib/services/meetings/meeting-action-item-service';

import { markMeetingFollowUpsDoneAction, setFollowUpStatusAction } from '../actions';

const BANDS: Array<{ key: FollowUpBand; label: string }> = [
  { key: 'yours', label: 'Yours' },
  { key: 'others', label: 'Others' },
  { key: 'unassigned', label: 'Unassigned' },
];

function formatMeetingDate(iso: string | null): string {
  if (!iso) return 'Date not recorded';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

function ownerText(item: FollowUpItem): string {
  if (item.band === 'yours') return 'You';
  if (item.band === 'others') return item.owner_name || item.owner_label || 'Someone else';
  return item.owner_label ? `Said by ${item.owner_label}` : 'No owner named';
}

function FollowUpRow({ item }: { item: FollowUpItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = item.status === 'done';

  function toggle() {
    startTransition(async () => {
      const res = await setFollowUpStatusAction(item.id, done ? 'open' : 'done');
      if (res.success) {
        toast.success(done ? 'Opened again.' : 'Marked done.');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save the change.');
      }
    });
  }

  return (
    <li className="flex items-start gap-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? 'Mark as open' : 'Mark as done'}
        title={done ? 'Mark as open' : 'Mark as done'}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : done ? (
          <CheckSquare className="h-4 w-4 text-green-700 dark:text-emerald-400" aria-hidden />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground" aria-hidden />
        )}
      </Button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={done ? 'text-sm text-muted-foreground line-through' : 'text-sm'}>
          {item.action_text}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{ownerText(item)}</span>
          <Badge variant="outline" className="font-normal">
            {done ? 'Done' : 'Open'}
          </Badge>
        </div>
      </div>
    </li>
  );
}

export function FollowUpGroup({ group }: { group: FollowUpMeetingGroup }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const openCount = group.items.filter((it) => it.status === 'open').length;
  const title = group.meeting_title || 'Meeting';
  const withWhom = group.attendee_name ? ` with ${group.attendee_name}` : '';

  function markAllDone() {
    startTransition(async () => {
      const res = await markMeetingFollowUpsDoneAction(group.booking_id);
      setConfirmOpen(false);
      if (res.success) {
        toast.success(
          res.updated === 1 ? '1 follow-up marked done.' : `${res.updated ?? 0} follow-ups marked done.`,
        );
      } else {
        toast.error(res.error ?? 'Could not mark them done.');
      }
      router.refresh();
    });
  }

  const heading = (
    <span className="text-sm font-medium">
      {title}
      {withWhom}
    </span>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-2 p-4 pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {group.viewer_is_host && group.booking_uid ? (
              <Link
                href={`/meetings/${group.booking_uid}`}
                className="inline-flex items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {heading}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </Link>
            ) : (
              heading
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
                {formatMeetingDate(group.start_time)}
              </span>
              {group.booking_status === 'cancelled' ? (
                <Badge variant="outline" className="font-normal">
                  Meeting cancelled
                </Badge>
              ) : null}
            </div>
          </div>
          {openCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-center sm:w-auto"
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Mark all done
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {BANDS.map((band) => {
          const rows = group.items.filter((it) => it.band === band.key);
          if (rows.length === 0) return null;
          return (
            <section key={band.key} aria-label={band.label}>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {band.label}
              </h4>
              <ul className="divide-y">
                {rows.map((item) => (
                  <FollowUpRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !pending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all follow-ups from this meeting done?</AlertDialogTitle>
            <AlertDialogDescription>
              {group.viewer_is_host
                ? `All ${openCount} open follow-up${openCount === 1 ? '' : 's'} from ${title}${withWhom} will be marked done.`
                : `Your open follow-ups from ${title}${withWhom} will be marked done.`}{' '}
              You can open any of them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                markAllDone();
              }}
              disabled={pending}
            >
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Mark all done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
