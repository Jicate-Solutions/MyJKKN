'use client';

// The waiting list on an event's console: who is queuing, in order, and any
// place currently being held with how long the hold has left.
//
// SELF-GATING. It asks /api/events/[eventId]/waitlist, which decides authority
// with fn_can_manage_event_waitlist.
//
// THREE OUTCOMES, THREE DIFFERENT PIXELS (house rule #27):
//   * NOT ALLOWED (401/403) → renders nothing, on purpose. This card is an
//     add-on to a console many roles legitimately open; a refusal box on every
//     one of them would be noise. The viewer has lost nothing.
//   * COULD NOT LOAD → says so, with a retry. A held place is invisible while
//     this is broken, and "broken" must not look like "empty".
//   * NOBODY WAITING → renders nothing. There is no queue to show.
//
// Offers are listed FIRST, with the time left on the hold.

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Clock, ListOrdered, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { WaitlistEntry, WaitlistPanel } from '@/lib/services/events/waitlist-service';

/** "3 days", "5 hr", "12 min" — a duration, either elapsed or remaining. */
function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.floor(hours / 24)} days`;
}

function holdLabel(entry: WaitlistEntry): string {
  if (!entry.offer_expires_at) return 'Place held';
  const left = new Date(entry.offer_expires_at).getTime() - Date.now();
  if (left <= 0) return 'Hold lapsed — releasing';
  return `Held · ${durationLabel(left)} left`;
}

function contactLine(entry: WaitlistEntry): string {
  return [entry.participant_phone, entry.participant_email].filter(Boolean).join(' · ');
}

function QueueRow({
  entry,
  onApprove,
  approving,
}: {
  entry: WaitlistEntry;
  onApprove: (ids: string[]) => void;
  approving: boolean;
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
              {holdLabel(entry)}
            </Badge>
            {!entry.notified_at && (
              <span className="text-[11px] text-muted-foreground">Not announced yet</span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              disabled={approving}
              onClick={() => onApprove([entry.id])}
            >
              <Check className="h-3 w-3" />
              Approve
            </Button>
          </>
        ) : (
          <Badge variant="outline">Waiting</Badge>
        )}
      </div>
    </li>
  );
}

type CardState =
  | { kind: 'not_allowed' }
  | { kind: 'failed' }
  | { kind: 'ready'; panel: WaitlistPanel };

/** Every outcome is a value, never a thrown error, so the three pixels above stay distinct. */
interface ApproveResult {
  registered: number;
  already_registered: number;
  skipped: number;
}

/** Register held places with the answers stored on the waiting-list row. */
async function approveOffers(eventId: string, ids?: string[]): Promise<ApproveResult> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/waitlist/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : {}),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success !== true) {
    throw new Error(payload?.error || 'Could not approve the waiting list.');
  }
  return payload as ApproveResult;
}

async function readWaitlist(eventId: string): Promise<CardState> {
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/waitlist`, {
      cache: 'no-store',
    });
    const payload = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) return { kind: 'not_allowed' };
    if (!res.ok || payload?.success !== true || !payload?.panel) return { kind: 'failed' };
    return { kind: 'ready', panel: payload.panel as WaitlistPanel };
  } catch {
    return { kind: 'failed' };
  }
}

export function EventWaitlistCard({ eventId }: { eventId: string }) {
  // react-query rather than useEffect + setState: the house pattern, and the
  // effect form trips react-hooks/set-state-in-effect.
  const { data: state, refetch } = useQuery({
    queryKey: ['events', eventId, 'waitlist'],
    queryFn: () => readWaitlist(eventId),
    staleTime: 0,
  });

  const approve = useMutation({
    mutationFn: (ids?: string[]) => approveOffers(eventId, ids),
    onSuccess: (r) => {
      const parts = [`${r.registered} registered`];
      if (r.already_registered) parts.push(`${r.already_registered} were already registered`);
      if (r.skipped) parts.push(`${r.skipped} could not be approved`);
      if (r.skipped) toast.warning(parts.join(' · '));
      else toast.success(parts.join(' · '));
      void refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Nothing while we do not yet know: a skeleton here would flash at every
  // viewer the 401/403 case promises to show nothing to. The previous data is
  // kept on a refetch, so "Try again" does not make its own button vanish.
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
            &quot;nobody is waiting&quot;. If a place is being held for somebody, you
            cannot see it right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  const panel = state.panel;

  // Nothing to show: the queue does not exist yet, or nobody is in it. Checked
  // in this order because not_yet_available carries cap_behavior = null (not
  // read), which must not be tested as if it were a value.
  if (panel.not_yet_available) return null;
  if (!panel.entries.length) return null;
  // Not gated on cap_behavior once rows exist: an organiser who flips a full
  // event to strict_cap does not release a place already being held.
  if (panel.cap_behavior !== 'waitlist' && !panel.offered_count) return null;

  const capacityLine =
    panel.max_registrations !== null
      ? `${panel.taken} of ${panel.max_registrations} places taken`
      : 'No capacity set on this event';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListOrdered className="h-5 w-5" />
            Waiting list
          </CardTitle>
          {panel.offered_count > 0 && (
            <Button
              type="button"
              size="sm"
              className="gap-1"
              disabled={approve.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Register all ${panel.offered_count} people holding a place, using the details they gave when they joined the waiting list?`
                  )
                ) {
                  approve.mutate(undefined);
                }
              }}
            >
              {approve.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve all held ({panel.offered_count})
            </Button>
          )}
        </div>
        <CardDescription>
          {panel.waiting_count} waiting
          {panel.offered_count > 0 && ` · ${panel.offered_count} holding a place`} ·{' '}
          {capacityLine}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="space-y-0">
          {panel.entries.map((entry) => (
            <QueueRow
              key={entry.id}
              entry={entry}
              approving={approve.isPending}
              onApprove={(ids) => approve.mutate(ids)}
            />
          ))}
        </ul>

        {panel.offered_count > 0 && (
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            A held place counts as taken until that person sends the registration form
            while signed in, you approve it here, or the hold lapses 24 hours after it
            was made — then the place is offered to the next person automatically.
            Approving registers them with the details they gave when they joined the
            waiting list.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
