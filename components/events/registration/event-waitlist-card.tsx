'use client';

// The waiting list on an event's console: who is queuing, in order, and whether
// anybody is sitting on an offer that has not been answered.
//
// The card is SELF-GATING and silent when it has nothing to say. It asks
// /api/events/[eventId]/waitlist, which decides authority with
// fn_can_manage_event_waitlist — the same four branches as the feedback and
// messages gates. A viewer without that authority gets an explicit refusal from
// the route and the card renders nothing rather than an empty queue, because an
// empty queue and "you may not see this queue" must never look the same
// (house rule #27: nothing here redirects, and nothing pretends).
//
// Offers are listed FIRST. An offer holds a place and, by the Director's
// ruling, carries no deadline — so a promoted person who never answers is the
// one thing on this screen that can quietly stall an event. It is put at the
// top with the time it has been outstanding, so it cannot be missed.

import { useCallback, useEffect, useState } from 'react';
import { Clock, ListOrdered, PhoneCall } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { WaitlistEntry, WaitlistPanel } from '@/lib/services/events/waitlist-service';

/** "3 days", "5 hours", "12 minutes" — how long an offer has been outstanding. */
function elapsedLabel(since: string | null): string {
  if (!since) return '';
  const ms = Date.now() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.floor(hours / 24)} days`;
}

function contactLine(entry: WaitlistEntry): string {
  return [entry.participant_phone, entry.participant_email].filter(Boolean).join(' · ');
}

function QueueRow({ entry }: { entry: WaitlistEntry }) {
  const offered = entry.status === 'offered';
  return (
    <li className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={
            offered
              ? 'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground'
              : 'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground'
          }
        >
          {offered ? '★' : entry.position}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.participant_name}</p>
          {contactLine(entry) && (
            <p className="truncate text-xs text-muted-foreground">{contactLine(entry)}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {offered ? (
          <>
            <Badge variant="default" className="gap-1">
              <Clock className="h-3 w-3" />
              Offered {elapsedLabel(entry.offered_at)} ago
            </Badge>
            {entry.unreachable && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <PhoneCall className="h-3 w-3" />
                No MyJKKN account — tell them yourself
              </span>
            )}
            {!entry.unreachable && !entry.notified_at && (
              <span className="text-[11px] text-muted-foreground">Not announced yet</span>
            )}
          </>
        ) : (
          <Badge variant="outline">Waiting</Badge>
        )}
      </div>
    </li>
  );
}

export function EventWaitlistCard({ eventId }: { eventId: string }) {
  const [panel, setPanel] = useState<WaitlistPanel | null>(null);
  const [loading, setLoading] = useState(true);
  /** A refusal, a network failure, or "not allowed" — all mean render nothing. */
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/waitlist`, {
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || payload?.success !== true) {
        setHidden(true);
        return;
      }
      setPanel(payload.panel as WaitlistPanel);
    } catch {
      setHidden(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden) return null;
  if (loading) return <Skeleton className="h-24 w-full" />;
  if (!panel) return null;

  // Nothing to show: the event does not queue, or nobody is queuing. The card
  // stays out of the way rather than adding an empty box to every console.
  if (panel.cap_behavior !== 'waitlist') return null;
  if (panel.not_yet_available) return null;
  if (!panel.entries.length) return null;

  const capacityLine =
    panel.max_registrations !== null
      ? `${panel.taken} of ${panel.max_registrations} places taken`
      : 'No capacity set on this event';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListOrdered className="h-5 w-5" />
          Waiting list
        </CardTitle>
        <CardDescription>
          {panel.waiting_count} waiting
          {panel.offered_count > 0 && ` · ${panel.offered_count} offered a place`} ·{' '}
          {capacityLine}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="space-y-0">
          {panel.entries.map((entry) => (
            <QueueRow key={entry.id} entry={entry} />
          ))}
        </ul>

        {panel.offered_count > 0 && (
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            An offered place is held for that person and counts as taken. There is
            no deadline: an offer nobody answers keeps its place, and nobody behind
            it moves up. This screen cannot take an offer back yet — if one stalls,
            tell an administrator.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
