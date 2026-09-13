'use client';

// The waiting list on an event's console: who is queuing, in order, and whether
// anybody is sitting on an offer that has not been answered.
//
// The card is SELF-GATING. It asks /api/events/[eventId]/waitlist, which decides
// authority with fn_can_manage_event_waitlist — the same four branches as the
// feedback and messages gates.
//
// THREE OUTCOMES, THREE DIFFERENT PIXELS (house rule #27). The first version
// set one `hidden` flag on ANY non-ok response, so "you may not see this
// queue", "the queue could not load" and "nobody is waiting" were all the same
// blank space — the exact conflation the comment here claimed to avoid, and the
// carefully written NO_ACCESS sentence in the route was shown to nobody:
//   * NOT ALLOWED (401/403) → renders nothing, on purpose. This card is an
//     add-on to an event console that many roles legitimately open; a red
//     refusal box on every one of them would be noise, not information. It is
//     the one outcome that is deliberately silent, and it is silent because the
//     viewer has lost nothing.
//   * COULD NOT LOAD (500, network, bad payload) → says so, with a retry. A
//     stalled offer is invisible while this is broken, and an organiser who
//     cannot tell "broken" from "empty" will not go looking.
//   * NOBODY WAITING → renders nothing. There is no queue to show.
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

type CardState =
  /** The viewer may not see this queue. Deliberately silent — see the header. */
  | { kind: 'not_allowed' }
  /** The queue could not be read. Said out loud, with a retry. */
  | { kind: 'failed' }
  | { kind: 'ready'; panel: WaitlistPanel };

export function EventWaitlistCard({ eventId }: { eventId: string }) {
  const [state, setState] = useState<CardState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/waitlist`, {
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        setState({ kind: 'not_allowed' });
        return;
      }
      if (!res.ok || payload?.success !== true || !payload?.panel) {
        setState({ kind: 'failed' });
        return;
      }
      setState({ kind: 'ready', panel: payload.panel as WaitlistPanel });
    } catch {
      setState({ kind: 'failed' });
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (!state) return null;
  if (state.kind === 'not_allowed') return null;

  if (state.kind === 'failed') {
    return (
      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListOrdered className="h-5 w-5" />
            Waiting list
          </CardTitle>
          <CardDescription>
            The waiting list could not be loaded, so this is not the same as
            &quot;nobody is waiting&quot;. If somebody has been offered a place, you
            cannot see it right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  const panel = state.panel;

  // Nothing to show: the queue does not exist yet, the event does not queue, or
  // nobody is queuing. The card stays out of the way rather than adding an empty
  // box to every console.
  //
  // not_yet_available is checked FIRST because in that state cap_behavior is
  // null — not read — and testing it before this would be reading a value the
  // route deliberately refused to invent.
  if (panel.not_yet_available) return null;
  if (panel.cap_behavior !== 'waitlist') return null;
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
            An offered place is held for that person and counts as taken until they
            take it up on the registration page. There is no deadline: an offer
            nobody answers keeps its place, and nobody behind it moves up. This
            screen cannot take an offer back yet — if one stalls, tell an
            administrator.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
