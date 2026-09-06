'use client';

// app/(routes)/meetings/[uid]/_components/carried-over-section.tsx
//
// Meeting Agenda Engine PR2 — the LOOP made visible. Lists OPEN action items
// from the host's earlier meetings with the SAME person (resolved server-side by
// the PastActions adapter, MeetingActionItemService.listOpenCarryOver). This is
// the "agenda from MyJKKN's own context" payoff: unfinished business resurfaces
// automatically instead of being forgotten between meetings.
//
// Read-mostly: the host can mark a carried item done (closing it everywhere, via
// the same host-verified setStatus action), or open the source meeting. Editing
// the item's text happens on its own meeting page. Hooks are unconditional-first.

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, CheckSquare, User, CalendarClock, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setActionItemStatusAction } from '../action-item-actions';

export interface CarryOverView {
  id: string;
  action_text: string;
  decision_text: string | null;
  owner_label: string | null;
  due_date: string | null;
  from_booking_uid: string;
  from_attendee_name: string | null;
  from_meeting_time: string | null;
}

interface CarriedOverSectionProps {
  uid: string;
  canEdit: boolean;
  items: CarryOverView[];
}

function fmtDue(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMeeting(iso: string | null): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CarriedOverSection({ uid, canEdit, items }: CarriedOverSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDone(itemId: string) {
    startTransition(async () => {
      const res = await setActionItemStatusAction(itemId, uid, 'done');
      if (res.success) {
        toast.success('Carried-over item marked done.');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not update the item.');
      }
    });
  }

  if (items.length === 0) return null; // nothing to carry — render nothing

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const due = fmtDue(item.due_date);
        const when = fmtMeeting(item.from_meeting_time);
        return (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm dark:border-amber-700/40 dark:bg-amber-950/20"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{item.action_text}</p>
              {item.decision_text ? (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {item.decision_text}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {item.owner_label ? (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" aria-hidden />
                    {item.owner_label}
                  </span>
                ) : null}
                {due ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" aria-hidden />
                    {due}
                  </span>
                ) : null}
                {item.from_booking_uid ? (
                  <Link
                    href={`/meetings/${item.from_booking_uid}`}
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  >
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                    from {when ? `meeting on ${when}` : 'earlier meeting'}
                  </Link>
                ) : null}
              </div>
            </div>

            {canEdit ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0"
                onClick={() => handleDone(item.id)}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <CheckSquare className="mr-1.5 h-3.5 w-3.5 text-green-600" aria-hidden />
                )}
                Done
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
