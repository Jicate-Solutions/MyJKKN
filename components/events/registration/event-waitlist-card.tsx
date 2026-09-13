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

/** "4KQ M7X" — grouped, because it is going to be read aloud. */
function spokenCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function QueueRow({
  entry,
  onReissue,
  reissuing,
}: {
  entry: WaitlistEntry;
  onReissue: (id: string) => void;
  reissuing: boolean;
}) {
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
              {/* elapsedLabel returns '' for a null or clock-skewed offered_at,
                  which rendered as the nonsense "Offered  ago". */}
              {elapsedLabel(entry.offered_at)
                ? `Offered ${elapsedLabel(entry.offered_at)} ago`
                : 'Offered'}
            </Badge>
            {entry.unreachable && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <PhoneCall className="h-3 w-3" />
                No MyJKKN account — phone them
              </span>
            )}
            {/* THE THING THE ORGANISER HAS TO DO. This code is the only way a
                person with no account can take their place up, and it reaches
                them only if somebody says it out loud. A screen that shows a
                code without saying to read it out is a feature that depends on
                a person doing something nobody told them to do. */}
            {entry.claim_code && (
              <div className="mt-1 flex flex-col items-end gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5">
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Read this code to them:
                </span>
                <span className="font-mono text-base font-bold tracking-[0.2em]">
                  {spokenCode(entry.claim_code)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  They type it on the registration page. No letter O or I, and no
                  zero or one — every character is spoken as it looks.
                </span>
                <button
                  type="button"
                  onClick={() => onReissue(entry.id)}
                  disabled={reissuing}
                  className="text-[11px] font-medium underline underline-offset-2 disabled:opacity-50"
                >
                  {reissuing ? 'Issuing…' : 'Issue a new code'}
                </button>
              </div>
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
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [reissueError, setReissueError] = useState<string | null>(null);

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

  const reissue = useCallback(
    async (waitlistId: string) => {
      setReissueError(null);
      setReissuingId(waitlistId);
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reissue_code', waitlist_id: waitlistId }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || payload?.success !== true) {
          setReissueError(
            payload?.error ?? 'A new code could not be issued. Please try again.'
          );
          return;
        }
        // Re-read rather than patching in place: issuing a new code invalidates
        // the old one, and the card must never show a code that no longer works.
        await load();
      } catch {
        setReissueError('A new code could not be issued. Please try again.');
      } finally {
        setReissuingId(null);
      }
    },
    [eventId, load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // NOTHING WHILE WE DO NOT YET KNOW. A skeleton here was shown to every viewer
  // of every event console, including the 401/403 case the header promises
  // renders nothing — so "you may not see this queue" flashed a loading box at
  // people who were about to be shown no box at all.
  if (loading || !state) return null;
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
  if (!panel.entries.length) return null;
  // NOT gated on cap_behavior once there are rows. An organiser who flips a
  // full event to strict_cap does not release the offers already outstanding —
  // countTaken still counts them as taken seats — so hiding the card at that
  // moment hides the only screen that shows those seats being held, and this
  // feature ships no way to take an offer back. An event that queues nobody and
  // has nobody queued renders nothing, as before.
  if (panel.cap_behavior !== 'waitlist' && !panel.offered_count) return null;

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
            <QueueRow
              key={entry.id}
              entry={entry}
              onReissue={reissue}
              reissuing={reissuingId === entry.id}
            />
          ))}
        </ul>

        {reissueError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {reissueError}
          </p>
        )}

        {panel.offered_count > 0 && (
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            An offered place is held for that person and counts as taken until they
            take it up on the registration page. Anybody with a code above has no
            MyJKKN account, so <strong>the code only reaches them if you phone
            them and read it out</strong> — nothing else will tell them. There is
            no deadline: an offer nobody answers keeps its place, and nobody
            behind it moves up. This screen cannot take an offer back yet — if one
            stalls, tell an administrator.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
